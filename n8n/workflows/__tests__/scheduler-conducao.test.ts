import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import scheduler from "../scheduler";

/**
 * Condução humana no scheduler (lote-14 — T26; SILENCIO-01 AC6, AC7, AC8).
 * Reengajamento e escalonamento por silêncio relêem o lead ao vivo e só
 * seguem quando o agente pode contatá-lo; os lembretes não mudam. Um teste
 * por aresta (L-026), índices do `toJSON()` (L-044).
 */

type Connection = { node: string; type: string; index: number };
type WorkflowJson = {
  nodes: { name: string; type: string; onError?: string; parameters: Record<string, unknown> }[];
  connections: Record<string, Record<string, (Connection[] | null)[]>>;
};

const workflow = scheduler.toJSON() as unknown as WorkflowJson;

const TRIGGER = "A cada 15min";

function nodeByName(name: string) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

function mainTargets(source: string, output: number): Connection[] {
  return workflow.connections[source]?.main?.[output] ?? [];
}

/** Nós alcançáveis a partir de `start`, sem atravessar `avoid`. */
function reachable(start: string, avoid?: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const outputs of Object.values(workflow.connections[current] ?? {})) {
      for (const list of outputs) {
        for (const c of list ?? []) {
          if (c.node === avoid || seen.has(c.node)) continue;
          seen.add(c.node);
          queue.push(c.node);
        }
      }
    }
  }
  return seen;
}

function runEachItem(name: string, pairedNodes: Record<string, unknown>, json: unknown) {
  const code = String(nodeByName(name).parameters.jsCode).replace(
    /'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g,
    (_m, file: string) => readInlinedModule(file)
  );
  const $ = (node: string) => {
    if (!(node in pairedNodes)) throw new Error(`nó inesperado: ${node}`);
    return { item: { json: pairedNodes[node] } };
  };
  return new Function("$", "$json", code)($, json) as { json: Record<string, unknown> };
}

const SWEEPS = [
  {
    label: "reengajamento (AC6)",
    phaseFilter: "Filter: exclui encerradas (reengajamento)",
    get: "HTTP: GET /leads/{id} (reengajamento)",
    code: "Code: condução ao vivo (reengajamento)",
    filter: "Filter: agente pode contatar (reengajamento)",
    next: "Data Table: tenant do reengajamento",
    effect: "WhatsApp: reengajamento (template)",
  },
  {
    label: "escalonamento por silêncio (AC7)",
    phaseFilter: "Filter: exclui encerradas (escalonamento)",
    get: "HTTP: GET /leads/{id} (escalonamento)",
    code: "Code: condução ao vivo (escalonamento)",
    filter: "Filter: agente pode contatar (escalonamento)",
    next: "Data Table: tenant do escalonamento",
    effect: "HTTP: PATCH /leads/{id} (silencio 48h)",
  },
] as const;

const CONVERSA = { tenantSlug: "imobiliaria-a", waId: "553499532444", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" };

for (const sweep of SWEEPS) {
  describe(`varredura de ${sweep.label}: condução ao vivo (L-026)`, () => {
    it("filtro de fase → GET /leads/{id}, e só ele", () => {
      expect(mainTargets(sweep.phaseFilter, 0)).toEqual([{ node: sweep.get, type: "main", index: 0 }]);
    });

    it("GET → Code: condução ao vivo → Filter: agente pode contatar → tenant", () => {
      expect(mainTargets(sweep.get, 0)).toEqual([{ node: sweep.code, type: "main", index: 0 }]);
      expect(mainTargets(sweep.code, 0)).toEqual([{ node: sweep.filter, type: "main", index: 0 }]);
      expect(mainTargets(sweep.filter, 0)).toEqual([{ node: sweep.next, type: "main", index: 0 }]);
    });

    it("o efeito só é alcançável passando pelo filtro novo", () => {
      expect(reachable(TRIGGER).has(sweep.effect)).toBe(true);
      expect(reachable(TRIGGER, sweep.filter).has(sweep.effect)).toBe(false);
    });

    it("falha do GET não envia nem escala: continueErrorOutput com a saída de erro sem ligação", () => {
      expect(nodeByName(sweep.get).onError).toBe("continueErrorOutput");
      expect(mainTargets(sweep.get, 1)).toEqual([]);
    });

    it("o GET lê o lead do item da conversa, com o tenant do item", () => {
      const params = nodeByName(sweep.get).parameters;
      expect(params.method).toBe("GET");
      expect(String(params.url)).toContain("/leads/{{ $json.leadId }}");
      expect(JSON.stringify(params.headerParameters)).toContain("{{ $json.tenantSlug }}");
    });

    it("o código inlina conduction.mjs e chama canAgentContactProactively", () => {
      const code = String(nodeByName(sweep.code).parameters.jsCode);
      expect(code).toContain("__INLINE(conduction.mjs)__");
      expect(code).toContain("canAgentContactProactively(");
    });

    it("lead com a marca → podeContatar false; a linha da conversa segue no item", () => {
      const out = runEachItem(sweep.code, { [sweep.phaseFilter]: CONVERSA }, { status: "em_qualificacao", humanTakeoverAt: "2026-10-01T12:00:00.000Z", optedOutAt: null });
      expect(out.json).toEqual({ ...CONVERSA, podeContatar: false });
    });

    it("lead em escalado_humano ou com opt-out → podeContatar false", () => {
      expect(runEachItem(sweep.code, { [sweep.phaseFilter]: CONVERSA }, { status: "escalado_humano", humanTakeoverAt: null, optedOutAt: null }).json.podeContatar).toBe(false);
      expect(runEachItem(sweep.code, { [sweep.phaseFilter]: CONVERSA }, { status: "em_qualificacao", humanTakeoverAt: null, optedOutAt: "2026-10-01T12:00:00.000Z" }).json.podeContatar).toBe(false);
    });

    it("lead conduzido pelo agente, sem opt-out → podeContatar true", () => {
      expect(runEachItem(sweep.code, { [sweep.phaseFilter]: CONVERSA }, { status: "em_qualificacao", humanTakeoverAt: null, optedOutAt: null }).json.podeContatar).toBe(true);
    });

    it("o filtro deixa passar só podeContatar verdadeiro", () => {
      const conditions = JSON.stringify(nodeByName(sweep.filter).parameters.conditions);
      expect(nodeByName(sweep.filter).type).toBe("n8n-nodes-base.filter");
      expect(conditions).toContain("{{ $json.podeContatar }}");
      expect(conditions).toContain('"operation":"true"');
    });
  });
}

describe("lembretes não consultam a condução (SILENCIO-01 AC8)", () => {
  const REMINDER_CHAIN = [
    "Data Table: lembretes devidos (agenda_envios)",
    "Data Table: tenant do lembrete",
    "Code: combinar lembrete e tenant",
    "Data Table: conversa_estado do lembrete",
    "HTTP: POST /leads (reconsulta lembrete)",
    "Code: canal do lembrete",
    "Switch: canal do lembrete",
    "WhatsApp: lembrete (texto livre)",
    "WhatsApp: lembrete (template)",
    "HTTP: POST /leads/{id}/messages (lembrete)",
    "Data Table: marcar lembrete enviado",
  ];

  it("a cadeia de lembretes tem o mesmo conjunto de nós de antes", () => {
    expect([...reachable(REMINDER_CHAIN[0])].sort()).toEqual([...REMINDER_CHAIN].sort());
  });

  it("nenhum nó da cadeia de lembretes consulta a condução", () => {
    for (const name of REMINDER_CHAIN) {
      const params = JSON.stringify(nodeByName(name).parameters);
      expect(params).not.toContain("canAgentContactProactively");
      expect(params).not.toContain("humanTakeoverAt");
      expect(params).not.toContain("conduction.mjs");
    }
  });
});
