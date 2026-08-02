import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { leads, tenants } from "../../../db/schema";
import {
  getDashboardKpis,
  getLeadDistributions,
  getLeadVolumeSeries,
  type DashboardRange,
} from "../index";

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
    // `db.$client.end()` fecha o pool compartilhado do módulo — não repetir
    // aqui: o describe seguinte no mesmo arquivo ainda precisa dele. Só o
    // último describe do arquivo encerra a conexão.
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

describe("server/data getLeadVolumeSeries / getLeadDistributions", () => {
  let tenantId: string;
  let otherTenantId: string;

  // L1/L2: mesmo dia (Jan1, 2 leads); L3: Jan5; L4: último instante de Jan31;
  // L5: Feb10 (fora do range diário de Jan, dentro do range semanal maior).
  const L1 = new Date("2022-01-01T00:00:00.000Z");
  const L2 = new Date("2022-01-01T12:00:00.000Z");
  const L3 = new Date("2022-01-05T00:00:00.000Z");
  const L4 = new Date("2022-01-31T23:59:59.999Z");
  const L5 = new Date("2022-02-10T00:00:00.000Z");

  const JANUARY: DashboardRange = {
    from: new Date("2022-01-01T00:00:00.000Z"),
    to: new Date("2022-01-31T23:59:59.999Z"),
  };

  beforeAll(async () => {
    tenantId = randomUUID();
    otherTenantId = randomUUID();

    await db.insert(tenants).values([
      {
        id: tenantId,
        name: "Dashboard Series Test Tenant",
        agentName: "Agente Série",
        supportedModality: "ambos",
      },
      {
        id: otherTenantId,
        name: "Dashboard Series Other Tenant",
        agentName: "Agente Outro",
        supportedModality: "ambos",
      },
    ]);

    await db.insert(leads).values([
      {
        id: randomUUID(),
        tenantId,
        name: "Lead L1",
        phone: "+55 34 90001-0001",
        status: "em_qualificacao",
        firstContactAt: L1,
        modality: "novo",
        motivation: "investidor",
      },
      {
        id: randomUUID(),
        tenantId,
        name: "Lead L2",
        phone: "+55 34 90001-0002",
        status: "em_qualificacao",
        firstContactAt: L2,
        modality: "usado",
        motivation: "morador",
      },
      {
        id: randomUUID(),
        tenantId,
        name: "Lead L3",
        phone: "+55 34 90001-0003",
        status: "em_qualificacao",
        firstContactAt: L3,
        modality: "novo",
        motivation: null,
      },
      {
        id: randomUUID(),
        tenantId,
        name: "Lead L4",
        phone: "+55 34 90001-0004",
        status: "em_qualificacao",
        firstContactAt: L4,
        modality: null,
        motivation: "investidor",
      },
      {
        id: randomUUID(),
        tenantId,
        name: "Lead L5",
        phone: "+55 34 90001-0005",
        status: "em_qualificacao",
        firstContactAt: L5,
        modality: "ambos",
        motivation: null,
      },
      // Outro tenant, mesmas datas — só para provar isolamento.
      {
        id: randomUUID(),
        tenantId: otherTenantId,
        name: "Lead Outro Tenant",
        phone: "+55 34 90001-0009",
        status: "em_qualificacao",
        firstContactAt: L1,
        modality: "usado",
        motivation: "morador",
      },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(leads)
      .where(inArray(leads.tenantId, [tenantId, otherTenantId]));
    await db
      .delete(tenants)
      .where(inArray(tenants.id, [tenantId, otherTenantId]));
    await db.$client.end();
  });

  describe("getLeadVolumeSeries", () => {
    it("granularidade diária (≤31d): 1 bucket por dia do range, incluindo zerados, cobrindo exatamente o mês", async () => {
      const buckets = await getLeadVolumeSeries(tenantId, JANUARY, "day");
      expect(buckets).toHaveLength(31);
      expect(buckets[0].bucketStart.toISOString()).toBe(
        "2022-01-01T00:00:00.000Z"
      );
      expect(buckets[30].bucketStart.toISOString()).toBe(
        "2022-01-31T00:00:00.000Z"
      );

      const total = buckets.reduce((sum, b) => sum + b.count, 0);
      expect(total).toBe(4); // L1, L2, L3, L4 (L5 é fevereiro, fora do range)

      const byIso = new Map(
        buckets.map((b) => [b.bucketStart.toISOString(), b.count])
      );
      expect(byIso.get("2022-01-01T00:00:00.000Z")).toBe(2); // L1 + L2
      expect(byIso.get("2022-01-05T00:00:00.000Z")).toBe(1); // L3
      expect(byIso.get("2022-01-31T00:00:00.000Z")).toBe(1); // L4
      // Todo dia sem lead entra com count 0 (eixo contínuo) — soma dos dias
      // vazios = total de buckets menos os 3 dias com lead.
      const zeroBuckets = buckets.filter((b) => b.count === 0);
      expect(zeroBuckets).toHaveLength(31 - 3);
    });

    it("range de 1 dia = 1 bucket diário", async () => {
      const oneDayRange: DashboardRange = {
        from: new Date("2022-01-05T00:00:00.000Z"),
        to: new Date("2022-01-05T23:59:59.999Z"),
      };
      const buckets = await getLeadVolumeSeries(tenantId, oneDayRange, "day");
      expect(buckets).toHaveLength(1);
      expect(buckets[0].count).toBe(1); // L3
    });

    it("granularidade semanal ISO (segunda–domingo), incluindo semanas zeradas, sobre um range >31d", async () => {
      const wideRange: DashboardRange = {
        from: new Date("2022-01-01T00:00:00.000Z"),
        to: new Date("2022-02-28T23:59:59.999Z"), // 59 dias — inclui L1..L5
      };
      const buckets = await getLeadVolumeSeries(tenantId, wideRange, "week");
      expect(buckets).toHaveLength(10);

      const total = buckets.reduce((sum, b) => sum + b.count, 0);
      expect(total).toBe(5); // L1..L5

      const byIso = new Map(
        buckets.map((b) => [b.bucketStart.toISOString(), b.count])
      );
      // Semana ISO de 2021-12-27 (segunda) contém 2022-01-01 e 01-02 — L1 e L2 caem nela.
      expect(byIso.get("2021-12-27T00:00:00.000Z")).toBe(2);
      // Semana de 2022-01-03 (segunda) contém 01-05 — L3.
      expect(byIso.get("2022-01-03T00:00:00.000Z")).toBe(1);
      // 2022-01-31 é ela mesma uma segunda-feira — semana própria — L4.
      expect(byIso.get("2022-01-31T00:00:00.000Z")).toBe(1);
      // Semana de 2022-02-07 (segunda) contém 02-10 — L5.
      expect(byIso.get("2022-02-07T00:00:00.000Z")).toBe(1);

      const spotCheckedSum = 2 + 1 + 1 + 1;
      expect(spotCheckedSum).toBe(total); // as demais semanas do range são 0
    });

    it("buckets futuros zerados: range que se estende além de hoje sem leads cadastrados vem todo zerado", async () => {
      const now = new Date();
      const future: DashboardRange = {
        from: new Date(now.getTime() + 10 * 86400000),
        to: new Date(now.getTime() + 15 * 86400000),
      };
      const buckets = await getLeadVolumeSeries(tenantId, future, "day");
      expect(buckets.length).toBeGreaterThan(0);
      for (const bucket of buckets) expect(bucket.count).toBe(0);
    });

    it("isolamento: leads de outro tenant não entram na série (DASH-06)", async () => {
      const buckets = await getLeadVolumeSeries(tenantId, JANUARY, "day");
      const total = buckets.reduce((sum, b) => sum + b.count, 0);
      // otherTenantId também tem um lead em 2022-01-01 — se vazasse, o bucket
      // do dia 1 seria 3 em vez de 2 (já afirmado no teste diário acima).
      expect(total).toBe(4);
    });
  });

  describe("getLeadDistributions", () => {
    it("distribuições por modality e motivation somam |P|, com nao_informado para campo nulo (DASH-04)", async () => {
      const distributions = await getLeadDistributions(tenantId, JANUARY);

      const modalityByBucket = new Map(
        distributions.modality.map((b) => [b.bucket, b.count])
      );
      expect(modalityByBucket.get("novo")).toBe(2); // L1, L3
      expect(modalityByBucket.get("usado")).toBe(1); // L2
      expect(modalityByBucket.get("ambos")).toBe(0); // L5 é fevereiro, fora do range
      expect(modalityByBucket.get("nao_informado")).toBe(1); // L4
      const modalitySum = distributions.modality.reduce(
        (sum, b) => sum + b.count,
        0
      );
      expect(modalitySum).toBe(4);

      const motivationByBucket = new Map(
        distributions.motivation.map((b) => [b.bucket, b.count])
      );
      expect(motivationByBucket.get("investidor")).toBe(2); // L1, L4
      expect(motivationByBucket.get("morador")).toBe(1); // L2
      expect(motivationByBucket.get("nao_informado")).toBe(1); // L3
      const motivationSum = distributions.motivation.reduce(
        (sum, b) => sum + b.count,
        0
      );
      expect(motivationSum).toBe(4);
    });

    it("P vazio: todos os buckets fixos presentes com count 0 (estado vazio, sem erro)", async () => {
      const emptyRange: DashboardRange = {
        from: new Date("2019-01-01T00:00:00.000Z"),
        to: new Date("2019-01-31T23:59:59.999Z"),
      };
      const distributions = await getLeadDistributions(tenantId, emptyRange);
      expect(distributions.modality).toEqual([
        { bucket: "novo", count: 0 },
        { bucket: "usado", count: 0 },
        { bucket: "ambos", count: 0 },
        { bucket: "nao_informado", count: 0 },
      ]);
      expect(distributions.motivation).toEqual([
        { bucket: "investidor", count: 0 },
        { bucket: "morador", count: 0 },
        { bucket: "nao_informado", count: 0 },
      ]);
    });

    it("isolamento: leads de outro tenant não entram na distribuição (DASH-06)", async () => {
      const distributions = await getLeadDistributions(tenantId, JANUARY);
      const modalitySum = distributions.modality.reduce(
        (sum, b) => sum + b.count,
        0
      );
      // otherTenantId tem 1 lead "usado" em 2022-01-01 — se vazasse, usado
      // seria 2 em vez de 1 (já afirmado no teste de distribuição acima).
      expect(modalitySum).toBe(4);
    });
  });
});
