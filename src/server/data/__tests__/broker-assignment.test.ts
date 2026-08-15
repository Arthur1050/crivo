import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { brokers, leads, tenants } from "../../../db/schema";
import { createAgentLead, getBrokerLoads } from "../index";

// Tenants + corretores PRÓPRIOS deste arquivo (nunca o snapshot do seed) —
// mesmo padrão de isolamento dos demais testes de integração da DAL
// (lote-5/6). Cobre ATRIB-01 (lote-7): atribuição de corretor na criação de
// lead pelo contrato.
async function createTenant(name: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name,
    agentName: "Agente Teste",
    supportedModality: "ambos",
  });
  return id;
}

async function createBroker(
  tenantId: string,
  name: string,
  createdAt: Date
): Promise<string> {
  const id = randomUUID();
  await db.insert(brokers).values({
    id,
    tenantId,
    name,
    phone: "+55 34 90000-0000",
    email: `${id}@fixture.test`,
    createdAt,
  });
  return id;
}

async function createLead(
  tenantId: string,
  brokerId: string,
  status: "em_qualificacao" | "qualificado_agendado" | "escalado_humano"
): Promise<string> {
  const id = randomUUID();
  await db.insert(leads).values({
    id,
    tenantId,
    brokerId,
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
    await db.delete(brokers).where(inArray(brokers.tenantId, createdTenantIds));
    await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
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
  });

  describe("createAgentLead — atribuição de corretor", () => {
    it("atribui o corretor de menor carga ativa (id exato)", async () => {
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
      expect(lead.brokerId).toBe(lightOlderId);
    });

    it("tenant sem nenhum corretor cadastrado: lead criado com brokerId nulo, sem erro", async () => {
      const tenantId = await createTenant("Tenant Assign Sem Corretor");
      createdTenantIds.push(tenantId);

      const { created, lead } = await createAgentLead(tenantId, {
        name: "Lead Órfão",
        phone: "+55 34 90000-3333",
        externalId: `ext-${randomUUID()}`,
        firstContactAt: new Date(),
      });

      expect(created).toBe(true);
      expect(lead.brokerId).toBeNull();
    });

    it("reentrega com o mesmo externalId não reatribui, mesmo que a carga tenha mudado entre as duas chamadas", async () => {
      const tenantId = await createTenant("Tenant Assign Reentrega");
      createdTenantIds.push(tenantId);

      const brokerAId = await createBroker(tenantId, "Corretor A", new Date("2026-01-01"));
      const brokerBId = await createBroker(tenantId, "Corretor B", new Date("2026-01-02"));
      // brokerAId começa com a menor carga (0 contra 1 do B).
      await createLead(tenantId, brokerBId, "em_qualificacao");

      const externalId = `ext-${randomUUID()}`;
      const first = await createAgentLead(tenantId, {
        name: "Lead Reentregue",
        phone: "+55 34 90000-4444",
        externalId,
        firstContactAt: new Date(),
      });
      expect(first.created).toBe(true);
      expect(first.lead.brokerId).toBe(brokerAId);

      // Inverte a carga: agora A tem mais leads ativos que B. Se a segunda
      // chamada reatribuísse, o resultado mudaria para brokerBId.
      await createLead(tenantId, brokerAId, "em_qualificacao");
      await createLead(tenantId, brokerAId, "em_qualificacao");
      await createLead(tenantId, brokerAId, "em_qualificacao");

      const second = await createAgentLead(tenantId, {
        name: "Lead Reentregue",
        phone: "+55 34 90000-4444",
        externalId,
        firstContactAt: new Date(),
      });
      expect(second.created).toBe(false);
      expect(second.lead.id).toBe(first.lead.id);
      expect(second.lead.brokerId).toBe(brokerAId);
    });
  });
});
