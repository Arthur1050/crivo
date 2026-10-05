import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, lte, or } from "drizzle-orm";
import { db } from "../../db";
import { reengagementEpisodes, whatsappChannels } from "../../db/schema";
import type { AuthResult } from "../integration/auth";
import { reconcileAcceptance } from "./repository";

export async function listAutomationChannels(auth: AuthResult) {
  return db.select({ phoneNumberId: whatsappChannels.phoneNumberId }).from(whatsappChannels)
    .where(and(eq(whatsappChannels.tenantId, auth.tenantId), eq(whatsappChannels.usageEnabled, true))).orderBy(asc(whatsappChannels.phoneNumberId));
}

/** Repair only durable acceptance/abandoned authorization. No transport is imported. */
export async function reconcileAutomationTick(auth: AuthResult, options: { now?: () => Date; pageSize?: number } = {}) {
  const cutoff = (options.now ?? (() => new Date()))(), size = options.pageSize ?? 100;
  if (!Number.isFinite(cutoff.getTime()) || !Number.isInteger(size) || size < 1 || size > 100) throw new Error("reconciliation-unavailable");
  let cursor: string | undefined, recorded = 0, uncertain = 0, failed = 0;
  for (;;) {
    const rows = await db.select({ id: reengagementEpisodes.id, leadId: reengagementEpisodes.leadId }).from(reengagementEpisodes)
      .where(and(eq(reengagementEpisodes.tenantId, auth.tenantId), inArray(reengagementEpisodes.state, ["authorized", "accepted_pending_record", "uncertain"]),
        or(and(isNotNull(reengagementEpisodes.wamid), isNotNull(reengagementEpisodes.acceptedAt)),
          and(inArray(reengagementEpisodes.state, ["authorized", "accepted_pending_record"]), lte(reengagementEpisodes.dispatchCompletionDeadline, cutoff))),
        ...(cursor ? [gt(reengagementEpisodes.id, cursor)] : []))).orderBy(asc(reengagementEpisodes.id)).limit(size);
    for (const row of rows) {
      try {
        const result = await reconcileAcceptance(auth, row.leadId, row.id, {}, { now: () => cutoff, resolveAbandoned: true });
        if (!result.ok) failed++; else if (result.recorded) recorded++; else if (result.state === "uncertain") uncertain++;
      } catch { failed++; }
    }
    if (rows.length < size) break;
    cursor = rows.at(-1)!.id;
  }
  return { recorded, uncertain, failed };
}
