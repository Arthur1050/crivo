import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { integrationRefusals, leads, tenantApiKeys, tenants } from "../../../../db/schema";
import { GET } from "../../../../../app/api/v1/leads/[id]/route";

// lote-14 — SILENCIO-01/CONTRATO-01 (T9): GET /api/v1/leads/{id}, usado pelo
// n8n para conferir a condução antes de cada envio. Dois tenants PRÓPRIOS (A e
// B) para provar o 404 de outro tenant (L-035).
describe("routes: GET /api/v1/leads/[id]", () => {
  let tenantAId: string;
  let tenantBId: string;
  let apiKeyA: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A leads-get ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
        slug: `fixture-${tenantAId}`,
      },
      {
        id: tenantBId,
        name: `Tenant Teste B leads-get ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
        slug: `fixture-${tenantBId}`,
      },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values({
      tenantId: tenantAId,
      label: "leads-get.test.ts",
      keyHash: createHash("sha256").update(apiKeyA).digest("hex"),
    });
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

  async function createLead(
    tenantId: string,
    extra: Partial<typeof leads.$inferInsert> = {}
  ): Promise<string> {
    const id = randomUUID();
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Teste GET",
      phone: "+55 34 90000-0000",
      status: "em_qualificacao",
      firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
      ...extra,
    });
    return id;
  }

  function callGet(leadId: string, apiKey: string | null = apiKeyA) {
    const request = new Request(`http://local/api/v1/leads/${leadId}`, {
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });
    return GET(request, { params: Promise.resolve({ id: leadId }) });
  }

  it("200 com o lead e os campos de condução em ISO-8601 quando preenchidos", async () => {
    const leadId = await createLead(tenantAId, {
      externalId: `wa-${randomUUID()}`,
      humanTakeoverAt: new Date("2026-09-30T12:00:00.000Z"),
      memoryResetRequestedAt: new Date("2026-09-30T13:30:00.000Z"),
    });

    const response = await callGet(leadId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(leadId);
    expect(body.status).toBe("em_qualificacao");
    expect(body.humanTakeoverAt).toBe("2026-09-30T12:00:00.000Z");
    expect(body.memoryResetRequestedAt).toBe("2026-09-30T13:30:00.000Z");
    expect(body.optedOutAt).toBeNull();
  });

  it("200 com humanTakeoverAt e memoryResetRequestedAt nulos quando o agente conduz", async () => {
    const leadId = await createLead(tenantAId);

    const response = await callGet(leadId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("humanTakeoverAt", null);
    expect(body).toHaveProperty("memoryResetRequestedAt", null);
  });

  it("404 para lead de outro tenant, sem vazar o lead (L-035)", async () => {
    const leadOfB = await createLead(tenantBId, { name: "Lead do tenant B" });

    const response = await callGet(leadOfB);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");
    expect(JSON.stringify(body)).not.toContain("Lead do tenant B");
  });

  it("404 para id inexistente", async () => {
    const response = await callGet(randomUUID());
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe("recurso-nao-encontrado");
  });

  it("sem credencial responde 401", async () => {
    const leadId = await createLead(tenantAId);

    const response = await callGet(leadId, null);
    expect(response.status).toBe(401);
  });

  it("recusa de lead de outro tenant é registrada em integration_refusals (AD-023)", async () => {
    const leadOfB = await createLead(tenantBId);
    await callGet(leadOfB);

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.tenantId, tenantAId));
    const row = rows.find((r) => r.code === "recurso-nao-encontrado" && r.method === "GET");
    expect(row).toBeDefined();
    expect(row!.status).toBe(404);
  });
});
