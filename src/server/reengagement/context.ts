import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { FIELD_LABELS, nextFieldToAsk } from "../../../n8n/src/phase.mjs";
import { evaluateReengagement } from "../../../n8n/src/reengagement.mjs";
import { toWhatsAppMsisdn } from "../../../n8n/src/phone.mjs";
import { isSessionExpired, requiresSessionRebuild, selectOriginSessionFrame, selectSeedMessages } from "../../../n8n/src/session.mjs";
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

type SessionFrame = import("../../../n8n/src/session.mjs").SessionFrame;
export type GetSessionFrameResult = {
  ok: true; frame: SessionFrame;
  /** Carga pronta: seleção factual completa já ocorreu antes do teto/exclusão. */
  history: HistoryMessage[];
  requiresRebuild: boolean; pendingAcceptance: { episodeId: string; deadline: string } | null;
  anchor: { id: string; sentAt: string } | null; agentStateRevision: number | null;
} | { ok: false; reason: "invalid-input" | "invalid-buffer" | "lead-not-found" | "context-read-failed" };

/** Leitura consistente, sem renovar/consumir episódios nem semear aceite presumido. */
export async function getSessionFrame(
  context: AuthResult, leadId: string, input: { bufferMessageIds?: string[] } = {},
  options: { now?: () => Date; database?: Pick<typeof db, "transaction"> } = {},
): Promise<GetSessionFrameResult> {
  if (!UUID.test(leadId)) return { ok: false, reason: "invalid-input" };
  const buffer = input.bufferMessageIds ?? [];
  if (!Array.isArray(buffer) || buffer.length > 50 || buffer.some((id) => typeof id !== "string" || !UUID.test(id))) return { ok: false, reason: "invalid-buffer" };
  try {
    return await (options.database ?? db).transaction(async (tx): Promise<GetSessionFrameResult> => {
      const [lead] = await tx.select().from(leads).where(and(eq(leads.tenantId, context.tenantId), eq(leads.id, leadId))).for("update");
      if (!lead) return { ok: false, reason: "lead-not-found" };
      const episodes = await tx.select().from(reengagementEpisodes).where(and(eq(reengagementEpisodes.tenantId, context.tenantId), eq(reengagementEpisodes.leadId, leadId)))
        .orderBy(desc(reengagementEpisodes.createdAt), desc(reengagementEpisodes.id)).for("update");
      const now = (options.now ?? (() => new Date()))();
      if (!finite(now) || !finite(lead.memoryResetRequestedAt)) return { ok: false, reason: "context-read-failed" };
      const [current] = await tx.select({ id: messages.id, sentAt: messages.sentAt, conversationId: messages.conversationId, phoneNumberId: messages.whatsappPhoneNumberId }).from(messages)
        .innerJoin(conversations, and(eq(conversations.tenantId, messages.tenantId), eq(conversations.id, messages.conversationId)))
        .where(and(eq(messages.tenantId, context.tenantId), eq(conversations.leadId, leadId), eq(messages.sender, "lead"))).orderBy(desc(messages.sentAt), desc(messages.id)).limit(1);
      if (current && !finite(current.sentAt)) return { ok: false, reason: "context-read-failed" };
      const [agent] = await tx.select().from(leadAgentState).where(and(eq(leadAgentState.tenantId, context.tenantId), eq(leadAgentState.leadId, leadId)));
      const rows = current ? await tx.select({ id: messages.id, sender: messages.sender, content: messages.content, sentAt: messages.sentAt,
        authorName: messages.authorName, phoneNumberId: messages.whatsappPhoneNumberId }).from(messages)
        .where(and(eq(messages.tenantId, context.tenantId), eq(messages.conversationId, current.conversationId))).orderBy(messages.sentAt, messages.id) : [];
      if (rows.some((message) => !finite(message.sentAt) || typeof message.content !== "string")) return { ok: false, reason: "context-read-failed" };
      if (buffer.some((id) => !rows.some((message) => message.id === id && message.sender === "lead"))) return { ok: false, reason: "invalid-buffer" };
      const history = rows.map((message) => ({ id: message.id, sender: message.sender, content: message.content,
        authorName: message.authorName, sentAt: message.sentAt.toISOString() }));
      const frame: SessionFrame = { revision: 0, resetRequestedAt: lead.memoryResetRequestedAt?.toISOString() ?? null, bridge: null };
      let pendingAcceptance: { episodeId: string; deadline: string } | null = null;
      const [channel] = lead.whatsappPhoneNumberId ? await tx.select().from(whatsappChannels).where(and(eq(whatsappChannels.tenantId, context.tenantId), eq(whatsappChannels.phoneNumberId, lead.whatsappPhoneNumberId))) : [];
      const conduction = current && lead.status === "em_qualificacao" && lead.optedOutAt === null && lead.humanTakeoverAt === null
        && channel?.ownershipVerifiedAt && finite(channel.ownershipVerifiedAt) && current.phoneNumberId === channel.phoneNumberId
        && agent?.anchorMessageId === current.id && agent.phase !== "encerrada" && sameTime(agent.resetObservedAt, lead.memoryResetRequestedAt);
      if (conduction && current && channel) for (const episode of episodes) {
        if (episode.phoneNumberId !== channel.phoneNumberId || episode.bridgeInvalidatedAt || !sameTime(episode.resetObservedAt, lead.memoryResetRequestedAt)
            || !Number.isSafeInteger(episode.bridgeRevision) || episode.bridgeRevision < 1 || !finite(episode.anchorSentAt)
            || !episode.dispatchAuthorizedAt || !finite(episode.dispatchAuthorizedAt)) continue;
        const anchor = rows.find((message) => message.id === episode.anchorMessageId), first = rows.find((message) => message.id === episode.firstInboundMessageId);
        const start = rows.find((message) => message.id === episode.originSessionStartMessageId), end = rows.find((message) => message.id === episode.originSessionEndMessageId);
        if (!anchor || !first || !start || !end || anchor.sender !== "lead" || first.sender !== "lead"
            || [anchor, first, start, end].some((message) => message.phoneNumberId !== channel.phoneNumberId)
            || !sameTime(anchor.sentAt, episode.anchorSentAt) || start.sentAt.getTime() > anchor.sentAt.getTime() || end.sentAt.getTime() < anchor.sentAt.getTime()
            || first.sentAt.getTime() <= anchor.sentAt.getTime() || first.sentAt.getTime() >= anchor.sentAt.getTime() + 48 * 3600000
            || (lead.memoryResetRequestedAt && start.sentAt.getTime() < lead.memoryResetRequestedAt.getTime())) continue;
        if (["authorized", "accepted_pending_record"].includes(episode.state) && episode.dispatchCompletionDeadline
            && finite(episode.dispatchCompletionDeadline) && now.getTime() < episode.dispatchCompletionDeadline.getTime()) {
          pendingAcceptance = { episodeId: episode.id, deadline: episode.dispatchCompletionDeadline.toISOString() };
          frame.revision = episode.bridgeRevision; break;
        }
        const resume = rows.find((message) => message.id === episode.messageId);
        if (episode.state !== "accepted" || !resume || resume.sender !== "agente" || resume.phoneNumberId !== channel.phoneNumberId
            || !episode.bridgeLastInboundAt || !sameTime(episode.bridgeLastInboundAt, current.sentAt)
            || episode.bridgeLastInboundAt.getTime() < first.sentAt.getTime() || isSessionExpired(episode.bridgeLastInboundAt.toISOString(), now.toISOString())) continue;
        frame.revision = episode.bridgeRevision;
        frame.bridge = { state: "accepted", bridgeRevision: episode.bridgeRevision, bridgeInvalidatedAt: null, resetObservedAt: episode.resetObservedAt?.toISOString() ?? null,
          anchorMessageId: anchor.id, anchorSentAt: anchor.sentAt.toISOString(), originSessionStartMessageId: start.id, originSessionEndMessageId: end.id,
          messageId: resume.id, firstInboundMessageId: first.id, firstInboundSentAt: first.sentAt.toISOString(), bridgeLastInboundAt: episode.bridgeLastInboundAt.toISOString() };
        break;
      }
      const active = current && !isSessionExpired(current.sentAt.toISOString(), now.toISOString());
      return { ok: true, frame, history: pendingAcceptance || !active ? [] : selectSeedMessages(history, now.toISOString(), { frame, excludeMessageIds: buffer }),
        requiresRebuild: requiresSessionRebuild(frame, buffer), pendingAcceptance,
        anchor: current ? { id: current.id, sentAt: current.sentAt.toISOString() } : null, agentStateRevision: agent?.revision ?? null };
    });
  } catch { return { ok: false, reason: "context-read-failed" }; }
}
