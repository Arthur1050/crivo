import { describe, expect, it } from "vitest";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
import principal from "../principal";

/**
 * Reconstrução da memória pedida pelo CRM (lote-14 — T24; DEVOLVER-01 AC5,
 * AC6, AC7). O pedido (`memoryResetRequestedAt` do lead) mais novo que o
 * atendido (`memoryResetAt` de `conversa_estado`) entra pelo mesmo IF da
 * sessão expirada; a purga grava o pedido atendido; a semeadura apresenta a
 * fala humana como `system`. Um teste por aresta (L-026).
 */

type Connection = { node: string; type: string; index: number };
type WorkflowJson = {
  nodes: { name: string; type: string; parameters: Record<string, unknown> }[];
  connections: Record<string, Record<string, (Connection[] | null)[]>>;
};

const workflow = principal.toJSON() as unknown as WorkflowJson;

const CHECK = "Code: sessão expirada?";
const CHECK_IF = "Sessão expirada (gap > 12h)?";
const PURGE_MEMORY = "Chat Memory Manager: purgar sessão expirada";
const PURGE_STATE = "Data Table: purgar qualificação e persona (sessão expirada)";
const LOAD = "Chat Memory Manager: carregar sessão";
const SEED = "Code: selecionar mensagens de semeadura";
const STATE_BEFORE = "Data Table: conversa_estado (antes do buffer)";

function nodeByName(name: string) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

function mainTargets(source: string, output: number): Connection[] {
  return workflow.connections[source]?.main?.[output] ?? [];
}

function runCode(name: string, nodes: Record<string, unknown>, input: unknown[] = []) {
  const code = String(nodeByName(name).parameters.jsCode).replace(
    /'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g,
    (_m, file: string) => readInlinedModule(file)
  );
  const $ = (node: string) => {
    if (!(node in nodes)) throw new Error(`nó inesperado: ${node}`);
    return { first: () => ({ json: nodes[node] }) };
  };
  const $input = { first: () => ({ json: input[0] }), all: () => input.map((json) => ({ json })) };
  return new Function("$", "$input", code)($, $input) as { json: Record<string, unknown> }[];
}

const NOW = "2026-10-01T15:00:00.000Z";

function runCheck(lead: Record<string, unknown>, state: Record<string, unknown>) {
  const [out] = runCode(CHECK, {
    [STATE_BEFORE]: state,
    "Code: combinar evento e tenant": { sentAt: NOW },
    "Code: gate": lead,
  });
  return out.json;
}

describe("Code: sessão expirada? combina expiração e pedido de reset (DEVOLVER-01 AC5, AC7)", () => {
  it("inlina conduction.mjs e chama memoryResetDue", () => {
    const code = String(nodeByName(CHECK).parameters.jsCode);
    expect(code).toContain("__INLINE(conduction.mjs)__");
    expect(code).toContain("memoryResetDue(");
  });

  it("pedido mais novo que o atendido, sessão não expirada → expired true (AC5)", () => {
    const out = runCheck(
      { memoryResetRequestedAt: "2026-10-01T14:50:00.000Z" },
      { lastInboundAt: "2026-10-01T14:00:00.000Z", memoryResetAt: "2026-10-01T10:00:00.000Z" }
    );
    expect(out.expired).toBe(true);
  });

  it("pedido nunca atendido (memoryResetAt vazio) → expired true", () => {
    const out = runCheck({ memoryResetRequestedAt: "2026-10-01T14:50:00.000Z" }, { lastInboundAt: "2026-10-01T14:00:00.000Z" });
    expect(out.expired).toBe(true);
  });

  it("pedido igual ao atendido → expired false (AC7: a segunda mensagem não reconstrói)", () => {
    const out = runCheck(
      { memoryResetRequestedAt: "2026-10-01T14:50:00.000Z" },
      { lastInboundAt: "2026-10-01T14:55:00.000Z", memoryResetAt: "2026-10-01T14:50:00.000Z" }
    );
    expect(out.expired).toBe(false);
  });

  it("sem pedido e sessão dentro de 12h → expired false", () => {
    const out = runCheck({ memoryResetRequestedAt: null }, { lastInboundAt: "2026-10-01T14:00:00.000Z" });
    expect(out.expired).toBe(false);
  });

  it("sem pedido e gap acima de 12h → expired true (regra de sessão preservada)", () => {
    const out = runCheck({ memoryResetRequestedAt: null }, { lastInboundAt: "2026-10-01T02:00:00.000Z" });
    expect(out.expired).toBe(true);
  });

  it("o IF continua lendo a saída combinada $json.expired", () => {
    expect(JSON.stringify(nodeByName(CHECK_IF).parameters.conditions)).toContain("{{ $json.expired }}");
  });
});

describe("purga grava o pedido atendido (memoryResetAt)", () => {
  const columns = nodeByName(PURGE_STATE).parameters.columns as {
    value: Record<string, unknown>;
    schema: { id: string; type: string }[];
  };

  it("memoryResetAt está no schema como string", () => {
    expect(columns.schema.find((c) => c.id === "memoryResetAt")).toMatchObject({ id: "memoryResetAt", type: "string" });
  });

  it("memoryResetAt no value vem do pedido do lead, preservando o atendido quando não há pedido", () => {
    const value = String(columns.value.memoryResetAt);
    expect(value).toContain("$('Code: gate').first().json.memoryResetRequestedAt");
    expect(value).toContain(`$('${STATE_BEFORE}').first().json.memoryResetAt`);
  });

  it("a purga continua limpando perguntadosJson e aberturasJson", () => {
    expect(columns.value.perguntadosJson).toBe("[]");
    expect(columns.value.aberturasJson).toBe("[]");
  });
});

describe("arestas da purga (L-026)", () => {
  it("IF verdadeiro (saída 0) → purga da memória", () => {
    expect(mainTargets(CHECK_IF, 0)).toEqual([{ node: PURGE_MEMORY, type: "main", index: 0 }]);
  });

  it("purga da memória → purga de conversa_estado", () => {
    expect(mainTargets(PURGE_MEMORY, 0)).toEqual([{ node: PURGE_STATE, type: "main", index: 0 }]);
  });

  it("purga de conversa_estado → carregar sessão", () => {
    expect(mainTargets(PURGE_STATE, 0)).toEqual([{ node: LOAD, type: "main", index: 0 }]);
  });

  it("IF falso (saída 1) → carregar sessão, sem purga", () => {
    expect(mainTargets(CHECK_IF, 1)).toEqual([{ node: LOAD, type: "main", index: 0 }]);
  });
});

describe("semeadura usa toSeedMemoryItem (DEVOLVER-01 AC6)", () => {
  const code = String(nodeByName(SEED).parameters.jsCode);

  it("o ternário antigo não existe mais e toSeedMemoryItem é chamado", () => {
    expect(code).not.toContain("m.sender === 'agente' ? 'ai' : 'user'");
    expect(code).toContain("toSeedMemoryItem(");
  });

  it("mensagem humano entra como system atribuída ao corretor; desconhecida é descartada", () => {
    const history = [
      { sender: "lead", content: "tem vaga?", sentAt: "2026-10-01T14:00:00.000Z" },
      { sender: "humano", content: "o apartamento tem 3 vagas", authorName: "Ana", sentAt: "2026-10-01T14:01:00.000Z" },
      { sender: "agente", content: "Posso ajudar em algo mais?", sentAt: "2026-10-01T14:02:00.000Z" },
      { sender: "sistema", content: "x", sentAt: "2026-10-01T14:03:00.000Z" },
    ];
    const out = runCode(
      SEED,
      { "Code: combinar evento e tenant": { sentAt: NOW }, "Code: contexto do lead": { bufferArray: [{ sentAt: NOW }] } },
      history
    );
    expect(out.map((item) => item.json)).toEqual([
      { type: "user", message: "tem vaga?", nadaParaSemear: false },
      { type: "system", message: "Mensagem enviada ao lead por Ana, da equipe da imobiliária: o apartamento tem 3 vagas", nadaParaSemear: false },
      { type: "ai", message: "Posso ajudar em algo mais?", nadaParaSemear: false },
    ]);
  });
});
