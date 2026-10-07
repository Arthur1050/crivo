import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import * as schema from "../../../../db/schema";
import { conversations, integrationRefusals, leadAgentState, leads, messages, reengagementEpisodes, tenantApiKeys, tenant_members, tenants, users, whatsappChannels } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/leads/[id]/reengagement/expire/route";
import * as repository from "../../../reengagement/repository";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), brokerId = randomUUID(), apiKey = `fixture-${randomUUID()}`;
const now = new Date("2026-10-06T15:00:00Z"), hour = 3600000; let contact = 5534999840000;
type State = typeof reengagementEpisodes.$inferSelect.state;
let fakeFetch: ReturnType<typeof vi.fn<typeof fetch>>;
async function fixture(silence = 48 * hour, state: State | null = null, owner = tenantId, patch: Partial<typeof leads.$inferInsert> = {}) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: now, usageEnabled: false });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T41", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao",
    firstContactAt: now, whatsappPhoneNumberId: phoneNumberId, executiveSummary: "Resumo preservado", ...patch }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "lead", content: "Inbound próprio T41",
    sentAt: new Date(now.getTime() - silence), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const authorizedAt = new Date(anchor.sentAt.getTime() + 22 * hour), accepted = state === "accepted" || state === "accepted_pending_record";
  const consumed = state !== null && !["preparing", "cancelled", "omitted"].includes(state);
  let messageId: string | null = null;
  const wamid = `fixture-${randomUUID()}`;
  if (state === "accepted") [messageId] = (await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "agente", content: "Retomada factual T41",
    sentAt: authorizedAt, externalId: wamid, whatsappPhoneNumberId: phoneNumberId }).returning({ id: messages.id })).map((row) => row.id);
  if (state !== null) await db.insert(reengagementEpisodes).values({ tenantId: owner, leadId: lead.id, phoneNumberId, anchorMessageId: anchor.id, anchorSentAt: anchor.sentAt,
    agentStateRevision: 1, state, ...(state === "preparing" ? { claimToken: randomUUID(), claimExpiresAt: new Date(authorizedAt.getTime() + 300000) } : {}),
    ...(consumed ? { dispatchAuthorizedAt: authorizedAt, dispatchCompletionDeadline: new Date(authorizedAt.getTime() + 120000), submittedText: "Retomada factual T41" } : {}),
    ...(accepted ? { wamid, acceptedAt: authorizedAt, messageId } : {}), createdAt: authorizedAt, updatedAt: authorizedAt });
  return { lead, conversation, anchor, phoneNumberId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function post(row: Fixture, body: unknown = { anchorMessageId: row.anchor.id }, options: { raw?: string; auth?: boolean; id?: string } = {}) {
  const id = options.id ?? row.lead.id;
  return POST(new Request(`http://local/api/v1/leads/${id}/reengagement/expire`, { method: "POST", headers: { "Content-Type": "application/json", ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }) },
    body: options.raw ?? JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}
async function episodes(row: Fixture) { return db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, row.lead.id)); }
async function storedLead(row: Fixture) { return (await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]; }
async function untouched(row: Fixture) { return { agent: await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)),
  messages: await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(messages.id) }; }
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
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T41", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT41", keyHash: createHash("sha256").update(apiKey).digest("hex") });
  await db.insert(users).values({ id: brokerId, name: "Corretor T41", email: `${brokerId}@fixture.test` });
  await db.insert(tenant_members).values({ organizationId: tenantId, userId: brokerId, role: "corretor", createdAt: new Date("2026-01-01T00:00:00Z"), workDays: [1, 2, 3, 4, 5], workHoursStart: "09:00", workHoursEnd: "18:00" });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  fakeFetch = vi.fn<typeof fetch>(async () => { throw new Error("Transporte proibido no expire"); }); vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => { expect(fakeFetch).not.toHaveBeenCalled(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, ids)); await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids));
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids)); await db.delete(messages).where(inArray(messages.tenantId, ids));
  await db.delete(conversations).where(inArray(conversations.tenantId, ids)); await db.delete(leads).where(inArray(leads.tenantId, ids));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids)); await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
  await db.delete(tenant_members).where(eq(tenant_members.organizationId, tenantId)); await db.delete(tenants).where(inArray(tenants.id, ids));
  await db.delete(users).where(eq(users.id, brokerId)); await db.$client.end();
});

describe("T41 — expire HTTP expõe omissão e escalada protegidas sem transporte", () => {
  it("24h retorna omitted200 e replay unchanged200 conserva tombstone e pipeline", async () => {
    const row = await fixture(24 * hour), before = await untouched(row), response = await post(row);
    expect(response.status).toBe(200); const body = await response.json(); expect(body).toEqual({ action: "omitted", episodeId: expect.any(String) });
    const saved = await episodes(row); expect(saved).toEqual([expect.objectContaining({ id: body.episodeId, tenantId, leadId: row.lead.id, anchorMessageId: row.anchor.id,
      phoneNumberId: row.phoneNumberId, state: "omitted", reasonCode: "window-closed", dispatchAuthorizedAt: null, escalatedAt: null })]);
    vi.setSystemTime(new Date(now.getTime() + 1)); const replay = await post(row); expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ...body, action: "unchanged" }); expect(await episodes(row)).toEqual(saved); expect(await storedLead(row)).toEqual(row.lead); expect(await untouched(row)).toEqual(before);
  });
  it("24h omite preparação e limpa claim sem marcar despacho", async () => {
    const row = await fixture(24 * hour, "preparing"), [before] = await episodes(row), response = await post(row); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action: "omitted", episodeId: before.id });
    expect(await episodes(row)).toEqual([{ ...before, state: "omitted", reasonCode: "window-closed", claimToken: null, claimExpiresAt: null, updatedAt: now }]); expect(await storedLead(row)).toEqual(row.lead);
  });
  it.each(["accepted", "accepted_pending_record", "refused", "uncertain", "authorized"] as const)("24h conserva resultado %s consumido", async (state) => {
    const row = await fixture(24 * hour, state), before = await episodes(row), facts = await untouched(row), response = await post(row); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action: "unchanged", episodeId: before[0].id }); expect(await episodes(row)).toEqual(before); expect(await storedLead(row)).toEqual(row.lead); expect(await untouched(row)).toEqual(facts);
  });
  it("antes24h409 e antes48h omitted200 não escalam", async () => {
    const early = await fixture(24 * hour - 1); await problem(await post(early), 409, "transicao-invalida"); expect(await episodes(early)).toEqual([]); expect(await storedLead(early)).toEqual(early.lead);
    const row = await fixture(48 * hour - 1), response = await post(row); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ action: "omitted" });
    expect(await storedLead(row)).toEqual(row.lead); expect((await episodes(row))[0].escalatedAt).toBeNull();
  });
  it.each([["accepted", "accepted", "aceita"], ["accepted_pending_record", "accepted", "aceita"], ["refused", "refused", "recusada"],
    ["uncertain", "uncertain", "incerta"], ["authorized", "uncertain", "incerta"], [null, "omitted", "omitida"]] as const)("48h200 expõe resultado factual %s independente do envio", async (state, result, label) => {
    const row = await fixture(48 * hour, state), before = await untouched(row), response = await post(row); expect(response.status).toBe(200); const body = await response.json();
    expect(body).toEqual({ action: "escalated", episodeId: expect.any(String), brokerId, result });
    expect(await storedLead(row)).toMatchObject({ assignedUserId: brokerId, status: "escalado_humano", statusChangedBy: "agente", escalationReason: `Ausência de resposta por 48h; retomada ${label}.` });
    const saved = await episodes(row); expect(saved).toEqual([expect.objectContaining({ id: body.episodeId, escalatedAt: now, escalationResult: result, escalationReasonCode: "silence-48h" })]);
    expect(await untouched(row)).toEqual(before); const lead = await storedLead(row), replay = await post(row); expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ action: "unchanged", episodeId: body.episodeId }); expect(await episodes(row)).toEqual(saved); expect(await storedLead(row)).toEqual(lead);
  });
  it("preserva responsável anterior e escala fora do horário sem Analytics", async () => {
    const row = await fixture(48 * hour, "refused", tenantId, { assignedUserId: brokerId }); vi.setSystemTime(new Date("2026-10-11T03:00:00Z"));
    const response = await post(row); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ action: "escalated", brokerId, result: "refused" });
    expect(await storedLead(row)).toMatchObject({ assignedUserId: brokerId, status: "escalado_humano" });
  });
  it("trava de status humano409 preserva episódio e pipeline", async () => {
    const row = await fixture(48 * hour, "accepted", tenantId, { statusChangedBy: "humano" }), before = await episodes(row), facts = await untouched(row);
    await problem(await post(row), 409, "lead-travado-por-humano"); expect(await episodes(row)).toEqual(before); expect(await storedLead(row)).toEqual(row.lead); expect(await untouched(row)).toEqual(facts);
  });
  it.each([{ optedOutAt: now }, { humanTakeoverAt: now }, { status: "qualificado_agendado" as const }])("opt-out/condução/agendado409 protege saída factual %#", async (patch) => {
    const row = await fixture(48 * hour, "accepted", tenantId, patch), before = await episodes(row);
    await problem(await post(row), 409, "transicao-invalida"); expect(await episodes(row)).toEqual(before); expect(await storedLead(row)).toEqual(row.lead);
  });
  it("fase encerrada409 não escala", async () => {
    const row = await fixture(); await db.update(leadAgentState).set({ phase: "encerrada" }).where(eq(leadAgentState.leadId, row.lead.id));
    await problem(await post(row), 409, "transicao-invalida"); expect(await episodes(row)).toEqual([]); expect(await storedLead(row)).toEqual(row.lead);
  });
  it("fase não publicada (turno do agente falhou) escala200: a rede de segurança não depende do agente", async () => {
    const row = await fixture(); await db.update(leadAgentState).set({ phase: null }).where(eq(leadAgentState.leadId, row.lead.id));
    const response = await post(row); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action: "escalated", episodeId: expect.any(String), brokerId, result: "omitted" });
    expect(await storedLead(row)).toMatchObject({ status: "escalado_humano", assignedUserId: brokerId });
  });
  it.each([null, "accepted"] as const)("canal não verificado200 escala; episódio %s não é criado nem herdado", async (state) => {
    const row = await fixture(48 * hour, state), before = await episodes(row);
    await db.update(whatsappChannels).set({ ownershipVerifiedAt: null }).where(eq(whatsappChannels.phoneNumberId, row.phoneNumberId));
    const response = await post(row); expect(response.status).toBe(200); const body = await response.json();
    expect(body).toEqual({ action: "escalated", episodeId: state === null ? null : before[0].id, brokerId, result: state === null ? "omitted" : "accepted" });
    expect(await storedLead(row)).toMatchObject({ status: "escalado_humano", assignedUserId: brokerId });
    expect((await episodes(row)).length).toBe(before.length);
    // Replay: com episódio gravado é "unchanged"; sem episódio, a lead já escalada fica inelegível.
    const replay = await post(row); expect(replay.status).toBe(state === null ? 409 : 200); expect(await storedLead(row)).toMatchObject({ status: "escalado_humano" });
  });
  it.each(["inbound", "reset", "anchor"])("contexto %s divergente409 impede mutações", async (change) => {
    const row = await fixture(48 * hour, "accepted"), before = await episodes(row); let anchorMessageId = row.anchor.id;
    if (change === "inbound") await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "lead", content: "Novo inbound", sentAt: now, whatsappPhoneNumberId: row.phoneNumberId });
    if (change === "reset") await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
    if (change === "anchor") anchorMessageId = (await fixture()).anchor.id;
    const lead = await storedLead(row), facts = await untouched(row); await problem(await post(row, { anchorMessageId }), 409, "contexto-alterado");
    expect(await episodes(row)).toEqual(before); expect(await storedLead(row)).toEqual(lead); expect(await untouched(row)).toEqual(facts);
  });
  it("401 antecede corpo, tenant e UUID404 não alteram dados", async () => {
    const row = await fixture(), foreign = await fixture(48 * hour, null, foreignTenant);
    await problem(await post(row, {}, { auth: false }), 401, "nao-autenticado"); await problem(await post(foreign), 404, "recurso-nao-encontrado");
    await problem(await post(row, undefined, { id: "invalid" }), 404, "recurso-nao-encontrado"); expect(await episodes(row)).toEqual([]); expect(await episodes(foreign)).toEqual([]);
  });
  it.each([{}, null, { anchorMessageId: "invalid" }, { anchorMessageId: randomUUID(), tenantId }, { anchorMessageId: randomUUID(), phase: "qualificando" }, { anchorMessageId: randomUUID(), now: now.toISOString() }])("corpo inválido/controle extra400 %#", async (body) => {
    const row = await fixture(); await problem(await post(row, body), 400, "payload-invalido"); expect(await episodes(row)).toEqual([]); expect(await storedLead(row)).toEqual(row.lead);
  });
  it("JSON400 e corpo100KiB413 não executam omissão/escalada", async () => {
    const row = await fixture(); await problem(await post(row, undefined, { raw: "{" }), 400, "payload-invalido");
    await problem(await post(row, undefined, { raw: " ".repeat(MAX_BODY_BYTES + 1) }), 413, "corpo-grande-demais"); expect(await episodes(row)).toEqual([]);
  });
  it("erro invalid-input do serviço400 usa detalhe estático", async () => {
    const row = await fixture(); vi.spyOn(repository, "expireEpisode").mockResolvedValueOnce({ ok: false, reason: "invalid-input" });
    const response = await post(row); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: "payload-invalido", detail: "Âncora inválida." }); expect(await episodes(row)).toEqual([]);
  });
  it("duas chamadas em conexões reais escalam uma vez e devolvem replay", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect(), pidA = deferred<number>(), pidB = deferred<number>();
    const original = repository.expireEpisode; let calls = 0, pending: ReturnType<typeof post>[] = [];
    vi.spyOn(repository, "expireEpisode").mockImplementation((auth, id, input) => { const index = calls++; return original(auth, id, input, { database: pinned(index === 0 ? a : b, index === 0 ? pidA : pidB) }); });
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]); pending = [post(row), post(row)];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks(pids)).toBe(2); await blocker.query("COMMIT");
      const responses = await Promise.all(pending); expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const bodies = await Promise.all(responses.map((response) => response.json())); expect(bodies.map((body) => body.action).sort()).toEqual(["escalated", "unchanged"]);
      const [saved] = await episodes(row); expect(bodies).toContainEqual({ action: "escalated", episodeId: saved.id, brokerId, result: "omitted" });
      expect(bodies).toContainEqual({ action: "unchanged", episodeId: saved.id }); expect(await episodes(row)).toHaveLength(1);
      expect(await storedLead(row)).toMatchObject({ assignedUserId: brokerId, status: "escalado_humano", escalationReason: "Ausência de resposta por 48h; retomada omitida." });
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });
  it("outros verbos405 mantêm AllowPOST", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
