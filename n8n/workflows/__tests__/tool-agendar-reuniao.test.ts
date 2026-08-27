import { describe, expect, it } from "vitest";
import agendarReuniao from "../tool-agendar-reuniao";

/**
 * Topologia do sub-workflow `crivo-tool-agendar-reuniao` (lote-8 T29 —
 * ATRIB-02). A ordem dos efeitos colaterais é a regra que esta task inverte,
 * e ordem não é expressável nas funções puras de `n8n/src/agendamento.mjs`:
 * é uma propriedade do grafo. Estes testes leem o grafo que o SDK emite (o
 * mesmo `toJSON` que o inliner leva para `n8n/generated/`), e falham se
 * alguém reintroduzir a ordem antiga (evento no Calendar antes do PATCH).
 */

const PATCH = "HTTP: PATCH /leads/{id} (agendado)";
const INTERPRETAR = "Code: interpretar resposta do CRM";
const DECISAO = "CRM confirmou o agendamento?";
const CRIAR_EVENTO = "Google Calendar: criar evento (Meet)";
const RECUSA = "Code: recusa do CRM (devolve motivo ao agente)";

type WorkflowJson = {
  nodes: { name: string; type: string; parameters: Record<string, unknown>; onError?: string }[];
  connections: Record<string, { main?: { node: string }[][] }>;
};

const workflow = agendarReuniao.toJSON() as unknown as WorkflowJson;

function nodeByName(name: string) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

/** Nomes alcançáveis a partir de `start` seguindo as conexões `main`. */
function downstreamOf(start: string): Set<string> {
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const branches = workflow.connections[current]?.main ?? [];
    for (const branch of branches) {
      for (const target of branch) {
        if (visited.has(target.node)) continue;
        visited.add(target.node);
        queue.push(target.node);
      }
    }
  }
  return visited;
}

/** Alvos de um ramo específico de um nó (0 = saída verdadeira do If). */
function branchTargets(name: string, index: number): string[] {
  const branch = workflow.connections[name]?.main?.[index] ?? [];
  return branch.map((target) => target.node);
}

describe("ordem do sub-workflow: PATCH no CRM antes do evento (ATRIB-02)", () => {
  it("a criação do evento está a jusante do PATCH, nunca a montante", () => {
    expect(downstreamOf(PATCH)).toContain(CRIAR_EVENTO);
    expect(downstreamOf(CRIAR_EVENTO)).not.toContain(PATCH);
  });

  it("entre o PATCH e o evento existe a decisão determinística sobre a resposta do CRM", () => {
    expect(branchTargets(PATCH, 0)).toEqual([INTERPRETAR]);
    expect(branchTargets(INTERPRETAR, 0)).toEqual([DECISAO]);
  });

  it("o PATCH pede corpo e status da resposta, para que a recusa chegue legível ao nó seguinte", () => {
    const options = nodeByName(PATCH).parameters.options as {
      response: { response: { fullResponse: boolean; neverError: boolean } };
    };

    expect(options.response.response.fullResponse).toBe(true);
    expect(options.response.response.neverError).toBe(true);
  });
});

describe("recusa do CRM não cria evento (ATRIB-02 AC5)", () => {
  it("o ramo de CRM confirmado cria o evento; o ramo de recusa devolve o motivo ao agente", () => {
    expect(branchTargets(DECISAO, 0)).toEqual([CRIAR_EVENTO]);
    expect(branchTargets(DECISAO, 1)).toEqual([RECUSA]);
  });

  it("nada a jusante da recusa toca o Google Calendar", () => {
    const alcancavel = downstreamOf(RECUSA);

    expect(alcancavel).not.toContain(CRIAR_EVENTO);
    expect(alcancavel.size).toBe(0);
  });
});

describe("corretor devolvido pelo CRM entra como convidado do evento (ATRIB-02 AC8)", () => {
  it("os convidados do evento vêm da resposta interpretada do CRM", () => {
    const additionalFields = nodeByName(CRIAR_EVENTO).parameters.additionalFields as {
      attendees: string;
    };

    expect(additionalFields.attendees).toBe(
      `={{ $('${INTERPRETAR}').first().json.convidados }}`
    );
  });

  it("falha na criação do evento não derruba a reunião já gravada no CRM", () => {
    expect(nodeByName(CRIAR_EVENTO).onError).toBe("continueRegularOutput");
  });
});
