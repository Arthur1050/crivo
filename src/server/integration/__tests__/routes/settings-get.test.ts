import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { tenantApiKeys, tenants } from "../../../../db/schema";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/settings/route";

describe("routes: GET /api/v1/settings", () => {
  let tenantAId: string;
  let apiKeyA: string;
  let tenantBId: string;
  let apiKeyB: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: "Tenant Teste A settings-get",
        agentName: "Agente A",
        supportedModality: "ambos",
        agentPresentationMessage: "Mensagem de apresentação do tenant A.",
        meetingDays: [1, 3, 5],
        meetingHoursStart: "08:00",
        meetingHoursEnd: "12:00",
      },
      {
        id: tenantBId,
        name: "Tenant Teste B settings-get",
        agentName: "Agente B",
        supportedModality: "usado",
        // Sem agentPresentationMessage/horário comercial — fica null.
      },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    apiKeyB = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values([
      {
        tenantId: tenantAId,
        label: "settings-get.test.ts A",
        keyHash: createHash("sha256").update(apiKeyA).digest("hex"),
      },
      {
        tenantId: tenantBId,
        label: "settings-get.test.ts B",
        keyHash: createHash("sha256").update(apiKeyB).digest("hex"),
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantBId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  function makeRequest(apiKey?: string): Request {
    return new Request("http://local/api/v1/settings", {
      headers: apiKey !== undefined ? { Authorization: `Bearer ${apiKey}` } : {},
    });
  }

  it("200 com o shape completo do tenant A, incluindo horário comercial configurado (INT-09 AC2)", async () => {
    const response = await GET(makeRequest(apiKeyA));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      realEstateName: "Tenant Teste A settings-get",
      agentName: "Agente A",
      supportedModality: "ambos",
      agentPresentationMessage: "Mensagem de apresentação do tenant A.",
      meetingDays: [1, 3, 5],
      meetingHoursStart: "08:00",
      meetingHoursEnd: "12:00",
    });
  });

  it("tenant sem horário comercial configurado responde null nos 3 campos (CONF-05 AC4)", async () => {
    const response = await GET(makeRequest(apiKeyB));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.realEstateName).toBe("Tenant Teste B settings-get");
    expect(body.agentName).toBe("Agente B");
    expect(body.supportedModality).toBe("usado");
    expect(body.agentPresentationMessage).toBeNull();
    expect(body.meetingDays).toBeNull();
    expect(body.meetingHoursStart).toBeNull();
    expect(body.meetingHoursEnd).toBeNull();
  });

  it("2 tenants distintos → payloads distintos (isolamento por chave, INT-01 AC2)", async () => {
    const responseA = await GET(makeRequest(apiKeyA));
    const responseB = await GET(makeRequest(apiKeyB));
    const bodyA = await responseA.json();
    const bodyB = await responseB.json();

    expect(bodyA.realEstateName).not.toBe(bodyB.realEstateName);
    expect(bodyA.meetingDays).not.toEqual(bodyB.meetingDays);
  });

  it("sem header Authorization responde 401 (INT-01 AC1)", async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("nao-autenticado");
  });

  it("chave inválida responde 401 (INT-01 AC1)", async () => {
    const response = await GET(makeRequest("chave-que-nao-existe"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("nao-autenticado");
  });

  it("verbo não suportado (POST/PUT/PATCH/DELETE) responde 405 problem+json com header Allow: GET", async () => {
    for (const handler of [POST, PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(response.headers.get("Allow")).toBe("GET");
      const body = await response.json();
      expect(body.code).toBe("metodo-nao-suportado");
    }
  });
});
