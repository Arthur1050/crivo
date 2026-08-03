import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { documents, tenantApiKeys, tenants } from "../../../../db/schema";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/context/route";

describe("routes: GET /api/v1/context", () => {
  let tenantAId: string;
  let apiKeyA: string;
  let tenantBId: string;
  let docNovoAId: string;
  let docOfBId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A context-get ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
      },
      {
        id: tenantBId,
        name: `Tenant Teste B context-get ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
      },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values({
      tenantId: tenantAId,
      label: "context-get.test.ts",
      keyHash: createHash("sha256").update(apiKeyA).digest("hex"),
    });

    docNovoAId = randomUUID();
    docOfBId = randomUUID();
    await db.insert(documents).values([
      {
        id: docNovoAId,
        tenantId: tenantAId,
        name: "Doc Novo A.pdf",
        modality: "novo",
        mimeType: "application/pdf",
        sizeBytes: BigInt(1000),
        expiresAt: null,
      },
      {
        id: docOfBId,
        tenantId: tenantBId,
        name: "Doc Novo B.pdf",
        modality: "novo",
        mimeType: "application/pdf",
        sizeBytes: BigInt(1000),
        expiresAt: null,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(documents).where(eq(documents.tenantId, tenantAId));
    await db.delete(documents).where(eq(documents.tenantId, tenantBId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  function makeRequest(query: string, apiKey?: string): Request {
    return new Request(`http://local/api/v1/context${query}`, {
      headers: apiKey !== undefined ? { Authorization: `Bearer ${apiKey}` } : {},
    });
  }

  it("modality=novo responde 200 com os documentos do tenant, isolado de outros tenants (INT-01 AC2/INT-06 AC1)", async () => {
    const response = await GET(makeRequest("?modality=novo", apiKeyA));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    const ids = body.map((d: { id: string }) => d.id);
    expect(ids).toContain(docNovoAId);
    expect(ids).not.toContain(docOfBId);
  });

  it("modality ausente responde 400 payload-invalido (INT-06 AC3)", async () => {
    const response = await GET(makeRequest("", apiKeyA));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");
  });

  it("modality inválida responde 400 payload-invalido (INT-06 AC3)", async () => {
    const response = await GET(makeRequest("?modality=comercial", apiKeyA));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");
  });

  it("sem header Authorization responde 401 (INT-01 AC1)", async () => {
    const response = await GET(makeRequest("?modality=novo"));
    expect(response.status).toBe(401);
  });

  it("verbo não suportado (POST/PUT/PATCH/DELETE) responde 405 problem+json", async () => {
    for (const handler of [POST, PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      const body = await response.json();
      expect(body.code).toBe("metodo-nao-suportado");
    }
  });
});
