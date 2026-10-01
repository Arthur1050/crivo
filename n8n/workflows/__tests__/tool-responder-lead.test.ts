import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import responder from "../tool-responder-lead";

/**
 * `responder_lead` relê o lead antes de cada envio (lote-14 — T25;
 * SILENCIO-01 AC4, AC5). Marca de condução humana ou opt-out gravados no meio
 * do turno, ou falha da leitura, terminam na recusa: sem envio ao WhatsApp e
 * sem gravar abertura. Um teste por aresta (L-026), índices do `toJSON()`
 * (L-044).
 */

type Connection = { node: string; type: string; index: number };
type WorkflowJson = {
  nodes: { name: string; type: string; onError?: string; parameters: Record<string, unknown> }[];
  connections: Record<string, Record<string, (Connection[] | null)[]>>;
};

const workflow = responder.toJSON() as unknown as WorkflowJson;

const ACCEPTED_IF = "Aceito pelas barreiras de persona?";
const BARRIERS = "Code: aplicar barreiras de persona";
const GET_LEAD = "HTTP: GET /leads/{id} (antes do envio)";
const CAN_SEND = "Code: pode enviar no turno?";
const CAN_SEND_IF = "Agente pode enviar no turno?";
const UNAVAILABLE = "Code: condução indisponível";
const REJECT = "Code: recusa (devolve motivo ao agente)";
const NORMALIZE = "Code: normalizar destinatario do envio";
const SEND = "WhatsApp: enviar resposta do agente";
const PERSIST = "Data Table: gravar abertura";

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

function runCode(name: string, nodes: Record<string, unknown>, input: unknown) {
  const code = String(nodeByName(name).parameters.jsCode).replace(
    /'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g,
    (_m, file: string) => readInlinedModule(file)
  );
  const $ = (node: string) => {
    if (!(node in nodes)) throw new Error(`nó inesperado: ${node}`);
    return { first: () => ({ json: nodes[node] }) };
  };
  const $input = { first: () => ({ json: input }) };
  return new Function("$", "$input", "$json", code)($, $input, input) as { json: Record<string, unknown> }[];
}

const ACCEPTED = {
  accepted: true,
  reason: null,
  mensagem: "Perfeito, e qual a região?",
  tenantSlug: "imobiliaria-a",
  waId: "553499532444",
  leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  phoneNumberId: "109876543210001",
  aberturasJson: "[]",
};

describe("arestas da releitura antes do envio (SILENCIO-01 AC4, AC5; L-026)", () => {
  it("saída verdadeira das barreiras → HTTP: GET /leads/{id} (antes do envio), e só ele", () => {
    expect(mainTargets(ACCEPTED_IF, 0)).toEqual([{ node: GET_LEAD, type: "main", index: 0 }]);
  });

  it("saída falsa das barreiras continua indo à recusa", () => {
    expect(mainTargets(ACCEPTED_IF, 1)).toEqual([{ node: REJECT, type: "main", index: 0 }]);
  });

  it("o GET tem onError continueErrorOutput", () => {
    expect(nodeByName(GET_LEAD).onError).toBe("continueErrorOutput");
    expect(nodeByName(GET_LEAD).parameters.method).toBe("GET");
  });

  it("sucesso do GET (saída 0) → Code: pode enviar no turno?", () => {
    expect(mainTargets(GET_LEAD, 0)).toEqual([{ node: CAN_SEND, type: "main", index: 0 }]);
  });

  it("erro do GET (saída 1) → Code: condução indisponível → recusa (AC5)", () => {
    expect(mainTargets(GET_LEAD, 1)).toEqual([{ node: UNAVAILABLE, type: "main", index: 0 }]);
    expect(mainTargets(UNAVAILABLE, 0)).toEqual([{ node: REJECT, type: "main", index: 0 }]);
  });

  it("Code: pode enviar no turno? → IF", () => {
    expect(mainTargets(CAN_SEND, 0)).toEqual([{ node: CAN_SEND_IF, type: "main", index: 0 }]);
  });

  it("IF verdadeiro (saída 0) → normalizar destinatário", () => {
    expect(mainTargets(CAN_SEND_IF, 0)).toEqual([{ node: NORMALIZE, type: "main", index: 0 }]);
  });

  it("IF falso (saída 1) → recusa (AC4)", () => {
    expect(mainTargets(CAN_SEND_IF, 1)).toEqual([{ node: REJECT, type: "main", index: 0 }]);
  });

  it("o envio ao WhatsApp só é alcançável pela saída verdadeira do IF novo", () => {
    expect(predecessors(NORMALIZE)).toEqual([CAN_SEND_IF]);
    expect(predecessors(SEND)).toEqual([NORMALIZE]);
  });

  it("a recusa não alcança envio nem gravação de abertura", () => {
    const after = reachable(REJECT);
    expect(after.has(SEND)).toBe(false);
    expect(after.has(PERSIST)).toBe(false);
    expect(reachable(UNAVAILABLE).has(SEND)).toBe(false);
    expect(reachable(UNAVAILABLE).has(PERSIST)).toBe(false);
  });
});

describe("Code: pode enviar no turno? (canAgentSendInTurn inline)", () => {
  it("inlina conduction.mjs e chama canAgentSendInTurn", () => {
    const code = String(nodeByName(CAN_SEND).parameters.jsCode);
    expect(code).toContain("__INLINE(conduction.mjs)__");
    expect(code).toContain("canAgentSendInTurn(");
  });

  it("lead com a marca → podeEnviar false e reason conversa-com-humano", () => {
    const [out] = runCode(CAN_SEND, { [BARRIERS]: ACCEPTED }, { humanTakeoverAt: "2026-10-01T12:00:00.000Z", optedOutAt: null, status: "em_qualificacao" });
    expect(out.json.podeEnviar).toBe(false);
    expect(out.json.reason).toBe("conversa-com-humano");
  });

  it("lead com opt-out → podeEnviar false", () => {
    const [out] = runCode(CAN_SEND, { [BARRIERS]: ACCEPTED }, { humanTakeoverAt: null, optedOutAt: "2026-10-01T12:00:00.000Z", status: "em_qualificacao" });
    expect(out.json.podeEnviar).toBe(false);
  });

  it("lead em escalado_humano sem marca → podeEnviar true e o payload das barreiras segue intacto (mensagem de passagem)", () => {
    const [out] = runCode(CAN_SEND, { [BARRIERS]: ACCEPTED }, { humanTakeoverAt: null, optedOutAt: null, status: "escalado_humano" });
    expect(out.json).toEqual({ ...ACCEPTED, podeEnviar: true, reason: null });
  });

  it("o IF compara podeEnviar como boolean verdadeiro", () => {
    const conditions = JSON.stringify(nodeByName(CAN_SEND_IF).parameters.conditions);
    expect(conditions).toContain("{{ $json.podeEnviar }}");
    expect(conditions).toContain('"operation":"true"');
  });
});

describe("motivos devolvidos ao agente", () => {
  it("falha da leitura → recusa com reason conducao-indisponivel", () => {
    const [unavailable] = runCode(UNAVAILABLE, {}, { error: { message: "timeout" } });
    const [out] = runCode(REJECT, {}, unavailable.json);
    expect(out.json).toEqual({ ok: false, reason: "conducao-indisponivel" });
  });

  it("marca no meio do turno → recusa com reason conversa-com-humano", () => {
    const [canSend] = runCode(CAN_SEND, { [BARRIERS]: ACCEPTED }, { humanTakeoverAt: "2026-10-01T12:00:00.000Z", optedOutAt: null });
    const [out] = runCode(REJECT, {}, canSend.json);
    expect(out.json).toEqual({ ok: false, reason: "conversa-com-humano" });
  });
});

describe("ids da leitura vêm do Execute Workflow Trigger, nunca do modelo", () => {
  it("URL e X-Crivo-Tenant do GET vêm do trigger, sem $fromAI", () => {
    const params = nodeByName(GET_LEAD).parameters;
    expect(String(params.url)).toContain("/leads/{{ $('Execute Workflow Trigger').first().json.leadId }}");
    expect(JSON.stringify(params.headerParameters)).toContain("$('Execute Workflow Trigger').first().json.tenantSlug");
    expect(JSON.stringify(params)).not.toMatch(/\$fromAI|fromAi/);
  });
});
