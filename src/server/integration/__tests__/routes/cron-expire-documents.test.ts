import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { documents, integrationRefusals, tenants } from "../../../../db/schema";

// Mocka só `purgeIntegrationRefusals` do módulo de dados (SAUDE-03 AC3):
// o teste de "falha na purga não impede a expiração de documentos" precisa
// forçar uma rejeição sem depender de quebrar o banco de verdade. O default
// (`vi.fn(actual.purgeIntegrationRefusals)`) chama a função real — só o
// teste de falha sobrescreve com `mockRejectedValueOnce`, que volta ao
// comportamento real automaticamente depois de consumida.
vi.mock("../../../data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../data")>();
  return { ...actual, purgeIntegrationRefusals: vi.fn(actual.purgeIntegrationRefusals) };
});

import { purgeIntegrationRefusals } from "../../../data";
import { GET, POST } from "../../../../../app/api/cron/expire-documents/route";

const mockedPurge = vi.mocked(purgeIntegrationRefusals);

// `CRON_SECRET` não precisa existir no .env real deste ambiente — o teste
// define/restaura seu próprio valor em process.env, já que a rota lê o
// secret em tempo de request (nunca no carregamento do módulo).
describe("routes: /api/cron/expire-documents", () => {
  const originalSecret = process.env.CRON_SECRET;
  const testSecret = `test-cron-secret-${randomUUID()}`;

  let tenantId: string;
  let expiredDocId: string;
  let futureDocId: string;

  beforeAll(async () => {
    process.env.CRON_SECRET = testSecret;

    tenantId = randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: `Tenant Teste cron ${tenantId}`,
      agentName: "Agente Teste",
      supportedModality: "ambos",
      slug: `fixture-${tenantId}`,
    });

    expiredDocId = randomUUID();
    futureDocId = randomUUID();
    await db.insert(documents).values([
      {
        id: expiredDocId,
        tenantId,
        name: "Expirado.pdf",
        modality: "novo",
        mimeType: "application/pdf",
        sizeBytes: BigInt(100),
        expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      },
      {
        id: futureDocId,
        tenantId,
        name: "Futuro.pdf",
        modality: "novo",
        mimeType: "application/pdf",
        sizeBytes: BigInt(100),
        expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      },
    ]);
  });

  afterAll(async () => {
    process.env.CRON_SECRET = originalSecret;
    await db.delete(documents).where(eq(documents.tenantId, tenantId));
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.$client.end();
  });

  function makeRequest(method: "GET" | "POST", secret?: string): Request {
    return new Request("http://local/api/cron/expire-documents", {
      method,
      headers: secret !== undefined ? { Authorization: `Bearer ${secret}` } : {},
    });
  }

  it("secret ausente responde 401 e não deleta nada (Edge Case — cron sem secret)", async () => {
    const response = await POST(makeRequest("POST"));
    expect(response.status).toBe(401);

    const rows = await db.select().from(documents).where(eq(documents.id, expiredDocId));
    expect(rows).toHaveLength(1);
  });

  it("secret errado responde 401 e não deleta nada", async () => {
    const response = await POST(makeRequest("POST", "secret-errado"));
    expect(response.status).toBe(401);

    const rows = await db.select().from(documents).where(eq(documents.id, expiredDocId));
    expect(rows).toHaveLength(1);
  });

  it("secret correto (POST) deleta só os documentos expirados e responde a contagem por tenant (LGPD-02 AC1)", async () => {
    const response = await POST(makeRequest("POST", testSecret));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deletedByTenant[tenantId]).toBe(1);

    const remaining = await db
      .select()
      .from(documents)
      .where(eq(documents.tenantId, tenantId));
    expect(remaining.map((d) => d.id)).toEqual([futureDocId]);
  });

  it("GET com secret correto também deleta (Vercel Cron invoca via GET — SPEC_DEVIATION no route.ts)", async () => {
    const anotherExpiredId = randomUUID();
    await db.insert(documents).values({
      id: anotherExpiredId,
      tenantId,
      name: "Expirado 2.pdf",
      modality: "usado",
      mimeType: "application/pdf",
      sizeBytes: BigInt(100),
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    const response = await GET(makeRequest("GET", testSecret));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deletedByTenant[tenantId]).toBe(1);

    const rows = await db.select().from(documents).where(eq(documents.id, anotherExpiredId));
    expect(rows).toHaveLength(0);
  });

  it("purga recusas vencidas na mesma execução e reporta refusalsDeleted (SAUDE-03 AC1)", async () => {
    const oldRoute = `/api/v1/__test-cron-refusal-old__/${randomUUID()}`;
    const recentRoute = `/api/v1/__test-cron-refusal-recent__/${randomUUID()}`;
    await db.insert(integrationRefusals).values([
      {
        tenantId,
        route: oldRoute,
        method: "POST",
        status: 401,
        code: "credencial-invalida",
        // Bem além de 30 dias de qualquer "agora" real de execução do teste.
        occurredAt: new Date("2020-01-01T00:00:00.000Z"),
      },
      {
        tenantId,
        route: recentRoute,
        method: "POST",
        status: 401,
        code: "credencial-invalida",
        occurredAt: new Date(),
      },
    ]);

    const response = await POST(makeRequest("POST", testSecret));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.refusalsDeleted).toBeGreaterThanOrEqual(1);
    expect(body.refusalsPurgeFailed).toBe(false);

    const oldRows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, oldRoute));
    expect(oldRows).toHaveLength(0);

    const recentRows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.route, recentRoute));
    expect(recentRows).toHaveLength(1);

    await db.delete(integrationRefusals).where(eq(integrationRefusals.route, recentRoute));
  });

  it("execução sem nenhuma recusa vencida devolve refusalsDeleted = 0, sem erro", async () => {
    const response = await POST(makeRequest("POST", testSecret));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.refusalsDeleted).toBe(0);
    expect(body.refusalsPurgeFailed).toBe(false);
  });

  it("falha na purga de recusas não impede a expiração de documentos, e a falha é reportada (SAUDE-03 AC3)", async () => {
    const willExpireId = randomUUID();
    await db.insert(documents).values({
      id: willExpireId,
      tenantId,
      name: "Expira mesmo com purga falhando.pdf",
      modality: "novo",
      mimeType: "application/pdf",
      sizeBytes: BigInt(100),
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });

    mockedPurge.mockRejectedValueOnce(new Error("falha simulada de purga"));

    const response = await POST(makeRequest("POST", testSecret));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.refusalsPurgeFailed).toBe(true);
    expect(body.refusalsDeleted).toBe(0);
    // A expiração de documentos, que já tinha rodado antes da purga ser
    // tentada, não é afetada pela falha (SAUDE-03 AC3).
    expect(body.deletedByTenant[tenantId]).toBeGreaterThanOrEqual(1);

    const rows = await db.select().from(documents).where(eq(documents.id, willExpireId));
    expect(rows).toHaveLength(0);
  });
});
