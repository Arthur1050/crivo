import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { leads, tenantApiKeys, tenants } from "../../../../db/schema";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/leads/[id]/opt-out/route";

describe("routes: POST /api/v1/leads/[id]/opt-out", () => {
  let tenantAId: string;
  let apiKeyA: string;
  let tenantBId: string;
  let leadAId: string;
  let leadOfBId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A leads-opt-out ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
      },
      {
        id: tenantBId,
        name: `Tenant Teste B leads-opt-out ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
      },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values({
      tenantId: tenantAId,
      label: "leads-opt-out.test.ts",
      keyHash: createHash("sha256").update(apiKeyA).digest("hex"),
    });

    leadAId = randomUUID();
    leadOfBId = randomUUID();
    await db.insert(leads).values([
      {
        id: leadAId,
        tenantId: tenantAId,
        name: "Lead Teste A",
        phone: "+55 34 90000-0000",
        status: "em_qualificacao",
        firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: leadOfBId,
        tenantId: tenantBId,
        name: "Lead Teste B",
        phone: "+55 34 90000-0001",
        status: "em_qualificacao",
        firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(leads).where(eq(leads.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantBId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  function makeRequest(leadId: string, opts?: { apiKey?: string }): Request {
    return new Request(`http://local/api/v1/leads/${leadId}/opt-out`, {
      method: "POST",
      headers:
        opts?.apiKey !== undefined
          ? opts.apiKey
            ? { Authorization: `Bearer ${opts.apiKey}` }
            : {}
          : { Authorization: `Bearer ${apiKeyA}` },
    });
  }

  function callOptOut(leadId: string, opts?: { apiKey?: string }) {
    return POST(makeRequest(leadId, opts), {
      params: Promise.resolve({ id: leadId }),
    });
  }

  it("registra o opt-out e responde 200 com optedOutAt preenchido (LGPD-01 AC2/AC3)", async () => {
    const response = await callOptOut(leadAId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(leadAId);
    expect(body.optedOutAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(body.optedOutAt))).toBe(false);
  });

  it("chamar duas vezes preserva o mesmo timestamp — idempotente (LGPD-01 AC2)", async () => {
    const leadId = randomUUID();
    await db.insert(leads).values({
      id: leadId,
      tenantId: tenantAId,
      name: "Lead Teste idempotência",
      phone: "+55 34 90000-0002",
      status: "em_qualificacao",
      firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const first = await callOptOut(leadId);
    const firstBody = await first.json();

    const second = await callOptOut(leadId);
    const secondBody = await second.json();

    expect(secondBody.optedOutAt).toBe(firstBody.optedOutAt);
  });

  it("lead inexistente no tenant responde 404", async () => {
    const response = await callOptOut(randomUUID());
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");
  });

  it("lead de outro tenant responde 404, nunca 403 (INT-01 AC3)", async () => {
    const response = await callOptOut(leadOfBId);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");

    const untouched = await db.select().from(leads).where(eq(leads.id, leadOfBId));
    expect(untouched[0].optedOutAt).toBeNull();
  });

  it("sem header Authorization responde 401", async () => {
    const response = await callOptOut(leadAId, { apiKey: "" });
    expect(response.status).toBe(401);
  });

  it("verbo não suportado (GET/PUT/PATCH/DELETE) responde 405 problem+json", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      const body = await response.json();
      expect(body.code).toBe("metodo-nao-suportado");
    }
  });
});
