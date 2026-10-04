import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import * as schema from "../../../../db/schema";
import { conversations, integrationRefusals, leadAgentState, leads, messages, reengagementEpisodes, tenantApiKeys, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/leads/[id]/reengagement/[episodeId]/acknowledgement/route";
import * as repository from "../../../reengagement/repository";
import { ingestMessage } from "../../messages";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), apiKey = `fixture-${randomUUID()}`;
const now = new Date("2026-10-06T15:00:00.500Z"), acceptedAt = new Date(now.getTime() + 1000), hour = 3600000;
const text = "Texto efetivamente submetido T40"; let contact = 5534999830000;
let fakeFetch: ReturnType<typeof vi.fn<typeof fetch>>;
async function fixture(owner = tenantId, authorize = true) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), wamid = `fixture-${randomUUID()}`;
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: now, usageEnabled: false });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T40", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now,
    whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "lead", content: "Inbound próprio T40", sentAt: new Date(now.getTime() - 22 * hour), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const claim = await repository.claimPreparation({ tenantId: owner }, lead.id, { anchorMessageId: anchor.id });
  if (!claim.ok || !claim.acquired) throw new Error("Fixture sem claim");
  await db.update(reengagementEpisodes).set({ originSessionStartMessageId: anchor.id, originSessionEndMessageId: anchor.id }).where(eq(reengagementEpisodes.id, claim.episodeId));
  if (authorize) {
    const dispatch = await repository.authorizeDispatch({ tenantId: owner }, lead.id, claim.episodeId, { claimToken: claim.claimToken, text }, { expectedChannelRevision: 1 });
    if (!dispatch.ok || !dispatch.authorized) throw new Error("Fixture sem autorização");
  }
  return { lead, conversation, anchor, phoneNumberId, wamid, ...claim };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function post(row: Fixture, body: unknown = { wamid: row.wamid, acceptedAt: acceptedAt.toISOString() }, options: { raw?: string; auth?: boolean; id?: string; episodeId?: string } = {}) {
  const id = options.id ?? row.lead.id, episodeId = options.episodeId ?? row.episodeId;
  return POST(new Request(`http://local/api/v1/leads/${id}/reengagement/${episodeId}/acknowledgement`, { method: "POST", headers: { "Content-Type": "application/json", ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }) },
    body: options.raw ?? JSON.stringify(body) }), { params: Promise.resolve({ id, episodeId }) });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
async function outputs(row: Fixture) { return (await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).filter((message) => message.sender === "agente"); }
async function projection(row: Fixture) { return { lead: await db.select().from(leads).where(eq(leads.id, row.lead.id)), agent: await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)) }; }
async function problem(response: Response, status: number, code: string) { expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ status, code }); }
async function inbound(row: Fixture, sentAt: Date) {
  const result = await ingestMessage(tenantId, row.lead.id, { externalId: `fixture-${randomUUID()}`, sender: "lead", content: "Resposta própria T40", sentAt, whatsappPhoneNumberId: row.phoneNumberId });
  if (!result.ok) throw new Error("Fixture sem inbound");
  return result.message;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema }); return { transaction: (callback, config) => database.transaction(async (tx) => {
    pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx);
  }, config) };
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T40", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT40", keyHash: createHash("sha256").update(apiKey).digest("hex") });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  fakeFetch = vi.fn<typeof fetch>(async () => { throw new Error("Transporte proibido no acknowledgement"); }); vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => { expect(fakeFetch).not.toHaveBeenCalled(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, ids)); await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
  await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids)); await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
  await db.delete(messages).where(inArray(messages.tenantId, ids)); await db.delete(conversations).where(inArray(conversations.tenantId, ids)); await db.delete(leads).where(inArray(leads.tenantId, ids));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids)); await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
  await db.delete(tenants).where(inArray(tenants.id, ids)); await db.$client.end();
});

describe("T40 — acknowledgement HTTP persiste somente fatos conhecidos, sem transporte", () => {
  it("aceite pendente200 grava texto/autoria/canal real e retorna allowlist factual", async () => {
    const row = await fixture(); await db.update(reengagementEpisodes).set({ state: "accepted_pending_record", wamid: row.wamid, acceptedAt }).where(eq(reengagementEpisodes.id, row.episodeId));
    const before = await episode(row), state = await projection(row), response = await post(row, {}); expect(response.status).toBe(200); const body = await response.json();
    expect(body).toEqual({ recorded: true, replay: false, episodeId: row.episodeId, messageId: expect.any(String) });
    expect(await outputs(row)).toEqual([{ id: body.messageId, tenantId, conversationId: row.conversation.id, sender: "agente", content: text, sentAt: acceptedAt, externalId: row.wamid,
      whatsappPhoneNumberId: row.phoneNumberId, authorUserId: null, authorName: null }]);
    expect(await episode(row)).toEqual({ ...before, state: "accepted", messageId: body.messageId }); expect(await projection(row)).toEqual(state);
    expect((await db.select().from(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, row.phoneNumberId)))[0].usageEnabled).toBe(false);
  });

  it("replay sem reenviar identidade preserva mensagem, bridge e todos os timestamps", async () => {
    const row = await fixture(); await post(row); const before = await episode(row), stored = await outputs(row), state = await projection(row);
    vi.setSystemTime(new Date(now.getTime() + 10 * hour)); const response = await post(row, { wamid: null, acceptedAt: null }); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: true, replay: true, episodeId: row.episodeId, messageId: before.messageId });
    expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual(stored); expect(await projection(row)).toEqual(state);
  });

  it("offset ISO válido persiste o mesmo instante sem exigir literal UTC", async () => {
    const row = await fixture(); expect((await post(row, { wamid: row.wamid, acceptedAt: "2026-10-06T12:00:01.500-03:00" })).status).toBe(200);
    expect((await outputs(row))[0].sentAt).toEqual(acceptedAt);
  });

  it.each([{}, { wamid: null, acceptedAt: null }])("sem identidade200 fica uncertain sem fabricar mensagem ou ponte (%#)", async (body) => {
    const row = await fixture(), before = await episode(row); const response = await post(row, body); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recorded: false, episodeId: row.episodeId, state: "uncertain" });
    expect(await episode(row)).toEqual({ ...before, state: "uncertain", reasonCode: "acceptance-identity-missing" }); expect(await outputs(row)).toEqual([]);
    expect(await repository.claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id })).toMatchObject({ ok: true, acquired: false, state: "uncertain" });
  });

  it("identidade real completa após deadline/lease reconcilia uncertain sem novo claim", async () => {
    const row = await fixture(); await post(row, {}); const before = await episode(row); vi.setSystemTime(new Date(now.getTime() + 600000));
    expect((await post(row)).status).toBe(200); expect(await episode(row)).toMatchObject({ state: "accepted", wamid: row.wamid, acceptedAt,
      dispatchAuthorizedAt: before.dispatchAuthorizedAt, dispatchCompletionDeadline: before.dispatchCompletionDeadline, claimToken: before.claimToken }); expect(await outputs(row)).toHaveLength(1);
  });

  it("wamid divergente409 não rebaixa identidade durável nem cria outra mensagem", async () => {
    const row = await fixture(); await post(row); const before = await episode(row), stored = await outputs(row);
    await problem(await post(row, { wamid: `different-${randomUUID()}`, acceptedAt: acceptedAt.toISOString() }), 409, "contexto-alterado");
    expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual(stored);
  });

  it("wamid de outra conversa409 conserva episódio e mensagem alheia", async () => {
    const row = await fixture(), other = await fixture(), before = await episode(row);
    const [existing] = await db.insert(messages).values({ tenantId, conversationId: other.conversation.id, sender: "agente", content: text, sentAt: acceptedAt, externalId: row.wamid, whatsappPhoneNumberId: other.phoneNumberId }).returning();
    await problem(await post(row), 409, "contexto-alterado"); expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual([]); expect(await outputs(other)).toEqual([existing]);
  });

  it("tenant/lead/episode e UUIDs404 não alteram owner ou claim", async () => {
    const row = await fixture(), foreign = await fixture(foreignTenant), other = await fixture(), before = await episode(row), foreignBefore = await episode(foreign);
    await problem(await post(foreign), 404, "recurso-nao-encontrado"); await problem(await post(row, undefined, { id: other.lead.id }), 404, "recurso-nao-encontrado");
    for (const options of [{ id: "invalid" }, { episodeId: "invalid" }, { id: randomUUID() }, { episodeId: randomUUID() }]) await problem(await post(row, undefined, options), 404, "recurso-nao-encontrado");
    expect(await episode(row)).toEqual(before); expect(await episode(foreign)).toEqual(foreignBefore); expect(await outputs(row)).toEqual([]);
  });

  it("sem autorização409 não fabrica marker/mensagem", async () => {
    const row = await fixture(tenantId, false), before = await episode(row); await problem(await post(row), 409, "episodio-consumido"); expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual([]);
  });

  it.each(["2026-02-30T15:00:00Z", "2026-13-01T15:00:00Z", "2026-10-06T24:00:00Z", "2026-10-06", "NaN", 42])("acceptedAt inválido400 sem normalizar calendário (%#)", async (date) => {
    const row = await fixture(), before = await episode(row); await problem(await post(row, { wamid: row.wamid, acceptedAt: date }), 400, "payload-invalido"); expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual([]);
  });

  it.each([{ wamid: " \t" }, { wamid: 1 }, { claimToken: randomUUID() }, { tenantId }, { model: "fixture" }, { text }, { phoneNumberId: "123" }, { now: now.toISOString() }])("shape/controle extra400 não altera episódio (%#)", async (extra) => {
    const row = await fixture(), before = await episode(row); await problem(await post(row, { wamid: row.wamid, acceptedAt: acceptedAt.toISOString(), ...extra }), 400, "payload-invalido"); expect(await episode(row)).toEqual(before);
  });

  it("wamid sem acceptedAt factual400 não presume horário de aceite", async () => {
    const row = await fixture(), before = await episode(row); await problem(await post(row, { wamid: row.wamid }), 400, "payload-invalido"); expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual([]);
  });

  it("401/JSON400/corpo413 não reconciliam e instrumentação não registra texto pessoal", async () => {
    const row = await fixture(), before = await episode(row), log = vi.spyOn(console, "error").mockImplementation(() => {});
    await problem(await post(row, undefined, { auth: false, raw: "{" }), 401, "nao-autenticado"); await problem(await post(row, undefined, { raw: "{" }), 400, "payload-invalido");
    await problem(await post(row, undefined, { raw: " ".repeat(MAX_BODY_BYTES + 1) }), 413, "corpo-grande-demais"); expect(await episode(row)).toEqual(before); expect(log).not.toHaveBeenCalled();
    const records = await db.select().from(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantId)); expect(JSON.stringify(records)).not.toContain(text); expect(JSON.stringify(records)).not.toContain(row.claimToken);
  });

  it("dois inbounds reais T27 preservam primeiro candidato e último inbound no ack/replay", async () => {
    const row = await fixture(), first = await inbound(row, new Date(now.getTime() - 500)), latest = await inbound(row, new Date(now.getTime() + 500));
    const before = await episode(row), state = await projection(row); expect(before.firstInboundMessageId).toBe(first.id); expect(state.agent[0]).toMatchObject({ anchorMessageId: latest.id, phase: null, revision: 3 });
    const response = await post(row); expect(response.status).toBe(200); const body = await response.json();
    expect(await episode(row)).toMatchObject({ firstInboundMessageId: first.id, bridgeLastInboundAt: latest.sentAt, bridgeInvalidatedAt: null, state: "accepted", dispatchAuthorizedAt: now, dispatchCompletionDeadline: before.dispatchCompletionDeadline });
    expect(await projection(row)).toEqual(state); const accepted = await episode(row); expect((await post(row, {})).status).toBe(200); expect(await episode(row)).toEqual(accepted); expect(await outputs(row)).toHaveLength(1); expect(body.recorded).toBe(true);
  });

  it.each(["takeover", "reset"])("%s pós-marker registra aceite sem reativar ponte", async (change) => {
    const row = await fixture(), first = await inbound(row, new Date(now.getTime() - 500));
    await db.update(leads).set(change === "takeover" ? { humanTakeoverAt: now } : { memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
    const state = await projection(row); expect((await post(row)).status).toBe(200); const before = await episode(row);
    expect(before).toMatchObject({ state: "accepted", firstInboundMessageId: first.id, bridgeInvalidatedAt: now, wamid: row.wamid, dispatchAuthorizedAt: now });
    expect(await projection(row)).toEqual(state); expect((await post(row, {})).status).toBe(200); expect(await episode(row)).toEqual(before); expect(await outputs(row)).toHaveLength(1);
  });

  it("disputa HTTP com dois PIDs reais grava uma mensagem e um replay", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect(), pidA = deferred<number>(), pidB = deferred<number>();
    const original = repository.reconcileAcceptance; let calls = 0, pending: ReturnType<typeof post>[] = [];
    vi.spyOn(repository, "reconcileAcceptance").mockImplementation((auth, id, episodeId, input) => {
      const index = calls++; return original(auth, id, episodeId, input, { database: pinned(index === 0 ? a : b, index === 0 ? pidA : pidB) });
    });
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]); pending = [post(row), post(row)];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); let waiting = 0;
      for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
        waiting = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(2); await blocker.query("COMMIT"); const responses = await Promise.all(pending); expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const bodies = await Promise.all(responses.map((response) => response.json())), stored = await outputs(row); expect(stored).toHaveLength(1);
      expect(bodies.map((body) => body.replay).sort()).toEqual([false, true]); for (const body of bodies) expect(body).toEqual({ recorded: true, replay: body.replay, episodeId: row.episodeId, messageId: stored[0].id });
      expect(await episode(row)).toMatchObject({ state: "accepted", messageId: stored[0].id, submittedText: text, dispatchAuthorizedAt: now, acceptedAt, wamid: row.wamid });
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("outros verbos405 mantêm AllowPOST", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
