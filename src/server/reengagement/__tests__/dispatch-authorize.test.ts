import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels } from "../../../db/schema";
import { authorizeDispatch, claimPreparation, releasePreparationFailure } from "../repository";

const tenantId = randomUUID(), foreignTenant = randomUUID(), now = new Date("2026-10-06T15:00:00Z"), hour = 3600000;
let contact = 5534999300000;
async function fixture(silence = 22 * hour, clock = now) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  const [channel] = await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: clock, usageEnabled: false }).returning();
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T20", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: clock, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Inbound próprio", sentAt: new Date(clock.getTime() - silence), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const claim = await claimPreparation({ tenantId }, lead.id, { anchorMessageId: anchor.id }, { now: () => clock });
  if (!claim.ok || !claim.acquired) throw new Error("Fixture sem claim adquirida");
  return { lead, channel, conversation, anchor, ...claim };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function authorize(row: Fixture, text = "Retomada sintética", clock = now, options: Parameters<typeof authorizeDispatch>[4] = {}) {
  return authorizeDispatch({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text }, { expectedChannelRevision: row.channel.configurationRevision, now: () => clock, ...options });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema });
  return { transaction: (callback, config) => database.transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
}
async function waitForLocks(pids: number[], count: number) {
  let waiting = 0;
  for (let attempt = 0; attempt < 100 && waiting < count; attempt++) {
    waiting = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting;
    if (waiting < count) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return waiting;
}
beforeAll(async () => { await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T20", agentName: "Agente", supportedModality: "ambos" as const }))); });
afterAll(async () => {
  await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId));
  await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId)); await db.delete(messages).where(eq(messages.tenantId, tenantId));
  await db.delete(conversations).where(eq(conversations.tenantId, tenantId)); await db.delete(leads).where(eq(leads.tenantId, tenantId));
  await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.$client.end();
});

describe("T20 — autorização permanente de uma chamada", () => {
  it("persiste exatamente o texto submetido e marker antes de devolver permissão", async () => {
    const row = await fixture(), before = await episode(row), result = await authorize(row, "  Retomada sintética  ");
    expect(result).toEqual({ ok: true, authorized: true, episodeId: row.episodeId, text: "Retomada sintética", phoneNumberId: row.channel.phoneNumberId,
      destination: row.lead.externalId, dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) });
    expect(await episode(row)).toEqual({ ...before, state: "authorized", submittedText: "Retomada sintética", dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) });
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(row.lead);
    expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).toEqual([row.anchor]);
  });

  it.each(["", " \n\t ", "😀".repeat(2048) + "x"])("texto inválido %# não altera claim", async (text) => {
    const row = await fixture(), before = await episode(row);
    expect(await authorize(row, text)).toEqual({ ok: false, reason: "invalid-text" }); expect(await episode(row)).toEqual(before);
  });
  it("4096 unidades UTF-16 autorizam integralmente, sem divisão", async () => {
    const row = await fixture(), text = "😀".repeat(2048);
    expect(await authorize(row, text)).toMatchObject({ ok: true, authorized: true, text });
    expect((await episode(row)).submittedText).toBe(text);
  });

  it("snapshot interno ausente/inválido e input inválido falham fechados", async () => {
    const row = await fixture(), before = await episode(row);
    for (const expectedChannelRevision of [undefined, 0, 1.5]) expect(await authorize(row, "Texto", now, { expectedChannelRevision })).toEqual({ ok: false, reason: "invalid-channel-snapshot" });
    expect(await authorizeDispatch({ tenantId }, row.lead.id, "inválido", { claimToken: row.claimToken, text: "Texto" })).toEqual({ ok: false, reason: "invalid-input" });
    expect(await episode(row)).toEqual(before);
  });
  it("token antigo não consome claim substituída", async () => {
    const row = await fixture(), replacement = randomUUID();
    await db.update(reengagementEpisodes).set({ claimToken: replacement }).where(eq(reengagementEpisodes.id, row.episodeId));
    const before = await episode(row);
    expect(await authorize(row)).toEqual({ ok: false, reason: "claim-conflict" }); expect(await episode(row)).toEqual(before);
  });
  it.each([300000, 300001])("lease vencida %sms não autoriza", async (elapsed) => {
    const row = await fixture(), before = await episode(row);
    expect(await authorize(row, "Texto", new Date(now.getTime() + elapsed))).toEqual({ ok: false, reason: "claim-expired" }); expect(await episode(row)).toEqual(before);
  });
  it("lease válida em 4:59.999 autoriza com deadline do instante vivo", async () => {
    const row = await fixture(), clock = new Date(now.getTime() + 299999);
    expect(await authorize(row, "Texto", clock)).toMatchObject({ ok: true, authorized: true, dispatchAuthorizedAt: clock, dispatchCompletionDeadline: new Date(clock.getTime() + 120000) });
  });

  it.each(["inbound", "reset", "optout", "takeover", "phase", "unknown", "revision", "pipeline"])("mudança %s antes da autorização cancela", async (change) => {
    const row = await fixture();
    if (change === "inbound") await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "lead", content: "Inbound novo", sentAt: now, whatsappPhoneNumberId: row.channel.phoneNumberId });
    if (change === "reset") { await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id)); await db.update(leadAgentState).set({ resetObservedAt: now }).where(eq(leadAgentState.leadId, row.lead.id)); }
    if (change === "optout") await db.update(leads).set({ optedOutAt: now }).where(eq(leads.id, row.lead.id));
    if (change === "takeover") await db.update(leads).set({ humanTakeoverAt: now }).where(eq(leads.id, row.lead.id));
    if (change === "phase") await db.update(leadAgentState).set({ phase: "encerrada" }).where(eq(leadAgentState.leadId, row.lead.id));
    if (change === "unknown") await db.update(leadAgentState).set({ phase: null }).where(eq(leadAgentState.leadId, row.lead.id));
    if (change === "revision") await db.update(leadAgentState).set({ revision: 2 }).where(eq(leadAgentState.leadId, row.lead.id));
    if (change === "pipeline") await db.update(leads).set({ status: "qualificado_agendado", statusChangedBy: "humano" }).where(eq(leads.id, row.lead.id));
    const beforeLead = (await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0];
    expect(await authorize(row)).toEqual(["inbound", "reset", "revision"].includes(change) ? { ok: false, reason: "context-changed" } : { ok: false, reason: "not-eligible", policyReason: change === "unknown" ? "unknown-data" : "ineligible" });
    expect(await episode(row)).toMatchObject({ state: "cancelled", dispatchAuthorizedAt: null, dispatchCompletionDeadline: null, submittedText: null, claimToken: null, claimExpiresAt: null });
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(beforeLead);
  });

  it.each(["revision", "ownership", "identity", "anchor"])("canal mudou %s cancela sem marker", async (change) => {
    const row = await fixture();
    if (change === "revision") await db.update(whatsappChannels).set({ configurationRevision: 2 }).where(eq(whatsappChannels.id, row.channel.id));
    if (change === "ownership") await db.update(whatsappChannels).set({ ownershipVerifiedAt: null }).where(eq(whatsappChannels.id, row.channel.id));
    if (change === "identity") await db.update(leads).set({ whatsappPhoneNumberId: null }).where(eq(leads.id, row.lead.id));
    if (change === "anchor") await db.update(messages).set({ whatsappPhoneNumberId: null }).where(eq(messages.id, row.anchor.id));
    expect(await authorize(row)).toEqual({ ok: false, reason: "context-changed" });
    expect(await episode(row)).toMatchObject({ state: "cancelled", dispatchAuthorizedAt: null, submittedText: null });
  });
  it("24h exatas durante geração omitem sem autorizar mesmo com lease válida", async () => {
    const row = await fixture(24 * hour - 60000), clock = new Date(now.getTime() + 60000);
    expect(await authorize(row, "Texto", clock)).toEqual({ ok: false, reason: "not-eligible", policyReason: "window-closed" });
    expect(await episode(row)).toMatchObject({ state: "omitted", reasonCode: "window-closed", dispatchAuthorizedAt: null, submittedText: null });
  });
  it("fim comercial exato depois da geração impede autorização", async () => {
    const clock = new Date("2026-10-06T20:59:59.999Z"), row = await fixture(22 * hour, clock);
    expect(await authorize(row, "Texto", new Date(clock.getTime() + 1))).toEqual({ ok: false, reason: "not-eligible", policyReason: "outside-contact-hours" });
    expect(await episode(row)).toMatchObject({ state: "preparing", dispatchAuthorizedAt: null, submittedText: null });
  });
  it("saídas/out-of-order não substituem âncora inbound autoritativa", async () => {
    const row = await fixture();
    await db.insert(messages).values([{ tenantId, conversationId: row.conversation.id, sender: "agente", content: "Saída", sentAt: now },
      { tenantId, conversationId: row.conversation.id, sender: "lead", content: "Inbound atrasado", sentAt: new Date(row.anchor.sentAt.getTime() - 1) }]);
    expect(await authorize(row)).toMatchObject({ ok: true, authorized: true });
    expect(await episode(row)).toMatchObject({ anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt });
  });
  it("crash/replay/mudança posterior nunca liberam marker nem retornam segundo payload", async () => {
    const row = await fixture(); expect(await authorize(row)).toMatchObject({ ok: true, authorized: true });
    const before = await episode(row);
    await db.update(leads).set({ memoryResetRequestedAt: now, optedOutAt: now }).where(eq(leads.id, row.lead.id));
    expect(await authorize(row, "Texto diferente", new Date(now.getTime() + 600000))).toEqual({ ok: true, authorized: false, episodeId: row.episodeId, state: "authorized" });
    expect(await releasePreparationFailure({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, code: "generation-failed" }, { now: () => now })).toEqual({ ok: false, reason: "episode-consumed" });
    expect(await episode(row)).toEqual(before);
  });
  it("tenant/lead/episódio alheios não autorizam", async () => {
    const row = await fixture(), other = await fixture(), before = await episode(row);
    expect(await authorizeDispatch({ tenantId: foreignTenant }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text: "Texto" }, { expectedChannelRevision: 1 })).toEqual({ ok: false, reason: "lead-not-found" });
    expect(await authorizeDispatch({ tenantId }, other.lead.id, row.episodeId, { claimToken: row.claimToken, text: "Texto" }, { expectedChannelRevision: 1 })).toEqual({ ok: false, reason: "episode-not-found" });
    expect(await episode(row)).toEqual(before);
  });
  it("rollback pós-update desfaz marker e permite autorização real seguinte", async () => {
    const row = await fixture(), before = await episode(row);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(authorize(row, "Texto", now, { database })).rejects.toThrow("fixture-rollback"); expect(await episode(row)).toEqual(before);
    expect(await authorize(row)).toMatchObject({ ok: true, authorized: true });
  });

  it("duas transações realmente esperam lead; uma transição autoriza e o replay não", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(), readClock = vi.fn(() => now); let pending: ReturnType<typeof authorizeDispatch>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = [a, b].map((client, index) => authorize(row, index ? "Texto B" : "Texto A", now, { now: readClock, database: pinned(client, index ? pidB : pidA) }));
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]);
      expect(await waitForLocks(pids, 2)).toBe(2); expect(readClock).not.toHaveBeenCalled(); await blocker.query("COMMIT");
      const results = await Promise.all(pending), winner = results.find((result) => result.ok && result.authorized);
      expect(results.filter((result) => result.ok && result.authorized)).toHaveLength(1);
      expect(results.filter((result) => result.ok && !result.authorized)).toEqual([{ ok: true, authorized: false, episodeId: row.episodeId, state: "authorized" }]);
      if (!winner?.ok || !winner.authorized) throw new Error("Vencedor ausente");
      expect(winner).toEqual({ ok: true, authorized: true, episodeId: row.episodeId, text: results[0].ok && results[0].authorized ? "Texto A" : "Texto B",
        phoneNumberId: row.channel.phoneNumberId, destination: row.lead.externalId, dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) });
      expect(await episode(row)).toMatchObject({ state: "authorized", submittedText: winner.text, dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000), claimToken: row.claimToken });
      expect(readClock).toHaveBeenCalledTimes(1);
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });
  it("espera pelo episódio cruza 24h; clock após locks omite em vez de autorizar", async () => {
    const row = await fixture(24 * hour - 1), blocker = await db.$client.connect(), client = await db.$client.connect(), pid = deferred<number>();
    let clock = now; const readClock = vi.fn(() => clock); let pending: ReturnType<typeof authorizeDispatch> | undefined;
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM reengagement_episodes WHERE id=$1 FOR UPDATE", [row.episodeId]);
      pending = authorize(row, "Texto", now, { now: readClock, database: pinned(client, pid) });
      expect(await waitForLocks([await pid.promise], 1)).toBe(1); expect(readClock).not.toHaveBeenCalled();
      await blocker.query("SAVEPOINT lock_order");
      await expect(blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE NOWAIT", [row.lead.id])).rejects.toMatchObject({ code: "55P03" });
      await blocker.query("ROLLBACK TO SAVEPOINT lock_order");
      clock = new Date(now.getTime() + 1); await blocker.query("COMMIT");
      expect(await pending).toEqual({ ok: false, reason: "not-eligible", policyReason: "window-closed" });
      expect(await episode(row)).toMatchObject({ state: "omitted", dispatchAuthorizedAt: null, submittedText: null, updatedAt: clock });
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); client.release(); }
  });
});
