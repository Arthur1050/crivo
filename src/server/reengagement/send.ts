import "server-only";
import { and, eq } from "drizzle-orm";
import { toWhatsAppMsisdn } from "../../../n8n/src/phone.mjs";
import { db } from "../../db";
import { leads, reengagementEpisodes, whatsappChannels } from "../../db/schema";
import type { AuthResult } from "../integration/auth";
import { sendProactiveWhatsAppText, validateProactiveWhatsAppText, type CloudApiDependencies, type ProactiveCloudApiResult } from "../whatsapp/cloud-api";
import { authorizeDispatch, reconcileAcceptance, releasePreparationFailure } from "./repository";

type Episode = typeof reengagementEpisodes.$inferSelect;
type Database = Pick<typeof db, "select" | "transaction">;
export type SendPreparedEpisodeResult =
  | { ok: true; episodeId: string; state: Episode["state"]; replay: boolean; wamid?: string; acceptedAt?: Date; messageId?: string }
  | { ok: false; reason: string; policyReason?: string };
export type SendPreparedEpisodeOptions = CloudApiDependencies & { database?: Database; now?: () => Date };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function factual(episode: Episode, replay: boolean): SendPreparedEpisodeResult {
  return { ok: true, episodeId: episode.id, state: episode.state, replay,
    ...(episode.wamid ? { wamid: episode.wamid } : {}),
    ...(episode.acceptedAt ? { acceptedAt: episode.acceptedAt } : {}),
    ...(episode.messageId ? { messageId: episode.messageId } : {}) };
}

/** Updates evidence only. Never releases dispatch, overwrites an ack, or extends its deadline. */
async function recordOutcome(context: AuthResult, leadId: string, episodeId: string,
  result: ProactiveCloudApiResult | "abandoned", database: Database, now: () => Date): Promise<Episode | null> {
  return database.transaction(async (tx) => {
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.tenantId, context.tenantId), eq(leads.id, leadId))).for("update");
    if (!lead) return null;
    const [episode] = await tx.select().from(reengagementEpisodes).where(and(eq(reengagementEpisodes.tenantId, context.tenantId),
      eq(reengagementEpisodes.leadId, leadId), eq(reengagementEpisodes.id, episodeId))).for("update");
    if (!episode?.dispatchAuthorizedAt || !["authorized", "uncertain"].includes(episode.state)) return episode ?? null;
    const timestamp = now();
    if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime())) return episode;
    if (episode.wamid) return episode;
    if (result === "abandoned") {
      if (episode.wamid || !episode.dispatchCompletionDeadline || episode.dispatchCompletionDeadline.getTime() > timestamp.getTime()) return episode;
    }
    const update = result !== "abandoned" && result.outcome === "accepted"
      ? { state: "accepted_pending_record" as const, wamid: result.wamid, acceptedAt: result.acceptedAt, reasonCode: null }
      : result !== "abandoned" && result.outcome === "refused"
        ? { state: "refused" as const, reasonCode: `meta-refused:${result.metaCode}` }
        : { state: "uncertain" as const, reasonCode: result === "abandoned" ? "dispatch-abandoned"
          : result.outcome === "not_called" ? "transport-not-called" : result.outcome === "uncertain" ? result.reason : "transport-failure" };
    const [updated] = await tx.update(reengagementEpisodes).set({ ...update, updatedAt: timestamp })
      .where(eq(reengagementEpisodes.id, episodeId)).returning();
    return updated;
  });
}

/** Only the winner of authorizeDispatch may invoke transport. Replays only read/reconcile facts. */
export async function sendPreparedEpisode(context: AuthResult, leadId: string, episodeId: string,
  input: { claimToken: string; text: string }, options: SendPreparedEpisodeOptions = {}): Promise<SendPreparedEpisodeResult> {
  const { tenantId } = context;
  if (!UUID.test(leadId) || !UUID.test(episodeId)) return { ok: false, reason: "invalid-input" };
  const database = options.database ?? db, now = options.now ?? (() => new Date()), fetch = options.fetch;
  const { claimToken, text } = input;
  const [lead] = await database.select({ externalId: leads.externalId }).from(leads).where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)));
  if (!lead) return { ok: false, reason: "lead-not-found" };
  const [episode] = await database.select().from(reengagementEpisodes).where(and(eq(reengagementEpisodes.tenantId, tenantId),
    eq(reengagementEpisodes.leadId, leadId), eq(reengagementEpisodes.id, episodeId)));
  if (!episode) return { ok: false, reason: "episode-not-found" };
  if (episode.dispatchAuthorizedAt || episode.state !== "preparing") {
    if (episode.state === "authorized" && !episode.wamid) {
      const refreshed = await recordOutcome(context, leadId, episodeId, "abandoned", database, now);
      return factual(refreshed ?? episode, true);
    }
    return factual(episode, true);
  }
  if (typeof claimToken !== "string" || !UUID.test(claimToken)) return { ok: false, reason: "invalid-input" };
  const [channel] = await database.select({ configurationRevision: whatsappChannels.configurationRevision }).from(whatsappChannels)
    .where(and(eq(whatsappChannels.tenantId, tenantId), eq(whatsappChannels.phoneNumberId, episode.phoneNumberId)));
  const body = typeof text === "string" ? text.trim() : "", destination = toWhatsAppMsisdn(lead.externalId);
  const preflight = validateProactiveWhatsAppText({ phoneNumberId: episode.phoneNumberId, to: destination ?? "", body });
  if (!preflight.ok) {
    const release = await releasePreparationFailure(context, leadId, episodeId, { claimToken,
      code: preflight.failure === "texto-invalido" ? "invalid-text" : "context-read-failed" }, { database, now });
    return release.ok ? { ok: false, reason: preflight.failure } : release;
  }
  const authorization = await authorizeDispatch(context, leadId, episodeId, { claimToken, text: body },
    { expectedChannelRevision: channel?.configurationRevision, database, now });
  if (!authorization.ok) return authorization;
  if (!authorization.authorized) return { ok: true, episodeId, state: authorization.state, replay: true };
  let result: ProactiveCloudApiResult;
  try {
    result = await sendProactiveWhatsAppText({ phoneNumberId: authorization.phoneNumberId, to: authorization.destination, body: authorization.text }, { fetch, clock: now });
  } catch {
    result = { outcome: "uncertain", reason: "transport-failure" };
  }
  if (result.outcome === "accepted") {
    try {
      const evidence = await recordOutcome(context, leadId, episodeId, result, database, now);
      const recorded = await reconcileAcceptance(context, leadId, episodeId, { wamid: result.wamid, acceptedAt: result.acceptedAt }, { database, now });
      if (!recorded.ok && recorded.reason === "identity-conflict") return recorded;
      if (recorded.ok && recorded.recorded) return { ok: true, episodeId, state: "accepted", replay: false,
        wamid: evidence?.wamid ?? result.wamid, acceptedAt: evidence?.acceptedAt ?? result.acceptedAt, messageId: recorded.messageId };
      if (evidence?.state === "accepted") return factual(evidence, false);
    } catch {
      // Return transport facts for acknowledgement; never invoke transport again.
    }
    return { ok: true, episodeId, state: "accepted_pending_record", replay: false, wamid: result.wamid, acceptedAt: result.acceptedAt };
  }
  try {
    const updated = await recordOutcome(context, leadId, episodeId, result, database, now);
    if (updated) return factual(updated, false);
  } catch {
    // The permanent marker still prevents replay even when evidence storage fails.
  }
  return { ok: true, episodeId, state: "uncertain", replay: false };
}
