import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import { conversations, integrationRefusals, leadAgentState, leads, messages, reengagementEpisodes, tenantApiKeys, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/leads/[id]/reengagement/[episodeId]/send/route";
import { claimPreparation, reconcileAcceptance } from "../../../reengagement/repository";
import * as sendService from "../../../reengagement/send";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), apiKey = `fixture-${randomUUID()}`;
const now = new Date("2026-10-06T15:00:00Z"), hour = 3600000; let contact = 5534999820000;
const text = "Texto real próprio T39";
let fakeFetch: ReturnType<typeof vi.fn<typeof fetch>>;
function json(status: number, payload: unknown) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }
async function fixture(owner = tenantId, silence = 22 * hour) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), wamid = `fixture-${randomUUID()}`;
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: now, usageEnabled: false });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T39", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "lead", content: "Inbound próprio T39", sentAt: new Date(now.getTime() - silence), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const claim = await claimPreparation({ tenantId: owner }, lead.id, { anchorMessageId: anchor.id });
  if (!claim.ok || !claim.acquired) throw new Error("Fixture sem claim");
  await db.update(reengagementEpisodes).set({ originSessionStartMessageId: anchor.id, originSessionEndMessageId: anchor.id }).where(eq(reengagementEpisodes.id, claim.episodeId));
  return { lead, conversation, anchor, phoneNumberId, wamid, ...claim };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function post(row: Fixture, patch: Record<string, unknown> = {}, options: { id?: string; episodeId?: string; auth?: boolean; raw?: string } = {}) {
  const id = options.id ?? row.lead.id, episodeId = options.episodeId ?? row.episodeId;
  return POST(new Request(`http://local/api/v1/leads/${id}/reengagement/${episodeId}/send`, { method: "POST", headers: { "Content-Type": "application/json", ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }) },
    body: options.raw ?? JSON.stringify({ claimToken: row.claimToken, text, ...patch }) }), { params: Promise.resolve({ id, episodeId }) });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
async function outputs(row: Fixture) { return (await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).filter((message) => message.sender === "agente"); }
async function problem(response: Response, status: number, code: string) { expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ status, code }); }
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T39", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT39", keyHash: createHash("sha256").update(apiKey).digest("hex") });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "synthetic-t39");
  fakeFetch = vi.fn<typeof fetch>(async () => json(200, { messages: [{ id: "fixture-default" }] })); vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, ids)); await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
  await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids)); await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
  await db.delete(messages).where(inArray(messages.tenantId, ids)); await db.delete(conversations).where(inArray(conversations.tenantId, ids)); await db.delete(leads).where(inArray(leads.tenantId, ids));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids)); await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
  await db.delete(tenants).where(inArray(tenants.id, ids)); await db.$client.end();
});

describe("T39 — POSTsend só expõe fatos do transporte, nunca reenvia", () => {
  it("aceite200 retorna allowlist/ISO; trim usa mesmo texto enviado/persistido e preserva inbound/uso", async () => {
    const row = await fixture(); fakeFetch.mockResolvedValueOnce(json(200, { messages: [{ id: row.wamid }] }));
    const response = await post(row, { text: `  ${text}  ` }); expect(response.status).toBe(200); const body = await response.json();
    expect(body).toEqual({ episodeId: row.episodeId, state: "accepted", replay: false, wamid: row.wamid, acceptedAt: now.toISOString(), messageId: expect.any(String) });
    expect(JSON.parse(fakeFetch.mock.calls[0][1]!.body as string).text.body).toBe(text);
    expect(await outputs(row)).toEqual([{ id: body.messageId, tenantId, conversationId: row.conversation.id, sender: "agente", content: text, sentAt: now, externalId: row.wamid, whatsappPhoneNumberId: row.phoneNumberId, authorUserId: null, authorName: null }]);
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(row.lead);
    expect((await db.select().from(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, row.phoneNumberId)))[0].usageEnabled).toBe(false); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("resposta HTTP descartada não causa segundo envio; replay aceita texto inválido e credencial ausente", async () => {
    const row = await fixture(); fakeFetch.mockResolvedValueOnce(json(200, { messages: [{ id: row.wamid }] }));
    await post(row); const before = await episode(row); vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const response = await post(row, { text: "😀".repeat(2048) + "x" }); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ episodeId: row.episodeId, state: "accepted", replay: true, wamid: row.wamid, acceptedAt: now.toISOString(), messageId: before.messageId });
    expect(await episode(row)).toEqual(before); expect(await outputs(row)).toHaveLength(1); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each(["refused", "timeout", "network", "5xx", "missing-identity"])("resultado%s200 fica persistido e replay não invoca fetch", async (outcome) => {
    const row = await fixture();
    if (outcome === "timeout") fakeFetch.mockRejectedValueOnce(new DOMException("synthetic timeout", "TimeoutError"));
    else if (outcome === "network") fakeFetch.mockRejectedValueOnce(new Error("synthetic interruption"));
    else fakeFetch.mockResolvedValueOnce(outcome === "refused" ? json(400, { error: { code: 131047 } }) : outcome === "5xx" ? json(503, { error: { code: 131047 } }) : json(200, {}));
    const state = outcome === "refused" ? "refused" : "uncertain", response = await post(row); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ episodeId: row.episodeId, state, replay: false }); const before = await episode(row);
    const replay = await post(row); expect(replay.status).toBe(200); expect(await replay.json()).toEqual({ episodeId: row.episodeId, state, replay: true });
    expect(await episode(row)).toEqual(before); expect(before).toMatchObject({ dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) }); expect(await outputs(row)).toEqual([]); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("4096 unidades UTF16 são enviadas integralmente em uma chamada", async () => {
    const row = await fixture(), body = "😀".repeat(2048); fakeFetch.mockResolvedValueOnce(json(200, { messages: [{ id: row.wamid }] }));
    expect((await post(row, { text: body })).status).toBe(200); expect(JSON.parse(fakeFetch.mock.calls[0][1]!.body as string).text.body).toBe(body);
    expect((await outputs(row))[0].content).toBe(body); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each(["", " \n\t", "😀".repeat(2048) + "x"])("texto inválido400 libera só preparação própria sem fetch (%#)", async (text) => {
    const row = await fixture(); await problem(await post(row, { text }), 400, "payload-invalido");
    expect(await episode(row)).toMatchObject({ state: "preparing", claimToken: null, claimExpiresAt: null, reasonCode: "invalid-text", dispatchAuthorizedAt: null }); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("token/lease inválidos409 conservam episódio sem fetch", async () => {
    const row = await fixture(), before = await episode(row); await problem(await post(row, { claimToken: randomUUID() }), 409, "contexto-alterado");
    vi.setSystemTime(new Date(now.getTime() + 300000)); await problem(await post(row), 409, "claim-expirada"); expect(await episode(row)).toEqual(before); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it.each(["window", "optout", "takeover"])("mudança%s antes de autorização409 cancela/omite sem fetch", async (change) => {
    const row = await fixture(tenantId, change === "window" ? 24 * hour - 1 : 22 * hour);
    if (change === "window") vi.setSystemTime(new Date(now.getTime() + 1));
    else await db.update(leads).set(change === "optout" ? { optedOutAt: now } : { humanTakeoverAt: now }).where(eq(leads.id, row.lead.id));
    await problem(await post(row), 409, "transicao-invalida");
    expect(await episode(row)).toMatchObject({ state: change === "window" ? "omitted" : "cancelled", dispatchAuthorizedAt: null, submittedText: null }); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("scope tenant/lead/episódio e UUIDs404 não enviam nem alteram owner", async () => {
    const row = await fixture(), foreign = await fixture(foreignTenant), other = await fixture(), before = await episode(row);
    await problem(await post(foreign), 404, "recurso-nao-encontrado"); await problem(await post(row, {}, { id: other.lead.id }), 404, "recurso-nao-encontrado");
    for (const options of [{ id: "invalid" }, { episodeId: "invalid" }, { id: randomUUID() }, { episodeId: randomUUID() }]) await problem(await post(row, {}, options), 404, "recurso-nao-encontrado");
    expect(await episode(row)).toEqual(before); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it.each([{ claimToken: "invalid" }, { text: 123 }, { tenantId }, { phoneNumberId: "123" }, { now: now.toISOString() }, { wamid: "model-identity" }])("shape/controleextra400 preserva claim (%#)", async (patch) => {
    const row = await fixture(), before = await episode(row); await problem(await post(row, patch), 400, "payload-invalido"); expect(await episode(row)).toEqual(before); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("401/JSON inválido400/corpo413 não enviam nem liberam claim", async () => {
    const row = await fixture(), before = await episode(row); await problem(await post(row, {}, { auth: false, raw: "{" }), 401, "nao-autenticado");
    await problem(await post(row, {}, { raw: "{" }), 400, "payload-invalido"); await problem(await post(row, {}, { raw: " ".repeat(MAX_BODY_BYTES + 1) }), 413, "corpo-grande-demais");
    expect(await episode(row)).toEqual(before); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("configuração ausente503 libera só preparação sem expor conteúdo nos logs/recusas", async () => {
    const row = await fixture(), log = vi.spyOn(console, "error").mockImplementation(() => {}); vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    await problem(await post(row), 503, "estado-agente-desconhecido"); expect(await episode(row)).toMatchObject({ state: "preparing", claimToken: null, dispatchAuthorizedAt: null });
    expect(log).not.toHaveBeenCalled(); expect(fakeFetch).not.toHaveBeenCalled();
    const records = await db.select().from(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantId));
    expect(JSON.stringify(records)).not.toContain(text); expect(JSON.stringify(records)).not.toContain(row.claimToken);
  });

  it("aceite sem registro200 entrega identidade real para ack e replay só lê fatos", async () => {
    const row = await fixture(), original = sendService.sendPreparedEpisode; let transactions = 0;
    fakeFetch.mockResolvedValueOnce(json(200, { messages: [{ id: row.wamid }] }));
    const database: NonNullable<sendService.SendPreparedEpisodeOptions["database"]> = { select: db.select.bind(db), transaction: (callback, config) => {
      const attempt = ++transactions; return db.transaction(async (tx) => { const result = await callback(tx); if (attempt === 3) throw new Error("synthetic record rollback"); return result; }, config);
    } };
    vi.spyOn(sendService, "sendPreparedEpisode").mockImplementationOnce((auth, id, episodeId, input) => original(auth, id, episodeId, input, { database }));
    const response = await post(row); expect(response.status).toBe(200); const body = await response.json();
    expect(body).toEqual({ episodeId: row.episodeId, state: "accepted_pending_record", replay: false, wamid: row.wamid, acceptedAt: now.toISOString() }); expect(await outputs(row)).toEqual([]);
    const replay = await post(row); expect(replay.status).toBe(200); expect(await replay.json()).toEqual({ ...body, replay: true });
    expect(await reconcileAcceptance({ tenantId }, row.lead.id, body.episodeId, { wamid: body.wamid, acceptedAt: new Date(body.acceptedAt) })).toMatchObject({ ok: true, recorded: true });
    expect(await outputs(row)).toHaveLength(1); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("outros verbos405 mantêm AllowPOST", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
