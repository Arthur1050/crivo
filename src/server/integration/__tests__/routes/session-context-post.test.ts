import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import * as schema from "../../../../db/schema";
import { conversations, integrationRefusals, leadAgentState, leads, messages, reengagementEpisodes, tenantApiKeys, tenants, whatsappChannels } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/leads/[id]/session-context/route";
import * as contextService from "../../../reengagement/context";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), apiKey = `fixture-${randomUUID()}`;
const now = new Date("2026-10-06T15:00:00Z"), hour = 3600000; let contact = 5534999850000;
async function fixture(state: "accepted" | "authorized" | "accepted_pending_record" | "uncertain" = "accepted", owner = tenantId) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), anchorTime = new Date(now.getTime() - 40 * hour);
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T42", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [old, human, anchor, resume, first] = await db.insert(messages).values([
    { sender: "lead" as const, content: "Sessão anterior", sentAt: new Date(anchorTime.getTime() - 20 * hour) },
    { sender: "humano" as const, content: "Vagas confirmadas", authorName: "Ana", sentAt: new Date(anchorTime.getTime() - 1800000) },
    { sender: "lead" as const, content: "Quero retomar vagas", sentAt: anchorTime },
    { sender: "agente" as const, content: "Podemos retomar?", sentAt: new Date(anchorTime.getTime() + 22 * hour) },
    { sender: "lead" as const, content: "Sim, podemos continuar", sentAt: now },
  ].map((message) => ({ ...message, tenantId: owner, conversationId: conversation.id, whatsappPhoneNumberId: phoneNumberId }))).returning();
  // Pendentes não possuem mensagem de aceite factual.
  if (state !== "accepted") await db.delete(messages).where(eq(messages.id, resume.id));
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: first.id, phase: null, revision: 2 });
  const authorizedAt = state === "accepted" || state === "uncertain" ? resume.sentAt : new Date(now.getTime() - 30000);
  const [episode] = await db.insert(reengagementEpisodes).values({ tenantId: owner, leadId: lead.id, phoneNumberId, anchorMessageId: anchor.id, anchorSentAt: anchorTime,
    agentStateRevision: 1, state, dispatchAuthorizedAt: authorizedAt, dispatchCompletionDeadline: new Date(authorizedAt.getTime() + 120000), submittedText: "Podemos retomar?",
    ...(state === "accepted" || state === "accepted_pending_record" ? { acceptedAt: authorizedAt, wamid: `fixture-${randomUUID()}` } : {}),
    messageId: state === "accepted" ? resume.id : null, originSessionStartMessageId: human.id, originSessionEndMessageId: anchor.id,
    firstInboundMessageId: first.id, bridgeLastInboundAt: now, createdAt: authorizedAt, updatedAt: authorizedAt }).returning();
  return { lead, conversation, old, human, anchor, resume, first, episode, phoneNumberId };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function post(row: Fixture, body: unknown = {}, options: { raw?: string; auth?: boolean; id?: string } = {}) {
  const id = options.id ?? row.lead.id;
  return POST(new Request(`http://local/api/v1/leads/${id}/session-context`, { method: "POST", headers: { "Content-Type": "application/json", ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }) },
    body: options.raw ?? JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}
async function snapshot(row: Fixture) { return { lead: await db.select().from(leads).where(eq(leads.id, row.lead.id)), agent: await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)),
  episodes: await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, row.lead.id)), messages: await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(messages.id) }; }
function history(rows: Fixture["anchor"][]) { return rows.map((message) => ({ id: message.id, sender: message.sender, content: message.content, sentAt: message.sentAt.toISOString(), authorName: message.authorName })); }
function frame(row: Fixture) { return { revision: 1, resetRequestedAt: null, bridge: { state: "accepted", bridgeRevision: 1, bridgeInvalidatedAt: null, resetObservedAt: null,
  anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt.toISOString(), originSessionStartMessageId: row.human.id, originSessionEndMessageId: row.anchor.id,
  messageId: row.resume.id, firstInboundMessageId: row.first.id, firstInboundSentAt: row.first.sentAt.toISOString(), bridgeLastInboundAt: row.first.sentAt.toISOString() } }; }
async function problem(response: Response, status: number, code: string) { expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ status, code }); }
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T42", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT42", keyHash: createHash("sha256").update(apiKey).digest("hex") });
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

describe("T42 — contexto HTTP somente leitura fornece carga pronta da sessão", () => {
  it("cold200 entrega frame/revisão/âncora/autoria completa e warm200 exclui apenas buffer sem duplicação", async () => {
    const row = await fixture(), before = await snapshot(row), cold = await post(row); expect(cold.status).toBe(200);
    expect(await cold.json()).toEqual({ frame: frame(row), history: history([row.human, row.anchor, row.resume, row.first]), requiresRebuild: false, pendingAcceptance: null,
      anchor: { id: row.first.id, sentAt: now.toISOString() }, agentStateRevision: 2 });
    const warm = await post(row, { bufferMessageIds: [row.first.id] }); expect(warm.status).toBe(200);
    expect(await warm.json()).toEqual({ frame: frame(row), history: history([row.human, row.anchor, row.resume]), requiresRebuild: true, pendingAcceptance: null,
      anchor: { id: row.first.id, sentAt: now.toISOString() }, agentStateRevision: 2 }); expect(await snapshot(row)).toEqual(before);
  });
  it.each(["authorized", "accepted_pending_record"] as const)("%s pending200 preserva deadline e não semeia aceite", async (state) => {
    const row = await fixture(state), before = await snapshot(row), response = await post(row, { bufferMessageIds: [row.first.id] }); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ frame: { revision: 1, resetRequestedAt: null, bridge: null }, history: [], requiresRebuild: false,
      pendingAcceptance: { episodeId: row.episode.id, deadline: row.episode.dispatchCompletionDeadline!.toISOString() }, anchor: { id: row.first.id, sentAt: now.toISOString() }, agentStateRevision: 2 });
    expect(await snapshot(row)).toEqual(before);
    vi.setSystemTime(row.episode.dispatchCompletionDeadline!); const expired = await post(row); expect(expired.status).toBe(200);
    expect(await expired.json()).toMatchObject({ frame: { revision: 0, bridge: null }, pendingAcceptance: null, history: history([row.first]) }); expect(await snapshot(row)).toEqual(before);
  });
  it("incerto200 nunca presume ponte", async () => {
    const row = await fixture("uncertain"), before = await snapshot(row), response = await post(row); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ frame: { revision: 0, bridge: null }, history: history([row.first]), requiresRebuild: false, pendingAcceptance: null }); expect(await snapshot(row)).toEqual(before);
  });
  it("reset200 elimina ponte e passado sem mutação", async () => {
    const row = await fixture(), reset = new Date(now.getTime() - 1000); await db.update(leads).set({ memoryResetRequestedAt: reset }).where(eq(leads.id, row.lead.id));
    const before = await snapshot(row), response = await post(row); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ frame: { revision: 0, resetRequestedAt: reset.toISOString(), bridge: null }, history: history([row.first]), requiresRebuild: false, pendingAcceptance: null }); expect(await snapshot(row)).toEqual(before);
  });
  it.each(["missing-agent", "missing-ref", "invalidated"])("estado/ponte %s200 retorna sessão normal sem presumir reconstrução", async (kind) => {
    const row = await fixture();
    if (kind === "missing-agent") await db.delete(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id));
    if (kind === "missing-ref") await db.update(reengagementEpisodes).set({ originSessionStartMessageId: null }).where(eq(reengagementEpisodes.id, row.episode.id));
    if (kind === "invalidated") await db.update(reengagementEpisodes).set({ bridgeInvalidatedAt: now, bridgeRevision: 2 }).where(eq(reengagementEpisodes.id, row.episode.id));
    const before = await snapshot(row), response = await post(row); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ frame: { revision: 0, resetRequestedAt: null, bridge: null }, history: history([row.first]), requiresRebuild: false, pendingAcceptance: null,
      anchor: { id: row.first.id, sentAt: now.toISOString() }, agentStateRevision: kind === "missing-agent" ? null : 2 }); expect(await snapshot(row)).toEqual(before);
  });
  it("50IDs factuais200 exclui buffer inteiro; 51IDs400 não altera contexto", async () => {
    const row = await fixture(), tail = await db.insert(messages).values(Array.from({ length: 49 }, (_, i) => ({ tenantId, conversationId: row.conversation.id, sender: "lead" as const,
      content: `Buffer ${i}`, sentAt: new Date(now.getTime() + i + 1), whatsappPhoneNumberId: row.phoneNumberId }))).returning();
    const current = tail[48]; await db.update(leadAgentState).set({ anchorMessageId: current.id, revision: 3 }).where(eq(leadAgentState.leadId, row.lead.id));
    await db.update(reengagementEpisodes).set({ bridgeLastInboundAt: current.sentAt }).where(eq(reengagementEpisodes.id, row.episode.id)); vi.setSystemTime(current.sentAt);
    const ids = [row.first.id, ...tail.map((message) => message.id)], before = await snapshot(row), response = await post(row, { bufferMessageIds: ids }); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ history: history([row.human, row.anchor, row.resume]), requiresRebuild: true, agentStateRevision: 3,
      anchor: { id: current.id, sentAt: current.sentAt.toISOString() }, frame: { bridge: { bridgeLastInboundAt: current.sentAt.toISOString() } } });
    await problem(await post(row, { bufferMessageIds: [...ids, row.anchor.id] }), 400, "payload-invalido"); expect(await snapshot(row)).toEqual(before);
  });
  it("carga já limitada50 preserva referência de origem fora do recorte final", async () => {
    const row = await fixture(), tail = await db.insert(messages).values(Array.from({ length: 55 }, (_, i) => ({ tenantId, conversationId: row.conversation.id, sender: "agente" as const,
      content: `História ${i}`, sentAt: new Date(row.anchor.sentAt.getTime() + (i + 1) * 60000), whatsappPhoneNumberId: row.phoneNumberId }))).returning();
    await db.update(reengagementEpisodes).set({ originSessionEndMessageId: tail[54].id }).where(eq(reengagementEpisodes.id, row.episode.id));
    const before = await snapshot(row), response = await post(row, { bufferMessageIds: [row.first.id] }); expect(response.status).toBe(200); const body = await response.json();
    expect(body.history).toEqual(history([...tail.slice(-49), row.resume])); expect(body.frame.bridge.originSessionStartMessageId).toBe(row.human.id);
    expect(body.requiresRebuild).toBe(true); expect(await snapshot(row)).toEqual(before);
  });
  it.each(["missing", "foreign", "outbound"])("ID %s400 não devolve histórico nem escreve", async (kind) => {
    const row = await fixture(), id = kind === "missing" ? randomUUID() : kind === "foreign" ? (await fixture("accepted", foreignTenant)).first.id : row.resume.id;
    const before = await snapshot(row); await problem(await post(row, { bufferMessageIds: [id] }), 400, "payload-invalido"); expect(await snapshot(row)).toEqual(before);
  });
  it.each([null, [], { bufferMessageIds: null }, { bufferMessageIds: "id" }, { bufferMessageIds: [1] }, { bufferMessageIds: ["invalid"] }, { tenantId }, { frame: {} }])("shape/controle inválido400 %#", async (body) => {
    const row = await fixture(), before = await snapshot(row); await problem(await post(row, body), 400, "payload-invalido"); expect(await snapshot(row)).toEqual(before);
  });
  it("401 antecede payload inválido; tenant/UUID404 sem contexto", async () => {
    const row = await fixture(), foreign = await fixture("accepted", foreignTenant), before = await snapshot(row);
    await problem(await post(row, null, { auth: false }), 401, "nao-autenticado"); await problem(await post(foreign), 404, "recurso-nao-encontrado");
    await problem(await post(row, undefined, { id: "invalid" }), 404, "recurso-nao-encontrado"); expect(await snapshot(row)).toEqual(before);
  });
  it("JSON400 e tamanho413 preservam a sessão", async () => {
    const row = await fixture(), before = await snapshot(row); await problem(await post(row, undefined, { raw: "{" }), 400, "payload-invalido");
    await problem(await post(row, undefined, { raw: " ".repeat(MAX_BODY_BYTES + 1) }), 413, "corpo-grande-demais"); expect(await snapshot(row)).toEqual(before);
  });
  it.each(["invalid-input", "context-read-failed"] as const)("falha técnica %s400/503 tem detalhe estático e não semeia", async (reason) => {
    const row = await fixture(), before = await snapshot(row); vi.spyOn(contextService, "getSessionFrame").mockResolvedValueOnce({ ok: false, reason });
    const response = await post(row); expect(response.status).toBe(reason === "context-read-failed" ? 503 : 400);
    expect(await response.json()).toMatchObject({ code: reason === "context-read-failed" ? "estado-agente-desconhecido" : "payload-invalido",
      detail: reason === "context-read-failed" ? "Leitura técnica do contexto indisponível." : "Buffer ou identificação inválido." }); expect(await snapshot(row)).toEqual(before);
  });
  it("leitura em conexão própria espera lock e observa reset commitado sem mutar", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), reader = await db.$client.connect(), database = drizzle(reader, { schema });
    let pidResolve!: (pid: number) => void; const pidReady = new Promise<number>((resolve) => { pidResolve = resolve; });
    const original = contextService.getSessionFrame; vi.spyOn(contextService, "getSessionFrame").mockImplementation((auth, id, input) => original(auth, id, input, {
      database: { transaction: (callback, config) => database.transaction(async (tx) => { pidResolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) } }));
    let pending: ReturnType<typeof post> | undefined;
    try {
      await blocker.query("BEGIN"); await blocker.query("UPDATE leads SET memory_reset_requested_at=$1 WHERE id=$2", [new Date(now.getTime() - 1000), row.lead.id]); pending = post(row);
      const pid = await pidReady; let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) { waiting = (await db.$client.query<{ waiting: boolean }>("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [pid])).rows[0]?.waiting === true; if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50)); }
      expect(waiting).toBe(true); await blocker.query("COMMIT"); const before = await snapshot(row), response = await pending; expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ frame: { resetRequestedAt: new Date(now.getTime() - 1000).toISOString(), bridge: null }, history: history([row.first]), requiresRebuild: false }); expect(await snapshot(row)).toEqual(before);
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); reader.release(); }
  });
  it("outros verbos405 mantêm AllowPOST", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
