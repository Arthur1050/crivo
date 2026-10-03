import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import principal from "../../../../n8n/workflows/principal";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import { ingestAgentMessage, optOutLeadByHuman } from "../../data";
import { authorizeDispatch, claimPreparation, reconcileAcceptance } from "../../reengagement/repository";
import { getSessionFrame, prepareFrame } from "../../reengagement/context";
import { optOutLead } from "../lgpd";

const tenantId = randomUUID(), foreignTenant = randomUUID(), now = new Date("2026-10-06T15:00:00.500Z"), hour = 3600000;
let contact = 5534999900000;
async function fixture(stage: "preparing" | "authorized" | "accepted" = "preparing") {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T29", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId, region: "Centro" }).returning();
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
function ack(row: Fixture) {
  const clock = new Date(now.getTime() + 1000);
  return reconcileAcceptance({ tenantId }, row.lead.id, row.episodeId, { wamid: `fixture-ack-${row.episodeId}`, acceptedAt: clock }, { now: () => clock });
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
beforeAll(async () => { await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T29", agentName: "Agente", supportedModality: "ambos" as const }))); });
afterAll(async () => {
  await db.delete(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantId)); await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId));
  await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId)); await db.delete(messages).where(eq(messages.tenantId, tenantId)); await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId)); await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.$client.end();
});

describe("T29 — opt-out da integração invalida ponte no mesmo commit", () => {
  it.each(["HTTP: POST /leads/{id}/opt-out", "HTTP: POST /leads/{id}/opt-out (linguagem natural)"])("%s usa mesmo serviço factual de descarte", async (name) => {
    const graph = principal.toJSON() as unknown as { nodes: { name: string; parameters: { method: string; url: string; headerParameters: { parameters: { name: string; value: string }[] } } }[] };
    const node = graph.nodes.find((candidate) => candidate.name === name);
    expect(node).toBeDefined();
    expect(node!.parameters.method).toBe("POST");
    expect(node!.parameters.url).toContain("/leads/{{ $('Code: gate').first().json.id }}/opt-out");
    expect(node!.parameters.headerParameters.parameters).toEqual([{ name: "X-Crivo-Tenant", value: "={{ $('Code: gate').first().json.tenantSlug }}" }]);
    const row = await fixture();
    expect(await optOutLead(tenantId, row.lead.id, { now: () => now })).toEqual({ optedOutAt: now });
    expect(await episode(row)).toMatchObject({ state: "cancelled", dispatchAuthorizedAt: null, claimToken: null, bridgeInvalidatedAt: now });
    expect(await agent(row)).toMatchObject({ phase: null, revision: 2, anchorMessageId: row.anchor.id, askedFields: [], openingHistory: [] });
    expect((await lead(row)).memoryResetRequestedAt).toEqual(now);
  });

  it("replay conserva timestamp e snapshots completos, inclusive quando CRM repete a ação", async () => {
    const row = await fixture("accepted");
    await optOutLead(tenantId, row.lead.id, { now: () => now });
    const beforeEpisode = await episode(row), beforeAgent = await agent(row), beforeLead = await lead(row);
    expect(await optOutLead(tenantId, row.lead.id, { now: () => new Date(now.getTime() + hour) })).toEqual({ optedOutAt: now });
    expect(await optOutLeadByHuman({ tenantId, assignedUserId: null }, row.lead.id, new Date(now.getTime() + 2 * hour))).toEqual({ optedOutAt: now, newlyOptedOut: false });
    expect(await episode(row)).toEqual(beforeEpisode); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(beforeLead);
  });

  it("pré-autorização cancela preparo e não permite envio posterior", async () => {
    const row = await fixture(); await optOutLead(tenantId, row.lead.id, { now: () => now });
    expect(await authorize(row)).toEqual({ ok: true, authorized: false, episodeId: row.episodeId, state: "cancelled" });
    expect(await episode(row)).toMatchObject({ dispatchAuthorizedAt: null, dispatchCompletionDeadline: null, submittedText: null });
    expect((await lead(row)).region).toBe("Centro"); expect((await lead(row)).status).toBe("em_qualificacao");
  });

  it("opt-out após marcador preserva tentativa e ack tardio registra fato sem religar ponte", async () => {
    const row = await fixture("authorized"), before = await episode(row);
    await optOutLead(tenantId, row.lead.id, { now: () => now });
    expect(await episode(row)).toEqual({ ...before, bridgeInvalidatedAt: now, bridgeRevision: before.bridgeRevision + 1, updatedAt: now });
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true });
    expect(await episode(row)).toMatchObject({ state: "accepted", submittedText: before.submittedText, dispatchAuthorizedAt: before.dispatchAuthorizedAt, dispatchCompletionDeadline: before.dispatchCompletionDeadline, bridgeInvalidatedAt: now });
    expect(await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => now })).toMatchObject({ ok: true, frame: { bridge: null }, history: [] });
  });

  it("ponte consumida perde continuidade e histórico antigo não retorna pelo novo inbound", async () => {
    const row = await fixture("accepted"), firstAt = new Date(now.getTime() + hour);
    await ingestAgentMessage(tenantId, row.lead.id, { externalId: `fixture-first-${randomUUID()}`, sender: "lead", content: "Primeira resposta", sentAt: firstAt, whatsappPhoneNumberId: row.phoneNumberId }, { now: () => firstAt });
    expect(await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => firstAt })).toMatchObject({ ok: true, frame: { bridge: { state: "accepted" } } });
    const reset = new Date(firstAt.getTime() + hour); await optOutLead(tenantId, row.lead.id, { now: () => reset });
    expect(await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => reset })).toMatchObject({ ok: true, frame: { bridge: null }, history: [] });
    const clock = new Date(reset.getTime() + 1);
    const next = await ingestAgentMessage(tenantId, row.lead.id, { externalId: `fixture-next-${randomUUID()}`, sender: "lead", content: "Novo fato recebido", sentAt: clock, whatsappPhoneNumberId: row.phoneNumberId }, { now: () => clock });
    const frame = await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => clock });
    if (!frame.ok) throw new Error("Frame ausente");
    expect(frame.frame.bridge).toBeNull(); expect(frame.history.map((message) => message.id)).toEqual([next!.message.id]);
    expect((await episode(row)).bridgeInvalidatedAt).toEqual(reset); expect((await lead(row)).optedOutAt).toEqual(reset);
  });

  it("tenant alheio/inexistente retorna null sem fatos, projeção ou episódios cruzados", async () => {
    const row = await fixture(), before = await episode(row), beforeAgent = await agent(row);
    expect(await optOutLead(foreignTenant, row.lead.id, { now: () => now })).toBeNull();
    expect(await optOutLead(tenantId, randomUUID(), { now: () => now })).toBeNull();
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(row.lead);
  });

  it("rollback mantém opt-out/reset/projeção/episódio juntos no estado anterior", async () => {
    const row = await fixture("accepted"), before = await episode(row), beforeAgent = await agent(row);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(optOutLead(tenantId, row.lead.id, { now: () => now, database })).rejects.toThrow("fixture-rollback");
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(row.lead);
  });

  it("clock inválido recusa a escrita sem fabricar instante de descarte", async () => {
    const row = await fixture(), before = await episode(row), beforeAgent = await agent(row);
    await expect(optOutLead(tenantId, row.lead.id, { now: () => new Date(NaN) })).rejects.toThrow("invalid clock");
    expect(await episode(row)).toEqual(before); expect(await agent(row)).toEqual(beforeAgent); expect(await lead(row)).toEqual(row.lead);
  });

  it("opt-out sem projeção/episódio mantém o contrato exato e registra reset", async () => {
    const [row] = await db.insert(leads).values({ tenantId, name: "Legado", phone: "123", status: "em_qualificacao", firstContactAt: now }).returning();
    expect(await optOutLead(tenantId, row.id, { now: () => now })).toEqual({ optedOutAt: now });
    const [after] = await db.select().from(leads).where(eq(leads.id, row.id));
    expect(after).toEqual({ ...row, optedOutAt: now, memoryResetRequestedAt: now });
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.id))).toEqual([]);
    expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, row.id))).toEqual([]);
  });

  it("autorização e opt-out disputam lead em PIDs independentes sem recolher vencedor autorizado", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(); let pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      const auth = authorize(row, pinned(a, pidA)), optout = optOutLead(tenantId, row.lead.id, { now: () => now, database: pinned(b, pidB) }); pending = [auth, optout];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks(pids)).toBe(2);
      await blocker.query("COMMIT"); const [authorization, result] = await Promise.all([auth, optout]), state = await episode(row);
      expect(result).toEqual({ optedOutAt: now }); expect(state.bridgeInvalidatedAt).toEqual(now); expect((await agent(row)).phase).toBeNull();
      if (authorization.ok && authorization.authorized) expect(state).toMatchObject({ state: "authorized", dispatchAuthorizedAt: now, submittedText: "Texto efetivamente submetido", dispatchCompletionDeadline: new Date(now.getTime() + 120000) });
      else expect(state).toMatchObject({ state: "cancelled", dispatchAuthorizedAt: null, submittedText: null });
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("clock do serviço é lido após lock de episódio observado", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), writer = await db.$client.connect(), pid = deferred<number>();
    let calls = 0, pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM reengagement_episodes WHERE id=$1 FOR UPDATE", [row.episodeId]);
      const action = optOutLead(tenantId, row.lead.id, { database: pinned(writer, pid), now: () => { calls++; return now; } }); pending = [action];
      expect(await waitForLocks([await pid.promise])).toBe(1); expect(calls).toBe(0);
      await blocker.query("COMMIT"); expect(await action).toEqual({ optedOutAt: now }); expect(calls).toBe(1);
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); writer.release(); }
  });
});
