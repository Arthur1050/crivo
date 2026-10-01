import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { leads, tenant_members, tenants, users } from "../../../db/schema";
import {
  optOutLeadByHuman,
  returnConversationToAgent,
  takeOverConversation,
  type LeadScope,
} from "../index";

/**
 * Assumir, devolver e opt-out humano na DAL (lote-14, T5 — ASSUMIR-01,
 * DEVOLVER-01, OPTHUM-01). Tenants, usuários e leads próprios deste arquivo.
 */

type LeadRow = typeof leads.$inferSelect;
type LeadStatus = LeadRow["status"];

const NOW = new Date("2026-10-01T12:00:00.000Z");
const EARLIER = new Date("2026-10-01T09:00:00.000Z");

describe("server/data — condução humana (lote-14, T5)", () => {
  let tenantAId: string;
  let tenantBId: string;
  let brokerAId: string;
  let brokerBId: string;
  let managerId: string;
  let managerScope: LeadScope;
  let brokerAScope: LeadScope;
  let tenantBScope: LeadScope;
  const userIds: string[] = [];

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values(
      [tenantAId, tenantBId].map((id) => ({
        id,
        name: `Tenant conducao ${id}`,
        agentName: "Agente",
        supportedModality: "ambos" as const,
        slug: `fixture-${id}`,
      }))
    );
    brokerAId = await createMember(tenantAId, "Corretor A", "corretor");
    brokerBId = await createMember(tenantAId, "Corretor B", "corretor");
    managerId = await createMember(tenantAId, "Gestora", "gestor");
    managerScope = { tenantId: tenantAId, assignedUserId: null };
    brokerAScope = { tenantId: tenantAId, assignedUserId: brokerAId };
    tenantBScope = { tenantId: tenantBId, assignedUserId: null };
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await db.delete(leads).where(inArray(leads.tenantId, tenantIds));
    await db.delete(tenant_members).where(inArray(tenant_members.organizationId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  async function createMember(tenantId: string, name: string, role: string): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({ id, name, email: `${id}@fixture.test` });
    userIds.push(id);
    await db.insert(tenant_members).values({ organizationId: tenantId, userId: id, role });
    return id;
  }

  async function createLead(overrides: Partial<LeadRow> = {}): Promise<string> {
    const id = randomUUID();
    await db.insert(leads).values({
      id,
      tenantId: tenantAId,
      name: "Lead Conducao",
      phone: "+55 34 90000-2222",
      status: "em_qualificacao",
      firstContactAt: EARLIER,
      ...overrides,
    });
    return id;
  }

  async function readLead(id: string): Promise<LeadRow> {
    const [row] = await db.select().from(leads).where(eq(leads.id, id));
    return row;
  }

  describe("takeOverConversation (ASSUMIR-01)", () => {
    it("grava a marca com o usuário e o instante da ação (AC1)", async () => {
      const leadId = await createLead();
      const result = await takeOverConversation(managerScope, leadId, managerId, NOW);
      expect(result.outcome).toBe("assumido");
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toEqual(NOW);
      expect(after.humanTakeoverBy).toBe(managerId);
    });

    it("mantém status, statusChangedBy e assignedUserId iguais aos de antes (AC2, L-001)", async () => {
      const leadId = await createLead({
        status: "qualificado_agendado",
        statusChangedBy: "humano",
        assignedUserId: brokerAId,
      });
      const before = await readLead(leadId);
      const result = await takeOverConversation(brokerAScope, leadId, brokerAId, NOW);
      expect(result.outcome).toBe("assumido");
      const after = await readLead(leadId);
      expect(after.status).toBe(before.status);
      expect(after.statusChangedBy).toBe(before.statusChangedBy);
      expect(after.assignedUserId).toBe(before.assignedUserId);
      expect(after.status).toBe("qualificado_agendado");
      expect(after.statusChangedBy).toBe("humano");
      expect(after.assignedUserId).toBe(brokerAId);
    });

    it("corretor puro não assume lead de outra carteira, e nada é gravado (AC3)", async () => {
      const leadId = await createLead({ assignedUserId: brokerBId });
      const result = await takeOverConversation(brokerAScope, leadId, brokerAId, NOW);
      expect(result.outcome).toBe("fora-do-escopo");
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toBeNull();
      expect(after.humanTakeoverBy).toBeNull();
    });

    it("lead de outro tenant é recusado, e nada é gravado (AC3, L-035)", async () => {
      const leadId = await createLead();
      const result = await takeOverConversation(tenantBScope, leadId, managerId, NOW);
      expect(result.outcome).toBe("fora-do-escopo");
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toBeNull();
      expect(after.humanTakeoverBy).toBeNull();
    });

    it("lead com opt-out é recusado, e nada é gravado (AC5)", async () => {
      const leadId = await createLead({ optedOutAt: EARLIER });
      const result = await takeOverConversation(managerScope, leadId, managerId, NOW);
      expect(result.outcome).toBe("opt-out");
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toBeNull();
      expect(after.humanTakeoverBy).toBeNull();
    });

    it("lead já marcado preserva o usuário e o instante originais (AC6)", async () => {
      const leadId = await createLead({ humanTakeoverAt: EARLIER, humanTakeoverBy: brokerAId });
      const result = await takeOverConversation(managerScope, leadId, managerId, NOW);
      expect(result.outcome).toBe("ja-humano");
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toEqual(EARLIER);
      expect(after.humanTakeoverBy).toBe(brokerAId);
    });

    it("lead em escalado_humano devolve ja-humano sem gravar a marca (AC7)", async () => {
      const leadId = await createLead({ status: "escalado_humano" });
      const result = await takeOverConversation(managerScope, leadId, managerId, NOW);
      expect(result.outcome).toBe("ja-humano");
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toBeNull();
      expect(after.humanTakeoverBy).toBeNull();
      expect(after.status).toBe("escalado_humano");
    });
  });

  describe("returnConversationToAgent (DEVOLVER-01)", () => {
    async function createConducted(status: LeadStatus, overrides: Partial<LeadRow> = {}) {
      return createLead({
        status,
        statusChangedBy: "humano",
        humanTakeoverAt: EARLIER,
        humanTakeoverBy: brokerAId,
        ...overrides,
      });
    }

    it("limpa a marca (AC1), zera statusChangedBy (AC4) e grava o pedido de reset", async () => {
      const leadId = await createConducted("em_qualificacao");
      const result = await returnConversationToAgent(managerScope, leadId, NOW);
      expect(result.outcome).toBe("devolvido");
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toBeNull();
      expect(after.humanTakeoverBy).toBeNull();
      expect(after.statusChangedBy).toBeNull();
      expect(after.memoryResetRequestedAt).toEqual(NOW);
    });

    it("escalado_humano vira em_qualificacao (AC2)", async () => {
      const leadId = await createLead({ status: "escalado_humano", statusChangedBy: "agente" });
      const result = await returnConversationToAgent(managerScope, leadId, NOW);
      expect(result.outcome).toBe("devolvido");
      const after = await readLead(leadId);
      expect(after.status).toBe("em_qualificacao");
      expect(after.statusChangedBy).toBeNull();
      expect(after.memoryResetRequestedAt).toEqual(NOW);
    });

    it("em_qualificacao mantém o status (AC3)", async () => {
      const leadId = await createConducted("em_qualificacao");
      await returnConversationToAgent(managerScope, leadId, NOW);
      expect((await readLead(leadId)).status).toBe("em_qualificacao");
    });

    it("qualificado_agendado mantém o status (AC3)", async () => {
      const leadId = await createConducted("qualificado_agendado");
      await returnConversationToAgent(managerScope, leadId, NOW);
      const after = await readLead(leadId);
      expect(after.status).toBe("qualificado_agendado");
      expect(after.humanTakeoverAt).toBeNull();
    });

    it("lead com opt-out é recusado sem mudar marca nem status (AC8)", async () => {
      const leadId = await createConducted("escalado_humano", { optedOutAt: EARLIER });
      const result = await returnConversationToAgent(managerScope, leadId, NOW);
      expect(result.outcome).toBe("opt-out");
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toEqual(EARLIER);
      expect(after.status).toBe("escalado_humano");
      expect(after.statusChangedBy).toBe("humano");
      expect(after.memoryResetRequestedAt).toBeNull();
    });

    it("lead fora do escopo é recusado sem mudar marca nem status (AC8)", async () => {
      const leadId = await createConducted("escalado_humano", { assignedUserId: brokerBId });
      for (const scope of [brokerAScope, tenantBScope]) {
        const result = await returnConversationToAgent(scope, leadId, NOW);
        expect(result.outcome).toBe("fora-do-escopo");
      }
      const after = await readLead(leadId);
      expect(after.humanTakeoverAt).toEqual(EARLIER);
      expect(after.status).toBe("escalado_humano");
      expect(after.statusChangedBy).toBe("humano");
      expect(after.memoryResetRequestedAt).toBeNull();
    });

    it("lead conduzido pelo agente não é tocado (a trava humana do Kanban fica)", async () => {
      const leadId = await createLead({ status: "qualificado_agendado", statusChangedBy: "humano" });
      const result = await returnConversationToAgent(managerScope, leadId, NOW);
      expect(result.outcome).toBe("ja-agente");
      const after = await readLead(leadId);
      expect(after.statusChangedBy).toBe("humano");
      expect(after.memoryResetRequestedAt).toBeNull();
    });
  });

  describe("optOutLeadByHuman (OPTHUM-01)", () => {
    it("grava optedOutAt e o pedido de reset (AC1)", async () => {
      const leadId = await createLead();
      const result = await optOutLeadByHuman(managerScope, leadId, NOW);
      expect(result).toEqual({ optedOutAt: NOW, newlyOptedOut: true });
      const after = await readLead(leadId);
      expect(after.optedOutAt).toEqual(NOW);
      expect(after.memoryResetRequestedAt).toEqual(NOW);
    });

    it("uma segunda chamada preserva o instante original", async () => {
      const leadId = await createLead();
      await optOutLeadByHuman(managerScope, leadId, EARLIER);
      const second = await optOutLeadByHuman(managerScope, leadId, NOW);
      expect(second).toEqual({ optedOutAt: EARLIER, newlyOptedOut: false });
      const after = await readLead(leadId);
      expect(after.optedOutAt).toEqual(EARLIER);
      expect(after.memoryResetRequestedAt).toEqual(EARLIER);
    });

    it("corretor puro fora da carteira é recusado e optedOutAt fica nulo (AC8)", async () => {
      const leadId = await createLead({ assignedUserId: brokerBId });
      expect(await optOutLeadByHuman(brokerAScope, leadId, NOW)).toBeNull();
      const after = await readLead(leadId);
      expect(after.optedOutAt).toBeNull();
      expect(after.memoryResetRequestedAt).toBeNull();
    });

    it("lead de outro tenant é recusado e optedOutAt fica nulo (AC8, L-035)", async () => {
      const leadId = await createLead();
      expect(await optOutLeadByHuman(tenantBScope, leadId, NOW)).toBeNull();
      expect((await readLead(leadId)).optedOutAt).toBeNull();
    });

    it("corretor puro registra o opt-out de lead da própria carteira", async () => {
      const leadId = await createLead({ assignedUserId: brokerAId });
      const result = await optOutLeadByHuman(brokerAScope, leadId, NOW);
      expect(result).toEqual({ optedOutAt: NOW, newlyOptedOut: true });
    });
  });
});
