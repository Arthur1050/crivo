import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import * as schema from "../../../../db/schema";
import { conversations, integrationRefusals, leadAgentState, leads, messages, reengagementEpisodes, tenantApiKeys, tenants, whatsappChannels } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/leads/[id]/reengagement/prepare/route";
import * as frameService from "../../../reengagement/context";
import * as repository from "../../../reengagement/repository";
import * as cloudApi from "../../../whatsapp/cloud-api";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), apiKey = `fixture-${randomUUID()}`;
const now = new Date("2026-10-06T15:00:00Z"), hour = 3600000; let contact = 5534999800000;
async function fixture(silence = 22 * hour, owner = tenantId) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T37", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now,
    whatsappPhoneNumberId: phoneNumberId, modality: "usado", region: "Centro", budgetCents: 50000000n }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const anchorAt = new Date(now.getTime() - silence);
  const [start, human, anchor, answer] = await db.insert(messages).values([
    { sender: "lead" as const, content: "Tenho interesse", sentAt: new Date(anchorAt.getTime() - hour) },
    { sender: "humano" as const, content: "Informação da equipe", authorName: "Ana", sentAt: new Date(anchorAt.getTime() - 1800000) },
    { sender: "lead" as const, content: "Pode confirmar as vagas?", sentAt: anchorAt },
    { sender: "agente" as const, content: "Vou verificar", sentAt: new Date(anchorAt.getTime() + 1800000) },
  ].map((row) => ({ ...row, tenantId: owner, conversationId: conversation.id, whatsappPhoneNumberId: phoneNumberId }))).returning();
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["Olá"] });
  return { lead, conversation, start, human, anchor, answer, phoneNumberId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function post(row: Fixture, body: unknown = { anchorMessageId: row.anchor.id }, options: { raw?: string; auth?: boolean; id?: string } = {}) {
  const id = options.id ?? row.lead.id;
  return POST(new Request(`http://local/api/v1/leads/${id}/reengagement/prepare`, { method: "POST", headers: { "Content-Type": "application/json", ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }) }, body: options.raw ?? JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, row.lead.id)))[0]; }
async function snapshot(row: Fixture) { return { lead: await db.select().from(leads).where(eq(leads.id, row.lead.id)),
  agent: await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)),
  messages: await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(messages.sentAt, messages.id) }; }
async function problem(response: Response, status: number, code: string) { expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ status, code }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema }); return { transaction: (callback, config) => database.transaction(async (tx) => {
    pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx);
  }, config) };
}
async function waitForLocks(pids: number[]) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const count = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting;
    if (count === pids.length) return count;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T37", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT37", keyHash: createHash("sha256").update(apiKey).digest("hex") });
});
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, ids)); await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids));
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids)); await db.delete(messages).where(inArray(messages.tenantId, ids));
  await db.delete(conversations).where(inArray(conversations.tenantId, ids)); await db.delete(leads).where(inArray(leads.tenantId, ids));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids)); await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
  await db.delete(tenants).where(inArray(tenants.id, ids)); await db.$client.end();
});

describe("T37 — prepare HTTP entrega somente claim próprio e frame factual", () => {
  it("201 retorna token/validade/revisão e frame completo, sem mutações do modelo nem transporte", async () => {
    const row = await fixture(), before = await snapshot(row), transport = vi.spyOn(cloudApi, "sendProactiveWhatsAppText");
    const response = await post(row); expect(response.status).toBe(201); const body = await response.json();
    expect(body).toEqual({ episodeId: expect.any(String), claimToken: expect.any(String), claimExpiresAt: new Date(now.getTime() + 300000).toISOString(), agentStateRevision: 1,
      frame: { tenantId, leadId: row.lead.id, episodeId: body.episodeId, phoneNumberId: row.phoneNumberId, channelRevision: 1, preparedAt: now.toISOString(),
        anchor: { id: row.anchor.id, sentAt: row.anchor.sentAt.toISOString() }, resetObservedAt: null,
        agent: { phase: "qualificando", revision: 1, askedFields: ["modality"], openingHistory: ["Olá"] },
        facts: { name: "Fixture T37", modality: "usado", region: "Centro", budgetCents: "50000000", propertyType: null, purchaseHorizon: null, motivation: null, creditStatus: null, chainedOperation: null, executiveSummary: null },
        pendingField: "propertyType", origin: { startMessageId: row.start.id, endMessageId: row.answer.id },
        history: [row.start, row.human, row.anchor, row.answer].map((message) => ({ id: message.id, sender: message.sender, content: message.content, sentAt: message.sentAt.toISOString(), authorName: message.authorName })) } });
    expect(await episode(row)).toMatchObject({ id: body.episodeId, claimToken: body.claimToken, claimExpiresAt: new Date(body.claimExpiresAt), state: "preparing", submittedText: null, dispatchAuthorizedAt: null,
      originSessionStartMessageId: row.start.id, originSessionEndMessageId: row.answer.id });
    expect(await snapshot(row)).toEqual(before); expect(transport).not.toHaveBeenCalled();
  });

  it("lease viva409 não devolve token/frame alheios nem reconstrói o frame", async () => {
    const row = await fixture(); const first = await post(row); expect(first.status).toBe(201); const before = await episode(row), frame = vi.spyOn(frameService, "prepareFrame");
    await problem(await post(row), 409, "episodio-em-preparacao"); expect(await episode(row)).toEqual(before); expect(frame).not.toHaveBeenCalled();
  });

  it("200 replay consumido devolve somente ID/estado sem token/frame", async () => {
    const row = await fixture(), first = await (await post(row)).json();
    await repository.authorizeDispatch({ tenantId }, row.lead.id, first.episodeId, { claimToken: first.claimToken, text: "Texto próprio" }, { expectedChannelRevision: 1 });
    const before = await episode(row), frame = vi.spyOn(frameService, "prepareFrame"), response = await post(row); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ episodeId: first.episodeId, state: "authorized" }); expect(await episode(row)).toEqual(before); expect(frame).not.toHaveBeenCalled();
  });

  it.each([22 * hour - 1, 24 * hour])("limite%s fora da janela409 sem episódio", async (silence) => {
    const row = await fixture(silence); await problem(await post(row), 409, "transicao-invalida"); expect(await episode(row)).toBeUndefined();
  });

  it("fora do horário409 sem episódio", async () => {
    const row = await fixture(); await db.update(tenants).set({ meetingDays: [1, 2, 3, 4, 5], meetingHoursStart: "13:00", meetingHoursEnd: "14:00" }).where(eq(tenants.id, tenantId));
    try { await problem(await post(row), 409, "transicao-invalida"); expect(await episode(row)).toBeUndefined(); }
    finally { await db.update(tenants).set({ meetingDays: null, meetingHoursStart: null, meetingHoursEnd: null }).where(eq(tenants.id, tenantId)); }
  });

  it.each(["unknown", "takeover", "optout"])("política %s recusada mantém erro operacional específico ou transição409", async (change) => {
    const row = await fixture();
    if (change === "unknown") await db.update(leadAgentState).set({ phase: null }).where(eq(leadAgentState.leadId, row.lead.id));
    else await db.update(leads).set(change === "takeover" ? { humanTakeoverAt: now } : { optedOutAt: now }).where(eq(leads.id, row.lead.id));
    await problem(await post(row), 409, change === "unknown" ? "estado-agente-desconhecido" : "transicao-invalida"); expect(await episode(row)).toBeUndefined();
  });

  it("401 antecede payload inválido e tenant/UUID errado404", async () => {
    const row = await fixture(), foreign = await fixture(22 * hour, foreignTenant);
    await problem(await post(row, {}, { auth: false }), 401, "nao-autenticado"); await problem(await post(foreign), 404, "recurso-nao-encontrado");
    await problem(await post(row, undefined, { id: "invalid" }), 404, "recurso-nao-encontrado"); expect(await episode(row)).toBeUndefined(); expect(await episode(foreign)).toBeUndefined();
  });

  it.each([{ anchorMessageId: "invalid" }, { tenantId }, { phase: "qualificando" }, { claimToken: randomUUID() }, { budgetCents: 1 }])("payload inválido ou controle do modelo400 (%#)", async (extra) => {
    const row = await fixture(); await problem(await post(row, { anchorMessageId: row.anchor.id, ...extra }), 400, "payload-invalido"); expect(await episode(row)).toBeUndefined();
  });

  it("JSON inválido400 e corpo>100KiB413 não adquirem claim", async () => {
    const row = await fixture(); await problem(await post(row, undefined, { raw: "{" }), 400, "payload-invalido");
    await problem(await post(row, undefined, { raw: " ".repeat(MAX_BODY_BYTES + 1) }), 413, "corpo-grande-demais"); expect(await episode(row)).toBeUndefined();
  });

  it.each(["anchor", "reset"])("%s divergente409 sem preparação", async (change) => {
    const row = await fixture(), other = await fixture();
    if (change === "reset") await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
    await problem(await post(row, { anchorMessageId: change === "anchor" ? other.anchor.id : row.anchor.id }), 409, "contexto-alterado"); expect(await episode(row)).toBeUndefined();
  });

  it("falha técnica de frame503 libera apenas preparação própria e permite novo201", async () => {
    const row = await fixture(); vi.spyOn(frameService, "prepareFrame").mockResolvedValueOnce({ ok: false, reason: "context-read-failed" });
    const response = await post(row); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: "estado-agente-desconhecido", detail: "Leitura técnica do contexto indisponível." });
    const released = await episode(row); expect(released).toMatchObject({ state: "preparing", claimToken: null, claimExpiresAt: null, dispatchAuthorizedAt: null, reasonCode: "context-read-failed" });
    const retry = await post(row); expect(retry.status).toBe(201); expect((await retry.json()).episodeId).toBe(released.id);
  });

  it.each(["context-read-failed", "episode-consumed"] as const)("falha de frame%s depois do marker nunca libera despacho", async (reason) => {
    const row = await fixture(); vi.spyOn(frameService, "prepareFrame").mockImplementationOnce(async (auth, id, episodeId, input) => {
      expect(await repository.authorizeDispatch(auth, id, episodeId, { claimToken: input.claimToken, text: "Texto marcado" }, { expectedChannelRevision: 1 })).toMatchObject({ ok: true, authorized: true });
      return { ok: false, reason };
    });
    await problem(await post(row), reason === "context-read-failed" ? 503 : 409, reason === "context-read-failed" ? "estado-agente-desconhecido" : "episodio-consumido");
    expect(await episode(row)).toMatchObject({ state: "authorized", dispatchAuthorizedAt: now, submittedText: "Texto marcado", claimToken: expect.any(String) });
    expect(await repository.claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id })).toMatchObject({ ok: true, acquired: false, state: "authorized" });
  });

  it("falha de frame com claim substituída preserva token novo", async () => {
    const row = await fixture(), replacement = randomUUID(); vi.spyOn(frameService, "prepareFrame").mockImplementationOnce(async (_auth, _id, episodeId) => {
      await db.update(reengagementEpisodes).set({ claimToken: replacement, claimExpiresAt: new Date(now.getTime() + 600000) }).where(eq(reengagementEpisodes.id, episodeId));
      return { ok: false, reason: "claim-conflict" };
    });
    await problem(await post(row), 409, "contexto-alterado"); expect(await episode(row)).toMatchObject({ state: "preparing", claimToken: replacement, claimExpiresAt: new Date(now.getTime() + 600000), reasonCode: null });
  });

  it("lease expira durante leitura409 sem liberar token antigo; nova aquisição troca token", async () => {
    const row = await fixture(), originalFrame = frameService.prepareFrame;
    vi.spyOn(frameService, "prepareFrame").mockImplementationOnce(async (...args) => { vi.setSystemTime(new Date(now.getTime() + 300000)); return originalFrame(...args); });
    await problem(await post(row), 409, "claim-expirada"); const expired = await episode(row);
    expect(expired).toMatchObject({ state: "preparing", claimToken: expect.any(String), claimExpiresAt: new Date(now.getTime() + 300000), reasonCode: null });
    const response = await post(row); expect(response.status).toBe(201); const acquired = await response.json();
    expect(acquired.episodeId).toBe(expired.id); expect(acquired.claimToken).not.toBe(expired.claimToken);
    expect(await episode(row)).toMatchObject({ claimToken: acquired.claimToken, claimExpiresAt: new Date(now.getTime() + 600000) });
  });

  it("disputa HTTP com duas conexões/PIDs reais entrega um201 e um409", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect(), pidA = deferred<number>(), pidB = deferred<number>();
    const originalClaim = repository.claimPreparation; let calls = 0, pending: ReturnType<typeof post>[] = [];
    vi.spyOn(repository, "claimPreparation").mockImplementation((auth, id, input) => {
      const index = calls++; return originalClaim(auth, id, input, { database: pinned(index === 0 ? a : b, index === 0 ? pidA : pidB) });
    });
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]); pending = [post(row), post(row)];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks(pids)).toBe(2); await blocker.query("COMMIT");
      const responses = await Promise.all(pending); expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const winner = await responses.find((response) => response.status === 201)!.json();
      await problem(responses.find((response) => response.status === 409)!, 409, "episodio-em-preparacao");
      expect(await episode(row)).toMatchObject({ id: winner.episodeId, claimToken: winner.claimToken, state: "preparing", dispatchAuthorizedAt: null });
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("outros verbos405 mantêm AllowPOST", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
