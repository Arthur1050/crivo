import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { integrationRefusals, leads, tenantApiKeys, tenants } from "../../../../db/schema";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/memory-resets/route";

// lote-14 — DEVOLVER-01/OPTHUM-01/CONTRATO-01 (T12): GET /api/v1/memory-resets
// lista os pedidos de reconstrução da memória do tenant a partir de `since`.
describe("routes: GET /api/v1/memory-resets", () => {
  const SINCE = "2026-09-30T12:00:00.000Z";

  let tenantAId: string;
  let tenantBId: string;
  let apiKeyA: string;
  const ids = {
    equalToSince: randomUUID(),
    newer: randomUUID(),
    older: randomUUID(),
    noExternalId: randomUUID(),
    otherTenant: randomUUID(),
    neverRequested: randomUUID(),
  };
  const waIds = {
    equalToSince: `wa-${randomUUID()}`,
    newer: `wa-${randomUUID()}`,
    older: `wa-${randomUUID()}`,
    otherTenant: `wa-${randomUUID()}`,
    neverRequested: `wa-${randomUUID()}`,
  };

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A memory-resets ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
        slug: `fixture-${tenantAId}`,
      },
      {
        id: tenantBId,
        name: `Tenant Teste B memory-resets ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
        slug: `fixture-${tenantBId}`,
      },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values({
      tenantId: tenantAId,
      label: "memory-resets-get.test.ts",
      keyHash: createHash("sha256").update(apiKeyA).digest("hex"),
    });

    const base = {
      phone: "+55 34 90000-0000",
      status: "em_qualificacao" as const,
      firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    await db.insert(leads).values([
      {
        ...base,
        id: ids.equalToSince,
        tenantId: tenantAId,
        name: "Fronteira",
        externalId: waIds.equalToSince,
        memoryResetRequestedAt: new Date(SINCE),
      },
      {
        ...base,
        id: ids.newer,
        tenantId: tenantAId,
        name: "Mais novo",
        externalId: waIds.newer,
        memoryResetRequestedAt: new Date("2026-09-30T12:00:00.001Z"),
      },
      {
        ...base,
        id: ids.older,
        tenantId: tenantAId,
        name: "Mais velho",
        externalId: waIds.older,
        memoryResetRequestedAt: new Date("2026-09-30T11:59:59.999Z"),
      },
      {
        ...base,
        id: ids.noExternalId,
        tenantId: tenantAId,
        name: "Sem externalId",
        externalId: null,
        memoryResetRequestedAt: new Date("2026-09-30T13:00:00.000Z"),
      },
      {
        ...base,
        id: ids.otherTenant,
        tenantId: tenantBId,
        name: "Outro tenant",
        externalId: waIds.otherTenant,
        memoryResetRequestedAt: new Date("2026-09-30T13:00:00.000Z"),
      },
      {
        ...base,
        id: ids.neverRequested,
        tenantId: tenantAId,
        name: "Sem pedido",
        externalId: waIds.neverRequested,
        memoryResetRequestedAt: null,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantAId));
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantBId));
    await db.delete(leads).where(eq(leads.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantBId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  function callGet(query: string, apiKey: string | null = apiKeyA) {
    return GET(
      new Request(`http://local/api/v1/memory-resets${query}`, {
        method: "GET",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      }),
      undefined
    );
  }

  it("inclui o pedido com requestedAt igual a since e os mais novos; exclui o mais velho (L-023)", async () => {
    const response = await callGet(`?since=${encodeURIComponent(SINCE)}`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resets).toEqual([
      { leadId: ids.equalToSince, waId: waIds.equalToSince, requestedAt: SINCE },
      {
        leadId: ids.newer,
        waId: waIds.newer,
        requestedAt: "2026-09-30T12:00:00.001Z",
      },
    ]);
  });

  it("exclui lead de outro tenant, lead sem externalId e lead sem pedido (L-035)", async () => {
    const response = await callGet(`?since=${encodeURIComponent("2026-01-01T00:00:00.000Z")}`);

    const body = await response.json();
    const leadIds = body.resets.map((r: { leadId: string }) => r.leadId);
    expect(leadIds).not.toContain(ids.otherTenant);
    expect(leadIds).not.toContain(ids.noExternalId);
    expect(leadIds).not.toContain(ids.neverRequested);
    expect(leadIds.sort()).toEqual([ids.equalToSince, ids.newer, ids.older].sort());
  });

  it("since ausente: 400 payload-invalido", async () => {
    const response = await callGet("");
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("payload-invalido");
  });

  it("since vazio, não ISO ou só data: 400 payload-invalido", async () => {
    for (const bad of ["", "ontem", "2026-09-30", "not-a-date"]) {
      const response = await callGet(`?since=${encodeURIComponent(bad)}`);
      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe("payload-invalido");
    }
  });

  it("sem credencial responde 401", async () => {
    const response = await callGet(`?since=${encodeURIComponent(SINCE)}`, null);
    expect(response.status).toBe(401);
  });

  it("POST/PUT/PATCH/DELETE respondem 405 problem+json com Allow: GET", async () => {
    for (const handler of [POST, PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(response.headers.get("Allow")).toBe("GET");
      expect((await response.json()).code).toBe("metodo-nao-suportado");
    }
  });

  it("recusa de since inválido é registrada em integration_refusals (AD-023)", async () => {
    await callGet("?since=ontem");

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.tenantId, tenantAId));
    const row = rows.find(
      (r) => r.route === "/api/v1/memory-resets" && r.code === "payload-invalido"
    );
    expect(row).toBeDefined();
    expect(row!.status).toBe(400);
  });
});
