import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import { conversations, integrationRefusals, leadAgentState, leads, messages, reengagementEpisodes, tenantApiKeys, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/whatsapp/statuses/route";
import * as statusesService from "../../../whatsapp/statuses";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), apiKey = `fixture-${randomUUID()}`, now = new Date("2026-10-06T15:00:00Z");
const realFactory = statusesService.createStatusForwardingContext;
const proof: statusesService.StatusForwarderProof = { workflowId: "fixture-t43", activeVersionId: randomUUID(), triggerVersion: 1, verifiedAt: now,
  signatureAlgorithm: "hmac-sha256", signatureInput: "raw-body", rejectsInvalidSignatures: true, credentialSha256: createHash("sha256").update(apiKey).digest("hex") };
const free = { pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false };
let contact = 5534999860000;
async function fixture(owner = tenantId, verified = true) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), wamid = `fixture-${randomUUID()}`;
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: verified ? now : null });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T43", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [inbound, outbound] = await db.insert(messages).values([
    { sender: "lead" as const, content: "Inbound preservado", sentAt: new Date(now.getTime() - 1000) },
    { sender: "agente" as const, content: "Saída factual", externalId: wamid, sentAt: now },
  ].map((message) => ({ ...message, tenantId: owner, conversationId: conversation.id, whatsappPhoneNumberId: phoneNumberId }))).returning();
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: inbound.id, phase: "qualificando" });
  return { lead, conversation, inbound, outbound, phoneNumberId, wamid };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function item(wamid: string, patch: Record<string, unknown> = {}) { return { wamid, status: "delivered", timestamp: now.toISOString(), pricing: free, ...patch }; }
function post(row: Fixture, value: unknown = { phoneNumberId: row.phoneNumberId, statuses: [item(row.wamid)] }, options: { raw?: string; auth?: boolean; headers?: Record<string, string> } = {}) {
  return POST(new Request("http://local/api/v1/whatsapp/statuses", { method: "POST", headers: { "Content-Type": "application/json", ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }), ...options.headers }, body: options.raw ?? JSON.stringify(value) }), undefined);
}
async function receipts(row: Fixture) { return db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.phoneNumberId, row.phoneNumberId)).orderBy(whatsappMessageReceipts.wamid); }
async function snapshot(row: Fixture) { return { lead: await db.select().from(leads).where(eq(leads.id, row.lead.id)), agent: await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)),
  episodes: await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, row.lead.id)), messages: await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(messages.id) }; }
async function problem(response: Response, status: number, code: string) { expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ status, code }); }
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T43", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT43", keyHash: proof.credentialSha256 });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  // Configuração servidor sintética: mantém factory real e não habilita o gate produtivo.
  vi.spyOn(statusesService, "createStatusForwardingContext").mockImplementation((auth, request) => realFactory(auth, request, proof));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, ids)); await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids)); await db.delete(messages).where(inArray(messages.tenantId, ids));
  await db.delete(conversations).where(inArray(conversations.tenantId, ids)); await db.delete(leads).where(inArray(leads.tenantId, ids));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids)); await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
  await db.delete(tenants).where(inArray(tenants.id, ids)); await db.$client.end();
});

describe("T43 — status HTTP exige prova servidor e mantém integração idempotente", () => {
  it("200 e replay200 persistem recibo factual ligado sem mensagem/inbound/agente/pipeline", async () => {
    const row = await fixture(), before = await snapshot(row), response = await post(row); expect(response.status).toBe(200); expect(await response.json()).toEqual({ processed: 1 });
    const saved = await receipts(row); expect(saved).toEqual([expect.objectContaining({ tenantId, phoneNumberId: row.phoneNumberId, wamid: row.wamid, messageId: row.outbound.id,
      deliveredAt: now, classification: "free_service", pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false, pricingConflict: false, orphanExpiresAt: null })]);
    vi.setSystemTime(new Date(now.getTime() + 60000)); const replay = await post(row); expect(replay.status).toBe(200); expect(await replay.json()).toEqual({ processed: 1 });
    expect(await receipts(row)).toEqual(saved); expect(await snapshot(row)).toEqual(before);
  });
  it("default403 não concede origem por body/header verified mesmo com chave válida", async () => {
    const row = await fixture(); vi.mocked(statusesService.createStatusForwardingContext).mockImplementation(realFactory);
    const before = await snapshot(row); await problem(await post(row, { phoneNumberId: row.phoneNumberId, statuses: [item(row.wamid)], verified: true }, { headers: { "X-Origin-Verified": "true" } }), 403, "nao-autenticado");
    expect(await receipts(row)).toEqual([]); expect(await snapshot(row)).toEqual(before);
  });
  it("prova servidor de outra credencial403 não concede capability", async () => {
    const row = await fixture(); vi.mocked(statusesService.createStatusForwardingContext).mockImplementation((auth, request) => realFactory(auth, request, { ...proof, credentialSha256: "0".repeat(64) }));
    await problem(await post(row), 403, "nao-autenticado"); expect(await receipts(row)).toEqual([]);
  });
  it.each(["foreign", "unknown", "unverified"])("número %s403 não escreve recibos", async (kind) => {
    const row = await fixture(kind === "foreign" ? foreignTenant : tenantId, kind !== "unverified"), before = await snapshot(row);
    await problem(await post(row, { phoneNumberId: kind === "unknown" ? `unknown-${randomUUID()}` : row.phoneNumberId, statuses: [item(row.wamid)] }), 403, "canal-nao-vinculado");
    expect(await receipts(row)).toEqual([]); expect(await snapshot(row)).toEqual(before);
  });
  it("100 itens200 grava todos e 101400 não escreve parcialmente", async () => {
    const row = await fixture(), items = Array.from({ length: 100 }, () => item(`fixture-${randomUUID()}`)), response = await post(row, { phoneNumberId: row.phoneNumberId, statuses: items });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ processed: 100 }); expect((await receipts(row)).map((receipt) => receipt.wamid).sort()).toEqual(items.map((status) => status.wamid).sort());
    const rejected = await fixture(); await problem(await post(rejected, { phoneNumberId: rejected.phoneNumberId, statuses: [...items, item(rejected.wamid)] }), 400, "payload-invalido"); expect(await receipts(rejected)).toEqual([]);
  });
  it("lote misto sent/read/delivered/failed200 conserva entrega e falha normalizadas", async () => {
    const row = await fixture(), failedWamid = `fixture-${randomUUID()}`, response = await post(row, { phoneNumberId: row.phoneNumberId, statuses: [
      item(row.wamid, { status: "read", pricing: null }), item(row.wamid), item(row.wamid, { status: "sent", timestamp: new Date(now.getTime() - 1000).toISOString(), pricing: null }),
      item(failedWamid, { status: "failed", pricing: null, failureCode: 131026 }),
    ] }); expect(response.status).toBe(200); expect(await response.json()).toEqual({ processed: 4 });
    const saved = await receipts(row); expect(saved).toContainEqual(expect.objectContaining({ wamid: row.wamid, messageId: row.outbound.id, sentAt: new Date(now.getTime() - 1000), readAt: now, deliveredAt: now, classification: "free_service" }));
    expect(saved).toContainEqual(expect.objectContaining({ wamid: failedWamid, messageId: null, failedAt: now, failureCode: 131026, deliveredAt: null, classification: "not_delivered" }));
  });
  it("órfão200 expira em30 dias sem bolha sintética nem inbound", async () => {
    const row = await fixture(), before = await snapshot(row), wamid = `fixture-${randomUUID()}`, response = await post(row, { phoneNumberId: row.phoneNumberId, statuses: [item(wamid)] });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ processed: 1 }); expect(await receipts(row)).toEqual([expect.objectContaining({ wamid, messageId: null, classification: "free_service", orphanExpiresAt: new Date(now.getTime() + 30 * 86400000) })]); expect(await snapshot(row)).toEqual(before);
  });
  it("pricing desconhecido200 conserva campos e classificação indisponível", async () => {
    const row = await fixture(), response = await post(row, { phoneNumberId: row.phoneNumberId, statuses: [item(row.wamid, { pricing: { pricingModel: "novo", category: "service" } })] });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ processed: 1 }); expect(await receipts(row)).toEqual([expect.objectContaining({ pricingModel: "novo", category: "service", pricingType: null, billable: null, classification: "unavailable" })]);
  });
  it.each([{ status: "unknown" }, { timestamp: "2026-02-30T15:00:00Z" }, { failureCode: -1 }, { pricing: { billable: "false" } }, { raw: { content: "privado" } }])("item inválido400 após item válido não escreve o lote %#", async (patch) => {
    const row = await fixture(), before = await snapshot(row); await problem(await post(row, { phoneNumberId: row.phoneNumberId, statuses: [item(row.wamid), item(`fixture-${randomUUID()}`, patch)] }), 400, "payload-invalido"); expect(await receipts(row)).toEqual([]); expect(await snapshot(row)).toEqual(before);
  });
  it("401 antecede JSON inválido e JSON400/corpo413 não escreve", async () => {
    const row = await fixture(); await problem(await post(row, undefined, { auth: false, raw: "{" }), 401, "nao-autenticado");
    await problem(await post(row, undefined, { raw: "{" }), 400, "payload-invalido"); await problem(await post(row, undefined, { raw: " ".repeat(MAX_BODY_BYTES + 1) }), 413, "corpo-grande-demais"); expect(await receipts(row)).toEqual([]);
  });
  it("falha transacional503 faz rollback integral e detalhe não contém payload", async () => {
    const row = await fixture(), before = await snapshot(row), original = statusesService.ingestStatusBatch;
    vi.spyOn(statusesService, "ingestStatusBatch").mockImplementation((context, raw) => original(context, raw, { database: { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback-statuses"); }, config) } }));
    const response = await post(row); expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ code: "servico-indisponivel", detail: "Persistência de status temporariamente indisponível." });
    expect(await receipts(row)).toEqual([]); expect(await snapshot(row)).toEqual(before);
  });
  it.each(["origin-unverified", "body-too-large"] as const)("recusa de serviço%s mantém código específico", async (reason) => {
    const row = await fixture(); vi.spyOn(statusesService, "ingestStatusBatch").mockResolvedValueOnce({ ok: false, reason });
    await problem(await post(row), reason === "origin-unverified" ? 403 : 413, reason === "origin-unverified" ? "nao-autenticado" : "corpo-grande-demais"); expect(await receipts(row)).toEqual([]);
  });
  it.each([{}, null, { statuses: [] }, { messages: [] }])("shape de lote400 %#", async (body) => {
    const row = await fixture(); await problem(await post(row, body), 400, "payload-invalido"); expect(await receipts(row)).toEqual([]);
  });
  it("outros verbos405 mantêm AllowPOST", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
