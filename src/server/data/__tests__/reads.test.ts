import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { conversations, leads } from "../../../db/schema";
import {
  getConversationSummaries,
  getConversations,
  getLeads,
  getMessages,
  getTenants,
} from "../index";

// Assume o banco já está seedado (mesmo padrão de isolation.test.ts /
// mutations.test.ts). Cobre as leituras novas do lote 3: ordenação
// determinística de getLeads/getMessages e o shape/ordenação de
// getConversationSummaries (design.md — Data Models).
describe("server/data reads — lote 3 (ordenação e conversation summaries)", () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    const tenants = await getTenants();
    expect(tenants.length).toBeGreaterThanOrEqual(2);
    [tenantAId, tenantBId] = tenants.map((t) => t.id);
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("getLeads — ordenação determinística (updatedAt DESC, id)", () => {
    it("retorna leads em ordem não-crescente de updatedAt, com id como desempate", async () => {
      const result = await getLeads(tenantAId);
      expect(result.length).toBeGreaterThan(1);

      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1];
        const curr = result[i];
        if (prev.updatedAt.getTime() === curr.updatedAt.getTime()) {
          expect(prev.id <= curr.id).toBe(true);
        } else {
          expect(prev.updatedAt.getTime()).toBeGreaterThan(curr.updatedAt.getTime());
        }
      }
    });

    it("chamadas sucessivas retornam exatamente a mesma ordem", async () => {
      const first = await getLeads(tenantAId);
      const second = await getLeads(tenantAId);
      expect(second.map((l) => l.id)).toEqual(first.map((l) => l.id));
    });
  });

  describe("getMessages — ordenação determinística (sentAt ASC, id)", () => {
    it("retorna mensagens de uma conversa em ordem não-decrescente de sentAt, com id como desempate", async () => {
      const [conversation] = await getConversations(tenantAId);
      expect(conversation).toBeDefined();

      const result = await getMessages(tenantAId, conversation.id);
      expect(result.length).toBeGreaterThan(1);

      for (let i = 1; i < result.length; i++) {
        const prev = result[i - 1];
        const curr = result[i];
        if (prev.sentAt.getTime() === curr.sentAt.getTime()) {
          expect(prev.id <= curr.id).toBe(true);
        } else {
          expect(prev.sentAt.getTime()).toBeLessThan(curr.sentAt.getTime());
        }
      }
    });
  });

  describe("getConversationSummaries", () => {
    it("shape completo (leadName, lastMessage) e disjunção total entre tenant A e B", async () => {
      const summariesA = await getConversationSummaries(tenantAId);
      const summariesB = await getConversationSummaries(tenantBId);

      expect(summariesA.length).toBeGreaterThan(0);
      expect(summariesB.length).toBeGreaterThan(0);

      // Todo lead do seed já tem conversa com mensagens, então nenhum
      // resultado real do seed deve vir com lastMessage null aqui.
      for (const summary of summariesA) {
        expect(summary.leadId).toBeTruthy();
        expect(summary.leadName).toBeTruthy();
        expect(summary.lastMessage).not.toBeNull();
        expect(summary.lastMessage!.content).toBeTruthy();
        expect(["agente", "lead"]).toContain(summary.lastMessage!.sender);
        expect(summary.lastMessage!.sentAt).toBeInstanceOf(Date);
      }

      const idsA = new Set(summariesA.map((s) => s.id));
      const idsB = new Set(summariesB.map((s) => s.id));
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);
    });

    it("ordena pela última mensagem DESC (mais recente primeiro)", async () => {
      const summaries = await getConversationSummaries(tenantAId);
      const withMessage = summaries.filter((s) => s.lastMessage !== null);
      expect(withMessage.length).toBeGreaterThan(1);

      for (let i = 1; i < withMessage.length; i++) {
        const prevTime = withMessage[i - 1].lastMessage!.sentAt.getTime();
        const currTime = withMessage[i].lastMessage!.sentAt.getTime();
        expect(prevTime).toBeGreaterThanOrEqual(currTime);
      }
    });

    it("conversa sem nenhuma mensagem aparece com lastMessage: null e ordenada por último", async () => {
      const leadId = randomUUID();
      const conversationId = randomUUID();

      await db.insert(leads).values({
        id: leadId,
        tenantId: tenantAId,
        name: "Lead Sem Mensagens (Teste T3)",
        phone: "+55 34 90000-9999",
        status: "em_qualificacao",
        firstContactAt: new Date(),
      });
      await db.insert(conversations).values({
        id: conversationId,
        tenantId: tenantAId,
        leadId,
      });

      try {
        const summaries = await getConversationSummaries(tenantAId);
        const target = summaries.find((s) => s.id === conversationId);
        expect(target).toBeDefined();
        expect(target!.leadId).toBe(leadId);
        expect(target!.lastMessage).toBeNull();

        const targetIndex = summaries.findIndex((s) => s.id === conversationId);
        const lastIndexWithMessage = summaries.reduce(
          (maxIndex, s, i) => (s.lastMessage !== null ? i : maxIndex),
          -1
        );
        expect(targetIndex).toBeGreaterThan(lastIndexWithMessage);
      } finally {
        await db.delete(conversations).where(eq(conversations.id, conversationId));
        await db.delete(leads).where(eq(leads.id, leadId));
      }
    });

    it("retorna [] para um tenant inexistente, nunca um erro", async () => {
      const result = await getConversationSummaries(
        "00000000-0000-4000-8000-000000000000"
      );
      expect(result).toEqual([]);
    });
  });
});
