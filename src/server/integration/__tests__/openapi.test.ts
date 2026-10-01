import "dotenv/config";
import path from "node:path";
import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { senderEnum } from "../../../db/schema";
import { AGENT_WRITABLE_SENDERS, MAX_CONTEXT_QUESTION_LENGTH } from "../parsers";
import { TITLES } from "../problem";

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
    expect(api.paths["/context"].post).toBeDefined();
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

    it("a modalidade do POST aceita as três", async () => {
      const { api } = await contextPath();
      expect(api.components.schemas.Modality.enum).toEqual(["novo", "usado", "ambos"]);
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

    // lote-12 — T36: o GET legado saiu do contrato junto com o handler.
    it("o GET legado não é mais documentado, nem seus schemas", async () => {
      const { get, api } = await contextPath();
      expect(get).toBeUndefined();
      expect(api.components.schemas.ContextModality).toBeUndefined();
      expect(api.components.schemas.ContextDocument).toBeUndefined();
    });
  });
});

// lote-14 — CONTRATO-01 (T13): o contrato volta a ser autoridade. Dois testes
// de paridade com o código (enums) e asserções de presença do que o lote muda.
describe("docs/integration/openapi.yaml — paridade e presença (lote-14 — CONTRATO-01)", () => {
  type Schema = {
    enum?: string[];
    description?: string;
    required?: string[];
    properties?: Record<string, Schema & { $ref?: string }>;
    allOf?: Schema[];
    pattern?: string;
  };
  type Operation = {
    parameters?: { name?: string; required?: boolean; in?: string }[];
    responses: Record<
      string,
      { content?: { "application/json"?: { schema?: Schema } } }
    >;
  };
  type Api = {
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, Schema> };
  };

  async function load(): Promise<Api> {
    return (await SwaggerParser.validate(OPENAPI_PATH)) as unknown as Api;
  }

  const sorted = (values: readonly string[]) => [...values].sort();

  it("o enum ProblemCode do YAML é exatamente o conjunto de chaves de TITLES (AC2)", async () => {
    const api = await load();
    expect(sorted(api.components.schemas.ProblemCode.enum ?? [])).toEqual(
      sorted(Object.keys(TITLES))
    );
  });

  it("o enum Sender do YAML é exatamente senderEnum.enumValues (AC3)", async () => {
    const api = await load();
    expect(sorted(api.components.schemas.Sender.enum ?? [])).toEqual(
      sorted(senderEnum.enumValues)
    );
  });

  it("o PATCH /leads/{id} documenta assignedBroker na resposta 200 (AC1)", async () => {
    const api = await load();
    const schema =
      api.paths["/leads/{id}"].patch.responses["200"].content?.["application/json"]?.schema;
    const properties = (schema?.allOf ?? []).flatMap((part) =>
      Object.keys(part.properties ?? {})
    );
    expect(properties).toContain("assignedBroker");
    expect(Object.keys(api.components.schemas.AssignedBroker.properties ?? {}).sort()).toEqual([
      "email",
      "name",
    ]);
  });

  it("o Lead documenta humanTakeoverAt e memoryResetRequestedAt, sempre presentes (AC4)", async () => {
    const api = await load();
    const lead = api.components.schemas.Lead;
    expect(Object.keys(lead.properties ?? {})).toEqual(
      expect.arrayContaining(["humanTakeoverAt", "memoryResetRequestedAt"])
    );
    expect(lead.required).toEqual(
      expect.arrayContaining(["humanTakeoverAt", "memoryResetRequestedAt"])
    );
  });

  it("humano é só leitura: descrito no Sender, ausente do sender de POST /messages (AC6)", async () => {
    const api = await load();
    expect(api.components.schemas.Sender.description).toMatch(/humano.*só leitura/s);
    expect(sorted(api.components.schemas.AgentWritableSender.enum ?? [])).toEqual(
      sorted(AGENT_WRITABLE_SENDERS)
    );
    expect(api.components.schemas.AgentWritableSender.enum).not.toContain("humano");
    // O sender do corpo do POST aponta para o enum de escrita; o da Message lida, para o completo.
    const request = JSON.stringify(api.components.schemas.MessageCreateRequest.properties?.sender);
    expect(request).toContain("agente");
    expect(request).not.toContain("humano");
    expect(JSON.stringify(api.components.schemas.Message.properties?.sender)).toContain("humano");
  });

  it("a Message documenta authorName, sempre presente e anulável (T11)", async () => {
    const api = await load();
    expect(Object.keys(api.components.schemas.Message.properties ?? {})).toContain("authorName");
    expect(api.components.schemas.Message.required).toContain("authorName");
  });

  it("documenta GET /leads/{id}, GET /memory-resets e whatsappPhoneNumberId opcional em POST /leads (AC7)", async () => {
    const api = await load();
    expect(api.paths["/leads/{id}"].get).toBeDefined();

    const memoryResets = api.paths["/memory-resets"].get;
    expect(memoryResets).toBeDefined();
    const since = (memoryResets.parameters ?? []).find((p) => p.name === "since");
    expect(since).toEqual(expect.objectContaining({ in: "query", required: true }));
    expect(Object.keys(memoryResets.responses)).toEqual(
      expect.arrayContaining(["200", "400", "401"])
    );

    const create = api.components.schemas.LeadCreateRequest;
    expect(Object.keys(create.properties ?? {})).toContain("whatsappPhoneNumberId");
    expect(create.required).not.toContain("whatsappPhoneNumberId");
    expect(create.properties?.whatsappPhoneNumberId.pattern).toBe("^[0-9]{1,32}$");
  });
});
