import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, users, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import { ingestAgentMessage, optOutLeadByHuman, recordHumanMessage, returnConversationToAgent, takeOverConversation, updateLeadStatus } from "../index";
import { patchLead } from "../../integration/leads";
import { publishAgentState } from "../../reengagement/agent-state";
import { authorizeDispatch, claimPreparation, reconcileAcceptance } from "../../reengagement/repository";
import { getSessionFrame, prepareFrame } from "../../reengagement/context";

const tenantId = randomUUID(), foreignTenant = randomUUID(), userId = randomUUID();
const now = new Date("2026-10-06T15:00:00.500Z"), hour = 3600000, scope = { tenantId, assignedUserId: null };
let contact = 5534999800000;
async function fixture(stage: "preparing" | "authorized" | "accepted" = "preparing") {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T28", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId, region: "Centro" }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Âncora factual", sentAt: new Date(now.getTime() - 22 * hour), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["Olá"] });
  const claim = await claimPreparation({ tenantId }, lead.id, { anchorMessageId: anchor.id }, { now: () => now });
  if (!claim.ok || !claim.acquired) throw new Error("Claim ausente");
  const prepared = await prepareFrame({ tenantId }, lead.id, claim.episodeId, { claimToken: claim.claimToken }, { now: () => now });
  if (!prepared.ok) throw new Error("Frame ausente");
  const row = { lead, conversation, anchor, phoneNumberId, ...claim };
  if (stage !== "preparing") { const result = await authorize(row); if (!result.ok || !result.authorized) throw new Error("Autorização ausente"); }
  if (stage === "accepted") { const result = await ack(row); if (!result.ok || !result.recorded) throw new Error("Aceite ausente"); }
  return row;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function authorize(row: Fixture, database?: Pick<typeof db, "transaction">) {
  return authorizeDispatch({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text: "Texto efetivamente submetido" }, { expectedChannelRevision: 1, now: () => now, database });
}
function ack(row: Fixture, clock = new Date(now.getTime() + 1000)) {
  return reconcileAcceptance({ tenantId }, row.lead.id, row.episodeId, { wamid: `fixture-ack-${row.episodeId}`, acceptedAt: clock }, { now: () => clock });
}
function inbound(row: Fixture, clock = new Date(now.getTime() + hour)) {
  return ingestAgentMessage(tenantId, row.lead.id, { externalId: `fixture-${randomUUID()}`, sender: "lead", content: "Resposta real", sentAt: clock, whatsappPhoneNumberId: row.phoneNumberId }, { now: () => clock });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
async function agent(row: Fixture) { return (await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)))[0]; }
async function lead(row: Fixture) { return (await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema });
  return { transaction: (callback, config) => database.transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
}
async function waitForLocks(pids: number[]) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids]);
    if (result.rows[0].waiting === pids.length) return result.rows[0].waiting;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T28", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(users).values({ id: userId, name: "Humana T28", email: `${userId}@fixture.test` });
});
afterAll(async () => {
  await db.delete(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantId)); await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId));
  await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId)); await db.delete(messages).where(eq(messages.tenantId, tenantId)); await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId)); await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.delete(users).where(eq(users.id, userId)); await db.$client.end();
});

describe("T28 — condução invalida episódio atomicamente", () => {
  it("takeover antes da autorização cancela preparo, deixa fase desconhecida e preserva âncora/fatos", async () => {
    const row = await fixture(), before = await agent(row);
    expect(await takeOverConversation(scope, row.lead.id, userId, now)).toMatchObject({ outcome: "assumido", lead: { status: "em_qualificacao", statusChangedBy: null, humanTakeoverAt: now } });
    expect(await episode(row)).toMatchObject({ state: "cancelled", claimToken: null, claimExpiresAt: null, dispatchAuthorizedAt: null, bridgeInvalidatedAt: now, bridgeRevision: 2 });
    expect(await agent(row)).toEqual({ ...before, phase: null, revision: 2, updatedAt: now });
    expect((await lead(row)).region).toBe("Centro");
    expect(await authorize(row)).toEqual({ ok: true, authorized: false, episodeId: row.episodeId, state: "cancelled" });
    expect(await patchLead(tenantId, row.lead.id, { status: "qualificado_agendado" })).toEqual({ ok: false, code: "lead-conduzido-por-humano" });
  });

  it("takeover pós-marcador conserva texto/deadline/resultado e não recolhe autorização", async () => {
    const row = await fixture("authorized"), before = await episode(row);
    await takeOverConversation(scope, row.lead.id, userId, now);
    expect(await episode(row)).toEqual({ ...before, bridgeInvalidatedAt: now, bridgeRevision: before.bridgeRevision + 1, updatedAt: now });
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true });
    expect(await episode(row)).toMatchObject({ state: "accepted", bridgeInvalidatedAt: now, submittedText: before.submittedText, dispatchAuthorizedAt: before.dispatchAuthorizedAt, dispatchCompletionDeadline: before.dispatchCompletionDeadline });
    expect(await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => now })).toMatchObject({ ok: true, frame: { bridge: null } });
  });

  it("takeover de ponte consumida invalida uma vez e replay mantém todas as revisões", async () => {
    const row = await fixture("accepted"), first = await inbound(row), clock = new Date(now.getTime() + 2 * hour);
    await takeOverConversation(scope, row.lead.id, userId, clock);
    const before = await episode(row), beforeAgent = await agent(row), beforeLead = await lead(row);
    expect(before).toMatchObject({ state: "accepted", firstInboundMessageId: first!.message.id, bridgeInvalidatedAt: clock });
    expect(await takeOverConversation(scope, row.lead.id, userId, new Date(clock.getTime() + 1))).toEqual({ outcome: "ja-humano", lead: beforeLead });
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(beforeLead);
  });

  it("devolução reseta fase/perguntados/aberturas sem mudar âncora nem rearmar a oportunidade", async () => {
    const row = await fixture("accepted"), first = await inbound(row), clock = new Date(now.getTime() + 2 * hour);
    await takeOverConversation(scope, row.lead.id, userId, clock);
    const before = await episode(row), previous = await agent(row), reset = new Date(clock.getTime() + 1);
    expect(await returnConversationToAgent(scope, row.lead.id, reset)).toMatchObject({ outcome: "devolvido", lead: { humanTakeoverAt: null, statusChangedBy: null, memoryResetRequestedAt: reset } });
    expect(await agent(row)).toEqual({ ...previous, phase: null, askedFields: [], openingHistory: [], revision: previous.revision + 1, updatedAt: reset });
    expect((await agent(row)).anchorMessageId).toBe(first!.message.id); expect(await episode(row)).toEqual(before);
    const frame = await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => reset });
    expect(frame).toMatchObject({ ok: true, frame: { bridge: null, resetRequestedAt: reset.toISOString() } });
    // AD-034: a devolução ressemeia a sessão a partir do CRM, inclusive o que veio antes do pedido de reset.
    if (!frame.ok) throw new Error("Frame ausente");
    expect(frame.history.map((message) => message.id)).toContain(first!.message.id);
    expect(frame.history.every((message) => Date.parse(message.sentAt) < reset.getTime())).toBe(true);
    const replayAgent = await agent(row), replayLead = await lead(row);
    expect(await returnConversationToAgent(scope, row.lead.id, new Date(reset.getTime() + 1))).toEqual({ outcome: "ja-agente", lead: replayLead });
    expect(await agent(row)).toEqual(replayAgent); expect(await episode(row)).toEqual(before); expect(await lead(row)).toEqual(replayLead);
  });

  it("fala do corretor anterior à devolução volta na semeadura pelo CRM, atribuída à equipe (AD-034 D12, auditoria L14b B1)", async () => {
    const row = await fixture("accepted"), first = await inbound(row), clock = new Date(now.getTime() + 2 * hour);
    await takeOverConversation(scope, row.lead.id, userId, clock);
    const [human] = await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "humano", authorUserId: userId,
      authorName: "Corretora T28", content: "O apartamento tem 3 vagas", sentAt: new Date(clock.getTime() + 60000) }).returning();
    const reset = new Date(clock.getTime() + 120000);
    await returnConversationToAgent(scope, row.lead.id, reset);
    const next = await inbound(row, new Date(reset.getTime() + 60000));
    const frame = await getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds: [next!.message.id] }, { now: () => next!.message.sentAt });
    if (!frame.ok) throw new Error("Frame ausente");
    const ids = frame.history.map((message) => message.id);
    expect(frame.frame.bridge).toBeNull();
    expect(ids).toEqual(expect.arrayContaining([first!.message.id, human.id]));
    expect(ids).not.toContain(next!.message.id);
    expect(frame.history.find((message) => message.id === human.id)).toMatchObject({ sender: "humano", authorName: "Corretora T28", content: "O apartamento tem 3 vagas" });
  });

  it("reset seguido de publicação atual não reabre episódio cancelado da mesma âncora", async () => {
    const row = await fixture();
    await takeOverConversation(scope, row.lead.id, userId, now); await returnConversationToAgent(scope, row.lead.id, now);
    expect(await publishAgentState({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id, resetObservedAt: now, expectedRevision: 3, phase: "qualificando", askedFields: [], openingHistory: [] }, { now: () => now })).toMatchObject({ ok: true, replay: false });
    expect(await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => now })).toMatchObject({ ok: true, acquired: false, episodeId: row.episodeId, state: "cancelled" });
    expect((await episode(row)).dispatchAuthorizedAt).toBeNull();
  });

  it("opt-out é idempotente e limpa projeção sem apagar a tentativa aceita", async () => {
    const row = await fixture("accepted"), before = await episode(row);
    expect(await optOutLeadByHuman(scope, row.lead.id, now)).toEqual({ optedOutAt: now, newlyOptedOut: true });
    expect(await episode(row)).toEqual({ ...before, bridgeInvalidatedAt: now, bridgeRevision: before.bridgeRevision + 1, updatedAt: now });
    expect(await agent(row)).toMatchObject({ phase: null, revision: 2, anchorMessageId: row.anchor.id, askedFields: [], openingHistory: [] });
    const afterAgent = await agent(row), afterEpisode = await episode(row), afterLead = await lead(row);
    expect(await optOutLeadByHuman(scope, row.lead.id, new Date(now.getTime() + 1))).toEqual({ optedOutAt: now, newlyOptedOut: false });
    expect(await agent(row)).toEqual(afterAgent); expect(await episode(row)).toEqual(afterEpisode); expect(await lead(row)).toEqual(afterLead);
    expect(afterLead.updatedAt).toEqual(row.lead.updatedAt);
  });

  it.each(["qualificado_agendado", "escalado_humano"] as const)("status %s cancela preparo sem alterar qualificação ou âncora", async (status) => {
    const row = await fixture();
    expect(await updateLeadStatus(scope, row.lead.id, status, "humano", { now: () => now })).toMatchObject({ status, statusChangedBy: "humano", region: "Centro" });
    expect(await episode(row)).toMatchObject({ state: "cancelled", dispatchAuthorizedAt: null, bridgeInvalidatedAt: now });
    expect(await agent(row)).toMatchObject({ phase: null, revision: 2, anchorMessageId: row.anchor.id, askedFields: ["modality"], openingHistory: ["Olá"] });
  });

  it("status humano em qualificação torna fase desconhecida e conserva trava de pipeline", async () => {
    const row = await fixture("authorized"), before = await episode(row);
    await updateLeadStatus(scope, row.lead.id, "em_qualificacao", "humano", { now: () => now });
    expect(await agent(row)).toMatchObject({ phase: null, revision: 2 });
    expect(await episode(row)).toEqual({ ...before, bridgeInvalidatedAt: now, bridgeRevision: before.bridgeRevision + 1, updatedAt: now });
    expect(await patchLead(tenantId, row.lead.id, { status: "qualificado_agendado" })).toEqual({ ok: false, code: "lead-travado-por-humano" });
    expect((await lead(row)).status).toBe("em_qualificacao");
  });

  it("repetir mesmo status/ator preserva projeção/ponte e ainda atualiza updatedAt legado", async () => {
    const row = await fixture(); await updateLeadStatus(scope, row.lead.id, "em_qualificacao", "humano", { now: () => now });
    const before = await episode(row), beforeAgent = await agent(row), clock = new Date(now.getTime() + 1);
    await updateLeadStatus(scope, row.lead.id, "em_qualificacao", "humano", { now: () => clock });
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect((await lead(row)).updatedAt).toEqual(clock);
  });

  it("tenant/carteira alheios não mudam lead, episódio ou projeção nos quatro writers", async () => {
    const row = await fixture(), before = await episode(row), beforeAgent = await agent(row);
    for (const outside of [{ tenantId: foreignTenant, assignedUserId: null }, { tenantId, assignedUserId: userId }]) {
      expect(await updateLeadStatus(outside, row.lead.id, "escalado_humano")).toBeNull();
      expect(await takeOverConversation(outside, row.lead.id, userId, now)).toEqual({ outcome: "fora-do-escopo" });
      expect(await returnConversationToAgent(outside, row.lead.id, now)).toEqual({ outcome: "fora-do-escopo" });
      expect(await optOutLeadByHuman(outside, row.lead.id, now)).toBeNull();
    }
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(row.lead);
  });

  it("guards de opt-out e devolução sem condução não alteram revisões derivadas", async () => {
    const row = await fixture();
    expect(await returnConversationToAgent(scope, row.lead.id, now)).toEqual({ outcome: "ja-agente", lead: row.lead });
    await optOutLeadByHuman(scope, row.lead.id, now);
    const before = await episode(row), beforeAgent = await agent(row), beforeLead = await lead(row);
    expect(await takeOverConversation(scope, row.lead.id, userId, now)).toEqual({ outcome: "opt-out" });
    expect(await returnConversationToAgent(scope, row.lead.id, now)).toEqual({ outcome: "opt-out" });
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(beforeLead);
  });

  it("mensagem humana não vira inbound, não avança projeção e conserva autor/âncora", async () => {
    const row = await fixture(), before = await episode(row), beforeAgent = await agent(row);
    const message = await recordHumanMessage({ tenantId, leadId: row.lead.id, requestId: randomUUID(), authorUserId: userId, authorName: "Humana T28", content: "Texto humano real", wamid: `fixture-human-${randomUUID()}`, sentAt: now });
    expect(message).toMatchObject({ sender: "humano", authorUserId: userId, authorName: "Humana T28", content: "Texto humano real" });
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent);
    expect(await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => now })).toMatchObject({ ok: true, anchor: { id: row.anchor.id }, history: [] });
  });

  it("histórico apagado não reaparece; a devolução ressemeia a sessão viva do CRM (AD-034)", async () => {
    const row = await fixture("accepted");
    const [removed] = await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "humano", authorUserId: userId, authorName: "Humana T28", content: "Histórico removido", sentAt: new Date(row.anchor.sentAt.getTime() - hour) }).returning();
    await inbound(row);
    const clock = new Date(now.getTime() + 2 * hour);
    await takeOverConversation(scope, row.lead.id, userId, clock); await returnConversationToAgent(scope, row.lead.id, clock);
    const state = await episode(row);
    await db.delete(messages).where(eq(messages.id, removed.id));
    const next = await inbound(row, new Date(clock.getTime() + 1)), frame = await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => next!.message.sentAt });
    if (!frame.ok) throw new Error("Frame ausente");
    const ids = frame.history.map((message) => message.id);
    expect(frame.frame.bridge).toBeNull(); expect(ids).not.toContain(removed.id); expect(ids).toContain(next!.message.id);
    expect(ids.length).toBeGreaterThan(1);
    expect((await episode(row)).dispatchAuthorizedAt).toEqual(state.dispatchAuthorizedAt); expect((await agent(row)).anchorMessageId).toBe(next!.message.id);
  });

  it("rollback desfaz condução, projeção e invalidação juntos", async () => {
    const row = await fixture("authorized"), before = await episode(row), beforeAgent = await agent(row);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(takeOverConversation(scope, row.lead.id, userId, now, { database })).rejects.toThrow("fixture-rollback");
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(row.lead);
  });

  it("relógio não finito não altera nenhum fato ou revisão", async () => {
    const row = await fixture(), before = await episode(row), beforeAgent = await agent(row);
    await expect(updateLeadStatus(scope, row.lead.id, "escalado_humano", "humano", { now: () => new Date(NaN) })).rejects.toThrow("invalid clock");
    await expect(takeOverConversation(scope, row.lead.id, userId, new Date(NaN))).rejects.toThrow("invalid clock");
    await expect(returnConversationToAgent(scope, row.lead.id, new Date(NaN))).rejects.toThrow("invalid clock");
    await expect(optOutLeadByHuman(scope, row.lead.id, new Date(NaN))).rejects.toThrow("invalid clock");
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(row.lead);
  });

  it.each(["takeover", "status"] as const)("%s e autorização concorrentes serializam por lead em PIDs independentes", async (kind) => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(); let pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      const auth = authorize(row, pinned(a, pidA));
      const human = kind === "takeover" ? takeOverConversation(scope, row.lead.id, userId, now, { database: pinned(b, pidB) })
        : updateLeadStatus(scope, row.lead.id, "em_qualificacao", "humano", { now: () => now, database: pinned(b, pidB) });
      pending = [auth, human]; const pids = await Promise.all([pidA.promise, pidB.promise]);
      expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks(pids)).toBe(2);
      await blocker.query("COMMIT"); const [authorization] = await Promise.all([auth, human]), state = await episode(row);
      expect(state.bridgeInvalidatedAt).toEqual(now); expect((await agent(row)).phase).toBeNull();
      if (authorization.ok && authorization.authorized) expect(state).toMatchObject({ state: "authorized", dispatchAuthorizedAt: now, submittedText: "Texto efetivamente submetido", dispatchCompletionDeadline: new Date(now.getTime() + 120000) });
      else expect(state).toMatchObject({ state: "cancelled", dispatchAuthorizedAt: null, submittedText: null });
      expect(await patchLead(tenantId, row.lead.id, { status: "qualificado_agendado" })).toEqual({ ok: false, code: kind === "takeover" ? "lead-conduzido-por-humano" : "lead-travado-por-humano" });
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("relógio é consultado após esperar o lock do episódio, além do lead", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), writer = await db.$client.connect(), pid = deferred<number>();
    let calls = 0, pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM reengagement_episodes WHERE id=$1 FOR UPDATE", [row.episodeId]);
      const mutation = updateLeadStatus(scope, row.lead.id, "qualificado_agendado", "humano", { database: pinned(writer, pid), now: () => { calls++; return now; } }); pending = [mutation];
      expect(await waitForLocks([await pid.promise])).toBe(1); expect(calls).toBe(0);
      await blocker.query("COMMIT"); await mutation; expect(calls).toBe(1); expect((await episode(row)).bridgeInvalidatedAt).toEqual(now);
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); writer.release(); }
  });
});
