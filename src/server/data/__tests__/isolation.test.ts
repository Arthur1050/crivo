import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
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
  createDocument,
  getBrokers,
  getConversations,
  getConversationSummaries,
  getDashboardKpis,
  getDocuments,
  getLead,
  getLeadDistributions,
  getLeads,
  getLeadVolumeSeries,
  getMessages,
  getRecentLeads,
  getTenant,
  getTenants,
  serviceScope,
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

    await Promise.all([
      createDocument(tenantAId, {
        name: "Fixture documento isolamento A.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        modality: "novo",
      }),
      createDocument(tenantBId, {
        name: "Fixture documento isolamento B.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        modality: "usado",
      }),
    ]);

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
      const leadsA = await getLeads(serviceScope(tenantAId));
      const leadsB = await getLeads(serviceScope(tenantBId));

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
      const result = await getLeads(serviceScope(NON_EXISTENT_TENANT_ID));
      expect(result).toEqual([]);
    });
  });

  describe("getLead", () => {
    it("retorna o lead quando consultado com o próprio tenant", async () => {
      const [leadA] = await getLeads(serviceScope(tenantAId));
      expect(leadA).toBeDefined();

      const result = await getLead(serviceScope(tenantAId), leadA.id);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(leadA.id);
      expect(result!.tenantId).toBe(tenantAId);
    });

    it("retorna null ao consultar um lead do tenant A usando o tenant B (isolamento cross-tenant, AC 2.2)", async () => {
      const [leadA] = await getLeads(serviceScope(tenantAId));
      expect(leadA).toBeDefined();

      const result = await getLead(serviceScope(tenantBId), leadA.id);
      expect(result).toBeNull();
    });

    it("retorna null para um lead inexistente (edge case)", async () => {
      const result = await getLead(serviceScope(tenantAId), NON_EXISTENT_LEAD_ID);
      expect(result).toBeNull();
    });
  });

  describe("getConversations", () => {
    it("resultados do tenant A e B são totalmente disjuntos e cada conversa pertence ao tenant pedido (AC 2.1, 2.2)", async () => {
      const conversationsA = await getConversations(serviceScope(tenantAId));
      const conversationsB = await getConversations(serviceScope(tenantBId));

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
      const result = await getConversations(serviceScope(NON_EXISTENT_TENANT_ID));
      expect(result).toEqual([]);
    });
  });

  describe("getMessages", () => {
    it("retorna as mensagens da conversa quando consultada com o próprio tenant, todas com o tenant correto", async () => {
      const [conversationA] = await getConversations(serviceScope(tenantAId));
      expect(conversationA).toBeDefined();

      const result = await getMessages(serviceScope(tenantAId), conversationA.id);
      expect(result.length).toBeGreaterThan(0);
      for (const message of result) expect(message.tenantId).toBe(tenantAId);
    });

    it("retorna [] ao consultar uma conversa do tenant A usando o tenant B (isolamento cross-tenant, AC 2.2)", async () => {
      const [conversationA] = await getConversations(serviceScope(tenantAId));
      expect(conversationA).toBeDefined();

      const result = await getMessages(serviceScope(tenantBId), conversationA.id);
      expect(result).toEqual([]);
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getMessages(serviceScope(NON_EXISTENT_TENANT_ID), NON_EXISTENT_LEAD_ID);
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

  // lote-8 — SCOPE-01: isolamento entre CORRETORES da MESMA imobiliária. O
  // isolamento entre imobiliárias acima continua valendo; esta é a dimensão
  // nova, e é a falha mais grave que este lote pode produzir (design.md —
  // Risks). Fixture própria: uma imobiliária, dois corretores, quatro leads
  // (um de cada corretor, um sem responsável, um de outra imobiliária).
  describe("escopo de carteira entre dois corretores da mesma imobiliária", () => {
    let tenantId: string;
    let corretorAId: string;
    let corretorBId: string;
    let leadDeAId: string;
    let leadDeBId: string;
    let leadSemDonoId: string;
    let conversaDeAId: string;
    let conversaDeBId: string;

    /** Escopo de quem só tem papel corretor: enxerga apenas os próprios. */
    const scopeOf = (userId: string) => ({ tenantId, assignedUserId: userId });
    /** Escopo de administrador/gestor: a imobiliária inteira. */
    const scopeAmplo = () => ({ tenantId, assignedUserId: null });

    beforeAll(async () => {
      tenantId = randomUUID();
      await db.insert(tenants).values({
        id: tenantId,
        name: "Tenant Escopo Carteira",
        agentName: "Agente Escopo",
        supportedModality: "ambos",
        slug: `fixture-${tenantId}`,
      });

      corretorAId = randomUUID();
      corretorBId = randomUUID();
      await db.insert(users).values([
        { id: corretorAId, name: "Corretor A", email: `${corretorAId}@fixture.test` },
        { id: corretorBId, name: "Corretor B", email: `${corretorBId}@fixture.test` },
      ]);
      await db.insert(tenant_members).values([
        { organizationId: tenantId, userId: corretorAId, role: "corretor" },
        { organizationId: tenantId, userId: corretorBId, role: "corretor" },
      ]);

      leadDeAId = randomUUID();
      leadDeBId = randomUUID();
      leadSemDonoId = randomUUID();
      const base = {
        tenantId,
        phone: "+55 34 90000-1234",
        status: "em_qualificacao" as const,
        firstContactAt: new Date(),
      };
      await db.insert(leads).values([
        { ...base, id: leadDeAId, name: "Lead do A", assignedUserId: corretorAId },
        { ...base, id: leadDeBId, name: "Lead do B", assignedUserId: corretorBId },
        { ...base, id: leadSemDonoId, name: "Lead sem dono", assignedUserId: null },
      ]);

      conversaDeAId = randomUUID();
      conversaDeBId = randomUUID();
      await db.insert(conversations).values([
        { id: conversaDeAId, tenantId, leadId: leadDeAId },
        { id: conversaDeBId, tenantId, leadId: leadDeBId },
      ]);
      await db.insert(messages).values([
        {
          tenantId,
          conversationId: conversaDeAId,
          sender: "lead",
          content: "Mensagem do lead do A",
        },
        {
          tenantId,
          conversationId: conversaDeBId,
          sender: "lead",
          content: "Mensagem do lead do B",
        },
      ]);
    });

    afterAll(async () => {
      await db.delete(messages).where(eq(messages.tenantId, tenantId));
      await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
      await db.delete(leads).where(eq(leads.tenantId, tenantId));
      await db.delete(tenant_members).where(eq(tenant_members.organizationId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
      await db.delete(users).where(inArray(users.id, [corretorAId, corretorBId]));
    });

    // SCOPE-01 AC1 (Pipeline)
    it("cada corretor vê no Pipeline apenas os próprios leads", async () => {
      const doA = await getLeads(scopeOf(corretorAId));
      const doB = await getLeads(scopeOf(corretorBId));

      expect(doA.map((l) => l.id)).toEqual([leadDeAId]);
      expect(doB.map((l) => l.id)).toEqual([leadDeBId]);
      expect(doA.map((l) => l.id)).not.toContain(leadDeBId);
      expect(doB.map((l) => l.id)).not.toContain(leadDeAId);
    });

    // SCOPE-01 AC4
    it("lead de outro corretor pedido pelo identificador responde como inexistente", async () => {
      // Existe de fato — provado pelo escopo amplo na mesma asserção.
      expect((await getLead(scopeAmplo(), leadDeBId))!.id).toBe(leadDeBId);

      const pedidoPeloA = await getLead(scopeOf(corretorAId), leadDeBId);
      expect(pedidoPeloA).toBeNull();

      // Indistinguível de um id que não existe: mesmo `null`, sem sinal algum.
      const inexistente = await getLead(scopeOf(corretorAId), NON_EXISTENT_LEAD_ID);
      expect(pedidoPeloA).toEqual(inexistente);
    });

    // SCOPE-01 AC5
    it("lead sem responsável é visível para administrador e gestor e invisível para o corretor", async () => {
      const amplo = await getLeads(scopeAmplo());
      expect(amplo.map((l) => l.id)).toContain(leadSemDonoId);
      expect(amplo).toHaveLength(3);

      expect((await getLeads(scopeOf(corretorAId))).map((l) => l.id)).not.toContain(
        leadSemDonoId
      );
      expect(await getLead(scopeOf(corretorAId), leadSemDonoId)).toBeNull();
      expect((await getLead(scopeAmplo(), leadSemDonoId))!.id).toBe(leadSemDonoId);
    });

    // SCOPE-01 AC2 (Chats)
    it("cada corretor vê em Chats apenas as conversas dos próprios leads", async () => {
      const resumosA = await getConversationSummaries(scopeOf(corretorAId));
      expect(resumosA.map((c) => c.id)).toEqual([conversaDeAId]);
      expect(resumosA[0].leadName).toBe("Lead do A");

      const conversasA = await getConversations(scopeOf(corretorAId));
      expect(conversasA.map((c) => c.id)).toEqual([conversaDeAId]);

      // Pedir a thread do outro pelo id da conversa devolve vazio, e a
      // própria continua chegando — a query não é cega, é escopada.
      expect(await getMessages(scopeOf(corretorAId), conversaDeBId)).toEqual([]);
      expect(
        (await getMessages(scopeOf(corretorAId), conversaDeAId)).map((m) => m.content)
      ).toEqual(["Mensagem do lead do A"]);
    });

    // SCOPE-01 AC3 (Dashboard)
    it("os indicadores do Dashboard são calculados só sobre a carteira do corretor", async () => {
      const range = {
        from: new Date(Date.now() - 86400000),
        to: new Date(Date.now() + 86400000),
      };

      expect((await getDashboardKpis(scopeAmplo(), range)).leadCount).toBe(3);
      expect((await getDashboardKpis(scopeOf(corretorAId), range)).leadCount).toBe(1);
      expect((await getDashboardKpis(scopeOf(corretorBId), range)).leadCount).toBe(1);

      const volumeAmplo = await getLeadVolumeSeries(scopeAmplo(), range, "day");
      const volumeDoA = await getLeadVolumeSeries(scopeOf(corretorAId), range, "day");
      const soma = (bs: { count: number }[]) => bs.reduce((t, b) => t + b.count, 0);
      expect(soma(volumeAmplo)).toBe(3);
      expect(soma(volumeDoA)).toBe(1);

      const distAmplo = await getLeadDistributions(scopeAmplo(), range);
      const distDoA = await getLeadDistributions(scopeOf(corretorAId), range);
      const total = (bs: { count: number }[]) => bs.reduce((t, b) => t + b.count, 0);
      expect(total(distAmplo.modality)).toBe(3);
      expect(total(distDoA.modality)).toBe(1);

      const recentesDoA = await getRecentLeads(scopeOf(corretorAId));
      expect(recentesDoA.map((l) => l.id)).toEqual([leadDeAId]);
    });
  });
});
