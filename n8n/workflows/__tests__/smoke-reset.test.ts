import { describe, expect, it } from "vitest";
import smokeReset from "../smoke-reset";

/**
 * `crivo-smoke-reset` — limpeza dos alvos 1 e 2 do checklist da AD-027
 * (`n8n/smoke/roteiro.md` §9).
 *
 * O que estes testes fixam é o que torna a rotina segura: ela apaga
 * exatamente uma sessão de memória e exatamente uma linha de Data Table, as
 * duas do alvo de smoke — e nada mais. Um workflow destrutivo que apagasse
 * por `anyCondition`, ou cujo `sessionKey` escorregasse para outro par
 * tenant/waId, seria indistinguível deste num teste que só contasse nós.
 */

type WorkflowJson = {
  nodes: {
    name: string;
    type: string;
    typeVersion: number;
    parameters: Record<string, unknown>;
  }[];
  connections: Record<string, Record<string, ({ node: string }[] | null)[]>>;
};

const workflow = smokeReset.toJSON() as unknown as WorkflowJson;

const SESSION_KEY = "triangulo:553499532444";
const CONVERSA_ESTADO_TABLE_ID = "ZsplBxJjXv3kwKZ8";

function nodeByName(name: string) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

describe("crivo-smoke-reset — purga da sessão de memória (alvo 1)", () => {
  const memoryManager = () =>
    nodeByName("Chat Memory Manager: purgar sessão do smoke");

  it("é um memoryManager em modo delete/all — o mesmo mecanismo das purgas de principal.ts", () => {
    expect(memoryManager().type).toBe("@n8n/n8n-nodes-langchain.memoryManager");
    expect(memoryManager().parameters.mode).toBe("delete");
    expect(memoryManager().parameters.deleteMode).toBe("all");
  });

  it("a memória anexada aponta para a sessão do alvo de smoke, por chave exata", () => {
    const memoryNode = nodeByName("Postgres Chat Memory (alvo do smoke)");

    expect(memoryNode.type).toBe("@n8n/n8n-nodes-langchain.memoryPostgresChat");
    expect(memoryNode.parameters.sessionIdType).toBe("customKey");
    expect(memoryNode.parameters.sessionKey).toBe(SESSION_KEY);
  });
});

describe("crivo-smoke-reset — remoção da linha de conversa_estado (alvo 2)", () => {
  const dataTable = () => nodeByName("Data Table: apagar linha de conversa_estado");

  it("apaga linha na Data Table certa, pela operação deleteRows", () => {
    expect(dataTable().type).toBe("n8n-nodes-base.dataTable");
    expect(dataTable().parameters.resource).toBe("row");
    expect(dataTable().parameters.operation).toBe("deleteRows");

    const table = dataTable().parameters.dataTableId as { value: string };
    expect(table.value).toBe(CONVERSA_ESTADO_TABLE_ID);
  });

  it("casa pelas DUAS condições juntas — com anyCondition apagaria o mesmo waId de outro tenant", () => {
    expect(dataTable().parameters.matchType).toBe("allConditions");

    const filters = dataTable().parameters.filters as {
      conditions: { keyName: string; condition: string; keyValue: string }[];
    };
    expect(filters.conditions).toEqual([
      { keyName: "tenantSlug", condition: "eq", keyValue: "triangulo" },
      { keyName: "waId", condition: "eq", keyValue: "553499532444" },
    ]);
  });
});

describe("crivo-smoke-reset — alvo fixo e escopo mínimo", () => {
  it("não expõe nenhum parâmetro vindo do modelo ou do chamador ($fromAI ausente em todo o grafo)", () => {
    expect(JSON.stringify(workflow)).not.toContain("$fromAI");
  });

  it("o grafo tem só o necessário: trigger, purga de memória, exclusão da linha, e a memória anexada", () => {
    expect(workflow.nodes.map((n) => n.name).sort()).toEqual(
      [
        "Chat Memory Manager: purgar sessão do smoke",
        "Data Table: apagar linha de conversa_estado",
        "Executar limpeza do smoke",
        "Postgres Chat Memory (alvo do smoke)",
      ].sort()
    );
  });

  it("dispara por trigger manual — nunca por webhook exposto nem por agenda", () => {
    expect(nodeByName("Executar limpeza do smoke").type).toBe(
      "n8n-nodes-base.manualTrigger"
    );
    expect(workflow.nodes.filter((n) => n.type.includes("webhook"))).toEqual([]);
    expect(workflow.nodes.filter((n) => n.type.includes("scheduleTrigger"))).toEqual([]);
  });

  it("a ordem é memória e depois Data Table, na mesma cadeia do trigger", () => {
    expect(workflow.connections["Executar limpeza do smoke"].main[0]).toEqual([
      { node: "Chat Memory Manager: purgar sessão do smoke", type: "main", index: 0 },
    ]);
    expect(
      workflow.connections["Chat Memory Manager: purgar sessão do smoke"].main[0]
    ).toEqual([
      { node: "Data Table: apagar linha de conversa_estado", type: "main", index: 0 },
    ]);
  });
});
