import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { leads, tenants } from "../../../db/schema";
import { getDashboardKpis, type DashboardRange } from "../index";

// Datas absolutas fixas e controladas (2020) — nunca dependem do seed nem de
// `new Date()` (design.md — "Duas fontes de agora"; EXECUTE-PROMPT
// constraint #3). Tenant e leads próprios, apagados no afterAll.
const RANGE: DashboardRange = {
  from: new Date("2020-01-01T00:00:00.000Z"),
  to: new Date("2020-01-31T23:59:59.999Z"),
};

describe("server/data getDashboardKpis", () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();

    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: "Dashboard Test Tenant A",
        agentName: "Agente A",
        supportedModality: "ambos",
      },
      {
        id: tenantBId,
        name: "Dashboard Test Tenant B",
        agentName: "Agente B",
        supportedModality: "ambos",
      },
    ]);

    // Tenant A — conjunto principal usado por vários casos (via ranges
    // diferentes sobre o mesmo fixture):
    // A: dentro do range, respondido em 10min, em_qualificacao
    // B: dentro do range, respondido em 30min, qualificado_agendado, reunião confirmada (compareceu)
    // C: dentro do range, nunca respondido, escalado_humano
    // D: dentro do range, respondido em 20min, qualificado_agendado, reunião confirmada (não compareceu)
    // E: exatamente no limite `from` (boundary inclusivo), nunca respondido
    // F: exatamente no limite `to` (boundary inclusivo), nunca respondido
    // G: um milissegundo antes do range — deve ficar de fora
    // H: um milissegundo depois do range — deve ficar de fora
    await db.insert(leads).values([
      {
        id: randomUUID(),
        tenantId: tenantAId,
        name: "Lead A",
        phone: "+55 34 90000-0001",
        status: "em_qualificacao",
        firstContactAt: new Date("2020-01-05T10:00:00.000Z"),
        firstResponseAt: new Date("2020-01-05T10:10:00.000Z"),
        meetingAttended: null,
      },
      {
        id: randomUUID(),
        tenantId: tenantAId,
        name: "Lead B",
        phone: "+55 34 90000-0002",
        status: "qualificado_agendado",
        firstContactAt: new Date("2020-01-10T08:00:00.000Z"),
        firstResponseAt: new Date("2020-01-10T08:30:00.000Z"),
        meetingAttended: true,
      },
      {
        id: randomUUID(),
        tenantId: tenantAId,
        name: "Lead C",
        phone: "+55 34 90000-0003",
        status: "escalado_humano",
        firstContactAt: new Date("2020-01-15T09:00:00.000Z"),
        firstResponseAt: null,
        meetingAttended: null,
      },
      {
        id: randomUUID(),
        tenantId: tenantAId,
        name: "Lead D",
        phone: "+55 34 90000-0004",
        status: "qualificado_agendado",
        firstContactAt: new Date("2020-01-20T09:00:00.000Z"),
        firstResponseAt: new Date("2020-01-20T09:20:00.000Z"),
        meetingAttended: false,
      },
      {
        id: randomUUID(),
        tenantId: tenantAId,
        name: "Lead E",
        phone: "+55 34 90000-0005",
        status: "em_qualificacao",
        firstContactAt: new Date("2020-01-01T00:00:00.000Z"),
        firstResponseAt: null,
        meetingAttended: null,
      },
      {
        id: randomUUID(),
        tenantId: tenantAId,
        name: "Lead F",
        phone: "+55 34 90000-0006",
        status: "em_qualificacao",
        firstContactAt: new Date("2020-01-31T23:59:59.999Z"),
        firstResponseAt: null,
        meetingAttended: null,
      },
      {
        id: randomUUID(),
        tenantId: tenantAId,
        name: "Lead G",
        phone: "+55 34 90000-0007",
        status: "em_qualificacao",
        firstContactAt: new Date("2019-12-31T23:59:59.999Z"),
        firstResponseAt: null,
        meetingAttended: null,
      },
      {
        id: randomUUID(),
        tenantId: tenantAId,
        name: "Lead H",
        phone: "+55 34 90000-0008",
        status: "em_qualificacao",
        firstContactAt: new Date("2020-02-01T00:00:00.000Z"),
        firstResponseAt: null,
        meetingAttended: null,
      },
      // Tenant B — 1 lead dentro do mesmo range, usado só para provar
      // isolamento (DASH-06.1): números distintos dos do tenant A.
      {
        id: randomUUID(),
        tenantId: tenantBId,
        name: "Lead Tenant B",
        phone: "+55 34 90000-0009",
        status: "em_qualificacao",
        firstContactAt: new Date("2020-01-05T12:00:00.000Z"),
        firstResponseAt: null,
        meetingAttended: null,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(leads).where(inArray(leads.tenantId, [tenantAId, tenantBId]));
    await db.delete(tenants).where(inArray(tenants.id, [tenantAId, tenantBId]));
    await db.$client.end();
  });

  it("AC2/AC3: |P|=6 e média de 1ª resposta = 20min sobre os 3 leads respondidos", async () => {
    const kpis = await getDashboardKpis(tenantAId, RANGE);
    expect(kpis.leadCount).toBe(6);
    expect(kpis.respondedCount).toBe(3);
    expect(kpis.avgFirstResponseMinutes).toBe(20);
  });

  it("AC4: taxa de qualificação = 2/6 (leads B e D, qualificado_agendado)", async () => {
    const kpis = await getDashboardKpis(tenantAId, RANGE);
    expect(kpis.qualificationRate).toBeCloseTo(2 / 6, 10);
  });

  it("AC5: taxa de escalonamento = 1/6 (lead C, escalado_humano)", async () => {
    const kpis = await getDashboardKpis(tenantAId, RANGE);
    expect(kpis.escalationRate).toBeCloseTo(1 / 6, 10);
  });

  it("AC6: taxa de comparecimento = 1/2 sobre 2 reuniões confirmadas (B compareceu, D não)", async () => {
    const kpis = await getDashboardKpis(tenantAId, RANGE);
    expect(kpis.confirmedMeetingCount).toBe(2);
    expect(kpis.attendanceRate).toBe(0.5);
  });

  it("limites inclusivos: leads exatamente em `from` e `to` entram em P; 1ms fora do range fica de fora", async () => {
    const kpis = await getDashboardKpis(tenantAId, RANGE);
    // leadCount=6 já prova que E (from) e F (to) entraram e G/H (fora por 1ms) não.
    expect(kpis.leadCount).toBe(6);
  });

  it("AC7 / edge case: todos os leads de P sem firstResponseAt → avgFirstResponseMinutes null, base 0", async () => {
    const singleDayRange: DashboardRange = {
      from: new Date("2020-01-01T00:00:00.000Z"),
      to: new Date("2020-01-01T23:59:59.999Z"),
    };
    const kpis = await getDashboardKpis(tenantAId, singleDayRange);
    expect(kpis.leadCount).toBe(1); // só o lead E
    expect(kpis.respondedCount).toBe(0);
    expect(kpis.avgFirstResponseMinutes).toBeNull();
  });

  it("AC7 / edge case: nenhuma reunião confirmada em P → attendanceRate null, base 0", async () => {
    const noMeetingsRange: DashboardRange = {
      from: new Date("2020-01-01T00:00:00.000Z"),
      to: new Date("2020-01-09T23:59:59.999Z"),
    };
    const kpis = await getDashboardKpis(tenantAId, noMeetingsRange);
    expect(kpis.leadCount).toBe(2); // leads A e E
    expect(kpis.confirmedMeetingCount).toBe(0);
    expect(kpis.attendanceRate).toBeNull();
  });

  it("AC7 / edge case: |P|=0 → tudo null/0, nunca NaN/Infinity/erro", async () => {
    const emptyRange: DashboardRange = {
      from: new Date("2021-01-01T00:00:00.000Z"),
      to: new Date("2021-01-31T23:59:59.999Z"),
    };
    const kpis = await getDashboardKpis(tenantAId, emptyRange);
    expect(kpis).toEqual({
      avgFirstResponseMinutes: null,
      respondedCount: 0,
      leadCount: 0,
      qualificationRate: null,
      escalationRate: null,
      attendanceRate: null,
      confirmedMeetingCount: 0,
    });
  });

  it("DASH-06.1: isolamento — números do tenant B não vazam no tenant A e vice-versa", async () => {
    const kpisA = await getDashboardKpis(tenantAId, RANGE);
    const kpisB = await getDashboardKpis(tenantBId, RANGE);

    expect(kpisA.leadCount).toBe(6);
    expect(kpisB.leadCount).toBe(1);
    expect(kpisB.respondedCount).toBe(0);
    expect(kpisB.avgFirstResponseMinutes).toBeNull();
    expect(kpisB.qualificationRate).toBe(0);
    expect(kpisB.escalationRate).toBe(0);
    expect(kpisB.confirmedMeetingCount).toBe(0);
    expect(kpisB.attendanceRate).toBeNull();
  });
});
