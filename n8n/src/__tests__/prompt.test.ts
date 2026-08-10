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

// lote-6b — PER-01/CTX-01: persona humanizada + histórico. Fixture sem o
// termo banido no texto institucional do tenant, para que as asserções
// "not.toContain" abaixo testem as INSTRUÇÕES do prompt, não o eco de um
// texto arbitrário fornecido pelo tenant.
const SETTINGS_NO_BANNED_TERMS = {
  realEstateName: "Triângulo Imóveis",
  agentName: "Lucas",
  supportedModality: "ambos",
  agentPresentationMessage: "Sou o Lucas, da Triângulo Imóveis, aqui em Uberlândia.",
};

describe("buildPrompt — regras de estilo humanizado (lote-6b, PER-01)", () => {
  it('proíbe o molde "confirmação → concordância genérica → pergunta" (asserção por trecho citável)', () => {
    const result = buildPrompt({ settings: SETTINGS_NO_BANNED_TERMS, lead: {} });
    expect(result).toContain(
      'PROIBIDO o molde "frase de confirmação → frase de concordância genérica → pergunta"'
    );
  });

  it("proíbe emoji em qualquer mensagem (asserção por trecho citável)", () => {
    const result = buildPrompt({ settings: SETTINGS_NO_BANNED_TERMS, lead: {} });
    expect(result).toContain("NUNCA use emoji");
  });

  it("instrui uma pergunta por turno e proíbe listar os campos faltantes para o lead", () => {
    const result = buildPrompt({ settings: SETTINGS_NO_BANNED_TERMS, lead: {} });
    expect(result).toContain("Pergunte sobre UM campo de qualificação por vez");
    expect(result).toContain("NUNCA liste ou enumere para o lead quais campos ainda faltam");
  });

  it("os termos banidos só aparecem dentro da proibição de se anunciar, nunca como instrução de uso (o fallback de identidade não usa 'assistente virtual')", () => {
    const result = buildPrompt({ settings: SETTINGS_NO_BANNED_TERMS, lead: {} });
    // Os termos aparecem citados DENTRO da frase que proíbe usá-los.
    expect(result).toContain(
      'NUNCA se anuncia como "assistente virtual", "agente virtual", "robô", "IA" ou "automatizado" por iniciativa própria'
    );

    // O fallback de identidade (quando agentName falta) não recai nesses
    // termos — era "o assistente virtual" antes do lote-6b.
    const withoutAgentName = buildPrompt({
      settings: { realEstateName: "Triângulo Imóveis", supportedModality: "ambos" },
      lead: {},
    });
    expect(withoutAgentName).toContain("Você é um atendente, agente de atendimento via WhatsApp");
    expect(withoutAgentName).not.toContain("Você é o assistente virtual");
  });

  it("mantém a regra de nunca negar quando perguntado (metade que NÃO muda desde o lote-6)", () => {
    const result = buildPrompt({ settings: SETTINGS_NO_BANNED_TERMS, lead: {} });
    expect(result).toContain(
      "se o lead perguntar diretamente se você é uma inteligência artificial, um robô, ou um assistente automatizado, você NUNCA deve negar"
    );
  });

  it("contém o tom de voz do tenant quando configurado", () => {
    const result = buildPrompt({
      settings: { ...SETTINGS_NO_BANNED_TERMS, agentVoiceTone: "Informal, direto, bem-humorado." },
      lead: {},
    });
    expect(result).toContain("Informal, direto, bem-humorado.");
  });

  it("NÃO contém o bloco de tom de voz nem placeholder quando o tenant não configurou (null)", () => {
    const result = buildPrompt({
      settings: { ...SETTINGS_NO_BANNED_TERMS, agentVoiceTone: null },
      lead: {},
    });
    expect(result).not.toContain("TOM DE VOZ");
    expect(result).not.toContain("Tom de voz e personalidade");
  });

  it("NÃO contém o bloco de tom de voz quando o campo está ausente do settings", () => {
    const result = buildPrompt({ settings: SETTINGS_NO_BANNED_TERMS, lead: {} });
    expect(result).not.toContain("TOM DE VOZ");
  });

  it("instrui o formato de saída com o campo 'mensagens' (1 a 3 strings)", () => {
    const result = buildPrompt({ settings: SETTINGS_NO_BANNED_TERMS, lead: {} });
    expect(result).toContain("Em 'mensagens', devolva um array de 1 a 3 strings");
  });
});

describe("buildPrompt — histórico da conversa (lote-6b, CTX-01)", () => {
  const HISTORY_WINDOW = [
    { sender: "lead", content: "Oi, boa tarde! Vi o anúncio de vocês", sentAt: "2026-08-01T10:00:00.000Z" },
    { sender: "agente", content: "Oi! Sou o Lucas, da Triângulo Imóveis.", sentAt: "2026-08-01T10:01:00.000Z" },
  ];

  it("renderiza o histórico com 'lead:'/'você:' em ordem crescente (mais antiga primeiro)", () => {
    const result = buildPrompt({
      settings: SETTINGS_NO_BANNED_TERMS,
      lead: {},
      history: { window: HISTORY_WINDOW, hasAgentMessage: true },
    });

    expect(result).toContain("lead: Oi, boa tarde! Vi o anúncio de vocês");
    expect(result).toContain("você: Oi! Sou o Lucas, da Triângulo Imóveis.");
    // Ordem crescente: a linha do lead precisa vir ANTES da linha do agente.
    expect(result.indexOf("lead: Oi, boa tarde")).toBeLessThan(
      result.indexOf("você: Oi! Sou o Lucas")
    );
  });

  it("hasAgentMessage:true -> contém a instrução de não se apresentar de novo", () => {
    const result = buildPrompt({
      settings: SETTINGS_NO_BANNED_TERMS,
      lead: {},
      history: { window: HISTORY_WINDOW, hasAgentMessage: true },
    });
    expect(result).toContain("não se apresente de novo");
  });

  it("hasAgentMessage:false -> NÃO contém a instrução de não se apresentar de novo", () => {
    const result = buildPrompt({
      settings: SETTINGS_NO_BANNED_TERMS,
      lead: {},
      history: {
        window: [{ sender: "lead", content: "Oi", sentAt: "2026-08-01T10:00:00.000Z" }],
        hasAgentMessage: false,
      },
    });
    expect(result).not.toContain("não se apresente de novo");
  });

  it("sem histórico (window vazia) -> NÃO contém a seção de conversa nem a instrução de reapresentação", () => {
    const result = buildPrompt({
      settings: SETTINGS_NO_BANNED_TERMS,
      lead: {},
      history: { window: [], hasAgentMessage: false },
    });
    expect(result).not.toContain("Conversa até aqui");
    expect(result).not.toContain("não se apresente de novo");
  });
});
