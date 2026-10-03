import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import { ingestAgentMessage } from "../index";
import { publishAgentState } from "../../reengagement/agent-state";
import { authorizeDispatch, claimPreparation, expireEpisode, reconcileAcceptance } from "../../reengagement/repository";
import { getSessionFrame, prepareFrame } from "../../reengagement/context";

const tenantId = randomUUID(), foreignTenant = randomUUID(), now = new Date("2026-10-06T15:00:00.500Z"), hour = 3600000;
let contact = 5534999700000;
async function fixture(stage: "preparing" | "authorized" | "accepted" = "preparing") {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T27", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Âncora factual", sentAt: new Date(now.getTime() - 22 * hour), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["Olá"] });
  const claim = await claimPreparation({ tenantId }, lead.id, { anchorMessageId: anchor.id }, { now: () => now });
  if (!claim.ok || !claim.acquired) throw new Error("Claim ausente");
  const frame = await prepareFrame({ tenantId }, lead.id, claim.episodeId, { claimToken: claim.claimToken }, { now: () => now });
  if (!frame.ok) throw new Error("Frame ausente");
  const row = { lead, conversation, anchor, phoneNumberId, ...claim };
  if (stage !== "preparing") { const result = await authorize(row); if (!result.ok || !result.authorized) throw new Error("Autorização ausente"); }
  if (stage === "accepted") { const result = await ack(row); if (!result.ok || !result.recorded) throw new Error("Aceite ausente"); }
  return row;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function authorize(row: Fixture, clock = now, database?: Pick<typeof db, "transaction">) {
  return authorizeDispatch({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text: "Texto efetivamente submetido" }, { expectedChannelRevision: 1, now: () => clock, database });
}
function ack(row: Fixture, clock = new Date(now.getTime() + 1000)) {
  return reconcileAcceptance({ tenantId }, row.lead.id, row.episodeId, { wamid: `fixture-ack-${row.episodeId}`, acceptedAt: clock }, { now: () => clock });
}
function inbound(row: Fixture, sentAt = new Date(now.getTime() + hour), patch: Partial<Parameters<typeof ingestAgentMessage>[2]> = {}, database?: Pick<typeof db, "transaction">) {
  return ingestAgentMessage(tenantId, row.lead.id, { externalId: `fixture-${randomUUID()}`, sender: "lead", content: "Resposta real", sentAt, whatsappPhoneNumberId: row.phoneNumberId, ...patch }, { now: () => sentAt, database });
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
beforeAll(async () => { await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T27", agentName: "Agente", supportedModality: "ambos" as const }))); });
afterAll(async () => {
  await db.delete(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantId)); await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId));
  await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId)); await db.delete(messages).where(eq(messages.tenantId, tenantId)); await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId)); await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.$client.end();
});

describe("T27 — ingestão factual atômica e ponte", () => {
  it("novo inbound invalida fase/revisão, cancela preparação e preserva fatos/perguntados", async () => {
    const row = await fixture(), before = await agent(row), result = await inbound(row);
    expect(result).toMatchObject({ created: true, anchorMessageId: result?.message.id, agentStateRevision: 2, message: { sender: "lead", content: "Resposta real", whatsappPhoneNumberId: row.phoneNumberId } });
    expect(await agent(row)).toEqual({ ...before, phase: null, anchorMessageId: result!.message.id, revision: 2, updatedAt: result!.message.sentAt });
    expect(await episode(row)).toMatchObject({ state: "cancelled", reasonCode: "new-inbound", claimToken: null, dispatchAuthorizedAt: null, firstInboundMessageId: null });
    expect(await lead(row)).toEqual(row.lead);
    expect(await authorize(row)).toEqual({ ok: true, authorized: false, episodeId: row.episodeId, state: "cancelled" });
  });

  it("replay preserva texto/hora/canal e não altera revisão/episódio", async () => {
    const row = await fixture("accepted"), first = await inbound(row), beforeAgent = await agent(row), beforeEpisode = await episode(row);
    const replay = await inbound(row, new Date(now.getTime() + 2 * hour), { externalId: first!.message.externalId!, content: "Texto diferente", sender: "agente", whatsappPhoneNumberId: null });
    expect(replay).toEqual({ created: false, message: first!.message, anchorMessageId: first!.message.id, agentStateRevision: 2 });
    expect(await agent(row)).toEqual(beforeAgent); expect(await episode(row)).toEqual(beforeEpisode);
  });

  it("inbound atrasado anterior à âncora é persistido sem novo episódio/oportunidade", async () => {
    const row = await fixture(), beforeAgent = await agent(row), beforeEpisode = await episode(row);
    const result = await inbound(row, new Date(row.anchor.sentAt.getTime() - 1));
    expect(result).toMatchObject({ created: true, anchorMessageId: row.anchor.id, agentStateRevision: 1 });
    expect(await agent(row)).toEqual(beforeAgent); expect(await episode(row)).toEqual(beforeEpisode);
  });

  it("âncora em empate sentAt é o maior id, independente de ordem de chegada", async () => {
    const row = await fixture(), first = await inbound(row), before = await agent(row);
    const second = await inbound(row, first!.message.sentAt);
    const winner = [first!.message.id, second!.message.id].sort().at(-1)!;
    expect(second!.anchorMessageId).toBe(winner); expect((await agent(row)).anchorMessageId).toBe(winner);
    expect((await agent(row)).revision).toBe(winner === second!.message.id ? before.revision + 1 : before.revision);
  });

  it("nova âncora publicada permite novo episódio sem rearmar tentativa anterior", async () => {
    const row = await fixture("accepted"), first = await inbound(row), old = await episode(row);
    expect(await publishAgentState({ tenantId }, row.lead.id, { anchorMessageId: first!.message.id, resetObservedAt: null, expectedRevision: 2, phase: "qualificando", askedFields: ["modality"], openingHistory: ["Olá"] })).toMatchObject({ ok: true, state: { revision: 3 } });
    const clock = new Date(first!.message.sentAt.getTime() + 22 * hour), result = await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: first!.message.id }, { now: () => clock });
    expect(result).toMatchObject({ ok: true, acquired: true, agentStateRevision: 3 }); expect(await episode(row)).toEqual(old);
  });

  it("primeiro inbound pós-aceite liga memória real e mantém texto efetivo", async () => {
    const row = await fixture("accepted"), result = await inbound(row), state = await episode(row);
    expect(state).toMatchObject({ state: "accepted", firstInboundMessageId: result!.message.id, bridgeLastInboundAt: result!.message.sentAt, bridgeRevision: 2, bridgeInvalidatedAt: null, dispatchAuthorizedAt: now });
    const frame = await getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds: [result!.message.id] }, { now: () => result!.message.sentAt });
    expect(frame).toMatchObject({ ok: true, requiresRebuild: true, frame: { revision: 2, bridge: { firstInboundMessageId: result!.message.id } } });
    if (!frame.ok) throw new Error("Frame ausente"); expect(frame.history.map((message) => message.content)).toEqual(["Âncora factual", "Texto efetivamente submetido"]);
  });

  it("resposta anterior à autorização cancela preparo e nunca recebe ponte", async () => {
    const row = await fixture(), first = await inbound(row, new Date(now.getTime() - 1));
    expect(await authorize(row)).toEqual({ ok: true, authorized: false, episodeId: row.episodeId, state: "cancelled" });
    expect(await episode(row)).toMatchObject({ firstInboundMessageId: null, dispatchAuthorizedAt: null });
    expect(await getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds: [first!.message.id] }, { now: () => now })).toMatchObject({ ok: true, frame: { bridge: null }, requiresRebuild: false });
  });

  it("mesmo segundo pós-autorização guarda candidato apesar dos ms do commit e ack reconcilia", async () => {
    const row = await fixture("authorized"), sameSecond = new Date("2026-10-06T15:00:00.000Z");
    const first = await ingestAgentMessage(tenantId, row.lead.id, { externalId: `fixture-${randomUUID()}`, sender: "lead", content: "Resposta no mesmo segundo", sentAt: sameSecond,
      whatsappPhoneNumberId: row.phoneNumberId }, { now: () => new Date(now.getTime() + 500) });
    expect(await episode(row)).toMatchObject({ state: "authorized", firstInboundMessageId: first!.message.id, bridgeLastInboundAt: sameSecond });
    expect(await getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds: [first!.message.id] }, { now: () => now })).toMatchObject({ ok: true, pendingAcceptance: { episodeId: row.episodeId }, frame: { bridge: null } });
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true });
    expect(await episode(row)).toMatchObject({ state: "accepted", firstInboundMessageId: first!.message.id, bridgeInvalidatedAt: null });
    const frame = await getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds: [first!.message.id] }, { now: () => new Date(now.getTime() + 2000) });
    if (!frame.ok) throw new Error("Frame ausente");
    expect(frame.requiresRebuild).toBe(true); expect(frame.history.map((message) => message.content)).toEqual(["Âncora factual", "Texto efetivamente submetido"]);
  });

  it.each([48 * hour - 1, 48 * hour, 48 * hour + 1])("primeiro inbound em%s ms da âncora respeita <48h", async (offset) => {
    const row = await fixture("accepted"), result = await inbound(row, new Date(row.anchor.sentAt.getTime() + offset));
    const state = await episode(row);
    expect(state.firstInboundMessageId).toBe(offset < 48 * hour ? result!.message.id : null);
    expect(state.bridgeInvalidatedAt).toEqual(offset < 48 * hour ? null : result!.message.sentAt); expect(state.dispatchAuthorizedAt).toEqual(now);
  });

  it.each(["reset", "channel", "legacy", "opt-out"])("%s invalida ponte sem inventar correlação", async (kind) => {
    const row = await fixture("accepted");
    if (kind === "reset") await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
    if (kind === "opt-out") await db.update(leads).set({ optedOutAt: now }).where(eq(leads.id, row.lead.id));
    const result = await inbound(row, new Date(now.getTime() + hour), kind === "channel" ? { whatsappPhoneNumberId: "999999999999999" } : kind === "legacy" ? { whatsappPhoneNumberId: undefined } : {});
    expect(result!.message.whatsappPhoneNumberId).toBe(kind === "channel" ? "999999999999999" : kind === "legacy" ? null : row.phoneNumberId);
    expect(await episode(row)).toMatchObject({ firstInboundMessageId: null, bridgeInvalidatedAt: result!.message.sentAt, dispatchAuthorizedAt: now });
  });

  it("fase encerrada anterior não é apagada como guarda de ponte antiga pelo novo inbound", async () => {
    const row = await fixture("accepted"); await db.update(leadAgentState).set({ phase: "encerrada" }).where(eq(leadAgentState.leadId, row.lead.id));
    const first = await inbound(row);
    expect(await agent(row)).toMatchObject({ phase: null, revision: 2, anchorMessageId: first!.message.id });
    expect(await episode(row)).toMatchObject({ state: "accepted", dispatchAuthorizedAt: now, firstInboundMessageId: null, bridgeInvalidatedAt: first!.message.sentAt });
    expect(await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => first!.message.sentAt })).toMatchObject({ ok: true, frame: { bridge: null } });
  });

  it.each([12 * hour, 12 * hour + 1])("próximo inbound%s ms após primeiro mantém/encerra continuidade; ack tardio não religa", async (gap) => {
    const row = await fixture("authorized"), first = await inbound(row), next = await inbound(row, new Date(first!.message.sentAt.getTime() + gap));
    expect(await ack(row, new Date(next!.message.sentAt.getTime() + 1000))).toMatchObject({ ok: true, recorded: true });
    const state = await episode(row), frame = await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => next!.message.sentAt });
    expect(state.firstInboundMessageId).toBe(first!.message.id); expect(state.bridgeInvalidatedAt === null).toBe(gap <= 12 * hour); expect(state.dispatchAuthorizedAt).toEqual(now);
    if (!frame.ok) throw new Error("Frame ausente"); expect(frame.frame.bridge !== null).toBe(gap <= 12 * hour);
    expect(frame.history.map((message) => message.content)).toEqual(gap <= 12 * hour
      ? ["Âncora factual", "Resposta real", "Resposta real", "Texto efetivamente submetido"]
      : ["Resposta real", "Texto efetivamente submetido"]);
    const excluded = await getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds: [first!.message.id, next!.message.id] }, { now: () => next!.message.sentAt });
    if (!excluded.ok) throw new Error("Frame ausente");
    expect(excluded.history.map((message) => message.content)).toEqual(gap <= 12 * hour ? ["Âncora factual", "Texto efetivamente submetido"] : ["Texto efetivamente submetido"]);
  });

  it("saida com órfão correlaciona identidade factual sem virar inbound ou mudar fase", async () => {
    const row = await fixture(), beforeAgent = await agent(row), beforeEpisode = await episode(row), wamid = `fixture-out-${randomUUID()}`;
    await db.insert(whatsappMessageReceipts).values({ tenantId, phoneNumberId: row.phoneNumberId, wamid, deliveredAt: now, classification: "free_service", pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false });
    const result = await inbound(row, now, { sender: "agente", externalId: wamid, content: "Texto efetivo de saída" });
    expect(result!.message).toMatchObject({ content: "Texto efetivo de saída", sender: "agente", externalId: wamid });
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, wamid))).toEqual([expect.objectContaining({ messageId: result!.message.id, classification: "free_service" })]);
    expect(await agent(row)).toEqual(beforeAgent); expect(await episode(row)).toEqual(beforeEpisode); expect(result!.anchorMessageId).toBe(row.anchor.id);
  });

  it("replay legado não enriquece canal e colisão em outra lead não cria conversa", async () => {
    const row = await fixture(), first = await inbound(row, now, { sender: "agente", whatsappPhoneNumberId: undefined });
    const replay = await inbound(row, now, { externalId: first!.message.externalId!, whatsappPhoneNumberId: row.phoneNumberId });
    expect(replay!.message).toEqual(first!.message); expect(replay!.message.whatsappPhoneNumberId).toBeNull();
    const [other] = await db.insert(leads).values({ tenantId, name: "Colisão", phone: "123", status: "em_qualificacao", firstContactAt: now }).returning();
    expect(await ingestAgentMessage(tenantId, other.id, { externalId: first!.message.externalId!, sender: "lead", content: "Não pode entrar", sentAt: now })).toBeNull();
    expect(await db.select().from(conversations).where(eq(conversations.leadId, other.id))).toEqual([]);
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, other.id))).toEqual([]);
  });

  it("rollback preserva mensagem/projeção/episódio; nova tentativa conclui cadeia uma vez", async () => {
    const row = await fixture("accepted"), beforeAgent = await agent(row), beforeEpisode = await episode(row), externalId = `fixture-${randomUUID()}`;
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(inbound(row, now, { externalId }, database)).rejects.toThrow("fixture-rollback");
    expect(await db.select().from(messages).where(eq(messages.externalId, externalId))).toEqual([]); expect(await agent(row)).toEqual(beforeAgent); expect(await episode(row)).toEqual(beforeEpisode);
    const result = await inbound(row, now, { externalId }); expect(result!.created).toBe(true); expect((await agent(row)).revision).toBe(2);
  });

  it("tenant alheio e instantes inválidos não gravam mensagem nem avançam contexto", async () => {
    const row = await fixture(), beforeAgent = await agent(row), beforeEpisode = await episode(row), externalId = `fixture-invalid-${randomUUID()}`;
    expect(await ingestAgentMessage(foreignTenant, row.lead.id, { externalId, sender: "lead", content: "Inválida", sentAt: now })).toBeNull();
    await expect(inbound(row, new Date(NaN), { externalId })).rejects.toThrow("invalid timestamp");
    await expect(ingestAgentMessage(tenantId, row.lead.id, { externalId, sender: "lead", content: "Inválida", sentAt: now }, { now: () => new Date(NaN) })).rejects.toThrow("invalid clock");
    expect(await db.select().from(messages).where(eq(messages.externalId, externalId))).toEqual([]); expect(await agent(row)).toEqual(beforeAgent); expect(await episode(row)).toEqual(beforeEpisode);
  });

  it("colisão concorrente entre leads devolve null após rollback da conversa perdedora", async () => {
    const row = await fixture(), externalId = `fixture-collision-${randomUUID()}`;
    const [other] = await db.insert(leads).values({ tenantId, name: "Perdedora", phone: "123", status: "em_qualificacao", firstContactAt: now }).returning();
    const a = await db.$client.connect(), b = await db.$client.connect(), pidA = deferred<number>(), pidB = deferred<number>(), inserted = deferred<void>(), release = deferred<void>();
    const winnerDb = drizzle(a, { schema }), loserDb = pinned(b, pidB);
    const held: Pick<typeof db, "transaction"> = { transaction: (callback, config) => winnerDb.transaction(async (tx) => {
      pidA.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid);
      const result = await callback(tx); inserted.resolve(); await release.promise; return result;
    }, config) };
    let pending: Promise<unknown>[] = [];
    try {
      const winning = inbound(row, now, { externalId }, held); pending = [winning]; await inserted.promise;
      const losing = ingestAgentMessage(tenantId, other.id, { externalId, sender: "lead", content: "Colisão", sentAt: now }, { now: () => now, database: loserDb }); pending.push(losing);
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks([pids[1]])).toBe(1);
      release.resolve(); const winner = await winning; expect(winner!.created).toBe(true); expect(await losing).toBeNull();
      expect(await db.select().from(conversations).where(eq(conversations.leadId, other.id))).toEqual([]);
      expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, other.id))).toEqual([]);
      expect(await db.select().from(messages).where(eq(messages.externalId, externalId))).toEqual([winner!.message]);
    } finally { release.resolve(); await Promise.allSettled(pending); a.release(); b.release(); }
  });

  it("duas conexões disputam autorização/inbound sob lead lock e só ordem vencedora produz candidato", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(); let pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      const auth = authorize(row, now, pinned(a, pidA)), incoming = inbound(row, new Date(now.getTime() + 1000), {}, pinned(b, pidB)); pending = [auth, incoming];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks(pids)).toBe(2);
      await blocker.query("COMMIT"); const [authorization, message] = await Promise.all([auth, incoming]), state = await episode(row);
      expect(message!.created).toBe(true); expect((await agent(row)).anchorMessageId).toBe(message!.message.id);
      if (authorization.ok && authorization.authorized) { expect(state).toMatchObject({ state: "authorized", dispatchAuthorizedAt: now, firstInboundMessageId: message!.message.id }); }
      else { expect(state).toMatchObject({ state: "cancelled", dispatchAuthorizedAt: null, firstInboundMessageId: null }); }
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("disputa real expiração/inbound nunca escala com âncora nova já persistida", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(), clock = new Date(row.anchor.sentAt.getTime() + 48 * hour); let pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      const expiry = expireEpisode({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => clock, database: pinned(a, pidA) });
      const incoming = inbound(row, clock, {}, pinned(b, pidB)); pending = [expiry, incoming]; const pids = await Promise.all([pidA.promise, pidB.promise]);
      expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks(pids)).toBe(2); await blocker.query("COMMIT");
      const [result, message] = await Promise.all([expiry, incoming]); expect(message!.created).toBe(true); expect((await agent(row)).anchorMessageId).toBe(message!.message.id);
      if (result.ok && result.action === "escalated") expect((await lead(row)).status).toBe("escalado_humano");
      else { expect(result).toEqual({ ok: false, reason: "context-changed" }); expect((await lead(row)).status).toBe("em_qualificacao"); }
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });
});
