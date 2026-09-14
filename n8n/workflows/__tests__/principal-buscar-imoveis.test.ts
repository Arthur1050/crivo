import { describe, expect, it } from "vitest";
import principal from "../principal";

/**
 * Tool `buscar_imoveis` no `crivo-agente-principal` (lote-11 — T22, BUSCA-04).
 *
 * Cobre estrutura: nome, tipo/versão do nó, origem de CADA parâmetro (um
 * `$fromAI` por critério, nunca um blob único — AC4), o tenant vindo de
 * expressão do fluxo e nunca do modelo (AC2/AC3), `neverError` (AC5), e
 * `retryOnFail`/`maxTries` no lugar certo do JSON emitido — é o bug que o
 * commit `a80760c` corrigiu em `consultar_documentos`: aninhados dentro de
 * `parameters`, o schema do node HTTP Request não os aplica.
 */

type WorkflowJson = {
  nodes: {
    name: string;
    type: string;
    typeVersion: number;
    parameters: Record<string, unknown>;
    retryOnFail?: boolean;
    maxTries?: number;
  }[];
};

const workflow = principal.toJSON() as unknown as WorkflowJson;
const NODE_NAME = "buscar_imoveis";

function node() {
  const found = workflow.nodes.find((n) => n.name === NODE_NAME);
  if (found === undefined) throw new Error(`nó ausente no workflow: ${NODE_NAME}`);
  return found;
}

function queryParam(name: string): string {
  const params = node().parameters.queryParameters as { parameters: { name: string; value: string }[] };
  const found = params.parameters.find((p) => p.name === name);
  if (found === undefined) throw new Error(`parâmetro de query ausente: ${name}`);
  return found.value;
}

describe("buscar_imoveis — nó existe com o tipo/versão certos (BUSCA-04 AC1)", () => {
  it("é httpRequestTool v4.5, mesmo padrão de consultar_documentos", () => {
    expect(node().type).toBe("n8n-nodes-base.httpRequestTool");
    expect(node().typeVersion).toBe(4.5);
  });

  it("aponta para GET /properties do contrato", () => {
    expect(node().parameters.method).toBe("GET");
    expect(String(node().parameters.url)).toMatch(/\/api\/v1\/properties$/);
  });
});

describe("buscar_imoveis — retryOnFail/maxTries no lugar certo (o bug do commit a80760c)", () => {
  it("retryOnFail e maxTries estão no NÓ, não dentro de parameters", () => {
    expect(node().retryOnFail).toBe(true);
    expect(node().maxTries).toBe(2);
    expect(node().parameters).not.toHaveProperty("retryOnFail");
    expect(node().parameters).not.toHaveProperty("maxTries");
  });
});

describe("buscar_imoveis — origem de cada parâmetro de critério (BUSCA-04 AC4 — um por critério)", () => {
  const criterios = ["modalidade", "tipo", "bairro", "cidade", "precoMin", "precoMax", "quartosMin"];

  it.each(criterios)("o critério '%s' é seu próprio parâmetro de query, vindo de $fromAI", (nome) => {
    const value = queryParam(nome);
    expect(value).toContain("$fromAI");
    expect(value).toContain(`'${nome}'`);
  });

  it("nenhum parâmetro de query além dos 7 critérios declarados", () => {
    const params = node().parameters.queryParameters as { parameters: { name: string }[] };
    expect(params.parameters.map((p) => p.name).sort()).toEqual([...criterios].sort());
  });
});

describe("buscar_imoveis — tenant nunca vem do modelo (BUSCA-04 AC2/AC3)", () => {
  it("o header X-Crivo-Tenant vem de expressão do fluxo (Code: gate), não de $fromAI", () => {
    const headers = node().parameters.headerParameters as { parameters: { name: string; value: string }[] };
    const tenantHeader = headers.parameters.find((p) => p.name === "X-Crivo-Tenant");

    expect(tenantHeader?.value).toBe("={{ $('Code: gate').first().json.tenantSlug }}");
    expect(tenantHeader?.value).not.toContain("$fromAI");
  });
});

describe("buscar_imoveis — falha da rota não aborta o turno (BUSCA-04 AC5)", () => {
  it("neverError está ligado", () => {
    const options = node().parameters.options as { response?: { response?: { neverError?: boolean } } };
    expect(options.response?.response?.neverError).toBe(true);
  });
});

describe("buscar_imoveis — orientação de filtros aprovada T33 (BUSCA-05 AC21/23)", () => {
  const description = String(node().parameters.toolDescription);

  it("omite filtros desconhecidos sem strings vazias ou zero", () => {
    expect(description).toContain("Omitir filtros desconhecidos: não enviar strings vazias ou números zero como preenchimento");
    expect(description).toContain("Todos os parâmetros são opcionais");
    expect(description).toContain("Preço em reais (nunca centavos)");
  });
  it("orienta cidade confirmada sem UF e não infere preferência de imóvel anterior", () => {
    expect(description).toContain("Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada quando confirmada pelo lead");
    expect(queryParam("cidade")).toContain("sem /UF");
    expect(queryParam("cidade")).toContain("Não inferir de imóvel apresentado");
  });
  it("rejeita termos de proximidade como bairro e omite bairro na expansão", () => {
    expect(description).toContain("Bairro aceita um nome de bairro real, nunca expressões de proximidade");
    expect(queryParam("bairro")).toContain("Nunca usar próximo, arredores ou bairros próximos como nome");
    expect(queryParam("bairro")).toContain("Na busca alternativa sem bairro específico, omita bairro");
    expect(description).toContain("A tool não calcula distância ou adjacência");
  });
  it.each(["modalidade", "tipo", "bairro", "cidade"])("orienta omitir '%s' desconhecido sem string vazia", (name) => {
    expect(queryParam(name)).toContain("Se desconhecido, omita; não enviar string vazia");
  });
  it.each(["precoMin", "precoMax", "quartosMin"])("orienta omitir '%s' desconhecido sem zero", (name) => {
    expect(queryParam(name)).toContain("Se desconhecido, omita; não enviar zero");
    expect(queryParam(name)).toContain("inteiro maior que zero");
  });
  it("erro não significa ausência de imóveis", () => {
    expect(description).toContain("Uma falha técnica não é resultado vazio; não invente ausência de imóveis");
  });
});

describe("buscar_imoveis — está registrada como tool do AI Agent, junto das 5 existentes (BUSCA-04 AC11)", () => {
  it("as 6 tools (5 antigas + buscar_imoveis) existem no grafo pelo nome", () => {
    const nomes = workflow.nodes.map((n) => n.name);
    for (const tool of [
      "registrar_qualificacao",
      "escalar_para_humano",
      "consultar_documentos",
      "buscar_imoveis",
      "responder_lead",
      "agendar_reuniao",
    ]) {
      expect(nomes).toContain(tool);
    }
  });
});
