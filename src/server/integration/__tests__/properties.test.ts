import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../../db";
import { properties, tenant_members, tenants, users } from "../../../db/schema";
import { formatCurrencyBRL } from "../../../lib/format";
import { normalizeForSearch } from "../../../lib/normalize-text";
import { searchVisibleProperties } from "../properties";
import type { PropertySearchFilters } from "../property-filters";

type PropertyInsert = typeof properties.$inferInsert;

/**
 * Busca de imóveis visíveis do contrato (tasks.md — T12; spec.md BUSCA-01/
 * 02/03). Tenant PRÓPRIO deste arquivo (nunca o snapshot do seed) — mesmo
 * padrão de isolamento de `context.test.ts`.
 */
describe("server/integration properties — searchVisibleProperties (T12)", () => {
  let tenantId: string;
  let capturerId: string;
  let sequenceCounter = 0;

  beforeAll(async () => {
    tenantId = randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: `Tenant Teste properties ${tenantId}`,
      agentName: "Agente Teste",
      supportedModality: "ambos",
      slug: `fixture-properties-${tenantId}`,
    });

    capturerId = randomUUID();
    await db.insert(users).values({
      id: capturerId,
      name: "Captador Fixture T12",
      email: `${capturerId}@fixture.test`,
    });
    await db.insert(tenant_members).values({
      organizationId: tenantId,
      userId: capturerId,
      role: "corretor",
    });
  });

  async function insertProperty(overrides: Partial<PropertyInsert> = {}): Promise<string> {
    const id = randomUUID();
    sequenceCounter += 1;
    const values: PropertyInsert = {
      id,
      tenantId,
      capturedByUserId: capturerId,
      sequence: sequenceCounter,
      reference: `T12-${sequenceCounter}`,
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
    };
    await db.insert(properties).values(values);
    return id;
  }

  const NO_FILTERS: PropertySearchFilters = {};

  describe("corte de visibilidade (IMOV-05 AC3)", () => {
    it("imóvel disponível+publicado aparece", async () => {
      const id = await insertProperty();
      const [row] = await db.select().from(properties).where(eq(properties.id, id));
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      expect(result.imoveis.map((p) => p.referencia)).toContain(row.reference);
    });

    it("imóvel reservado não aparece", async () => {
      const id = await insertProperty({ status: "reservado" });
      const [row] = await db.select().from(properties).where(eq(properties.id, id));
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      expect(result.imoveis.map((p) => p.referencia)).not.toContain(row.reference);
    });

    it("imóvel vendido não aparece", async () => {
      const id = await insertProperty({ status: "vendido" });
      const [row] = await db.select().from(properties).where(eq(properties.id, id));
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      expect(result.imoveis.map((p) => p.referencia)).not.toContain(row.reference);
    });

    it("imóvel disponível mas não publicado não aparece", async () => {
      const id = await insertProperty({ status: "disponivel", published: false });
      const [row] = await db.select().from(properties).where(eq(properties.id, id));
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      expect(result.imoveis.map((p) => p.referencia)).not.toContain(row.reference);
    });

    it("captador desativado não torna o imóvel invisível (Edge Case)", async () => {
      const deactivatedCapturerId = randomUUID();
      await db.insert(users).values({
        id: deactivatedCapturerId,
        name: "Captador Desativado T12",
        email: `${deactivatedCapturerId}@fixture.test`,
      });
      await db.insert(tenant_members).values({
        organizationId: tenantId,
        userId: deactivatedCapturerId,
        role: "corretor",
        deactivatedAt: new Date(),
      });

      const id = await insertProperty({ capturedByUserId: deactivatedCapturerId });
      const [row] = await db.select().from(properties).where(eq(properties.id, id));
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      expect(result.imoveis.map((p) => p.referencia)).toContain(row.reference);

      // A FK `properties.captured_by_user_id` (restrict) exige apagar o
      // imóvel ANTES do usuário — a ordem inversa violaria a mesma
      // constraint que este lote introduziu.
      await db.delete(properties).where(eq(properties.id, id));
      await db.delete(tenant_members).where(eq(tenant_members.userId, deactivatedCapturerId));
      await db.delete(users).where(eq(users.id, deactivatedCapturerId));
    });
  });

  describe("catálogo vazio (Edge Case)", () => {
    it("tenant sem nenhum imóvel devolve { imoveis: [], total: 0 }, nunca erro", async () => {
      const freshTenantId = randomUUID();
      await db.insert(tenants).values({
        id: freshTenantId,
        name: "Tenant Vazio T12",
        agentName: "Agente Vazio",
        supportedModality: "ambos",
        slug: `fixture-properties-vazio-${freshTenantId}`,
      });

      const result = await searchVisibleProperties(freshTenantId, NO_FILTERS);
      expect(result).toEqual({ imoveis: [], total: 0 });

      await db.delete(tenants).where(eq(tenants.id, freshTenantId));
    });
  });

  describe("fronteiras do limite de 3 (BUSCA-02, lição L-023)", () => {
    it("com exatamente 3 imóveis casando, total é 3 e a lista tem 3 (fronteira 3)", async () => {
      const freshTenantId = await createIsolatedTenant();
      const ids = [];
      for (let i = 0; i < 3; i++) {
        ids.push(await insertPropertyFor(freshTenantId, i));
      }

      const result = await searchVisibleProperties(freshTenantId, NO_FILTERS);
      expect(result.total).toBe(3);
      expect(result.imoveis).toHaveLength(3);

      await cleanupIsolatedTenant(freshTenantId);
    });

    it("com exatamente 4 imóveis casando, a lista tem 3 e o total é 4 (fronteira 4)", async () => {
      const freshTenantId = await createIsolatedTenant();
      for (let i = 0; i < 4; i++) {
        await insertPropertyFor(freshTenantId, i);
      }

      const result = await searchVisibleProperties(freshTenantId, NO_FILTERS);
      expect(result.total).toBe(4);
      expect(result.imoveis).toHaveLength(3);

      await cleanupIsolatedTenant(freshTenantId);
    });
  });

  describe("ordenação (BUSCA-02)", () => {
    it("ordena por updatedAt decrescente", async () => {
      const freshTenantId = await createIsolatedTenant();
      const older = await insertPropertyFor(freshTenantId, 0, {
        updatedAt: new Date(Date.now() - 60_000),
      });
      const newer = await insertPropertyFor(freshTenantId, 1, {
        updatedAt: new Date(),
      });

      const result = await searchVisibleProperties(freshTenantId, NO_FILTERS);
      const [olderRow] = await db.select().from(properties).where(eq(properties.id, older));
      const [newerRow] = await db.select().from(properties).where(eq(properties.id, newer));
      expect(result.imoveis.map((p) => p.referencia)).toEqual([
        newerRow.reference,
        olderRow.reference,
      ]);

      await cleanupIsolatedTenant(freshTenantId);
    });

    it("empate em updatedAt desempata por id crescente", async () => {
      const freshTenantId = await createIsolatedTenant();
      const tiedAt = new Date();
      const idA = await insertPropertyFor(freshTenantId, 0, { updatedAt: tiedAt });
      const idB = await insertPropertyFor(freshTenantId, 1, { updatedAt: tiedAt });
      const [expectedFirst, expectedSecond] = [idA, idB].sort();

      const result = await searchVisibleProperties(freshTenantId, NO_FILTERS);
      const [rowFirst] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, expectedFirst));
      const [rowSecond] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, expectedSecond));
      expect(result.imoveis.map((p) => p.referencia)).toEqual([
        rowFirst.reference,
        rowSecond.reference,
      ]);

      await cleanupIsolatedTenant(freshTenantId);
    });
  });

  describe("filtros por conjunção", () => {
    it("filtro de bairro com acento e caixa diferentes casa o imóvel (Edge Case)", async () => {
      const id = await insertProperty({
        neighborhood: "São José",
        neighborhoodNormalized: normalizeForSearch("São José"),
      });
      const [row] = await db.select().from(properties).where(eq(properties.id, id));

      const result = await searchVisibleProperties(tenantId, {
        neighborhood: normalizeForSearch("SÃO JOSÉ"),
      });
      expect(result.imoveis.map((p) => p.referencia)).toContain(row.reference);
    });

    it("combina modalidade + tipo + faixa de preço + quartos mínimo por conjunção", async () => {
      const freshTenantId = await createIsolatedTenant();
      const matchId = await insertPropertyFor(freshTenantId, 0, {
        modality: "usado",
        kind: "cobertura",
        priceCents: 300_000_00n,
        bedrooms: 3,
      });
      // Não casa: modalidade diferente.
      await insertPropertyFor(freshTenantId, 1, {
        modality: "novo",
        kind: "cobertura",
        priceCents: 300_000_00n,
        bedrooms: 3,
      });

      const [matchRow] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, matchId));

      const result = await searchVisibleProperties(freshTenantId, {
        modality: "usado",
        kind: "cobertura",
        minPriceCents: 250_000_00,
        maxPriceCents: 350_000_00,
        minBedrooms: 3,
      });
      expect(result.imoveis.map((p) => p.referencia)).toEqual([matchRow.reference]);

      await cleanupIsolatedTenant(freshTenantId);
    });
  });

  describe("DTO — campos proibidos e formato (BUSCA-03, lições L-012/L-022)", () => {
    it("o DTO não tem campo 'street'", async () => {
      await insertProperty({ street: "Rua das Flores" });
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      for (const item of result.imoveis) expect(item).not.toHaveProperty("street");
    });

    it("o DTO não tem campo 'number'", async () => {
      await insertProperty({ number: "123" });
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      for (const item of result.imoveis) expect(item).not.toHaveProperty("number");
    });

    it("o DTO não tem campo 'complement'", async () => {
      await insertProperty({ complement: "Apto 45" });
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      for (const item of result.imoveis) expect(item).not.toHaveProperty("complement");
    });

    it("o DTO não tem campo 'description'", async () => {
      await insertProperty({ description: "Descrição detalhada do imóvel." });
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      for (const item of result.imoveis) expect(item).not.toHaveProperty("description");
    });

    it("o DTO não tem nenhum campo de foto", async () => {
      await insertProperty({ photoUrls: ["https://example.com/foto.jpg"] });
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      for (const item of result.imoveis) {
        expect(item).not.toHaveProperty("photoUrls");
        expect(item).not.toHaveProperty("photos");
        expect(item).not.toHaveProperty("fotos");
      }
    });

    it("o DTO não tem nenhum campo do captador", async () => {
      await insertProperty();
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      for (const item of result.imoveis) {
        expect(item).not.toHaveProperty("capturedByUserId");
        expect(item).not.toHaveProperty("captador");
        expect(item).not.toHaveProperty("brokerName");
        expect(item).not.toHaveProperty("brokerPhone");
        expect(item).not.toHaveProperty("brokerEmail");
      }
    });

    it("'preco' sai como string formatada em Real brasileiro, e nenhum bigint atravessa o DTO", async () => {
      const id = await insertProperty({ priceCents: 450_000_00n });
      const [row] = await db.select().from(properties).where(eq(properties.id, id));
      const result = await searchVisibleProperties(tenantId, NO_FILTERS);
      const item = result.imoveis.find((p) => p.referencia === row.reference);
      expect(item).toBeDefined();
      expect(typeof item!.preco).toBe("string");
      // Intl.NumberFormat("pt-BR", { currency: "BRL" }) separa "R$" do valor
      // com NBSP (U+00A0), não espaço comum — comparar contra o próprio
      // `formatCurrencyBRL` evita reproduzir esse caractere à mão (mesma
      // lição de `src/lib/__tests__/format.test.ts`).
      expect(item!.preco).toBe(formatCurrencyBRL(450_000_00n));
      // JSON.stringify lança se algum valor do objeto for bigint.
      expect(() => JSON.stringify(result)).not.toThrow();
    });
  });

  // Helpers de tenant isolado — usados pelos testes de fronteira/ordenação/
  // conjunção, que precisam de um catálogo com contagem EXATA (o tenant
  // compartilhado acima acumula imóveis de outros testes do describe).
  const isolatedTenantIds: string[] = [];
  const isolatedCapturerIds: string[] = [];
  let isolatedSequence = 0;

  async function createIsolatedTenant(): Promise<string> {
    const id = randomUUID();
    await db.insert(tenants).values({
      id,
      name: `Tenant Isolado T12 ${id}`,
      agentName: "Agente Isolado",
      supportedModality: "ambos",
      slug: `fixture-properties-isolado-${id}`,
    });
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      name: "Captador Isolado T12",
      email: `${userId}@fixture.test`,
    });
    await db.insert(tenant_members).values({
      organizationId: id,
      userId,
      role: "corretor",
    });
    isolatedTenantIds.push(id);
    isolatedCapturerIds.push(userId);
    return id;
  }

  async function insertPropertyFor(
    isolatedTenantId: string,
    index: number,
    overrides: Partial<PropertyInsert> = {}
  ): Promise<string> {
    const id = randomUUID();
    isolatedSequence += 1;
    const capturerForTenant = isolatedCapturerIds.at(-1)!;
    await db.insert(properties).values({
      id,
      tenantId: isolatedTenantId,
      capturedByUserId: capturerForTenant,
      sequence: isolatedSequence,
      reference: `T12-ISO-${isolatedSequence}-${index}`,
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

  async function cleanupIsolatedTenant(isolatedTenantId: string): Promise<void> {
    await db.delete(properties).where(eq(properties.tenantId, isolatedTenantId));
    await db
      .delete(tenant_members)
      .where(eq(tenant_members.organizationId, isolatedTenantId));
    await db.delete(tenants).where(eq(tenants.id, isolatedTenantId));
  }

  // Único `afterAll` do describe — de propósito: `afterAll`/`afterEach` do
  // Vitest rodam em ordem REVERSA de declaração (o oposto de `beforeAll`),
  // então dois blocos separados deixariam `db.$client.end()` correr ANTES ou
  // DEPOIS da limpeza isolada dependendo de qual foi declarado por último —
  // um único bloco, com a ordem escrita explicitamente, remove a ambiguidade.
  afterAll(async () => {
    await db.delete(properties).where(eq(properties.tenantId, tenantId));
    await db.delete(tenant_members).where(eq(tenant_members.organizationId, tenantId));
    await db.delete(users).where(eq(users.id, capturerId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    if (isolatedCapturerIds.length > 0) {
      await db.delete(users).where(inArray(users.id, isolatedCapturerIds));
    }
    await db.$client.end();
  });
});
