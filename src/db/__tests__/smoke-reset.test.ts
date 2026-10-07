import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  conversations,
  humanMessageSends,
  leadAgentState,
  leads,
  messages,
  reengagementEpisodes,
  tenants,
  whatsappChannels,
  whatsappMessageReceipts,
} from "../schema";
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
  const channelIds: string[] = [];

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
      await db.delete(humanMessageSends).where(eq(humanMessageSends.leadId, lead.id));
      await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, lead.id));
      if (channelIds.length) await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.phoneNumberId, channelIds));
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
    if (channelIds.length) await db.delete(whatsappChannels).where(inArray(whatsappChannels.phoneNumberId, channelIds));
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

  it("apaga também as reservas de envio humano do lead, sem violar FK (lote-14 T19)", async () => {
    const leadId = await seedFixtureLead(1);
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.leadId, leadId));
    const [humanMessage] = await db
      .insert(messages)
      .values({
        tenantId,
        conversationId: conversation.id,
        sender: "humano",
        content: "mensagem humana de fixture",
        sentAt: new Date(),
        externalId: `wamid.fixture-${randomUUID()}`,
        authorName: "Corretora de fixture",
      })
      .returning({ id: messages.id });
    // Uma reserva `enviada` aponta para a mensagem (FK `message_id`) e outra
    // `falhou` não aponta para nada; as duas apontam para o lead.
    await db.insert(humanMessageSends).values([
      { tenantId, leadId, requestId: randomUUID(), state: "enviada", messageId: humanMessage.id },
      { tenantId, leadId, requestId: randomUUID(), state: "falhou", failure: "falha-meta" },
    ]);

    const result = await resetSmokeLead({ tenantSlug, externalId: fixtureExternalId });

    expect(result.outcome).toBe("apagado");
    expect(result.deletedMessages).toBe(2);
    const reservationsLeft = await db
      .select({ id: humanMessageSends.id })
      .from(humanMessageSends)
      .where(eq(humanMessageSends.leadId, leadId));
    expect(reservationsLeft).toEqual([]);
    const leadsLeft = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId));
    expect(leadsLeft).toEqual([]);
  });

  it("apaga também episódio de reengajamento e recibo do lead, sem violar FK (L14b)", async () => {
    const leadId = await seedFixtureLead(0);
    const [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.leadId, leadId));
    const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 15)}`).toString();
    channelIds.push(phoneNumberId);
    await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: new Date() });
    const anchorAt = new Date(Date.now() - 22 * 3600000);
    const [anchor] = await db
      .insert(messages)
      .values({ tenantId, conversationId: conversation.id, sender: "lead", content: "âncora de fixture", sentAt: anchorAt, whatsappPhoneNumberId: phoneNumberId })
      .returning();
    const wamid = `wamid.fixture-${randomUUID()}`;
    const [resume] = await db
      .insert(messages)
      .values({ tenantId, conversationId: conversation.id, sender: "agente", content: "retomada de fixture", sentAt: new Date(), externalId: wamid, whatsappPhoneNumberId: phoneNumberId })
      .returning();
    await db.insert(leadAgentState).values({ tenantId, leadId, anchorMessageId: anchor.id, phase: "qualificando" });
    const authorizedAt = new Date();
    await db.insert(reengagementEpisodes).values({
      tenantId, leadId, phoneNumberId, anchorMessageId: anchor.id, anchorSentAt: anchorAt, agentStateRevision: 1,
      state: "accepted", submittedText: "retomada de fixture", dispatchAuthorizedAt: authorizedAt,
      dispatchCompletionDeadline: new Date(authorizedAt.getTime() + 120000), wamid, acceptedAt: authorizedAt, messageId: resume.id,
    });
    await db.insert(whatsappMessageReceipts).values({
      tenantId, phoneNumberId, wamid, messageId: resume.id, firstSeenAt: authorizedAt, lastSeenAt: authorizedAt, orphanExpiresAt: null,
    });

    const result = await resetSmokeLead({ tenantSlug, externalId: fixtureExternalId });

    expect(result).toEqual({ outcome: "apagado", deletedMessages: 2, deletedConversations: 1 });
    expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, leadId))).toEqual([]);
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, wamid))).toEqual([]);
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, leadId))).toEqual([]);
    expect(await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId))).toEqual([]);
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
