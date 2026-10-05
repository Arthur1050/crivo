import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { conversations, integrationRefusals, leadAgentState, leads, messages, reengagementEpisodes, tenantApiKeys, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import { GET as channelsGET } from "../../../../app/api/v1/whatsapp/automation/channels/route";
import { POST as reconcilePOST, GET as reconcileGET } from "../../../../app/api/v1/whatsapp/automation/reconcile/route";
import { analyticsFixtureChannel } from "../../whatsapp/__tests__/analytics-fixtures";
import * as cloudApi from "../../whatsapp/cloud-api";
import * as repository from "../repository";
import { listAutomationChannels, reconcileAutomationTick } from "../tick";
const tenantId = randomUUID(), foreignTenant = randomUUID(), key = `fixture-${randomUUID()}`, now = new Date("2026-10-06T15:00:00Z");
let contact = 5534900100000;
async function fixture(patch: Partial<typeof reengagementEpisodes.$inferInsert> = {}, owner = tenantId) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T56", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "lead", content: "Fixture inbound", sentAt: new Date(now.getTime() - 22 * 3600000), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const [episode] = await db.insert(reengagementEpisodes).values({ tenantId: owner, leadId: lead.id, phoneNumberId, anchorMessageId: anchor.id, anchorSentAt: anchor.sentAt, agentStateRevision: 1, state: "authorized", submittedText: "Texto realmente submetido", dispatchAuthorizedAt: new Date(now.getTime() - 120000), dispatchCompletionDeadline: now, originSessionStartMessageId: anchor.id, originSessionEndMessageId: anchor.id, ...patch }).returning();
  return { lead, conversation, anchor, episode, phoneNumberId };
}
const tick = (pageSize = 100) => reconcileAutomationTick({ tenantId }, { now: () => now, pageSize });
async function current(id: string) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, id)))[0]; }
function request(path: string, body?: unknown, authenticated = true) { return new Request("http://local/api/v1/whatsapp/automation/" + path, { method: body === undefined ? "GET" : "POST", headers: { ...(authenticated ? { Authorization: `Bearer ${key}` } : {}), "X-Crivo-Tenant": `fixture-${foreignTenant}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map(id => ({ id, slug: `fixture-${id}`, name: "Fixture T56", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT56", keyHash: createHash("sha256").update(key).digest("hex") });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, ids)); await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
  await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids)); await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
  await db.delete(messages).where(inArray(messages.tenantId, ids)); await db.delete(conversations).where(inArray(conversations.tenantId, ids));
  await db.delete(leads).where(inArray(leads.tenantId, ids)); await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
  await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId)); await db.delete(tenants).where(inArray(tenants.id, ids)); await db.$client.end();
});

describe("T56 — fila durável de reconciliação sem transporte", () => {
  it("ack conhecido em pending/uncertain/authorized pagina por ID e tenant; replay não duplica", async () => {
    const rows = [];
    for (const state of ["accepted_pending_record", "uncertain", "authorized"] as const) rows.push(await fixture({ state, wamid: `fixture-${randomUUID()}`, acceptedAt: new Date(now.getTime() - 60000) }));
    const foreign = await fixture({ wamid: `fixture-${randomUUID()}`, acceptedAt: now }, foreignTenant), transport = vi.spyOn(cloudApi, "sendProactiveWhatsAppText");
    expect(await tick(2)).toEqual({ recorded: 3, uncertain: 0, failed: 0 });
    for (const row of rows) {
      const accepted = await current(row.episode.id); expect(accepted).toMatchObject({ state: "accepted", wamid: row.episode.wamid, acceptedAt: row.episode.acceptedAt, bridgeInvalidatedAt: null });
      expect((await db.select().from(messages).where(eq(messages.id, accepted.messageId!)))[0]).toMatchObject({ sender: "agente", content: row.episode.submittedText, sentAt: row.episode.acceptedAt, externalId: row.episode.wamid, whatsappPhoneNumberId: row.phoneNumberId });
    }
    expect(await current(foreign.episode.id)).toEqual(foreign.episode); expect(await tick(2)).toEqual({ recorded: 0, uncertain: 0, failed: 0 }); expect(transport).not.toHaveBeenCalled();
  });
  it("autorização só após2min vira uncertain; wamid sem acceptedAt não fabrica aceite", async () => {
    const due = await fixture(), partial = await fixture({ wamid: `fixture-${randomUUID()}` }), future = await fixture({ dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) });
    const transport = vi.spyOn(cloudApi, "sendProactiveWhatsAppText"); expect(await tick()).toEqual({ recorded: 0, uncertain: 2, failed: 0 });
    for (const row of [due, partial]) expect(await current(row.episode.id)).toMatchObject({ state: "uncertain", reasonCode: "dispatch-unresolved", acceptedAt: null, messageId: null, wamid: row.episode.wamid });
    expect(await current(future.episode.id)).toEqual(future.episode); expect(await tick()).toEqual({ recorded: 0, uncertain: 0, failed: 0 }); expect(transport).not.toHaveBeenCalled();
  });
  it("identidade que chega após seleção é relida sob locks; takeover invalida ponte mas preserva envio factual", async () => {
    const row = await fixture(), wamid = `fixture-${randomUUID()}`, real = repository.reconcileAcceptance;
    let selected!: () => void, release!: () => void;
    const reached = new Promise<void>(resolve => { selected = resolve; }), arrival = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(repository, "reconcileAcceptance").mockImplementationOnce(async (...args) => { expect(args[3]).toEqual({}); selected(); await arrival; return real(...args); });
    const running = tick(); await reached;
    await db.transaction(async tx => {
      await tx.select().from(leads).where(eq(leads.id, row.lead.id)).for("update");
      await tx.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episode.id)).for("update");
      await tx.update(reengagementEpisodes).set({ state: "accepted_pending_record", wamid, acceptedAt: now }).where(eq(reengagementEpisodes.id, row.episode.id));
      await tx.update(leads).set({ humanTakeoverAt: now }).where(eq(leads.id, row.lead.id));
    });
    release(); expect(await running).toEqual({ recorded: 1, uncertain: 0, failed: 0 });
    expect(await current(row.episode.id)).toMatchObject({ state: "accepted", wamid, acceptedAt: now, bridgeInvalidatedAt: now, bridgeRevision: 2 });
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0].humanTakeoverAt).toEqual(now);
  });
  it("identidade conflitante falha isolada sem bloquear registro seguinte nem reenviar", async () => {
    const wamid = `fixture-${randomUUID()}`, bad = await fixture({ wamid, acceptedAt: now }), good = await fixture({ wamid: `fixture-${randomUUID()}`, acceptedAt: now });
    await db.insert(messages).values({ tenantId, conversationId: good.conversation.id, sender: "agente", content: "Outra saída", sentAt: now, externalId: wamid, whatsappPhoneNumberId: good.phoneNumberId });
    const transport = vi.spyOn(cloudApi, "sendProactiveWhatsAppText"); expect(await tick(1)).toEqual({ recorded: 1, uncertain: 0, failed: 1 });
    expect(await current(bad.episode.id)).toEqual(bad.episode); expect(await current(good.episode.id)).toMatchObject({ state: "accepted" }); expect(transport).not.toHaveBeenCalled();
    // Evita que o cenário isolado contamine os cenários seguintes.
    await db.update(reengagementEpisodes).set({ state: "refused" }).where(eq(reengagementEpisodes.id, bad.episode.id));
  });
  it("rotas autenticam tenant, canais sem leads excluem disabled/foreign; body não autoriza identidade/Graph", async () => {
    const enabled = await analyticsFixtureChannel(tenantId, now, { phoneNumberId: "430000000000011" });
    await analyticsFixtureChannel(tenantId, now, { phoneNumberId: "430000000000012", usageEnabled: false });
    await analyticsFixtureChannel(foreignTenant, now, { phoneNumberId: "430000000000013" });
    const graph = vi.spyOn(globalThis, "fetch"), transport = vi.spyOn(cloudApi, "sendProactiveWhatsAppText");
    expect(await listAutomationChannels({ tenantId })).toEqual([{ phoneNumberId: enabled.phoneNumberId }]);
    expect((await channelsGET(request("channels", undefined, false), undefined)).status).toBe(401);
    const channels = await channelsGET(request("channels"), undefined); expect(channels.status).toBe(200); expect(await channels.json()).toEqual({ channels: [{ phoneNumberId: enabled.phoneNumberId }] });
    expect((await reconcilePOST(request("reconcile", {}, false), undefined)).status).toBe(401);
    for (const body of [{ wamid: "forged", acceptedAt: now }, { tenantId: foreignTenant }, { cursor: "forged", limit: 999 }, [], null]) expect((await reconcilePOST(request("reconcile", body), undefined)).status).toBe(400);
    expect((await reconcileGET(request("reconcile"))).status).toBe(405);
    const response = await reconcilePOST(request("reconcile", {}), undefined); expect(response.status).toBe(200); expect(await response.json()).toEqual({ recorded: 0, uncertain: 0, failed: 0 });
    expect(graph).not.toHaveBeenCalled(); expect(transport).not.toHaveBeenCalled();
  });
});
