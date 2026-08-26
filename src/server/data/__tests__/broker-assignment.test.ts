import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { leads, tenant_members, tenants, users } from "../../../db/schema";
import { createAgentLead, getBrokerLoads, getBrokers } from "../index";

// Tenants + corretores PRÓPRIOS deste arquivo (nunca o snapshot do seed) —
// mesmo padrão de isolamento dos demais testes de integração da DAL
// (lote-5/6). Cobre ATRIB-01 (lote-7): atribuição de corretor na criação de
// lead pelo contrato.
//
// lote-8 (AD-021): o corretor deixou de ser linha de `brokers` e passou a ser
// usuário + vínculo em `tenant_members`. Todas as asserções abaixo são as
// mesmas do lote-7 — muda só a origem do dado.
async function createTenant(name: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name,
    agentName: "Agente Teste",
    supportedModality: "ambos",
    slug: `fixture-${id}`,
  });
  return id;
}

const createdUserIds: string[] = [];

async function createMember(
  tenantId: string,
  name: string,
  createdAt: Date,
  role: string
): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    name,
    email: `${id}@fixture.test`,
  });
  createdUserIds.push(id);
  // `createdAt` é o do VÍNCULO — é ele que sustenta o desempate
  // determinístico da política de atribuição.
  await db.insert(tenant_members).values({
    organizationId: tenantId,
    userId: id,
    role,
    createdAt,
  });
  return id;
}

async function createBroker(
  tenantId: string,
  name: string,
  createdAt: Date
): Promise<string> {
  return createMember(tenantId, name, createdAt, "corretor");
}

async function createLead(
  tenantId: string,
  assignedUserId: string,
  status: "em_qualificacao" | "qualificado_agendado" | "escalado_humano"
): Promise<string> {
  const id = randomUUID();
  await db.insert(leads).values({
    id,
    tenantId,
    assignedUserId,
    name: "Lead Fixture",
    phone: "+55 34 90000-1111",
    status,
    firstContactAt: new Date(),
  });
  return id;
}

describe("server/data — getBrokerLoads / atribuição de corretor em createAgentLead (lote-7, ATRIB-01)", () => {
  const createdTenantIds: string[] = [];

  afterEach(async () => {
    if (createdTenantIds.length === 0) return;
    await db.delete(leads).where(inArray(leads.tenantId, createdTenantIds));
    await db
      .delete(tenant_members)
      .where(inArray(tenant_members.organizationId, createdTenantIds));
    await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
    createdTenantIds.length = 0;
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("getBrokerLoads", () => {
    it("conta só em_qualificacao e escalado_humano como carga ativa; qualificado_agendado não conta", async () => {
      const tenantId = await createTenant("Tenant Loads A");
      createdTenantIds.push(tenantId);
      const brokerId = await createBroker(tenantId, "Corretor A", new Date());

      await createLead(tenantId, brokerId, "em_qualificacao");
      await createLead(tenantId, brokerId, "escalado_humano");
      await createLead(tenantId, brokerId, "qualificado_agendado");

      const loads = await getBrokerLoads(tenantId);
      const row = loads.find((l) => l.id === brokerId);
      expect(row).toBeDefined();
      expect(row!.activeLeads).toBe(2);
    });

    it("devolve corretor com activeLeads: 0 quando não tem nenhum lead ativo (LEFT JOIN, nunca INNER)", async () => {
      const tenantId = await createTenant("Tenant Loads Zero");
      createdTenantIds.push(tenantId);
      const brokerId = await createBroker(tenantId, "Corretor Sem Lead", new Date());

      const loads = await getBrokerLoads(tenantId);
      expect(loads).toHaveLength(1);
      expect(loads[0].id).toBe(brokerId);
      expect(loads[0].activeLeads).toBe(0);
    });

    it("filtra por tenantId — corretor de outro tenant não aparece (teste negativo)", async () => {
      const tenantAId = await createTenant("Tenant Loads Isolamento A");
      const tenantBId = await createTenant("Tenant Loads Isolamento B");
      createdTenantIds.push(tenantAId, tenantBId);

      const brokerAId = await createBroker(tenantAId, "Corretor A", new Date());
      await createBroker(tenantBId, "Corretor B", new Date());

      const loadsA = await getBrokerLoads(tenantAId);
      expect(loadsA.map((l) => l.id)).toEqual([brokerAId]);
    });

    // lote-8 — ATRIB-02 AC2: os candidatos são os CORRETORES da imobiliária,
    // não todo mundo que tem vínculo com ela. `tenant_members` guarda também
    // administrador e gestor.
    it("vínculo sem papel corretor (gestor puro) não entra na lista de candidatos", async () => {
      const tenantId = await createTenant("Tenant Loads Papel");
      createdTenantIds.push(tenantId);

      const brokerId = await createBroker(tenantId, "Corretor", new Date());
      await createMember(tenantId, "Gestor", new Date(), "gestor");
      await createMember(tenantId, "Administrador", new Date(), "administrador");

      const loads = await getBrokerLoads(tenantId);
      expect(loads.map((l) => l.id)).toEqual([brokerId]);
    });

    // PERM-01 AC4 (união de permissões): quem acumula corretor com outro
    // papel continua sendo corretor — acumular cargo não tira a carteira.
    it("vínculo com papel acumulado (corretor,administrador) entra na lista de candidatos", async () => {
      const tenantId = await createTenant("Tenant Loads Papel Acumulado");
      createdTenantIds.push(tenantId);

      const acumuladoId = await createMember(
        tenantId,
        "Corretor e Administrador",
        new Date(),
        "corretor,administrador"
      );

      const loads = await getBrokerLoads(tenantId);
      expect(loads.map((l) => l.id)).toEqual([acumuladoId]);
    });
  });

  describe("getBrokers", () => {
    it("lista apenas os vínculos com papel corretor, com nome e e-mail do usuário (lote-8 — SEED-01)", async () => {
      const tenantId = await createTenant("Tenant Brokers Papel");
      createdTenantIds.push(tenantId);

      const brokerId = await createBroker(tenantId, "Corretor Listado", new Date());
      const acumuladoId = await createMember(
        tenantId,
        "Gestor Que Também Atende",
        new Date(),
        "gestor,corretor"
      );
      const gestorId = await createMember(tenantId, "Gestor Puro", new Date(), "gestor");

      const rows = await getBrokers(tenantId);
      const ids = rows.map((b) => b.id).sort();
      expect(ids).toEqual([brokerId, acumuladoId].sort());
      expect(ids).not.toContain(gestorId);

      const listado = rows.find((b) => b.id === brokerId);
      expect(listado!.name).toBe("Corretor Listado");
      expect(listado!.email).toBe(`${brokerId}@fixture.test`);
      expect(listado!.tenantId).toBe(tenantId);
    });
  });

  // lote-8 — ATRIB-02 AC1 (AD-022): a atribuição SAIU da criação. O lead nasce
  // sem responsável e só ganha um no agendamento ou no escalonamento. As
  // asserções abaixo são as mesmas do lote-7 com o desfecho que a spec nova
  // define — mesma fixture, mesma pergunta, resposta atualizada. A escolha por
  // menor carga não morreu: mudou de momento, e é testada em
  // `assignment.test.ts` (T27).
  describe("createAgentLead — lead nasce sem responsável", () => {
    it("não atribui ninguém, mesmo havendo um corretor de menor carga elegível", async () => {
      const tenantId = await createTenant("Tenant Assign Menor Carga");
      createdTenantIds.push(tenantId);

      const heavyId = await createBroker(tenantId, "Pesado", new Date("2026-01-01"));
      const lightOlderId = await createBroker(
        tenantId,
        "Leve Mais Antigo",
        new Date("2026-01-02")
      );
      const lightNewerId = await createBroker(
        tenantId,
        "Leve Mais Novo",
        new Date("2026-01-03")
      );
      await createLead(tenantId, heavyId, "em_qualificacao");
      await createLead(tenantId, heavyId, "em_qualificacao");
      await createLead(tenantId, heavyId, "em_qualificacao");
      await createLead(tenantId, lightOlderId, "em_qualificacao");
      await createLead(tenantId, lightNewerId, "em_qualificacao");

      const { created, lead } = await createAgentLead(tenantId, {
        name: "Lead Novo",
        phone: "+55 34 90000-2222",
        externalId: `ext-${randomUUID()}`,
        firstContactAt: new Date(),
      });

      expect(created).toBe(true);
      // Antes do lote-8 este era `toBe(lightOlderId)`. O corretor de menor
      // carga continua existindo e continua sendo o que a política escolheria
      // — a criação é que não escolhe mais ninguém.
      expect(lead.assignedUserId).toBeNull();
      expect(lead.status).toBe("em_qualificacao");
    });

    it("tenant sem nenhum corretor cadastrado: lead criado com assignedUserId nulo, sem erro", async () => {
      const tenantId = await createTenant("Tenant Assign Sem Corretor");
      createdTenantIds.push(tenantId);

      const { created, lead } = await createAgentLead(tenantId, {
        name: "Lead Órfão",
        phone: "+55 34 90000-3333",
        externalId: `ext-${randomUUID()}`,
        firstContactAt: new Date(),
      });

      expect(created).toBe(true);
      expect(lead.assignedUserId).toBeNull();
    });

    it("reentrega com o mesmo externalId não apaga nem troca o responsável já atribuído", async () => {
      const tenantId = await createTenant("Tenant Assign Reentrega");
      createdTenantIds.push(tenantId);

      const brokerAId = await createBroker(tenantId, "Corretor A", new Date("2026-01-01"));
      const brokerBId = await createBroker(tenantId, "Corretor B", new Date("2026-01-02"));
      // brokerBId fica com a menor carga: se a reentrega reatribuísse pela
      // política, o lead mudaria de dono para ele.
      await createLead(tenantId, brokerAId, "em_qualificacao");

      const externalId = `ext-${randomUUID()}`;
      const first = await createAgentLead(tenantId, {
        name: "Lead Reentregue",
        phone: "+55 34 90000-4444",
        externalId,
        firstContactAt: new Date(),
      });
      expect(first.created).toBe(true);
      expect(first.lead.assignedUserId).toBeNull();

      // O responsável chega depois da criação — é o que o agendamento e o
      // escalonamento fazem (AD-022). A reentrega não pode desfazer isso.
      await db
        .update(leads)
        .set({ assignedUserId: brokerAId })
        .where(eq(leads.id, first.lead.id));

      const second = await createAgentLead(tenantId, {
        name: "Lead Reentregue",
        phone: "+55 34 90000-4444",
        externalId,
        firstContactAt: new Date(),
      });
      expect(second.created).toBe(false);
      expect(second.lead.id).toBe(first.lead.id);
      expect(second.lead.assignedUserId).toBe(brokerAId);
      expect(second.lead.assignedUserId).not.toBe(brokerBId);
    });
  });
});
