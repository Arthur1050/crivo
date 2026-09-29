import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPT_OUT_CONFIRMATION,
  OPT_OUT_REGISTRATION_FAILED,
  buildClassifierInput,
  isContentOnlyStop,
  lastAgentMessage,
  refineOptOutCategory,
} from "../opt-out-intent.mjs";

/**
 * Formato real da sessão carregada e da semeadura (lote-13 T1, execução 2598
 * do crivo-agente-principal). A fixture é a fonte de verdade do shape: se o
 * n8n mudar o formato, ela é recapturada e estes testes acompanham.
 */
const sample = JSON.parse(readFileSync("n8n/fixtures/memory-load-sample.json", "utf8"));

const AGENT_LAST_LOADED =
  "Não tenho essa informação de desconto por aqui. Qual imóvel você viu com esse desconto?";
const AGENT_LAST_SEEDED = "Oi! Eu sou o Lucas, da imobiliária. Qual região você procura?";

describe("OPT_OUT_CONFIRMATION (OPTMSG-01)", () => {
  it("é exatamente o texto aprovado na spec (AC2, L-037)", () => {
    expect(OPT_OUT_CONFIRMATION).toBe(
      "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!"
    );
  });

  it("não promete retomada de contato", () => {
    expect(OPT_OUT_CONFIRMATION).not.toMatch(/chamar novamente/i);
    expect(OPT_OUT_CONFIRMATION).not.toMatch(/mudar de ideia/i);
  });
});

describe("OPT_OUT_REGISTRATION_FAILED (OPTREG-01 AC7, AC10)", () => {
  it("é exatamente o texto do design", () => {
    expect(OPT_OUT_REGISTRATION_FAILED).toBe(
      "Não consegui registrar seu pedido agora. Para encerrar, responda com a palavra sair, sozinha."
    );
  });

  it("orienta a responder com a palavra sair", () => {
    expect(OPT_OUT_REGISTRATION_FAILED).toMatch(/\bsair\b/);
  });

  it("não afirma que as mensagens pararam", () => {
    expect(OPT_OUT_REGISTRATION_FAILED).not.toMatch(/não vai mais receber/i);
    expect(OPT_OUT_REGISTRATION_FAILED).not.toMatch(/registramos/i);
    expect(OPT_OUT_REGISTRATION_FAILED).not.toMatch(/(parou|paramos|encerrad[oa])/i);
  });
});

describe("lastAgentMessage — sessão carregada (formato da T1)", () => {
  it("agente por último: devolve a última fala do agente", () => {
    expect(lastAgentMessage({ loaded: sample.loaded, seeded: sample.seededNothing })).toBe(AGENT_LAST_LOADED);
  });

  it("lead por último depois de uma fala do agente: devolve essa fala", () => {
    const loaded = {
      messages: [
        ...sample.loaded.messages.slice(0, 3),
        { ai: "Posso te perguntar se você quer parar de receber mensagens por este número?", human: "sim" },
      ],
      messagesCount: 4,
    };
    expect(lastAgentMessage({ loaded, seeded: sample.seededNothing })).toBe(
      "Posso te perguntar se você quer parar de receber mensagens por este número?"
    );
  });

  it("ignora a mensagem do agente que só chamou tool (`ai: []`) e volta até o último texto", () => {
    const loaded = {
      messages: [
        { ai: "Qual bairro você prefere?", human: "Centro" },
        { human: "tem garagem?", ai: [], tool: "[{\"ok\":true}]" },
      ],
      messagesCount: 2,
    };
    expect(lastAgentMessage({ loaded, seeded: sample.seededNothing })).toBe("Qual bairro você prefere?");
  });

  it("ignora `ai` string vazia ou só com espaços", () => {
    const loaded = { messages: [{ ai: "Qual bairro?", human: "x" }, { ai: "   " }], messagesCount: 2 };
    expect(lastAgentMessage({ loaded, seeded: null })).toBe("Qual bairro?");
  });

  it("sessão carregada sem nenhuma fala do agente: null", () => {
    const loaded = { messages: [{ human: "oi", ai: [], tool: "[]" }], messagesCount: 1 };
    expect(lastAgentMessage({ loaded, seeded: null })).toBeNull();
  });
});

describe("lastAgentMessage — precedência entre carga e semeadura", () => {
  it("carga não vazia é a sessão corrente: a semeadura é ignorada", () => {
    expect(lastAgentMessage({ loaded: sample.loaded, seeded: sample.seeded })).toBe(AGENT_LAST_LOADED);
  });

  it("carga não vazia sem fala do agente não cai para a semeadura", () => {
    const loaded = { messages: [{ human: "oi" }], messagesCount: 1 };
    expect(lastAgentMessage({ loaded, seeded: sample.seeded })).toBeNull();
  });

  it("carga vazia: usa a semeadura", () => {
    expect(lastAgentMessage({ loaded: sample.loadedEmpty, seeded: sample.seeded })).toBe(AGENT_LAST_SEEDED);
  });
});

describe("lastAgentMessage — só semeadura", () => {
  it("devolve a última mensagem `type: 'ai'`, mesmo com o lead por último", () => {
    expect(lastAgentMessage({ loaded: undefined, seeded: sample.seeded })).toBe(AGENT_LAST_SEEDED);
  });

  it("semeadura sem mensagem do agente: null", () => {
    const seeded = [{ type: "user", message: "oi", nadaParaSemear: false }];
    expect(lastAgentMessage({ loaded: sample.loadedEmpty, seeded })).toBeNull();
  });
});

describe("lastAgentMessage — sessão vazia (edge case do 'sim' depois do corte de 12h)", () => {
  it("carga vazia e semeadura sentinela: null", () => {
    expect(lastAgentMessage({ loaded: sample.loadedEmpty, seeded: sample.seededNothing })).toBeNull();
  });

  it("carga vazia e semeadura vazia: null", () => {
    expect(lastAgentMessage({ loaded: sample.loadedEmpty, seeded: [] })).toBeNull();
  });

  it("carga e semeadura ausentes (undefined): null", () => {
    expect(lastAgentMessage({ loaded: undefined, seeded: undefined })).toBeNull();
  });

  it("carga e semeadura ausentes (null): null", () => {
    expect(lastAgentMessage({ loaded: null, seeded: null })).toBeNull();
  });
});

describe("buildClassifierInput", () => {
  it("com última mensagem: formato do design", () => {
    expect(buildClassifierInput({ lastAgentMessage: "Qual região você procura?", userMessage: "não me mande mais mensagens" })).toBe(
      "Última mensagem enviada ao lead: Qual região você procura?\nMensagem do lead: não me mande mais mensagens"
    );
  });

  it("sem última mensagem (null): usa (nenhuma)", () => {
    expect(buildClassifierInput({ lastAgentMessage: null, userMessage: "sim" })).toBe(
      "Última mensagem enviada ao lead: (nenhuma)\nMensagem do lead: sim"
    );
  });

  it("sem última mensagem (ausente): usa (nenhuma)", () => {
    expect(buildClassifierInput({ userMessage: "sim" })).toBe(
      "Última mensagem enviada ao lead: (nenhuma)\nMensagem do lead: sim"
    );
  });

  it("várias mensagens do buffer são unidas por quebra de linha, como o userMessage do agente", () => {
    expect(
      buildClassifierInput({ lastAgentMessage: null, userMessage: ["oi", "quero que você pare de me mandar mensagens"] })
    ).toBe("Última mensagem enviada ao lead: (nenhuma)\nMensagem do lead: oi\nquero que você pare de me mandar mensagens");
  });
});

/**
 * Trava determinística depois do classificador (lote-13 T12d, decisão D3). A
 * regra: "parar/para/pare/parem de [me/nos] mandar|enviar <objeto>" sem
 * menção ao contato em si (mensag, msg, contat, lista, descadastr, nada,
 * whatsapp) é pedido só de conteúdo; `explicita` vira `ambigua`. O corpus
 * versionado é a referência: nenhuma explícita pode cair.
 */
type CorpusItem = { id: string; faixa: string; texto: string };
const corpus = JSON.parse(readFileSync("n8n/fixtures/opt-out-corpus.json", "utf8")) as { itens: CorpusItem[] };

const CONTENT_ONLY_FORA = [
  "fora-01",
  "fora-04",
  "fora-08",
  "fora-11",
  "fora-22",
  "fora-23",
  "fora-24",
  "fora-25",
  "fora-27",
  "fora-29",
  "fora-30",
];

function corpusText(id: string): string {
  const item = corpus.itens.find((i) => i.id === id);
  if (item === undefined) throw new Error(`item ausente no corpus: ${id}`);
  return item.texto;
}

describe("refineOptOutCategory — corpus versionado (T12d)", () => {
  it("todas as frases `explicita` do corpus continuam `explicita`", () => {
    const explicitas = corpus.itens.filter((i) => i.faixa === "explicita");
    expect(explicitas.length).toBeGreaterThanOrEqual(20);
    const caidas = explicitas
      .filter((i) => refineOptOutCategory({ categoria: "explicita", userMessage: i.texto }) !== "explicita")
      .map((i) => i.id);
    expect(caidas).toEqual([]);
  });

  for (const id of CONTENT_ONLY_FORA) {
    it(`${id} ("${corpusText(id)}") classificada como explicita vira ambigua`, () => {
      expect(isContentOnlyStop(corpusText(id))).toBe(true);
      expect(refineOptOutCategory({ categoria: "explicita", userMessage: corpusText(id) })).toBe("ambigua");
    });
  }

  it("os dois falsos positivos da medição v3 viram ambigua", () => {
    expect(refineOptOutCategory({ categoria: "explicita", userMessage: "para de mandar casa, eu quero apartamento" })).toBe("ambigua");
    expect(refineOptOutCategory({ categoria: "explicita", userMessage: "para de mandar imóvel na zona norte" })).toBe("ambigua");
  });
});

describe("isContentOnlyStop — regra", () => {
  it("mensagem mista (conteúdo e mensagens) continua explicita", () => {
    const msg = "para de mandar foto e não me mande mais mensagens";
    expect(isContentOnlyStop(msg)).toBe(false);
    expect(refineOptOutCategory({ categoria: "explicita", userMessage: msg })).toBe("explicita");
  });

  for (const [texto, termo] of [
    ["para de me mandar msg", "msg"],
    ["pare de me mandar contato de corretor", "contat"],
    ["parem de me enviar coisa da lista", "lista"],
    ["para de mandar isso, quero me descadastrar", "descadastr"],
    ["para de mandar foto, não quero nada", "nada"],
    ["para de me mandar coisa no WhatsApp", "whatsapp"],
  ] as const) {
    it(`menção ao contato (${termo}) desliga a trava`, () => {
      expect(isContentOnlyStop(texto)).toBe(false);
    });
  }

  it("aceita as quatro formas do verbo e o pronome opcional", () => {
    for (const texto of [
      "parar de mandar foto",
      "para de mandar foto",
      "pare de mandar foto",
      "parem de mandar foto",
      "para de me mandar foto",
      "para de nos enviar foto",
    ]) {
      expect(isContentOnlyStop(texto)).toBe(true);
    }
  });

  it("ignora maiúsculas e acentos", () => {
    expect(isContentOnlyStop("PARA DE MANDAR ÁUDIO")).toBe(true);
    expect(isContentOnlyStop("para de mandar áudio, MENSAGENS também não")).toBe(false);
  });

  it("sem objeto depois do verbo não é pedido de conteúdo", () => {
    expect(isContentOnlyStop("pode parar de mandar")).toBe(false);
  });

  it("sem o padrão parar de mandar/enviar não é pedido de conteúdo", () => {
    expect(isContentOnlyStop("pode parar com as fotos por hoje")).toBe(false);
    expect(isContentOnlyStop("não me mande mais fotos")).toBe(false);
  });

  it("\"mensagem de voz\" é formato, não o contato em si", () => {
    expect(isContentOnlyStop("para de me mandar mensagem de voz, só texto")).toBe(true);
    expect(isContentOnlyStop("para de me mandar mensagem de voz e mensagens também")).toBe(false);
  });

  it("buffer (string[]) é unido por quebra de linha antes da regra", () => {
    expect(isContentOnlyStop(["oi", "para de mandar casa"])).toBe(true);
    expect(isContentOnlyStop(["para de mandar casa", "e não me mande mais mensagens"])).toBe(false);
    expect(refineOptOutCategory({ categoria: "explicita", userMessage: ["oi", "para de mandar casa"] })).toBe("ambigua");
  });

  it("string vazia: false", () => {
    expect(isContentOnlyStop("")).toBe(false);
  });

  it("ausente (undefined/null): false", () => {
    expect(isContentOnlyStop(undefined)).toBe(false);
    expect(isContentOnlyStop(null)).toBe(false);
  });
});

describe("refineOptOutCategory — só `explicita` é rebaixada", () => {
  for (const categoria of ["ambigua", "fora", "other", "erro"]) {
    it(`${categoria} passa inalterada, mesmo com pedido só de conteúdo`, () => {
      expect(refineOptOutCategory({ categoria, userMessage: "para de mandar casa" })).toBe(categoria);
    });
  }

  it("explicita com mensagem vazia continua explicita", () => {
    expect(refineOptOutCategory({ categoria: "explicita", userMessage: "" })).toBe("explicita");
  });

  it("explicita com mensagem ausente continua explicita", () => {
    expect(refineOptOutCategory({ categoria: "explicita" })).toBe("explicita");
  });
});
