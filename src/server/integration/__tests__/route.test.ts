import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../../../db";
import { integrationRefusals, tenants } from "../../../db/schema";
import { getTenants } from "../../data";
import { problem } from "../problem";
import type { AuthResult } from "../auth";

// Mocka `authenticate()` para controlar precisamente o resultado da
// autenticação em cada teste, sem depender de uma chave de API real no
// banco — o wrapper (`withIntegrationRoute`) não reimplementa autenticação,
// só decide o que fazer com o resultado dela (design.md — Reuses).
vi.mock("../auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../auth")>();
  return { ...actual, authenticate: vi.fn() };
});

import { authenticate } from "../auth";
import { INSTRUMENTED, withIntegrationRoute } from "../route";

const mockedAuthenticate = vi.mocked(authenticate);

// Marcador único desta suíte (T8), para que a limpeza no afterAll nunca
// apague recusas gravadas por outro arquivo de teste ou pela aplicação
// (mesmo padrão de `src/server/data/__tests__/integration-refusals.test.ts`).
const ROUTE_PREFIX = `/api/v1/__test-route-t8__/${randomUUID()}`;

function makeRequest(path: string, init?: RequestInit): Request {
  return new Request(`http://local${path}`, init);
}

async function refusalRowsFor(route: string) {
  return db.select().from(integrationRefusals).where(eq(integrationRefusals.route, route));
}

describe("server/integration route — withIntegrationRoute (T8)", () => {
  let tenantId: string;

  beforeAll(async () => {
    const allTenants = await getTenants();
    expect(allTenants.length).toBeGreaterThanOrEqual(1);
    tenantId = allTenants[0].id;
  });

  afterEach(() => {
    mockedAuthenticate.mockReset();
  });

  afterAll(async () => {
    await db
      .delete(integrationRefusals)
      .where(like(integrationRefusals.route, `${ROUTE_PREFIX}%`));
    await db.$client.end();
  });

  it("marca o handler devolvido com INSTRUMENTED", () => {
    const wrapped = withIntegrationRoute(async () => Response.json({ ok: true }));
    expect((wrapped as unknown as Record<symbol, unknown>)[INSTRUMENTED]).toBe(true);
  });

  it("repassa o segundo argumento do Next (ctx / params) intacto às rotas dinâmicas", async () => {
    mockedAuthenticate.mockResolvedValueOnce({ tenantId } satisfies AuthResult);

    let receivedCtx: unknown;
    const wrapped = withIntegrationRoute<{ params: Promise<{ id: string }> }>(
      async (_request, _auth, ctx) => {
        receivedCtx = ctx;
        return Response.json({ ok: true });
      }
    );

    const ctx = { params: Promise.resolve({ id: "lead-123" }) };
    await wrapped(makeRequest("/api/v1/leads/lead-123"), ctx);

    expect(receivedCtx).toBe(ctx);
  });

  it("caminho feliz (< 400): não grava nenhuma recusa", async () => {
    mockedAuthenticate.mockResolvedValueOnce({ tenantId } satisfies AuthResult);
    const route = `${ROUTE_PREFIX}/caminho-feliz`;

    const wrapped = withIntegrationRoute(async () => Response.json({ ok: true }, { status: 200 }));
    const response = await wrapped(makeRequest(route), undefined);

    expect(response.status).toBe(200);
    expect(await refusalRowsFor(route)).toHaveLength(0);
  });

  it("recusa de autenticação: devolve a Response de authenticate() sem alteração e grava com tenantId = null (SAUDE-01 AC7)", async () => {
    const route = `${ROUTE_PREFIX}/sem-auth`;
    const authResponse = problem(401, "nao-autenticado", "Header Authorization ausente.");
    const expectedBody = await authResponse.clone().json();
    mockedAuthenticate.mockResolvedValueOnce(authResponse);

    const wrapped = withIntegrationRoute(async () => Response.json({ nunca: "chamado" }));
    const response = await wrapped(makeRequest(route), undefined);

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe(authResponse.headers.get("content-type"));
    expect(await response.clone().json()).toEqual(expectedBody);

    const rows = await refusalRowsFor(route);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBeNull();
    expect(rows[0].status).toBe(401);
    expect(rows[0].code).toBe("nao-autenticado");
  });

  it("resposta >= 400 do handler: corpo/status/headers idênticos ao que o handler produziu, e grava com o tenant resolvido (SAUDE-01 AC7)", async () => {
    mockedAuthenticate.mockResolvedValueOnce({ tenantId } satisfies AuthResult);
    const route = `${ROUTE_PREFIX}/handler-recusa`;

    const rawResponse = problem(409, "transicao-invalida", "Transição não permitida.");
    const expectedBody = await rawResponse.clone().json();
    const expectedHeaders = new Headers(rawResponse.headers);

    const wrapped = withIntegrationRoute(async () => rawResponse);
    const response = await wrapped(makeRequest(route), undefined);

    expect(response.status).toBe(409);
    expect(response.headers.get("content-type")).toBe(expectedHeaders.get("content-type"));
    expect(await response.clone().json()).toEqual(expectedBody);

    const rows = await refusalRowsFor(route);
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(tenantId);
    expect(rows[0].status).toBe(409);
    expect(rows[0].code).toBe("transicao-invalida");
  });

  it("code = null quando o corpo da resposta não é application/problem+json", async () => {
    mockedAuthenticate.mockResolvedValueOnce({ tenantId } satisfies AuthResult);
    const route = `${ROUTE_PREFIX}/corpo-nao-problem`;

    const wrapped = withIntegrationRoute(async () =>
      Response.json({ code: "isso-nao-deveria-ser-lido" }, { status: 500 })
    );
    await wrapped(makeRequest(route), undefined);

    const rows = await refusalRowsFor(route);
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBeNull();
  });

  it("route gravado é o pathname, nunca a URL com query string", async () => {
    mockedAuthenticate.mockResolvedValueOnce({ tenantId } satisfies AuthResult);
    const pathname = `${ROUTE_PREFIX}/com-query`;

    const wrapped = withIntegrationRoute(async () => problem(400, "payload-invalido"));
    await wrapped(makeRequest(`${pathname}?foo=bar&baz=qux`), undefined);

    const rows = await refusalRowsFor(pathname);
    expect(rows).toHaveLength(1);
    expect(rows[0].route).toBe(pathname);
  });

  it("falha ao gravar a recusa não altera a resposta devolvida ao chamador (SAUDE-01 AC5)", async () => {
    // FK real de `integration_refusals.tenant_id -> tenants.id`: um tenantId
    // inexistente força o INSERT a falhar no banco, sem precisar mockar a
    // DAL — a mesma garantia (falha na gravação nunca propaga) vale tanto
    // para uma exceção da aplicação quanto para uma violação de constraint.
    const inexistentTenantId = randomUUID();
    mockedAuthenticate.mockResolvedValueOnce({ tenantId: inexistentTenantId } satisfies AuthResult);
    const route = `${ROUTE_PREFIX}/falha-gravacao`;

    const rawResponse = problem(422, "payload-invalido", "Falha proposital de gravação.");
    const expectedBody = await rawResponse.clone().json();

    const wrapped = withIntegrationRoute(async () => rawResponse);
    const response = await wrapped(makeRequest(route), undefined);

    expect(response.status).toBe(422);
    expect(await response.clone().json()).toEqual(expectedBody);

    // A escrita realmente falhou (prova de que o teste testou o caminho
    // certo) — e mesmo assim a resposta acima chegou intacta.
    const [tenantRow] = await db.select().from(tenants).where(eq(tenants.id, inexistentTenantId));
    expect(tenantRow).toBeUndefined();
    expect(await refusalRowsFor(route)).toHaveLength(0);
  });
});
