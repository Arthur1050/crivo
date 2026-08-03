import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import {
  conversations,
  leads,
  messages,
  tenantApiKeys,
  tenants,
} from "../../../../db/schema";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/leads/[id]/messages/route";
import { MAX_BODY_BYTES } from "../../parsers";

describe("routes: POST /api/v1/leads/[id]/messages", () => {
  // Tenants A e B PRÓPRIOS deste arquivo — mesmo padrão de leads-patch.test.ts:
  // A tem a chave de API; B só existe para provar o isolamento cross-tenant.
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
        name: `Tenant Teste A leads-messages-post ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
      },
      {
        id: tenantBId,
        name: `Tenant Teste B leads-messages-post ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
      },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values({
      tenantId: tenantAId,
      label: "leads-messages-post.test.ts",
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
    await db.delete(messages).where(eq(messages.tenantId, tenantAId));
    await db.delete(messages).where(eq(messages.tenantId, tenantBId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantAId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantBId));
    await db.delete(leads).where(eq(leads.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantBId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  function makeRequest(
    leadId: string,
    body: unknown,
    opts?: { apiKey?: string; raw?: string }
  ): Request {
    return new Request(`http://local/api/v1/leads/${leadId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts?.apiKey !== undefined
          ? opts.apiKey
            ? { Authorization: `Bearer ${opts.apiKey}` }
            : {}
          : { Authorization: `Bearer ${apiKeyA}` }),
      },
      body: opts?.raw ?? JSON.stringify(body),
    });
  }

  function callPost(leadId: string, body: unknown, opts?: { apiKey?: string }) {
    return POST(makeRequest(leadId, body, opts), {
      params: Promise.resolve({ id: leadId }),
    });
  }

  function validPayload(externalId: string) {
    return {
      externalId,
      sender: "lead",
      content: "Tenho interesse no apartamento.",
      sentAt: "2026-08-01T10:00:00Z",
    };
  }

  it("mensagem válida responde 201 e persiste (INT-05 AC1)", async () => {
    const externalId = randomUUID();
    const response = await callPost(leadAId, validPayload(externalId));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTruthy();
    expect(body.externalId).toBe(externalId);
    expect(body.sender).toBe("lead");
    expect(body.content).toBe("Tenho interesse no apartamento.");

    const rows = await db.select().from(messages).where(eq(messages.externalId, externalId));
    expect(rows).toHaveLength(1);
  });

  it("reentrega do mesmo externalId responde 200 com a mesma mensagem, sem duplicar (INT-05 AC2)", async () => {
    const externalId = randomUUID();

    const first = await callPost(leadAId, validPayload(externalId));
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await callPost(leadAId, validPayload(externalId));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.id).toBe(firstBody.id);

    const rows = await db.select().from(messages).where(eq(messages.externalId, externalId));
    expect(rows).toHaveLength(1);
  });

  it("lead inexistente no tenant responde 404 (Edge Case)", async () => {
    const response = await callPost(randomUUID(), validPayload(randomUUID()));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");
  });

  it("lead de outro tenant responde 404, nunca 403 (INT-01 AC3)", async () => {
    const response = await callPost(leadOfBId, validPayload(randomUUID()));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");
  });

  it("payload inválido (sender fora do domínio) responde 400 e não grava nada", async () => {
    const externalId = randomUUID();
    const response = await callPost(leadAId, {
      externalId,
      sender: "corretor", // fora do domínio {agente, lead}
      content: "X",
      sentAt: "2026-08-01T10:00:00Z",
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");

    const rows = await db.select().from(messages).where(eq(messages.externalId, externalId));
    expect(rows).toHaveLength(0);
  });

  it("corpo não é JSON válido responde 400 payload-invalido", async () => {
    const request = new Request(`http://local/api/v1/leads/${leadAId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKeyA}`,
      },
      body: "{ isso não é json",
    });
    const response = await POST(request, { params: Promise.resolve({ id: leadAId }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");
  });

  it("corpo maior que o limite responde 413 corpo-grande-demais", async () => {
    const hugeContent = "x".repeat(MAX_BODY_BYTES + 1);
    const request = makeRequest(leadAId, undefined, {
      raw: JSON.stringify({ ...validPayload(randomUUID()), content: hugeContent }),
    });

    const response = await POST(request, { params: Promise.resolve({ id: leadAId }) });
    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.code).toBe("corpo-grande-demais");
  });

  it("sem header Authorization responde 401", async () => {
    const response = await callPost(leadAId, validPayload(randomUUID()), { apiKey: "" });
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
