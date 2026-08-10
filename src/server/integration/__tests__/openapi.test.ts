import path from "node:path";
import { describe, expect, it } from "vitest";
import SwaggerParser from "@apidevtools/swagger-parser";

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
      ])
    );
    expect(api.paths["/leads"].post).toBeDefined();
    expect(api.paths["/leads/{id}"].patch).toBeDefined();
    expect(api.paths["/leads/{id}/messages"].post).toBeDefined();
    expect(api.paths["/leads/{id}/messages"].get).toBeDefined();
    expect(api.paths["/leads/{id}/opt-out"].post).toBeDefined();
    expect(api.paths["/context"].get).toBeDefined();
  });
});
