import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { brokers, conversations, leads, messages, tenants } from "../../../db/schema";
import {
  getLastAgentMessageAt,
  getLead,
  setMeetingAttendance,
  updateLeadBroker,
} from "../index";

// Tenants + corretores + leads PRÓPRIOS deste arquivo (nunca o snapshot do
// seed) — mesmo padrão de isolamento dos demais testes de integração da DAL
// (lote-5/6/7). Cobre T7 (lote-7 — ATRIB-02, KPI-02, SHELL-01):
// updateLeadBroker, setMeetingAttendance, getLastAgentMessageAt.
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

async function createBroker(tenantId: string, name: string): Promise<string> {
  const id = randomUUID();
  await db.insert(brokers).values({
    id,
    tenantId,
    name,
    phone: "+55 34 90000-0000",
    email: `${id}@fixture.test`,
  });
  return id;
}

async function createLead(
  tenantId: string,
  brokerId: string | null = null
): Promise<string> {
  const id = randomUUID();
  await db.insert(leads).values({
    id,
    tenantId,
    brokerId,
    name: "Lead Fixture",
    phone: "+55 34 90000-1111",
    status: "em_qualificacao",
    firstContactAt: new Date(),
  });
  return id;
}

async function createAgentMessage(tenantId: string, leadId: string, sentAt: Date) {
  const conversationId = randomUUID();
  await db.insert(conversations).values({ id: conversationId, tenantId, leadId });
  await db.insert(messages).values({
    id: randomUUID(),
    tenantId,
    conversationId,
    sender: "agente",
    content: "Mensagem do agente",
    sentAt,
  });
}

async function createLeadMessage(tenantId: string, leadId: string, sentAt: Date) {
  const conversationId = randomUUID();
  await db.insert(conversations).values({ id: conversationId, tenantId, leadId });
  await db.insert(messages).values({
    id: randomUUID(),
    tenantId,
    conversationId,
    sender: "lead",
    content: "Mensagem do lead",
    sentAt,
  });
}

describe("server/data — updateLeadBroker / setMeetingAttendance / getLastAgentMessageAt (lote-7, T7)", () => {
  const createdTenantIds: string[] = [];

  afterEach(async () => {
    if (createdTenantIds.length === 0) return;
    await db.delete(messages).where(inArray(messages.tenantId, createdTenantIds));
    await db
      .delete(conversations)
      .where(inArray(conversations.tenantId, createdTenantIds));
    await db.delete(leads).where(inArray(leads.tenantId, createdTenantIds));
    await db.delete(brokers).where(inArray(brokers.tenantId, createdTenantIds));
    await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    createdTenantIds.length = 0;
  });

  afterAll(async () => {
    await db.$client.end();
  });

  describe("updateLeadBroker", () => {
    it("troca o corretor do lead no tenant ativo (happy path)", async () => {
      const tenantId = await createTenant("Tenant Broker Happy");
      createdTenantIds.push(tenantId);
      const brokerAId = await createBroker(tenantId, "Corretor A");
      const brokerBId = await createBroker(tenantId, "Corretor B");
      const leadId = await createLead(tenantId, brokerAId);

      const updated = await updateLeadBroker(tenantId, leadId, brokerBId);
      expect(updated).not.toBeNull();
      expect(updated!.brokerId).toBe(brokerBId);

      const reread = await getLead(tenantId, leadId);
      expect(reread!.brokerId).toBe(brokerBId);
    });

    it("corretor de outro tenant: devolve null e deixa brokerId inalterado (teste negativo)", async () => {
      const tenantAId = await createTenant("Tenant Broker Cross A");
      const tenantBId = await createTenant("Tenant Broker Cross B");
      createdTenantIds.push(tenantAId, tenantBId);
      const brokerAId = await createBroker(tenantAId, "Corretor A");
      const brokerBId = await createBroker(tenantBId, "Corretor de Outro Tenant");
      const leadId = await createLead(tenantAId, brokerAId);

      const result = await updateLeadBroker(tenantAId, leadId, brokerBId);
      expect(result).toBeNull();

      const reread = await getLead(tenantAId, leadId);
      expect(reread!.brokerId).toBe(brokerAId);
    });

    it("lead de outro tenant: devolve null", async () => {
      const tenantAId = await createTenant("Tenant Broker LeadCross A");
      const tenantBId = await createTenant("Tenant Broker LeadCross B");
      createdTenantIds.push(tenantAId, tenantBId);
      const brokerBId = await createBroker(tenantBId, "Corretor B");
      const leadBId = await createLead(tenantBId, brokerBId);

      // tenantA tentando mover um lead que pertence ao tenantB.
      const result = await updateLeadBroker(tenantAId, leadBId, brokerBId);
      expect(result).toBeNull();

      const reread = await getLead(tenantBId, leadBId);
      expect(reread!.brokerId).toBe(brokerBId);
    });
  });

  describe("setMeetingAttendance", () => {
    it("persiste true, false e null, escopado ao tenant (os três valores)", async () => {
      const tenantId = await createTenant("Tenant Attendance");
      createdTenantIds.push(tenantId);
      const leadId = await createLead(tenantId);

      const toTrue = await setMeetingAttendance(tenantId, leadId, true);
      expect(toTrue!.meetingAttended).toBe(true);
      expect((await getLead(tenantId, leadId))!.meetingAttended).toBe(true);

      const toFalse = await setMeetingAttendance(tenantId, leadId, false);
      expect(toFalse!.meetingAttended).toBe(false);
      expect((await getLead(tenantId, leadId))!.meetingAttended).toBe(false);

      const toNull = await setMeetingAttendance(tenantId, leadId, null);
      expect(toNull!.meetingAttended).toBeNull();
      expect((await getLead(tenantId, leadId))!.meetingAttended).toBeNull();
    });

    it("lead de outro tenant: devolve null sem escrever", async () => {
      const tenantAId = await createTenant("Tenant Attendance Cross A");
      const tenantBId = await createTenant("Tenant Attendance Cross B");
      createdTenantIds.push(tenantAId, tenantBId);
      const leadBId = await createLead(tenantBId);

      const result = await setMeetingAttendance(tenantAId, leadBId, true);
      expect(result).toBeNull();

      const reread = await getLead(tenantBId, leadBId);
      expect(reread!.meetingAttended).toBeNull();
    });
  });

  describe("getLastAgentMessageAt", () => {
    it("devolve o sentAt máximo entre mensagens do agente do tenant, ignorando mensagens do lead", async () => {
      const tenantId = await createTenant("Tenant Last Agent Message");
      createdTenantIds.push(tenantId);
      const leadId = await createLead(tenantId);

      await createAgentMessage(tenantId, leadId, new Date("2026-08-10T10:00:00.000Z"));
      await createLeadMessage(tenantId, leadId, new Date("2026-08-12T10:00:00.000Z"));
      const latestAgent = new Date("2026-08-11T15:30:00.000Z");
      await createAgentMessage(tenantId, leadId, latestAgent);

      const result = await getLastAgentMessageAt(tenantId);
      expect(result).toEqual(latestAgent);
    });

    it("ignora mensagens de outro tenant", async () => {
      const tenantAId = await createTenant("Tenant Last Agent A");
      const tenantBId = await createTenant("Tenant Last Agent B");
      createdTenantIds.push(tenantAId, tenantBId);
      const leadAId = await createLead(tenantAId);
      const leadBId = await createLead(tenantBId);

      const agentAMessage = new Date("2026-08-10T09:00:00.000Z");
      await createAgentMessage(tenantAId, leadAId, agentAMessage);
      await createAgentMessage(
        tenantBId,
        leadBId,
        new Date("2026-08-15T23:00:00.000Z")
      );

      const result = await getLastAgentMessageAt(tenantAId);
      expect(result).toEqual(agentAMessage);
    });

    it("devolve null em tenant sem nenhuma mensagem do agente", async () => {
      const tenantId = await createTenant("Tenant Sem Mensagem De Agente");
      createdTenantIds.push(tenantId);
      const leadId = await createLead(tenantId);
      await createLeadMessage(tenantId, leadId, new Date("2026-08-10T09:00:00.000Z"));

      const result = await getLastAgentMessageAt(tenantId);
      expect(result).toBeNull();
    });
  });
});
