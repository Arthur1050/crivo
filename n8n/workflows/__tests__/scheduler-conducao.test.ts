import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import principal from "../principal";
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
    phaseFilter: "Switch: ação B",
    get: "HTTP: GET /leads/{id} (reengajamento)",
    code: "Code: condução ao vivo (reengajamento)",
    filter: "Filter: agente pode contatar (reengajamento)",
    next: "HTTP: preparar B",
    effect: "HTTP: enviar B uma vez",
  },
  {
    label: "escalonamento por silêncio (AC7)",
    phaseFilter: "Switch: ação C",
    get: "HTTP: GET /leads/{id} (escalonamento)",
    code: "Code: condução ao vivo (escalonamento)",
    filter: "Filter: agente pode contatar (escalonamento)",
    next: "HTTP: expirar C",
    effect: "HTTP: expirar C",
  },
] as const;

const CONVERSA = { tenantSlug: "imobiliaria-a", waId: "553499532444", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" };

for (const sweep of SWEEPS) {
  describe(`varredura de ${sweep.label}: condução ao vivo (L-026)`, () => {
    it("seleção do candidato → GET /leads/{id}, e só ele", () => {
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

    it("falha do GET não envia nem escala", () => {
      expect(nodeByName(sweep.get).onError).toBe("continueErrorOutput");
      expect(mainTargets(sweep.get, 1)).toEqual([{ node: sweep.label === "reengajamento (AC6)" ? "Code: concluir candidato B" : "Code: concluir candidato C", type: "main", index: 0 }]);
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
      const out = runEachItem(sweep.code, { [sweep.label === "reengajamento (AC6)" ? "Code: candidato B" : "Code: candidato C"]: CONVERSA }, { status: "em_qualificacao", humanTakeoverAt: "2026-10-01T12:00:00.000Z", optedOutAt: null });
      expect(out.json).toEqual({ ...CONVERSA, podeContatar: false });
    });

    it("lead em escalado_humano ou com opt-out → podeContatar false", () => {
      const paired = { [sweep.label === "reengajamento (AC6)" ? "Code: candidato B" : "Code: candidato C"]: CONVERSA };
      expect(runEachItem(sweep.code, paired, { status: "escalado_humano", humanTakeoverAt: null, optedOutAt: null }).json.podeContatar).toBe(false);
      expect(runEachItem(sweep.code, paired, { status: "em_qualificacao", humanTakeoverAt: null, optedOutAt: "2026-10-01T12:00:00.000Z" }).json.podeContatar).toBe(false);
    });

    it("lead conduzido pelo agente, sem opt-out → podeContatar true", () => {
      expect(runEachItem(sweep.code, { [sweep.label === "reengajamento (AC6)" ? "Code: candidato B" : "Code: candidato C"]: CONVERSA }, { status: "em_qualificacao", humanTakeoverAt: null, optedOutAt: null }).json.podeContatar).toBe(true);
    });

    it("o filtro deixa passar só podeContatar verdadeiro", () => {
      const conditions = JSON.stringify(nodeByName(sweep.filter).parameters.conditions);
      expect(nodeByName(sweep.filter).type).toBe("n8n-nodes-base.if");
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

/**
 * Varredura D — purga pedida pelo CRM (lote-14 — T27; OPTHUM-01 AC6,
 * DEVOLVER-01). Mesmo trigger de 15 min (R3); pedidos de
 * `GET /memory-resets` ainda não atendidos apagam a sessão da memória em
 * `n8n_chat_histories` (DELETE parametrizado) e purgam `conversa_estado`,
 * gravando o pedido atendido em `memoryResetAt`.
 */
const D = {
  tenants: "Data Table: tenants (purga pedida pelo CRM)",
  http: "HTTP: GET /memory-resets (purga pedida pelo CRM)",
  guard: "Code: pedidos de purga do tenant",
  split: "Split: pedidos de purga",
  state: "Data Table: conversa_estado (purga pedida pelo CRM)",
  due: "Code: reset devido?",
  dueIf: "Reset devido?",
  delete: "Postgres: apagar sessão",
  purge: "Data Table: purgar qualificação e persona (purga pedida pelo CRM)",
} as const;

describe("varredura D: grafo (OPTHUM-01 AC6; L-026)", () => {
  it("continua um trigger só, e a cadeia D sai dele (R3)", () => {
    const triggers = workflow.nodes.filter((n) => n.type === "n8n-nodes-base.scheduleTrigger");
    expect(triggers.map((n) => n.name)).toEqual([TRIGGER]);
    expect(mainTargets(TRIGGER, 0)).toContainEqual({ node: D.tenants, type: "main", index: 0 });
  });

  it("tenants → HTTP → guarda → Split → conversa_estado → reset devido? → IF", () => {
    expect(mainTargets(D.tenants, 0)).toEqual([{ node: D.http, type: "main", index: 0 }]);
    expect(mainTargets(D.http, 0)).toEqual([{ node: D.guard, type: "main", index: 0 }]);
    expect(mainTargets(D.guard, 0)).toEqual([{ node: D.split, type: "main", index: 0 }]);
    expect(mainTargets(D.split, 0)).toEqual([{ node: D.state, type: "main", index: 0 }]);
    expect(mainTargets(D.state, 0)).toEqual([{ node: D.due, type: "main", index: 0 }]);
    expect(mainTargets(D.due, 0)).toEqual([{ node: D.dueIf, type: "main", index: 0 }]);
  });

  it("IF verdadeiro → apagar sessão → purgar conversa_estado; IF falso sem ligação", () => {
    expect(mainTargets(D.dueIf, 0)).toEqual([{ node: D.delete, type: "main", index: 0 }]);
    expect(mainTargets(D.dueIf, 1)).toEqual([]);
    expect(mainTargets(D.delete, 0)).toEqual([{ node: D.purge, type: "main", index: 0 }]);
  });

  it("a purga só é alcançável depois do IF", () => {
    expect(reachable(TRIGGER, D.dueIf).has(D.delete)).toBe(false);
    expect(reachable(TRIGGER, D.dueIf).has(D.purge)).toBe(false);
  });
});

describe("varredura D: leitura dos pedidos", () => {
  it("tenants lê todas as linhas de tenant_config", () => {
    const params = nodeByName(D.tenants).parameters;
    expect(params.operation).toBe("get");
    expect(params.returnAll).toBe(true);
    expect(JSON.stringify(params.dataTableId)).toContain("xRHckWWd6fxGeNta");
  });

  it("o HTTP pede os resets das últimas 24h com onError continueRegularOutput", () => {
    const node = nodeByName(D.http);
    expect(node.onError).toBe("continueRegularOutput");
    expect(node.parameters.method).toBe("GET");
    expect(String(node.parameters.url)).toMatch(/\/memory-resets$/);
    const query = JSON.stringify(node.parameters.queryParameters);
    expect(query).toContain('"name":"since"');
    expect(query).toContain("$now.minus({ hours: 24 }).toISO()");
    expect(JSON.stringify(node.parameters.headerParameters)).toContain("{{ $json.tenantSlug }}");
  });

  it("sem pedidos, ou com o CRM fora, a guarda devolve resets vazio e o Split termina a cadeia", () => {
    const tenant = { [D.tenants]: { tenantSlug: "imobiliaria-a" } };
    expect(runEachItem(D.guard, tenant, { resets: [] }).json).toEqual({ tenantSlug: "imobiliaria-a", resets: [] });
    expect(runEachItem(D.guard, tenant, { error: { message: "503" } }).json).toEqual({ tenantSlug: "imobiliaria-a", resets: [] });
    expect(nodeByName(D.split).parameters).toMatchObject({ fieldToSplitOut: "resets", include: "allOtherFields" });
  });

  it("a guarda repassa os pedidos com o tenant", () => {
    const resets = [{ leadId: "l1", waId: "553499532444", requestedAt: "2026-10-01T12:00:00.000Z" }];
    expect(runEachItem(D.guard, { [D.tenants]: { tenantSlug: "imobiliaria-a" } }, { resets }).json).toEqual({ tenantSlug: "imobiliaria-a", resets });
  });

  it("conversa_estado é lida por tenantSlug e waId do pedido", () => {
    const filters = JSON.stringify(nodeByName(D.state).parameters.filters);
    expect(filters).toContain("{{ $json.tenantSlug }}");
    expect(filters).toContain("{{ $json.resets.waId }}");
  });
});

describe("varredura D: reset devido e chave da sessão", () => {
  const PEDIDO = { tenantSlug: "imobiliaria-a", resets: { leadId: "l1", waId: "553499532444", requestedAt: "2026-10-01T12:00:00.000Z" } };

  it("inlina conduction.mjs e chama memoryResetDue", () => {
    const code = String(nodeByName(D.due).parameters.jsCode);
    expect(code).toContain("__INLINE(conduction.mjs)__");
    expect(code).toContain("memoryResetDue(");
  });

  it("pedido mais novo que o atendido → resetDue true; igual → false", () => {
    expect(runEachItem(D.due, { [D.split]: PEDIDO }, { memoryResetAt: "2026-10-01T10:00:00.000Z" }).json.resetDue).toBe(true);
    expect(runEachItem(D.due, { [D.split]: PEDIDO }, { memoryResetAt: "" }).json.resetDue).toBe(true);
    expect(runEachItem(D.due, { [D.split]: PEDIDO }, { memoryResetAt: "2026-10-01T12:00:00.000Z" }).json.resetDue).toBe(false);
  });

  it("a chave da sessão é idêntica à sessionKey do memoryPostgresChat do principal (paridade de string)", () => {
    const memory = (principal.toJSON() as unknown as WorkflowJson).nodes.find(
      (n) => n.type === "@n8n/n8n-nodes-langchain.memoryPostgresChat"
    );
    const sessionKey = String(memory?.parameters.sessionKey);
    const rendered = sessionKey
      .replace(/^=/, "")
      .replace("{{ $('Code: gate').first().json.tenantSlug }}", PEDIDO.tenantSlug)
      .replace("{{ $('Code: gate').first().json.waId }}", PEDIDO.resets.waId);
    const out = runEachItem(D.due, { [D.split]: PEDIDO }, { memoryResetAt: "" }).json;
    expect(rendered).toBe("imobiliaria-a:553499532444");
    expect(out.sessionId).toBe(rendered);
    expect(out).toMatchObject({ tenantSlug: "imobiliaria-a", waId: "553499532444", requestedAt: PEDIDO.resets.requestedAt });
  });

  it("o IF segue resetDue como boolean verdadeiro", () => {
    const conditions = JSON.stringify(nodeByName(D.dueIf).parameters.conditions);
    expect(conditions).toContain("{{ $json.resetDue }}");
    expect(conditions).toContain('"operation":"true"');
  });
});

describe("varredura D: apagar a sessão e purgar conversa_estado", () => {
  it("DELETE parametrizado por session_id ($1 + queryReplacement), sem concatenação", () => {
    const node = nodeByName(D.delete);
    expect(node.type).toBe("n8n-nodes-base.postgres");
    expect(node.parameters.operation).toBe("executeQuery");
    const query = String(node.parameters.query);
    expect(query).toMatch(/DELETE FROM n8n_chat_histories WHERE session_id = \$1/);
    expect(query).not.toContain("{{");
    expect(query).not.toContain("+");
    expect(String((node.parameters.options as Record<string, unknown>).queryReplacement)).toBe("={{ $json.sessionId }}");
  });

  it("a purga de conversa_estado limpa qualificação e persona e grava memoryResetAt", () => {
    const columns = nodeByName(D.purge).parameters.columns as {
      value: Record<string, unknown>;
      schema: { id: string; type: string }[];
    };
    expect(nodeByName(D.purge).parameters.operation).toBe("upsert");
    expect(columns.value.perguntadosJson).toBe("[]");
    expect(columns.value.aberturasJson).toBe("[]");
    expect(String(columns.value.memoryResetAt)).toContain(`$('${D.due}').item.json.requestedAt`);
    expect(columns.schema.find((c) => c.id === "memoryResetAt")).toMatchObject({ type: "string" });
  });
});
