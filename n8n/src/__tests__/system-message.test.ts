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

describe("buildSystemMessage — fronteira de capacidade (VOZ-02, parcialmente superseded por BUSCA-05)", () => {
  it("NÃO contém mais a proibição de buscar imóvel nem de informar preço (BUSCA-05 AC8)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).not.toContain("NÃO busca imóveis");
    expect(message).not.toContain("NÃO informa preços");
  });

  it("mantém a proibição de mandar foto (BUSCA-05 AC9)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toContain("NÃO manda fotos");
  });

  it("instrui a não escalar quando o lead pede opções/fotos/preço", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NÃO escale para humano só porque o lead pediu/i);
  });

  it("proíbe explicitamente prometer envio por e-mail/arquivo (achado real, Phase 4 lote-7)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NÃO tem nenhuma forma de enviar e-mail/i);
    expect(message).toMatch(/link por e-mail, arquivo/i);
  });
});

describe("buildSystemMessage — quando buscar imóveis (achado real, prova do lote-11)", () => {
  it("manda buscar assim que o lead der QUALQUER critério", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/assim que o lead disser QUALQUER critério de busca/);
  });

  it("busca com critérios novos sem condicionar reunião à escolha de imóvel (BUSCA-05 AC13/14)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toContain("critério de busca novo ou alterar o que procura");
    expect(message).toContain("escolher, aprovar ou decidir por um imóvel NÃO é requisito");
    expect(message).not.toContain("ANTES de propor qualquer reunião");
    expect(message).not.toContain("A reunião com o corretor é a consequência de ter mostrado opções");
  });

  it("vale em qualquer fase, inclusive quando já daria para agendar", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/vale em qualquer fase da conversa/i);
  });

  it("um único critério já basta — não espera ter todos", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/busque mesmo assim com esse único critério em vez de esperar ter todos/i);
  });

  it("a fase agendando orienta busca sem exigir opções antes de falar de horário (BUSCA-05 AC14)", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      perguntados: ["modality", "region", "propertyType"],
    });
    expect(message).toContain("A reunião também serve para tirar dúvidas");
    expect(message).toContain("não espere escolha de imóvel nem decisão de compra");
    expect(message).not.toContain("BUSQUE os imóveis e mostre o que voltou antes de falar de horário");
  });
});

describe("buildSystemMessage — catálogo de tools inclui buscar_imoveis (BUSCA-05)", () => {
  it("lista a tool buscar_imoveis no catálogo", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/- buscar_imoveis:/);
  });

  it("instrui a declarar ausência de resultado e nunca citar imóvel quando a busca não devolver nada (BUSCA-05 AC6)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/não há opção casando com o critério/i);
    expect(message).toMatch(/NÃO cite nenhum imóvel/);
  });

  it("instrui a citar só os campos devolvidos, sem endereço exato nem nome do corretor (BUSCA-05 AC7)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/Cite só os campos que a tool devolver/);
    expect(message).toMatch(/NUNCA prometa endereço exato nem informe nome do corretor de captação/);
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

  it("fase agendando: instrui a propor horário de reunião ao lead", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      perguntados: ["modality", "region", "propertyType"],
    });
    expect(message).toMatch(/proponha ao lead um horário de reunião/i);
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

  it("ancora também a HORA corrente, não só a data (achado real, prova do lote-11)", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      now: "2026-08-16T12:00:00Z",
    });
    // 12:00Z em America/Sao_Paulo (UTC-3) é 09:00 — conferido via
    // Intl.DateTimeFormat antes de escrever o teste, nunca suposto.
    expect(message).toContain("e agora são 09:00");
  });

  it("proíbe propor horário já passado, citando a hora corrente como piso", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      now: "2026-08-16T12:00:00Z",
    });
    expect(message).toMatch(/NUNCA proponha nem confirme um horário que já passou/);
    expect(message).toContain("o horário tem que ser depois de 09:00");
  });

  it("manda oferecer o próximo dia quando não cabe mais nada hoje", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      now: "2026-08-16T12:00:00Z",
    });
    expect(message).toMatch(/ofereça o próximo dia disponível em vez de insistir em hoje/i);
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
    expect(message).not.toMatch(/proponha ao lead um horário de reunião/i);
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

  it("com meetingAt preenchido: proíbe pergunta nova de qualificação (QLF-01 AC4/AC5)", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: "2026-08-17T18:00:00Z" });
    expect(message).toMatch(/NÃO faça nenhuma pergunta nova de qualificação/i);
    expect(message).toMatch(/só são registrados quando o lead fala por conta própria, nunca perguntados/i);
  });

  it("com meetingAt preenchido: manda encerrar em uma linha, sem puxar assunto novo", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: "2026-08-17T18:00:00Z" });
    expect(message).toMatch(/responda em UMA linha e encerre, sem puxar assunto novo/i);
  });

  it("sem meetingAt: mantém a instrução original de propor e agendar", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: null });
    expect(message).toMatch(/proponha ao lead um horário de reunião/i);
    expect(message).not.toContain("REUNIÃO JÁ CONFIRMADA");
  });

  it("com meetingAt inválido: degrada para a instrução original, sem quebrar", () => {
    const message = buildSystemMessage({ ...AGENDADO, meetingAt: "not-a-date" });
    expect(message).toMatch(/proponha ao lead um horário de reunião/i);
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

  it("proíbe propor dia fora da lista, e manda oferecer o próximo dia atendido (achado real: sábado)", () => {
    const message = buildSystemMessage({
      settings: BASE_SETTINGS,
      phase: "agendando",
      businessHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
    });
    expect(message).toMatch(/NUNCA proponha reunião em um dia que não esteja nessa lista/);
    expect(message).toMatch(/hoje pode não ser um dia atendido/i);
    expect(message).toMatch(/ofereça o próximo dia que esteja na lista, nunca hoje/i);
  });

  it("omite a seção de horário comercial quando não informado", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    expect(message).not.toContain("Horário comercial");
  });
});

describe("buildSystemMessage — agendar só após aceite (achado real, Fase 5 lote-10)", () => {
  const AGENDANDO = {
    settings: BASE_SETTINGS,
    phase: "agendando" as const,
    perguntados: ["modality", "region", "propertyType"],
  };

  it("proíbe chamar agendar_reuniao no mesmo turno em que propõe o horário", () => {
    const message = buildSystemMessage(AGENDANDO);
    expect(message).toMatch(/NUNCA chame a tool agendar_reuniao no mesmo turno em que você propõe/i);
  });

  it("condiciona a chamada da tool ao aceite explícito do lead", () => {
    const message = buildSystemMessage(AGENDANDO);
    expect(message).toMatch(/s[óo] chame depois que o lead ACEITAR explicitamente um horário/i);
  });

  it("manda agendar exatamente o horário que o lead aceitou, não outro", () => {
    const message = buildSystemMessage(AGENDANDO);
    expect(message).toMatch(/sempre para o horário que ele aceitou/i);
  });

  it("diz o que fazer quando o lead recusa sem propor horário: propor de novo e esperar", () => {
    const message = buildSystemMessage(AGENDANDO);
    expect(message).toMatch(/recusar sem dizer outro horário, proponha um novo e espere o aceite/i);
  });

  it("proíbe perguntar e chamar a tool no mesmo turno — é um ou outro", () => {
    const message = buildSystemMessage(AGENDANDO);
    expect(message).toMatch(/ou você PERGUNTA se um horário serve, ou você CHAMA a tool — nunca as duas coisas/i);
    expect(message).toMatch(/se perguntou, encerre o turno e espere a resposta/i);
  });

  it("trata horário concreto dito pelo lead como aceite, sem nova pergunta", () => {
    const message = buildSystemMessage(AGENDANDO);
    expect(message).toMatch(/o próprio lead disser um horário concreto, isso JÁ é o aceite/i);
    expect(message).toMatch(/chame a tool para esse horário e confirme, sem perguntar de novo/i);
  });

  it("registra o motivo da regra — agenda do corretor ocupada sem confirmação", () => {
    const message = buildSystemMessage(AGENDANDO);
    expect(message).toMatch(/ocupa a agenda do corretor com um horário que o lead não confirmou/i);
  });

  it("com reunião já confirmada: a regra de aceite não aparece (a instrução é outra)", () => {
    const message = buildSystemMessage({ ...AGENDANDO, meetingAt: "2026-08-17T18:00:00Z" });
    expect(message).not.toMatch(/NUNCA chame a tool agendar_reuniao no mesmo turno/i);
    expect(message).toContain("REUNIÃO JÁ CONFIRMADA");
  });

  it("na fase de qualificação: a regra de aceite também aparece (BUSCA-05 AC18)", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    expect(message).toMatch(/NUNCA chame a tool agendar_reuniao no mesmo turno/i);
    expect(message).toMatch(/s[óo] chame depois que o lead ACEITAR explicitamente um horário/i);
  });
});

describe("buildSystemMessage — postura de conversa (achado real, cenário 2 lote-10)", () => {
  it("declara que o agente atende uma pessoa, não aplica questionário", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/você atende uma pessoa, não aplica um questionário/i);
  });

  it("manda reagir ao que o lead trouxe antes de puxar campo", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/Antes de puxar qualquer campo, REAJA ao que o lead acabou de trazer/i);
  });

  it("nomeia o caso do anúncio: perguntar de qual imóvel se trata", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/se ele falou de um anúncio, o natural é perguntar de qual imóvel se trata/i);
  });

  it("prefere pergunta aberta a pedir região/tipo quando o lead disse pouco", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/é MELHOR do que já pedir região ou tipo de imóvel/i);
  });

  it("proíbe soar apressado ou ansioso para fechar", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NUNCA soe apressado, insistente ou ansioso para fechar/i);
    expect(message).toMatch(/não empurre reunião a cada turno/i);
  });

  it("autoriza conversar algumas trocas antes de qualificar", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/Duas ou três trocas de conversa antes de qualificar são normais e desejáveis/i);
  });

  it("primeiro turno: proíbe abrir pedindo dado de cadastro", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [], firstTurn: true });
    expect(message).toMatch(/NÃO abra pedindo região, tipo de imóvel ou qualquer outro dado de cadastro/i);
  });

  it("fase qualificação: o campo é opcional no turno, não uma ordem", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando", perguntados: [] });
    expect(message).toMatch(/Se couber com naturalidade neste turno, o campo a descobrir é este UM/i);
    expect(message).toMatch(/deixe o campo para o próximo turno — a conversa vem antes da coleta/i);
  });
});

describe("buildSystemMessage — orientação de opt-out (achado real, cenário 3 lote-10)", () => {
  it("declara que o agente não descadastra ninguém", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/você NÃO tem como descadastrar ninguém/i);
  });

  it("proíbe prometer que vai parar ou dizer que já parou", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NUNCA deve prometer que vai parar nem dizer que já parou/i);
  });

  it("cobre a intenção em linguagem natural, não só a palavra exata", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/der a entender de qualquer forma que não quer mais receber mensagens/i);
    expect(message).toMatch(/pediu para parar, disse que foi engano/i);
  });

  it("orienta o lead a digitar a palavra que dispara o mecanismo determinístico", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/basta ele responder com a palavra sair — sozinha, sem mais nada/i);
  });

  it("proíbe insistir ou tentar reverter o pedido", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/Não insista, não tente reverter o pedido/i);
  });

  it("mantém a AD-018: nenhuma tool de opt-out é oferecida ao modelo", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    // o catalogo de tools continua com as 5 de sempre, sem nada de opt-out
    expect(message).not.toMatch(/registrar_opt_out|opt_out|marcar_opt_out/i);
  });
});

describe("buildSystemMessage — entrega ao humano (achado real, cenário 2 lote-10)", () => {
  it("manda encerrar em uma mensagem curta depois de escalar", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/Depois de chamar escalar_para_humano, a conversa passa a ser de uma pessoa da imobiliária/i);
    expect(message).toMatch(/Responda UMA mensagem curta dizendo que alguém da equipe vai continuar o atendimento/i);
  });

  it("proíbe negociar horário ou fazer pergunta nova depois de escalar", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NÃO proponha horário, NÃO chame agendar_reuniao e NÃO faça pergunta nova/i);
  });

  it("exige o nome vindo do campo do responsável devolvido pela tool", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/use EXATAMENTE o nome que a tool devolveu no campo do responsável/i);
  });

  it("proíbe nominalmente usar o nome do lead como se fosse o corretor", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NUNCA o nome do lead \(é com ele que você está falando\)/i);
    expect(message).toMatch(/nunca um nome inventado/i);
  });

  it("define o fallback quando a tool não devolve nome: não nomear ninguém", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/Se a tool não devolver nome, diga só que um corretor da equipe vai assumir, sem nomear ninguém/i);
  });
});

describe("buildSystemMessage — canal da reunião (achado real, Fase 5 lote-10)", () => {
  it("declara que toda reunião é online pelo Google Meet", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/toda reunião marcada é ONLINE, pelo Google Meet/i);
  });

  it("proíbe dizer que a reunião acontece pelo WhatsApp ou outro canal", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(
      /NUNCA diga que a reunião acontece pelo WhatsApp, por ligação, presencialmente ou por qualquer outro canal/i
    );
  });

  it("manda enviar o link devolvido pela tool na confirmação, e nunca inventar um", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/mande esse link para o lead na mesma mensagem da confirmação/i);
    expect(message).toMatch(/nunca invente um link/i);
  });

  it("oferece a alternativa de ligação comum durante o agendamento", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/se o lead preferir, a conversa pode ser por ligação comum/i);
  });

  it("explica o Meet em palavras simples, porque o lead pode nunca ter usado", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/o lead pode nunca ter usado o Meet/i);
  });
});

describe("buildSystemMessage — falha de tool em linguagem do lead (achado real, Fase 5 lote-10)", () => {
  it("proíbe repetir o termo técnico ou o código do erro", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/NUNCA repita o termo técnico nem o código do erro/i);
  });

  it("proíbe nominalmente os jargões que vazaram na conversa real", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    for (const jargao of ["agenda", "conflito", "CRM", "API", "erro ao atualizar"]) {
      expect(message).toContain(`\"${jargao}\"`);
    }
  });

  it("dá a tradução exata de horário indisponível", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/Horário indisponível vira \"esse horário já está reservado\"/i);
  });

  it("dá a tradução exata de falha técnica, sem detalhe", () => {
    const message = buildSystemMessage({ settings: BASE_SETTINGS, phase: "qualificando" });
    expect(message).toMatch(/qualquer outra falha técnica vira \"não consegui confirmar agora\", sem detalhe nenhum/i);
    expect(message).not.toContain('qualquer outra falha técnica vira "o sistema está fora do ar agora"');
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

describe.each(["qualificando", "agendando"] as const)("buildSystemMessage — revisão consultiva aprovada, fase %s", (phase) => {
  const build = (firstTurn = false) => buildSystemMessage({ settings: BASE_SETTINGS, phase, firstTurn });

  it("responde ao cumprimento e às perguntas sociais (BUSCA-05 AC15)", () => {
    const message = build(true);
    expect(message).toContain("responda ao cumprimento e às perguntas sociais");
    expect(message).toContain("“tudo bem?” ou “como vai?”");
  });

  it("adapta a apresentação e não transforma saudação sem pedido em qualificação (BUSCA-05 AC15)", () => {
    const message = build(true);
    expect(message).toContain("adapte a frase e sua ordem ao que a pessoa disse");
    expect(message).toContain("não acrescente uma pergunta de qualificação nesse mesmo turno");
    expect(message).toContain("Se ele já trouxe um pedido, responda à cortesia e então ao pedido");
  });

  it("responde cortesia também depois da apresentação (BUSCA-05 AC15)", () => {
    const message = build();
    expect(message).toContain("responda ao cumprimento e às perguntas sociais");
    expect(message).not.toContain("Primeira mensagem desta conversa:");
  });

  it("oferece ajuda do corretor diante de dúvida e indecisão prolongada (BUSCA-05 AC13)", () => {
    const message = build();
    expect(message).toContain("Se o lead demonstrar dúvida ou incerteza");
    expect(message).toContain("a conversa se prolongar em comparações sem avançar");
    expect(message).toContain("ofereça uma conversa com o corretor para ajudá-lo a decidir");
  });

  it("respeita recusa e permite convite quando não houver opções (BUSCA-05 AC13)", () => {
    const message = build();
    expect(message).toContain("se ele recusar, respeite e continue ajudando");
    expect(message).toContain("Você também pode oferecer essa conversa quando a busca não trouxer opções");
  });

  it("prioriza pedido de reunião e aceite sem forçar novas buscas (BUSCA-05 AC14)", () => {
    const message = build();
    expect(message).toContain("Não repita buscas com os mesmos critérios só para adiar a reunião");
    expect(message).toContain("Se o lead já quiser conversar ou tiver aceitado um horário, priorize esse pedido");
  });

  it("exige referência e preço por imóvel citado (BUSCA-05 AC16, PROVA-02 AC3)", () => {
    const message = build();
    expect(message).toContain("incluindo a referência de cada imóvel citado e seu preço");
  });

  it("não interpreta interesse, dúvida ou agradecimento como aceite (BUSCA-05 AC18)", () => {
    const message = build();
    expect(message).toContain("interesse por um imóvel, dúvida ou agradecimento NÃO é aceite de horário");
    expect(message).toContain("Dizer que gostou de uma opção não autoriza marcar reunião");
  });

  it("encerra a proposta antes de chamar a tool e exige horário aceito (BUSCA-05 AC18)", () => {
    const message = build();
    expect(message).toContain("se perguntou, encerre o turno e espere a resposta");
    expect(message).toContain("sempre para o horário que ele aceitou");
  });

  it("mantém reunião não confirmada quando houver falha técnica (BUSCA-05 AC17)", () => {
    const message = build();
    expect(message).toContain("a reunião ainda NÃO está confirmada");
    expect(message).toContain("Não diga que o horário foi ocupado, a menos que a tool tenha devolvido essa informação");
  });

  it("não promete retomada automática sem mecanismo (BUSCA-05 AC17)", () => {
    const message = build();
    expect(message).toContain("Não prometa que vai confirmar depois, avisar quando voltar, reservar ou deixar encaminhado");
    expect(message).toContain("não existe acompanhamento automático para cumprir isso");
  });

  it("não pede novo horário para corrigir falha técnica nem divulga detalhes (BUSCA-05 AC17)", () => {
    const message = build();
    expect(message).toContain("não peça novas alternativas de horário por esse motivo");
    expect(message).toContain("Oriente o lead a retomar a confirmação mais tarde");
    expect(message).toContain("Não divulgue credenciais, códigos internos ou detalhes de OAuth");
  });
});

describe.each(["qualificando", "agendando"] as const)("buildSystemMessage — proatividade aprovada T33, fase %s", (phase) => {
  const message = buildSystemMessage({ settings: BASE_SETTINGS, phase });

  it("expande apenas bairro flexível por iniciativa própria uma vez no mesmo turno (AC19)", () => {
    expect(message).toContain("Se o bairro for uma preferência flexível, faça por iniciativa própria UMA busca alternativa no mesmo turno, sem o filtro bairro");
    expect(message).toContain("Não peça permissão só para consultar alternativas");
  });
  it("preserva cada critério conhecido na expansão (AC19)", () => {
    expect(message).toContain("mantendo tipo, modalidade, orçamento e quartos conhecidos, além da cidade quando ela estiver confirmada");
    expect(message).toContain("Não altere teto de preço, quantidade mínima de quartos, tipo de imóvel ou cidade para fabricar uma opção");
  });
  it("respeita bairro obrigatório e critérios gravados (AC19)", () => {
    expect(message).toContain("Se o lead disser que o bairro é obrigatório, não retire esse filtro");
    expect(message).toContain("A ampliação é só para consulta de alternativas; não mude os critérios gravados do lead");
  });
  it("não refina um conjunto vazio com preço ou quartos (AC20)", () => {
    expect(message).toContain("Quando uma busca válida não trouxer opções, não peça mais preço ou quartos só para refinar um conjunto já vazio");
  });
  it("convida no mesmo turno após expansão vazia (AC20)", () => {
    expect(message).toContain("Se a busca alternativa também voltar vazia, informe a ausência e ofereça já nessa resposta uma conversa com o corretor");
    expect(message).toContain("sem esperar outra rodada de perguntas ou que o lead diga que não tem interesse");
  });
  it("convida após a primeira ausência quando não couber ampliar (AC20)", () => {
    expect(message).toContain("Se não couber ampliar o bairro, ofereça a conversa após a primeira ausência válida");
  });
  it("não repete combinação ou expansão a cada turno (AC20)", () => {
    expect(message).toContain("Não repita uma combinação já consultada e não repita a mesma expansão a cada turno");
  });
  it("omite filtros desconhecidos sem preenchimento vazio ou zero (AC21)", () => {
    expect(message).toContain("Omitir filtros desconhecidos: não enviar strings vazias ou números zero como preenchimento");
  });
  it("filtra cidade confirmada pelo nome sem UF (AC21)", () => {
    expect(message).toContain("Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada quando confirmada pelo lead");
  });
  it("não transforma proximidade em nome literal de bairro (AC21)", () => {
    expect(message).toContain("Bairro aceita um nome de bairro real, nunca expressões como “próximo do Abadia”, “arredores” ou “bairros próximos”");
    expect(message).toContain("Para consultar alternativas sem um bairro específico, omita bairro");
    expect(message).toContain("A tool não calcula distância ou adjacência");
  });
  it("não assume cidade do lead de imóvel apresentado e omite cidade desconhecida (AC22)", () => {
    expect(message).toContain("Cidade não informada não é assumida a partir de uma opção anterior");
    expect(message).toContain("Sem cidade confirmada, omita cidade e use os demais critérios conhecidos");
  });
  it("explica outros bairros e localização real sem inventar proximidade (AC22)", () => {
    expect(message).toContain("Explique que ampliou para outros bairros e mostre a localização real devolvida");
    expect(message).toContain("não afirme que são próximos sem informação confiável de proximidade");
    expect(message).toContain("cada alternativa mostra sua cidade de verdade");
  });
  it("distingue falha técnica de ausência (AC23)", () => {
    expect(message).toContain("Uma falha técnica não é resultado vazio: siga a regra de falha e não invente ausência");
  });
  it("organiza imóvel em uma mensagem com linhas separadas na ordem aprovada (AC24)", () => {
    expect(message).toContain("Ao apresentar um imóvel, facilite a leitura com linhas curtas em uma única mensagem");
    expect(message).toContain("linhas separadas nesta ordem: tipo/modalidade e referência; bairro e cidade/UF; quartos, banheiros e vagas; área; preço");
  });
  it("usa somente valores reais e separa a pergunta do imóvel (AC24)", () => {
    expect(message).toContain("Use só os campos e os valores devolvidos pela tool");
    expect(message).toContain("Separe uma eventual pergunta ou convite em outra mensagem curta");
    expect(message).toContain("Não emende características, preço e pergunta em um parágrafo comprido");
  });
  it("mantém teto de mensagens, naturalidade e proibições da persona (AC24)", () => {
    expect(message).toContain("respeitando o limite de três mensagens por turno, mesmo ao apresentar mais de uma opção");
    expect(message).toContain("As demais respostas continuam naturais e curtas. Não use emoji, tabela ou markdown");
    expect(message).toContain("Frases curtas, sem markdown, sem listas com tópicos");
  });
});

describe.each(["qualificando", "agendando"] as const)("buildSystemMessage — encerra após pergunta enviada, fase %s", (phase) => {
  const message = buildSystemMessage({ settings: BASE_SETTINGS, phase });

  it("espera o lead depois de pergunta ou solicitação enviada com sucesso (BUSCA-05 AC25)", () => {
    expect(message).toContain("Se responder_lead devolver ok=true para uma mensagem que contém pergunta ou solicitação que depende da resposta do lead, encerre imediatamente o turno e espere o lead responder");
  });

  it("não reformula nem reforça a pergunta já entregue (BUSCA-05 AC25)", () => {
    expect(message).toContain("não chame responder_lead de novo para reformular, repetir, reforçar ou exemplificar essa pergunta ou solicitação");
  });

  it("continua corrigindo mensagens rejeitadas (BUSCA-05 AC25)", () => {
    expect(message).toContain("Se responder_lead devolver ok=false, corrija exatamente o motivo da rejeição e tente novamente");
  });

  it("não confunde retry rejeitado com envio bem-sucedido (BUSCA-05 AC25)", () => {
    expect(message).toContain("Uma tentativa rejeitada não foi enviada ao lead; uma tentativa com ok=true já foi entregue e nunca precisa de paráfrase");
  });

  it("preserva balões complementares antes da pergunta terminal (BUSCA-05 AC25)", () => {
    expect(message).toContain("Você ainda pode usar mensagens complementares antes da pergunta terminal quando elas têm funções diferentes, como apresentar um imóvel e depois fazer o convite");
    expect(message).toContain("Esta regra não reduz o limite global para uma mensagem");
  });
});

describe.each(["qualificando", "agendando"] as const)("buildSystemMessage — informação ausente, fase %s (T35)", (phase) => {
  const message = buildSystemMessage({ settings: BASE_SETTINGS, phase });

  it("proíbe mencionar documentos ou a consulta ao lead", () => {
    expect(message).toContain("NUNCA mencione ao lead documentos, arquivos, materiais, base, sistema ou que você consultou ou procurou algo");
    expect(message).toContain("não diga onde procurou");
  });

  it("permite no máximo dizer que não tem a informação", () => {
    expect(message).toContain("diga só, em uma frase curta, que não tem essa informação");
  });

  it("proíbe inventar política comercial ausente", () => {
    expect(message).toContain("NUNCA invente, deduza ou suponha políticas, condições, descontos, campanhas");
    expect(message).toContain('nem diga que algo "depende" de condições que você não conhece');
  });

  it("não escala só por falta de informação", () => {
    expect(message).toContain("Não escale para humano só porque não sabe uma informação");
  });

  it("oferece corretor para confirmar no máximo uma vez e respeita a recusa", () => {
    expect(message).toContain("Oferecer que um corretor confirme a informação é permitido no máximo UMA vez em toda a conversa");
    expect(message).toContain("se você já fez essa oferta em qualquer mensagem anterior, aceita ou recusada, NÃO ofereça de novo");
    expect(message).toContain("Se o lead recusou, respeite e não insista.");
  });
});

describe("buildSystemMessage — defensivo", () => {
  it("funciona sem settings/perguntados/businessHours", () => {
    const message = buildSystemMessage({ phase: "qualificando" });
    expect(typeof message).toBe("string");
    expect(message.length).toBeGreaterThan(0);
  });
});
