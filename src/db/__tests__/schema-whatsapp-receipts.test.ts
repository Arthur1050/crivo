import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { conversations, leads, messages, tenants, whatsappChannels, whatsappMessageReceipts } from "../schema";

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  return typeof record.code === "string" ? record.code : pgCode(record.cause);
}
async function codeOf(promise: Promise<unknown>) {
  try { await promise; return undefined; } catch (error) { return pgCode(error); }
}

describe("T5 — recibos isolados e ciclo da mensagem (PRECO-02 AC2; L14B-01 AC5)", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const phoneA = `fixture-${randomUUID()}`;
  const phoneA2 = `fixture-${randomUUID()}`;
  const phoneB = `fixture-${randomUUID()}`;
  let conversationA: string;
  let conversationB: string;

  beforeAll(async () => {
    await db.insert(tenants).values([tenantA, tenantB].map((id) => ({
      id, slug: `fixture-${id}`, name: "Fixture recibo", agentName: "Agente", supportedModality: "ambos" as const,
    })));
    for (const tenantId of [tenantA, tenantB]) {
      const [lead] = await db.insert(leads).values({ tenantId, name: "Lead recibo", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: new Date() }).returning();
      const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
      if (tenantId === tenantA) conversationA = conversation.id; else conversationB = conversation.id;
    }
    await db.insert(whatsappChannels).values([
      { tenantId: tenantA, phoneNumberId: phoneA },
      { tenantId: tenantA, phoneNumberId: phoneA2 },
      { tenantId: tenantB, phoneNumberId: phoneB },
    ]);
  });
  afterAll(async () => {
    const ids = [tenantA, tenantB];
    await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
    await db.delete(messages).where(inArray(messages.tenantId, ids));
    await db.delete(conversations).where(inArray(conversations.tenantId, ids));
    await db.delete(leads).where(inArray(leads.tenantId, ids));
    await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
    await db.delete(tenants).where(inArray(tenants.id, ids));
    await db.$client.end();
  });
  function orphan() {
    return { tenantId: tenantA, phoneNumberId: phoneA, wamid: `wamid.fixture.${randomUUID()}` };
  }
  async function outbound(tenantId = tenantA, phoneNumberId = phoneA) {
    const [row] = await db.insert(messages).values({ tenantId, conversationId: tenantId === tenantA ? conversationA : conversationB, sender: "agente", content: "Conteúdo privado somente na mensagem", whatsappPhoneNumberId: phoneNumberId, externalId: `wamid.fixture.${randomUUID()}` }).returning();
    return row;
  }

  it("chave tenant/canal/wamid é única, mas distingue números e tenants", async () => {
    const input = orphan();
    await db.insert(whatsappMessageReceipts).values(input);
    expect(await codeOf(db.insert(whatsappMessageReceipts).values(input))).toBe("23505");
    await db.insert(whatsappMessageReceipts).values([{ ...input, phoneNumberId: phoneA2 }, { ...input, tenantId: tenantB, phoneNumberId: phoneB }]);
    const rows = await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, input.wamid));
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => [row.tenantId, row.phoneNumberId])).toEqual(expect.arrayContaining([[tenantA, phoneA], [tenantA, phoneA2], [tenantB, phoneB]]));
  });

  it("FK recusa mensagem estrangeira, outro canal ou wamid divergente", async () => {
    const foreign = await outbound(tenantB, phoneB);
    const own = await outbound();
    for (const input of [
      { tenantId: tenantA, phoneNumberId: phoneA, wamid: foreign.externalId!, messageId: foreign.id, orphanExpiresAt: null },
      { tenantId: tenantA, phoneNumberId: phoneA2, wamid: own.externalId!, messageId: own.id, orphanExpiresAt: null },
      { ...orphan(), messageId: own.id, orphanExpiresAt: null },
    ]) {
      expect(await codeOf(db.insert(whatsappMessageReceipts).values(input))).toBe("23503");
      expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, input.wamid))).toHaveLength(0);
    }
    expect(await codeOf(db.insert(whatsappMessageReceipts).values({ ...orphan(), phoneNumberId: phoneB }))).toBe("23503");
  });

  it("órfão tem prazo de30dias e não cria mensagem; vínculo retira expiração temporária", async () => {
    const before = await db.select().from(messages).where(eq(messages.tenantId, tenantA));
    const input = orphan();
    const [row] = await db.insert(whatsappMessageReceipts).values(input).returning();
    expect(row.messageId).toBeNull();
    expect(row.classification).toBe("pending");
    expect(row.orphanExpiresAt!.getTime() - row.firstSeenAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(await db.select().from(messages).where(eq(messages.tenantId, tenantA))).toEqual(before);
    expect(await codeOf(db.insert(whatsappMessageReceipts).values({ ...orphan(), orphanExpiresAt: null }))).toBe("23514");
    const [message] = await db.insert(messages).values({ tenantId: tenantA, conversationId: conversationA, sender: "agente", content: "Saída real posterior", whatsappPhoneNumberId: phoneA, externalId: input.wamid }).returning();
    const [attached] = await db.update(whatsappMessageReceipts).set({ messageId: message.id, orphanExpiresAt: null }).where(eq(whatsappMessageReceipts.wamid, input.wamid)).returning();
    expect(attached.messageId).toBe(message.id);
    expect(attached.orphanExpiresAt).toBeNull();
  });

  it("excluir mensagem remove seu recibo; não vira órfão nem afeta outro tenant", async () => {
    const own = await outbound();
    const foreign = await outbound(tenantB, phoneB);
    await db.insert(whatsappMessageReceipts).values({ tenantId: tenantA, phoneNumberId: phoneA, wamid: own.externalId!, messageId: own.id, orphanExpiresAt: null });
    const [other] = await db.insert(whatsappMessageReceipts).values({ tenantId: tenantB, phoneNumberId: phoneB, wamid: foreign.externalId!, messageId: foreign.id, orphanExpiresAt: null }).returning();
    await db.delete(messages).where(eq(messages.id, own.id));
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, own.externalId!))).toHaveLength(0);
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, foreign.externalId!))).toEqual([other]);
  });

  it("mensagem legada/humana sem canal permanece válida; canal sem Analytics não bloqueia escrita", async () => {
    const [legacy] = await db.insert(messages).values({ tenantId: tenantA, conversationId: conversationA, sender: "humano", authorName: "Equipe fixture", content: "Legado" }).returning();
    expect(legacy.whatsappPhoneNumberId).toBeNull();
    expect(legacy.externalId).toBeNull();
    const [human] = await db.insert(messages).values({ tenantId: tenantA, conversationId: conversationA, sender: "humano", authorName: "Equipe fixture", content: "Envio humano", whatsappPhoneNumberId: "fixture-canal-sem-analytics", externalId: `wamid.fixture.${randomUUID()}` }).returning();
    expect(human.whatsappPhoneNumberId).toBe("fixture-canal-sem-analytics");
    expect(human.authorName).toBe("Equipe fixture");
  });

  it("evidência de conflito permanece indisponível e campos desconhecidos não viram gratuidade", async () => {
    const [row] = await db.insert(whatsappMessageReceipts).values({ ...orphan(), deliveredAt: new Date("2026-10-02T10:00:00Z"), pricingModel: "contrato-desconhecido", category: "service", pricingType: "desconhecido", billable: null, pricingConflict: true, classification: "unavailable" }).returning();
    expect(row.pricingConflict).toBe(true);
    expect(row.classification).toBe("unavailable");
    expect(row.pricingModel).toBe("contrato-desconhecido");
    expect(row.pricingType).toBe("desconhecido");
    expect(row.billable).toBeNull();
    expect(await codeOf(db.insert(whatsappMessageReceipts).values({ ...orphan(), pricingConflict: true, classification: "free_service" }))).toBe("23514");
    expect(await codeOf(db.insert(whatsappMessageReceipts).values({ ...orphan(), classification: "gratis-inferida" as never }))).toBe("22P02");
  });

  it("persiste somente evidências normalizadas e código numérico, sem payload ou conteúdo", async () => {
    const [row] = await db.insert(whatsappMessageReceipts).values({ ...orphan(), sentAt: new Date("2026-10-02T10:00:00Z"), failedAt: new Date("2026-10-02T10:01:00Z"), failureCode: 131026, classification: "not_delivered" }).returning();
    expect(row.failureCode).toBe(131026);
    expect(row.classification).toBe("not_delivered");
    expect(row.sentAt).toEqual(new Date("2026-10-02T10:00:00Z"));
    expect(row.failedAt).toEqual(new Date("2026-10-02T10:01:00Z"));
    expect(Object.keys(row).sort()).toEqual([
      "tenantId", "phoneNumberId", "wamid", "messageId", "sentAt", "deliveredAt", "readAt", "failedAt",
      "pricingModel", "category", "pricingType", "billable", "pricingConflict", "classification",
      "failureCode", "firstSeenAt", "lastSeenAt", "orphanExpiresAt",
    ].sort());
    expect(JSON.stringify(row)).not.toContain("Conteúdo privado somente na mensagem");
  });

  it("first/lastSeen preservam a ordem; identidade vazia e recibo vinculado com expiração são recusados", async () => {
    expect(await codeOf(db.insert(whatsappMessageReceipts).values({ ...orphan(), firstSeenAt: new Date("2026-10-02T10:00:00Z"), lastSeenAt: new Date("2026-10-02T09:59:59Z") }))).toBe("23514");
    expect(await codeOf(db.insert(whatsappMessageReceipts).values({ ...orphan(), wamid: " " }))).toBe("23514");
    const message = await outbound();
    expect(await codeOf(db.insert(whatsappMessageReceipts).values({ tenantId: tenantA, phoneNumberId: phoneA, wamid: message.externalId!, messageId: message.id }))).toBe("23514");
    const firstSeenAt = new Date("2026-10-02T10:00:00Z");
    const lastSeenAt = new Date("2026-10-02T10:01:00Z");
    const [row] = await db.insert(whatsappMessageReceipts).values({ ...orphan(), firstSeenAt, lastSeenAt }).returning();
    expect(row.firstSeenAt).toEqual(firstSeenAt);
    expect(row.lastSeenAt).toEqual(lastSeenAt);
  });
});
