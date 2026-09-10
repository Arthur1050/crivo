import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import {
  integrationRefusals,
  properties,
  serviceApiKeys,
  tenant_members,
  tenants,
  users,
} from "../../../../db/schema";
import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../../../../app/api/v1/properties/route";

type PropertyInsert = typeof properties.$inferInsert;

/**
 * `GET /api/v1/properties` (tasks.md — T13; spec.md BUSCA-01/03). Molde
 * direto de `context-get.test.ts`/`leads-post.test.ts` (modo de serviço):
 * tenants, captador e chave de serviço próprios deste arquivo, no modo de
 * autenticação que a tool `buscar_imoveis` de fato usa (chave de serviço
 * cross-tenant + `X-Crivo-Tenant`, SEC-01).
 */
describe("routes: GET /api/v1/properties", () => {
  let tenantAId: string;
  let tenantASlug: string;
  let tenantBId: string;
  let tenantBSlug: string;
  let capturerAId: string;
  let capturerBId: string;
  let serviceKey: string;
  let sequenceCounter = 0;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantASlug = `fixture-properties-get-a-${tenantAId}`;
    tenantBId = randomUUID();
    tenantBSlug = `fixture-properties-get-b-${tenantBId}`;
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A properties-get ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
        slug: tenantASlug,
      },
      {
        id: tenantBId,
        name: `Tenant Teste B properties-get ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
        slug: tenantBSlug,
      },
    ]);

    capturerAId = randomUUID();
    capturerBId = randomUUID();
    await db.insert(users).values([
      { id: capturerAId, name: "Captador A", email: `${capturerAId}@fixture.test` },
      { id: capturerBId, name: "Captador B", email: `${capturerBId}@fixture.test` },
    ]);
    await db.insert(tenant_members).values([
      { organizationId: tenantAId, userId: capturerAId, role: "corretor" },
      { organizationId: tenantBId, userId: capturerBId, role: "corretor" },
    ]);

    serviceKey = `test-service-key-${randomUUID()}`;
    await db.insert(serviceApiKeys).values({
      label: "properties-get.test.ts",
      keyHash: createHash("sha256").update(serviceKey).digest("hex"),
    });
  });

  afterAll(async () => {
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantAId));
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantBId));
    await db.delete(properties).where(eq(properties.tenantId, tenantAId));
    await db.delete(properties).where(eq(properties.tenantId, tenantBId));
    await db.delete(tenant_members).where(eq(tenant_members.organizationId, tenantAId));
    await db.delete(tenant_members).where(eq(tenant_members.organizationId, tenantBId));
    await db
      .delete(serviceApiKeys)
      .where(eq(serviceApiKeys.keyHash, createHash("sha256").update(serviceKey).digest("hex")));
    await db.delete(users).where(eq(users.id, capturerAId));
    await db.delete(users).where(eq(users.id, capturerBId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.$client.end();
  });

  async function insertProperty(
    tenantId: string,
    capturedByUserId: string,
    overrides: Partial<PropertyInsert> = {}
  ): Promise<string> {
    const id = randomUUID();
    sequenceCounter += 1;
    await db.insert(properties).values({
      id,
      tenantId,
      capturedByUserId,
      sequence: sequenceCounter,
      reference: `PG-${sequenceCounter}`,
      kind: "casa",
      modality: "novo",
      status: "disponivel",
      published: true,
      neighborhood: "Centro",
      neighborhoodNormalized: "centro",
      city: "Uberaba",
      cityNormalized: "uberaba",
      state: "MG",
      priceCents: 100_000_00n,
      areaSqm: 80,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpots: 1,
      updatedAt: new Date(),
      ...overrides,
    });
    return id;
  }

  function makeRequest(
    query: string,
    opts?: { apiKey?: string | null; tenantSlug?: string | null }
  ): Request {
    // `undefined` (chave não passada em `opts`) usa a chave de serviço
    // válida por default; `null` explícito OMITE o header — é o que os
    // testes de recusa de autenticação/tenant precisam simular. Checar
    // `"apiKey" in opts` (em vez de `opts?.apiKey ?? serviceKey`) é o que
    // distingue os dois: `?? ` trataria `{ apiKey: null }` e "chave ausente"
    // como o mesmo caso, e o teste de "sem Authorization" silenciosamente
    // voltaria a usar a chave válida.
    const apiKey = opts && "apiKey" in opts ? opts.apiKey : serviceKey;
    const tenantSlug =
      opts && "tenantSlug" in opts ? opts.tenantSlug : tenantASlug;
    return new Request(`http://local/api/v1/properties${query}`, {
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...(tenantSlug !== null ? { "X-Crivo-Tenant": tenantSlug } : {}),
      },
    });
  }

  it("sem filtro nenhum devolve os imóveis visíveis do tenant (happy path)", async () => {
    const id = await insertProperty(tenantAId, capturerAId);
    const [row] = await db.select().from(properties).where(eq(properties.id, id));

    const response = await GET(makeRequest(""));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.imoveis.map((p: { referencia: string }) => p.referencia)).toContain(
      row.reference
    );
    expect(typeof body.total).toBe("number");
  });

  it("com filtros combinados devolve só o que casa com todos eles", async () => {
    const matchId = await insertProperty(tenantAId, capturerAId, {
      kind: "cobertura",
      modality: "usado",
    });
    await insertProperty(tenantAId, capturerAId, { kind: "casa", modality: "novo" });
    const [matchRow] = await db.select().from(properties).where(eq(properties.id, matchId));

    const response = await GET(makeRequest("?tipo=cobertura&modalidade=usado"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.imoveis.map((p: { referencia: string }) => p.referencia)).toEqual([
      matchRow.reference,
    ]);
  });

  it("filtro inválido responde 400 payload-invalido, e a recusa é registrada em integration_refusals (AD-023)", async () => {
    const response = await GET(makeRequest("?precoMin=abc"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");
    expect(response.headers.get("content-type")).toBe("application/problem+json");

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.tenantId, tenantAId));
    expect(rows.some((r) => r.status === 400 && r.code === "payload-invalido")).toBe(
      true
    );
  });

  it("precoMin maior que precoMax responde 400 payload-invalido", async () => {
    const response = await GET(makeRequest("?precoMin=500000&precoMax=100000"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("payload-invalido");
  });

  it("sem header Authorization responde 401, sem cair em tenant default (SEC-01)", async () => {
    const response = await GET(makeRequest("", { apiKey: null }));
    expect(response.status).toBe(401);
  });

  it("chave de serviço sem X-Crivo-Tenant responde 401 tenant-nao-identificado (SEC-01)", async () => {
    const response = await GET(makeRequest("", { tenantSlug: null }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("tenant-nao-identificado");
  });

  it("X-Crivo-Tenant com slug desconhecido responde 401 tenant-nao-identificado, sem cair em tenant default (SEC-01)", async () => {
    const response = await GET(makeRequest("", { tenantSlug: `slug-desconhecido-${randomUUID()}` }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("tenant-nao-identificado");
  });

  it("tenant A e tenant B com a MESMA chave de serviço devolvem conjuntos disjuntos", async () => {
    const idA = await insertProperty(tenantAId, capturerAId);
    const idB = await insertProperty(tenantBId, capturerBId);
    const [rowA] = await db.select().from(properties).where(eq(properties.id, idA));
    const [rowB] = await db.select().from(properties).where(eq(properties.id, idB));

    const responseA = await GET(makeRequest("", { tenantSlug: tenantASlug }));
    const responseB = await GET(makeRequest("", { tenantSlug: tenantBSlug }));
    const bodyA = await responseA.json();
    const bodyB = await responseB.json();

    const refsA: string[] = bodyA.imoveis.map((p: { referencia: string }) => p.referencia);
    const refsB: string[] = bodyB.imoveis.map((p: { referencia: string }) => p.referencia);

    expect(refsA).toContain(rowA.reference);
    expect(refsA).not.toContain(rowB.reference);
    expect(refsB).toContain(rowB.reference);
    expect(refsB).not.toContain(rowA.reference);
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
