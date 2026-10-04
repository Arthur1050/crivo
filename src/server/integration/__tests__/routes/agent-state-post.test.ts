import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../db";
import { conversations, integrationRefusals, leadAgentState, leads, messages, tenantApiKeys, tenants } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/leads/[id]/agent-state/route";
import { ingestMessage } from "../../messages";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), apiKey = `fixture-${randomUUID()}`;
const anchorAt = new Date("2026-10-04T10:00:00Z");
async function fixture(owner = tenantId) {
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T35", phone: "+5534900000000", externalId: `fixture-${randomUUID()}`, status: "em_qualificacao", firstContactAt: anchorAt }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "lead", content: "Inbound próprio T35", sentAt: anchorAt }).returning();
  return { lead, conversation, anchor };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function payload(row: Fixture, patch: Record<string, unknown> = {}) {
  return { anchorMessageId: row.anchor.id, resetObservedAt: null, expectedRevision: 0, phase: "qualificando", askedFields: ["modality"], openingHistory: ["hmm"], ...patch };
}
function request(id: string, body: unknown, options: { raw?: string; auth?: boolean } = {}) {
  return new Request(`http://local/api/v1/leads/${id}/agent-state`, { method: "POST", headers: { "Content-Type": "application/json", ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }) }, body: options.raw ?? JSON.stringify(body) });
}
function post(row: Fixture, body = payload(row), options: { raw?: string; auth?: boolean } = {}) { return POST(request(row.lead.id, body, options), { params: Promise.resolve({ id: row.lead.id }) }); }
async function state(row: Fixture) { return db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)); }
async function problem(response: Response, status: number, code: string) {
  expect(response.status).toBe(status); expect(response.headers.get("Content-Type")).toContain("application/problem+json");
  expect(await response.json()).toMatchObject({ status, code, type: `urn:crivo:problem:${code}` });
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T35", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT35", keyHash: createHash("sha256").update(apiKey).digest("hex") });
});
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, ids)); await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
  await db.delete(messages).where(inArray(messages.tenantId, ids)); await db.delete(conversations).where(inArray(conversations.tenantId, ids));
  await db.delete(leads).where(inArray(leads.tenantId, ids)); await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
  await db.delete(tenants).where(inArray(tenants.id, ids)); await db.$client.end();
});

describe("T35 — publicação HTTP ligada ao turno original", () => {
  it("200 publica todos os campos tipados e serializa datas sem mudar lead/thread", async () => {
    const row = await fixture(), reset = new Date("2026-10-04T12:00:00Z");
    await db.update(leads).set({ memoryResetRequestedAt: reset }).where(eq(leads.id, row.lead.id));
    const beforeLead = await db.select().from(leads).where(eq(leads.id, row.lead.id));
    const response = await post(row, payload(row, { resetObservedAt: "2026-10-04T09:00:00-03:00", askedFields: ["modality", "budgetCents"], openingHistory: ["hmm", "certo"] }));
    expect(response.status).toBe(200); const body = await response.json();
    expect(body).toEqual({ replay: false, state: { tenantId, leadId: row.lead.id, anchorMessageId: row.anchor.id, resetObservedAt: reset.toISOString(), revision: 1, phase: "qualificando", askedFields: ["modality", "budgetCents"], openingHistory: ["hmm", "certo"], updatedAt: expect.any(String) } });
    expect(new Date(body.state.updatedAt).getTime()).toBeGreaterThan(0);
    expect(await state(row)).toEqual([{ ...body.state, resetObservedAt: reset, updatedAt: new Date(body.state.updatedAt) }]);
    expect(await db.select().from(leads).where(eq(leads.id, row.lead.id))).toEqual(beforeLead);
    expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).toEqual([row.anchor]);
  });

  it("replay200 nas revisões atual/anterior conserva exatamente state/timestamp", async () => {
    const row = await fixture(), first = await post(row), body = await first.json(), before = await state(row);
    for (const expectedRevision of [0, 1]) { const replay = await post(row, payload(row, { expectedRevision })); expect(replay.status).toBe(200); expect(await replay.json()).toEqual({ ...body, replay: true }); }
    expect(await state(row)).toEqual(before);
  });

  it("revisão incompatível409 preserva projeção e registra apenas código/rota", async () => {
    const row = await fixture(); await post(row); const before = await state(row);
    await problem(await post(row, payload(row, { expectedRevision: 0, phase: "agendando" })), 409, "transicao-invalida");
    expect(await state(row)).toEqual(before);
    const refusals = await db.select().from(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantId));
    expect(refusals).toEqual(expect.arrayContaining([expect.objectContaining({ route: `/api/v1/leads/${row.lead.id}/agent-state`, method: "POST", status: 409, code: "transicao-invalida" })]));
  });

  it("401 antecede validação e não cria estado", async () => {
    const row = await fixture(); await problem(await post(row, payload(row), { auth: false, raw: "invalid" }), 401, "nao-autenticado"); expect(await state(row)).toEqual([]);
  });

  it("lead estrangeiro/inexistente e UUID inválido retornam404", async () => {
    const row = await fixture(foreignTenant);
    await problem(await post(row), 404, "recurso-nao-encontrado"); expect(await state(row)).toEqual([]);
    for (const id of [randomUUID(), "invalid"]) await problem(await POST(request(id, payload(row)), { params: Promise.resolve({ id }) }), 404, "recurso-nao-encontrado");
  });

  it.each([
    { anchorMessageId: "invalid" }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: "0" },
    { phase: "qualificado" }, { phase: undefined }, { askedFields: ["unknown"] }, { askedFields: Array(9).fill("modality") },
    { openingHistory: [1] }, { resetObservedAt: "2026-02-30T12:00:00Z" }, { resetObservedAt: "2026-10-04" },
    { resetObservedAt: "2026-13-04T12:00:00Z" }, { resetObservedAt: "2026-10-04T24:00:00Z" },
    { resetObservedAt: "Infinity" }, { resetObservedAt: undefined }, { tenantId: foreignTenant }, { whatsappPhoneNumberId: "123" }, { budgetCents: 100 },
  ])("payload inválido ou campo extra400 sem publicação (%#)", async (patch) => {
    const row = await fixture(); await problem(await post(row, payload(row, patch)), 400, "payload-invalido"); expect(await state(row)).toEqual([]);
  });

  it.each(["{", "", "[]", "null"])("JSON inválido ou shape inesperado400 (%#)", async (raw) => {
    const row = await fixture(); await problem(await post(row, payload(row), { raw }), 400, "payload-invalido"); expect(await state(row)).toEqual([]);
  });

  it("100KiB exatos passam; um byte além retorna413 sem alterar estado", async () => {
    const row = await fixture(), raw = JSON.stringify(payload(row)), boundary = raw + " ".repeat(MAX_BODY_BYTES - Buffer.byteLength(raw));
    expect((await post(row, payload(row), { raw: boundary })).status).toBe(200); const before = await state(row);
    await problem(await post(row, payload(row), { raw: boundary + " " }), 413, "corpo-grande-demais"); expect(await state(row)).toEqual(before);
  });

  it("âncora de outro lead409 não cria projeção", async () => {
    const row = await fixture(), other = await fixture();
    await problem(await post(row, payload(row, { anchorMessageId: other.anchor.id })), 409, "contexto-alterado"); expect(await state(row)).toEqual([]);
  });

  it("turno antigo recebe metadata mais nova, mas publicar sua âncora com revisão nova dá409", async () => {
    const row = await fixture(); await post(row);
    const newInbound = await ingestMessage(tenantId, row.lead.id, { externalId: `fixture-${randomUUID()}`, sender: "lead", content: "Novo inbound próprio T35", sentAt: new Date(anchorAt.getTime() + 1000) });
    if (!newInbound.ok) throw new Error("Inbound não persistiu");
    expect(newInbound.anchorMessageId).not.toBe(row.anchor.id); expect(newInbound.agentStateRevision).toBe(2);
    const before = await state(row);
    await problem(await post(row, payload(row, { expectedRevision: newInbound.agentStateRevision, phase: "agendando" })), 409, "contexto-alterado");
    expect(await state(row)).toEqual(before); expect(before[0]).toMatchObject({ phase: null, anchorMessageId: newInbound.anchorMessageId, revision: 2 });
  });

  it("reset mais novo409 conserva projeção original", async () => {
    const row = await fixture(); await post(row); const before = await state(row);
    await db.update(leads).set({ memoryResetRequestedAt: new Date("2026-10-04T12:00:00Z") }).where(eq(leads.id, row.lead.id));
    await problem(await post(row, payload(row, { expectedRevision: 1 })), 409, "contexto-alterado"); expect(await state(row)).toEqual(before);
  });

  it("fase encerrada409 não reabre na mesma âncora/reset", async () => {
    const row = await fixture(); expect((await post(row, payload(row, { phase: "encerrada" }))).status).toBe(200); const before = await state(row);
    await problem(await post(row, payload(row, { expectedRevision: 1 })), 409, "transicao-invalida"); expect(await state(row)).toEqual(before);
  });

  it("fase desconhecida null200 permanece null", async () => {
    const row = await fixture(), response = await post(row, payload(row, { phase: null })); expect(response.status).toBe(200);
    expect((await response.json()).state.phase).toBeNull(); expect((await state(row))[0].phase).toBeNull();
  });

  it("outros verbos405 mantêm AllowPOST e problem estável", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
