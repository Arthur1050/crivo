import { describe, expect, it } from "vitest";
import {
  FIELD_LABELS,
  OPPORTUNISTIC_FIELDS,
  REQUIRED_FIELDS,
  nextFieldToAsk,
  resolveConversationPhase,
} from "../phase.mjs";

describe("REQUIRED_FIELDS / OPPORTUNISTIC_FIELDS (QLF-01 AC1)", () => {
  it("REQUIRED_FIELDS contém exatamente modality, region, propertyType", () => {
    expect(REQUIRED_FIELDS).toEqual(["modality", "region", "propertyType"]);
  });

  it("OPPORTUNISTIC_FIELDS contém exatamente os outros 5 campos", () => {
    expect(OPPORTUNISTIC_FIELDS).toEqual([
      "budgetCents",
      "purchaseHorizon",
      "motivation",
      "creditStatus",
      "chainedOperation",
    ]);
  });

  it("REQUIRED_FIELDS e OPPORTUNISTIC_FIELDS não têm interseção", () => {
    const overlap = REQUIRED_FIELDS.filter((field) => OPPORTUNISTIC_FIELDS.includes(field));
    expect(overlap).toEqual([]);
  });

  it("FIELD_LABELS tem rótulo pt-BR para todos os 8 campos", () => {
    const allFields = [...REQUIRED_FIELDS, ...OPPORTUNISTIC_FIELDS];
    for (const field of allFields) {
      expect(typeof FIELD_LABELS[field]).toBe("string");
      expect(FIELD_LABELS[field].length).toBeGreaterThan(0);
    }
  });
});

describe("resolveConversationPhase (QLF-01 AC7, QLF-03)", () => {
  it("lista vazia -> qualificando", () => {
    expect(resolveConversationPhase([])).toBe("qualificando");
  });

  it("undefined/null -> qualificando (defensivo)", () => {
    expect(resolveConversationPhase(undefined)).toBe("qualificando");
    expect(resolveConversationPhase(null)).toBe("qualificando");
  });

  it("1 dos 3 obrigatórios perguntado -> qualificando", () => {
    expect(resolveConversationPhase(["modality"])).toBe("qualificando");
  });

  it("2 dos 3 obrigatórios perguntados -> qualificando", () => {
    expect(resolveConversationPhase(["modality", "region"])).toBe("qualificando");
  });

  it("os 3 obrigatórios perguntados -> agendando", () => {
    expect(resolveConversationPhase(["modality", "region", "propertyType"])).toBe("agendando");
  });

  it("os 3 obrigatórios perguntados em ordem diferente -> agendando (ordem não importa)", () => {
    expect(resolveConversationPhase(["propertyType", "modality", "region"])).toBe("agendando");
  });

  it("os 3 obrigatórios perguntados + campos oportunistas extras -> agendando", () => {
    expect(
      resolveConversationPhase([
        "modality",
        "region",
        "propertyType",
        "budgetCents",
        "motivation",
      ])
    ).toBe("agendando");
  });

  // Teste discriminante (T1 Done-when): a assinatura só recebe NOMES de
  // campos perguntados, nunca valores — passar os 3 obrigatórios aqui prova
  // que "todos os valores nulos" não impede `agendando`, porque a função é
  // estruturalmente incapaz de enxergar valor nenhum (QLF-01 AC6).
  it("os 3 obrigatórios perguntados, sem NENHUM valor conhecido pela função -> agendando (vazio não bloqueia)", () => {
    const perguntadosSemValores = ["modality", "region", "propertyType"];
    expect(resolveConversationPhase(perguntadosSemValores)).toBe("agendando");
  });
});

describe("nextFieldToAsk (QLF-01 AC4, QLF-02 AC3)", () => {
  it("lista vazia -> primeiro obrigatório (modality)", () => {
    expect(nextFieldToAsk([])).toBe("modality");
  });

  it("undefined/null -> primeiro obrigatório (defensivo)", () => {
    expect(nextFieldToAsk(undefined)).toBe("modality");
    expect(nextFieldToAsk(null)).toBe("modality");
  });

  it("modality já perguntado -> region", () => {
    expect(nextFieldToAsk(["modality"])).toBe("region");
  });

  it("modality e region já perguntados -> propertyType", () => {
    expect(nextFieldToAsk(["modality", "region"])).toBe("propertyType");
  });

  it("os 3 obrigatórios já perguntados -> null", () => {
    expect(nextFieldToAsk(["modality", "region", "propertyType"])).toBeNull();
  });

  it("nunca devolve um campo oportunista, mesmo quando só oportunistas constam em perguntados", () => {
    const next = nextFieldToAsk(["budgetCents", "motivation"]);
    expect(OPPORTUNISTIC_FIELDS).not.toContain(next);
    expect(next).toBe("modality");
  });

  it("campos oportunistas em perguntados não confundem a ordem dos obrigatórios", () => {
    expect(nextFieldToAsk(["modality", "budgetCents", "region"])).toBe("propertyType");
  });
});
