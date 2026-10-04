import "dotenv/config";
import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";
import { agentPhaseEnum, reengagementStateEnum, senderEnum } from "../../../db/schema";
import { AGENT_WRITABLE_SENDERS, MAX_BODY_BYTES, MAX_CONTEXT_QUESTION_LENGTH, parseAgentState, parseAutomationCandidatesQuery, parsePreparationFailure, parseReengagementAcknowledgement, parseReengagementPrepare, parseReengagementSend, parseSessionContext, parseUsageSync } from "../parsers";
import { FIELD_LABELS } from "../../../../n8n/src/phase.mjs";
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
      expect(schema.required).not.toContain("reservedContextBytes");
      expect(schema.properties.reservedContextBytes).toMatchObject({ type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
      expect(post.responses["503"]).toBeDefined();
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
    type?: string | string[];
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
      { content?: { "application/json"?: { schema?: Schema } }; headers?: Record<string, { schema?: Schema }> }
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

  it("T30 documenta canal opcional/nulo e resposta POST aditiva com âncora/revisão", async () => {
    const api = await load(), input = api.components.schemas.MessageCreateRequest;
    expect(input.required).not.toContain("whatsappPhoneNumberId");
    expect(input.properties?.whatsappPhoneNumberId).toMatchObject({ type: ["string", "null"], pattern: "^\\s*[0-9]{1,32}\\s*$" });
    const channelPattern = new RegExp(input.properties!.whatsappPhoneNumberId.pattern!);
    expect(channelPattern.test(" 123 ")).toBe(true);
    for (const invalid of ["", " ", "1".repeat(33), "123x"]) expect(channelPattern.test(invalid)).toBe(false);
    expect(api.components.schemas.Message.required).toContain("whatsappPhoneNumberId");
    const post = api.paths["/leads/{id}/messages"].post;
    expect(post.responses["409"]).toBeDefined();
    for (const status of ["201", "200"]) {
      const schema = post.responses[status].content?.["application/json"]?.schema;
      expect(schema?.allOf?.[0].required).toContain("authorName");
      expect(schema?.allOf?.[1].required).toEqual(["anchorMessageId", "agentStateRevision"]);
      expect(schema?.allOf?.[1].properties?.anchorMessageId.type).toEqual(["string", "null"]);
      expect(schema?.allOf?.[1].properties?.agentStateRevision.type).toEqual(["integer", "null"]);
    }
  });

  it("T30 GET preserva array e documenta headers para metadata inclusive resposta vazia", async () => {
    const api = await load(), response = api.paths["/leads/{id}/messages"].get.responses["200"];
    expect(response.content?.["application/json"]?.schema?.type).toBe("array");
    expect(Object.keys(response.headers ?? {})).toEqual(["X-Crivo-Anchor-Message-Id", "X-Crivo-Agent-State-Revision"]);
    expect(response.headers?.["X-Crivo-Agent-State-Revision"].schema?.pattern).toBe("^(null|[0-9]+)$");
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


// Dez cenários novos: paridade de método/handler/DTO e limites discriminantes por operação.
describe("L14b T45 — contrato dos dez endpoints", () => {
  type Node = { [key: string]: Node };
  type Api = { paths: Record<string, Record<string, Node>>; components: { schemas: Record<string, Node> } };
  const id = "00000000-0000-4000-8000-000000000001";
  const cases: [string, string, string, string[]][] = [
    ["/leads/{id}/agent-state", "post", "AgentStateInput", ["200", "400", "401", "404", "409", "413", "405"]],
    ["/whatsapp/automation/candidates", "get", "", ["200", "400", "401", "404", "405"]],
    ["/leads/{id}/reengagement/prepare", "post", "AnchorInput", ["200", "201", "400", "401", "404", "409", "413", "503", "405"]],
    ["/leads/{id}/reengagement/{episodeId}/preparation-failure", "post", "PreparationFailureInput", ["200", "400", "401", "404", "409", "413", "405"]],
    ["/leads/{id}/reengagement/{episodeId}/send", "post", "ReengagementSendInput", ["200", "400", "401", "404", "409", "413", "503", "405"]],
    ["/leads/{id}/reengagement/{episodeId}/acknowledgement", "post", "AcknowledgementInput", ["200", "400", "401", "404", "409", "413", "405"]],
    ["/leads/{id}/reengagement/expire", "post", "AnchorInput", ["200", "400", "401", "404", "409", "413", "405"]],
    ["/leads/{id}/session-context", "post", "SessionContextInput", ["200", "400", "401", "404", "413", "503", "405"]],
    ["/whatsapp/statuses", "post", "StatusBatchInput", ["200", "400", "401", "403", "413", "503", "405"]],
    ["/whatsapp/usage/sync", "post", "UsageSyncInput", ["200", "400", "401", "413", "503", "405"]],
  ];
  it.each(cases)("%s compara handler, método, DTO e semântica", async (apiPath, method, inputName, statuses) => {
    const api = await SwaggerParser.validate(OPENAPI_PATH) as unknown as Api, schemas = api.components.schemas, operation = api.paths[apiPath][method];
    expect(Object.keys(api.paths[apiPath])).toEqual([method]);
    const routePath = path.resolve(__dirname, "../../../../app/api/v1", apiPath.slice(1).replaceAll("{id}", "[id]").replaceAll("{episodeId}", "[episodeId]"), "route.ts");
    const source = readFileSync(routePath, "utf8");
    expect(source).toContain("export const " + method.toUpperCase() + " = withIntegrationRoute");
    expect(source).toContain('methodNotAllowed(["' + method.toUpperCase() + '"])');
    expect(operation.security).toEqual([{ bearerAuth: [] }, { serviceAuth: [] }]);
    expect(Object.keys(operation.responses).sort()).toEqual(statuses.sort());
    for (const status of statuses.filter((value) => Number(value) >= 400)) expect(operation.responses[status].content["application/problem+json"].schema).toBeDefined();
    const response = operation.responses["200"].content["application/json"].schema;
    for (const forbidden of ["claimToken", "text", "credential", "destination", "usageSyncToken", "responseToken"]) expect(Object.keys(response.properties ?? {})).not.toContain(forbidden);
    if (inputName) {
      expect(operation["x-max-body-bytes"]).toBe(MAX_BODY_BYTES); expect(source).toContain("MAX_BODY_BYTES");
      expect(operation.requestBody.required).toBe(true); expect(operation.requestBody.content["application/json"].schema).toEqual(schemas[inputName]);
      expect(schemas[inputName].additionalProperties).toBe(false);
      for (const forbidden of ["tenantId", "destination", "adapter", "wabaId", "token"]) expect(Object.keys(schemas[inputName].properties)).not.toContain(forbidden);
    }
    if (inputName === "AgentStateInput") {
      expect(schemas.AgentStateInput.required).toEqual(["anchorMessageId", "resetObservedAt", "expectedRevision", "phase", "askedFields", "openingHistory"]);
      expect(schemas.AgentStateInput.properties.phase.enum).toEqual([...agentPhaseEnum.enumValues, null]);
      expect(schemas.AgentStateInput.properties.askedFields.maxItems).toBe(8); expect(schemas.AgentStateInput.properties.askedFields.items.enum).toEqual(Object.keys(FIELD_LABELS));
      const input = { anchorMessageId: id, resetObservedAt: null, expectedRevision: 0, phase: null, askedFields: [], openingHistory: [] };
      expect(parseAgentState(input).ok).toBe(true); expect(parseAgentState({ ...input, askedFields: Array(9).fill("modality") }).ok).toBe(false);
      expect(operation.description).toMatch(/âncora anterior/); expect(schemas.AgentStateProjection.properties.revision.minimum).toBe(1);
    } else if (method === "get") {
      const parameters = operation.parameters as unknown as { name?: string; schema?: { maximum?: number; default?: number; maxLength?: number } }[];
      expect(parameters.find((p) => p.name === "limit")?.schema).toMatchObject({ maximum: 100, default: 100 }); expect(parameters.find((p) => p.name === "cursor")?.schema?.maxLength).toBe(1024);
      expect(parseAutomationCandidatesQuery(new URL("http://fixture?limit=100")).ok).toBe(true); expect(parseAutomationCandidatesQuery(new URL("http://fixture?limit=101")).ok).toBe(false);
      expect(Object.keys(schemas.Candidate.properties)).toEqual(["leadId", "anchorMessageId", "anchorSentAt", "phoneNumberId", "action"]); expect(operation.description).toMatch(/página vazia/);
    } else if (apiPath.endsWith("/prepare")) {
      expect(parseReengagementPrepare({ anchorMessageId: id }).ok).toBe(true); expect(Object.keys(schemas.AnchorInput.properties)).toEqual(["anchorMessageId"]);
      expect(Object.keys(operation.responses["201"].content["application/json"].schema.properties)).toEqual(["episodeId", "claimToken", "claimExpiresAt", "agentStateRevision", "frame"]);
      expect(Object.keys(response.properties)).toEqual(["episodeId", "state"]); expect(schemas.EpisodeState.enum).toEqual(reengagementStateEnum.enumValues);
      expect(schemas.PreparationFrame.properties.history.maxItems).toBe(50); expect(schemas.PreparationFrame.properties.pendingField.enum).toContain(null);
      expect(schemas.ContextHistoryMessage.properties.sender.enum).toEqual(senderEnum.enumValues); expect(schemas.ContextHistoryMessage.required).toContain("authorName");
    } else if (inputName === "PreparationFailureInput") {
      const codes = ["generation-failed", "generation-timeout", "context-read-failed", "invalid-text"];
      expect(schemas.PreparationFailureInput.properties.code.enum).toEqual(codes); for (const code of codes) expect(parsePreparationFailure({ claimToken: id, code }).ok).toBe(true);
      expect(parsePreparationFailure({ claimToken: id, code: "private-text" }).ok).toBe(false); expect(response.properties.released.const).toBe(true); expect(operation.description).toMatch(/replay.*409/);
    } else if (inputName === "ReengagementSendInput") {
      expect(schemas.ReengagementSendInput.properties.text["x-first-dispatch-max-utf16-code-units"]).toBe(4096); expect(schemas.ReengagementSendInput.properties.text.maxLength).toBeUndefined();
      expect(parseReengagementSend({ claimToken: id, text: "😀".repeat(4097) }).ok).toBe(true); expect(schemas.ReengagementSendInput.properties.text.description).toMatch(/astral conta 2/);
      expect(response.properties.state.enum).toEqual(["accepted", "accepted_pending_record", "refused", "uncertain"]); expect(operation.description).toMatch(/Não reenviar resultado indeterminado/);
    } else if (inputName === "AcknowledgementInput") {
      expect(Object.keys(schemas.AcknowledgementInput.properties)).toEqual(["wamid", "acceptedAt"]); expect(schemas.AcknowledgementInput.required).toEqual([]);
      expect(parseReengagementAcknowledgement({}).ok).toBe(true); expect(parseReengagementAcknowledgement({ acceptedAt: "2026-02-30T15:00:00Z" }).ok).toBe(false);
      const variants = response.oneOf as unknown as Node[]; expect(variants[1].properties.state.enum).toEqual(["uncertain", "accepted"]); expect(operation.description).toMatch(/nunca envia Meta/);
    } else if (apiPath.endsWith("/expire")) {
      expect(Object.keys(schemas.AnchorInput.properties)).toEqual(["anchorMessageId"]); const variants = response.oneOf as unknown as Node[];
      expect(variants[0].properties.action.enum).toEqual(["omitted", "unchanged"]); expect(variants[1].properties.result.enum).toEqual(["accepted", "refused", "uncertain", "omitted"]); expect(operation.description).toMatch(/24h.*48h/);
    } else if (inputName === "SessionContextInput") {
      expect(schemas.SessionContextInput.required).toEqual([]); expect(schemas.SessionContextInput.properties.bufferMessageIds.maxItems).toBe(50);
      expect(parseSessionContext({ bufferMessageIds: Array(50).fill(id) }).ok).toBe(true); expect(parseSessionContext({ bufferMessageIds: Array(51).fill(id) }).ok).toBe(false);
      expect(Object.keys(response.properties)).toEqual(["frame", "history", "requiresRebuild", "pendingAcceptance", "anchor", "agentStateRevision"]); expect(response.properties.history.maxItems).toBe(50); expect(operation.description).toMatch(/independente de agentStateRevision/);
    } else if (inputName === "StatusBatchInput") {
      expect(schemas.StatusBatchInput.properties.statuses).toMatchObject({ minItems: 1, maxItems: 100 }); expect(schemas.NormalizedStatus.properties.status.enum).toEqual(["sent", "delivered", "read", "failed"]);
      expect(operation.description).toMatch(/Default fechado 403/); expect(source).toContain("createStatusForwardingContext(auth, request)"); expect(operation.description).toMatch(/órfão dura 30 dias/); expect(Object.keys(response.properties)).toEqual(["processed"]);
      expect(schemas.NormalizedStatus.additionalProperties).toBe(false); expect(schemas.ReceiptPricing.required).toEqual([]);
    } else if (inputName === "UsageSyncInput") {
      expect(Object.keys(schemas.UsageSyncInput.properties)).toEqual(["phoneNumberId"]); expect(parseUsageSync({ phoneNumberId: " 123 " }).ok).toBe(true); expect(parseUsageSync({ phoneNumberId: "123", start: 0 }).ok).toBe(false);
      expect(response.properties.result.enum).toEqual(["synced", "skipped", "unavailable"]); expect(response.properties.reason.enum).toEqual(expect.arrayContaining(["rate-limited", "timeout", "zero-unverified", "contract-unverified"]));
      expect(operation.description).toMatch(/Adapter produtivo ausente/); expect(operation.description).toMatch(/usageEnabled false/); const variants = schemas.UsageSnapshot.oneOf as unknown as Node[]; expect(variants[1].properties.estimated.const).toBe(true);
    }
  });
});
