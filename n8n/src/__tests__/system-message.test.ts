import { describe, expect, it } from "vitest";
import { FIELD_LABELS, OPPORTUNISTIC_FIELDS, REQUIRED_FIELDS } from "../phase.mjs";
import { buildSystemMessage } from "../system-message.mjs";

const BASE_SETTINGS = {
  realEstateName: "Triângulo Imóveis",
  agentName: "Marina",
};

describe("buildSystemMessage — identidade e tom do tenant", () => {
  it("inclui nome do agente e da imobiliária", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toContain("Marina");
    expect(message).toContain("Triângulo Imóveis");
  });

  it("preserva o bloco delimitado de tom de voz do tenant quando presente", () => {
    const message = buildSystemMessage({
      settings: { ...BASE_SETTINGS, agentVoiceTone: "Descontraído e direto" },
      phase: "qualificando",
    });
    expect(message).toContain("<<<TOM DE VOZ");
    expect(message).toContain("Descontraído e direto");
    expect(message).toContain("TOM DE VOZ>>>");
  });

  it("bloco de tom de voz reafirma que não sobrepõe as regras de transparência/capacidade", () => {
    const message = buildSystemMessage({
      settings: { ...BASE_SETTINGS, agentVoiceTone: "Qualquer coisa" },
      phase: "qualificando",
    });
    expect(message).toMatch(/transparência.*continuam valendo sempre/i);
  });

  it("omite o bloco de tom de voz quando o tenant não configurou nada", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).not.toContain("TOM DE VOZ");
  });
});

describe("buildSystemMessage — transparência (AD-016)", () => {
  it("preserva literalmente a instrução de nunca negar quando perguntado", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toContain(
      "você NUNCA deve negar — confirme com transparência que sim, você é um agente de atendimento automatizado (IA) desta imobiliária"
    );
  });

  it("preserva literalmente a instrução de nunca se anunciar por iniciativa própria", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toContain(
      'você NUNCA se anuncia como "assistente virtual", "agente virtual", "robô", "IA" ou "automatizado" por iniciativa própria'
    );
  });
});

describe("buildSystemMessage — fronteira de capacidade (VOZ-02)", () => {
  it("contém a proibição explícita de buscar imóvel, mandar foto e informar preço", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toContain("NÃO busca imóveis");
    expect(message).toContain("NÃO manda fotos");
    expect(message).toContain("NÃO informa preços");
  });

  it("instrui a não escalar quando o lead pede opções/fotos/preço", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NÃO escale para humano só porque o lead pediu/i);
  });
});

describe("buildSystemMessage — instrução por fase (QLF-01 AC7/AC8, QLF-03)", () => {
  it("fase agendando: NÃO menciona nenhum rótulo de campo de qualificação pendente", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      perguntados: ["modality", "region", "propertyType"],
    });

    for (const field of [...REQUIRED_FIELDS, ...OPPORTUNISTIC_FIELDS]) {
      expect(message).not.toContain(FIELD_LABELS[field]);
    }
  });

  it("fase agendando: instrui a propor horário de reunião", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      perguntados: ["modality", "region", "propertyType"],
    });
    expect(message).toMatch(/proponha um horário de reunião/i);
  });

  it("fase qualificando (nada perguntado ainda): menciona só o rótulo de 'modality', não os outros 2 obrigatórios", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    expect(message).toContain(FIELD_LABELS.modality);
    expect(message).not.toContain(FIELD_LABELS.region);
    expect(message).not.toContain(FIELD_LABELS.propertyType);
  });

  it("fase qualificando: nunca menciona campo oportunista", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    for (const field of OPPORTUNISTIC_FIELDS) {
      expect(message).not.toContain(FIELD_LABELS[field]);
    }
  });

  it("fase qualificando com 2 dos 3 obrigatórios já perguntados: menciona só o 3º (propertyType)", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "qualificando",
      perguntados: ["modality", "region"],
    });
    expect(message).toContain(FIELD_LABELS.propertyType);
    expect(message).not.toContain(FIELD_LABELS.modality);
    expect(message).not.toContain(FIELD_LABELS.region);
  });

  it("instrução por fase menciona no máximo UM campo por vez, nunca lista os 3 juntos", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    const mentionedRequiredLabels = REQUIRED_FIELDS.filter((field) =>
      message.includes(FIELD_LABELS[field])
    );
    expect(mentionedRequiredLabels).toHaveLength(1);
  });
});

describe("buildSystemMessage — ausência de histórico, documentos e formato de saída", () => {
  const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });

  it("não contém marcador de histórico de conversa", () => {
    expect(message).not.toContain("Conversa até aqui");
  });

  it("não contém lista de documentos de contexto", () => {
    expect(message).not.toContain("Documentos de contexto disponíveis");
  });

  it("não contém instrução de formato de saída do output parser antigo", () => {
    expect(message).not.toMatch(/EXATAMENTE um destes 4 valores/i);
    expect(message).not.toContain("'acao'");
  });
});

describe("buildSystemMessage — catálogo de tools (AGN-02)", () => {
  it("nomeia as 5 tools disponíveis", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    for (const tool of [
      "responder_lead",
      "registrar_qualificacao",
      "agendar_reuniao",
      "escalar_para_humano",
      "consultar_documentos",
    ]) {
      expect(message).toContain(tool);
    }
  });

  it("instrui que responder_lead é a ÚNICA forma de enviar mensagem", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    expect(message).toMatch(/responder_lead: ÚNICA forma de enviar mensagem/);
  });
});

describe("buildSystemMessage — horário comercial", () => {
  it("inclui horário comercial quando informado", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      perguntados: ["modality", "region", "propertyType"],
      businessHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
    });
    expect(message).toContain("segunda, terça, quarta, quinta, sexta");
    expect(message).toContain("09:00");
    expect(message).toContain("18:00");
  });

  it("omite a seção de horário comercial quando não informado", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    expect(message).not.toContain("Horário comercial");
  });
});

describe("buildSystemMessage — defensivo", () => {
  it("funciona sem settings/perguntados/businessHours", () => {
    const message = buildSystemMessage({ phase: "qualificando" });
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });
});
