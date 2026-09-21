import { describe, expect, it } from "vitest";
import principal from "../principal";

/**
 * Tool `consultar_documentos` no `crivo-agente-principal` (lote-12 — T28,
 * DOCCTX-01/DOCPROVA-01).
 *
 * A tool migrou de `GET ?modality=` para `POST {modality, question}`. Os
 * testes cobrem a estrutura emitida e, além dela, **executam** a expressão do
 * corpo com contextos falsos: é a única forma de provar que a modalidade real
 * atravessa, que a pergunta sai do buffer e que nenhum caminho produz uma
 * `question` vazia, que o contrato recusa por definição (AC9).
 */

type WorkflowJson = {
  nodes: {
    name: string;
    type: string;
    typeVersion: number;
    parameters: Record<string, unknown>;
    retryOnFail?: boolean;
    maxTries?: number;
    credentials?: Record<string, unknown>;
  }[];
  connections: Record<string, unknown>;
};

const workflow = principal.toJSON() as unknown as WorkflowJson;
const NODE_NAME = "consultar_documentos";

function node(name = NODE_NAME) {
  const found = workflow.nodes.find((n) => n.name === name);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${name}`);
  return found;
}

interface GateContext {
  modality?: unknown;
  bufferArray?: unknown;
  text?: unknown;
  tenantSlug?: string;
}

/**
 * Avalia a expressão n8n do corpo com um `Code: gate` falso. A expressão é
 * `={{ <js> }}`; tirar o invólucro e rodar o JS é o que transforma um teste
 * estrutural em teste de comportamento.
 */
function buildBody(ctx: GateContext): { modality: string; question: string } {
  const raw = node().parameters.jsonBody as string;
  const code = raw.replace(/^=\{\{/, "").replace(/\}\}$/, "").trim();
  const $ = (name: string) => {
    if (name !== "Code: gate") throw new Error(`nó inesperado na expressão: ${name}`);
    return { first: () => ({ json: ctx }) };
  };
  return new Function("$", `return (${code});`)($) as { modality: string; question: string };
}

describe("tool consultar_documentos — POST com pergunta (lote-12 T28)", () => {
  describe("estrutura da chamada", () => {
    it("usa POST no contrato de contexto", () => {
      expect(node().parameters.method).toBe("POST");
      expect(node().parameters.url).toContain("/context");
    });

    it("não resta nenhum vestígio do contrato GET anterior", () => {
      // Um `sendQuery` sobrevivente mandaria a pergunta para a query string,
      // que é exatamente o que a migração existe para evitar.
      expect("sendQuery" in node().parameters).toBe(false);
      expect("queryParameters" in node().parameters).toBe(false);
    });

    it("envia corpo JSON, não formulário", () => {
      expect(node().parameters.sendBody).toBe(true);
      expect(node().parameters.contentType).toBe("json");
      expect(node().parameters.specifyBody).toBe("json");
    });

    it("nenhum parâmetro vem do modelo", () => {
      // AD-018: o agente decide QUANDO chamar; nunca inventa argumento.
      expect(JSON.stringify(node().parameters)).not.toContain("fromAI");
      expect(JSON.stringify(node().parameters)).not.toContain("$fromAI");
    });

    it("o tenant vem de expressão do fluxo, nunca do modelo", () => {
      const headers = node().parameters.headerParameters as {
        parameters: { name: string; value: string }[];
      };
      const tenant = headers.parameters.find((p) => p.name === "X-Crivo-Tenant");
      expect(tenant?.value).toContain("$('Code: gate')");
      expect(tenant?.value).toContain("tenantSlug");
    });
  });

  describe("corpo enviado", () => {
    it("modalidade real do lead atravessa para o contrato", () => {
      for (const modality of ["novo", "usado", "ambos"]) {
        expect(buildBody({ modality, text: "oi" }).modality).toBe(modality);
      }
    });

    it("modalidade desconhecida cai no corpus inteiro, não em novo", () => {
      // O fallback antigo era 'novo' porque o GET não aceitava 'ambos'; ele
      // escondia todo documento exclusivo de usado.
      for (const modality of [null, undefined, "", "alugado", 42]) {
        expect(buildBody({ modality, text: "oi" }).modality).toBe("ambos");
      }
    });

    it("a pergunta é o buffer do turno, na ordem em que chegou", () => {
      const body = buildBody({
        modality: "novo",
        bufferArray: [{ text: "qual a comissão?" }, { text: "e o prazo?" }],
      });
      expect(body.question).toBe("qual a comissão?\ne o prazo?");
    });

    it("mensagens vazias do buffer não entram na pergunta", () => {
      const body = buildBody({
        modality: "novo",
        bufferArray: [{ text: "" }, { text: "vale a pena?" }, {}, null],
      });
      expect(body.question).toBe("vale a pena?");
    });

    it("sem buffer, a pergunta cai no texto do turno", () => {
      expect(buildBody({ modality: "novo", bufferArray: [], text: "tem financiamento?" }).question)
        .toBe("tem financiamento?");
    });

    it("nenhum caminho produz pergunta vazia, que o contrato recusa", () => {
      const vazios: GateContext[] = [
        {},
        { bufferArray: [] },
        { bufferArray: [{ text: "   " }], text: "   " },
        { text: null, bufferArray: null },
      ];
      for (const ctx of vazios) {
        const question = buildBody(ctx).question;
        expect(question.trim().length).toBeGreaterThan(0);
      }
    });

    it("a pergunta é cortada no teto de 4.096 caracteres do contrato", () => {
      const body = buildBody({ modality: "novo", bufferArray: [{ text: "a".repeat(9000) }] });
      expect(body.question).toHaveLength(4096);
    });

    it("o corpo carrega exatamente modalidade e pergunta, nada além", () => {
      expect(Object.keys(buildBody({ modality: "novo", text: "oi" })).sort()).toEqual([
        "modality",
        "question",
      ]);
    });
  });

  describe("invariantes preservadas", () => {
    it("tipo, versão e retry continuam no lugar que o schema aplica", () => {
      // Aninhados em `parameters`, o node HTTP Request ignora os dois — é o
      // bug que o commit a80760c corrigiu nesta mesma tool.
      expect(node().type).toBe("n8n-nodes-base.httpRequestTool");
      expect(node().typeVersion).toBe(4.5);
      expect(node().retryOnFail).toBe(true);
      expect(node().maxTries).toBe(2);
      expect("retryOnFail" in node().parameters).toBe(false);
    });

    it("neverError e credencial de serviço continuam configurados", () => {
      expect(node().parameters.options).toMatchObject({
        response: { response: { neverError: true } },
      });
      expect(node().credentials).toHaveProperty("httpHeaderAuth");
    });

    it("o modelo publicado segue no snapshot datado da AD-026", () => {
      const model = workflow.nodes.find((n) => n.type.includes("lmChatOpenAi"));
      expect(JSON.stringify(model?.parameters)).toContain("gpt-5.4-nano-2026-03-17");
      expect(JSON.stringify(model?.parameters)).toContain("reasoningEffort");
    });

    it("memória e as demais tools continuam presentes", () => {
      const names = workflow.nodes.map((n) => n.name);
      for (const required of ["buscar_imoveis", "responder_lead"]) {
        expect(names).toContain(required);
      }
      expect(workflow.nodes.some((n) => n.type.includes("memoryPostgresChat"))).toBe(true);
    });

    it("a tool continua conectada ao agente", () => {
      expect(JSON.stringify(workflow.connections)).toContain(NODE_NAME);
    });
  });
});
