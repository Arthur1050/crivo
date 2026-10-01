import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import principal from "../principal";

/**
 * Condução humana no fluxo principal (lote-14 — T23; SILENCIO-01, ENVIO-01).
 * O `POST /leads` informa o número pelo qual o lead escreveu; o gate recebe a
 * marca; e o envio de contingência relê o lead antes de enviar, com a saída
 * falsa e a saída de erro indo ao fechamento sem envio. Um teste por aresta
 * (L-026), índices de saída lidos do `toJSON()` (L-044).
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

const workflow = principal.toJSON() as unknown as WorkflowJson;

const POST_LEAD = "HTTP: POST /leads (idempotente)";
const GATE = "Code: gate";
const NEEDS_FALLBACK = "Turno sem responder_lead, mas com texto?";
const GET_LEAD = "HTTP: GET /leads/{id} (antes do envio)";
const CAN_SEND = "Code: pode enviar no turno?";
const CAN_SEND_IF = "Agente pode enviar no turno?";
const FALLBACK = "Code: preparar envio de contingência";
const CLOSE_NO_SEND = "Code: preparar clear de buffer (turno do agente)";
const SEND_FIXED = "WhatsApp: enviar mensagem fixa";

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
  return [...new Set(found)].sort();
}

/** Todos os nós alcançáveis a partir de `start` (inclusive), por qualquer saída. */
function reachable(start: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const outputs of Object.values(workflow.connections[current] ?? {})) {
      for (const list of outputs) {
        for (const c of list ?? []) {
          if (!seen.has(c.node)) {
            seen.add(c.node);
            queue.push(c.node);
          }
        }
      }
    }
  }
  return seen;
}

function inline(code: string): string {
  return code.replace(/'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g, (_m, file: string) => readInlinedModule(file));
}

function runCode(name: string, nodes: Record<string, unknown>, input: unknown[] = []) {
  const code = inline(String(nodeByName(name).parameters.jsCode));
  const $ = (node: string) => {
    if (!(node in nodes)) throw new Error(`nó inesperado: ${node}`);
    return { first: () => ({ json: nodes[node] }) };
  };
  const $input = { first: () => ({ json: input[0] }), all: () => input.map((json) => ({ json })) };
  return new Function("$", "$input", code)($, $input) as { json: Record<string, unknown> }[];
}

const LEAD_CTX = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "em_qualificacao",
  optedOutAt: null,
  tenantSlug: "imobiliaria-a",
  waId: "5534999990001",
  phoneNumberId: "109876543210001",
  hasMedia: false,
  text: "Oi, ainda tem o apartamento?",
};

describe("POST /leads informa o número do canal (ENVIO-01, emenda D1)", () => {
  it("o corpo envia whatsappPhoneNumberId com o phoneNumberId de Code: combinar evento e tenant", () => {
    const body = String(nodeByName(POST_LEAD).parameters.jsonBody);
    expect(body).toContain("whatsappPhoneNumberId: $('Code: combinar evento e tenant').item.json.phoneNumberId");
  });
});

describe("Code: gate passa a marca de condução humana (SILENCIO-01 AC2)", () => {
  it("o código do gate passa humanTakeoverAt do contexto do lead", () => {
    expect(String(nodeByName(GATE).parameters.jsCode)).toContain("humanTakeoverAt: ctx.humanTakeoverAt");
  });

  it("lead com a marca → route somente-registrar", () => {
    const [out] = runCode(GATE, { "Code: contexto do lead": { ...LEAD_CTX, humanTakeoverAt: "2026-10-01T12:00:00.000Z" } });
    expect(out.json.route).toBe("somente-registrar");
  });

  it("lead sem a marca → route conversa (comportamento anterior preservado)", () => {
    const [out] = runCode(GATE, { "Code: contexto do lead": { ...LEAD_CTX, humanTakeoverAt: null } });
    expect(out.json.route).toBe("conversa");
  });
});

describe("envio de contingência relê o lead antes de enviar (SILENCIO-01 AC4, AC5; L-026)", () => {
  it("saída verdadeira do IF de contingência → HTTP: GET /leads/{id} (antes do envio), e só ele", () => {
    expect(mainTargets(NEEDS_FALLBACK, 0)).toEqual([{ node: GET_LEAD, type: "main", index: 0 }]);
  });

  it("o HTTP de leitura tem onError continueErrorOutput (duas saídas)", () => {
    expect(nodeByName(GET_LEAD).onError).toBe("continueErrorOutput");
    expect(nodeByName(GET_LEAD).parameters.method).toBe("GET");
  });

  it("sucesso do HTTP (saída 0) → Code: pode enviar no turno?", () => {
    expect(mainTargets(GET_LEAD, 0)).toEqual([{ node: CAN_SEND, type: "main", index: 0 }]);
  });

  it("erro do HTTP (saída 1) → fechamento sem envio (AC5: falha fechada)", () => {
    expect(mainTargets(GET_LEAD, 1)).toEqual([{ node: CLOSE_NO_SEND, type: "main", index: 0 }]);
  });

  it("Code: pode enviar no turno? → IF Agente pode enviar no turno?", () => {
    expect(mainTargets(CAN_SEND, 0)).toEqual([{ node: CAN_SEND_IF, type: "main", index: 0 }]);
  });

  it("IF verdadeiro (saída 0) → Code: preparar envio de contingência", () => {
    expect(mainTargets(CAN_SEND_IF, 0)).toEqual([{ node: FALLBACK, type: "main", index: 0 }]);
  });

  it("IF falso (saída 1) → fechamento sem envio (AC4)", () => {
    expect(mainTargets(CAN_SEND_IF, 1)).toEqual([{ node: CLOSE_NO_SEND, type: "main", index: 0 }]);
  });

  it("o envio de contingência só é alcançável pela saída verdadeira do IF novo", () => {
    expect(predecessors(FALLBACK)).toEqual([CAN_SEND_IF]);
  });

  it("o fechamento sem envio não alcança nenhum envio ao WhatsApp", () => {
    const after = reachable(CLOSE_NO_SEND);
    expect(after.has(SEND_FIXED)).toBe(false);
    expect([...after].some((name) => nodeByName(name).type === "n8n-nodes-base.whatsApp")).toBe(false);
  });
});

describe("Code: pode enviar no turno? (canAgentSendInTurn inline)", () => {
  it("inlina conduction.mjs e chama canAgentSendInTurn", () => {
    const code = String(nodeByName(CAN_SEND).parameters.jsCode);
    expect(code).toContain("__INLINE(conduction.mjs)__");
    expect(code).toContain("canAgentSendInTurn(");
  });

  it("lead com a marca → podeEnviar false", () => {
    const [out] = runCode(CAN_SEND, {}, [{ id: LEAD_CTX.id, humanTakeoverAt: "2026-10-01T12:00:00.000Z", optedOutAt: null, status: "em_qualificacao" }]);
    expect(out.json.podeEnviar).toBe(false);
  });

  it("lead com opt-out → podeEnviar false", () => {
    const [out] = runCode(CAN_SEND, {}, [{ id: LEAD_CTX.id, humanTakeoverAt: null, optedOutAt: "2026-10-01T12:00:00.000Z", status: "em_qualificacao" }]);
    expect(out.json.podeEnviar).toBe(false);
  });

  it("lead em escalado_humano sem marca → podeEnviar true (mensagem de passagem)", () => {
    const [out] = runCode(CAN_SEND, {}, [{ id: LEAD_CTX.id, humanTakeoverAt: null, optedOutAt: null, status: "escalado_humano" }]);
    expect(out.json.podeEnviar).toBe(true);
  });

  it("o IF compara podeEnviar como boolean verdadeiro", () => {
    const conditions = JSON.stringify(nodeByName(CAN_SEND_IF).parameters.conditions);
    expect(conditions).toContain("{{ $json.podeEnviar }}");
    expect(conditions).toContain('"operation":"true"');
  });
});

describe("ids da leitura vêm do fluxo, nunca do modelo", () => {
  it("URL e X-Crivo-Tenant do GET vêm de Code: gate, sem $fromAI", () => {
    const params = nodeByName(GET_LEAD).parameters;
    expect(String(params.url)).toContain("/leads/{{ $('Code: gate').first().json.id }}");
    expect(JSON.stringify(params.headerParameters)).toContain("$('Code: gate').first().json.tenantSlug");
    expect(JSON.stringify(params)).not.toMatch(/\$fromAI|fromAi/);
  });
});
