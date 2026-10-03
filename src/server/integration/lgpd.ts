import "server-only";
import { lte } from "drizzle-orm";
import { db } from "../../db";
import { humanMessageSends } from "../../db/schema";
import { optOutLeadByHuman, purgeIntegrationRefusals, serviceScope } from "../data";
import { createDocumentLifecycle } from "../documents/lifecycle";
import {
  expireDueDocuments,
  expireStaleUploadIntents,
  listTombstonedDocuments,
  reconcileTenantDocumentAdmission,
} from "../documents/repository";
import { toDocumentStorageError, type DocumentStorage } from "../documents/storage";

export interface OptOutResult {
  optedOutAt: Date;
}

/**
 * Registra o opt-out de um lead (design.md — `src/server/integration/
 * lgpd.ts`, LGPD-01). O mesmo writer do CRM trava lead→episódios, preserva
 * o timestamp original no replay e invalida memória/ponte na primeira ação.
 * Palavra-chave e linguagem natural chegam a este serviço pela mesma rota.
 * Retorna `null` fora do tenant (404 na rota), sem expor campos internos.
 */
export async function optOutLead(
  tenantId: string,
  leadId: string,
  options: { now?: () => Date; database?: Pick<typeof db, "transaction"> } = {},
): Promise<OptOutResult | null> {
  // O argumento Date legado é ignorado: o clock abaixo só é lido após locks.
  const result = await optOutLeadByHuman(serviceScope(tenantId), leadId, new Date(0), {
    ...options, now: options.now ?? (() => new Date()),
  });
  return result ? { optedOutAt: result.optedOutAt } : null;
}

/** Retenção das reservas de envio humano (lote-14 — design.md Data Models). */
export const HUMAN_SEND_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Apaga as reservas `human_message_sends` com 30 dias ou mais (lote-14 —
 * ENVIO-01). A reserva só serve à idempotência de um envio em andamento; a
 * mensagem enviada continua em `messages`. `lte` inclui a fronteira: com
 * exatamente 30 dias, a reserva sai (L-023). Job de plataforma, sem escopo de
 * tenant, como a purga de recusas.
 */
export async function purgeHumanSendReservations(now: Date): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - HUMAN_SEND_RETENTION_MS);
  const rows = await db
    .delete(humanMessageSends)
    .where(lte(humanMessageSends.createdAt, cutoff))
    .returning({ id: humanMessageSends.id });
  return { deleted: rows.length };
}

export interface DocumentMaintenanceDependencies {
  storage: DocumentStorage;
}

export interface ExpireDocumentsResult {
  /** Documentos que completaram registro + texto + original nesta execução. */
  deletedByTenant: Record<string, number>;
  total: number;
  /** Expirados cujo original resistiu: ficam tombstone, inacessíveis e retentáveis. */
  pendingByTenant: Record<string, number>;
  pendingTotal: number;
  /** Ids tombstonados por esta execução — o grupo de retry não os repete. */
  expiredIds: string[];
}

function countByTenant(tenantIds: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const tenantId of tenantIds) counts[tenantId] = (counts[tenantId] ?? 0) + 1;
  return counts;
}

/**
 * Expira documentos vencidos (design.md — LGPD-02, DOCLIFE-01 AC4/AC5): job de
 * plataforma, sem escopo de tenant único por definição. O tombstone bloqueia o
 * acesso antes de qualquer I/O externo, e a linha só some depois que o storage
 * confirma a ausência do original — uma falha externa deixa pendência
 * retentável, nunca um documento acessível. `lte(expiresAt, now)` inclui o
 * instante do boundary e já exclui `expiresAt IS NULL` pela semântica de 3
 * valores do SQL (`NULL <= x` nunca é verdadeiro).
 */
export async function expireDocuments(
  now: Date,
  { storage }: DocumentMaintenanceDependencies
): Promise<ExpireDocumentsResult> {
  const expired = await expireDueDocuments(now);
  const lifecycle = createDocumentLifecycle({ storage, now: () => now });

  const removed: string[] = [];
  const pending: string[] = [];
  for (const document of expired) {
    const result = await lifecycle.retry({ tenantId: document.tenantId, documentId: document.id });
    (result.kind === "removed" ? removed : pending).push(document.tenantId);
  }

  // Um expirado sai do corpus e libera espaço: um `fora_do_agente` que agora
  // cabe volta ao agente (DOCLIM-01 AC8), como já acontece na exclusão manual.
  for (const tenantId of new Set(expired.map((document) => document.tenantId))) {
    await reconcileTenantDocumentAdmission(tenantId, now);
  }

  return {
    deletedByTenant: countByTenant(removed),
    total: removed.length,
    pendingByTenant: countByTenant(pending),
    pendingTotal: pending.length,
    expiredIds: expired.map((document) => document.id),
  };
}

export interface TombstoneRetryResult {
  removed: number;
  stillPending: number;
}

/**
 * Retoma tombstones que sobraram de execuções anteriores (DOCLIFE-01 AC5/AC10).
 * Os ids recém-expirados desta mesma execução são excluídos porque o grupo de
 * expiração já tentou removê-los.
 */
export async function retryPendingTombstones(
  now: Date,
  { storage }: DocumentMaintenanceDependencies,
  excludeIds: string[] = []
): Promise<TombstoneRetryResult> {
  const pending = await listTombstonedDocuments(excludeIds);
  const lifecycle = createDocumentLifecycle({ storage, now: () => now });

  let removed = 0;
  for (const document of pending) {
    const result = await lifecycle.retry({ tenantId: document.tenantId, documentId: document.id });
    if (result.kind === "removed") removed += 1;
  }
  return { removed, stillPending: pending.length - removed };
}

export interface UploadIntentCleanupResult {
  intentsExpired: number;
  objectsRemoved: number;
}

/**
 * Compensa intenções de upload vencidas (DOCBIN-01): a intenção vira `failed` e
 * o objeto órfão sai do storage. Um objeto que nunca chegou a existir já conta
 * como compensado — `delete` do contrato é idempotente.
 */
export async function cleanupExpiredUploadIntents(
  now: Date,
  { storage }: DocumentMaintenanceDependencies
): Promise<UploadIntentCleanupResult> {
  const expired = await expireStaleUploadIntents(now);

  let objectsRemoved = 0;
  for (const intent of expired) {
    try {
      await storage.delete(intent.storageKey);
      objectsRemoved += 1;
    } catch (error) {
      // Objeto ausente já é compensação concluída; o resto fica para o próximo dia.
      if (toDocumentStorageError(error).kind === "absent") objectsRemoved += 1;
    }
  }
  return { intentsExpired: expired.length, objectsRemoved };
}

export interface DailyMaintenanceResult extends ExpireDocumentsResult {
  /** `true` quando o grupo de expiração falhou por inteiro; os demais rodaram. */
  expiryFailed: boolean;
  /** Tombstones de execuções anteriores concluídos agora (DOCLIFE-01 AC10). */
  tombstonesRemoved: number;
  tombstonesStillPending: number;
  tombstoneRetryFailed: boolean;
  /** Intenções de upload vencidas e objetos órfãos compensados (DOCBIN-01). */
  intentsExpired: number;
  intentObjectsRemoved: number;
  intentCleanupFailed: boolean;
  /** Recusas de integração com mais de 30 dias removidas nesta execução
   * (lote-9 — SAUDE-03 AC1). Zero quando nenhuma venceu, nunca erro. */
  refusalsDeleted: number;
  /** `true` quando a purga de recusas falhou nesta execução (SAUDE-03 AC3):
   * a falha é só REPORTADA aqui — nunca impede a expiração de documentos. */
  refusalsPurgeFailed: boolean;
  /** Reservas de envio humano com 30 dias ou mais removidas (lote-14). */
  reservationsDeleted: number;
  /** `true` quando a purga de reservas falhou; os demais grupos seguem. */
  reservationsPurgeFailed: boolean;
}

const emptyExpiry: ExpireDocumentsResult = {
  deletedByTenant: {},
  total: 0,
  pendingByTenant: {},
  pendingTotal: 0,
  expiredIds: [],
};

async function runGroup<T>(fallback: T, group: () => Promise<T>): Promise<[T, boolean]> {
  try {
    return [await group(), false];
  } catch {
    // Nenhum detalhe do provedor cruza esta fronteira: o resultado só reporta
    // que o grupo falhou, e os outros grupos seguem rodando (DOCLIFE-01 AC10).
    return [fallback, true];
  }
}

/**
 * Rotina diária de manutenção (lote-9 — SAUDE-03; lote-12 — DOCLIFE-01; lote-14).
 * Cinco grupos independentes rodam em sequência, cada um com resultado e
 * `catch` próprios: expiração, retry de tombstones, compensação de intenções
 * vencidas, purga de recusas e purga de reservas de envio humano. Uma falha de storage não impede a purga de recusas, e uma
 * falha da purga não impede a expiração (AC3). Nenhum grupo propaga exceção.
 */
export async function runDailyMaintenance(
  now: Date,
  dependencies: DocumentMaintenanceDependencies
): Promise<DailyMaintenanceResult> {
  const [expiry, expiryFailed] = await runGroup(emptyExpiry, () => expireDocuments(now, dependencies));

  const [tombstones, tombstoneRetryFailed] = await runGroup(
    { removed: 0, stillPending: 0 },
    () => retryPendingTombstones(now, dependencies, expiry.expiredIds)
  );

  const [intents, intentCleanupFailed] = await runGroup(
    { intentsExpired: 0, objectsRemoved: 0 },
    () => cleanupExpiredUploadIntents(now, dependencies)
  );

  const [refusals, refusalsPurgeFailed] = await runGroup(
    { deleted: 0 },
    () => purgeIntegrationRefusals(now)
  );

  const [reservations, reservationsPurgeFailed] = await runGroup(
    { deleted: 0 },
    () => purgeHumanSendReservations(now)
  );

  return {
    ...expiry,
    expiryFailed,
    tombstonesRemoved: tombstones.removed,
    tombstonesStillPending: tombstones.stillPending,
    tombstoneRetryFailed,
    intentsExpired: intents.intentsExpired,
    intentObjectsRemoved: intents.objectsRemoved,
    intentCleanupFailed,
    refusalsDeleted: refusals.deleted,
    refusalsPurgeFailed,
    reservationsDeleted: reservations.deleted,
    reservationsPurgeFailed,
  };
}
