import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../../../../db";
import { integrationRefusals } from "../../../../db/schema";
import {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/[...unmatched]/route";

/**
 * `[...unmatched]` sob `/api/v1` (lote-9 — SAUDE-01/T10): todo verbo devolve
 * 404 problem+json `rota-inexistente`, agora instrumentado. Marcador único
 * de rota por teste, no mesmo padrão de
 * `src/server/data/__tests__/integration-refusals.test.ts`, para a limpeza
 * do afterAll nunca apagar recusa gravada por outro arquivo.
 */
describe("routes: catch-all /api/v1/[...unmatched] — instrumentação (T10)", () => {
  const ROUTE_PREFIX = `/api/v1/__test-unmatched-t10__/${randomUUID()}`;

  afterAll(async () => {
    await db
      .delete(integrationRefusals)
      .where(like(integrationRefusals.route, `${ROUTE_PREFIX}%`));
    await db.$client.end();
  });

  it("responde 404 problem+json com code rota-inexistente para qualquer verbo, resposta inalterada", async () => {
    for (const handler of [GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS]) {
      const response = handler();
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      const body = await response.json();
      expect(body.code).toBe("rota-inexistente");
    }
  });

  it("grava a recusa com code = rota-inexistente e a rota efetivamente chamada, tenantId = null", async () => {
    const route = `${ROUTE_PREFIX}/agente/nao-existe`;
    const request = new Request(`http://local${route}?ignorado=1`, { method: "GET" });

    const response = GET(request);
    expect(response.status).toBe(404);

    await vi.waitFor(
      async () => {
        const rows = await db
          .select()
          .from(integrationRefusals)
          .where(eq(integrationRefusals.route, route));
        expect(rows).toHaveLength(1);
      },
      { timeout: 10000, interval: 100 }
    );

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));
    expect(rows[0].tenantId).toBeNull();
    expect(rows[0].status).toBe(404);
    expect(rows[0].code).toBe("rota-inexistente");
    expect(rows[0].method).toBe("GET");
    // Query string nunca entra em `route` (mesma regra do wrapper, T8).
    expect(rows[0].route).toBe(route);
  });

  it("chamado sem Request (uso legado em leads-post.test.ts) continua funcionando e não grava nada", async () => {
    const route = `${ROUTE_PREFIX}/sem-request`;
    const response = GET();
    expect(response.status).toBe(404);

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));
    expect(rows).toHaveLength(0);
  });
});
