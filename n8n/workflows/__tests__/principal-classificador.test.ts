import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import { classifierIdentity, type WorkflowJson as IdentityWorkflowJson } from "../../../scripts/opt-out-measurement";
import { buildClassifierInput } from "../../src/opt-out-intent.mjs";
import medicao from "../medicao-opt-out";
import principal from "../principal";

/**
 * Classificador de opt-out na rota `conversa` do `crivo-agente-principal`
 * (lote-13 T10 — OPTREG-01, OPTAMB-01, OPTSEG-01, OPTMED-01).
 *
 * Saídas do Text Classifier v1.1 (T2): 0 fora, 1 ambigua, 2 explicita,
 * 3 other, 4 erro. `fora`, `other` e erro seguem para o agente como hoje
 * (OPTREG-01 AC8); `ambigua` liga a instrução de pergunta (OPTAMB-01 AC1).
 * Um teste por aresta (L-026).
 */

type Connection = { node: string; type: string; index: number };
type WorkflowJson = {
  nodes: { name: string; type: string; typeVersion: number; onError?: string; parameters: Record<string, unknown> }[];
  connections: Record<string, Record<string, (Connection[] | null)[]>>;
};

const workflow = principal.toJSON() as unknown as WorkflowJson;
const INTENT_SOURCE = readFileSync("n8n/src/opt-out-intent.mjs", "utf8");

const MEMORY_READY = "Code: memória pronta";
const INPUT = "Code: entrada do classificador";
const CLASSIFIER = "Classificador: opt-out";
const CLASSIFIER_MODEL = "OpenAI Chat Model (classificador)";
const ROUTE_FORA = "Code: rota fora";
const ROUTE_AMBIGUA = "Code: rota ambígua";
const SYSTEM_MESSAGE = "Code: montar system message e marcar campo perguntado";
const NEW_NODES = [INPUT, CLASSIFIER, CLASSIFIER_MODEL, ROUTE_FORA, ROUTE_AMBIGUA];

function nodeByName(name: string) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

function mainTargets(source: string, output: number): Connection[] {
  return workflow.connections[source]?.main?.[output] ?? [];
}

function runCode(name: string, $: (node: string) => unknown) {
  const code = String(nodeByName(name).parameters.jsCode).replace(
    /__INLINE\(([a-zA-Z0-9_.-]+)\)__/g,
    (_m, file: string) => readInlinedModule(file)
  );
  return new Function("$", code)($) as { json: Record<string, unknown> }[];
}

describe("paridade com a medição (OPTMED-01 AC4, AC8)", () => {
  it("a identidade do classificador do agente é igual à do workflow de medição", () => {
    const doAgente = classifierIdentity(principal.toJSON() as unknown as IdentityWorkflowJson, INTENT_SOURCE);
    const daMedicao = classifierIdentity(medicao.toJSON() as unknown as IdentityWorkflowJson, INTENT_SOURCE);
    expect(doAgente).toBe(daMedicao);
  });

  it("o classificador do agente usa o mesmo snapshot do nó `OpenAI Chat Model` do agente", () => {
    const agente = nodeByName("OpenAI Chat Model").parameters.model as { value: string };
    const classificador = nodeByName(CLASSIFIER_MODEL).parameters.model as { value: string };
    expect(classificador.value).toBe(agente.value);
    expect(classificador.value).toBe("gpt-5.4-nano-2026-03-17");
  });

  it("o classificador tem saída de erro própria (`continueErrorOutput`)", () => {
    expect(nodeByName(CLASSIFIER).onError).toBe("continueErrorOutput");
  });
});

describe("arestas da rota conversa (L-026)", () => {
  it("memória pronta → entrada do classificador, e não mais direto ao system message", () => {
    expect(mainTargets(MEMORY_READY, 0)).toEqual([{ node: INPUT, type: "main", index: 0 }]);
  });

  it("entrada do classificador → classificador", () => {
    expect(mainTargets(INPUT, 0)).toEqual([{ node: CLASSIFIER, type: "main", index: 0 }]);
  });

  it("modelo do classificador → classificador por `ai_languageModel`", () => {
    expect(workflow.connections[CLASSIFIER_MODEL]?.ai_languageModel?.[0]).toEqual([
      { node: CLASSIFIER, type: "ai_languageModel", index: 0 },
    ]);
  });

  it("saída 0 (fora) → Code: rota fora", () => {
    expect(mainTargets(CLASSIFIER, 0)).toEqual([{ node: ROUTE_FORA, type: "main", index: 0 }]);
  });

  it("saída 1 (ambigua) → Code: rota ambígua, e só ela", () => {
    expect(mainTargets(CLASSIFIER, 1)).toEqual([{ node: ROUTE_AMBIGUA, type: "main", index: 0 }]);
  });

  it("saída 3 (other, categoria não reconhecida) → Code: rota fora (OPTREG-01 AC8)", () => {
    expect(mainTargets(CLASSIFIER, 3)).toEqual([{ node: ROUTE_FORA, type: "main", index: 0 }]);
  });

  it("saída 4 (erro ou timeout) → Code: rota fora (OPTREG-01 AC8)", () => {
    expect(mainTargets(CLASSIFIER, 4)).toEqual([{ node: ROUTE_FORA, type: "main", index: 0 }]);
  });

  it("Code: rota fora → system message", () => {
    expect(mainTargets(ROUTE_FORA, 0)).toEqual([{ node: SYSTEM_MESSAGE, type: "main", index: 0 }]);
  });

  it("Code: rota ambígua → system message", () => {
    expect(mainTargets(ROUTE_AMBIGUA, 0)).toEqual([{ node: SYSTEM_MESSAGE, type: "main", index: 0 }]);
  });
});

describe("a rota liga a instrução ambígua só no turno ambíguo (OPTAMB-01 AC1, OPTSEG-01 AC2)", () => {
  it("Code: rota ambígua emite `optOutAmbiguo: true`", () => {
    expect(runCode(ROUTE_AMBIGUA, () => undefined)).toEqual([{ json: { optOutAmbiguo: true } }]);
  });

  it("Code: rota fora emite `optOutAmbiguo: false`", () => {
    expect(runCode(ROUTE_FORA, () => undefined)).toEqual([{ json: { optOutAmbiguo: false } }]);
  });

  it("o system message recebe `optOutAmbiguo: $json.optOutAmbiguo === true`", () => {
    expect(String(nodeByName(SYSTEM_MESSAGE).parameters.jsCode)).toContain("optOutAmbiguo: $json.optOutAmbiguo === true");
  });
});

describe("entrada do classificador (OPTREG-01 AC2)", () => {
  const loadedComAgente = { messages: [{ human: "oi" }, { ai: "Qual região você procura?", human: "centro" }], messagesCount: 2 };
  const seeded = [{ type: "user", message: "oi", nadaParaSemear: false }, { type: "ai", message: "Fala da semeadura", nadaParaSemear: false }];
  const buffer = [{ text: "não me mande" }, { text: "mais mensagens" }];

  function fake({ loaded, seedExecuted }: { loaded: unknown; seedExecuted: boolean }) {
    return (name: string) => {
      if (name === "Chat Memory Manager: carregar sessão") return { first: () => ({ json: loaded }) };
      if (name === "Code: selecionar mensagens de semeadura") {
        return {
          isExecuted: seedExecuted,
          all: () => {
            if (!seedExecuted) throw new Error("nó não executado");
            return seeded.map((json) => ({ json }));
          },
        };
      }
      if (name === "Code: contexto do lead") return { first: () => ({ json: { bufferArray: buffer } }) };
      throw new Error(`nó inesperado: ${name}`);
    };
  }

  it("sessão carregada: última fala do agente + buffer do turno unido por quebra de linha", () => {
    const [{ json }] = runCode(INPUT, fake({ loaded: loadedComAgente, seedExecuted: false }));
    expect(json).toEqual({
      classifierInput: buildClassifierInput({ lastAgentMessage: "Qual região você procura?", userMessage: "não me mande\nmais mensagens" }),
    });
  });

  it("carga vazia com semeadura executada: usa a última fala semeada", () => {
    const [{ json }] = runCode(INPUT, fake({ loaded: { messages: [], messagesCount: 0 }, seedExecuted: true }));
    expect(json.classifierInput).toBe(
      "Última mensagem enviada ao lead: Fala da semeadura\nMensagem do lead: não me mande\nmais mensagens"
    );
  });

  it("carga vazia sem semeadura executada: `(nenhuma)`, sem ler a semeadura", () => {
    const [{ json }] = runCode(INPUT, fake({ loaded: { messages: [], messagesCount: 0 }, seedExecuted: false }));
    expect(json.classifierInput).toBe("Última mensagem enviada ao lead: (nenhuma)\nMensagem do lead: não me mande\nmais mensagens");
  });

  it("o texto do lead vem do mesmo buffer que o agente recebe", () => {
    const smCode = String(nodeByName(SYSTEM_MESSAGE).parameters.jsCode);
    const inCode = String(nodeByName(INPUT).parameters.jsCode);
    expect(smCode).toContain("$('Code: contexto do lead').first().json.bufferArray");
    expect(inCode).toContain("$('Code: contexto do lead').first().json.bufferArray");
  });

  it("o classificador lê só a entrada montada", () => {
    expect(nodeByName(CLASSIFIER).parameters.inputText).toBe("={{ $json.classifierInput }}");
  });

  it("nenhum nó novo tem parâmetro vindo do modelo (`$fromAI`)", () => {
    for (const name of NEW_NODES) {
      expect(JSON.stringify(nodeByName(name).parameters)).not.toMatch(/fromAI/i);
    }
  });

  it("nenhum nó novo lê lead ou tenant (id, tenantSlug, waId)", () => {
    for (const name of NEW_NODES) {
      expect(JSON.stringify(nodeByName(name).parameters)).not.toMatch(/tenantSlug|waId|\.json\.id\b/);
    }
  });
});
