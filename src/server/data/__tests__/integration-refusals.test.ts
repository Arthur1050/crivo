import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../../../db";
import { integrationRefusals } from "../../../db/schema";
import { getTenants, recordIntegrationRefusal } from "../index";

// Marcador único desta suíte (T5), para que a limpeza no afterAll nunca
// apague recusas gravadas por outro arquivo de teste ou pela aplicação.
const ROUTE_PREFIX = `/api/v1/__test-integration-refusals-t5__/${randomUUID()}`;

// Assume o banco já está seedado (mesmo padrão de mutations.test.ts /
// isolation.test.ts). Cada teste grava e a suíte inteira limpa no afterAll,
// filtrando só pelo prefixo de rota desta suíte.
describe("server/data integration refusals — recordIntegrationRefusal (T5)", () => {
  let tenantAId: string;

  beforeAll(async () => {
    const allTenants = await getTenants();
    expect(allTenants.length).toBeGreaterThanOrEqual(1);
    tenantAId = allTenants[0].id;
  });

  afterAll(async () => {
    await db
      .delete(integrationRefusals)
      .where(like(integrationRefusals.route, `${ROUTE_PREFIX}%`));
    await db.$client.end();
  });

  it("grava uma recusa com tenantId preenchido", async () => {
    const route = `${ROUTE_PREFIX}/com-tenant`;
    const occurredAt = new Date("2026-08-01T10:00:00.000Z");

    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route,
      method: "POST",
      status: 422,
      code: "payload-invalido",
      occurredAt,
    });

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));

    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(tenantAId);
    expect(rows[0].route).toBe(route);
    expect(rows[0].method).toBe("POST");
    expect(rows[0].status).toBe(422);
    expect(rows[0].code).toBe("payload-invalido");
    expect(rows[0].occurredAt.getTime()).toBe(occurredAt.getTime());
  });

  it("grava uma recusa sem tenantId (recusa anterior à identificação)", async () => {
    const route = `${ROUTE_PREFIX}/sem-tenant`;

    await recordIntegrationRefusal({
      tenantId: null,
      route,
      method: "GET",
      status: 401,
      code: "credencial-invalida",
      occurredAt: new Date("2026-08-01T11:00:00.000Z"),
    });

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));

    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBeNull();
  });

  it("recusa sem corpo problem+json grava code = null", async () => {
    const route = `${ROUTE_PREFIX}/sem-problem-json`;

    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route,
      method: "POST",
      status: 500,
      code: null,
      occurredAt: new Date("2026-08-01T12:00:00.000Z"),
    });

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));

    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBeNull();
  });

  it("duas recusas idênticas geram duas linhas — sem deduplicação (SAUDE-01 AC6)", async () => {
    const route = `${ROUTE_PREFIX}/duplicada`;
    const input = {
      tenantId: tenantAId,
      route,
      method: "PATCH",
      status: 409,
      code: "conflito-de-agenda",
      occurredAt: new Date("2026-08-01T13:00:00.000Z"),
    };

    await recordIntegrationRefusal(input);
    await recordIntegrationRefusal(input);

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));

    expect(rows).toHaveLength(2);
  });

  it("nunca grava campo além dos seis definidos no design (colunas exatas da tabela)", async () => {
    const route = `${ROUTE_PREFIX}/colunas-exatas`;

    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route,
      method: "DELETE",
      status: 404,
      code: "rota-inexistente",
      occurredAt: new Date("2026-08-01T14:00:00.000Z"),
    });

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["id", "tenantId", "route", "method", "status", "code", "occurredAt"].sort()
    );
  });
});
