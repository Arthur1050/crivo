import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import medicao from "../medicao-opt-out";

/**
 * Workflow de medição do classificador de opt-out (lote-13 T9 — OPTMED-01
 * AC4, AC5). Mede só o classificador: nenhum CRM, WhatsApp ou memória. Cada
 * uma das 5 saídas do Text Classifier v1.1 (0 fora, 1 ambigua, 2 explicita,
 * 3 other, 4 erro — confirmadas na T2) tem de chegar ao Merge, uma aresta por
 * teste (L-026); a saída de erro vai pelo índice 4, nunca por `.onError()`,
 * que ligaria o erro à saída 1 (`ambigua`).
 */

type Connection = { node: string; type: string; index: number };
type WorkflowJson = {
  nodes: {
    name: string;
    type: string;
    typeVersion: number;
    onError?: string;
    parameters: Record<string, unknown>;
  }[];
  connections: Record<string, Record<string, (Connection[] | null)[]>>;
};

const workflow = medicao.toJSON() as unknown as WorkflowJson;

const CLASSIFIER = "Classificador: opt-out";
const MODEL = "OpenAI Chat Model (classificador)";
const MERGE = "Merge: execuções";

function nodeByName(name: string) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

function mainTargets(source: string, output: number): Connection[] {
  return workflow.connections[source]?.main?.[output] ?? [];
}

/** Roda o `jsCode` de um Code node com os módulos inlined e `$`/`$input` falsos. */
function runCode(name: string, globals: { $?: (node: string) => unknown; $input?: unknown }) {
  const code = String(nodeByName(name).parameters.jsCode).replace(
    /__INLINE\(([a-zA-Z0-9_.-]+)\)__/g,
    (_m, file: string) => readInlinedModule(file)
  );
  return new Function("$", "$input", code)(globals.$, globals.$input) as { json: Record<string, unknown> }[];
}

describe("isolamento: só o classificador é medido (OPTMED-01 AC4)", () => {
  it("nenhum nó HTTP (nenhuma chamada ao CRM)", () => {
    expect(workflow.nodes.filter((n) => /httpRequest/i.test(n.type))).toEqual([]);
  });

  it("nenhum nó WhatsApp", () => {
    expect(workflow.nodes.filter((n) => /whatsApp/i.test(n.type))).toEqual([]);
  });

  it("nenhuma memória (Postgres ou outra)", () => {
    expect(workflow.nodes.filter((n) => /memory/i.test(n.type))).toEqual([]);
  });
});

describe("classificador e modelo com os parâmetros congelados na T2 (OPTMED-01 AC4)", () => {
  it("o classificador é textClassifier v1.1 com saída de erro própria", () => {
    const node = nodeByName(CLASSIFIER);
    expect(node.type).toBe("@n8n/n8n-nodes-langchain.textClassifier");
    expect(node.typeVersion).toBe(1.1);
    expect(node.onError).toBe("continueErrorOutput");
  });

  it("lê a entrada montada por `buildClassifierInput`", () => {
    expect(nodeByName(CLASSIFIER).parameters.inputText).toBe("={{ $json.classifierInput }}");
  });

  it("categorias fora, ambigua, explicita, nesta ordem, com as descrições do design", () => {
    const { categories } = nodeByName(CLASSIFIER).parameters.categories as {
      categories: { category: string; description: string }[];
    };
    expect(categories).toEqual([
      {
        category: "fora",
        description:
          'A mensagem não pede para parar de receber mensagens nem para encerrar o contato. Inclui desinteresse num imóvel específico, pedido para parar de mandar só um tipo de conteúdo ou mudar o formato (fotos, áudios, links, um tipo de imóvel), e usos de "parar" ou "sair" que se referem a outra coisa (o aluguel atual, o apartamento, a enrolação). Também vale para uma resposta negativa quando a última mensagem enviada perguntou se o lead quer parar de receber mensagens.',
      },
      {
        category: "ambigua",
        description:
          'Desinteresse geral sem pedido de parar de receber mensagens (por exemplo, "não tenho interesse, obrigado"), ou aviso de número errado ou pessoa errada. Também vale para uma resposta ambígua quando a última mensagem enviada perguntou se o lead quer parar de receber mensagens.',
      },
      {
        category: "explicita",
        description:
          "O lead pede para parar de receber mensagens desta imobiliária como um todo: parar de receber mensagens, não ser mais contatado, sair da lista ou não mandarem mais nada. Também vale para uma resposta afirmativa quando a última mensagem enviada perguntou se ele quer parar de receber mensagens. Não vale quando o que deve parar é só um tipo de conteúdo ou formato.",
      },
    ]);
  });

  it("options: classe única, fallback `other`, template congelado e auto-fix ligado", () => {
    expect(nodeByName(CLASSIFIER).parameters.options).toEqual({
      multiClass: false,
      fallback: "other",
      systemPromptTemplate:
        'Você classifica a mensagem de um lead de imobiliária no WhatsApp quanto a um pedido para parar de receber mensagens. Classifique o texto do usuário em uma destas categorias: {categories}. Use a última mensagem enviada ao lead só para entender respostas curtas, como "sim" ou "não". "Parar de mandar" seguido de um tipo de conteúdo ou formato é fora; só é explicita quando o lead quer parar de receber as mensagens ou o contato em si. Regra de desempate: na dúvida entre explicita e ambigua, escolha ambigua; na dúvida entre ambigua e fora, escolha fora. Não explique e responda somente o JSON, seguindo as instruções de formato abaixo.',
      enableAutoFixing: true,
    });
  });

  it("o modelo é `gpt-5.4-nano-2026-03-17` com `reasoningEffort: low` e timeout de 20 s", () => {
    const node = nodeByName(MODEL);
    expect(node.type).toBe("@n8n/n8n-nodes-langchain.lmChatOpenAi");
    expect(node.typeVersion).toBe(1.3);
    expect(node.parameters.model).toEqual({
      __rl: true,
      mode: "list",
      value: "gpt-5.4-nano-2026-03-17",
      cachedResultName: "gpt-5.4-nano-2026-03-17",
    });
    expect(node.parameters.options).toEqual({ reasoningEffort: "low", timeout: 20000 });
  });

  it("o modelo está ligado ao classificador por `ai_languageModel`", () => {
    expect(workflow.connections[MODEL]?.ai_languageModel?.[0]).toEqual([
      { node: CLASSIFIER, type: "ai_languageModel", index: 0 },
    ]);
  });
});

describe("cada saída do classificador chega ao Merge (L-026)", () => {
  const SAIDAS = [
    { indice: 0, categoria: "fora", marcador: "Code: marcar fora" },
    { indice: 1, categoria: "ambigua", marcador: "Code: marcar ambigua" },
    { indice: 2, categoria: "explicita", marcador: "Code: marcar explicita" },
    { indice: 3, categoria: "other", marcador: "Code: marcar other" },
    { indice: 4, categoria: "erro", marcador: "Code: marcar erro" },
  ];

  for (const { indice, categoria, marcador } of SAIDAS) {
    it(`saída ${indice} (${categoria}) → ${marcador}, e só ele`, () => {
      expect(mainTargets(CLASSIFIER, indice)).toEqual([{ node: marcador, type: "main", index: 0 }]);
    });

    it(`${marcador} → entrada ${indice} do Merge`, () => {
      expect(mainTargets(marcador, 0)).toEqual([{ node: MERGE, type: "main", index: indice }]);
    });

    it(`${marcador} grava a categoria literal \`${categoria}\` e preserva id, faixa e repetição`, () => {
      const out = runCode(marcador, {
        $input: { all: () => [{ json: { id: "exp-01", faixa: "explicita", repeticao: 2, classifierInput: "x", error: "e" } }] },
      });
      expect(out).toEqual([{ json: { id: "exp-01", faixa: "explicita", repeticao: 2, categoria } }]);
    });
  }

  it("o classificador tem exatamente 5 saídas ligadas", () => {
    expect(workflow.connections[CLASSIFIER]?.main).toHaveLength(5);
  });

  it("o Merge concatena as 5 entradas (append)", () => {
    expect(nodeByName(MERGE).parameters).toEqual({ mode: "append", numberInputs: 5 });
  });

  it("Merge → Code: pontuar, último nó (a resposta do webhook é o relatório)", () => {
    expect(mainTargets(MERGE, 0)).toEqual([{ node: "Code: pontuar", type: "main", index: 0 }]);
    expect(workflow.connections["Code: pontuar"]).toBeUndefined();
    expect(nodeByName("Webhook: rodar medição").parameters.responseMode).toBe("lastNode");
  });
});

describe("expansão do corpus (OPTMED-01 AC5)", () => {
  const corpus = {
    abertura: "Abertura fixa.",
    itens: [
      { id: "exp-01", faixa: "explicita", texto: "não me mande mais mensagens" },
      { id: "fora-19", faixa: "fora", texto: "não", ultimaMensagem: "Quer parar de receber mensagens?" },
    ],
  };
  const webhook = (body: unknown) => (name: string) => {
    if (name !== "Webhook: rodar medição") throw new Error(`nó inesperado: ${name}`);
    return { first: () => ({ json: { body } }) };
  };

  it("sem `repeticoes`, gera 3 execuções por item, com id, faixa e repetição", () => {
    const out = runCode("Code: expandir corpus", { $: webhook({ corpus }) });
    expect(out.map((i) => [i.json.id, i.json.faixa, i.json.repeticao])).toEqual([
      ["exp-01", "explicita", 1],
      ["exp-01", "explicita", 2],
      ["exp-01", "explicita", 3],
      ["fora-19", "fora", 1],
      ["fora-19", "fora", 2],
      ["fora-19", "fora", 3],
    ]);
  });

  it("usa a abertura quando o item não define `ultimaMensagem`", () => {
    const out = runCode("Code: expandir corpus", { $: webhook({ corpus }) });
    expect(out[0].json.classifierInput).toBe(
      "Última mensagem enviada ao lead: Abertura fixa.\nMensagem do lead: não me mande mais mensagens"
    );
  });

  it("usa a `ultimaMensagem` do item quando definida", () => {
    const out = runCode("Code: expandir corpus", { $: webhook({ corpus }) });
    expect(out[3].json.classifierInput).toBe(
      "Última mensagem enviada ao lead: Quer parar de receber mensagens?\nMensagem do lead: não"
    );
  });

  it("respeita `repeticoes` do corpo", () => {
    const out = runCode("Code: expandir corpus", { $: webhook({ corpus, repeticoes: 1 }) });
    expect(out).toHaveLength(2);
  });

  it("recusa corpo sem itens, com mensagem que diz o que enviar", () => {
    expect(() => runCode("Code: expandir corpus", { $: webhook({}) })).toThrow(/opt-out-corpus\.json/);
  });

  it("o corpus versionado inteiro vira 3 execuções por item", () => {
    const real = JSON.parse(readFileSync("n8n/fixtures/opt-out-corpus.json", "utf8")) as { itens: unknown[] };
    const out = runCode("Code: expandir corpus", { $: webhook({ corpus: real }) });
    expect(out).toHaveLength(real.itens.length * 3);
  });
});

describe("pontuação (OPTMED-01 AC5, AC6)", () => {
  it("devolve o relatório de `scoreMeasurement` com repetições, execuções e contagem por categoria", () => {
    const linhas = [
      { id: "exp-01", faixa: "explicita", repeticao: 1, categoria: "explicita" },
      { id: "exp-01", faixa: "explicita", repeticao: 2, categoria: "erro" },
      { id: "fora-01", faixa: "fora", repeticao: 1, categoria: "other" },
    ];
    const $ = (name: string) => {
      if (name !== "Code: expandir corpus") throw new Error(`nó inesperado: ${name}`);
      return { first: () => ({ json: { repeticoes: 2 } }) };
    };
    const [{ json }] = runCode("Code: pontuar", { $, $input: { all: () => linhas.map((json) => ({ json })) } });

    expect(json.veredito).toBe("REPROVADO");
    expect(json.falsosPositivos).toBe(0);
    expect(json.taxaExplicita).toBe(0.5);
    expect(json.porFrase).toEqual([
      { id: "exp-01", faixa: "explicita", explicita: 1, ambigua: 0, fora: 1 },
      { id: "fora-01", faixa: "fora", explicita: 0, ambigua: 0, fora: 1 },
    ]);
    expect(json.repeticoes).toBe(2);
    expect(json.execucoes).toBe(3);
    expect(json.categorias).toEqual({ explicita: 1, erro: 1, other: 1 });
  });
});
