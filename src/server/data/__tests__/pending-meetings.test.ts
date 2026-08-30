import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { leads, tenant_members, tenants, users } from "../../../db/schema";
import { getPendingAttendanceMeetings, serviceScope } from "../index";

// Mesmo molde de isolamento de `lead-controls.test.ts` (lote-7, T7):
// tenants + corretores + leads PRÓPRIOS deste arquivo, nunca o snapshot do
// seed. Cobre T19 (lote-9 — PRES-01, PRES-02).

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
  role: string
): Promise<string> {
  const id = randomUUID();
  await db.insert(users).values({ id, name, email: `${id}@fixture.test` });
  createdUserIds.push(id);
  await db.insert(tenant_members).values({ organizationId: tenantId, userId: id, role });
  return id;
}

async function createBroker(tenantId: string, name: string): Promise<string> {
  return createMember(tenantId, name, "corretor");
}

async function createLead(
  tenantId: string,
  options: {
    assignedUserId?: string | null;
    meetingAt?: Date | null;
    meetingAttended?: boolean | null;
    name?: string;
  } = {}
): Promise<string> {
  const id = randomUUID();
  await db.insert(leads).values({
    id,
    tenantId,
    assignedUserId: options.assignedUserId ?? null,
    name: options.name ?? "Lead Fixture",
    phone: "+55 34 90000-2222",
    status: "qualificado_agendado",
    firstContactAt: new Date(),
    meetingAt: options.meetingAt ?? null,
    meetingAttended: options.meetingAttended ?? null,
  });
  return id;
}

// `now` fixo (nunca `new Date()` real) para as asserções de fronteira serem
// determinísticas — mesma disciplina do teste de `pilot-metrics.ts` (T4).
const NOW = new Date("2026-08-30T12:00:00.000Z");
const THIRTY_MIN_MS = 30 * 60 * 1000;
const DAY_MS = 86400000;

/**
 * `meetingAt` cujo encerramento (+30min do design.md) caiu exatamente
 * `days` dias antes de `NOW`.
 */
function meetingEndedDaysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS - THIRTY_MIN_MS);
}

describe("server/data — getPendingAttendanceMeetings (lote-9, T19)", () => {
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

  it("reunião que ainda não terminou (dentro dos 30min do slot) não aparece", async () => {
    const tenantId = await createTenant("Tenant Pending Not Ended");
    createdTenantIds.push(tenantId);
    const brokerId = await createBroker(tenantId, "Corretor");
    await createLead(tenantId, {
      assignedUserId: brokerId,
      meetingAt: new Date(NOW.getTime() - 10 * 60 * 1000),
    });

    const result = await getPendingAttendanceMeetings(serviceScope(tenantId), NOW);
    expect(result).toHaveLength(0);
  });

  it("reunião encerrada há 13 dias aparece; há 15 dias não aparece (prescrição de 14 dias)", async () => {
    const tenantId = await createTenant("Tenant Pending Window");
    createdTenantIds.push(tenantId);
    const brokerId = await createBroker(tenantId, "Corretor");
    const lead13d = await createLead(tenantId, {
      assignedUserId: brokerId,
      meetingAt: meetingEndedDaysAgo(13),
      name: "Lead 13 Dias",
    });
    await createLead(tenantId, {
      assignedUserId: brokerId,
      meetingAt: meetingEndedDaysAgo(15),
      name: "Lead 15 Dias",
    });

    const result = await getPendingAttendanceMeetings(serviceScope(tenantId), NOW);
    expect(result.map((m) => m.leadId)).toEqual([lead13d]);
  });

  it("reunião com comparecimento já registrado (true ou false) não aparece", async () => {
    const tenantId = await createTenant("Tenant Pending Attended");
    createdTenantIds.push(tenantId);
    const brokerId = await createBroker(tenantId, "Corretor");
    await createLead(tenantId, {
      assignedUserId: brokerId,
      meetingAt: meetingEndedDaysAgo(5),
      meetingAttended: true,
    });
    // `(tenant_id, assigned_user_id, meeting_at)` é único quando os dois
    // últimos não são nulos — meetingAt precisa diferir do lead acima.
    await createLead(tenantId, {
      assignedUserId: brokerId,
      meetingAt: meetingEndedDaysAgo(6),
      meetingAttended: false,
    });

    const result = await getPendingAttendanceMeetings(serviceScope(tenantId), NOW);
    expect(result).toHaveLength(0);
  });

  it("corretor vê só a própria carteira; administrador/gestor veem todas do tenant, inclusive lead sem responsável", async () => {
    const tenantId = await createTenant("Tenant Pending Scope");
    createdTenantIds.push(tenantId);
    const ownBrokerId = await createBroker(tenantId, "Corretor Dono");
    const otherBrokerId = await createBroker(tenantId, "Outro Corretor");

    // meetingAt em ordem crescente de "há quantos dias encerrou": o sem
    // responsável encerrou primeiro (3d), depois o de outro corretor (2d),
    // depois o do próprio corretor (1d) — prova a ordenação por urgência
    // (mais antiga primeiro) de quebra.
    const unassignedLeadId = await createLead(tenantId, {
      assignedUserId: null,
      meetingAt: meetingEndedDaysAgo(3),
      name: "Lead Sem Responsavel",
    });
    const otherLeadId = await createLead(tenantId, {
      assignedUserId: otherBrokerId,
      meetingAt: meetingEndedDaysAgo(2),
      name: "Lead Outro Corretor",
    });
    const ownLeadId = await createLead(tenantId, {
      assignedUserId: ownBrokerId,
      meetingAt: meetingEndedDaysAgo(1),
      name: "Lead Proprio",
    });

    const ownerResult = await getPendingAttendanceMeetings(
      { tenantId, assignedUserId: ownBrokerId },
      NOW
    );
    expect(ownerResult.map((m) => m.leadId)).toEqual([ownLeadId]);

    const adminResult = await getPendingAttendanceMeetings(serviceScope(tenantId), NOW);
    expect(adminResult.map((m) => m.leadId)).toEqual([
      unassignedLeadId,
      otherLeadId,
      ownLeadId,
    ]);

    const own = adminResult.find((m) => m.leadId === ownLeadId);
    const unassigned = adminResult.find((m) => m.leadId === unassignedLeadId);
    expect(own?.brokerName).toBe("Corretor Dono");
    expect(own?.assignedUserId).toBe(ownBrokerId);
    expect(unassigned?.brokerName).toBeNull();
    expect(unassigned?.assignedUserId).toBeNull();
  });
});
