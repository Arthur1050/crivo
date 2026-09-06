import { describe, expect, it } from "vitest";
import { FIELD_LABELS, OPPORTUNISTIC_FIELDS, REQUIRED_FIELDS } from "../phase.mjs";
import { buildSystemMessage } from "../system-message.mjs";

/** Chave de `FIELD_LABELS` — `REQUIRED_FIELDS`/`OPPORTUNISTIC_FIELDS` são
 * `readonly string[]` na fonte, então indexar `FIELD_LABELS` por um item
 * delas precisa do nome do campo como chave para ser checado. */
type FieldName = keyof typeof FIELD_LABELS;

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

  it("proíbe explicitamente prometer envio por e-mail (achado real, Phase 4 lote-7)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NÃO tem nenhuma forma de enviar e-mail/i);
  });
});

describe("buildSystemMessage — instrução por fase (QLF-01 AC7/AC8, QLF-03)", () => {
  it("fase agendando: NÃO menciona nenhum rótulo de campo de qualificação pendente", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      perguntados: ["modality", "region", "propertyType"],
    });

    for (const field of [...REQUIRED_FIELDS, ...OPPORTUNISTIC_FIELDS] as FieldName[]) {
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
    for (const field of OPPORTUNISTIC_FIELDS as readonly FieldName[]) {
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
    const mentionedRequiredLabels = (REQUIRED_FIELDS as readonly FieldName[]).filter((field) =>
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

  it("avisa que texto final sem responder_lead deixa o lead sem receber nada (achado real, Phase 4 lote-7)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    expect(message).toMatch(/sem chamar responder_lead, faz o lead NÃO RECEBER NADA/i);
  });
});

describe("buildSystemMessage — âncora de data (achado real, Phase 4 lote-7)", () => {
  it("inclui o dia da semana e a data por extenso quando `now` é informado", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      now: "2026-08-16T12:00:00Z",
    });
    // Verificado independentemente via Intl.DateTimeFormat antes de escrever
    // este teste: 2026-08-16T12:00:00Z em America/Sao_Paulo é domingo.
    expect(message).toContain("Hoje é domingo, 16 de agosto de 2026");
  });

  it("resolve o dia da semana corretamente para outra data (segunda-feira)", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      now: "2026-01-05T12:00:00Z",
    });
    expect(message).toContain("Hoje é segunda-feira, 5 de janeiro de 2026");
  });

  it("instrui a nunca resolver o mesmo dia relativo para datas diferentes na mesma conversa", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "agendando", now: "2026-08-16T12:00:00Z" });
    expect(message).toMatch(/nunca proponha ou confirme duas datas diferentes/i);
  });

  it("omite a âncora de data quando `now` não é informado", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).not.toContain("Hoje é");
  });

  it("omite a âncora de data quando `now` é uma string inválida", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", now: "not-a-date" });
    expect(message).not.toContain("Hoje é");
  });
});

describe("buildSystemMessage — reunião já confirmada (achado real, Phase 4 lote-7)", () => {
  const AGENDADO = {
    settings: BASE_SETTINGS,
    phase: "agendando" as const,
    perguntados: ["modality", "region", "propertyType"],
    now: "2026-08-16T12:00:00Z",
  };

  it("com meetingAt preenchido: proíbe chamar agendar_reuniao de novo", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: "2026-08-17T18:00:00Z" });
    expect(message).toMatch(/NÃO chame a tool agendar_reuniao/i);
  });

  it("com meetingAt preenchido: NÃO instrui a propor horário", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: "2026-08-17T18:00:00Z" });
    expect(message).not.toMatch(/proponha um horário de reunião/i);
  });

  it("com meetingAt preenchido: informa o horário já confirmado ao agente", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: "2026-08-17T18:00:00Z" });
    // 2026-08-17T18:00Z == 15:00 em America/Sao_Paulo (UTC-3), segunda-feira.
    expect(message).toContain("REUNIÃO JÁ CONFIRMADA");
    expect(message).toContain("15:00");
    expect(message).toContain("segunda-feira");
  });

  it("com meetingAt preenchido: permite remarcar só a pedido explícito do lead", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: "2026-08-17T18:00:00Z" });
    expect(message).toMatch(/pedir EXPLICITAMENTE para remarcar/i);
  });

  it("sem meetingAt: mantém a instrução original de propor e agendar", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: null });
    expect(message).toMatch(/proponha um horário de reunião/i);
    expect(message).not.toContain("REUNIÃO JÁ CONFIRMADA");
  });

  it("com meetingAt inválido: degrada para a instrução original, sem quebrar", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: "not-a-date" });
    expect(message).toMatch(/proponha um horário de reunião/i);
    expect(message).not.toContain("REUNIÃO JÁ CONFIRMADA");
  });

  it("meetingAt na fase de qualificação não muda a instrução de campo", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "qualificando",
      perguntados: [],
      meetingAt: "2026-08-17T18:00:00Z",
    });
    expect(message).toContain(FIELD_LABELS.modality);
    expect(message).not.toContain("REUNIÃO JÁ CONFIRMADA");
  });
});

describe("buildSystemMessage — reação a falha de tool (achado real, Phase 4 lote-7)", () => {
  it("instrui a nunca confirmar ao lead quando uma tool devolve falha", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NUNCA confirme ao lead como se tivesse dado certo/i);
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

describe("buildSystemMessage — abertura de sessão (achado real, Fase 5 lote-10)", () => {
  const PRESENTATION = "Oi! Sou o Lucas, da Triângulo Imóveis. Me conta qual imóvel você procura.";

  it("primeiro turno: manda cumprimentar e dizer quem é antes de qualquer pergunta", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "qualificando",
      perguntados: [],
      firstTurn: true,
    });
    expect(message).toMatch(/antes de qualquer pergunta, cumprimente o lead e diga quem você é/i);
    expect(message).toMatch(/nome da imobiliária/i);
  });

  it("turno seguinte: NÃO manda cumprimentar nem se apresentar", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "qualificando",
      perguntados: ["modality"],
      firstTurn: false,
    });
    expect(message).not.toMatch(/cumprimente o lead/i);
  });

  it("sem firstTurn informado: degrada para o comportamento anterior (não cumprimenta)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    expect(message).not.toMatch(/cumprimente o lead/i);
  });

  it("primeiro turno: a mensagem de apresentação do tenant vira BASE da apresentação, não texto proibido", () => {
    const message = buildSystemMessage({
      settings: { ...BASE_SETTINGS, agentPresentationMessage: PRESENTATION },
      phase: "qualificando",
      perguntados: [],
      firstTurn: true,
    });
    expect(message).toContain(PRESENTATION);
    expect(message).toMatch(/base da sua apresentação neste primeiro turno/i);
    expect(message).not.toMatch(/NUNCA copie este texto literalmente/i);
  });

  it("turno seguinte: a mensagem de apresentação continua sendo contexto que não se copia", () => {
    const message = buildSystemMessage({
      settings: { ...BASE_SETTINGS, agentPresentationMessage: PRESENTATION },
      phase: "qualificando",
      perguntados: ["modality"],
      firstTurn: false,
    });
    expect(message).toContain(PRESENTATION);
    expect(message).toMatch(/NUNCA copie este texto literalmente/i);
  });

  it("primeiro turno sem apresentação configurada: ainda manda cumprimentar e se identificar", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "qualificando",
      perguntados: [],
      firstTurn: true,
    });
    expect(message).not.toContain("Contexto institucional");
    expect(message).toMatch(/cumprimente o lead e diga quem você é/i);
  });

  it("primeiro turno: a saudação não vira desculpa para se anunciar como IA (AD-016 intacta)", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "qualificando",
      perguntados: [],
      firstTurn: true,
    });
    expect(message).toContain(
      'você NUNCA se anuncia como "assistente virtual", "agente virtual", "robô", "IA" ou "automatizado" por iniciativa própria'
    );
  });

  it("primeiro turno: continua pedindo UM campo só, sem listar os 3 obrigatórios", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "qualificando",
      perguntados: [],
      firstTurn: true,
    });
    const mentionedRequiredLabels = (REQUIRED_FIELDS as readonly FieldName[]).filter((field) =>
      message.includes(FIELD_LABELS[field])
    );
    expect(mentionedRequiredLabels).toHaveLength(1);
  });
});

describe("buildSystemMessage — defensivo", () => {
  it("funciona sem settings/perguntados/businessHours", () => {
    const message = buildSystemMessage({ phase: "qualificando" });
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });
});
