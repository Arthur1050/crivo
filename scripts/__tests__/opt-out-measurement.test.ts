import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertApprovedIdentity, classifierIdentity, latestApprovedMeasurement, stampReport, type WorkflowJson } from "../opt-out-measurement";

/**
 * Identidade do classificador de opt-out (lote-13 T7 — OPTMED-01 AC8). O
 * workflow abaixo tem o formato de `toJSON()` do SDK. O nó de modelo do
 * AGENTE vem primeiro de propósito: a identidade tem de achar o modelo do
 * classificador pela aresta `ai_languageModel`, não pela ordem dos nós.
 */
const LM = "@n8n/n8n-nodes-langchain.lmChatOpenAi";
const INTENT_SOURCE = 'export const OPT_OUT_CONFIRMATION =\n  "Pronto.";\n';

function workflow(): WorkflowJson {
  return {
    nodes: [
      {
        id: "a1",
        name: "OpenAI Chat Model",
        type: LM,
        typeVersion: 1.3,
        position: [0, 0],
        parameters: { model: { __rl: true, mode: "list", value: "gpt-agente", cachedResultName: "gpt-agente" }, options: { reasoningEffort: "low", timeout: 120000 } },
      },
      { id: "a2", name: "AI Agent", type: "@n8n/n8n-nodes-langchain.agent", typeVersion: 3, position: [200, 0], parameters: {} },
      {
        id: "c1",
        name: "Classificador: opt-out",
        type: "@n8n/n8n-nodes-langchain.textClassifier",
        typeVersion: 1.1,
        position: [400, 0],
        onError: "continueErrorOutput",
        parameters: {
          inputText: "={{ $json.classifierInput }}",
          categories: {
            categories: [
              { category: "fora", description: "Não pede para parar." },
              { category: "ambigua", description: "Desinteresse geral." },
              { category: "explicita", description: "Pede para parar." },
            ],
          },
          options: { multiClass: false, fallback: "other", systemPromptTemplate: "Classifique: {categories}.", enableAutoFixing: true },
        },
      },
      {
        id: "c2",
        name: "OpenAI Chat Model (classificador)",
        type: LM,
        typeVersion: 1.3,
        position: [400, 200],
        parameters: {
          model: { __rl: true, mode: "list", value: "gpt-5.4-nano-2026-03-17", cachedResultName: "gpt-5.4-nano-2026-03-17" },
          options: { reasoningEffort: "low", timeout: 20000 },
        },
      },
    ],
    connections: {
      "OpenAI Chat Model": { ai_languageModel: [[{ node: "AI Agent", type: "ai_languageModel", index: 0 }]] },
      "OpenAI Chat Model (classificador)": { ai_languageModel: [[{ node: "Classificador: opt-out", type: "ai_languageModel", index: 0 }]] },
    },
  };
}

type Category = { category: string; description: string };
type ClassifierNode = {
  id?: string;
  position?: unknown;
  onError?: string;
  parameters: { inputText: string; categories: { categories: Category[] }; options: Record<string, unknown> };
};
type ModelNode = { id?: string; position?: unknown; parameters: { model: { value: string }; options: Record<string, unknown> } };

function node(json: WorkflowJson, name: string) {
  const found = json.nodes.find((n) => n.name === name);
  if (!found) throw new Error(name);
  return found;
}

function mutated(change: (json: WorkflowJson) => void, intentSource = INTENT_SOURCE) {
  const json = workflow();
  change(json);
  return classifierIdentity(json, intentSource);
}

const BASE = classifierIdentity(workflow(), INTENT_SOURCE);
const classifier = (json: WorkflowJson) => node(json, "Classificador: opt-out") as unknown as ClassifierNode;
const model = (json: WorkflowJson) => node(json, "OpenAI Chat Model (classificador)") as unknown as ModelNode;

describe("classifierIdentity — estabilidade", () => {
  it("é um sha256 hex", () => {
    expect(BASE).toMatch(/^[0-9a-f]{64}$/);
  });

  it("o mesmo para o fonte de opt-out-intent.mjs com CRLF e com LF", () => {
    expect(classifierIdentity(workflow(), INTENT_SOURCE.replace(/\n/g, "\r\n"))).toBe(BASE);
  });

  it("não muda com a posição dos nós no canvas", () => {
    expect(
      mutated((json) => {
        classifier(json).position = [9999, 9999];
        model(json).position = [-1, -1];
      })
    ).toBe(BASE);
  });

  it("não muda com o id dos nós", () => {
    expect(
      mutated((json) => {
        classifier(json).id = "outro";
        model(json).id = "outro-modelo";
      })
    ).toBe(BASE);
  });

  it("não muda com a ordem das chaves dos parâmetros (paridade entre workflows)", () => {
    expect(
      mutated((json) => {
        const { options, categories, inputText } = classifier(json).parameters;
        const reversed = <T extends object>(obj: T) => Object.fromEntries(Object.entries(obj).reverse()) as T;
        classifier(json).parameters = {
          options: reversed(options),
          categories: { categories: categories.categories.map(reversed) },
          inputText,
        };
      })
    ).toBe(BASE);
  });

  it("não muda quando muda o modelo do AGENTE: o nó de modelo vem da aresta ai_languageModel", () => {
    expect(mutated((json) => ((node(json, "OpenAI Chat Model") as unknown as ModelNode).parameters.model.value = "gpt-outro"))).toBe(BASE);
  });
});

describe("classifierIdentity — muda quando muda cada componente (OPTMED-01 AC8)", () => {
  it("uma categoria", () => {
    expect(mutated((json) => (classifier(json).parameters.categories.categories[0].category = "nenhuma"))).not.toBe(BASE);
  });

  it("a ordem das categorias (define o índice de saída)", () => {
    expect(mutated((json) => classifier(json).parameters.categories.categories.reverse())).not.toBe(BASE);
  });

  it("uma descrição", () => {
    expect(mutated((json) => (classifier(json).parameters.categories.categories[2].description = "Pede para parar já."))).not.toBe(BASE);
  });

  it("o systemPromptTemplate", () => {
    expect(mutated((json) => (classifier(json).parameters.options.systemPromptTemplate = "Classifique já: {categories}."))).not.toBe(BASE);
  });

  it("o inputText (formato de entrada)", () => {
    expect(mutated((json) => (classifier(json).parameters.inputText = "={{ $json.outro }}"))).not.toBe(BASE);
  });

  it("o fallback", () => {
    expect(mutated((json) => (classifier(json).parameters.options.fallback = "discard"))).not.toBe(BASE);
  });

  it("o multiClass", () => {
    expect(mutated((json) => (classifier(json).parameters.options.multiClass = true))).not.toBe(BASE);
  });

  it("o enableAutoFixing", () => {
    expect(mutated((json) => (classifier(json).parameters.options.enableAutoFixing = false))).not.toBe(BASE);
  });

  it("o onError do classificador", () => {
    expect(mutated((json) => (classifier(json).onError = "stopWorkflow"))).not.toBe(BASE);
  });

  it("o modelo do nó de modelo do classificador", () => {
    expect(mutated((json) => (model(json).parameters.model.value = "gpt-5.4-mini"))).not.toBe(BASE);
  });

  it("as options do nó de modelo do classificador", () => {
    expect(mutated((json) => (model(json).parameters.options.timeout = 30000))).not.toBe(BASE);
  });

  it("o fonte de opt-out-intent.mjs", () => {
    expect(classifierIdentity(workflow(), `${INTENT_SOURCE}// mudança\n`)).not.toBe(BASE);
  });
});

describe("classifierIdentity — recusa, nunca identidade vazia", () => {
  it("sem nó Classificador: opt-out, lança erro", () => {
    const json = workflow();
    json.nodes = json.nodes.filter((n) => n.name !== "Classificador: opt-out");
    expect(() => classifierIdentity(json, INTENT_SOURCE)).toThrow(/Classificador: opt-out/);
  });

  it("sem aresta ai_languageModel para o classificador, lança erro", () => {
    const json = workflow();
    delete json.connections["OpenAI Chat Model (classificador)"];
    expect(() => classifierIdentity(json, INTENT_SOURCE)).toThrow(/modelo/i);
  });
});

describe("stampReport", () => {
  it("grava classifierHash, modelId e date sem apagar o que o workflow devolveu", () => {
    const report = { porFrase: [], falsosPositivos: 0, taxaExplicita: 1, veredito: "APROVADO" };
    expect(stampReport(report, { classifierHash: BASE, modelId: "gpt-5.4-nano-2026-03-17", date: "2026-09-28T12:00:00.000Z" })).toEqual({
      ...report,
      classifierHash: BASE,
      modelId: "gpt-5.4-nano-2026-03-17",
      date: "2026-09-28T12:00:00.000Z",
    });
  });
});

describe("trava de publicação na medição aprovada (OPTMED-01 AC8, T13)", () => {
  function dirWith(reports: Record<string, object>) {
    const dir = mkdtempSync(join(tmpdir(), "medicao-"));
    for (const [name, body] of Object.entries(reports)) writeFileSync(join(dir, name), JSON.stringify(body));
    return dir;
  }

  it("sem nenhum relatório, falha dizendo para rodar a medição", () => {
    expect(() => assertApprovedIdentity("h1", [dirWith({})])).toThrow(/rode o crivo-medicao-opt-out/);
  });

  it("só com relatório REPROVADO, falha do mesmo jeito", () => {
    const dir = dirWith({ "medicao-opt-out-a.json": { veredito: "REPROVADO", classifierHash: "h1", date: "2026-09-29T00:00:00Z" } });
    expect(() => assertApprovedIdentity("h1", [dir])).toThrow(/rode o crivo-medicao-opt-out/);
  });

  it("com relatório APROVADO do mesmo hash, passa e devolve o relatório", () => {
    const dir = dirWith({ "medicao-opt-out-a.json": { veredito: "APROVADO", classifierHash: "h1", date: "2026-09-29T00:00:00Z" } });
    expect(assertApprovedIdentity("h1", [dir]).classifierHash).toBe("h1");
  });

  it("com hash diferente do aprovado, falha dizendo para medir de novo", () => {
    const dir = dirWith({ "medicao-opt-out-a.json": { veredito: "APROVADO", classifierHash: "h1", date: "2026-09-29T00:00:00Z" } });
    expect(() => assertApprovedIdentity("h2", [dir])).toThrow(/rode a medição de novo/);
  });

  it("vale o APROVADO de data mais recente, em qualquer dos diretórios", () => {
    const a = dirWith({ "medicao-opt-out-velho.json": { veredito: "APROVADO", classifierHash: "velho", date: "2026-09-28T00:00:00Z" } });
    const b = dirWith({ "medicao-opt-out-novo.json": { veredito: "APROVADO", classifierHash: "novo", date: "2026-09-29T00:00:00Z" } });
    expect(latestApprovedMeasurement([a, b])?.classifierHash).toBe("novo");
  });

  it("ignora diretório inexistente e arquivos que não são relatório de medição", () => {
    const dir = dirWith({ "outro.json": { veredito: "APROVADO", classifierHash: "x", date: "2026-09-29T00:00:00Z" } });
    expect(latestApprovedMeasurement([dir, join(dir, "nao-existe")])).toBeNull();
  });
});
