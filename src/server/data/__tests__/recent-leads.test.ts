import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { brokers, leads, tenants } from "../../../db/schema";
import { getLeads, getRecentLeads } from "../index";

// Fixture PRÓPRIA (não depende do seed) com datas ABSOLUTAS: a ordenação de
// `getRecentLeads` por firstContactAt DESC precisa ser verificável sem
// depender de "agora" nem da distribuição relativa do seed.
// Cobre RD-04 AC4/AC5 e RD-03 AC3 (brokerName no card do pipeline).
const TENANT_FULL = "aaaaaaaa-0000-4000-8000-000000000001";
const TENANT_SPARSE = "aaaaaaaa-0000-4000-8000-000000000002";
const TENANT_EMPTY = "aaaaaaaa-0000-4000-8000-000000000003";
const NON_EXISTENT_TENANT = "aaaaaaaa-0000-4000-8000-0000000000ff";

const BROKER_FULL = "bbbbbbbb-0000-4000-8000-000000000001";
const BROKER_SPARSE = "bbbbbbbb-0000-4000-8000-000000000002";
const BROKER_FULL_NAME = "Corretora Fixture Alfa";
const BROKER_SPARSE_NAME = "Corretor Fixture Beta";

const FIXTURE_TENANT_IDS = [TENANT_FULL, TENANT_SPARSE, TENANT_EMPTY];

function leadId(n: number): string {
  return `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

/** Datas absolutas, do mais recente para o mais antigo. */
const FULL_TENANT_LEADS = [
  {
    id: leadId(1),
    name: "Lead Mais Recente",
    firstContactAt: new Date(Date.UTC(2026, 2, 20, 12, 0, 0)),
    brokerId: BROKER_FULL,
    budgetCents: BigInt(52000000),
    modality: "novo" as const,
    status: "qualificado_agendado" as const,
  },
  {
    id: leadId(2),
    name: "Lead Sem Corretor",
    firstContactAt: new Date(Date.UTC(2026, 2, 19, 12, 0, 0)),
    brokerId: null,
    budgetCents: null,
    modality: null,
    status: "em_qualificacao" as const,
  },
  {
    id: leadId(3),
    name: "Lead Terceiro",
    firstContactAt: new Date(Date.UTC(2026, 2, 18, 12, 0, 0)),
    brokerId: BROKER_FULL,
    budgetCents: BigInt(31000000),
    modality: "usado" as const,
    status: "escalado_humano" as const,
  },
  {
    id: leadId(4),
    name: "Lead Quarto",
    firstContactAt: new Date(Date.UTC(2026, 2, 17, 12, 0, 0)),
    brokerId: BROKER_FULL,
    budgetCents: BigInt(28000000),
    modality: "ambos" as const,
    status: "em_qualificacao" as const,
  },
  {
    id: leadId(5),
    name: "Lead Quinto",
    firstContactAt: new Date(Date.UTC(2026, 2, 16, 12, 0, 0)),
    brokerId: BROKER_FULL,
    budgetCents: BigInt(19000000),
    modality: "novo" as const,
    status: "em_qualificacao" as const,
  },
  {
    id: leadId(6),
    name: "Lead Sexto Fora Do Corte",
    firstContactAt: new Date(Date.UTC(2026, 2, 15, 12, 0, 0)),
    brokerId: BROKER_FULL,
    budgetCents: BigInt(15000000),
    modality: "usado" as const,
    status: "em_qualificacao" as const,
  },
];

const SPARSE_TENANT_LEADS = [
  {
    id: leadId(11),
    name: "Lead Esparso Recente",
    firstContactAt: new Date(Date.UTC(2026, 2, 21, 12, 0, 0)),
    brokerId: BROKER_SPARSE,
    budgetCents: BigInt(41000000),
    modality: "novo" as const,
    status: "qualificado_agendado" as const,
  },
  {
    id: leadId(12),
    name: "Lead Esparso Antigo",
    firstContactAt: new Date(Date.UTC(2026, 2, 14, 12, 0, 0)),
    brokerId: null,
    budgetCents: null,
    modality: null,
    status: "em_qualificacao" as const,
  },
];

describe("server/data — getRecentLeads e brokerName em getLeads (RD-03/RD-04)", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(tenants).values(
      FIXTURE_TENANT_IDS.map((id, i) => ({
        id,
        name: `Fixture Tenant ${i + 1}`,
        agentName: `Agente Fixture ${i + 1}`,
        supportedModality: "ambos" as const,
      }))
    );
    await db.insert(brokers).values([
      {
        id: BROKER_FULL,
        tenantId: TENANT_FULL,
        name: BROKER_FULL_NAME,
        phone: "+55 34 90000-0001",
        email: "alfa@fixture.test",
      },
      {
        id: BROKER_SPARSE,
        tenantId: TENANT_SPARSE,
        name: BROKER_SPARSE_NAME,
        phone: "+55 34 90000-0002",
        email: "beta@fixture.test",
      },
    ]);
    await db.insert(leads).values([
      ...FULL_TENANT_LEADS.map((lead) => ({
        ...lead,
        tenantId: TENANT_FULL,
        phone: "+55 34 91111-0000",
      })),
      ...SPARSE_TENANT_LEADS.map((lead) => ({
        ...lead,
        tenantId: TENANT_SPARSE,
        phone: "+55 34 92222-0000",
      })),
    ]);
  });

  afterAll(async () => {
    await cleanup();
    await db.$client.end();
  });

  async function cleanup() {
    await db.delete(leads).where(inArray(leads.tenantId, FIXTURE_TENANT_IDS));
    await db
      .delete(brokers)
      .where(inArray(brokers.tenantId, FIXTURE_TENANT_IDS));
    await db.delete(tenants).where(inArray(tenants.id, FIXTURE_TENANT_IDS));
  }

  describe("getRecentLeads", () => {
    it("retorna no máximo 5 leads por padrão, os mais recentes por firstContactAt DESC (RD-04 AC4)", async () => {
      const result = await getRecentLeads(TENANT_FULL);

      expect(result).toHaveLength(5);
      expect(result.map((lead) => lead.name)).toEqual([
        "Lead Mais Recente",
        "Lead Sem Corretor",
        "Lead Terceiro",
        "Lead Quarto",
        "Lead Quinto",
      ]);
      // O 6º lead (mais antigo) fica de fora do corte.
      expect(result.map((lead) => lead.id)).not.toContain(leadId(6));
    });

    it("ordena estritamente por firstContactAt decrescente (RD-04 AC4)", async () => {
      const result = await getRecentLeads(TENANT_FULL);
      expect(result[0].firstContactAt).toEqual(
        new Date(Date.UTC(2026, 2, 20, 12, 0, 0))
      );
      expect(result[4].firstContactAt).toEqual(
        new Date(Date.UTC(2026, 2, 16, 12, 0, 0))
      );
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].firstContactAt.getTime()).toBeGreaterThan(
          result[i].firstContactAt.getTime()
        );
      }
    });

    it("preenche brokerName com o nome do corretor e null quando o lead não tem corretor (RD-04 AC4, Edge Cases)", async () => {
      const result = await getRecentLeads(TENANT_FULL);

      const comCorretor = result.find((lead) => lead.name === "Lead Mais Recente");
      expect(comCorretor!.brokerName).toBe(BROKER_FULL_NAME);

      const semCorretor = result.find((lead) => lead.name === "Lead Sem Corretor");
      expect(semCorretor!.brokerName).toBeNull();
    });

    it("preserva budgetCents/modality nulos em vez de omitir o lead (Edge Cases)", async () => {
      const result = await getRecentLeads(TENANT_FULL);
      const semQualificacao = result.find(
        (lead) => lead.name === "Lead Sem Corretor"
      );

      expect(semQualificacao).toBeDefined();
      expect(semQualificacao!.budgetCents).toBeNull();
      expect(semQualificacao!.modality).toBeNull();
      expect(semQualificacao!.status).toBe("em_qualificacao");
    });

    it("devolve budgetCents como bigint e status/modality do lead qualificado (RD-04 AC4)", async () => {
      const [maisRecente] = await getRecentLeads(TENANT_FULL);
      expect(maisRecente.budgetCents).toBe(BigInt(52000000));
      expect(maisRecente.modality).toBe("novo");
      expect(maisRecente.status).toBe("qualificado_agendado");
    });

    it("respeita um limite explícito menor que o total", async () => {
      const result = await getRecentLeads(TENANT_FULL, 2);
      expect(result.map((lead) => lead.name)).toEqual([
        "Lead Mais Recente",
        "Lead Sem Corretor",
      ]);
    });

    it("tenant com menos leads que o limite retorna apenas os existentes (RD-04 AC5)", async () => {
      const result = await getRecentLeads(TENANT_SPARSE);
      expect(result).toHaveLength(2);
      expect(result.map((lead) => lead.name)).toEqual([
        "Lead Esparso Recente",
        "Lead Esparso Antigo",
      ]);
    });

    it("tenant sem nenhum lead retorna [] (RD-04 AC5 — EmptyState)", async () => {
      const result = await getRecentLeads(TENANT_EMPTY);
      expect(result).toEqual([]);
    });

    it("isola por tenant: nenhum lead de outro tenant aparece no resultado", async () => {
      const doTenantFull = await getRecentLeads(TENANT_FULL);
      const doTenantSparse = await getRecentLeads(TENANT_SPARSE);

      const nomesFull = doTenantFull.map((lead) => lead.name);
      const nomesSparse = doTenantSparse.map((lead) => lead.name);
      expect(nomesFull).not.toContain("Lead Esparso Recente");
      expect(nomesSparse).not.toContain("Lead Mais Recente");
      // O lead esparso mais recente (21/03) é mais novo que qualquer lead do
      // tenant full: se o filtro de tenant sumisse, ele lideraria a lista.
      expect(doTenantFull[0].name).toBe("Lead Mais Recente");
    });

    it("retorna [] para um tenant inexistente, nunca um erro", async () => {
      const result = await getRecentLeads(NON_EXISTENT_TENANT);
      expect(result).toEqual([]);
    });
  });

  describe("getLeads — brokerName aditivo (RD-03 AC3)", () => {
    it("inclui brokerName sem perder nenhuma coluna de leads", async () => {
      const result = await getLeads(TENANT_FULL);
      expect(result).toHaveLength(6);

      const comCorretor = result.find((lead) => lead.id === leadId(1));
      expect(comCorretor!.brokerName).toBe(BROKER_FULL_NAME);
      // Colunas pré-existentes seguem íntegras no mesmo objeto.
      expect(comCorretor!.name).toBe("Lead Mais Recente");
      expect(comCorretor!.tenantId).toBe(TENANT_FULL);
      expect(comCorretor!.brokerId).toBe(BROKER_FULL);
      expect(comCorretor!.status).toBe("qualificado_agendado");
      expect(comCorretor!.budgetCents).toBe(BigInt(52000000));
      expect(comCorretor!.firstContactAt).toEqual(
        new Date(Date.UTC(2026, 2, 20, 12, 0, 0))
      );
      expect(comCorretor!.updatedAt).toBeInstanceOf(Date);
    });

    it("lead sem corretor continua na lista com brokerName null (LEFT JOIN, Edge Cases)", async () => {
      const result = await getLeads(TENANT_FULL);
      const semCorretor = result.find((lead) => lead.id === leadId(2));

      expect(semCorretor).toBeDefined();
      expect(semCorretor!.brokerId).toBeNull();
      expect(semCorretor!.brokerName).toBeNull();
    });

    it("o filtro por status continua funcionando com o join", async () => {
      const result = await getLeads(TENANT_FULL, {
        status: "em_qualificacao",
      });
      expect(result.map((lead) => lead.id).sort()).toEqual(
        [leadId(4), leadId(5), leadId(6), leadId(2)].sort()
      );
      for (const lead of result) {
        expect(lead.status).toBe("em_qualificacao");
      }
    });
  });
});
