import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { evaluateReengagement } from "../../../n8n/src/reengagement.mjs";
import { toWhatsAppMsisdn } from "../../../n8n/src/phone.mjs";
import { db } from "../../db";
import { tenants } from "../../db/schema";
import type { AuthResult } from "../integration/auth";

export interface ReengagementCandidate {
  leadId: string; anchorMessageId: string; anchorSentAt: string; phoneNumberId: string;
  action: "prepare" | "omit" | "escalate";
}
export type CandidatesResult = { ok: true; candidates: ReengagementCandidate[]; cutoffAt: Date; nextCursor: string | null }
  | { ok: false; reason: "invalid-limit" | "invalid-cursor" | "tenant-not-found" };
type Cursor = { version: 1; tenantId: string; afterLeadId: string; cutoffAt: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function decodeCursor(value: string, tenantId: string, now: Date): Cursor | null {
  try {
    if (value.length > 1024 || Buffer.from(value, "base64url").toString("base64url") !== value) return null;
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (parsed.version !== 1 || parsed.tenantId !== tenantId || typeof parsed.afterLeadId !== "string" || !UUID.test(parsed.afterLeadId)
        || typeof parsed.cutoffAt !== "string" || new Date(parsed.cutoffAt).toISOString() !== parsed.cutoffAt
        || Date.parse(parsed.cutoffAt) > now.getTime()) return null;
    return parsed;
  } catch { return null; }
}
type CandidateRow = {
  leadId: string; status: string; optedOutAt: string | null; humanTakeoverAt: string | null; externalId: string | null;
  resetRequestedAt: string | null; anchorMessageId: string | null; anchorSentAt: string | null;
  anchorPhoneNumberId: string | null;
  phase: string | null; stateAnchorId: string | null; resetObservedAt: string | null;
  phoneNumberId: string | null; ownershipVerifiedAt: string | null;
  statusChangedBy: string | null; episodeState: string | null; dispatchAuthorizedAt: string | null;
  claimExpiresAt: string | null; escalatedAt: string | null;
};

// execute(sql) preserva timestamps como strings no driver instalado; o parâmetro
// genérico não executa o mapper Date das colunas do schema.
function decodeTimestamp(value: string | null): Date | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}
function decodeDates(row: CandidateRow) {
  const optedOutAt = decodeTimestamp(row.optedOutAt), humanTakeoverAt = decodeTimestamp(row.humanTakeoverAt);
  const resetRequestedAt = decodeTimestamp(row.resetRequestedAt), anchorSentAt = decodeTimestamp(row.anchorSentAt);
  const resetObservedAt = decodeTimestamp(row.resetObservedAt), ownershipVerifiedAt = decodeTimestamp(row.ownershipVerifiedAt);
  const dispatchAuthorizedAt = decodeTimestamp(row.dispatchAuthorizedAt), claimExpiresAt = decodeTimestamp(row.claimExpiresAt);
  const escalatedAt = decodeTimestamp(row.escalatedAt);
  if (optedOutAt === undefined || humanTakeoverAt === undefined || resetRequestedAt === undefined || anchorSentAt === undefined
      || resetObservedAt === undefined || ownershipVerifiedAt === undefined || dispatchAuthorizedAt === undefined
      || claimExpiresAt === undefined || escalatedAt === undefined) return null;
  return { optedOutAt, humanTakeoverAt, resetRequestedAt, anchorSentAt, resetObservedAt, ownershipVerifiedAt, dispatchAuthorizedAt, claimExpiresAt, escalatedAt };
}

/**
 * Cursor guarda o corte do tick e último ID EXAMINADO, mesmo em página vazia.
 * Cada chamada lê só limit+1 leads e um inbound por lead (query lateral), sem
 * loop para preencher a página com elegíveis. Caller segue nextCursor até null.
 * Autorização final usa relógio vivo sob lock; listagem nunca autoriza envio.
 */
export async function listCandidates(
  context: AuthResult,
  input: { cursor?: string | null; limit?: number } = {},
  options: { now?: () => Date; database?: Pick<typeof db, "select" | "execute"> } = {},
): Promise<CandidatesResult> {
  const limit = input.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return { ok: false, reason: "invalid-limit" };
  const now = (options.now ?? (() => new Date()))();
  const cursor = input.cursor ? decodeCursor(input.cursor, context.tenantId, now) : null;
  if (input.cursor && !cursor) return { ok: false, reason: "invalid-cursor" };
  const cutoffAt = cursor ? new Date(cursor.cutoffAt) : now;
  const database = options.database ?? db;
  const [settings] = await database.select({ meetingDays: tenants.meetingDays, meetingHoursStart: tenants.meetingHoursStart, meetingHoursEnd: tenants.meetingHoursEnd })
    .from(tenants).where(and(eq(tenants.id, context.tenantId))).limit(1);
  if (!settings) return { ok: false, reason: "tenant-not-found" };
  const result = await database.execute<CandidateRow>(sql`
    SELECT lead.id AS "leadId", lead.status, lead.opted_out_at AS "optedOutAt",
      lead.human_takeover_at AS "humanTakeoverAt", lead.external_id AS "externalId",
      lead.memory_reset_requested_at AS "resetRequestedAt", lead.status_changed_by AS "statusChangedBy",
      anchor.id AS "anchorMessageId", anchor.sent_at AS "anchorSentAt", anchor.whatsapp_phone_number_id AS "anchorPhoneNumberId",
      agent.phase, agent.anchor_message_id AS "stateAnchorId", agent.reset_observed_at AS "resetObservedAt",
      channel.phone_number_id AS "phoneNumberId", channel.ownership_verified_at AS "ownershipVerifiedAt",
      episode.state AS "episodeState", episode.dispatch_authorized_at AS "dispatchAuthorizedAt", episode.claim_expires_at AS "claimExpiresAt", episode.escalated_at AS "escalatedAt"
    FROM (SELECT id, tenant_id, status, status_changed_by, opted_out_at, human_takeover_at, external_id, memory_reset_requested_at, whatsapp_phone_number_id
      FROM leads WHERE tenant_id = ${context.tenantId} AND created_at <= ${cutoffAt}
        ${cursor ? sql`AND id > ${cursor.afterLeadId}` : sql``}
      ORDER BY id LIMIT ${limit + 1}) lead
    LEFT JOIN LATERAL (SELECT message.id, message.sent_at, message.whatsapp_phone_number_id FROM messages message
      INNER JOIN conversations conversation ON conversation.id = message.conversation_id AND conversation.tenant_id = message.tenant_id
      WHERE message.tenant_id = lead.tenant_id AND conversation.lead_id = lead.id AND message.sender = 'lead'
      ORDER BY message.sent_at DESC, message.id DESC LIMIT 1) anchor ON true
    LEFT JOIN lead_agent_state agent ON agent.tenant_id = lead.tenant_id AND agent.lead_id = lead.id
    LEFT JOIN whatsapp_channels channel ON channel.tenant_id = lead.tenant_id AND channel.phone_number_id = lead.whatsapp_phone_number_id
    LEFT JOIN reengagement_episodes episode ON episode.tenant_id = lead.tenant_id AND episode.lead_id = lead.id
      AND episode.phone_number_id = channel.phone_number_id AND episode.anchor_message_id = anchor.id
    ORDER BY lead.id
  `);
  const examined = result.rows.slice(0, limit);
  const candidates: ReengagementCandidate[] = [];
  for (const raw of examined) {
    const dates = decodeDates(raw);
    if (!dates) continue;
    const row = { ...raw, ...dates };
    const sameReset = row.resetRequestedAt?.getTime() === row.resetObservedAt?.getTime();
    const decision = evaluateReengagement({ lead: row, anchor: { messageId: row.anchorMessageId, sentAt: row.anchorSentAt },
      phase: row.stateAnchorId === row.anchorMessageId && sameReset ? row.phase : null,
      channel: row.ownershipVerifiedAt && row.anchorPhoneNumberId === row.phoneNumberId ? { phoneNumberId: row.phoneNumberId } : null,
      destination: toWhatsAppMsisdn(row.externalId), now: cutoffAt, settings });
    if (decision.action === "prepare" && row.episodeState !== null && (row.dispatchAuthorizedAt || row.episodeState !== "preparing"
        || (row.claimExpiresAt && row.claimExpiresAt.getTime() > cutoffAt.getTime()))) continue;
    if (decision.action === "omit" && (row.dispatchAuthorizedAt || row.episodeState === "omitted" || row.episodeState === "cancelled")) continue;
    if (decision.action === "escalate" && (row.escalatedAt || row.statusChangedBy === "humano")) continue;
    if (decision.action && row.anchorMessageId && row.anchorSentAt && row.phoneNumberId) candidates.push({
      leadId: row.leadId, anchorMessageId: row.anchorMessageId, anchorSentAt: row.anchorSentAt.toISOString(), phoneNumberId: row.phoneNumberId, action: decision.action,
    });
  }
  const nextCursor = result.rows.length > limit ? Buffer.from(JSON.stringify({ version: 1, tenantId: context.tenantId,
    afterLeadId: examined[examined.length - 1].leadId, cutoffAt: cutoffAt.toISOString() } satisfies Cursor)).toString("base64url") : null;
  return { ok: true, candidates, cutoffAt, nextCursor };
}
