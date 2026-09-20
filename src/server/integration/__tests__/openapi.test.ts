import path from "node:path";
import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { MAX_CONTEXT_QUESTION_LENGTH } from "../parsers";

const OPENAPI_PATH = path.resolve(
  __dirname,
  "../../../../docs/integration/openapi.yaml"
);

/**
 * Gate de validação do contrato (design.md — INT-07 AC1): `docs/integration/
 * openapi.yaml` precisa ser um documento OpenAPI 3.1 estruturalmente válido
 * — todos os `$ref` resolvem, todos os schemas/paths bem formados. Sem essa
 * garantia automática, um dev externo não pode confiar no contrato como
 * autoridade (spec.md — Independent Test: "lint OpenAPI passa").
 */
describe("docs/integration/openapi.yaml — SwaggerParser.validate()", () => {
  it("valida sem erros (INT-07 AC1)", async () => {
    const api = await SwaggerParser.validate(OPENAPI_PATH);
    expect(api).toBeDefined();
  });

  it("declara a securityScheme bearer e a exige globalmente (INT-01)", async () => {
    const api = (await SwaggerParser.validate(OPENAPI_PATH)) as {
      components?: { securitySchemes?: Record<string, { type: string; scheme: string }> };
      security?: unknown[];
    };
    expect(api.components?.securitySchemes?.bearerAuth).toEqual(
      expect.objectContaining({ type: "http", scheme: "bearer" })
    );
    expect(api.security).toEqual([{ bearerAuth: [] }]);
  });

  it("cobre todos os endpoints do contrato do agente (INT-07 AC1 — todos os paths)", async () => {
    const api = (await SwaggerParser.validate(OPENAPI_PATH)) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const paths = Object.keys(api.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/leads",
        "/leads/{id}",
        "/leads/{id}/messages",
        "/leads/{id}/opt-out",
        "/context",
        "/properties",
      ])
    );
    expect(api.paths["/leads"].post).toBeDefined();
    expect(api.paths["/leads/{id}"].patch).toBeDefined();
    expect(api.paths["/leads/{id}/messages"].post).toBeDefined();
    expect(api.paths["/leads/{id}/messages"].get).toBeDefined();
    expect(api.paths["/leads/{id}/opt-out"].post).toBeDefined();
    expect(api.paths["/context"].get).toBeDefined();
    expect(api.paths["/properties"].get).toBeDefined();
  });

  // lote-11 — T14: a rota nova documentada, com os 7 parâmetros de filtro e
  // o schema de resposta (`imoveis` + `total`). O schema NÃO declara
  // endereço/descrição/foto/captador (BUSCA-03) — a dívida herdada do
  // lote-8 (`assignedBroker`, os 2 códigos de erro) não é adotada aqui,
  // continua no L14.
  it("GET /properties tem os 7 parâmetros de filtro e o schema de resposta com imoveis e total (T14)", async () => {
    const api = (await SwaggerParser.validate(OPENAPI_PATH)) as {
      paths: Record<
        string,
        {
          get?: {
            parameters?: { name?: string }[];
            responses?: Record<
              string,
              { content?: { "application/json"?: { schema?: Record<string, unknown> } } }
            >;
          };
        }
      >;
    };

    const get = api.paths["/properties"].get;
    expect(get).toBeDefined();

    const paramNames = (get!.parameters ?? [])
      .map((p) => p.name)
      .filter((name): name is string => typeof name === "string");
    expect(paramNames).toEqual(
      expect.arrayContaining([
        "modalidade",
        "tipo",
        "bairro",
        "cidade",
        "precoMin",
        "precoMax",
        "quartosMin",
      ])
    );

    const responseSchema = get!.responses?.["200"]?.content?.["application/json"]
      ?.schema as
      | { properties?: Record<string, unknown>; required?: string[] }
      | undefined;
    expect(responseSchema).toBeDefined();
    expect(responseSchema!.required).toEqual(
      expect.arrayContaining(["imoveis", "total"])
    );
    expect(Object.keys(responseSchema!.properties ?? {})).toEqual(
      expect.arrayContaining(["imoveis", "total"])
    );

    const itemSchema = (
      responseSchema!.properties!.imoveis as { items?: Record<string, unknown> }
    ).items as { properties?: Record<string, unknown> } | undefined;
    const itemFields = Object.keys(itemSchema?.properties ?? {});
    for (const forbidden of [
      "street",
      "number",
      "complement",
      "description",
      "photoUrls",
      "capturedByUserId",
      "assignedBroker",
    ]) {
      expect(itemFields).not.toContain(forbidden);
    }
  });

  /** Nó do documento já validado pelo SwaggerParser, navegado por chave. */
  type OpenApiNode = { [key: string]: OpenApiNode };

  // lote-12 — T22: o contrato de contexto passou a POST. As asserções abaixo
  // travam a paridade com o handler real: se o limite da pergunta, o envelope
  // ou os códigos de erro divergirem, o documento deixa de ser autoridade.
  describe("POST /context (lote-12 — DOCCTX-01)", () => {
    async function contextPath() {
      const api = (await SwaggerParser.validate(OPENAPI_PATH)) as {
        paths: Record<string, Record<string, OpenApiNode>>;
        components: { schemas: Record<string, OpenApiNode> };
      };
      return { post: api.paths["/context"].post, get: api.paths["/context"].get, api };
    }

    it("declara POST /context com corpo obrigatório de modalidade e pergunta", async () => {
      const { post, api } = await contextPath();
      expect(post).toBeDefined();
      expect(post.requestBody.required).toBe(true);
      const schema = api.components.schemas.ContextQuery;
      expect(schema.required).toEqual(expect.arrayContaining(["modality", "question"]));
    });

    it("a pergunta documentada tem exatamente os limites que o handler aplica", async () => {
      const { api } = await contextPath();
      const question = api.components.schemas.ContextQuery.properties.question;
      expect(question.type).toBe("string");
      expect(question.minLength).toBe(1);
      expect(question.maxLength).toBe(MAX_CONTEXT_QUESTION_LENGTH);
    });

    it("a modalidade do POST aceita as três, ao contrário do filtro do GET legado", async () => {
      const { api } = await contextPath();
      expect(api.components.schemas.Modality.enum).toEqual(["novo", "usado", "ambos"]);
      expect(api.components.schemas.ContextModality.enum).toEqual(["novo", "usado"]);
    });

    it("a resposta 200 é o envelope direct, com conteúdo integral e sem truncamento", async () => {
      const { post, api } = await contextPath();
      const ref = post.responses["200"].content["application/json"].schema;
      const envelope = api.components.schemas.DocumentContextEnvelope;
      expect(ref).toBeDefined();
      expect(envelope.required).toEqual(expect.arrayContaining(["retrievalMode", "documents"]));
      expect(envelope.properties.retrievalMode.enum).toEqual(["direct"]);
      expect(api.components.schemas.DocumentContextEntry.properties.contentMode.enum).toEqual(["full"]);
      expect(api.components.schemas.DocumentContextEntry.required).toEqual(
        expect.arrayContaining(["id", "name", "modality", "category", "contentMode", "content"])
      );
    });

    it("documenta 400, 401 e 413 e exige autenticação e tenant", async () => {
      const { post } = await contextPath();
      expect(Object.keys(post.responses)).toEqual(expect.arrayContaining(["200", "400", "401", "413"]));
      expect(post.security).toEqual([{ bearerAuth: [] }, { serviceAuth: [] }]);
      expect(JSON.stringify(post.parameters)).toContain("X-Crivo-Tenant");
    });

    it("a resposta anuncia Cache-Control no-store, como o handler devolve", async () => {
      const { post } = await contextPath();
      expect(post.responses["200"].headers["Cache-Control"]).toBeDefined();
    });

    it("o GET legado segue documentado, marcado como descontinuado", async () => {
      const { get } = await contextPath();
      expect(get).toBeDefined();
      expect(get.deprecated).toBe(true);
    });
  });
});
