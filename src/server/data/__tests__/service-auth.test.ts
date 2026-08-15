import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { serviceApiKeys, tenants } from "../../../db/schema";
import { resolveServiceApiKeyHash, resolveTenantIdBySlug } from "../index";

// Cada teste cria sua própria chave de serviço (própria linha em
// service_api_keys) e remove ao final — mesmo padrão de isolamento de
// `src/server/integration/__tests__/auth.test.ts`, nunca depende de uma
// chave real do seed (impressa uma única vez, não recuperável).
async function createTestServiceKey(
  opts?: { revoked?: boolean }
): Promise<{ hash: string; id: string }> {
  const key = `test-service-key-${randomUUID()}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const [row] = await db
    .insert(serviceApiKeys)
    .values({
      label: "service-auth.test.ts",
      keyHash: hash,
      revokedAt: opts?.revoked ? new Date() : null,
    })
    .returning({ id: serviceApiKeys.id });
  return { hash, id: row.id };
}

async function deleteTestServiceKey(id: string): Promise<void> {
  await db.delete(serviceApiKeys).where(eq(serviceApiKeys.id, id));
}

describe("server/data — resolveServiceApiKeyHash / resolveTenantIdBySlug (lote-7 — SEC-01)", () => {
  afterAll(async () => {
    await db.$client.end();
  });

  describe("resolveServiceApiKeyHash", () => {
    it("hash de chave de serviço ativa resolve, devolvendo o id da chave", async () => {
      const { hash, id } = await createTestServiceKey();

      const resolved = await resolveServiceApiKeyHash(hash);
      expect(resolved).toBe(id);

      await deleteTestServiceKey(id);
    });

    it("hash de chave revogada devolve null", async () => {
      const { hash, id } = await createTestServiceKey({ revoked: true });

      const resolved = await resolveServiceApiKeyHash(hash);
      expect(resolved).toBeNull();

      await deleteTestServiceKey(id);
    });

    it("hash inexistente devolve null", async () => {
      const resolved = await resolveServiceApiKeyHash(
        `hash-inexistente-${randomUUID()}`
      );
      expect(resolved).toBeNull();
    });
  });

  describe("resolveTenantIdBySlug", () => {
    it("resolve os 3 slugs semeados pelo seed para o tenantId correto", async () => {
      const seededTenants = await db
        .select({ id: tenants.id, slug: tenants.slug })
        .from(tenants);
      const withSlug = seededTenants.filter(
        (t): t is { id: string; slug: string } => t.slug !== null
      );
      expect(withSlug.length).toBeGreaterThanOrEqual(3);

      for (const slug of ["triangulo", "vale-uberaba", "crivo-demo"]) {
        const expected = withSlug.find((t) => t.slug === slug);
        expect(expected, `tenant de slug '${slug}' deveria existir`).toBeDefined();

        const resolved = await resolveTenantIdBySlug(slug);
        expect(resolved).toBe(expected!.id);
      }
    });

    it("slug desconhecido devolve null", async () => {
      const resolved = await resolveTenantIdBySlug(`slug-desconhecido-${randomUUID()}`);
      expect(resolved).toBeNull();
    });

    it("string vazia devolve null", async () => {
      const resolved = await resolveTenantIdBySlug("");
      expect(resolved).toBeNull();
    });
  });
});
