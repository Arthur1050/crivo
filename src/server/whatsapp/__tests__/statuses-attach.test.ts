import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { conversations, leads, messages, tenants, users, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import { attachReceipt, createStatusForwardingContext, ingestStatusBatch } from "../statuses";
import { serviceScope } from "../../data";

const now = new Date("2026-10-02T12:00:00Z");
const pricing = { pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false };
describe("T10 — correlação da saída por tenant/canal/wamid", () => {
  const tenantA = randomUUID(), tenantB = randomUUID();
  const userA = randomUUID(), userB = randomUUID();
  const phoneA = `fixture-${randomUUID()}`, phoneA2 = `fixture-${randomUUID()}`, phoneB = `fixture-${randomUUID()}`;
  const scopes = { all: serviceScope(tenantA), foreign: serviceScope(tenantB), walletA: { tenantId: tenantA, assignedUserId: userA }, walletB: { tenantId: tenantA, assignedUserId: userB } };
  const key = `fixture-${randomUUID()}`;
  const context = createStatusForwardingContext({ tenantId: tenantA }, new Request("http://fixture/statuses", { headers: { Authorization: `Bearer ${key}` } }), {
    workflowId: "fixture-forwarder", activeVersionId: randomUUID(), triggerVersion: 1, verifiedAt: now,
    signatureAlgorithm: "hmac-sha256", signatureInput: "raw-body", rejectsInvalidSignatures: true,
    credentialSha256: createHash("sha256").update(key).digest("hex"),
  });
  let conversationA: string, conversationA2: string, conversationB: string;
  beforeAll(async () => {
    await db.insert(tenants).values([tenantA, tenantB].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture attach", agentName: "Agente", supportedModality: "ambos" as const })));
    await db.insert(users).values([userA, userB].map((id) => ({ id, name: "Corretor fixture", email: `${id}@fixture.test` })));
    await db.insert(whatsappChannels).values([{ tenantId: tenantA, phoneNumberId: phoneA, ownershipVerifiedAt: now }, { tenantId: tenantA, phoneNumberId: phoneA2, ownershipVerifiedAt: now }, { tenantId: tenantB, phoneNumberId: phoneB, ownershipVerifiedAt: now }]);
    for (const [tenantId, assignedUserId, index] of [[tenantA, userA, 0], [tenantA, userB, 1], [tenantB, userB, 2]] as const) {
      const [lead] = await db.insert(leads).values({ tenantId, assignedUserId, name: "Lead fixture", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: now }).returning();
      const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
      if (index === 0) conversationA = conversation.id; else if (index === 1) conversationA2 = conversation.id; else conversationB = conversation.id;
    }
    if (!context) throw new Error("Contexto interno sintético ausente");
  });
  afterAll(async () => {
    const ids = [tenantA, tenantB];
    await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
    await db.delete(messages).where(inArray(messages.tenantId, ids));
    await db.delete(conversations).where(inArray(conversations.tenantId, ids));
    await db.delete(leads).where(inArray(leads.tenantId, ids));
    await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
    await db.delete(tenants).where(inArray(tenants.id, ids));
    await db.delete(users).where(inArray(users.id, [userA, userB]));
    await db.$client.end();
  });
  async function message(patch: Partial<typeof messages.$inferInsert> = {}) {
    const [row] = await db.insert(messages).values({ tenantId: tenantA, conversationId: conversationA, sender: "agente", content: "Texto privado", sentAt: now, whatsappPhoneNumberId: phoneA, externalId: `wamid.fixture.${randomUUID()}`, ...patch }).returning();
    return row;
  }
  async function orphan(wamid: string, phoneNumberId = phoneA, tenantId = tenantA) {
    const [row] = await db.insert(whatsappMessageReceipts).values({ tenantId, phoneNumberId, wamid, deliveredAt: now, ...pricing, classification: "free_service", firstSeenAt: now, lastSeenAt: now, orphanExpiresAt: new Date("2026-11-01T12:00:00Z") }).returning();
    return row;
  }
  async function receipt(wamid: string, phoneNumberId = phoneA, tenantId = tenantA) {
    return db.select().from(whatsappMessageReceipts).where(and(eq(whatsappMessageReceipts.tenantId, tenantId), eq(whatsappMessageReceipts.phoneNumberId, phoneNumberId), eq(whatsappMessageReceipts.wamid, wamid)));
  }
  async function ingest(wamid: string) {
    return ingestStatusBatch(context, { phoneNumberId: phoneA, statuses: [{ wamid, status: "delivered", timestamp: "2026-10-02T12:00:00Z", pricing }] }, { now });
  }

  it("status anterior vincula depois, sem criar mensagem ou mudar inbound/condução", async () => {
    const wamid = `wamid.fixture.${randomUUID()}`;
    const beforeMessages = await db.select().from(messages).where(eq(messages.tenantId, tenantA));
    const beforeLeads = await db.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(await ingest(wamid)).toEqual({ ok: true, processed: 1 });
    expect((await receipt(wamid))[0].messageId).toBeNull();
    expect(await db.select().from(messages).where(eq(messages.tenantId, tenantA))).toEqual(beforeMessages);
    const outgoing = await message({ externalId: wamid });
    const beforeAttach = await receipt(wamid);
    expect(await attachReceipt(scopes.walletA, outgoing.id)).toBe(true);
    expect(await receipt(wamid)).toEqual([{ ...beforeAttach[0], messageId: outgoing.id, orphanExpiresAt: null }]);
    expect(await db.select().from(leads).where(eq(leads.tenantId, tenantA))).toEqual(beforeLeads);
  });

  it("status posterior liga várias saídas pelo caminho ingest bulk", async () => {
    const first = await message();
    const second = await message({ sender: "humano", authorName: "Equipe fixture" });
    expect(await ingestStatusBatch(context, { phoneNumberId: phoneA, statuses: [first, second].map((row) => ({ wamid: row.externalId, status: "delivered", timestamp: "2026-10-02T12:00:00Z", pricing })) }, { now })).toEqual({ ok: true, processed: 2 });
    expect((await receipt(first.externalId!))[0].messageId).toBe(first.id);
    expect((await receipt(second.externalId!))[0].messageId).toBe(second.id);
    expect((await receipt(first.externalId!))[0].orphanExpiresAt).toBeNull();
    expect((await receipt(second.externalId!))[0].orphanExpiresAt).toBeNull();
  });

  it("replay de attach/status conserva vínculo/classificação/metadados", async () => {
    const outgoing = await message();
    await orphan(outgoing.externalId!);
    expect(await attachReceipt(scopes.all, outgoing.id)).toBe(true);
    const first = await receipt(outgoing.externalId!);
    expect(await attachReceipt(scopes.all, outgoing.id)).toBe(true);
    expect(await ingest(outgoing.externalId!)).toEqual({ ok: true, processed: 1 });
    expect(await receipt(outgoing.externalId!)).toEqual(first);
    expect(first[0].classification).toBe("free_service");
  });

  it("outra carteira e outro tenant não ganham vínculo pela identidade isolada", async () => {
    const own = await message({ conversationId: conversationA2 });
    const foreign = await message({ tenantId: tenantB, conversationId: conversationB, whatsappPhoneNumberId: phoneB });
    const ownReceipt = await orphan(own.externalId!);
    const foreignReceipt = await orphan(foreign.externalId!, phoneB, tenantB);
    expect(await attachReceipt(scopes.walletA, own.id)).toBe(false);
    expect(await attachReceipt(scopes.all, foreign.id)).toBe(false);
    expect(await receipt(own.externalId!)).toEqual([ownReceipt]);
    expect(await receipt(foreign.externalId!, phoneB, tenantB)).toEqual([foreignReceipt]);
    expect(await attachReceipt(scopes.walletB, own.id)).toBe(true);
    expect((await receipt(own.externalId!))[0].messageId).toBe(own.id);
  });

  it("outro canal/wamid não associa; ownership ausente também recusa", async () => {
    const outgoing = await message();
    const wrongChannel = await orphan(outgoing.externalId!, phoneA2);
    const wrongWamid = await orphan(`wamid.fixture.${randomUUID()}`);
    expect(await attachReceipt(scopes.all, outgoing.id)).toBe(false);
    expect(await receipt(outgoing.externalId!, phoneA2)).toEqual([wrongChannel]);
    expect(await receipt(wrongWamid.wamid)).toEqual([wrongWamid]);
    const own = await orphan(outgoing.externalId!);
    await db.update(whatsappChannels).set({ ownershipVerifiedAt: null }).where(eq(whatsappChannels.phoneNumberId, phoneA));
    try {
      expect(await attachReceipt(scopes.all, outgoing.id)).toBe(false);
      expect(await receipt(outgoing.externalId!)).toEqual([own]);
    } finally {
      await db.update(whatsappChannels).set({ ownershipVerifiedAt: now }).where(eq(whatsappChannels.phoneNumberId, phoneA));
    }
  });

  it("inbound é excluído em attach e em ingest posterior", async () => {
    const inbound = await message({ sender: "lead" });
    const before = await orphan(inbound.externalId!);
    expect(await attachReceipt(scopes.all, inbound.id)).toBe(false);
    expect(await ingest(inbound.externalId!)).toEqual({ ok: true, processed: 1 });
    expect(await receipt(inbound.externalId!)).toEqual([before]);
    expect((await db.select().from(messages).where(eq(messages.id, inbound.id)))[0]).toEqual(inbound);
  });

  it("legado sem canal/wamid não infere número da lead nem cria recibo", async () => {
    const legacy = await message({ whatsappPhoneNumberId: null, externalId: null });
    const before = await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantA));
    expect(await attachReceipt(scopes.all, legacy.id)).toBe(false);
    expect(await attachReceipt(scopes.all, "invalid-id")).toBe(false);
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantA))).toEqual(before);
  });

  it("excluir mensagem ligada remove recibo sem órfão permanente ou efeito estrangeiro", async () => {
    const own = await message();
    const foreign = await message({ tenantId: tenantB, conversationId: conversationB, whatsappPhoneNumberId: phoneB });
    await orphan(own.externalId!);
    await orphan(foreign.externalId!, phoneB, tenantB);
    expect(await attachReceipt(scopes.all, own.id)).toBe(true);
    expect(await attachReceipt(scopes.foreign, foreign.id)).toBe(true);
    const other = await receipt(foreign.externalId!, phoneB, tenantB);
    await db.delete(messages).where(eq(messages.id, own.id));
    expect(await receipt(own.externalId!)).toEqual([]);
    expect(await receipt(foreign.externalId!, phoneB, tenantB)).toEqual(other);
  });

  it("executor compõe gravação/attach na mesma transação e rollback não deixa vínculo", async () => {
    const wamid = `wamid.fixture.${randomUUID()}`;
    const before = await orphan(wamid);
    await expect(db.transaction(async (tx) => {
      const [outgoing] = await tx.insert(messages).values({ tenantId: tenantA, conversationId: conversationA, sender: "agente", content: "Saída transacional", whatsappPhoneNumberId: phoneA, externalId: wamid }).returning();
      expect(await attachReceipt(scopes.all, outgoing.id, tx)).toBe(true);
      throw new Error("Fixture força rollback após vínculo");
    })).rejects.toThrow("Fixture força rollback após vínculo");
    expect(await receipt(wamid)).toEqual([before]);
    expect(await db.select().from(messages).where(eq(messages.externalId, wamid))).toEqual([]);
  });
});
