import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../index";
import { conversations, leads, messages, tenants } from "../schema";
import { resetSmokeLead } from "../smoke-reset";

/**
 * `resetSmokeLead` — alvo 3 do checklist de limpeza (`n8n/smoke/roteiro.md` §9).
 *
 * Assume o banco já seedado (mesmo padrão de `properties.test.ts`), mas nunca
 * toca o alvo real do smoke: os testes passam `tenantSlug`/`externalId`
 * próprios, com um `externalId` de fixture, para não depender de — nem
 * apagar — o lead de teste de verdade.
 */
describe("resetSmokeLead", () => {
  let tenantSlug: string;
  let tenantId: string;
  const fixtureExternalId = `fixture-${randomUUID()}`;

  beforeEach(async () => {
    const [tenant] = await db.select().from(tenants).limit(1);
    expect(tenant).toBeDefined();
    tenantSlug = tenant.slug;
    tenantId = tenant.id;
  });

  afterAll(async () => {
    // Rede de segurança: se alguma asserção falhar no meio, a fixture não fica
    // pendurada no banco de teste.
    const [lead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(eq(leads.tenantId, tenantId), eq(leads.externalId, fixtureExternalId))
      );
    if (lead) {
      const convs = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.leadId, lead.id));
      for (const conv of convs) {
        await db.delete(messages).where(eq(messages.conversationId, conv.id));
      }
      await db.delete(conversations).where(eq(conversations.leadId, lead.id));
      await db.delete(leads).where(eq(leads.id, lead.id));
    }
  });

  async function seedFixtureLead(messageCount: number): Promise<string> {
    const [lead] = await db
      .insert(leads)
      .values({
        tenantId,
        name: "Lead de fixture do smoke-reset",
        phone: fixtureExternalId,
        status: "em_qualificacao",
        firstContactAt: new Date(),
        externalId: fixtureExternalId,
      })
      .returning({ id: leads.id });

    const [conversation] = await db
      .insert(conversations)
      .values({ tenantId, leadId: lead.id })
      .returning({ id: conversations.id });

    for (let i = 0; i < messageCount; i += 1) {
      await db.insert(messages).values({
        tenantId,
        conversationId: conversation.id,
        sender: "lead",
        content: `mensagem de fixture ${i}`,
        sentAt: new Date(),
      });
    }

    return lead.id;
  }

  it("apaga lead, conversa e mensagens do alvo, na ordem que as FKs exigem", async () => {
    const leadId = await seedFixtureLead(3);

    const result = await resetSmokeLead({
      tenantSlug,
      externalId: fixtureExternalId,
    });

    expect(result.outcome).toBe("apagado");
    expect(result.deletedMessages).toBe(3);
    expect(result.deletedConversations).toBe(1);

    const leadsLeft = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.id, leadId));
    expect(leadsLeft).toEqual([]);

    const conversationsLeft = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.leadId, leadId));
    expect(conversationsLeft).toEqual([]);
  });

  it("é idempotente: rodar de novo sem lead devolve nada-a-apagar, não erro", async () => {
    await seedFixtureLead(1);
    await resetSmokeLead({ tenantSlug, externalId: fixtureExternalId });

    const segunda = await resetSmokeLead({
      tenantSlug,
      externalId: fixtureExternalId,
    });

    expect(segunda.outcome).toBe("nada-a-apagar");
    expect(segunda.deletedMessages).toBe(0);
    expect(segunda.deletedConversations).toBe(0);
  });

  it("recusa slug de imobiliária inexistente em vez de apagar nada em silêncio", async () => {
    await expect(
      resetSmokeLead({
        tenantSlug: `nao-existe-${randomUUID()}`,
        externalId: fixtureExternalId,
      })
    ).rejects.toThrow(/não existe/);
  });

  it("não toca lead de outra imobiliária com o mesmo externalId", async () => {
    const allTenants = await db.select().from(tenants).limit(2);
    expect(allTenants.length).toBeGreaterThanOrEqual(2);
    const outroTenant = allTenants.find((t) => t.id !== tenantId);
    expect(outroTenant).toBeDefined();

    await seedFixtureLead(1);
    const [leadDoOutro] = await db
      .insert(leads)
      .values({
        tenantId: outroTenant!.id,
        name: "Lead homônimo de outra imobiliária",
        phone: fixtureExternalId,
        status: "em_qualificacao",
        firstContactAt: new Date(),
        externalId: fixtureExternalId,
      })
      .returning({ id: leads.id });

    await resetSmokeLead({ tenantSlug, externalId: fixtureExternalId });

    const sobrevivente = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.id, leadDoOutro.id));
    expect(sobrevivente).toHaveLength(1);

    await db.delete(leads).where(eq(leads.id, leadDoOutro.id));
  });
});
