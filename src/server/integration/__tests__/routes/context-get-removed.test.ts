import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { documents, integrationRefusals, tenantApiKeys, tenants } from "../../../../db/schema";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/context/route";

// lote-12 — T36: o GET legado (`?modality=`, shape com `content: null`) era o
// caminho de rollback enquanto o agente publicado migrava para o POST. Depois
// da prova conversacional ele sai: estes testes provam a remoção e a ausência
// de qualquer fallback para o contrato antigo.
describe("routes: GET /api/v1/context removido (lote-12 T36)", () => {
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
        slug: `fixture-${tenantAId}`,
      },
      {
        id: tenantBId,
        name: `Tenant Teste B context-get ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
        slug: `fixture-${tenantBId}`,
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
        storageProvider: "test",
        storageKey: `test/${tenantAId}/${docNovoAId}`,
        storageEtag: `test-etag-${docNovoAId}`,
        contentSha256: `${docNovoAId.replaceAll("-", "")}${docNovoAId.replaceAll("-", "")}`,
        status: "pronto",
        expiresAt: null,
      },
      {
        id: docOfBId,
        tenantId: tenantBId,
        name: "Doc Novo B.pdf",
        modality: "novo",
        mimeType: "application/pdf",
        sizeBytes: BigInt(1000),
        storageProvider: "test",
        storageKey: `test/${tenantBId}/${docOfBId}`,
        storageEtag: `test-etag-${docOfBId}`,
        contentSha256: `${docOfBId.replaceAll("-", "")}${docOfBId.replaceAll("-", "")}`,
        status: "pronto",
        expiresAt: null,
      },
    ]);
  });

  afterAll(async () => {
    // integration_refusals precisa sumir ANTES do tenant — FK sem
    // onDelete, um tenant com recusa pendurada nunca deleta (lote-9 — T15).
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantAId));
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantBId));
    await db.delete(documents).where(eq(documents.tenantId, tenantAId));
    await db.delete(documents).where(eq(documents.tenantId, tenantBId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  function makeRequest(query: string, apiKey?: string, init: RequestInit = {}): Request {
    return new Request(`http://local/api/v1/context${query}`, {
      ...init,
      headers: {
        ...(apiKey !== undefined ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  }

  it("GET autenticado com modalidade válida responde 405 e anuncia só POST", async () => {
    const response = GET(makeRequest("?modality=novo", apiKeyA));
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect((await response.json()).code).toBe("metodo-nao-suportado");
  });

  it("não há fallback: o GET não devolve documento nenhum, nem o shape antigo", async () => {
    const response = GET(makeRequest("?modality=novo", apiKeyA));
    const text = await response.text();
    expect(text).not.toContain(docNovoAId);
    expect(text).not.toContain(docOfBId);
    expect(Array.isArray(JSON.parse(text))).toBe(false);
  });

  it("GET sem modalidade também é 405, não mais o 400 de validação do contrato antigo", async () => {
    const response = GET(makeRequest("", apiKeyA));
    expect(response.status).toBe(405);
  });

  it("PUT, PATCH e DELETE anunciam só POST como método permitido", async () => {
    for (const handler of [PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
    }
  });

  it("o POST segue sendo o contrato: responde 200 com o envelope direct", async () => {
    const response = await POST(
      makeRequest("", apiKeyA, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modality: "ambos", question: "Quais são as regras?" }),
      })
    );
    expect(response.status).toBe(200);
    expect((await response.json()).retrievalMode).toBe("direct");
  });
});
