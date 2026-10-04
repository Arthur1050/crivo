import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import { conversations, integrationRefusals, leadAgentState, leads, messages, tenantApiKeys, tenants, whatsappChannels } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/whatsapp/automation/candidates/route";

const now = new Date("2026-10-06T15:00:00Z"), hour = 3600000, owners: string[] = []; let contact = 5534999700000;
async function context() {
  const tenantId = randomUUID(), apiKey = `fixture-${randomUUID()}`; owners.push(tenantId);
  await db.insert(tenants).values({ id: tenantId, slug: `fixture-${tenantId}`, name: "Fixture T36", agentName: "Agente", supportedModality: "ambos" });
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT36", keyHash: createHash("sha256").update(apiKey).digest("hex") });
  return { tenantId, apiKey };
}
type Context = Awaited<ReturnType<typeof context>>;
function orderedId(prefix: number) { return `${prefix}0000000${randomUUID().slice(8)}`; }
async function fixture(owner: Context, silence = 22 * hour, patch: { phase?: null; channel?: null; verified?: boolean; id?: string; createdAt?: Date } = {}) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId: owner.tenantId, phoneNumberId, ownershipVerifiedAt: patch.verified === false ? null : now });
  const [lead] = await db.insert(leads).values({ id: patch.id, tenantId: owner.tenantId, name: "Nome pessoal não permitido", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, createdAt: patch.createdAt ?? now, whatsappPhoneNumberId: patch.channel === null ? null : phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner.tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: owner.tenantId, conversationId: conversation.id, sender: "lead", content: "Conteúdo pessoal não permitido", sentAt: new Date(now.getTime() - silence), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId: owner.tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: patch.phase === null ? null : "qualificando" });
  return { lead, anchor, phoneNumberId };
}
function get(owner: Context, query = "", authenticated = true) {
  return GET(new Request(`http://local/api/v1/whatsapp/automation/candidates${query ? `?${query}` : ""}`, { headers: authenticated ? { Authorization: `Bearer ${owner.apiKey}` } : {} }), undefined);
}
async function problem(response: Response, status: number, code: string) { expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ status, code }); }
function candidate(row: Awaited<ReturnType<typeof fixture>>, action = "prepare") {
  return { leadId: row.lead.id, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt.toISOString(), phoneNumberId: row.phoneNumberId, action };
}
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => { vi.useRealTimers(); });
afterAll(async () => {
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, owners)); await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, owners));
  await db.delete(messages).where(inArray(messages.tenantId, owners)); await db.delete(conversations).where(inArray(conversations.tenantId, owners));
  await db.delete(leads).where(inArray(leads.tenantId, owners)); await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, owners));
  await db.delete(tenantApiKeys).where(inArray(tenantApiKeys.tenantId, owners)); await db.delete(tenants).where(inArray(tenants.id, owners)); await db.$client.end();
});

describe("T36 — candidatos HTTP sem conteúdo pessoal", () => {
  it("prepare/omit/escalate retornam somente a allowlist de IDs/canal comercial/ação", async () => {
    const owner = await context(), rows = await Promise.all([22, 24, 48].map((silence) => fixture(owner, silence * hour)));
    const response = await get(owner); expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ candidates: rows.map((row, index) => candidate(row, ["prepare", "omit", "escalate"][index])).sort((a, b) => a.leadId.localeCompare(b.leadId)), cutoffAt: now.toISOString(), nextCursor: null });
  });

  it("limit100 passa e limites101/0/fração/texto retornam400", async () => {
    const owner = await context(); await fixture(owner);
    expect((await get(owner, "limit=100")).status).toBe(200);
    for (const limit of ["101", "0", "1.5", "x"]) await problem(await get(owner, `limit=${limit}`), 400, "payload-invalido");
  });

  it("101 candidatos reais paginam em100+1 sem duplicação pelo limite default", async () => {
    const owner = await context(), sentAt = new Date(now.getTime() - 22 * hour);
    const rows = Array.from({ length: 101 }, () => ({ leadId: randomUUID(), conversationId: randomUUID(), anchorMessageId: randomUUID(),
      phoneNumberId: BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), externalId: String(contact++) }));
    await db.insert(whatsappChannels).values(rows.map((row) => ({ tenantId: owner.tenantId, phoneNumberId: row.phoneNumberId, ownershipVerifiedAt: now })));
    await db.insert(leads).values(rows.map((row) => ({ id: row.leadId, tenantId: owner.tenantId, name: "Fixture T36 bulk", phone: "+5534900000000", externalId: row.externalId,
      status: "em_qualificacao" as const, firstContactAt: now, createdAt: now, whatsappPhoneNumberId: row.phoneNumberId })));
    await db.insert(conversations).values(rows.map((row) => ({ id: row.conversationId, tenantId: owner.tenantId, leadId: row.leadId })));
    await db.insert(messages).values(rows.map((row) => ({ id: row.anchorMessageId, tenantId: owner.tenantId, conversationId: row.conversationId,
      sender: "lead" as const, content: "Inbound próprio T36 bulk", sentAt, whatsappPhoneNumberId: row.phoneNumberId })));
    await db.insert(leadAgentState).values(rows.map((row) => ({ tenantId: owner.tenantId, leadId: row.leadId, anchorMessageId: row.anchorMessageId, phase: "qualificando" as const })));
    const expected = rows.map(({ leadId, anchorMessageId, phoneNumberId }) => ({ leadId, anchorMessageId, anchorSentAt: sentAt.toISOString(), phoneNumberId, action: "prepare" }))
      .sort((a, b) => a.leadId.localeCompare(b.leadId));
    const response = await get(owner), first = await response.json(); expect(response.status).toBe(200);
    expect(first).toEqual({ candidates: expected.slice(0, 100), cutoffAt: now.toISOString(), nextCursor: expect.any(String) }); expect(first.candidates).toHaveLength(100);
    const nextResponse = await get(owner, `cursor=${first.nextCursor}`), second = await nextResponse.json(); expect(nextResponse.status).toBe(200);
    expect(second).toEqual({ candidates: expected.slice(100), cutoffAt: now.toISOString(), nextCursor: null }); expect(second.candidates).toHaveLength(1);
    expect([...first.candidates, ...second.candidates]).toEqual(expected);
  });

  it("cursor válido mantém corte e avança páginas sem duplicar candidato", async () => {
    const owner = await context(), first = await fixture(owner, 22 * hour, { id: orderedId(1) }), second = await fixture(owner, 22 * hour, { id: orderedId(2) });
    const response = await get(owner, "limit=1"), page = await response.json(); expect(response.status).toBe(200);
    expect(page).toEqual({ candidates: [candidate(first)], cutoffAt: now.toISOString(), nextCursor: expect.any(String) });
    vi.setSystemTime(new Date(now.getTime() + hour));
    const next = await get(owner, `limit=1&cursor=${page.nextCursor}`); expect(next.status).toBe(200);
    expect(await next.json()).toEqual({ candidates: [candidate(second)], cutoffAt: now.toISOString(), nextCursor: null });
  });

  it.each(["notbase64!", "e30", "", "x".repeat(1025)])("cursor inválido400 (%#)", async (cursor) => {
    const owner = await context(); await problem(await get(owner, `cursor=${cursor}`), 400, "payload-invalido");
  });

  it("cursor de outro tenant400 e candidato estrangeiro não vaza", async () => {
    const owner = await context(), foreign = await context();
    const first = await fixture(owner), other = await fixture(foreign); await fixture(owner);
    const response = await get(owner, "limit=1"), page = await response.json(); expect(page.nextCursor).toEqual(expect.any(String));
    await problem(await get(foreign, `cursor=${page.nextCursor}`), 400, "payload-invalido");
    expect(await (await get(foreign)).json()).toEqual({ candidates: [candidate(other)], cutoffAt: now.toISOString(), nextCursor: null });
    expect((await (await get(owner)).json()).candidates.map((row: { leadId: string }) => row.leadId)).toContain(first.lead.id);
  });

  it.each(["phase", "channel", "ownership"])("sem %s conhecido a página200 fica vazia", async (missing) => {
    const owner = await context(); await fixture(owner, 22 * hour, missing === "phase" ? { phase: null } : missing === "channel" ? { channel: null } : { verified: false });
    const response = await get(owner); expect(response.status).toBe(200); expect(await response.json()).toEqual({ candidates: [], cutoffAt: now.toISOString(), nextCursor: null });
  });

  it("401 antecede query inválida e não revela dados", async () => {
    const owner = await context(); await problem(await get(owner, "limit=101", false), 401, "nao-autenticado");
  });

  it("página sem elegível mantém nextCursor e último ID examinado", async () => {
    const owner = await context(), first = await fixture(owner, 22 * hour, { id: orderedId(3), phase: null }), second = await fixture(owner, 22 * hour, { id: orderedId(4) });
    const page = await (await get(owner, "limit=1")).json(); expect(page).toEqual({ candidates: [], cutoffAt: now.toISOString(), nextCursor: expect.any(String) });
    expect(JSON.parse(Buffer.from(page.nextCursor, "base64url").toString("utf8")).afterLeadId).toBe(first.lead.id);
    expect(await (await get(owner, `limit=1&cursor=${page.nextCursor}`)).json()).toEqual({ candidates: [candidate(second)], cutoffAt: now.toISOString(), nextCursor: null });
  });

  it("lead inserido após corte não aparece na paginação corrente", async () => {
    const owner = await context(); await fixture(owner, 22 * hour, { id: orderedId(5) });
    const second = await fixture(owner, 22 * hour, { id: orderedId(6) });
    const page = await (await get(owner, "limit=1")).json();
    await fixture(owner, 22 * hour, { id: orderedId(7), createdAt: new Date(now.getTime() + 1) });
    vi.setSystemTime(new Date(now.getTime() + hour));
    expect(await (await get(owner, `limit=1&cursor=${page.nextCursor}`)).json()).toEqual({ candidates: [candidate(second)], cutoffAt: now.toISOString(), nextCursor: null });
  });

  it("parâmetros desconhecidos ou duplicados400 não controlam tenant/corte", async () => {
    const owner = await context();
    for (const query of ["tenantId=other", "cutoffAt=2026-10-06", "limit=1&limit=2", "cursor=x&cursor=y"]) await problem(await get(owner, query), 400, "payload-invalido");
  });

  it("outros verbos405 mantêm AllowGET", async () => {
    for (const handler of [POST, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("GET"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
