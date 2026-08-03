import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { leads, tenants } from "../../../db/schema";
import { getLead, updateLeadStatus } from "../../data";
import { patchLead, TRANSITIONS } from "../leads";
import type { LeadPatchDto } from "../parsers";

type LeadStatusValue = "em_qualificacao" | "qualificado_agendado" | "escalado_humano";
const ALL_STATUSES: LeadStatusValue[] = [
  "em_qualificacao",
  "qualificado_agendado",
  "escalado_humano",
];

const NON_EXISTENT_LEAD_ID = "00000000-0000-4000-8000-000000000123";

describe("server/integration leads — TRANSITIONS + patchLead", () => {
  it("TRANSITIONS é 1:1 com a regra 'só avanço + escalar' (design.md — INT-04)", () => {
    expect(TRANSITIONS.em_qualificacao).toEqual([
      "qualificado_agendado",
      "escalado_humano",
    ]);
    expect(TRANSITIONS.qualificado_agendado).toEqual([]);
    expect(TRANSITIONS.escalado_humano).toEqual([]);
  });

  // Tenant + leads PRÓPRIOS deste arquivo (nunca os 2 tenants do seed) —
  // mesmo padrão de isolamento usado em leads-post.test.ts.
  describe("patchLead (contra banco real)", () => {
    let tenantId: string;

    beforeAll(async () => {
      tenantId = randomUUID();
      await db.insert(tenants).values({
        id: tenantId,
        name: `Tenant Teste patchLead ${tenantId}`,
        agentName: "Agente Teste",
        supportedModality: "ambos",
      });
    });

    afterAll(async () => {
      await db.delete(leads).where(eq(leads.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
      await db.$client.end();
    });

    async function createTestLead(status: LeadStatusValue): Promise<string> {
      const id = randomUUID();
      await db.insert(leads).values({
        id,
        tenantId,
        name: "Lead Teste patchLead",
        phone: "+55 34 90000-0000",
        status,
        firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
      });
      return id;
    }

    describe("tabela de transições — teste par a par (9 combinações)", () => {
      for (const from of ALL_STATUSES) {
        for (const to of ALL_STATUSES) {
          const allowed = TRANSITIONS[from].includes(to);
          it(`${from} → ${to} é ${allowed ? "permitida (200)" : "rejeitada (409 transicao-invalida)"}`, async () => {
            const leadId = await createTestLead(from);
            const dto: LeadPatchDto = {
              status: to,
              ...(to === "escalado_humano"
                ? { escalationReason: "Motivo de teste par a par." }
                : {}),
            };

            const result = await patchLead(tenantId, leadId, dto);

            if (allowed) {
              expect(result.ok).toBe(true);
              if (result.ok) expect(result.lead.status).toBe(to);
            } else {
              expect(result).toEqual({ ok: false, code: "transicao-invalida" });
              const unchanged = await getLead(tenantId, leadId);
              expect(unchanged!.status).toBe(from);
            }
          });
        }
      }
    });

    it("escalar sem escalationReason retorna motivo-escalonamento-obrigatorio e não grava nada (INT-03 AC2)", async () => {
      const leadId = await createTestLead("em_qualificacao");
      const result = await patchLead(tenantId, leadId, { status: "escalado_humano" });
      expect(result).toEqual({
        ok: false,
        code: "motivo-escalonamento-obrigatorio",
      });

      const unchanged = await getLead(tenantId, leadId);
      expect(unchanged!.status).toBe("em_qualificacao");
    });

    it("escalar com escalationReason vazio (string em branco) também é rejeitado", async () => {
      const leadId = await createTestLead("em_qualificacao");
      const result = await patchLead(tenantId, leadId, {
        status: "escalado_humano",
        escalationReason: "",
      });
      expect(result).toEqual({
        ok: false,
        code: "motivo-escalonamento-obrigatorio",
      });
    });

    it("escalar com escalationReason preenchido é aceito e persiste o motivo (Independent Test da spec)", async () => {
      const leadId = await createTestLead("em_qualificacao");
      const result = await patchLead(tenantId, leadId, {
        status: "escalado_humano",
        escalationReason: "Lead pediu corretor humano.",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lead.status).toBe("escalado_humano");
      expect(result.lead.escalationReason).toBe("Lead pediu corretor humano.");
    });

    it("lead travado por humano (status_changed_by='humano') rejeita mudança de status via API mesmo com transição válida na tabela (INT-04 AC4)", async () => {
      const leadId = await createTestLead("em_qualificacao");
      // Simula "humano mexeu pelo Kanban" sem precisar mudar de coluna —
      // exercita o novo parâmetro `actor` de updateLeadStatus (lote-5).
      await updateLeadStatus(tenantId, leadId, "em_qualificacao", "humano");

      const result = await patchLead(tenantId, leadId, {
        status: "qualificado_agendado",
      });
      expect(result).toEqual({ ok: false, code: "lead-travado-por-humano" });

      const unchanged = await getLead(tenantId, leadId);
      expect(unchanged!.status).toBe("em_qualificacao");
    });

    it("transição inválida na tabela tem prioridade sobre a trava humana — reporta transicao-invalida (ordem de validação: transição antes de trava)", async () => {
      const leadId = await createTestLead("qualificado_agendado");
      await updateLeadStatus(tenantId, leadId, "qualificado_agendado", "humano");

      // qualificado_agendado → em_qualificacao nunca é permitido (TRANSITIONS
      // vazio), independente da trava — o code esperado é o de transição,
      // não o de trava humana.
      const result = await patchLead(tenantId, leadId, {
        status: "em_qualificacao",
      });
      expect(result).toEqual({ ok: false, code: "transicao-invalida" });
    });

    it("patch sem campo status é aceito mesmo em lead travado por humano — só a mudança de STATUS é bloqueada (INT-04 AC4)", async () => {
      const leadId = await createTestLead("em_qualificacao");
      await updateLeadStatus(tenantId, leadId, "em_qualificacao", "humano");

      const result = await patchLead(tenantId, leadId, { region: "Centro Novo" });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.lead.region).toBe("Centro Novo");
      expect(result.lead.status).toBe("em_qualificacao");
    });

    it("PATCH misturando campos válidos com transição inválida rejeita a request inteira sem gravar nenhum campo (INT-04 AC5 — atomicidade)", async () => {
      const leadId = await createTestLead("qualificado_agendado");
      const before = await getLead(tenantId, leadId);

      const result = await patchLead(tenantId, leadId, {
        status: "em_qualificacao", // inválido a partir de qualificado_agendado
        region: "Região Que Não Deveria Ser Gravada",
        executiveSummary: "Resumo que não deveria ser gravado",
      });

      expect(result).toEqual({ ok: false, code: "transicao-invalida" });

      const after = await getLead(tenantId, leadId);
      expect(after!.status).toBe(before!.status);
      expect(after!.region).toBe(before!.region);
      expect(after!.executiveSummary).toBe(before!.executiveSummary);
    });

    it("lead inexistente no tenant retorna recurso-nao-encontrado (404 na rota — T6)", async () => {
      const result = await patchLead(tenantId, NON_EXISTENT_LEAD_ID, {
        region: "X",
      });
      expect(result).toEqual({ ok: false, code: "recurso-nao-encontrado" });
    });
  });
});
