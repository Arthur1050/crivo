import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import principal from "../principal";

/**
 * Lote-13b (SAIR-01, SAIR-02, SAIR-03): o principal não tem classificador de
 * opt-out. O turno de conversa chama só o modelo do agente; o opt-out nasce
 * exclusivamente do ramo da palavra exata `sair` (gate).
 */

type Connection = { node: string; type: string; index: number };
type WorkflowJson = {
  nodes: {
    name: string;
    type: string;
    onError?: string;
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;
    parameters: Record<string, unknown>;
  }[];
  connections: Record<string, Record<string, (Connection[] | null)[]>>;
};

const workflow = principal.toJSON() as unknown as WorkflowJson;

const MEMORY_READY = "Code: memória pronta";
const SYSTEM_MESSAGE = "Code: montar system message e marcar campo perguntado";
const SWITCH = "Switch: rota (gate)";
const POST_OPT_OUT = "HTTP: POST /leads/{id}/opt-out";
const FINALIZE_OPT_OUT = "Code: finalizar opt-out";
const PURGE_MEMORY = "Chat Memory Manager: purgar memória (opt-out)";
const PURGE_STATE = "Data Table: purgar qualificação e persona (opt-out)";
const RESTORE_PAYLOAD = "Code: restaurar payload do opt-out";
const FIXED_RECIPIENT = "Code: destinatário do envio fixo";

function mainTargets(source: string, output: number): Connection[] {
  return workflow.connections[source]?.main?.[output] ?? [];
}

function predecessors(target: string): string[] {
  const found: string[] = [];
  for (const [source, byType] of Object.entries(workflow.connections)) {
    for (const outputs of Object.values(byType)) {
      for (const list of outputs) {
        if ((list ?? []).some((c) => c.node === target)) found.push(source);
      }
    }
  }
  return found.sort();
}

describe("principal sem classificador (SAIR-01)", () => {
  it("não tem nenhum nó textClassifier", () => {
    expect(workflow.nodes.filter((n) => n.type === "@n8n/n8n-nodes-langchain.textClassifier")).toEqual([]);
  });

  it("tem um único nó de modelo de chat, o do agente", () => {
    const models = workflow.nodes.filter((n) => n.type === "@n8n/n8n-nodes-langchain.lmChatOpenAi");
    expect(models.map((n) => n.name)).toEqual(["OpenAI Chat Model"]);
    expect(workflow.connections["OpenAI Chat Model"]?.ai_languageModel?.[0]).toEqual([
      { node: "AI Agent", type: "ai_languageModel", index: 0 },
    ]);
  });

  it("não sobrou nó do classificador nem do opt-out em linguagem natural", () => {
    const removed = [
      "Code: entrada do classificador",
      "OpenAI Chat Model (classificador)",
      "Classificador: opt-out",
      "Code: rota fora",
      "Code: conferir pedido explícito",
      "Pedido explícito confirmado?",
      "HTTP: POST /leads/{id}/opt-out (linguagem natural)",
      "Code: orientar sair (falha do registro)",
    ];
    const names = workflow.nodes.map((n) => n.name);
    expect(removed.filter((name) => names.includes(name))).toEqual([]);
  });

  it("o checkpoint de memória liga direto ao system message do agente, e só a ele", () => {
    expect(mainTargets(MEMORY_READY, 0)).toEqual([{ node: SYSTEM_MESSAGE, type: "main", index: 0 }]);
  });

  it("o system message do agente tem o checkpoint como único predecessor", () => {
    expect(predecessors(SYSTEM_MESSAGE)).toEqual([MEMORY_READY]);
  });
});

describe("ramo da palavra-chave inalterado (SAIR-02 AC1)", () => {
  it("o caso 0 do gate vai ao POST /opt-out, e só a ele", () => {
    expect(mainTargets(SWITCH, 0)).toEqual([{ node: POST_OPT_OUT, type: "main", index: 0 }]);
  });

  it("POST → confirmação → purga de memória → purga de estado → restaurar payload → envio fixo", () => {
    expect(mainTargets(POST_OPT_OUT, 0)).toEqual([{ node: FINALIZE_OPT_OUT, type: "main", index: 0 }]);
    expect(mainTargets(FINALIZE_OPT_OUT, 0)).toEqual([{ node: PURGE_MEMORY, type: "main", index: 0 }]);
    expect(mainTargets(PURGE_MEMORY, 0)).toEqual([{ node: PURGE_STATE, type: "main", index: 0 }]);
    expect(mainTargets(PURGE_STATE, 0)).toEqual([{ node: RESTORE_PAYLOAD, type: "main", index: 0 }]);
    expect(mainTargets(RESTORE_PAYLOAD, 0)).toEqual([{ node: FIXED_RECIPIENT, type: "main", index: 0 }]);
  });

  it("o POST /opt-out tem o switch do gate como único predecessor (nenhum caminho natural)", () => {
    expect(predecessors(POST_OPT_OUT)).toEqual([SWITCH]);
  });

  it("falha do CRM segue o tratamento atual: 3 tentativas, 2 s de intervalo e sem saída de erro própria", () => {
    const node = workflow.nodes.find((n) => n.name === POST_OPT_OUT);
    expect(node?.retryOnFail).toBe(true);
    expect(node?.maxTries).toBe(3);
    expect(node?.waitBetweenTries).toBe(2000);
    expect(node?.onError).toBeUndefined();
    expect(workflow.connections[POST_OPT_OUT]?.main).toEqual([[{ node: FINALIZE_OPT_OUT, type: "main", index: 0 }]]);
  });

  it("o POST usa o lead e o tenant do gate, nunca do modelo", () => {
    const node = workflow.nodes.find((n) => n.name === POST_OPT_OUT);
    expect(node?.parameters.method).toBe("POST");
    expect(String(node?.parameters.url)).toContain("/leads/{{ $('Code: gate').first().json.id }}/opt-out");
    expect(JSON.stringify(node?.parameters.headerParameters)).toContain("$('Code: gate').first().json.tenantSlug");
  });
});

describe("orientação do agente preservada (SAIR-03 AC1)", () => {
  const source = readFileSync("n8n/src/system-message.mjs", "utf8").replace(/\r\n/g, "\n");
  const guidance = /const OPT_OUT_GUIDANCE_INSTRUCTION =[\s\S]*?;\n/.exec(source)?.[0] ?? "";

  it("OPT_OUT_GUIDANCE_INSTRUCTION é idêntico ao de 0688deb (sha256)", () => {
    expect(createHash("sha256").update(guidance).digest("hex")).toBe(
      "57229cd48902f46bb66b66a48d9479ddf3ac7f47ff275beb36de5d084bf605b3"
    );
  });

  it("o nó que monta o system message inlina o módulo que contém o texto", () => {
    const node = workflow.nodes.find((n) => n.name === SYSTEM_MESSAGE);
    expect(String(node?.parameters.jsCode)).toContain("__INLINE(system-message.mjs)__");
  });
});

describe("regras do Switch e execução do gate (SAIR-01 AC3, SAIR-02)", () => {
  const GATE_NODE = "Code: gate";

  it("o Switch roteia as quatro rotas nesta ordem: opt-out, somente-registrar, midia, conversa", () => {
    const node = workflow.nodes.find((n) => n.name === SWITCH);
    const rules = (node?.parameters.rules as { values: { conditions: { conditions: { leftValue: string; rightValue: string }[] } }[] }).values;
    expect(rules.map((rule) => rule.conditions.conditions[0].rightValue)).toEqual(["opt-out", "somente-registrar", "midia", "conversa"]);
    expect(rules.every((rule) => rule.conditions.conditions[0].leftValue === "={{ $json.route }}")).toBe(true);
  });

  function runGate(ctx: Record<string, unknown>) {
    const node = workflow.nodes.find((n) => n.name === GATE_NODE);
    const code = String(node?.parameters.jsCode).replace(/'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g, (_m, file: string) => readInlinedModule(file));
    const $ = (name: string) => {
      if (name !== "Code: contexto do lead") throw new Error(`nó inesperado: ${name}`);
      return { first: () => ({ json: ctx }) };
    };
    return (new Function("$", code)($) as { json: { route: string } }[])[0].json.route;
  }
  const BASE = { optedOutAt: null, status: "em_qualificacao", humanTakeoverAt: null, hasMedia: false };

  it.each([
    ["sair", "opt-out"],
    [" SAIR ", "opt-out"],
    ["parar", "conversa"],
    ["não quero mais receber mensagens", "conversa"],
    ["quero sair do aluguel", "conversa"],
    ["sair.", "conversa"],
  ])("texto %j → rota %s", (text, route) => {
    expect(runGate({ ...BASE, text })).toBe(route);
  });

  it("lead já descadastrado que manda sair de novo → somente-registrar (sem segunda confirmação)", () => {
    expect(runGate({ ...BASE, optedOutAt: "2026-10-07T12:00:00.000Z", text: "sair" })).toBe("somente-registrar");
  });
});
