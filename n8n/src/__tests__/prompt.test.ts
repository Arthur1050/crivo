import { describe, expect, it } from "vitest";
import { buildPrompt } from "../prompt.mjs";

const SETTINGS = {
  realEstateName: "Triângulo Imóveis",
  agentName: "Lucas",
  supportedModality: "ambos",
  agentPresentationMessage: "Oi! Sou o Lucas, assistente virtual.",
};

const BUSINESS_HOURS = { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };

describe("buildPrompt (AGT-02, AGT-04, AGT-08)", () => {
  it("contém a instrução de nunca negar ser uma IA quando perguntado (AGT-08 AC5 — teste de conteúdo)", () => {
    const result = buildPrompt({ settings: SETTINGS, lead: {}, businessHours: BUSINESS_HOURS });
    expect(result).toContain(
      "se o lead perguntar diretamente se você é uma inteligência artificial, um robô, ou um assistente automatizado, você NUNCA deve negar"
    );
  });

  it("nunca lista um campo já preenchido como faltante (AGT-02 AC4)", () => {
    const lead = {
      region: "Abadia, Uberaba",
      budgetCents: "45000000",
      // modality, propertyType, purchaseHorizon, motivation, creditStatus,
      // chainedOperation permanecem null/ausentes — devem aparecer como
      // faltantes; region/budgetCents NÃO devem.
    };

    const result = buildPrompt({ settings: SETTINGS, lead, businessHours: BUSINESS_HOURS });

    // Campos preenchidos: seus rótulos não podem aparecer em lugar nenhum
    // do prompt (o campo simplesmente não é mencionado quando já coletado).
    expect(result).not.toContain("região de interesse");
    expect(result).not.toContain("orçamento disponível");

    // Campos faltantes: rótulos precisam aparecer na seção de faltantes.
    expect(result).toContain("modalidade de interesse (novo, usado ou ambos)");
    expect(result).toContain("tipo de imóvel (casa ou apartamento)");
    expect(result).toContain("horizonte de compra");
    expect(result).toContain("motivação (investidor ou morador)");
    expect(result).toContain("status de crédito (pré-aprovado, recurso próprio ou FGTS)");
    expect(result).toContain("se tem imóvel próprio para vender (operação casada)");
  });

  it("todos os 8 campos preenchidos -> nenhum rótulo de campo aparece como faltante", () => {
    const completeLead = {
      modality: "usado",
      region: "Abadia, Uberaba",
      budgetCents: "45000000",
      propertyType: "apartamento",
      purchaseHorizon: "3 meses",
      motivation: "morador",
      creditStatus: "pre_aprovado",
      chainedOperation: false,
    };

    const result = buildPrompt({
      settings: SETTINGS,
      lead: completeLead,
      businessHours: BUSINESS_HOURS,
    });

    expect(result).toContain("Todos os campos de qualificação já estão preenchidos");
    expect(result).not.toContain("modalidade de interesse (novo, usado ou ambos)");
    expect(result).not.toContain("região de interesse");
    expect(result).not.toContain("orçamento disponível");
    expect(result).not.toContain("tipo de imóvel (casa ou apartamento)");
    expect(result).not.toContain("horizonte de compra");
    expect(result).not.toContain("motivação (investidor ou morador)");
    expect(result).not.toContain("status de crédito (pré-aprovado, recurso próprio ou FGTS)");
    expect(result).not.toContain("se tem imóvel próprio para vender (operação casada)");
  });

  it("chainedOperation=false conta como PREENCHIDO, não como faltante (false é um valor válido, não ausência)", () => {
    const lead = { chainedOperation: false };
    const result = buildPrompt({ settings: SETTINGS, lead, businessHours: BUSINESS_HOURS });
    expect(result).not.toContain("se tem imóvel próprio para vender (operação casada)");
  });

  it("inclui persona: nome do agente, nome da imobiliária e modalidade suportada", () => {
    const result = buildPrompt({ settings: SETTINGS, lead: {}, businessHours: BUSINESS_HOURS });
    expect(result).toContain("Lucas");
    expect(result).toContain("Triângulo Imóveis");
    expect(result).toContain("ambos");
  });

  it("inclui o horário comercial resolvido (dias + início + fim)", () => {
    const result = buildPrompt({ settings: SETTINGS, lead: {}, businessHours: BUSINESS_HOURS });
    expect(result).toContain("segunda");
    expect(result).toContain("sexta");
    expect(result).toContain("09:00");
    expect(result).toContain("18:00");
  });

  it("funciona sem settings/lead/context/buffer/businessHours, sem lançar exceção", () => {
    expect(() => buildPrompt({})).not.toThrow();
    expect(() => buildPrompt()).not.toThrow();
    expect(typeof buildPrompt({})).toBe("string");
  });
});
