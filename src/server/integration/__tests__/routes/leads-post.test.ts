import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import {
  leads,
  serviceApiKeys,
  tenantApiKeys,
  tenants,
} from "../../../../db/schema";
import { getLead, getLeads } from "../../../data";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/leads/route";
import { GET as unmatchedGet } from "../../../../../app/api/v1/[...unmatched]/route";

// Tenant + chave de API PRÓPRIOS deste arquivo (nunca reusa os 2 tenants do
// seed): evita qualquer risco de os leads criados aqui inflarem a contagem
// 20-30 verificada por `db/__tests__/seed.test.ts` ou qualquer outro teste
// que assuma o snapshot do seed intocado (mesmo padrão de isolamento de
// `dashboard.test.ts`/`recent-leads.test.ts`). Removido inteiro no afterAll.
describe("routes: POST /api/v1/leads", () => {
  let tenantId: string;
  let apiKey: string;

  beforeAll(async () => {
    tenantId = randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: `Tenant Teste leads-post ${tenantId}`,
      agentName: "Agente Teste",
      supportedModality: "ambos",
    });

    apiKey = `test-key-${randomUUID()}`;
    const keyHash = createHash("sha256").update(apiKey).digest("hex");
    await db.insert(tenantApiKeys).values({
      tenantId,
      label: "leads-post.test.ts",
      keyHash,
    });
  });

  afterAll(async () => {
    await db.delete(leads).where(eq(leads.tenantId, tenantId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    // `db.$client.end()` movido para o afterAll do último describe deste
    // arquivo (modo de serviço, lote-7) — encerrar o pool aqui quebraria o
    // describe seguinte, que reusa a mesma conexão `db`.
  });

  function makeRequest(body: unknown, withAuth = true): Request {
    return new Request("http://local/api/v1/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(withAuth ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  function validPayload(externalId: string) {
    return {
      name: "Lead Teste API",
      phone: "+55 34 90000-1234",
      externalId,
      firstContactAt: "2026-08-01T10:00:00Z",
    };
  }

  it("cria o lead com status em_qualificacao e responde 201 com o id (INT-02 AC1)", async () => {
    const externalId = randomUUID();
    const response = await POST(makeRequest(validPayload(externalId)));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBeTruthy();
    expect(body.externalId).toBe(externalId);
    expect(body.status).toBe("em_qualificacao");

    const persisted = await getLead(tenantId, body.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.externalId).toBe(externalId);
    expect(persisted!.status).toBe("em_qualificacao");
  });

  it("lead criado aparece via getLeads filtrado por em_qualificacao — telas intocadas (INT-02 AC4)", async () => {
    const externalId = randomUUID();
    const response = await POST(makeRequest(validPayload(externalId)));
    const body = await response.json();

    const rows = await getLeads(tenantId, { status: "em_qualificacao" });
    expect(rows.some((lead) => lead.id === body.id)).toBe(true);
  });

  it("reentrega do mesmo externalId: 201 e depois 200 com o mesmo id, sem duplicar (INT-02 AC2)", async () => {
    const externalId = randomUUID();

    const first = await POST(makeRequest(validPayload(externalId)));
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await POST(makeRequest(validPayload(externalId)));
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.id).toBe(firstBody.id);

    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.externalId, externalId));
    expect(rows).toHaveLength(1);
  });

  it("duas requisições concorrentes com o mesmo externalId resultam em no máximo 1 lead no banco (Edge Case — concorrência)", async () => {
    const externalId = randomUUID();
    const payload = validPayload(externalId);

    const [resA, resB] = await Promise.all([
      POST(makeRequest(payload)),
      POST(makeRequest(payload)),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 201]);

    const bodyA = await resA.json();
    const bodyB = await resB.json();
    expect(bodyA.id).toBe(bodyB.id);

    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.externalId, externalId));
    expect(rows).toHaveLength(1);
  });

  it("payload inválido (campo obrigatório ausente) responde 400 e não grava nada (INT-02 AC3)", async () => {
    const externalId = randomUUID();
    const invalidPayload = {
      // "name" ausente de propósito
      phone: "+55 34 90000-1234",
      externalId,
      firstContactAt: "2026-08-01T10:00:00Z",
    };

    const response = await POST(makeRequest(invalidPayload));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");

    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.externalId, externalId));
    expect(rows).toHaveLength(0);
  });

  it("sem header Authorization responde 401 (INT-01 AC1)", async () => {
    const externalId = randomUUID();
    const response = await POST(makeRequest(validPayload(externalId), false));
    expect(response.status).toBe(401);

    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.externalId, externalId));
    expect(rows).toHaveLength(0);
  });

  it("verbo não suportado (GET/PUT/PATCH/DELETE) responde 405 problem+json (Edge Case — verbo errado)", async () => {
    for (const handler of [GET, PUT, PATCH, DELETE]) {
      const response = handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      const body = await response.json();
      expect(body.code).toBe("metodo-nao-suportado");
    }
  });

  it("rota inexistente sob /api/v1 responde 404 problem+json, nunca HTML (Edge Case — rota inexistente)", async () => {
    const response = unmatchedGet();
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    const body = await response.json();
    expect(body.code).toBe("rota-inexistente");
  });
});

// lote-7 — SEC-01: POST /api/v1/leads testada ponta a ponta no modo de
// serviço (chave cross-tenant + X-Crivo-Tenant), além do modo por chave de
// tenant já coberto acima — os dois modos precisam produzir o mesmo
// resultado observável do contrato (design.md — "sem alteração no
// comportamento observável").
describe("routes: POST /api/v1/leads — modo de autenticação de serviço (lote-7 — SEC-01)", () => {
  let tenantId: string;
  let tenantSlug: string;
  let serviceKey: string;

  beforeAll(async () => {
    tenantId = randomUUID();
    tenantSlug = `tenant-servico-${tenantId}`;
    await db.insert(tenants).values({
      id: tenantId,
      name: `Tenant Teste leads-post servico ${tenantId}`,
      agentName: "Agente Teste",
      supportedModality: "ambos",
      slug: tenantSlug,
    });

    serviceKey = `test-service-key-${randomUUID()}`;
    const keyHash = createHash("sha256").update(serviceKey).digest("hex");
    await db.insert(serviceApiKeys).values({
      label: "leads-post.test.ts — servico",
      keyHash,
    });
  });

  afterAll(async () => {
    await db.delete(leads).where(eq(leads.tenantId, tenantId));
    await db.delete(serviceApiKeys).where(eq(serviceApiKeys.keyHash, createHash("sha256").update(serviceKey).digest("hex")));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.$client.end();
  });

  function makeServiceRequest(
    body: unknown,
    opts?: { withTenantHeader?: boolean }
  ): Request {
    const withTenantHeader = opts?.withTenantHeader ?? true;
    return new Request("http://local/api/v1/leads", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        ...(withTenantHeader ? { "X-Crivo-Tenant": tenantSlug } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  function validPayload(externalId: string) {
    return {
      name: "Lead Teste Servico",
      phone: "+55 34 90000-5678",
      externalId,
      firstContactAt: "2026-08-01T10:00:00Z",
    };
  }

  it("cria o lead no tenant correto via chave de serviço + X-Crivo-Tenant (SEC-01 AC2)", async () => {
    const externalId = randomUUID();
    const response = await POST(makeServiceRequest(validPayload(externalId)));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.externalId).toBe(externalId);

    const persisted = await getLead(tenantId, body.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.externalId).toBe(externalId);
  });

  it("chave de serviço sem X-Crivo-Tenant responde 401 tenant-nao-identificado, sem gravar nada", async () => {
    const externalId = randomUUID();
    const response = await POST(
      makeServiceRequest(validPayload(externalId), { withTenantHeader: false })
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("tenant-nao-identificado");

    const rows = await db.select().from(leads).where(eq(leads.externalId, externalId));
    expect(rows).toHaveLength(0);
  });
});
