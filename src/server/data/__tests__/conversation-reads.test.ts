import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import {
  conversations,
  leads,
  messages,
  tenant_members,
  tenants,
  users,
} from "../../../db/schema";
import {
  getConversationSummaries,
  getLeadMessages,
  getMessages,
  type LeadScope,
} from "../index";

/**
 * Autoria e condução nas leituras da DAL (lote-14, T7 — THREAD-01 AC1, AC5,
 * AC7). Tenant, usuários e leads próprios deste arquivo.
 */

type LeadRow = typeof leads.$inferSelect;

const BASE = new Date("2026-10-01T10:00:00.000Z");
const MINUTE = 60 * 1000;

describe("server/data — autoria e condução nas leituras (lote-14, T7)", () => {
  let tenantId: string;
  let brokerAId: string;
  let brokerBId: string;
  let managerScope: LeadScope;
  let brokerAScope: LeadScope;
  const userIds: string[] = [];

  beforeAll(async () => {
    tenantId = randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: `Tenant leituras ${tenantId}`,
      agentName: "Agente",
      supportedModality: "ambos",
      slug: `fixture-${tenantId}`,
    });
    brokerAId = await createMember("Corretor A");
    brokerBId = await createMember("Corretor B");
    managerScope = { tenantId, assignedUserId: null };
    brokerAScope = { tenantId, assignedUserId: brokerAId };
  });

  afterAll(async () => {
    await db.delete(messages).where(eq(messages.tenantId, tenantId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
    await db.delete(leads).where(eq(leads.tenantId, tenantId));
    await db.delete(tenant_members).where(eq(tenant_members.organizationId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  async function createMember(name: string): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({ id, name, email: `${id}@fixture.test` });
    userIds.push(id);
    await db.insert(tenant_members).values({ organizationId: tenantId, userId: id, role: "corretor" });
    return id;
  }

  async function createLeadWithConversation(
    overrides: Partial<LeadRow> = {}
  ): Promise<{ leadId: string; conversationId: string }> {
    const leadId = randomUUID();
    await db.insert(leads).values({
      id: leadId,
      tenantId,
      name: `Lead ${leadId.slice(0, 8)}`,
      phone: "+55 34 90000-4444",
      status: "em_qualificacao",
      firstContactAt: BASE,
      ...overrides,
    });
    const [conversation] = await db
      .insert(conversations)
      .values({ tenantId, leadId })
      .returning();
    return { leadId, conversationId: conversation.id };
  }

  async function addMessage(
    conversationId: string,
    sender: "lead" | "agente" | "humano",
    content: string,
    sentAt: Date,
    extra: { id?: string; authorName?: string; authorUserId?: string } = {}
  ) {
    await db.insert(messages).values({
      tenantId,
      conversationId,
      sender,
      content,
      sentAt,
      ...extra,
    });
  }

  async function summaryOf(scope: LeadScope, conversationId: string) {
    const summaries = await getConversationSummaries(scope);
    return summaries.find((summary) => summary.id === conversationId);
  }

  describe("getConversationSummaries — humanConducted (THREAD-01 AC5)", () => {
    it("true com a marca", async () => {
      const { conversationId } = await createLeadWithConversation({ humanTakeoverAt: BASE });
      await addMessage(conversationId, "lead", "oi", BASE);
      expect((await summaryOf(managerScope, conversationId))!.humanConducted).toBe(true);
    });

    it("true em escalado_humano sem a marca", async () => {
      const { conversationId } = await createLeadWithConversation({ status: "escalado_humano" });
      await addMessage(conversationId, "lead", "oi", BASE);
      expect((await summaryOf(managerScope, conversationId))!.humanConducted).toBe(true);
    });

    it("false sem nenhum dos dois", async () => {
      const { conversationId } = await createLeadWithConversation({ status: "qualificado_agendado" });
      await addMessage(conversationId, "lead", "oi", BASE);
      expect((await summaryOf(managerScope, conversationId))!.humanConducted).toBe(false);
    });
  });

  describe("getConversationSummaries — última mensagem com várias por conversa", () => {
    it("devolve a mais recente, mesmo inserida fora de ordem", async () => {
      const { conversationId } = await createLeadWithConversation();
      await addMessage(conversationId, "agente", "segunda", new Date(BASE.getTime() + 2 * MINUTE));
      await addMessage(conversationId, "humano", "terceira", new Date(BASE.getTime() + 3 * MINUTE), {
        authorName: "Ana",
      });
      await addMessage(conversationId, "lead", "primeira", new Date(BASE.getTime() + MINUTE));
      const summary = await summaryOf(managerScope, conversationId);
      expect(summary!.lastMessage).toEqual({
        content: "terceira",
        sentAt: new Date(BASE.getTime() + 3 * MINUTE),
        sender: "humano",
      });
    });

    it("com sentAt empatado, o desempate é o maior id (mesma regra de antes)", async () => {
      const { conversationId } = await createLeadWithConversation();
      const tie = new Date(BASE.getTime() + 5 * MINUTE);
      await addMessage(conversationId, "lead", "id maior", tie, {
        id: "ffffffff-0000-4000-8000-000000000002",
      });
      await addMessage(conversationId, "agente", "id menor", tie, {
        id: "00000000-0000-4000-8000-000000000001",
      });
      const summary = await summaryOf(managerScope, conversationId);
      expect(summary!.lastMessage!.content).toBe("id maior");
    });

    it("cada conversa recebe a própria última mensagem", async () => {
      const first = await createLeadWithConversation();
      const second = await createLeadWithConversation();
      await addMessage(first.conversationId, "lead", "A1", new Date(BASE.getTime() + MINUTE));
      await addMessage(first.conversationId, "agente", "A2", new Date(BASE.getTime() + 9 * MINUTE));
      await addMessage(second.conversationId, "lead", "B1", new Date(BASE.getTime() + 4 * MINUTE));
      await addMessage(second.conversationId, "agente", "B2", new Date(BASE.getTime() + 6 * MINUTE));
      expect((await summaryOf(managerScope, first.conversationId))!.lastMessage!.content).toBe("A2");
      expect((await summaryOf(managerScope, second.conversationId))!.lastMessage!.content).toBe("B2");
    });
  });

  describe("getConversationSummaries — escopo de corretor", () => {
    it("corretor puro continua vendo só a própria carteira", async () => {
      const own = await createLeadWithConversation({
        assignedUserId: brokerAId,
        humanTakeoverAt: BASE,
      });
      const other = await createLeadWithConversation({ assignedUserId: brokerBId });
      await addMessage(own.conversationId, "lead", "do A", BASE);
      await addMessage(other.conversationId, "lead", "do B", BASE);

      const summaries = await getConversationSummaries(brokerAScope);
      expect(summaries.map((summary) => summary.id)).toEqual([own.conversationId]);
      expect(summaries[0].lastMessage!.content).toBe("do A");
      expect(summaries[0].humanConducted).toBe(true);
    });
  });

  describe("authorName nas mensagens (THREAD-01 AC1, AC7)", () => {
    it("getMessages e getLeadMessages trazem authorName na mensagem humano e null nas demais", async () => {
      const { leadId, conversationId } = await createLeadWithConversation();
      await addMessage(conversationId, "lead", "pergunta", new Date(BASE.getTime() + MINUTE));
      await addMessage(conversationId, "agente", "resposta", new Date(BASE.getTime() + 2 * MINUTE));
      await addMessage(conversationId, "humano", "do corretor", new Date(BASE.getTime() + 3 * MINUTE), {
        authorName: "Ana Corretora",
        authorUserId: brokerAId,
      });

      const expected = [
        { content: "pergunta", authorName: null },
        { content: "resposta", authorName: null },
        { content: "do corretor", authorName: "Ana Corretora" },
      ];
      const thread = await getMessages(managerScope, conversationId);
      expect(thread.map(({ content, authorName }) => ({ content, authorName }))).toEqual(expected);
      const contract = await getLeadMessages(tenantId, leadId, 50);
      expect(contract!.map(({ content, authorName }) => ({ content, authorName }))).toEqual(expected);
    });

    it("authorName sobrevive à exclusão do usuário autor (THREAD-01 AC7)", async () => {
      const authorId = randomUUID();
      await db.insert(users).values({ id: authorId, name: "Bruno", email: `${authorId}@fixture.test` });
      const { conversationId } = await createLeadWithConversation();
      await addMessage(conversationId, "humano", "do Bruno", BASE, {
        authorName: "Bruno",
        authorUserId: authorId,
      });
      await db.delete(users).where(eq(users.id, authorId));

      const [message] = await getMessages(managerScope, conversationId);
      expect(message.authorName).toBe("Bruno");
      expect(message.authorUserId).toBeNull();
    });
  });
});
