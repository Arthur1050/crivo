import { describe, expect, it } from "vitest";
import principal from "../principal";

/**
 * Nó de modelo do `crivo-agente-principal` (lote-10 T3 — MOD-01).
 *
 * A troca de família de modelo (Gemini -> OpenAI) é uma mudança de UM nó, e a
 * promessa do requisito tem duas metades: o nó novo está certo (a), e **nada
 * mais no grafo mudou** (b). A segunda metade é a que precisa de teste — é
 * fácil trocar o nó e, sem perceber, derrubar uma tool, a memória, ou uma
 * aresta. Estes testes leem o grafo que o SDK emite (o mesmo `toJSON` que o
 * inliner leva para `n8n/generated/`), e fixam os dois lados.
 *
 * As contagens 61/75 (lote-10) não são inventadas aqui: são as medidas em
 * `n8n/smoke/evidencia.md` §2.2 (T2), batendo entre `n8n/generated/
 * principal.ts` e o workflow publicado na instância, ANTES da troca. É esse
 * par que faz o teste discriminar MOD-01 AC2 ("nenhum outro nó do grafo
 * muda") em vez de só repetir a implementação.
 *
 * lote-11 (T22 — BUSCA-04 AC11): a tool `buscar_imoveis` some as contagens
 * para 62/76 — exatamente +1 nó e +1 conexão (a aresta `ai_tool` da tool nova
 * até o `AI Agent`), medido via `principal.toJSON()` nesta própria janela.
 */

const MODEL_NODE = "OpenAI Chat Model";
const MODEL_ID = "gpt-5.4-nano-2026-03-17";
const MEMORY_NODE = "Postgres Chat Memory";

/** lote-10 (T2): 61/75. lote-11 (T22): +1 tool (`buscar_imoveis`) → 62/76. */
const NOS_ESPERADOS = 62;
const CONEXOES_ESPERADAS = 76;

const TOOLS = [
  "registrar_qualificacao",
  "escalar_para_humano",
  "consultar_documentos",
  "buscar_imoveis",
  "responder_lead",
  "agendar_reuniao",
];

type WorkflowJson = {
  nodes: {
    name: string;
    type: string;
    typeVersion: number;
    parameters: Record<string, unknown>;
  }[];
  connections: Record<string, Record<string, ({ node: string }[] | null)[]>>;
};

const workflow = principal.toJSON() as unknown as WorkflowJson;

function nodeByName(name: string) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

/** Total de arestas do grafo, somando TODOS os tipos de conexão (main, ai_*). */
function contarConexoes(): number {
  let total = 0;
  for (const porTipo of Object.values(workflow.connections)) {
    for (const ramos of Object.values(porTipo)) {
      for (const ramo of ramos) {
        total += ramo?.length ?? 0;
      }
    }
  }
  return total;
}

describe("nó de modelo do agente é o OpenAI alvo (MOD-01 AC1)", () => {
  it("é `lmChatOpenAi` v1.3, e não sobrou nenhum nó Gemini no grafo", () => {
    const modelo = nodeByName(MODEL_NODE);

    expect(modelo.type).toBe("@n8n/n8n-nodes-langchain.lmChatOpenAi");
    expect(modelo.typeVersion).toBe(1.3);
    expect(
      workflow.nodes.filter((n) => n.type.includes("lmChatGoogleGemini"))
    ).toEqual([]);
  });

  it("o modelo é o snapshot datado, declarado como resource locator", () => {
    const model = nodeByName(MODEL_NODE).parameters.model as {
      __rl: boolean;
      mode: string;
      value: string;
      cachedResultName: string;
    };

    expect(model.__rl).toBe(true);
    expect(model.mode).toBe("list");
    expect(model.value).toBe(MODEL_ID);
  });

  it("o rótulo exibido (`cachedResultName`) é o mesmo id do `value` — divergência aqui é troca pela UI", () => {
    const model = nodeByName(MODEL_NODE).parameters.model as {
      value: string;
      cachedResultName: string;
    };

    expect(model.cachedResultName).toBe(model.value);
  });

  it("as options são `reasoningEffort: low` + `timeout: 120000`, sem `temperature`", () => {
    const options = nodeByName(MODEL_NODE).parameters.options as Record<string, unknown>;

    expect(options.reasoningEffort).toBe("low");
    expect(options.timeout).toBe(120000);
    expect(options).not.toHaveProperty("temperature");
  });
});

describe("a troca de modelo não mexeu em mais nada do grafo (MOD-01 AC2)", () => {
  it("as tools do agente continuam presentes, pelo nome", () => {
    const nomes = workflow.nodes.map((n) => n.name);

    for (const ferramenta of TOOLS) {
      expect(nomes).toContain(ferramenta);
    }
  });

  it("a memória continua `memoryPostgresChat` com a mesma sessionKey composta", () => {
    const memoria = nodeByName(MEMORY_NODE);

    expect(memoria.type).toBe("@n8n/n8n-nodes-langchain.memoryPostgresChat");
    expect(memoria.parameters.sessionIdType).toBe("customKey");
    expect(memoria.parameters.sessionKey).toBe(
      "={{ $('Code: gate').first().json.tenantSlug }}:{{ $('Code: gate').first().json.waId }}"
    );
  });

  it("o grafo continua com 62 nós e 76 conexões — as contagens medidas nesta janela (T22 do lote-11)", () => {
    expect(workflow.nodes).toHaveLength(NOS_ESPERADOS);
    expect(contarConexoes()).toBe(CONEXOES_ESPERADAS);
  });
});

describe("escalar_para_humano — resposta recortada na fronteira (achado real, cenário 2 lote-10)", () => {
  const graph = principal.toJSON() as WorkflowJson;
  const node = graph.nodes.find((n) => n.name === "escalar_para_humano");

  it("o nó existe e é o httpRequestTool esperado", () => {
    expect(node).toBeDefined();
    expect(node?.type).toBe("n8n-nodes-base.httpRequestTool");
  });

  it("recorta a resposta antes de ela chegar ao modelo", () => {
    expect(node?.parameters.optimizeResponse).toBe(true);
    expect(node?.parameters.responseType).toBe("json");
  });

  it("remove os campos que identificam o LEAD — é o que impedia o nome errado", () => {
    expect(node?.parameters.fieldsToInclude).toBe("except");
    const fields = String(node?.parameters.fields).split(",").map((f) => f.trim());
    expect(fields).toContain("name");
    expect(fields).toContain("contactName");
  });

  it("NÃO usa `selected`: `except` preserva o `code` do problem+json do 409 (AD-013)", () => {
    expect(node?.parameters.fieldsToInclude).not.toBe("selected");
    const fields = String(node?.parameters.fields).split(",").map((f) => f.trim());
    expect(fields).not.toContain("code");
    expect(fields).not.toContain("assignedBroker");
  });

  it("mantém `neverError` — sem ele o 409 perde o corpo e o `code` (lote-6c)", () => {
    const options = node?.parameters.options as { response?: { response?: { neverError?: boolean } } };
    expect(options?.response?.response?.neverError).toBe(true);
  });
});
