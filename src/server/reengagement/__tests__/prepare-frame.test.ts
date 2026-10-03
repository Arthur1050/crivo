import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels } from "../../../db/schema";
import { claimPreparation } from "../repository";
import { prepareFrame } from "../context";

const tenantId = randomUUID(), foreignTenant = randomUUID(), now = new Date("2026-10-06T15:00:00Z"), hour = 3600000;
let contact = 5534999500000;
async function fixture() {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T25", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao",
    firstContactAt: now, whatsappPhoneNumberId: phoneNumberId, modality: "usado", region: "Centro", budgetCents: 50000000n }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const anchorTime = new Date(now.getTime() - 22 * hour);
  const [old, start, human, anchor, answer] = await db.insert(messages).values([
    { sender: "lead" as const, content: "Sessão antiga distinta", sentAt: new Date(anchorTime.getTime() - 20 * hour) },
    { sender: "lead" as const, content: "Quero apartamento no Centro", sentAt: new Date(anchorTime.getTime() - hour) },
    { sender: "humano" as const, content: "Informação confirmada pela equipe", authorName: "Ana", sentAt: new Date(anchorTime.getTime() - 1800000) },
    { sender: "lead" as const, content: "Pode confirmar as vagas?", sentAt: anchorTime },
    { sender: "agente" as const, content: "Vou verificar as vagas", sentAt: new Date(anchorTime.getTime() + 1800000) },
  ].map((row) => ({ ...row, tenantId, conversationId: conversation.id, whatsappPhoneNumberId: phoneNumberId }))).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["Olá"] });
  const claim = await claimPreparation({ tenantId }, lead.id, { anchorMessageId: anchor.id }, { now: () => now });
  if (!claim.ok || !claim.acquired) throw new Error("Fixture sem claim");
  return { lead, conversation, old, start, human, anchor, answer, phoneNumberId, ...claim };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function prepare(row: Fixture, clock = now, database?: Pick<typeof db, "transaction">) {
  return prepareFrame({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken }, { now: () => clock, database });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
async function snapshot(row: Fixture) {
  return { lead: (await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0],
    agent: (await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)))[0],
    messages: await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(messages.sentAt, messages.id) };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema });
  return { transaction: (callback, config) => database.transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
}
async function waitForLock(pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await db.$client.query<{ waiting: boolean }>("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [pid]);
    if (result.rows[0]?.waiting) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}
beforeAll(async () => { await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T25", agentName: "Agente", supportedModality: "ambos" as const }))); });
afterAll(async () => {
  await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId));
  await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId)); await db.delete(messages).where(eq(messages.tenantId, tenantId));
  await db.delete(conversations).where(eq(conversations.tenantId, tenantId)); await db.delete(leads).where(eq(leads.tenantId, tenantId));
  await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.$client.end();
});

describe("T25 — frame factual da sessão da âncora", () => {
  it("pendência ignora dados já confirmados; fatos atuais e projeção mínima permanecem íntegros", async () => {
    const row = await fixture();
    await db.update(leads).set({ executiveSummary: "Busca imóvel com duas vagas" }).where(eq(leads.id, row.lead.id));
    const before = await snapshot(row), beforeEpisode = await episode(row), result = await prepare(row);
    expect(result).toEqual({ ok: true, frame: {
      tenantId, leadId: row.lead.id, episodeId: row.episodeId, phoneNumberId: row.phoneNumberId, channelRevision: 1, preparedAt: now.toISOString(),
      anchor: { id: row.anchor.id, sentAt: row.anchor.sentAt.toISOString() }, resetObservedAt: null,
      agent: { phase: "qualificando", revision: 1, askedFields: ["modality"], openingHistory: ["Olá"] },
      facts: { name: "Fixture T25", modality: "usado", region: "Centro", budgetCents: "50000000", propertyType: null,
        purchaseHorizon: null, motivation: null, creditStatus: null, chainedOperation: null, executiveSummary: "Busca imóvel com duas vagas" },
      pendingField: "propertyType", origin: { startMessageId: row.start.id, endMessageId: row.answer.id },
      history: [row.start, row.human, row.anchor, row.answer].map((message) => ({ id: message.id, sender: message.sender, content: message.content, sentAt: message.sentAt.toISOString(), authorName: message.authorName })),
    } });
    expect(await snapshot(row)).toEqual(before);
    expect(await episode(row)).toEqual({ ...beforeEpisode, originSessionStartMessageId: row.start.id, originSessionEndMessageId: row.answer.id });
  });

  it("nota humana mantém autoria e horário sem anexar sessão antiga distinta", async () => {
    const row = await fixture(), result = await prepare(row);
    if (!result.ok) throw new Error("Frame ausente");
    expect(result.frame.history.map((message) => message.id)).toEqual([row.start.id, row.human.id, row.anchor.id, row.answer.id]);
    expect(result.frame.history[1]).toEqual({ id: row.human.id, sender: "humano", content: "Informação confirmada pela equipe", sentAt: row.human.sentAt.toISOString(), authorName: "Ana" });
  });

  it("sem pendência mantém fase/publicação atuais e não fabrica novo campo", async () => {
    const row = await fixture();
    await db.update(leadAgentState).set({ phase: "agendando", askedFields: ["modality", "region", "propertyType"] }).where(eq(leadAgentState.leadId, row.lead.id));
    const before = await snapshot(row), result = await prepare(row);
    expect(result).toMatchObject({ ok: true, frame: { pendingField: null, agent: { phase: "agendando", askedFields: ["modality", "region", "propertyType"] } } });
    expect(await snapshot(row)).toEqual(before);
  });

  it("50 mensagens de conteúdo não apagam limites factuais ou âncora da sessão maior", async () => {
    const row = await fixture();
    const tail = await db.insert(messages).values(Array.from({ length: 55 }, (_, i) => ({ tenantId, conversationId: row.conversation.id, sender: "agente" as const,
      content: `Resposta ${i}`, sentAt: new Date(row.answer.sentAt.getTime() + (i + 1) * 60000), whatsappPhoneNumberId: row.phoneNumberId }))).returning();
    const result = await prepare(row);
    if (!result.ok) throw new Error("Frame ausente");
    expect(result.frame.history.map((message) => message.id)).toEqual(tail.slice(-50).map((message) => message.id));
    expect(result.frame.anchor.id).toBe(row.anchor.id);
    expect(result.frame.origin).toEqual({ startMessageId: row.start.id, endMessageId: tail[54].id });
    expect(await episode(row)).toMatchObject({ originSessionStartMessageId: row.start.id, originSessionEndMessageId: tail[54].id });
  });

  it("reset divergente não reutiliza claim/frame nem grava limites", async () => {
    const row = await fixture(); await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
    const before = await episode(row);
    expect(await prepare(row)).toEqual({ ok: false, reason: "context-changed" }); expect(await episode(row)).toEqual(before);
  });

  it("reset observado vigente exclui histórico anterior sem apagar os fatos do CRM", async () => {
    const row = await fixture(), reset = new Date(row.anchor.sentAt.getTime() - 45 * 60000);
    await db.update(leads).set({ memoryResetRequestedAt: reset }).where(eq(leads.id, row.lead.id));
    await db.update(leadAgentState).set({ resetObservedAt: reset, revision: 2 }).where(eq(leadAgentState.leadId, row.lead.id));
    await db.update(reengagementEpisodes).set({ resetObservedAt: reset, agentStateRevision: 2 }).where(eq(reengagementEpisodes.id, row.episodeId));
    const before = await snapshot(row), result = await prepare(row);
    expect(result).toMatchObject({ ok: true, frame: { resetObservedAt: reset.toISOString(), facts: { region: "Centro", budgetCents: "50000000" },
      origin: { startMessageId: row.human.id, endMessageId: row.answer.id } } });
    if (!result.ok) throw new Error("Frame ausente");
    expect(result.frame.history.map((message) => message.id)).toEqual([row.human.id, row.anchor.id, row.answer.id]);
    expect(await snapshot(row)).toEqual(before);
  });

  it("tenant ou episódio de outra lead não entrega conteúdo", async () => {
    const row = await fixture(), other = await fixture();
    expect(await prepareFrame({ tenantId: foreignTenant }, row.lead.id, row.episodeId, { claimToken: row.claimToken })).toEqual({ ok: false, reason: "lead-not-found" });
    expect(await prepareFrame({ tenantId }, row.lead.id, other.episodeId, { claimToken: other.claimToken })).toEqual({ ok: false, reason: "episode-not-found" });
    expect(await episode(row)).toMatchObject({ originSessionStartMessageId: null, originSessionEndMessageId: null });
  });

  it("token substituído/lease exata vencida não entregam contexto nem mudam episódio", async () => {
    const row = await fixture(), before = await episode(row);
    expect(await prepareFrame({ tenantId }, row.lead.id, row.episodeId, { claimToken: randomUUID() }, { now: () => now })).toEqual({ ok: false, reason: "claim-conflict" });
    expect(await prepare(row, new Date(now.getTime() + 300000))).toEqual({ ok: false, reason: "claim-expired" });
    expect(await episode(row)).toEqual(before);
  });

  it.each(["anchor", "projection", "channel", "human", "opt-out"])("contexto corrente alterado %s não prepara", async (kind) => {
    const row = await fixture();
    if (kind === "anchor") await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "lead", content: "Novo inbound", sentAt: now, whatsappPhoneNumberId: row.phoneNumberId });
    if (kind === "projection") await db.update(leadAgentState).set({ revision: 2 }).where(eq(leadAgentState.leadId, row.lead.id));
    if (kind === "channel") await db.update(messages).set({ whatsappPhoneNumberId: null }).where(eq(messages.id, row.anchor.id));
    if (kind === "human") await db.update(leads).set({ humanTakeoverAt: now }).where(eq(leads.id, row.lead.id));
    if (kind === "opt-out") await db.update(leads).set({ optedOutAt: now }).where(eq(leads.id, row.lead.id));
    const before = await episode(row), result = await prepare(row);
    expect(result.ok).toBe(false); if (result.ok) throw new Error("Contexto mudou");
    expect(result.reason).toBe(["human", "opt-out"].includes(kind) ? "not-eligible" : "context-changed");
    expect(await episode(row)).toEqual(before);
  });

  it("histórico ilegível infinity real falha fechado sem regravar timestamp inválido", async () => {
    const row = await fixture(); await db.execute(sql`UPDATE messages SET sent_at='infinity' WHERE id=${row.answer.id}`);
    const before = await episode(row);
    expect(await prepare(row)).toEqual({ ok: false, reason: "context-read-failed" }); expect(await episode(row)).toEqual(before);
  });

  it("erro de leitura e rollback não deixam cópia ou limites parciais", async () => {
    const row = await fixture(), before = await episode(row);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-read-failed"); }, config) };
    expect(await prepare(row, now, database)).toEqual({ ok: false, reason: "context-read-failed" });
    expect(await episode(row)).toEqual(before); expect(await prepare(row)).toMatchObject({ ok: true });
  });

  it("relógio após lead→episódio observa lease vencida enquanto aguarda lock real", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), client = await db.$client.connect(), pid = deferred<number>();
    let clock = now, pending: ReturnType<typeof prepareFrame> | undefined; const readClock = vi.fn(() => clock);
    try {
      await blocker.query("BEGIN"); const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await blocker.query("SELECT id FROM reengagement_episodes WHERE id=$1 FOR UPDATE", [row.episodeId]);
      pending = prepareFrame({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken }, { now: readClock, database: pinned(client, pid) });
      const workerPid = await pid.promise; expect(workerPid).not.toBe(blockerPid); expect(await waitForLock(workerPid)).toBe(true);
      expect(readClock).not.toHaveBeenCalled(); clock = new Date(now.getTime() + 300000); await blocker.query("COMMIT");
      expect(await pending).toEqual({ ok: false, reason: "claim-expired" });
      expect(await episode(row)).toMatchObject({ originSessionStartMessageId: null, originSessionEndMessageId: null, dispatchAuthorizedAt: null });
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); client.release(); }
  });

  it("input inválido e tentativa consumida não preparam contexto", async () => {
    const row = await fixture();
    expect(await prepareFrame({ tenantId }, row.lead.id, "invalid", { claimToken: row.claimToken })).toEqual({ ok: false, reason: "invalid-input" });
    await db.update(reengagementEpisodes).set({ state: "cancelled" }).where(eq(reengagementEpisodes.id, row.episodeId));
    const before = await episode(row);
    expect(await prepare(row)).toEqual({ ok: false, reason: "episode-consumed" }); expect(await episode(row)).toEqual(before);
  });
});
