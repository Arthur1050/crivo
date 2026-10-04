import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import { conversations, integrationRefusals, leadAgentState, leads, messages, reengagementEpisodes, tenantApiKeys, tenants, whatsappChannels } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/leads/[id]/reengagement/[episodeId]/preparation-failure/route";
import { authorizeDispatch, claimPreparation } from "../../../reengagement/repository";
import * as cloudApi from "../../../whatsapp/cloud-api";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), apiKey = `fixture-${randomUUID()}`;
const now = new Date("2026-10-06T15:00:00Z"); let contact = 5534999810000;
async function fixture(owner = tenantId) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T38", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "lead", content: "Inbound próprio T38", sentAt: new Date(now.getTime() - 22 * 3600000), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const claim = await claimPreparation({ tenantId: owner }, lead.id, { anchorMessageId: anchor.id });
  if (!claim.ok || !claim.acquired) throw new Error("Fixture sem claim");
  return { lead, conversation, anchor, phoneNumberId, ...claim };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function post(row: Fixture, patch: Record<string, unknown> = {}, options: { id?: string; episodeId?: string; auth?: boolean; raw?: string } = {}) {
  const id = options.id ?? row.lead.id, episodeId = options.episodeId ?? row.episodeId;
  return POST(new Request(`http://local/api/v1/leads/${id}/reengagement/${episodeId}/preparation-failure`, { method: "POST", headers: { "Content-Type": "application/json", ...(options.auth === false ? {} : { Authorization: `Bearer ${apiKey}` }) },
    body: options.raw ?? JSON.stringify({ claimToken: row.claimToken, code: "generation-failed", ...patch }) }), { params: Promise.resolve({ id, episodeId }) });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
async function problem(response: Response, status: number, code: string) { expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ status, code }); }
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T38", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT38", keyHash: createHash("sha256").update(apiKey).digest("hex") });
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

describe("T38 — falha HTTP exige claim própria sem despacho", () => {
  it.each(["generation-failed", "generation-timeout", "context-read-failed", "invalid-text"])("200 libera %s e preserva lead/thread sem transporte", async (code) => {
    const row = await fixture(), before = await episode(row), transport = vi.spyOn(cloudApi, "sendProactiveWhatsAppText"), response = await post(row, { code });
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ released: true, episodeId: row.episodeId });
    expect(await episode(row)).toEqual({ ...before, claimToken: null, claimExpiresAt: null, reasonCode: code, updatedAt: now });
    expect(await db.select().from(leads).where(eq(leads.id, row.lead.id))).toEqual([row.lead]);
    expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).toEqual([row.anchor]); expect(transport).not.toHaveBeenCalled();
  });

  it("replay409 após liberação e após reclaim não altera estado/timestamp/token novo", async () => {
    const row = await fixture(); expect((await post(row)).status).toBe(200); const released = await episode(row);
    await problem(await post(row), 409, "contexto-alterado"); expect(await episode(row)).toEqual(released);
    vi.setSystemTime(new Date(now.getTime() + 1000)); const next = await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id });
    expect(next).toMatchObject({ ok: true, acquired: true, episodeId: row.episodeId }); if (!next.ok || !next.acquired) throw new Error("Reclaim não adquiriu");
    expect(next.claimToken).not.toBe(row.claimToken); const claimed = await episode(row);
    await problem(await post(row), 409, "contexto-alterado"); expect(await episode(row)).toEqual(claimed);
  });

  it("token errado409 e lease expirada409 preservam episódio", async () => {
    const row = await fixture(), before = await episode(row);
    await problem(await post(row, { claimToken: randomUUID() }), 409, "contexto-alterado"); expect(await episode(row)).toEqual(before);
    vi.setSystemTime(new Date(now.getTime() + 300000)); await problem(await post(row), 409, "claim-expirada"); expect(await episode(row)).toEqual(before);
  });

  it("lead/episódio/tenant divergentes e UUID inválido404 preservam owner", async () => {
    const row = await fixture(), other = await fixture(), foreign = await fixture(foreignTenant), before = await episode(row);
    await problem(await post(row, {}, { id: other.lead.id }), 404, "recurso-nao-encontrado"); await problem(await post(foreign), 404, "recurso-nao-encontrado");
    for (const options of [{ id: "invalid" }, { episodeId: "invalid" }, { id: randomUUID() }, { episodeId: randomUUID() }]) await problem(await post(row, {}, options), 404, "recurso-nao-encontrado");
    expect(await episode(row)).toEqual(before); expect((await episode(foreign)).claimToken).toBe(foreign.claimToken);
  });

  it.each([{ code: "accepted" }, { code: "invalid-text " }, { code: undefined }, { claimToken: "invalid" }, { tenantId: foreignTenant }, { text: "Texto modelo" }, { now: now.toISOString() }])("payload inválido/controle extra400 (%#)", async (patch) => {
    const row = await fixture(), before = await episode(row); await problem(await post(row, patch), 400, "payload-invalido"); expect(await episode(row)).toEqual(before);
  });

  it.each(["authorized", "uncertain"] as const)("estado%s consumido409 conserva marker/texto/deadline integral", async (state) => {
    const row = await fixture(); expect(await authorizeDispatch({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text: "Texto permanentemente marcado" }, { expectedChannelRevision: 1 })).toMatchObject({ ok: true, authorized: true });
    if (state === "uncertain") await db.update(reengagementEpisodes).set({ state, reasonCode: "transport-failure" }).where(eq(reengagementEpisodes.id, row.episodeId));
    const before = await episode(row); await problem(await post(row), 409, "episodio-consumido"); expect(await episode(row)).toEqual(before);
  });

  it("401 antecede corpo malformado,400JSON/413corpo não liberam claim", async () => {
    const row = await fixture(), before = await episode(row);
    await problem(await post(row, {}, { auth: false, raw: "{" }), 401, "nao-autenticado");
    await problem(await post(row, {}, { raw: "{" }), 400, "payload-invalido");
    await problem(await post(row, {}, { raw: " ".repeat(MAX_BODY_BYTES + 1) }), 413, "corpo-grande-demais"); expect(await episode(row)).toEqual(before);
  });

  it("outros verbos405 mantêm AllowPOST", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); await problem(response, 405, "metodo-nao-suportado"); }
  });
});
