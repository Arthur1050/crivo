import { describe, expect, it, vi } from "vitest";
import { parseLeadPatch, serializeLead } from "../../../kit/integration";

vi.mock("../../data", () => ({}));
vi.mock("../auth", () => ({}));

describe("contrato da qualificação — QUAL-01", () => {
  it("devolve a primeira falha na ordem do PATCH", () => {
    const invalid = {
      status: null, region: false, purchaseHorizon: false, executiveSummary: false,
      escalationReason: false, modality: false, propertyType: false, motivation: false,
      creditStatus: false, budgetCents: false, chainedOperation: "true", meetingAt: false,
    };
    const checks = [
      ["status", "Campo 'status' inválido. Valores aceitos: em_qualificacao, qualificado_agendado, escalado_humano."],
      ["region", "Campo 'region' deve ser uma string."],
      ["purchaseHorizon", "Campo 'purchaseHorizon' deve ser uma string."],
      ["executiveSummary", "Campo 'executiveSummary' deve ser uma string."],
      ["escalationReason", "Campo 'escalationReason' deve ser uma string."],
      ["modality", "Campo 'modality' inválido. Valores aceitos: novo, usado, ambos."],
      ["propertyType", "Campo 'propertyType' inválido. Valores aceitos: casa, apartamento."],
      ["motivation", "Campo 'motivation' inválido. Valores aceitos: investidor, morador."],
      ["creditStatus", "Campo 'creditStatus' inválido. Valores aceitos: pre_aprovado, recurso_proprio, fgts."],
      ["budgetCents", "Campo 'budgetCents' deve ser um inteiro maior ou igual a 0."],
      ["chainedOperation", "Campo 'chainedOperation' deve ser booleano."],
      ["meetingAt", "Campo 'meetingAt' deve ser uma data ISO-8601 válida."],
    ] as const;
    const body: Partial<typeof invalid> = { ...invalid };
    for (const [field, detail] of checks) {
      expect(parseLeadPatch(body)).toEqual({ ok: false, detail });
      delete body[field];
    }
  });

  it("mantém a ordem e os valores dos campos serializados", () => {
    const lead = {
      id: "lead-1", externalId: "external-2", name: "Pessoa", phone: "+553400000003",
      status: "em_qualificacao", modality: "usado", region: "Zona Norte", budgetCents: 67890123n,
      propertyType: "apartamento", purchaseHorizon: "seis meses", motivation: "investidor",
      creditStatus: "fgts", chainedOperation: false, executiveSummary: "Resumo",
      escalationReason: "Motivo", meetingAt: null, firstContactAt: new Date("2026-08-01T00:00:00Z"),
      optedOutAt: null, humanTakeoverAt: null, memoryResetRequestedAt: null,
    } satisfies Partial<Parameters<typeof serializeLead>[0]>;
    expect(Object.entries(serializeLead(lead as Parameters<typeof serializeLead>[0]))).toEqual([
      ["id", "lead-1"], ["externalId", "external-2"], ["name", "Pessoa"], ["phone", "+553400000003"],
      ["status", "em_qualificacao"], ["modality", "usado"], ["region", "Zona Norte"], ["budgetCents", "67890123"],
      ["propertyType", "apartamento"], ["purchaseHorizon", "seis meses"], ["motivation", "investidor"],
      ["creditStatus", "fgts"], ["chainedOperation", false], ["executiveSummary", "Resumo"],
      ["escalationReason", "Motivo"], ["meetingAt", null], ["firstContactAt", "2026-08-01T00:00:00.000Z"],
      ["optedOutAt", null], ["humanTakeoverAt", null], ["memoryResetRequestedAt", null],
    ]);
  });
});
