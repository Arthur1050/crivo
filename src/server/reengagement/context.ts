import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { FIELD_LABELS, nextFieldToAsk } from "../../../n8n/src/phase.mjs";
import { evaluateReengagement } from "../../../n8n/src/reengagement.mjs";
import { toWhatsAppMsisdn } from "../../../n8n/src/phone.mjs";
import { selectOriginSessionFrame } from "../../../n8n/src/session.mjs";
import { db } from "../../db";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels } from "../../db/schema";
import type { AuthResult } from "../integration/auth";

type HistoryMessage = import("../../../n8n/src/session.mjs").HistoryMessage;
type Lead = typeof leads.$inferSelect;
export interface PreparationFrame {
  tenantId: string; leadId: string; episodeId: string; phoneNumberId: string; channelRevision: number; preparedAt: string;
  anchor: { id: string; sentAt: string }; resetObservedAt: string | null;
  agent: { phase: "qualificando" | "agendando"; revision: number; askedFields: string[]; openingHistory: string[] };
  facts: Pick<Lead, "name" | "modality" | "region" | "propertyType" | "purchaseHorizon" | "motivation" | "creditStatus" | "chainedOperation" | "executiveSummary"> & { budgetCents: string | null };
  pendingField: string | null;
  origin: { startMessageId: string; endMessageId: string };
  history: HistoryMessage[];
}
export type PrepareFrameResult = { ok: true; frame: PreparationFrame }
  | { ok: false; reason: "invalid-input" | "lead-not-found" | "episode-not-found" | "episode-consumed" | "claim-conflict" | "claim-expired" | "context-changed" | "context-read-failed" | "not-eligible" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function finite(date: Date | null) { return date === null || Number.isFinite(date.getTime()); }
function sameTime(a: Date | null, b: Date | null) { return finite(a) && finite(b) && a?.getTime() === b?.getTime(); }

/** Frame efêmero, sem histórico paralelo. Somente referências de origem são persistidas. */
export async function prepareFrame(
  context: AuthResult, leadId: string, episodeId: string, input: { claimToken: string },
  options: { now?: () => Date; database?: Pick<typeof db, "transaction"> } = {},
): Promise<PrepareFrameResult> {
  if (!UUID.test(leadId) || !UUID.test(episodeId) || typeof input.claimToken !== "string" || !UUID.test(input.claimToken)) return { ok: false, reason: "invalid-input" };
  try {
    return await (options.database ?? db).transaction(async (tx): Promise<PrepareFrameResult> => {
      const [lead] = await tx.select().from(leads).where(and(eq(leads.tenantId, context.tenantId), eq(leads.id, leadId))).for("update");
      if (!lead) return { ok: false, reason: "lead-not-found" };
      const [episode] = await tx.select().from(reengagementEpisodes).where(and(eq(reengagementEpisodes.tenantId, context.tenantId),
        eq(reengagementEpisodes.leadId, leadId), eq(reengagementEpisodes.id, episodeId))).for("update");
      if (!episode) return { ok: false, reason: "episode-not-found" };
      const now = (options.now ?? (() => new Date()))();
      if (episode.state !== "preparing" || episode.dispatchAuthorizedAt) return { ok: false, reason: "episode-consumed" };
      if (episode.claimToken !== input.claimToken) return { ok: false, reason: "claim-conflict" };
      if (!finite(now) || !episode.claimExpiresAt || !finite(episode.claimExpiresAt) || episode.claimExpiresAt.getTime() <= now.getTime()) return { ok: false, reason: "claim-expired" };
      const [anchor] = await tx.select({ id: messages.id, conversationId: messages.conversationId, sentAt: messages.sentAt, phoneNumberId: messages.whatsappPhoneNumberId })
        .from(messages).innerJoin(conversations, and(eq(conversations.tenantId, messages.tenantId), eq(conversations.id, messages.conversationId)))
        .where(and(eq(messages.tenantId, context.tenantId), eq(conversations.leadId, leadId), eq(messages.sender, "lead")))
        .orderBy(desc(messages.sentAt), desc(messages.id)).limit(1);
      const [agent] = await tx.select().from(leadAgentState).where(and(eq(leadAgentState.tenantId, context.tenantId), eq(leadAgentState.leadId, leadId)));
      if (!anchor || !finite(anchor.sentAt) || anchor.id !== episode.anchorMessageId || !sameTime(anchor.sentAt, episode.anchorSentAt)
          || agent?.anchorMessageId !== anchor.id || agent.revision !== episode.agentStateRevision
          || !sameTime(lead.memoryResetRequestedAt, episode.resetObservedAt) || !sameTime(agent.resetObservedAt, episode.resetObservedAt)
          || (lead.memoryResetRequestedAt && anchor.sentAt.getTime() < lead.memoryResetRequestedAt.getTime())
          || lead.whatsappPhoneNumberId !== episode.phoneNumberId || anchor.phoneNumberId !== episode.phoneNumberId) return { ok: false, reason: "context-changed" };
      const [channel] = await tx.select().from(whatsappChannels).where(and(eq(whatsappChannels.tenantId, context.tenantId), eq(whatsappChannels.phoneNumberId, episode.phoneNumberId)));
      if (!channel?.ownershipVerifiedAt || !finite(channel.ownershipVerifiedAt) || !Number.isSafeInteger(channel.configurationRevision)
          || channel.configurationRevision < 1) return { ok: false, reason: "context-changed" };
      const [settings] = await tx.select({ meetingDays: tenants.meetingDays, meetingHoursStart: tenants.meetingHoursStart, meetingHoursEnd: tenants.meetingHoursEnd }).from(tenants).where(eq(tenants.id, context.tenantId));
      const decision = evaluateReengagement({ lead, anchor: { messageId: anchor.id, sentAt: anchor.sentAt }, phase: agent.phase,
        channel, destination: toWhatsAppMsisdn(lead.externalId), now, settings });
      if (decision.action !== "prepare" || (agent.phase !== "qualificando" && agent.phase !== "agendando")) return { ok: false, reason: "not-eligible" };
      if (!Array.isArray(agent.askedFields) || agent.askedFields.some((field) => !Object.hasOwn(FIELD_LABELS, field))
          || !Array.isArray(agent.openingHistory) || agent.openingHistory.some((opening) => typeof opening !== "string")) return { ok: false, reason: "context-read-failed" };
      const rows = await tx.select({ id: messages.id, sender: messages.sender, content: messages.content, sentAt: messages.sentAt, authorName: messages.authorName })
        .from(messages).where(and(eq(messages.tenantId, context.tenantId), eq(messages.conversationId, anchor.conversationId),
          lead.memoryResetRequestedAt ? gte(messages.sentAt, lead.memoryResetRequestedAt) : undefined)).orderBy(messages.sentAt, messages.id);
      if (rows.some((message) => !finite(message.sentAt) || typeof message.content !== "string")) return { ok: false, reason: "context-read-failed" };
      const history = rows.map((message) => ({ ...message, sentAt: message.sentAt.toISOString() }));
      const origin = selectOriginSessionFrame(history, anchor.id);
      if (!origin?.startMessageId || !origin.endMessageId || origin.messages.length === 0) return { ok: false, reason: "context-read-failed" };
      const facts = { name: lead.name, modality: lead.modality, region: lead.region, budgetCents: lead.budgetCents?.toString() ?? null,
        propertyType: lead.propertyType, purchaseHorizon: lead.purchaseHorizon, motivation: lead.motivation, creditStatus: lead.creditStatus,
        chainedOperation: lead.chainedOperation, executiveSummary: lead.executiveSummary };
      const confirmed = Object.keys(FIELD_LABELS).filter((field) => facts[field as keyof typeof facts] !== null && facts[field as keyof typeof facts] !== "");
      const frame: PreparationFrame = { tenantId: context.tenantId, leadId, episodeId, phoneNumberId: channel.phoneNumberId, channelRevision: channel.configurationRevision,
        preparedAt: now.toISOString(), anchor: { id: anchor.id, sentAt: anchor.sentAt.toISOString() }, resetObservedAt: episode.resetObservedAt?.toISOString() ?? null,
        agent: { phase: agent.phase, revision: agent.revision, askedFields: agent.askedFields, openingHistory: agent.openingHistory }, facts,
        pendingField: nextFieldToAsk([...agent.askedFields, ...confirmed]), origin: { startMessageId: origin.startMessageId, endMessageId: origin.endMessageId }, history: origin.messages };
      await tx.update(reengagementEpisodes).set({ originSessionStartMessageId: origin.startMessageId, originSessionEndMessageId: origin.endMessageId }).where(eq(reengagementEpisodes.id, episodeId));
      return { ok: true, frame };
    });
  } catch { return { ok: false, reason: "context-read-failed" }; }
}
