import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels } from "../../../db/schema";
import { claimPreparation } from "../repository";

const tenantId = randomUUID(), foreignTenant = randomUUID();
const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
const now = new Date("2026-10-06T15:00:00Z"), hour = 3600000, lease = 300000;
let contact = 5534999100000;
async function fixture(silence = 22 * hour, patch: Partial<typeof leads.$inferInsert> = {}) {
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T18", phone: "+5534900000000", externalId: String(contact++),
    status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId, ...patch }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Fixture própria T18",
    sentAt: new Date(now.getTime() - silence), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  return { lead, conversation, anchor };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function claim(row: Fixture, clock = now, database?: Pick<typeof db, "transaction">) {
  return claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => clock, database });
}
function episodes(row: Fixture) { return db.select().from(reengagementEpisodes).where(and(eq(reengagementEpisodes.tenantId, tenantId), eq(reengagementEpisodes.leadId, row.lead.id))); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema });
  return { transaction: (callback, config) => database.transaction(async (tx) => {
    pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid);
    return callback(tx);
  }, config) };
}
async function waitForLocks(pids: number[], count: number) {
  let waiting = 0;
  for (let attempt = 0; attempt < 100 && waiting < count; attempt++) {
    waiting = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting;
    if (waiting < count) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return waiting;
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture claim", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now, usageEnabled: false });
});
afterAll(async () => {
  await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId));
  await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId));
  await db.delete(messages).where(eq(messages.tenantId, tenantId));
  await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId));
  await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, foreignTenant));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant));
  await db.$client.end();
});

describe("T18 — claim exclusiva antes do despacho", () => {
  it("cria lease de cinco minutos com chave/projeção reais e preserva lead/inbound", async () => {
    const row = await fixture(); const result = await claim(row);
    expect(result).toMatchObject({ ok: true, acquired: true, claimExpiresAt: new Date(now.getTime() + lease), agentStateRevision: 1 });
    if (!result.ok || !result.acquired) throw new Error("Claim não adquirida");
    expect(result.claimToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(await episodes(row)).toEqual([expect.objectContaining({ id: result.episodeId, tenantId, leadId: row.lead.id, phoneNumberId,
      anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt, resetObservedAt: null, agentStateRevision: 1,
      state: "preparing", claimToken: result.claimToken, claimExpiresAt: new Date(now.getTime() + lease), preparedAt: now,
      dispatchAuthorizedAt: null, dispatchCompletionDeadline: null, submittedText: null, createdAt: now, updatedAt: now })]);
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(row.lead);
    expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).toEqual([row.anchor]);
  });

  it("reexecução com lease viva não retorna token nem modifica episódio", async () => {
    const row = await fixture(); expect(await claim(row)).toMatchObject({ ok: true, acquired: true });
    const before = await episodes(row);
    expect(await claim(row)).toEqual({ ok: false, reason: "lease-active" });
    expect(await episodes(row)).toEqual(before);
  });

  it.each([lease - 1, lease, lease + 1])("prazo %sms substitui token somente vencido", async (elapsed) => {
    const row = await fixture(); const first = await claim(row);
    expect(first).toMatchObject({ ok: true, acquired: true });
    if (!first.ok || !first.acquired) throw new Error("Claim inicial ausente");
    const before = await episodes(row), clock = new Date(now.getTime() + elapsed), second = await claim(row, clock);
    if (elapsed < lease) {
      expect(second).toEqual({ ok: false, reason: "lease-active" }); expect(await episodes(row)).toEqual(before);
    } else {
      expect(second).toMatchObject({ ok: true, acquired: true, episodeId: first.episodeId, claimExpiresAt: new Date(clock.getTime() + lease), agentStateRevision: 1 });
      if (!second.ok || !second.acquired) throw new Error("Lease vencida não adquirida");
      expect(second.claimToken).not.toBe(first.claimToken);
      expect(await episodes(row)).toEqual([{ ...before[0], claimToken: second.claimToken, claimExpiresAt: new Date(clock.getTime() + lease), preparedAt: clock, updatedAt: clock }]);
    }
  });

  it("preparação liberada sem lease pode adquirir token novo na mesma chave", async () => {
    const row = await fixture(); const first = await claim(row);
    expect(first).toMatchObject({ ok: true, acquired: true });
    if (!first.ok || !first.acquired) throw new Error("Claim inicial ausente");
    await db.update(reengagementEpisodes).set({ claimToken: null, claimExpiresAt: null }).where(eq(reengagementEpisodes.id, first.episodeId));
    const result = await claim(row);
    expect(result).toMatchObject({ ok: true, acquired: true, episodeId: first.episodeId });
    if (!result.ok || !result.acquired) throw new Error("Claim nova ausente");
    expect(result.claimToken).not.toBe(first.claimToken); expect(await episodes(row)).toHaveLength(1);
  });

  it.each(["uncertain", "cancelled", "omitted"] as const)("estado %s devolve existente sem token; reset não rearma", async (state) => {
    const row = await fixture();
    const [previous] = await db.insert(reengagementEpisodes).values({ tenantId, leadId: row.lead.id, phoneNumberId, anchorMessageId: row.anchor.id,
      anchorSentAt: row.anchor.sentAt, agentStateRevision: 1, state, ...(state === "uncertain" ? { dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) } : {}) }).returning();
    await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
    await db.update(leadAgentState).set({ resetObservedAt: now, revision: 2 }).where(eq(leadAgentState.leadId, row.lead.id));
    expect(await claim(row)).toEqual({ ok: true, acquired: false, episodeId: previous.id, state });
    expect(await episodes(row)).toEqual([previous]);
  });

  it("nova âncora real permite outra chave e mantém marker da anterior", async () => {
    const row = await fixture(23 * hour);
    const [previous] = await db.insert(reengagementEpisodes).values({ tenantId, leadId: row.lead.id, phoneNumberId, anchorMessageId: row.anchor.id,
      anchorSentAt: row.anchor.sentAt, agentStateRevision: 1, state: "uncertain", dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) }).returning();
    const [latest] = await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "lead", content: "Novo inbound real",
      sentAt: new Date(now.getTime() - 22 * hour), whatsappPhoneNumberId: phoneNumberId }).returning();
    await db.update(leadAgentState).set({ anchorMessageId: latest.id, revision: 2 }).where(eq(leadAgentState.leadId, row.lead.id));
    const result = await claim({ ...row, anchor: latest });
    expect(result).toMatchObject({ ok: true, acquired: true, agentStateRevision: 2 });
    expect(await episodes(row)).toHaveLength(2);
    expect((await episodes(row)).find((episode) => episode.id === previous.id)).toEqual(previous);
    expect((await episodes(row)).find((episode) => episode.anchorMessageId === latest.id)).toMatchObject({ state: "preparing", dispatchAuthorizedAt: null, anchorSentAt: latest.sentAt, agentStateRevision: 2 });
  });

  it("âncora antiga, outra lead ou reset não observado recusam sem criar episódio", async () => {
    const old = await fixture(), reset = await fixture(), other = await fixture();
    await db.insert(messages).values({ tenantId, conversationId: old.conversation.id, sender: "lead", content: "Chegou depois", sentAt: now, whatsappPhoneNumberId: phoneNumberId });
    await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, reset.lead.id));
    expect(await claim(old)).toEqual({ ok: false, reason: "context-changed" });
    expect(await claim(reset)).toEqual({ ok: false, reason: "context-changed" });
    expect(await claimPreparation({ tenantId }, other.lead.id, { anchorMessageId: old.anchor.id }, { now: () => now })).toEqual({ ok: false, reason: "context-changed" });
    for (const row of [old, reset, other]) expect(await episodes(row)).toEqual([]);
  });

  it.each([null, "encerrada"] as const)("fase %s não adquire", async (phase) => {
    const row = await fixture(); await db.update(leadAgentState).set({ phase }).where(eq(leadAgentState.leadId, row.lead.id));
    expect(await claim(row)).toEqual({ ok: false, reason: "not-eligible", policyReason: phase === null ? "unknown-data" : "ineligible" });
    expect(await episodes(row)).toEqual([]);
  });

  it.each([22 * hour - 1, 24 * hour, 48 * hour])("silêncio %sms impede aquisição", async (silence) => {
    const row = await fixture(silence);
    expect(await claim(row)).toEqual({ ok: false, reason: "not-eligible", policyReason: silence < 22 * hour ? "too-early" : silence === 24 * hour ? "window-closed" : "silence-expired" });
    expect(await episodes(row)).toEqual([]);
  });

  it("fora do horário não adquire lease", async () => {
    const row = await fixture(), midnight = new Date("2026-10-07T03:00:00Z");
    await db.update(messages).set({ sentAt: new Date(midnight.getTime() - 22 * hour) }).where(eq(messages.id, row.anchor.id));
    expect(await claim(row, midnight)).toEqual({ ok: false, reason: "not-eligible", policyReason: "outside-contact-hours" });
    expect(await episodes(row)).toEqual([]);
  });

  it.each([{ optedOutAt: now }, { humanTakeoverAt: now }, { status: "qualificado_agendado" as const }, { status: "escalado_humano" as const }])("condução/pipeline prevalece %#", async (patch) => {
    const row = await fixture(22 * hour, patch);
    expect(await claim(row)).toEqual({ ok: false, reason: "not-eligible", policyReason: "ineligible" });
    expect(await episodes(row)).toEqual([]);
  });

  it.each([null, "99999999999999999999999999999999"])("canal da âncora %s não herda lead", async (anchorPhone) => {
    const row = await fixture(); await db.update(messages).set({ whatsappPhoneNumberId: anchorPhone }).where(eq(messages.id, row.anchor.id));
    expect(await claim(row)).toEqual({ ok: false, reason: "not-eligible", policyReason: "unknown-data" });
    expect(await episodes(row)).toEqual([]);
  });

  it("canal ausente/alheio/sem ownership não adquire mesmo com âncora informada", async () => {
    const foreignPhone = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
    const untrustedPhone = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
    await db.insert(whatsappChannels).values([{ tenantId: foreignTenant, phoneNumberId: foreignPhone, ownershipVerifiedAt: now }, { tenantId, phoneNumberId: untrustedPhone }]);
    for (const phone of [null, foreignPhone, untrustedPhone]) {
      const row = await fixture(22 * hour, { whatsappPhoneNumberId: phone });
      await db.update(messages).set({ whatsappPhoneNumberId: phone }).where(eq(messages.id, row.anchor.id));
      expect(await claim(row)).toEqual({ ok: false, reason: "not-eligible", policyReason: "unknown-data" });
      expect(await episodes(row)).toEqual([]);
    }
  });

  it("tenant alheio e âncora inválida recusam sem escrever", async () => {
    const row = await fixture();
    expect(await claimPreparation({ tenantId: foreignTenant }, row.lead.id, { anchorMessageId: row.anchor.id })).toEqual({ ok: false, reason: "lead-not-found" });
    expect(await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: "inválido" })).toEqual({ ok: false, reason: "invalid-anchor" });
    expect(await episodes(row)).toEqual([]);
  });

  it("rollback após insert não deixa lease nem bloqueia nova aquisição", async () => {
    const row = await fixture();
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(claim(row, now, database)).rejects.toThrow("fixture-rollback");
    expect(await episodes(row)).toEqual([]);
    expect(await claim(row)).toMatchObject({ ok: true, acquired: true });
    expect(await episodes(row)).toHaveLength(1);
  });

  it("duas transações aguardam lead; relógio após lock dá uma lease/token exclusivos", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(); let clock = now;
    const readClock = vi.fn(() => clock); let pending: ReturnType<typeof claimPreparation>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = [a, b].map((client, index) => claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: readClock, database: pinned(client, index === 0 ? pidA : pidB) }));
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]);
      expect(await waitForLocks(pids, 2)).toBe(2); expect(readClock).not.toHaveBeenCalled();
      clock = new Date(now.getTime() + hour); await blocker.query("COMMIT");
      const results = await Promise.all(pending), winner = results.find((result) => result.ok && result.acquired);
      expect(results.filter((result) => result.ok && result.acquired)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "lease-active" }]);
      expect(winner).toMatchObject({ ok: true, acquired: true, claimExpiresAt: new Date(clock.getTime() + lease), agentStateRevision: 1 });
      if (!winner?.ok || !winner.acquired) throw new Error("Vencedor ausente");
      expect(await episodes(row)).toEqual([expect.objectContaining({ id: winner.episodeId, claimToken: winner.claimToken, claimExpiresAt: new Date(clock.getTime() + lease),
        tenantId, leadId: row.lead.id, phoneNumberId, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt, state: "preparing",
        agentStateRevision: 1, resetObservedAt: null, preparedAt: clock, createdAt: clock, updatedAt: clock, dispatchAuthorizedAt: null })]);
      expect(readClock).toHaveBeenCalledTimes(2);
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("espera de lock que cruza 24h fecha elegibilidade sem lease", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), client = await db.$client.connect(), pid = deferred<number>();
    let clock = now; const readClock = vi.fn(() => clock); let pending: ReturnType<typeof claimPreparation> | undefined;
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: readClock, database: pinned(client, pid) });
      expect(await waitForLocks([await pid.promise], 1)).toBe(1); expect(readClock).not.toHaveBeenCalled();
      clock = new Date(now.getTime() + 2 * hour); await blocker.query("COMMIT");
      expect(await pending).toEqual({ ok: false, reason: "not-eligible", policyReason: "window-closed" });
      expect(await episodes(row)).toEqual([]); expect(readClock).toHaveBeenCalledTimes(1);
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); client.release(); }
  });

  it("espera pelo episódio amostra relógio só após esse lock e recupera lease exata", async () => {
    const row = await fixture(); const first = await claim(row);
    expect(first).toMatchObject({ ok: true, acquired: true });
    if (!first.ok || !first.acquired) throw new Error("Claim inicial ausente");
    const blocker = await db.$client.connect(), client = await db.$client.connect(), pid = deferred<number>();
    let clock = now; const readClock = vi.fn(() => clock); let pending: ReturnType<typeof claimPreparation> | undefined;
    try {
      await blocker.query("BEGIN");
      const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await blocker.query("SELECT id FROM reengagement_episodes WHERE id=$1 FOR UPDATE", [first.episodeId]);
      pending = claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: readClock, database: pinned(client, pid) });
      const workerPid = await pid.promise; expect(workerPid).not.toBe(blockerPid);
      expect(await waitForLocks([workerPid], 1)).toBe(1); expect(readClock).not.toHaveBeenCalled();
      clock = new Date(now.getTime() + lease); await blocker.query("COMMIT");
      const result = await pending;
      expect(result).toMatchObject({ ok: true, acquired: true, episodeId: first.episodeId, claimExpiresAt: new Date(clock.getTime() + lease), agentStateRevision: 1 });
      if (!result.ok || !result.acquired) throw new Error("Lease no prazo não recuperada");
      expect(result.claimToken).not.toBe(first.claimToken);
      expect(await episodes(row)).toEqual([expect.objectContaining({ id: first.episodeId, claimToken: result.claimToken,
        claimExpiresAt: new Date(clock.getTime() + lease), preparedAt: clock, updatedAt: clock, createdAt: now, dispatchAuthorizedAt: null })]);
      expect(readClock).toHaveBeenCalledTimes(1);
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); client.release(); }
  });
});
