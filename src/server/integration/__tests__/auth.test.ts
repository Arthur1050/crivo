import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { serviceApiKeys, tenantApiKeys, tenants } from "../../../db/schema";
import { getTenants } from "../../data";
import { authenticate } from "../auth";

// Cada teste cria sua própria chave de API (própria linha em
// tenant_api_keys, hash derivado de um valor aleatório único por teste) e
// remove ao final — nunca depende das chaves reais do seed (que são
// impressas uma única vez e não ficam disponíveis para o teste ler de
// volta).
async function createTestApiKey(
  tenantId: string,
  opts?: { revoked?: boolean }
): Promise<{ key: string; id: string }> {
  const key = `test-key-${randomUUID()}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const [row] = await db
    .insert(tenantApiKeys)
    .values({
      tenantId,
      label: "auth.test.ts",
      keyHash,
      revokedAt: opts?.revoked ? new Date() : null,
    })
    .returning({ id: tenantApiKeys.id });
  return { key, id: row.id };
}

async function deleteTestApiKey(id: string): Promise<void> {
  await db.delete(tenantApiKeys).where(eq(tenantApiKeys.id, id));
}

// Mesmo padrão de isolamento acima, para o modo de serviço (lote-7 —
// SEC-01): cada teste cria sua própria chave de serviço e tenant(s) com slug
// próprio, e remove ao final.
async function createTestServiceKey(): Promise<{ key: string; id: string }> {
  const key = `test-service-key-${randomUUID()}`;
  const keyHash = createHash("sha256").update(key).digest("hex");
  const [row] = await db
    .insert(serviceApiKeys)
    .values({ label: "auth.test.ts — serviço", keyHash })
    .returning({ id: serviceApiKeys.id });
  return { key, id: row.id };
}

async function deleteTestServiceKey(id: string): Promise<void> {
  await db.delete(serviceApiKeys).where(eq(serviceApiKeys.id, id));
}

async function createTestTenantWithSlug(slug: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name: `Tenant Teste auth.test.ts ${slug}`,
    agentName: "Agente Teste",
    supportedModality: "ambos",
    slug,
  });
  return id;
}

async function deleteTestTenant(id: string): Promise<void> {
  await db.delete(tenants).where(eq(tenants.id, id));
}

describe("server/integration auth", () => {
  afterAll(async () => {
    await db.$client.end();
  });

  it("sem header Authorization retorna 401 problem+json (INT-01 AC1)", async () => {
    const request = new Request("http://local/api/v1/leads");
    const result = await authenticate(request);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("esperava Response");
    expect(result.status).toBe(401);
    const body = await result.json();
    expect(body.code).toBe("nao-autenticado");
  });

  it("chave que nunca existiu retorna 401 (INT-01 AC1)", async () => {
    const request = new Request("http://local/api/v1/leads", {
      headers: { Authorization: `Bearer chave-inexistente-${randomUUID()}` },
    });
    const result = await authenticate(request);

    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response)) throw new Error("esperava Response");
    expect(result.status).toBe(401);
  });

  it("chave revogada retorna 401, mesmo com o hash correto (INT-01 AC1)", async () => {
    const [tenant] = await getTenants();
    const { key, id } = await createTestApiKey(tenant.id, { revoked: true });

    const request = new Request("http://local/api/v1/leads", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const result = await authenticate(request);

    expect(result).toBeInstanceOf(Response);
    if (result instanceof Response) expect(result.status).toBe(401);

    await deleteTestApiKey(id);
  });

  it("chave válida resolve o tenantId correto (INT-01 AC2)", async () => {
    const [tenant] = await getTenants();
    const { key, id } = await createTestApiKey(tenant.id);

    const request = new Request("http://local/api/v1/leads", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const result = await authenticate(request);

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("esperava AuthResult");
    expect(result.tenantId).toBe(tenant.id);

    await deleteTestApiKey(id);
  });

  it("chave do tenant A resolve o tenant A mesmo quando o corpo da requisição traz um tenant_id de outro tenant (INT-01 AC2 — payload nunca é fonte de tenant)", async () => {
    const [tenantA, tenantB] = await getTenants();
    const { key, id } = await createTestApiKey(tenantA.id);

    const request = new Request("http://local/api/v1/leads", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenant_id: tenantB.id }),
    });
    const result = await authenticate(request);

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) throw new Error("esperava AuthResult");
    expect(result.tenantId).toBe(tenantA.id);
    expect(result.tenantId).not.toBe(tenantB.id);

    await deleteTestApiKey(id);
  });

  describe("modo de serviço (lote-7 — SEC-01)", () => {
    it("chave de serviço + X-Crivo-Tenant válido resolve o tenant correto", async () => {
      const { key, id: serviceKeyId } = await createTestServiceKey();
      const slug = `tenant-auth-${randomUUID()}`;
      const tenantId = await createTestTenantWithSlug(slug);

      const request = new Request("http://local/api/v1/leads", {
        headers: {
          Authorization: `Bearer ${key}`,
          "X-Crivo-Tenant": slug,
        },
      });
      const result = await authenticate(request);

      expect(result).not.toBeInstanceOf(Response);
      if (result instanceof Response) throw new Error("esperava AuthResult");
      expect(result.tenantId).toBe(tenantId);

      await deleteTestServiceKey(serviceKeyId);
      await deleteTestTenant(tenantId);
    });

    it("chave de serviço sem X-Crivo-Tenant retorna 401 tenant-nao-identificado", async () => {
      const { key, id: serviceKeyId } = await createTestServiceKey();

      const request = new Request("http://local/api/v1/leads", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const result = await authenticate(request);

      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response)) throw new Error("esperava Response");
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.code).toBe("tenant-nao-identificado");

      await deleteTestServiceKey(serviceKeyId);
    });

    it("chave de serviço com slug desconhecido retorna 401 tenant-nao-identificado — nunca cai em tenant default", async () => {
      const { key, id: serviceKeyId } = await createTestServiceKey();

      const request = new Request("http://local/api/v1/leads", {
        headers: {
          Authorization: `Bearer ${key}`,
          "X-Crivo-Tenant": `slug-desconhecido-${randomUUID()}`,
        },
      });
      const result = await authenticate(request);

      expect(result).toBeInstanceOf(Response);
      if (!(result instanceof Response)) throw new Error("esperava Response");
      expect(result.status).toBe(401);
      const body = await result.json();
      expect(body.code).toBe("tenant-nao-identificado");

      await deleteTestServiceKey(serviceKeyId);
    });

    it("chave do tenant A + header X-Crivo-Tenant do tenant B resolve A — chave de tenant ignora o header (teste discriminante)", async () => {
      const [tenantA, tenantB] = await getTenants();
      const { key, id: apiKeyId } = await createTestApiKey(tenantA.id);
      const slugB = `tenant-b-auth-${randomUUID()}`;
      const tenantBWithSlugId = await createTestTenantWithSlug(slugB);

      const request = new Request("http://local/api/v1/leads", {
        headers: {
          Authorization: `Bearer ${key}`,
          "X-Crivo-Tenant": slugB,
        },
      });
      const result = await authenticate(request);

      expect(result).not.toBeInstanceOf(Response);
      if (result instanceof Response) throw new Error("esperava AuthResult");
      expect(result.tenantId).toBe(tenantA.id);
      expect(result.tenantId).not.toBe(tenantBWithSlugId);
      expect(result.tenantId).not.toBe(tenantB.id);

      await deleteTestApiKey(apiKeyId);
      await deleteTestTenant(tenantBWithSlugId);
    });
  });
});
