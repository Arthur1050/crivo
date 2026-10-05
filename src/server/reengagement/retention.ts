import "server-only";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { isSessionExpired } from "../../../n8n/src/session.mjs";
import { db } from "../../db";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, whatsappChannels, whatsappMessageReceipts, whatsappUsage } from "../../db/schema";

export const REENGAGEMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export interface ReengagementRetentionResult {
  receiptsDeleted: number;
  snapshotsDeleted: number;
  episodesCompacted: number;
}

/** Grupo da manutenção diária: só metadados, nunca mensagens ou consumo do despacho. */
export async function purgeReengagementMetadata(
  now: Date, options: { database?: Pick<typeof db, "transaction"> } = {},
): Promise<ReengagementRetentionResult> {
  if (!Number.isFinite(now.getTime())) throw new Error("invalid clock");
  const cutoff = new Date(now.getTime() - REENGAGEMENT_RETENTION_MS);
  return (options.database ?? db).transaction(async (tx) => {
    // Mesma ordem dos writers de inbound/reset/aceite. Releitura após o lock
    // impede compactar uma ponte que ganhou continuidade enquanto esperava.
    const owners = await tx.select().from(leads).where(sql`exists (
      select 1 from ${reengagementEpisodes} e where e.tenant_id = ${leads.tenantId} and e.lead_id = ${leads.id}
    )`).orderBy(asc(leads.id)).for("update");
    let episodesCompacted = 0;
    for (const lead of owners) {
      const episodes = await tx.select().from(reengagementEpisodes)
        .where(and(eq(reengagementEpisodes.tenantId, lead.tenantId), eq(reengagementEpisodes.leadId, lead.id))).orderBy(asc(reengagementEpisodes.id)).for("update");
      const [agent] = await tx.select().from(leadAgentState).where(and(eq(leadAgentState.tenantId, lead.tenantId), eq(leadAgentState.leadId, lead.id)));
      const [channel] = lead.whatsappPhoneNumberId ? await tx.select().from(whatsappChannels)
        .where(and(eq(whatsappChannels.tenantId, lead.tenantId), eq(whatsappChannels.phoneNumberId, lead.whatsappPhoneNumberId))) : [];
      const rows = await tx.select({ id: messages.id, sender: messages.sender, sentAt: messages.sentAt, phoneNumberId: messages.whatsappPhoneNumberId, conversationId: messages.conversationId })
        .from(messages).innerJoin(conversations, and(eq(conversations.tenantId, messages.tenantId), eq(conversations.id, messages.conversationId)))
        .where(and(eq(messages.tenantId, lead.tenantId), eq(conversations.leadId, lead.id))).orderBy(messages.sentAt, messages.id);
      const current = rows.filter((message) => message.sender === "lead").at(-1);
      for (const episode of episodes) {
        const update: Partial<typeof reengagementEpisodes.$inferInsert> = {};
        const completed = episode.state !== "preparing" || !episode.claimExpiresAt || episode.claimExpiresAt <= now;
        if (completed && (episode.claimToken || episode.preparedAt)) Object.assign(update, { claimToken: null, claimExpiresAt: null, preparedAt: null });
        // Uncertain sem identidade termina ao vencer o prazo. Um aceite já
        // conhecido conserva o texto até conseguir gravar a mensagem no CRM.
        const needsText = episode.state === "accepted_pending_record" || (episode.state === "authorized" && !!episode.dispatchCompletionDeadline && episode.dispatchCompletionDeadline > now)
          || (episode.state === "uncertain" && !!episode.wamid && !!episode.acceptedAt);
        if (episode.submittedText && !needsText && completed) update.submittedText = null;
        if (episode.createdAt <= cutoff) {
          const anchor = rows.find((item) => item.id === episode.anchorMessageId), first = rows.find((item) => item.id === episode.firstInboundMessageId);
          const start = rows.find((item) => item.id === episode.originSessionStartMessageId), end = rows.find((item) => item.id === episode.originSessionEndMessageId);
          const output = rows.find((item) => item.id === episode.messageId);
          const active = episode.state === "accepted" && !episode.bridgeInvalidatedAt && !!episode.dispatchAuthorizedAt
            && lead.status === "em_qualificacao" && !lead.optedOutAt && !lead.humanTakeoverAt && !!channel?.ownershipVerifiedAt
            && channel.phoneNumberId === episode.phoneNumberId && agent?.anchorMessageId === current?.id && agent?.phase !== "encerrada"
            && agent?.resetObservedAt?.getTime() === lead.memoryResetRequestedAt?.getTime()
            && episode.resetObservedAt?.getTime() === lead.memoryResetRequestedAt?.getTime()
            && !!anchor && !!first && !!start && !!end && !!current && !!output && output.sender === "agente"
            && [anchor, first, start, end, current, output].every((item) => item.phoneNumberId === channel.phoneNumberId && item.conversationId === current.conversationId)
            && anchor.sender === "lead" && first.sender === "lead" && anchor.sentAt.getTime() === episode.anchorSentAt.getTime()
            && start.sentAt <= anchor.sentAt && end.sentAt >= anchor.sentAt && first.sentAt > anchor.sentAt
            && first.sentAt.getTime() < anchor.sentAt.getTime() + 48 * 3600000
            && (!lead.memoryResetRequestedAt || start.sentAt >= lead.memoryResetRequestedAt)
            && !!episode.bridgeLastInboundAt && episode.bridgeLastInboundAt.getTime() === current.sentAt.getTime()
            && episode.bridgeLastInboundAt >= first.sentAt && !isSessionExpired(episode.bridgeLastInboundAt.toISOString(), now.toISOString());
          if (!active) {
            if (episode.messageId || episode.originSessionStartMessageId || episode.originSessionEndMessageId || episode.firstInboundMessageId || episode.bridgeLastInboundAt) {
              Object.assign(update, { messageId: null, originSessionStartMessageId: null, originSessionEndMessageId: null, firstInboundMessageId: null, bridgeLastInboundAt: null });
            }
            if (!episode.bridgeInvalidatedAt) Object.assign(update, { bridgeInvalidatedAt: now, bridgeRevision: episode.bridgeRevision + 1 });
          }
        }
        if (Object.keys(update).length) {
          await tx.update(reengagementEpisodes).set(update).where(and(eq(reengagementEpisodes.tenantId, lead.tenantId), eq(reengagementEpisodes.id, episode.id)));
          episodesCompacted++;
        }
      }
    }
    // Analytics trava canal antes do período. Usa limites civis já persistidos,
    // sem fabricar mês UTC nem apagar o snapshot corrente por estar stale.
    const channels = await tx.select().from(whatsappChannels).where(sql`${whatsappChannels.usageSyncDeadline} <= ${now} or exists (
      select 1 from ${whatsappUsage} u where u.tenant_id = ${whatsappChannels.tenantId} and u.phone_number_id = ${whatsappChannels.phoneNumberId} and u.expires_at <= ${now}
    )`).orderBy(asc(whatsappChannels.id)).for("update");
    let snapshotsDeleted = 0;
    for (const channel of channels) {
      if (channel.usageSyncDeadline && channel.usageSyncDeadline <= now) {
        await tx.update(whatsappChannels).set({ usageSyncToken: null, usageSyncDeadline: null }).where(eq(whatsappChannels.id, channel.id));
      }
      const leaseFinished = sql`(${channel.usageSyncToken}::uuid is null or ${whatsappUsage.responseToken} is distinct from ${channel.usageSyncToken}::uuid or ${channel.usageSyncDeadline}::timestamptz <= ${now})`;
      await tx.update(whatsappUsage).set({ responseToken: null }).where(and(eq(whatsappUsage.tenantId, channel.tenantId), eq(whatsappUsage.phoneNumberId, channel.phoneNumberId), leaseFinished));
      const removed = await tx.delete(whatsappUsage).where(and(eq(whatsappUsage.tenantId, channel.tenantId), eq(whatsappUsage.phoneNumberId, channel.phoneNumberId), lte(whatsappUsage.expiresAt, now),
        sql`(${whatsappUsage.configurationRevision} <> ${channel.configurationRevision} or ${whatsappUsage.monthEnd} <= ${now})`,
        leaseFinished))
        .returning({ monthStart: whatsappUsage.monthStart });
      snapshotsDeleted += removed.length;
    }
    // Ingestão de status trava canal antes do receipt, não inverter essa ordem.
    const receipts = await tx.delete(whatsappMessageReceipts).where(and(isNull(whatsappMessageReceipts.messageId), lte(whatsappMessageReceipts.orphanExpiresAt, now), lte(whatsappMessageReceipts.firstSeenAt, cutoff)))
      .returning({ wamid: whatsappMessageReceipts.wamid });
    return { receiptsDeleted: receipts.length, snapshotsDeleted, episodesCompacted };
  });
}
