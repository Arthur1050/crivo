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
  PUT,
} from "../../../../../app/api/v1/leads/[id]/messages/route";

describe("routes: GET /api/v1/leads/[id]/messages (lote-6b — CTX-02)", () => {
  // Tenants A e B PRÓPRIOS deste arquivo — mesmo padrão de isolamento dos
  // demais testes de rota do contrato (lote-5/6).
  let tenantAId: string;
  let apiKeyA: string;
  let tenantBId: string;
  let apiKeyB: string;
  let leadAId: string;
  let leadOfBId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A leads-messages-get ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
      },
      {
        id: tenantBId,
        name: `Tenant Teste B leads-messages-get ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
      },
    ]);

    apiKeyA = `test-key-${randomUUID()}`;
    apiKeyB = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values([
      {
        tenantId: tenantAId,
        label: "leads-messages-get.test.ts A",
        keyHash: createHash("sha256").update(apiKeyA).digest("hex"),
      },
      {
        tenantId: tenantBId,
        label: "leads-messages-get.test.ts B",
        keyHash: createHash("sha256").update(apiKeyB).digest("hex"),
      },
    ]);

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

    const [conversationA] = await db
      .insert(conversations)
      .values({ tenantId: tenantAId, leadId: leadAId })
      .returning();

    const seedOrder = [3, 1, 5, 2, 4];
    for (const n of seedOrder) {
      await db.insert(messages).values({
        tenantId: tenantAId,
        conversationId: conversationA.id,
        sender: n % 2 === 0 ? "agente" : "lead",
        content: `mensagem ${n}`,
        sentAt: new Date(`2026-08-01T10:0${n}:00.000Z`),
      });
    }
  });

  afterAll(async () => {
    await db.delete(messages).where(eq(messages.tenantId, tenantAId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantBId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantAId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantBId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  function callGet(
    leadId: string,
    opts?: { apiKey?: string; query?: string }
  ) {
    const request = new Request(
      `http://local/api/v1/leads/${leadId}/messages${opts?.query ?? ""}`,
      {
        headers:
          opts?.apiKey !== undefined
            ? opts.apiKey
              ? { Authorization: `Bearer ${opts.apiKey}` }
              : {}
            : { Authorization: `Bearer ${apiKeyA}` },
      }
    );
    return GET(request, { params: Promise.resolve({ id: leadId }) });
  }

  it("200 com a lista em ordem crescente, formato SerializedMessage (CTX-02 AC1)", async () => {
    const response = await callGet(leadAId);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveLength(5);
    expect(body.map((m: { content: string }) => m.content)).toEqual([
      "mensagem 1",
      "mensagem 2",
      "mensagem 3",
      "mensagem 4",
      "mensagem 5",
    ]);
    expect(body[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        externalId: null,
        sender: "lead",
        content: "mensagem 1",
        sentAt: expect.any(String),
      })
    );
  });

  it("?limit=2 devolve 2 itens, as mensagens mais recentes em ordem crescente (CTX-02 AC2)", async () => {
    const response = await callGet(leadAId, { query: "?limit=2" });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(body.map((m: { content: string }) => m.content)).toEqual([
      "mensagem 4",
      "mensagem 5",
    ]);
  });

  it("?limit=0 responde 400 payload-invalido (CTX-02 AC3)", async () => {
    const response = await callGet(leadAId, { query: "?limit=0" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");
  });

  it("lead de outro tenant responde 404 recurso-nao-encontrado (CTX-02 AC4)", async () => {
    const response = await callGet(leadOfBId);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");
  });

  it("lead inexistente responde 404 recurso-nao-encontrado", async () => {
    const response = await callGet(randomUUID());
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("recurso-nao-encontrado");
  });

  it("sem header Authorization responde 401 (CTX-02 AC5)", async () => {
    const response = await callGet(leadAId, { apiKey: "" });
    expect(response.status).toBe(401);
  });

  it("chave inválida responde 401 (CTX-02 AC5)", async () => {
    const response = await callGet(leadAId, { apiKey: "chave-que-nao-existe" });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("nao-autenticado");
  });

  it("chave de outro tenant não vê as mensagens do lead de A (isolamento por chave)", async () => {
    const response = await callGet(leadAId, { apiKey: apiKeyB });
    expect(response.status).toBe(404);
  });

  it("verbo não suportado (PUT/PATCH/DELETE) responde 405 com Allow: GET, POST", async () => {
    for (const handler of [PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, POST");
      const body = await response.json();
      expect(body.code).toBe("metodo-nao-suportado");
    }
  });
});
