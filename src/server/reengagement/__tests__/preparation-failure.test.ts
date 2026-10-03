import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels } from "../../../db/schema";
import { claimPreparation, releasePreparationFailure, type PreparationFailureCode } from "../repository";

const tenantId = randomUUID(), foreignTenant = randomUUID();
const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
const now = new Date("2026-10-06T15:00:00Z"), lease = 300000;
let contact = 5534999200000;
async function fixture() {
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T19", phone: "+5534900000000", externalId: String(contact++),
    status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Fixture própria T19",
    sentAt: new Date(now.getTime() - 22 * 3600000), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const result = await claimPreparation({ tenantId }, lead.id, { anchorMessageId: anchor.id }, { now: () => now });
  if (!result.ok || !result.acquired) throw new Error("Fixture sem claim");
  return { lead, conversation, anchor, ...result };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function episode(row: Fixture) { return db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)); }
function release(row: Fixture, code: PreparationFailureCode = "generation-failed", clock = now) {
  return releasePreparationFailure({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, code }, { now: () => clock });
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T19", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now, usageEnabled: false });
});
afterAll(async () => {
  await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId));
  await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId));
  await db.delete(messages).where(eq(messages.tenantId, tenantId));
  await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId));
  await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant));
  await db.$client.end();
});

describe("T19 — falha comprovada antes do despacho", () => {
  it.each(["generation-failed", "generation-timeout", "context-read-failed", "invalid-text"] as const)("libera %s sem alterar lead/inbound; próximo tick pode preparar", async (code) => {
    const row = await fixture(), before = await episode(row);
    expect(await release(row, code)).toEqual({ ok: true, released: true, episodeId: row.episodeId });
    expect(await episode(row)).toEqual([{ ...before[0], claimToken: null, claimExpiresAt: null, submittedText: null, reasonCode: code, updatedAt: now }]);
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(row.lead);
    expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).toEqual([row.anchor]);
    const next = await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => now });
    expect(next).toMatchObject({ ok: true, acquired: true, episodeId: row.episodeId });
    if (!next.ok || !next.acquired) throw new Error("Próximo tick não adquiriu");
    expect(next.claimToken).not.toBe(row.claimToken);
    expect(await episode(row)).toEqual([{ ...before[0], claimToken: next.claimToken, reasonCode: null }]);
  });
  it("replay da falha é inofensivo e não libera nova claim", async () => {
    const row = await fixture(); expect(await release(row)).toEqual({ ok: true, released: true, episodeId: row.episodeId });
    const before = await episode(row);
    expect(await release(row)).toEqual({ ok: false, reason: "claim-conflict" });
    expect(await episode(row)).toEqual(before);
    const next = await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => now });
    expect(next).toMatchObject({ ok: true, acquired: true });
    const reacquired = await episode(row);
    expect(await release(row)).toEqual({ ok: false, reason: "claim-conflict" });
    expect(await episode(row)).toEqual(reacquired);
  });
  it("liberar falha não permite preparar depois de fechar a janela", async () => {
    const row = await fixture();
    expect(await release(row)).toEqual({ ok: true, released: true, episodeId: row.episodeId });
    const before = await episode(row);
    expect(await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => new Date(now.getTime() + 2 * 3600000) }))
      .toEqual({ ok: false, reason: "not-eligible", policyReason: "window-closed" });
    expect(await episode(row)).toEqual(before);
  });
  it.each([lease - 1, lease, lease + 1])("validade %sms exige lease estritamente viva", async (elapsed) => {
    const row = await fixture(), before = await episode(row), clock = new Date(now.getTime() + elapsed);
    expect(await release(row, "invalid-text", clock)).toEqual(elapsed < lease
      ? { ok: true, released: true, episodeId: row.episodeId } : { ok: false, reason: "claim-expired" });
    expect(await episode(row)).toEqual(elapsed < lease
      ? [{ ...before[0], claimToken: null, claimExpiresAt: null, reasonCode: "invalid-text", updatedAt: clock }] : before);
  });
  it.each(["authorized", "uncertain", "cancelled"] as const)("não libera estado %s nem marker", async (state) => {
    const row = await fixture();
    await db.update(reengagementEpisodes).set({ state, ...(state !== "cancelled" ? { dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) } : {}) })
      .where(eq(reengagementEpisodes.id, row.episodeId));
    const before = await episode(row);
    expect(await release(row)).toEqual({ ok: false, reason: "episode-consumed" });
    expect(await episode(row)).toEqual(before);
  });
  it("tenant/lead/episódio alheios não escrevem", async () => {
    const row = await fixture(), other = await fixture(), before = await episode(row);
    const input = { claimToken: row.claimToken, code: "generation-failed" as const };
    expect(await releasePreparationFailure({ tenantId: foreignTenant }, row.lead.id, row.episodeId, input)).toEqual({ ok: false, reason: "lead-not-found" });
    expect(await releasePreparationFailure({ tenantId }, other.lead.id, row.episodeId, input)).toEqual({ ok: false, reason: "episode-not-found" });
    expect(await releasePreparationFailure({ tenantId }, row.lead.id, randomUUID(), input)).toEqual({ ok: false, reason: "episode-not-found" });
    expect(await episode(row)).toEqual(before);
  });
  it.each([{ claimToken: "inválido", code: "generation-failed" }, { claimToken: randomUUID(), code: "payload arbitrário" }])("entrada inválida não persiste código nem libera %#", async (input) => {
    const row = await fixture(), before = await episode(row);
    expect(await releasePreparationFailure({ tenantId }, row.lead.id, row.episodeId, input as { claimToken: string; code: PreparationFailureCode })).toEqual({ ok: false, reason: "invalid-input" });
    expect(await episode(row)).toEqual(before);
  });
  it("rollback conserva token e falha pode ser repetida", async () => {
    const row = await fixture(), before = await episode(row);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(releasePreparationFailure({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, code: "generation-failed" }, { now: () => now, database })).rejects.toThrow("fixture-rollback");
    expect(await episode(row)).toEqual(before);
    expect(await release(row)).toEqual({ ok: true, released: true, episodeId: row.episodeId });
  });
  it("worker antigo aguarda lock e não libera token substituído", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), client = await db.$client.connect();
    let resolvePid!: (pid: number) => void; const pidReady = new Promise<number>((resolve) => { resolvePid = resolve; });
    const database = drizzle(client, { schema });
    const pinned: Pick<typeof db, "transaction"> = { transaction: (callback, config) => database.transaction(async (tx) => {
      resolvePid((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx);
    }, config) };
    const readClock = vi.fn(() => now); let pending: ReturnType<typeof releasePreparationFailure> | undefined;
    try {
      await blocker.query("BEGIN");
      const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = releasePreparationFailure({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, code: "generation-failed" }, { database: pinned, now: readClock });
      const workerPid = await pidReady; expect(workerPid).not.toBe(blockerPid);
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        waiting = (await db.$client.query<{ waiting: boolean }>("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [workerPid])).rows[0]?.waiting === true;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true); expect(readClock).not.toHaveBeenCalled();
      const replacement = randomUUID();
      await blocker.query("UPDATE reengagement_episodes SET claim_token=$1 WHERE id=$2", [replacement, row.episodeId]);
      await blocker.query("COMMIT");
      expect(await pending).toEqual({ ok: false, reason: "claim-conflict" });
      expect((await episode(row))[0]).toMatchObject({ claimToken: replacement, claimExpiresAt: new Date(now.getTime() + lease), state: "preparing", reasonCode: null, dispatchAuthorizedAt: null });
      expect(readClock).not.toHaveBeenCalled();
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); client.release(); }
  });
});
