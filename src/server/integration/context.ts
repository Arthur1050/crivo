import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { documentCategories, documents } from "../../db/schema";
import {
  buildCanonicalContext,
  type ContextBudgetDocument,
  type DocumentContextEnvelope,
  type DocumentModality,
} from "../documents/context-budget";
import type { CategoryColor, Modality } from "../data";

export type ContextModality = "novo" | "usado";

export interface ContextDocumentCategory {
  name: string;
  color: CategoryColor;
}

/** Documento de contexto do tenant (design.md — `src/server/integration/
 * context.ts`, INT-06). `content` é sempre `null` no v1 — mock-first
 * (AD-004): o shape já reserva o campo, a Fase 9 troca a fonte sem mudar o
 * contrato. */
export interface ContextDocument {
  id: string;
  name: string;
  modality: Modality;
  category: ContextDocumentCategory | null;
  content: null;
}

/**
 * Leitura de contexto do tenant por modalidade (design.md — INT-06):
 * documentos cuja modalidade é a pedida OU `ambos`, excluindo expirados
 * (`expiresAt IS NULL OR expiresAt > now()`) — mesmo que o job de TTL (T9)
 * ainda não tenha rodado, a leitura nunca devolve um documento vencido
 * (LGPD-02 AC2). Junta a categoria (nome + cor) quando existe; documentos
 * sem categoria entram com `category: null` (mesmo padrão de `getDocuments`
 * — leftJoin, nunca inner).
 */
export async function getContext(
  tenantId: string,
  modality: ContextModality
): Promise<ContextDocument[]> {
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      modality: documents.modality,
      categoryName: documentCategories.name,
      categoryColor: documentCategories.color,
    })
    .from(documents)
    .leftJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .where(
      and(
        eq(documents.tenantId, tenantId),
        or(eq(documents.modality, modality), eq(documents.modality, "ambos")),
        or(isNull(documents.expiresAt), gt(documents.expiresAt, new Date()))
      )
    );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    modality: row.modality,
    category:
      row.categoryName !== null && row.categoryColor !== null
        ? { name: row.categoryName, color: row.categoryColor }
        : null,
    content: null,
  }));
}

export interface DirectContextQuery {
  modality: DocumentModality;
  /**
   * Pergunta real do lead. No lote 12 o modo `direct` entrega o corpus inteiro,
   * então ela não filtra nada (DOCCTX-01 AC8) — trafega para que o contrato já
   * seja o definitivo quando a recuperação semântica existir.
   */
  question: string;
}

/**
 * Corpus direto do tenant (DOCCTX-01, DOCLIM-01). Só entra documento `pronto`,
 * ativo e dentro da validade: `processando`, `falha` e `fora_do_agente` ficam
 * de fora, e um documento que venceu antes da rotina diária some do contexto no
 * mesmo instante lógico, mesmo que registro e original ainda existam (AC6).
 *
 * A montagem do envelope é delegada a `buildCanonicalContext`, a mesma função
 * que a admissão de T12 usa para medir o teto. Isso é o que garante que o que
 * foi medido e o que é servido sejam byte a byte a mesma serialização — se as
 * duas divergissem, um corpus admitido poderia estourar o teto na entrega.
 */
export async function getDirectDocumentContext(
  tenantId: string,
  query: DirectContextQuery,
  now = new Date()
): Promise<DocumentContextEnvelope> {
  const rows = await db
    .select({
      id: documents.id,
      name: documents.name,
      modality: documents.modality,
      extractedText: documents.extractedText,
      uploadedAt: documents.uploadedAt,
      categoryName: documentCategories.name,
      categoryColor: documentCategories.color,
    })
    .from(documents)
    .leftJoin(documentCategories, eq(documents.categoryId, documentCategories.id))
    .where(
      and(
        eq(documents.tenantId, tenantId),
        eq(documents.status, "pronto"),
        isNull(documents.deletedAt),
        or(isNull(documents.expiresAt), gt(documents.expiresAt, now)),
        sql`${documents.extractedText} is not null`
      )
    );

  const corpus: ContextBudgetDocument[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    modality: row.modality,
    content: row.extractedText!,
    uploadedAt: row.uploadedAt,
    status: "pronto",
    category:
      row.categoryName !== null && row.categoryColor !== null
        ? { name: row.categoryName, color: row.categoryColor }
        : null,
  }));

  return buildCanonicalContext(corpus, query.modality);
}
