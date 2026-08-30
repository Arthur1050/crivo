import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "../../../db";
import { integrationRefusals } from "../../../db/schema";
import {
  getIntegrationRefusalsSince,
  getTenants,
  purgeIntegrationRefusals,
  recordIntegrationRefusal,
} from "../index";

// Marcador único desta suíte (T5/T6), para que a limpeza no afterAll nunca
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
    // Não fecha o client aqui de propósito — o describe seguinte (T6) neste
    // mesmo arquivo ainda usa a conexão. Só o último describe fecha.
    await db
      .delete(integrationRefusals)
      .where(like(integrationRefusals.route, `${ROUTE_PREFIX}%`));
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

// Marcador próprio para T6 — isolado do de T5 acima, mesmo raciocínio.
const T6_ROUTE_PREFIX = `/api/v1/__test-integration-refusals-t6__/${randomUUID()}`;

describe("server/data integration refusals — getIntegrationRefusalsSince (T6)", () => {
  let tenantAId: string;
  let tenantBId: string;
  const since = new Date("2026-08-01T00:00:00.000Z");

  beforeAll(async () => {
    const allTenants = await getTenants();
    expect(allTenants.length).toBeGreaterThanOrEqual(2);
    tenantAId = allTenants[0].id;
    tenantBId = allTenants[1].id;

    // Recusa do tenant A, dentro da janela.
    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route: `${T6_ROUTE_PREFIX}/a`,
      method: "POST",
      status: 422,
      code: "payload-invalido",
      occurredAt: new Date(since.getTime() + 60_000),
    });
    // Recusa do tenant B (outro tenant), dentro da janela — nunca deve
    // aparecer na consulta escopada ao tenant A.
    await recordIntegrationRefusal({
      tenantId: tenantBId,
      route: `${T6_ROUTE_PREFIX}/b`,
      method: "POST",
      status: 422,
      code: "payload-invalido",
      occurredAt: new Date(since.getTime() + 60_000),
    });
    // Recusa sem tenant, dentro da janela — deve aparecer para QUALQUER
    // tenant consultado (design.md — recusa cruza a fronteira de propósito).
    await recordIntegrationRefusal({
      tenantId: null,
      route: `${T6_ROUTE_PREFIX}/sem-tenant`,
      method: "GET",
      status: 401,
      code: "credencial-invalida",
      occurredAt: new Date(since.getTime() + 60_000),
    });
    // Recusa do tenant A, mas ANTES de `since` — deve ficar de fora.
    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route: `${T6_ROUTE_PREFIX}/antiga`,
      method: "POST",
      status: 422,
      code: "payload-invalido",
      occurredAt: new Date(since.getTime() - 60_000),
    });
    // Duas recusas do tenant A com o MESMO (code, route), para provar o
    // agrupamento por (code, route) com contagem correta.
    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route: `${T6_ROUTE_PREFIX}/agrupada`,
      method: "POST",
      status: 409,
      code: "conflito-de-agenda",
      occurredAt: new Date(since.getTime() + 120_000),
    });
    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route: `${T6_ROUTE_PREFIX}/agrupada`,
      method: "POST",
      status: 409,
      code: "conflito-de-agenda",
      occurredAt: new Date(since.getTime() + 180_000),
    });
  });

  afterAll(async () => {
    // Não fecha o client aqui de propósito — o describe seguinte (T7) neste
    // mesmo arquivo ainda usa a conexão. Só o último describe fecha.
    await db
      .delete(integrationRefusals)
      .where(like(integrationRefusals.route, `${T6_ROUTE_PREFIX}%`));
  });

  it("recusa de OUTRO tenant nunca aparece no resultado", async () => {
    const summaries = await getIntegrationRefusalsSince(tenantAId, since);
    const routes = summaries.map((s) => s.route);
    expect(routes).not.toContain(`${T6_ROUTE_PREFIX}/b`);
  });

  it("recusa sem tenant aparece para qualquer tenant consultado", async () => {
    const summariesA = await getIntegrationRefusalsSince(tenantAId, since);
    const summariesB = await getIntegrationRefusalsSince(tenantBId, since);

    expect(summariesA.map((s) => s.route)).toContain(`${T6_ROUTE_PREFIX}/sem-tenant`);
    expect(summariesB.map((s) => s.route)).toContain(`${T6_ROUTE_PREFIX}/sem-tenant`);
  });

  it("recusa mais antiga que `since` fica de fora", async () => {
    const summaries = await getIntegrationRefusalsSince(tenantAId, since);
    const routes = summaries.map((s) => s.route);
    expect(routes).not.toContain(`${T6_ROUTE_PREFIX}/antiga`);
  });

  it("recusa do próprio tenant dentro da janela aparece no resultado", async () => {
    const summaries = await getIntegrationRefusalsSince(tenantAId, since);
    const routes = summaries.map((s) => s.route);
    expect(routes).toContain(`${T6_ROUTE_PREFIX}/a`);
  });

  it("agrupa por (code, route): duas recusas idênticas viram 1 grupo com count=2", async () => {
    const summaries = await getIntegrationRefusalsSince(tenantAId, since);
    const grouped = summaries.find(
      (s) => s.route === `${T6_ROUTE_PREFIX}/agrupada` && s.code === "conflito-de-agenda"
    );
    expect(grouped).toBeDefined();
    expect(grouped!.count).toBe(2);
    expect(grouped!.lastOccurredAt.getTime()).toBe(since.getTime() + 180_000);
  });
});

const DAY_MS = 86400000;

// Marcador próprio para T7 — isolado dos de T5/T6 acima.
const T7_ROUTE_PREFIX = `/api/v1/__test-integration-refusals-t7__/${randomUUID()}`;

describe("server/data integration refusals — purgeIntegrationRefusals (T7)", () => {
  let tenantAId: string;

  beforeAll(async () => {
    const allTenants = await getTenants();
    expect(allTenants.length).toBeGreaterThanOrEqual(1);
    tenantAId = allTenants[0].id;
  });

  afterAll(async () => {
    await db
      .delete(integrationRefusals)
      .where(like(integrationRefusals.route, `${T7_ROUTE_PREFIX}%`));
    // Último describe deste arquivo — fecha a conexão aqui.
    await db.$client.end();
  });

  it("recusa de 31 dias some", async () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const route = `${T7_ROUTE_PREFIX}/31-dias`;
    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route,
      method: "POST",
      status: 500,
      code: null,
      occurredAt: new Date(now.getTime() - 31 * DAY_MS),
    });

    await purgeIntegrationRefusals(now);

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));
    expect(rows).toHaveLength(0);
  });

  it("recusa de 29 dias permanece (limite exato — ainda não tem 'mais de 30 dias')", async () => {
    const now = new Date("2026-09-02T00:00:00.000Z");
    const route = `${T7_ROUTE_PREFIX}/29-dias`;
    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route,
      method: "POST",
      status: 500,
      code: null,
      occurredAt: new Date(now.getTime() - 29 * DAY_MS),
    });

    await purgeIntegrationRefusals(now);

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));
    expect(rows).toHaveLength(1);
  });

  it("recusa de exatamente 30 dias permanece (limite exato do corte — lt, não lte)", async () => {
    const now = new Date("2026-09-03T00:00:00.000Z");
    const route = `${T7_ROUTE_PREFIX}/30-dias`;
    await recordIntegrationRefusal({
      tenantId: tenantAId,
      route,
      method: "POST",
      status: 500,
      code: null,
      occurredAt: new Date(now.getTime() - 30 * DAY_MS),
    });

    await purgeIntegrationRefusals(now);

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, route));
    expect(rows).toHaveLength(1);
  });

  it("execução sem nada vencido devolve zero, sem erro", async () => {
    // `now` ancorado no ano 2000: nenhuma linha real da suíte (toda datada em
    // 2026) fica mais antiga que o corte — garante `deleted === 0` sem
    // depender do estado deixado por outros testes deste arquivo.
    const now = new Date("2000-01-31T00:00:00.000Z");
    const result = await purgeIntegrationRefusals(now);
    expect(result).toEqual({ deleted: 0 });
  });
});
