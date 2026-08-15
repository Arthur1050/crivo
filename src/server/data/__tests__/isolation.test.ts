import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { conversations, leads } from "../../../db/schema";
import {
  getBrokers,
  getConversations,
  getDocuments,
  getLead,
  getLeads,
  getMessages,
  getTenant,
  getTenants,
} from "../index";

const NON_EXISTENT_TENANT_ID = "00000000-0000-4000-8000-000000000000";
const NON_EXISTENT_LEAD_ID = "00000000-0000-4000-8000-000000000001";

// Assume o banco já está seedado (ver AGENTS do batch: `npm run db:seed`).
// Não roda o seed aqui de propósito — `db/seed.test.ts` já cobre o seed em
// si, e rodar `runSeed()` duas vezes em paralelo contra o mesmo Postgres
// real causa uma corrida (deletes/inserts concorrentes de duas transações
// independentes violam as FKs entre conversations/messages).
describe("server/data isolation", () => {
  let tenantAId: string;
  let tenantBId: string;
  let fixtureLeadBId: string;

  beforeAll(async () => {
    // lote-7 — REAL-01: só `crivo-demo` recebe lead/conversa fictícios no
    // seed a partir daqui; os pilotos nascem com 0 de cada. Tenant A precisa
    // ter lead/conversa reais para os testes de "totalmente disjuntos"
    // abaixo, então é resolvido pelo slug em vez de "os dois primeiros
    // tenants" (ordem antes arbitrária, agora garantidamente vazia para 2
    // dos 3 tenants). Tenant B fica com um dos pilotos, que continua com
    // corretores/categorias/documentos — só falta lead/conversa própria,
    // inserida como fixture mínima abaixo (limpa no afterAll).
    const allTenants = await getTenants();
    expect(allTenants.length).toBeGreaterThanOrEqual(2);
    const demo = allTenants.find((t) => t.slug === "crivo-demo");
    const other = allTenants.find((t) => t.id !== demo?.id);
    expect(demo, "tenant Crivo Demo deveria existir (seed lote-7)").toBeDefined();
    expect(other).toBeDefined();
    tenantAId = demo!.id;
    tenantBId = other!.id;

    fixtureLeadBId = randomUUID();
    await db.insert(leads).values({
      id: fixtureLeadBId,
      tenantId: tenantBId,
      name: "Lead Fixture Isolamento B",
      phone: "+55 34 90000-8888",
      status: "em_qualificacao",
      firstContactAt: new Date(),
    });
    await db.insert(conversations).values({
      tenantId: tenantBId,
      leadId: fixtureLeadBId,
    });
  });

  afterAll(async () => {
    await db.delete(conversations).where(eq(conversations.leadId, fixtureLeadBId));
    await db.delete(leads).where(eq(leads.id, fixtureLeadBId));
    await db.$client.end();
  });

  it("getTenants retorna todos os tenants do seed, incluindo A e B", async () => {
    const tenants = await getTenants();
    const ids = tenants.map((t) => t.id);
    expect(ids).toContain(tenantAId);
    expect(ids).toContain(tenantBId);
  });

  it("getTenants retorna sempre a mesma ordem entre chamadas sucessivas (fallback de 'sem cookie' precisa ser determinístico)", async () => {
    const first = await getTenants();
    const second = await getTenants();
    expect(second.map((t) => t.id)).toEqual(first.map((t) => t.id));
  });

  describe("getTenant", () => {
    it("tenant A e tenant B são registros distintos (AC 2.2)", async () => {
      const tenantA = await getTenant(tenantAId);
      const tenantB = await getTenant(tenantBId);
      expect(tenantA).not.toBeNull();
      expect(tenantB).not.toBeNull();
      expect(tenantA!.id).toBe(tenantAId);
      expect(tenantB!.id).toBe(tenantBId);
      expect(tenantA!.id).not.toBe(tenantB!.id);
    });

    it("retorna null para um tenant inexistente (edge case)", async () => {
      const result = await getTenant(NON_EXISTENT_TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe("getBrokers", () => {
    it("resultados do tenant A e B são totalmente disjuntos e cada corretor pertence ao tenant pedido (AC 2.1, 2.2)", async () => {
      const brokersA = await getBrokers(tenantAId);
      const brokersB = await getBrokers(tenantBId);

      expect(brokersA.length).toBeGreaterThan(0);
      expect(brokersB.length).toBeGreaterThan(0);

      const idsA = new Set(brokersA.map((b) => b.id));
      const idsB = new Set(brokersB.map((b) => b.id));
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);

      for (const broker of brokersA) expect(broker.tenantId).toBe(tenantAId);
      for (const broker of brokersB) expect(broker.tenantId).toBe(tenantBId);
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getBrokers(NON_EXISTENT_TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  describe("getLeads", () => {
    it("resultados do tenant A e B são totalmente disjuntos e cada lead pertence ao tenant pedido (AC 2.1, 2.2)", async () => {
      const leadsA = await getLeads(tenantAId);
      const leadsB = await getLeads(tenantBId);

      expect(leadsA.length).toBeGreaterThan(0);
      expect(leadsB.length).toBeGreaterThan(0);

      const idsA = new Set(leadsA.map((l) => l.id));
      const idsB = new Set(leadsB.map((l) => l.id));
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);

      for (const lead of leadsA) expect(lead.tenantId).toBe(tenantAId);
      for (const lead of leadsB) expect(lead.tenantId).toBe(tenantBId);
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getLeads(NON_EXISTENT_TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  describe("getLead", () => {
    it("retorna o lead quando consultado com o próprio tenant", async () => {
      const [leadA] = await getLeads(tenantAId);
      expect(leadA).toBeDefined();

      const result = await getLead(tenantAId, leadA.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(leadA.id);
      expect(result!.tenantId).toBe(tenantAId);
    });

    it("retorna null ao consultar um lead do tenant A usando o tenant B (isolamento cross-tenant, AC 2.2)", async () => {
      const [leadA] = await getLeads(tenantAId);
      expect(leadA).toBeDefined();

      const result = await getLead(tenantBId, leadA.id);
      expect(result).toBeNull();
    });

    it("retorna null para um lead inexistente (edge case)", async () => {
      const result = await getLead(tenantAId, NON_EXISTENT_LEAD_ID);
      expect(result).toBeNull();
    });
  });

  describe("getConversations", () => {
    it("resultados do tenant A e B são totalmente disjuntos e cada conversa pertence ao tenant pedido (AC 2.1, 2.2)", async () => {
      const conversationsA = await getConversations(tenantAId);
      const conversationsB = await getConversations(tenantBId);

      expect(conversationsA.length).toBeGreaterThan(0);
      expect(conversationsB.length).toBeGreaterThan(0);

      const idsA = new Set(conversationsA.map((c) => c.id));
      const idsB = new Set(conversationsB.map((c) => c.id));
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);

      for (const conversation of conversationsA)
        expect(conversation.tenantId).toBe(tenantAId);
      for (const conversation of conversationsB)
        expect(conversation.tenantId).toBe(tenantBId);
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getConversations(NON_EXISTENT_TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  describe("getMessages", () => {
    it("retorna as mensagens da conversa quando consultada com o próprio tenant, todas com o tenant correto", async () => {
      const [conversationA] = await getConversations(tenantAId);
      expect(conversationA).toBeDefined();

      const result = await getMessages(tenantAId, conversationA.id);
      expect(result.length).toBeGreaterThan(0);
      for (const message of result) expect(message.tenantId).toBe(tenantAId);
    });

    it("retorna [] ao consultar uma conversa do tenant A usando o tenant B (isolamento cross-tenant, AC 2.2)", async () => {
      const [conversationA] = await getConversations(tenantAId);
      expect(conversationA).toBeDefined();

      const result = await getMessages(tenantBId, conversationA.id);
      expect(result).toEqual([]);
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getMessages(NON_EXISTENT_TENANT_ID, NON_EXISTENT_LEAD_ID);
      expect(result).toEqual([]);
    });
  });

  describe("getDocuments", () => {
    it("resultados do tenant A e B são totalmente disjuntos e cada documento pertence ao tenant pedido (AC 2.1, 2.2)", async () => {
      const documentsA = await getDocuments(tenantAId);
      const documentsB = await getDocuments(tenantBId);

      expect(documentsA.length).toBeGreaterThan(0);
      expect(documentsB.length).toBeGreaterThan(0);

      const idsA = new Set(documentsA.map((d) => d.id));
      const idsB = new Set(documentsB.map((d) => d.id));
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);

      for (const document of documentsA)
        expect(document.tenantId).toBe(tenantAId);
      for (const document of documentsB)
        expect(document.tenantId).toBe(tenantBId);
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getDocuments(NON_EXISTENT_TENANT_ID);
      expect(result).toEqual([]);
    });
  });
});
