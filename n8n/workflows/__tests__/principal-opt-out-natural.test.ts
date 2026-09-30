import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import principal from "../principal";

/**
 * Faixa explícita do classificador → ramo de opt-out existente (lote-13 T11 —
 * OPTREG-01, OPTKEY-01, OPTMSG-01). O caminho natural tem HTTP próprio, com
 * saída de erro; o sucesso entra no MESMO `Code: finalizar opt-out` da
 * palavra-chave, e dali na mesma cauda (purgas, envio fixo, registro, limpeza
 * do buffer). Um teste por aresta (L-026).
 */

type Connection = { node: string; type: string; index: number };
type WorkflowJson = {
  nodes: {
    name: string;
    type: string;
    typeVersion: number;
    onError?: string;
    retryOnFail?: boolean;
    maxTries?: number;
    waitBetweenTries?: number;
    parameters: Record<string, unknown>;
  }[];
  connections: Record<string, Record<string, (Connection[] | null)[]>>;
};

const workflow = principal.toJSON() as unknown as WorkflowJson;

const CLASSIFIER = "Classificador: opt-out";
const HTTP_NATURAL = "HTTP: POST /leads/{id}/opt-out (linguagem natural)";
const HTTP_KEYWORD = "HTTP: POST /leads/{id}/opt-out";
const FINALIZE = "Code: finalizar opt-out";
const GUIDE_SAIR = "Code: orientar sair (falha do registro)";
const RECIPIENT = "Code: destinatário do envio fixo";
const CONFIRM = "Code: conferir pedido explícito";
const CONFIRM_IF = "Pedido explícito confirmado?";
const ROUTE_FORA = "Code: rota fora";

const CONFIRMATION =
  "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!";
const REGISTRATION_FAILED =
  "Não consegui registrar seu pedido agora. Para encerrar, responda com a palavra sair, sozinha.";

function nodeByName(name: string) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

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

const GATE = {
  id: "00000000-0000-4000-8000-000000000001",
  waId: "5534999990001",
  phoneNumberId: "109876543210001",
  tenantSlug: "imobiliaria-a",
};

function runCode(name: string) {
  const code = String(nodeByName(name).parameters.jsCode).replace(
    /'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g,
    (_m, file: string) => readInlinedModule(file)
  );
  const $ = (node: string) => {
    if (node !== "Code: gate") throw new Error(`nó inesperado: ${node}`);
    return { first: () => ({ json: GATE }) };
  };
  return new Function("$", code)($) as { json: Record<string, unknown> }[];
}

/** `jsCode` sem o módulo inlined: só o que o nó faz com ele. */
function harness(name: string): string {
  return String(nodeByName(name).parameters.jsCode ?? "").replace(/__INLINE\([^)]*\)__/g, "");
}

describe("arestas do caminho natural (L-026)", () => {
  // T12d (decisão D3): a saída 2 deixou de ir direto ao HTTP natural; passa
  // pela trava determinística antes do registro.
  it("saída 2 (explicita) do classificador → Code: conferir pedido explícito, e só ele", () => {
    expect(mainTargets(CLASSIFIER, 2)).toEqual([{ node: CONFIRM, type: "main", index: 0 }]);
  });

  it("Code: conferir pedido explícito → IF Pedido explícito confirmado?", () => {
    expect(mainTargets(CONFIRM, 0)).toEqual([{ node: CONFIRM_IF, type: "main", index: 0 }]);
  });

  it("IF verdadeiro (saída 0) → HTTP natural, e só ele", () => {
    expect(mainTargets(CONFIRM_IF, 0)).toEqual([{ node: HTTP_NATURAL, type: "main", index: 0 }]);
  });

  it("IF falso (saída 1) → Code: rota fora, e só ela (D11)", () => {
    expect(mainTargets(CONFIRM_IF, 1)).toEqual([{ node: ROUTE_FORA, type: "main", index: 0 }]);
  });

  it("o HTTP natural tem o IF como único predecessor", () => {
    expect(predecessors(HTTP_NATURAL)).toEqual([CONFIRM_IF]);
  });

  it("sucesso do HTTP natural (saída 0) → Code: finalizar opt-out", () => {
    expect(mainTargets(HTTP_NATURAL, 0)).toEqual([{ node: FINALIZE, type: "main", index: 0 }]);
  });

  it("erro do HTTP natural (saída 1) → Code: orientar sair", () => {
    expect(mainTargets(HTTP_NATURAL, 1)).toEqual([{ node: GUIDE_SAIR, type: "main", index: 0 }]);
  });

  it("Code: orientar sair → Code: destinatário do envio fixo", () => {
    expect(mainTargets(GUIDE_SAIR, 0)).toEqual([{ node: RECIPIENT, type: "main", index: 0 }]);
  });
});

describe("HTTP natural: mesmo registro da palavra-chave, com degradação (OPTREG-01 AC1, AC2, AC7)", () => {
  it("URL e X-Crivo-Tenant vêm de `$('Code: gate')`, nunca do modelo", () => {
    const params = nodeByName(HTTP_NATURAL).parameters;
    expect(params.method).toBe("POST");
    expect(params.url).toBe(
      "=https://crivo-arthur1050s-projects.vercel.app/api/v1/leads/{{ $('Code: gate').first().json.id }}/opt-out"
    );
    expect(params.headerParameters).toEqual({
      parameters: [{ name: "X-Crivo-Tenant", value: "={{ $('Code: gate').first().json.tenantSlug }}" }],
    });
    expect(JSON.stringify(params)).not.toMatch(/fromAI/i);
  });

  it("os parâmetros são iguais aos do HTTP da palavra-chave", () => {
    expect(nodeByName(HTTP_NATURAL).parameters).toEqual(nodeByName(HTTP_KEYWORD).parameters);
  });

  it("tenta 3 vezes e depois sai pela saída de erro", () => {
    const node = nodeByName(HTTP_NATURAL);
    expect(node.retryOnFail).toBe(true);
    expect(node.maxTries).toBe(3);
    expect(node.waitBetweenTries).toBe(2000);
    expect(node.onError).toBe("continueErrorOutput");
  });

  it("a falha envia uma única mensagem que orienta a palavra sair, sem afirmar que parou (AC7, AC10)", () => {
    expect(runCode(GUIDE_SAIR)).toEqual([
      {
        json: {
          mensagens: [REGISTRATION_FAILED],
          waId: GATE.waId,
          phoneNumberId: GATE.phoneNumberId,
          tenantSlug: GATE.tenantSlug,
          leadId: GATE.id,
          fase: "qualificando",
        },
      },
    ]);
  });
});

describe("confirmação única nos dois caminhos (OPTMSG-01 AC1, AC2)", () => {
  it("Code: finalizar opt-out tem exatamente os dois HTTP de opt-out como predecessores", () => {
    expect(predecessors(FINALIZE)).toEqual([HTTP_KEYWORD, HTTP_NATURAL].sort());
  });

  it("Code: finalizar opt-out envia exatamente o texto de OPTMSG-01", () => {
    expect(runCode(FINALIZE)).toEqual([
      {
        json: {
          mensagens: [CONFIRMATION],
          waId: GATE.waId,
          phoneNumberId: GATE.phoneNumberId,
          tenantSlug: GATE.tenantSlug,
          leadId: GATE.id,
          fase: "encerrada",
        },
      },
    ]);
  });

  it("só Code: finalizar opt-out usa a confirmação", () => {
    const users = workflow.nodes.filter((n) => harness(n.name).includes("OPT_OUT_CONFIRMATION")).map((n) => n.name);
    expect(users).toEqual([FINALIZE]);
  });

  it("o texto antigo, que prometia retomada, não aparece em nenhum nó", () => {
    const all = JSON.stringify(workflow.nodes);
    expect(all).not.toContain("chamar novamente");
    expect(all).not.toContain("Se mudar de ideia");
  });
});

describe("caminho da palavra-chave inalterado (OPTKEY-01 AC1, AC4)", () => {
  it("Switch: rota (gate) saída 0 → HTTP da palavra-chave", () => {
    expect(mainTargets("Switch: rota (gate)", 0)).toEqual([{ node: HTTP_KEYWORD, type: "main", index: 0 }]);
  });

  it("HTTP da palavra-chave → finalizar opt-out, sem saída de erro", () => {
    expect(workflow.connections[HTTP_KEYWORD]?.main).toEqual([[{ node: FINALIZE, type: "main", index: 0 }]]);
    expect(nodeByName(HTTP_KEYWORD).onError).toBeUndefined();
  });

  it("HTTP da palavra-chave mantém URL, tenant e retry", () => {
    const node = nodeByName(HTTP_KEYWORD);
    expect(node.parameters.url).toBe(
      "=https://crivo-arthur1050s-projects.vercel.app/api/v1/leads/{{ $('Code: gate').first().json.id }}/opt-out"
    );
    expect(node.retryOnFail).toBe(true);
    expect(node.maxTries).toBe(3);
  });

  it("finalizar → purgar memória (opt-out)", () => {
    expect(mainTargets(FINALIZE, 0)).toEqual([{ node: "Chat Memory Manager: purgar memória (opt-out)", type: "main", index: 0 }]);
  });

  it("purgar memória → purgar qualificação e persona (opt-out)", () => {
    expect(mainTargets("Chat Memory Manager: purgar memória (opt-out)", 0)).toEqual([
      { node: "Data Table: purgar qualificação e persona (opt-out)", type: "main", index: 0 },
    ]);
  });

  it("purgar qualificação e persona → restaurar payload do opt-out", () => {
    expect(mainTargets("Data Table: purgar qualificação e persona (opt-out)", 0)).toEqual([
      { node: "Code: restaurar payload do opt-out", type: "main", index: 0 },
    ]);
  });

  it("restaurar payload → destinatário do envio fixo", () => {
    expect(mainTargets("Code: restaurar payload do opt-out", 0)).toEqual([{ node: RECIPIENT, type: "main", index: 0 }]);
  });
});

describe("trava determinística antes do registro (T12d, decisão D3)", () => {
  function runConfirm(bufferArray: { text: string }[] | undefined) {
    const code = String(nodeByName(CONFIRM).parameters.jsCode).replace(
      /'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g,
      (_m, file: string) => readInlinedModule(file)
    );
    const $ = (node: string) => {
      if (node !== "Code: contexto do lead") throw new Error(`nó inesperado: ${node}`);
      return { first: () => ({ json: bufferArray === undefined ? {} : { bufferArray } }) };
    };
    return new Function("$", code)($) as { json: Record<string, unknown> }[];
  }

  it("pedido só de conteúdo no buffer do turno: `optOutExplicito: false`", () => {
    expect(runConfirm([{ text: "oi" }, { text: "para de mandar casa, eu quero apartamento" }])).toEqual([
      { json: { optOutExplicito: false } },
    ]);
  });

  it("pedido de parar as mensagens: `optOutExplicito: true`", () => {
    expect(runConfirm([{ text: "não me mande mais mensagens" }])).toEqual([{ json: { optOutExplicito: true } }]);
  });

  it("buffer ausente: mantém a decisão do classificador (`true`)", () => {
    expect(runConfirm(undefined)).toEqual([{ json: { optOutExplicito: true } }]);
  });

  it("lê o texto do lead do mesmo buffer da entrada do classificador, e lead/tenant de lugar nenhum", () => {
    const code = harness(CONFIRM);
    expect(code).toContain("$('Code: contexto do lead').first().json.bufferArray");
    expect(code).toContain("refineOptOutCategory({ categoria: 'explicita'");
    expect(code).not.toMatch(/tenantSlug|waId|\.json\.id\b|fromAI/i);
  });

  it("o IF é v2.3, estrito, e testa `$json.optOutExplicito` como boolean verdadeiro", () => {
    const node = nodeByName(CONFIRM_IF);
    expect(node.type).toBe("n8n-nodes-base.if");
    expect(node.typeVersion).toBe(2.3);
    expect(node.parameters.conditions).toEqual({
      combinator: "and",
      options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
      conditions: [{ leftValue: "={{ $json.optOutExplicito }}", operator: { type: "boolean", operation: "true" }, rightValue: true }],
    });
  });
});
