import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthResult } from "../integration/auth";
import type { LeadScope } from "../../lib/lead-scope";

export type ReceiptClassification = "pending" | "paid_service" | "free_service" | "free_entry_point" | "unavailable" | "not_delivered";
export type ReceiptPricing = {
  pricingModel: string | null;
  category: string | null;
  pricingType: string | null;
  billable: boolean | null;
};
export type ReceiptEvidence = ReceiptPricing & {
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  failureCode: number | null;
  pricingConflict: boolean;
  classification: ReceiptClassification;
};
export type ReceiptStatus = {
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  pricing?: ReceiptPricing;
  failureCode?: number;
};

export function emptyReceipt(): ReceiptEvidence {
  return {
    sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
    pricingModel: null, category: null, pricingType: null, billable: null,
    pricingConflict: false, failureCode: null, classification: "pending",
  };
}

function confirmed(classification: ReceiptClassification): boolean {
  return classification === "paid_service" || classification === "free_service" || classification === "free_entry_point";
}

/** Só uma tupla efetivamente observada numa entrega pode confirmar cobrança. */
function classifyEvidence(
  receipt: ReceiptEvidence,
  completeDeliveryPricing: boolean,
): ReceiptClassification {
  if (receipt.pricingConflict) return "unavailable";
  if (!receipt.deliveredAt && !receipt.readAt) return receipt.failedAt ? "not_delivered" : "pending";
  if (!completeDeliveryPricing || receipt.pricingModel !== "PMP") return "unavailable";
  if (receipt.pricingType === "free_entry_point" && receipt.billable === false &&
    ["service", "utility", "marketing", "authentication"].includes(receipt.category ?? "")) return "free_entry_point";
  if (receipt.category !== "service") return "unavailable";
  if (receipt.pricingType === "regular" && receipt.billable === true) return "paid_service";
  if (receipt.pricingType === "free_customer_service" && receipt.billable === false) return "free_service";
  return "unavailable";
}

export function classifyReceipt(receipt: ReceiptEvidence): ReceiptClassification {
  return classifyEvidence(receipt, confirmed(receipt.classification));
}

function earliest(current: Date | null, incoming: Date): Date {
  return new Date(Math.min(current?.getTime() ?? Infinity, incoming.getTime()));
}

function observed<T extends string | boolean>(current: T | null, incoming: T | null): T | null {
  if (current === null) return incoming;
  if (incoming === null) return current;
  // Escolha canônica só para guardar evidência; nunca decide qual preço vence.
  return String(current) <= String(incoming) ? current : incoming;
}

/**
 * Redução pura: instantes mínimos por tipo; entrega/read sobrevivem a sent/failed.
 * Só delivery/read fornecem pricing. Campos parciais conservam contradições,
 * mas sua união não fabrica uma tupla de confirmação que a Meta não enviou.
 * Classificação confirmada anterior é a prova durável de uma tupla completa;
 * conflito é absorvente e torna a classificação indisponível para revisão.
 */
export function reduceReceipt(current: ReceiptEvidence, incoming: ReceiptStatus): ReceiptEvidence {
  const next = { ...current };
  const field = { sent: "sentAt", delivered: "deliveredAt", read: "readAt", failed: "failedAt" } as const;
  next[field[incoming.status]] = earliest(current[field[incoming.status]], incoming.timestamp);
  if (incoming.status === "failed" && incoming.failureCode !== undefined) {
    next.failureCode = Math.min(current.failureCode ?? Infinity, incoming.failureCode);
  }

  let completeDeliveryPricing = confirmed(current.classification);
  if ((incoming.status === "delivered" || incoming.status === "read") && incoming.pricing) {
    const pricing: ReceiptPricing = {
      pricingModel: incoming.pricing.pricingModel ?? null,
      category: incoming.pricing.category ?? null,
      pricingType: incoming.pricing.pricingType ?? null,
      billable: incoming.pricing.billable ?? null,
    };
    completeDeliveryPricing ||= pricing.pricingModel !== null && pricing.category !== null &&
      pricing.pricingType !== null && pricing.billable !== null;
    for (const key of ["pricingModel", "category", "pricingType", "billable"] as const) {
      if (current[key] !== null && pricing[key] !== null && current[key] !== pricing[key]) next.pricingConflict = true;
    }
    next.pricingModel = observed(current.pricingModel, pricing.pricingModel);
    next.category = observed(current.category, pricing.category);
    next.pricingType = observed(current.pricingType, pricing.pricingType);
    next.billable = observed(current.billable, pricing.billable);
  }
  next.classification = classifyEvidence(next, completeDeliveryPricing);
  return next;
}

export type StatusForwarderProof = {
  workflowId: string;
  activeVersionId: string;
  triggerVersion: number;
  verifiedAt: Date;
  signatureAlgorithm: "hmac-sha256";
  signatureInput: "raw-body";
  rejectsInvalidSignatures: true;
  credentialSha256: string;
};
/**
 * Prova do forwarder instalado (G3, Deferred → L14c). Enquanto for null, o
 * Chats não mostra classificação por entrega: sem status chegando, todo rótulo
 * seria "indisponível" ou "pendente". A rota de status continua fechada por
 * não passar prova; ao habilitá-la no L14c, ela deve passar esta constante.
 */
export const STATUS_FORWARDER_PROOF: StatusForwarderProof | null = null;
export function statusClassificationEnabled(proof: StatusForwarderProof | null = STATUS_FORWARDER_PROOF): boolean {
  return proof !== null;
}
const verifiedOrigins = new WeakSet<object>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fronteira interna: auth vem de authenticate, proof de configuração SERVIDOR
 * após prova do trigger instalado, nunca de body/header "verified" do caller.
 * A credencial autenticada deve ser a do forwarder cuja versão foi comprovada.
 * T43 mantém proof ausente enquanto esse gate factual não estiver satisfeito.
 */
export function createStatusForwardingContext(
  auth: AuthResult,
  request: Request,
  proof?: StatusForwarderProof | null,
): AuthResult | null {
  if (!proof || !UUID.test(auth.tenantId) || !/^[a-z0-9_-]{1,128}$/i.test(proof.workflowId) ||
    !UUID.test(proof.activeVersionId) || !Number.isSafeInteger(proof.triggerVersion) || proof.triggerVersion <= 0 ||
    !(proof.verifiedAt instanceof Date) || !Number.isFinite(proof.verifiedAt.getTime()) ||
    proof.signatureAlgorithm !== "hmac-sha256" || proof.signatureInput !== "raw-body" ||
    proof.rejectsInvalidSignatures !== true || !/^[0-9a-f]{64}$/i.test(proof.credentialSha256)) return null;
  const credential = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!credential || !timingSafeEqual(createHash("sha256").update(credential).digest(), Buffer.from(proof.credentialSha256, "hex"))) return null;
  const context = Object.freeze({ tenantId: auth.tenantId });
  verifiedOrigins.add(context);
  return context;
}

type NormalizedStatus = ReceiptStatus & { wamid: string };
type StatusBatch = { phoneNumberId: string; statuses: NormalizedStatus[] };
type StatusRefusal = "origin-unverified" | "invalid-batch" | "body-too-large" | "channel-untrusted" | "persistence-failed";
export type StatusIngestResult = { ok: true; processed: number } | { ok: false; reason: StatusRefusal };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function boundedString(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}
function statusDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d, h, min, sec] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (month < 1 || month > 12 || day < 1 || day > days || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function normalizeBatch(raw: unknown): { ok: true; batch: StatusBatch } | { ok: false; reason: StatusRefusal } {
  let encoded: string | undefined;
  try { encoded = JSON.stringify(raw); } catch { return { ok: false, reason: "invalid-batch" }; }
  if (encoded && Buffer.byteLength(encoded, "utf8") > 100 * 1024) return { ok: false, reason: "body-too-large" };
  if (!object(raw) || !onlyKeys(raw, ["phoneNumberId", "statuses"])) return { ok: false, reason: "invalid-batch" };
  const phoneNumberId = boundedString(raw.phoneNumberId, 128);
  if (!phoneNumberId || !Array.isArray(raw.statuses) || raw.statuses.length < 1 || raw.statuses.length > 100) return { ok: false, reason: "invalid-batch" };
  const statuses: NormalizedStatus[] = [];
  for (const item of raw.statuses) {
    if (!object(item) || !onlyKeys(item, ["wamid", "status", "timestamp", "pricing", "failureCode"])) return { ok: false, reason: "invalid-batch" };
    const wamid = boundedString(item.wamid, 2048);
    const timestamp = statusDate(item.timestamp);
    if (!wamid || !timestamp || typeof item.status !== "string" || !["sent", "delivered", "read", "failed"].includes(item.status)) return { ok: false, reason: "invalid-batch" };
    let pricing: ReceiptPricing | undefined;
    if (item.pricing !== undefined && item.pricing !== null) {
      if (!object(item.pricing) || !onlyKeys(item.pricing, ["pricingModel", "category", "pricingType", "billable"])) return { ok: false, reason: "invalid-batch" };
      const p = item.pricing;
      for (const key of ["pricingModel", "category", "pricingType"] as const) {
        if (p[key] !== null && p[key] !== undefined && !boundedString(p[key], 128)) return { ok: false, reason: "invalid-batch" };
      }
      if (p.billable !== null && p.billable !== undefined && typeof p.billable !== "boolean") return { ok: false, reason: "invalid-batch" };
      pricing = {
        pricingModel: boundedString(p.pricingModel, 128), category: boundedString(p.category, 128),
        pricingType: boundedString(p.pricingType, 128), billable: typeof p.billable === "boolean" ? p.billable : null,
      };
    }
    if (item.failureCode !== undefined && (!Number.isInteger(item.failureCode) || Number(item.failureCode) < 0 || Number(item.failureCode) > 2147483647)) return { ok: false, reason: "invalid-batch" };
    statuses.push({ wamid, status: item.status as ReceiptStatus["status"], timestamp, pricing, failureCode: item.failureCode as number | undefined });
  }
  return { ok: true, batch: { phoneNumberId, statuses } };
}

function evidence(row: ReceiptEvidence): ReceiptEvidence {
  return {
    sentAt: row.sentAt, deliveredAt: row.deliveredAt, readAt: row.readAt, failedAt: row.failedAt,
    pricingModel: row.pricingModel, category: row.category, pricingType: row.pricingType, billable: row.billable,
    pricingConflict: row.pricingConflict, failureCode: row.failureCode, classification: row.classification,
  };
}

/** Validação integral antes da transação; status nunca cria mensagem ou inbound. */
export async function ingestStatusBatch(
  context: unknown,
  raw: unknown,
  options: { now?: Date; database?: Pick<typeof import("../../db").db, "transaction"> } = {},
): Promise<StatusIngestResult> {
  const authorized = object(context) && verifiedOrigins.has(context) ? context as unknown as AuthResult : null;
  const refuse = (reason: StatusRefusal): StatusIngestResult => {
    console.warn({ event: "whatsapp-status-refused", ...(authorized ? { tenantId: authorized.tenantId } : {}), reason });
    return { ok: false, reason };
  };
  if (!authorized) return refuse("origin-unverified");
  const parsed = normalizeBatch(raw);
  if (!parsed.ok) return refuse(parsed.reason);
  const observedAt = options.now ?? new Date();
  if (!Number.isFinite(observedAt.getTime())) return refuse("invalid-batch");
  const { batch } = parsed;
  try {
    const { and, eq, inArray, asc, sql } = await import("drizzle-orm");
    const { whatsappChannels, whatsappMessageReceipts } = await import("../../db/schema");
    const database = options.database ?? (await import("../../db")).db;
    const result = await database.transaction(async (tx): Promise<StatusIngestResult> => {
      // Propriedade/ownership são revalidados sob o lock, sem depender de Analytics.
      const [channel] = await tx.select().from(whatsappChannels).where(and(
        eq(whatsappChannels.tenantId, authorized.tenantId), eq(whatsappChannels.phoneNumberId, batch.phoneNumberId),
      )).for("update");
      if (!channel?.ownershipVerifiedAt) return { ok: false, reason: "channel-untrusted" };
      const wamids = [...new Set(batch.statuses.map((item) => item.wamid))].sort();
      await tx.insert(whatsappMessageReceipts).values(wamids.map((wamid) => ({
        tenantId: authorized.tenantId, phoneNumberId: channel.phoneNumberId, wamid,
        firstSeenAt: observedAt, lastSeenAt: observedAt,
        orphanExpiresAt: new Date(observedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      }))).onConflictDoNothing();
      const rows = await tx.select().from(whatsappMessageReceipts).where(and(
        eq(whatsappMessageReceipts.tenantId, authorized.tenantId), eq(whatsappMessageReceipts.phoneNumberId, channel.phoneNumberId),
        inArray(whatsappMessageReceipts.wamid, wamids),
      )).orderBy(asc(whatsappMessageReceipts.wamid)).for("update");
      const changed = rows.flatMap((row) => {
        const previous = evidence(row);
        const next = batch.statuses.filter((item) => item.wamid === row.wamid).reduce(reduceReceipt, previous);
        return JSON.stringify(previous) === JSON.stringify(next) ? [] : [{
          ...row, ...next, lastSeenAt: new Date(Math.max(row.lastSeenAt.getTime(), observedAt.getTime())),
        }];
      });
      if (changed.length) await tx.insert(whatsappMessageReceipts).values(changed).onConflictDoUpdate({
        target: [whatsappMessageReceipts.tenantId, whatsappMessageReceipts.phoneNumberId, whatsappMessageReceipts.wamid],
        set: {
          sentAt: sql`excluded.sent_at`, deliveredAt: sql`excluded.delivered_at`, readAt: sql`excluded.read_at`, failedAt: sql`excluded.failed_at`,
          pricingModel: sql`excluded.pricing_model`, category: sql`excluded.category`, pricingType: sql`excluded.pricing_type`, billable: sql`excluded.billable`,
          pricingConflict: sql`excluded.pricing_conflict`, classification: sql`excluded.classification`, failureCode: sql`excluded.failure_code`, lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
      await linkReceiptBatch(tx, { tenantId: authorized.tenantId, assignedUserId: null }, channel.phoneNumberId, wamids);
      return { ok: true, processed: batch.statuses.length };
    });
    return result.ok ? result : refuse(result.reason);
  } catch {
    return refuse("persistence-failed");
  }
}

type ReceiptExecutor = Pick<typeof import("../../db").db, "select" | "execute">;

/** Uma única atualização para todo lote; identidade vem da saída persistida. */
async function linkReceiptBatch(
  executor: ReceiptExecutor,
  scope: LeadScope,
  phoneNumberId: string,
  wamids: string[],
  messageId?: string,
): Promise<number> {
  if (!wamids.length) return 0;
  const { sql } = await import("drizzle-orm");
  const result = await executor.execute(sql`
    UPDATE whatsapp_message_receipts AS receipt
    SET message_id = message.id, orphan_expires_at = NULL
    FROM messages AS message
    JOIN conversations AS conversation ON conversation.id = message.conversation_id AND conversation.tenant_id = message.tenant_id
    JOIN leads AS lead ON lead.id = conversation.lead_id AND lead.tenant_id = conversation.tenant_id
    JOIN whatsapp_channels AS channel ON channel.tenant_id = message.tenant_id AND channel.phone_number_id = message.whatsapp_phone_number_id
    WHERE receipt.tenant_id = ${scope.tenantId} AND receipt.phone_number_id = ${phoneNumberId}
      AND receipt.wamid IN (${sql.join(wamids.map((wamid) => sql`${wamid}`), sql`, `)})
      AND message.tenant_id = receipt.tenant_id AND message.whatsapp_phone_number_id = receipt.phone_number_id
      AND message.external_id = receipt.wamid AND message.sender IN ('agente', 'humano')
      AND channel.ownership_verified_at IS NOT NULL
      AND (receipt.message_id IS NULL OR receipt.message_id = message.id)
      ${scope.assignedUserId === null ? sql`` : sql`AND lead.assigned_user_id = ${scope.assignedUserId}`}
      ${messageId === undefined ? sql`` : sql`AND message.id = ${messageId}`}
    RETURNING receipt.message_id
  `);
  return result.rows.length;
}

/**
 * Escopo vem da sessão ou serviceScope já autorizado. Não aceita identidade
 * de mensagem/canal por inferência do telefone da lead. Executor permite
 * compor com a transação de gravação, sem abrir uma transação aninhada.
 */
export async function attachReceipt(
  scope: LeadScope,
  messageId: string,
  executor?: ReceiptExecutor,
): Promise<boolean> {
  if (!UUID.test(messageId)) return false;
  const attach = async (tx: ReceiptExecutor): Promise<boolean> => {
    const { and, eq, inArray } = await import("drizzle-orm");
    const { messages, conversations, leads, whatsappChannels } = await import("../../db/schema");
    const [message] = await tx.select({ phoneNumberId: messages.whatsappPhoneNumberId, wamid: messages.externalId })
      .from(messages)
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.tenantId, messages.tenantId)))
      .innerJoin(leads, and(eq(leads.id, conversations.leadId), eq(leads.tenantId, conversations.tenantId)))
      .where(and(eq(messages.tenantId, scope.tenantId), eq(messages.id, messageId), inArray(messages.sender, ["agente", "humano"]),
        scope.assignedUserId === null ? undefined : eq(leads.assignedUserId, scope.assignedUserId)))
      .for("update", { of: leads });
    if (!message?.phoneNumberId || !message.wamid) return false;
    const [channel] = await tx.select().from(whatsappChannels).where(and(
      eq(whatsappChannels.tenantId, scope.tenantId), eq(whatsappChannels.phoneNumberId, message.phoneNumberId),
    )).for("update");
    if (!channel?.ownershipVerifiedAt) return false;
    return (await linkReceiptBatch(tx, scope, message.phoneNumberId, [message.wamid], messageId)) > 0;
  };
  if (executor) return attach(executor);
  const { db } = await import("../../db");
  return db.transaction(attach);
}
