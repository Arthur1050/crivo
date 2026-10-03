import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { evaluateReengagement } from "../../../n8n/src/reengagement.mjs";
import { toWhatsAppMsisdn } from "../../../n8n/src/phone.mjs";
import { db } from "../../db";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels } from "../../db/schema";
import type { AuthResult } from "../integration/auth";
import { HUMAN_TEXT_MAX_LENGTH } from "../chats/human-send";

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

export type PreparationClaimResult =
  | { ok: true; acquired: true; episodeId: string; claimToken: string; claimExpiresAt: Date; agentStateRevision: number }
  | { ok: true; acquired: false; episodeId: string; state: typeof reengagementEpisodes.$inferSelect["state"] }
  | { ok: false; reason: "invalid-anchor" | "lead-not-found" | "context-changed" | "lease-active" | "not-eligible"; policyReason?: string };

/** Só o vencedor recebe token. Relógio é amostrado após lead→episódio. */
export async function claimPreparation(
  context: AuthResult,
  leadId: string,
  input: { anchorMessageId: string },
  options: { now?: () => Date; database?: Pick<typeof db, "transaction"> } = {},
): Promise<PreparationClaimResult> {
  if (typeof input.anchorMessageId !== "string" || !UUID.test(input.anchorMessageId)) return { ok: false, reason: "invalid-anchor" };
  return (options.database ?? db).transaction(async (tx): Promise<PreparationClaimResult> => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.tenantId, context.tenantId), eq(leads.id, leadId))).for("update");
    if (!lead) return { ok: false, reason: "lead-not-found" };
    const [anchor] = await tx.select({ id: messages.id, sentAt: messages.sentAt, phoneNumberId: messages.whatsappPhoneNumberId }).from(messages)
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.tenantId, messages.tenantId)))
      .where(and(eq(messages.tenantId, context.tenantId), eq(conversations.leadId, leadId), eq(messages.sender, "lead")))
      .orderBy(desc(messages.sentAt), desc(messages.id)).limit(1);
    const [agent] = await tx.select().from(leadAgentState).where(and(eq(leadAgentState.tenantId, context.tenantId), eq(leadAgentState.leadId, leadId)));
    if (!anchor || anchor.id !== input.anchorMessageId || agent?.anchorMessageId !== anchor.id
        || lead.memoryResetRequestedAt?.getTime() !== agent.resetObservedAt?.getTime()) return { ok: false, reason: "context-changed" };
    const [channel] = await tx.select().from(whatsappChannels).where(and(eq(whatsappChannels.tenantId, context.tenantId),
      eq(whatsappChannels.phoneNumberId, lead.whatsappPhoneNumberId ?? "")));
    const [settings] = await tx.select({ meetingDays: tenants.meetingDays, meetingHoursStart: tenants.meetingHoursStart, meetingHoursEnd: tenants.meetingHoursEnd })
      .from(tenants).where(eq(tenants.id, context.tenantId));
    const [episode] = await tx.select().from(reengagementEpisodes).where(and(eq(reengagementEpisodes.tenantId, context.tenantId),
      eq(reengagementEpisodes.leadId, leadId), eq(reengagementEpisodes.phoneNumberId, channel?.phoneNumberId ?? ""),
      eq(reengagementEpisodes.anchorMessageId, anchor.id))).for("update");
    const now = (options.now ?? (() => new Date()))();
    const decision = evaluateReengagement({ lead, anchor: { messageId: anchor.id, sentAt: anchor.sentAt }, phase: agent.phase,
      channel: channel?.ownershipVerifiedAt && Number.isFinite(channel.ownershipVerifiedAt.getTime()) && anchor.phoneNumberId === channel.phoneNumberId ? channel : null,
      destination: toWhatsAppMsisdn(lead.externalId), now, settings });
    if (decision.action !== "prepare") return { ok: false, reason: "not-eligible", policyReason: decision.reason };
    if (episode && (episode.dispatchAuthorizedAt || episode.state !== "preparing")) {
      return { ok: true, acquired: false, episodeId: episode.id, state: episode.state };
    }
    if (episode?.claimExpiresAt && (!Number.isFinite(episode.claimExpiresAt.getTime()) || episode.claimExpiresAt.getTime() > now.getTime())) {
      return { ok: false, reason: "lease-active" };
    }
    const claimToken = randomUUID(), claimExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    const values = { resetObservedAt: agent.resetObservedAt, agentStateRevision: agent.revision, claimToken, claimExpiresAt,
      preparedAt: now, reasonCode: null, updatedAt: now };
    const [claimed] = episode
      ? await tx.update(reengagementEpisodes).set(values).where(eq(reengagementEpisodes.id, episode.id)).returning()
      : await tx.insert(reengagementEpisodes).values({ tenantId: context.tenantId, leadId, phoneNumberId: channel!.phoneNumberId,
        anchorMessageId: anchor.id, anchorSentAt: anchor.sentAt, createdAt: now, ...values }).returning();
    return { ok: true, acquired: true, episodeId: claimed.id, claimToken, claimExpiresAt, agentStateRevision: agent.revision };
  });
}

export const PREPARATION_FAILURE_CODES = ["generation-failed", "generation-timeout", "context-read-failed", "invalid-text"] as const;
export type PreparationFailureCode = typeof PREPARATION_FAILURE_CODES[number];
export type PreparationFailureResult = { ok: true; released: true; episodeId: string }
  | { ok: false; reason: "invalid-input" | "lead-not-found" | "episode-not-found" | "episode-consumed" | "claim-conflict" | "claim-expired" };

/** Falha anterior ao despacho nunca desfaz autorização nem libera outro worker. */
export async function releasePreparationFailure(
  context: AuthResult,
  leadId: string,
  episodeId: string,
  input: { claimToken: string; code: PreparationFailureCode },
  options: { now?: () => Date; database?: Pick<typeof db, "transaction"> } = {},
): Promise<PreparationFailureResult> {
  if (!UUID.test(episodeId) || typeof input.claimToken !== "string" || !UUID.test(input.claimToken)
      || !PREPARATION_FAILURE_CODES.includes(input.code)) return { ok: false, reason: "invalid-input" };
  return (options.database ?? db).transaction(async (tx): Promise<PreparationFailureResult> => {
    const [lead] = await tx.select({ id: leads.id }).from(leads)
      .where(and(eq(leads.tenantId, context.tenantId), eq(leads.id, leadId))).for("update");
    if (!lead) return { ok: false, reason: "lead-not-found" };
    const [episode] = await tx.select().from(reengagementEpisodes)
      .where(and(eq(reengagementEpisodes.tenantId, context.tenantId), eq(reengagementEpisodes.leadId, leadId),
        eq(reengagementEpisodes.id, episodeId))).for("update");
    if (!episode) return { ok: false, reason: "episode-not-found" };
    if (episode.dispatchAuthorizedAt || episode.state !== "preparing") return { ok: false, reason: "episode-consumed" };
    if (episode.claimToken !== input.claimToken) return { ok: false, reason: "claim-conflict" };
    const now = (options.now ?? (() => new Date()))();
    if (!Number.isFinite(now.getTime()) || !episode.claimExpiresAt || !Number.isFinite(episode.claimExpiresAt.getTime())
        || episode.claimExpiresAt.getTime() <= now.getTime()) return { ok: false, reason: "claim-expired" };
    await tx.update(reengagementEpisodes).set({ claimToken: null, claimExpiresAt: null, submittedText: null,
      reasonCode: input.code, updatedAt: now }).where(eq(reengagementEpisodes.id, episode.id));
    return { ok: true, released: true, episodeId };
  });
}

export type DispatchAuthorizationResult =
  | { ok: true; authorized: true; episodeId: string; text: string; phoneNumberId: string; destination: string; dispatchAuthorizedAt: Date; dispatchCompletionDeadline: Date }
  | { ok: true; authorized: false; episodeId: string; state: typeof reengagementEpisodes.$inferSelect["state"] }
  | { ok: false; reason: "invalid-input" | "invalid-text" | "invalid-channel-snapshot" | "lead-not-found" | "episode-not-found" | "claim-conflict" | "claim-expired" | "context-changed" | "not-eligible"; policyReason?: string };

/**
 * T34 resolve transporte/canal no servidor antes de chamar esta fronteira.
 * Snapshot interno nunca vem do corpo/modelo. Só authorized:true pode enviar.
 * A transação persiste texto/consumo antes de devolver essa permissão única.
 */
export async function authorizeDispatch(
  context: AuthResult, leadId: string, episodeId: string,
  input: { claimToken: string; text: string },
  options: { expectedChannelRevision?: number; now?: () => Date; database?: Pick<typeof db, "transaction"> } = {},
): Promise<DispatchAuthorizationResult> {
  if (!UUID.test(episodeId) || typeof input.claimToken !== "string" || !UUID.test(input.claimToken)) return { ok: false, reason: "invalid-input" };
  if (typeof input.text !== "string" || !input.text.trim() || input.text.trim().length > HUMAN_TEXT_MAX_LENGTH) return { ok: false, reason: "invalid-text" };
  if (!Number.isSafeInteger(options.expectedChannelRevision) || options.expectedChannelRevision! < 1) return { ok: false, reason: "invalid-channel-snapshot" };
  const text = input.text.trim();
  return (options.database ?? db).transaction(async (tx): Promise<DispatchAuthorizationResult> => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.tenantId, context.tenantId), eq(leads.id, leadId))).for("update");
    if (!lead) return { ok: false, reason: "lead-not-found" };
    const [episode] = await tx.select().from(reengagementEpisodes).where(and(eq(reengagementEpisodes.tenantId, context.tenantId),
      eq(reengagementEpisodes.leadId, leadId), eq(reengagementEpisodes.id, episodeId))).for("update");
    if (!episode) return { ok: false, reason: "episode-not-found" };
    if (episode.dispatchAuthorizedAt || episode.state !== "preparing") return { ok: true, authorized: false, episodeId, state: episode.state };
    if (episode.claimToken !== input.claimToken) return { ok: false, reason: "claim-conflict" };
    const [channel] = await tx.select().from(whatsappChannels).where(and(eq(whatsappChannels.tenantId, context.tenantId),
      eq(whatsappChannels.phoneNumberId, episode.phoneNumberId))).for("update");
    const [anchor] = await tx.select({ id: messages.id, sentAt: messages.sentAt, phoneNumberId: messages.whatsappPhoneNumberId }).from(messages)
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.tenantId, messages.tenantId)))
      .where(and(eq(messages.tenantId, context.tenantId), eq(conversations.leadId, leadId), eq(messages.sender, "lead")))
      .orderBy(desc(messages.sentAt), desc(messages.id)).limit(1);
    const [agent] = await tx.select().from(leadAgentState).where(and(eq(leadAgentState.tenantId, context.tenantId), eq(leadAgentState.leadId, leadId)));
    const [settings] = await tx.select({ meetingDays: tenants.meetingDays, meetingHoursStart: tenants.meetingHoursStart, meetingHoursEnd: tenants.meetingHoursEnd })
      .from(tenants).where(eq(tenants.id, context.tenantId));
    const now = (options.now ?? (() => new Date()))();
    if (!Number.isFinite(now.getTime()) || !episode.claimExpiresAt || !Number.isFinite(episode.claimExpiresAt.getTime())
        || episode.claimExpiresAt.getTime() <= now.getTime()) return { ok: false, reason: "claim-expired" };
    async function cancel(reasonCode: string, state: "cancelled" | "omitted" = "cancelled") {
      await tx.update(reengagementEpisodes).set({ state, reasonCode, claimToken: null, claimExpiresAt: null, submittedText: null, updatedAt: now })
        .where(eq(reengagementEpisodes.id, episodeId));
    }
    if (!anchor || anchor.id !== episode.anchorMessageId || anchor.sentAt.getTime() !== episode.anchorSentAt.getTime()
        || !agent || agent.anchorMessageId !== anchor.id || agent.revision !== episode.agentStateRevision
        || lead.memoryResetRequestedAt?.getTime() !== episode.resetObservedAt?.getTime()
        || agent.resetObservedAt?.getTime() !== episode.resetObservedAt?.getTime()
        || !channel || channel.configurationRevision !== options.expectedChannelRevision
        || lead.whatsappPhoneNumberId !== channel.phoneNumberId || anchor.phoneNumberId !== channel.phoneNumberId
        || !channel.ownershipVerifiedAt || !Number.isFinite(channel.ownershipVerifiedAt.getTime())) {
      await cancel("context-changed"); return { ok: false, reason: "context-changed" };
    }
    const destination = toWhatsAppMsisdn(lead.externalId);
    const decision = evaluateReengagement({ lead, anchor: { messageId: anchor.id, sentAt: anchor.sentAt }, phase: agent.phase, channel, destination, now, settings });
    if (decision.action !== "prepare") {
      if (decision.reason === "ineligible" || decision.reason === "unknown-data") await cancel(decision.reason);
      if (decision.action === "omit" || decision.action === "escalate") await cancel("window-closed", "omitted");
      return { ok: false, reason: "not-eligible", policyReason: decision.reason };
    }
    const dispatchCompletionDeadline = new Date(now.getTime() + 120000);
    await tx.update(reengagementEpisodes).set({ state: "authorized", submittedText: text, dispatchAuthorizedAt: now,
      dispatchCompletionDeadline, reasonCode: null, updatedAt: now }).where(eq(reengagementEpisodes.id, episodeId));
    return { ok: true, authorized: true, episodeId, text, phoneNumberId: channel.phoneNumberId, destination,
      dispatchAuthorizedAt: now, dispatchCompletionDeadline };
  });
}
