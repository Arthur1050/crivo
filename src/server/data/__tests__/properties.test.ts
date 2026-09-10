import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { properties, tenant_members, users } from "../../../db/schema";
import { getProperties, getTenants, isActiveMemberOf } from "../index";

const NON_EXISTENT_TENANT_ID = "00000000-0000-4000-8000-000000000000";
const NON_EXISTENT_USER_ID = "00000000-0000-4000-8000-000000000099";

type PropertyInsert = typeof properties.$inferInsert;

// Assume o banco já está seedado (mesmo padrão de documents.test.ts /
// mutations.test.ts). O seed do lote-11 (T10) ainda não existe neste batch —
// cada teste cria e limpa as próprias linhas de `properties` diretamente,
// como `mutations.test.ts` já faz para fixtures de `leads`/`users`.
describe("server/data properties — leitura (T5)", () => {
  let tenantAId: string;
  let tenantBId: string;
  let capturerId: string;
  let sequenceCounter = Date.now() % 1_000_000;

  const insertedPropertyIds: string[] = [];

  beforeAll(async () => {
    const allTenants = await getTenants();
    expect(allTenants.length).toBeGreaterThanOrEqual(2);
    [tenantAId, tenantBId] = allTenants.map((t) => t.id);

    capturerId = randomUUID();
    await db.insert(users).values({
      id: capturerId,
      name: "Captador Fixture T5",
      email: `${capturerId}@fixture.test`,
    });
    await db.insert(tenant_members).values({
      id: randomUUID(),
      organizationId: tenantAId,
      userId: capturerId,
      role: "corretor",
    });
  });

  afterAll(async () => {
    for (const id of insertedPropertyIds) {
      await db.delete(properties).where(eq(properties.id, id));
    }
    await db
      .delete(tenant_members)
      .where(eq(tenant_members.userId, capturerId));
    await db.delete(users).where(eq(users.id, capturerId));
    await db.$client.end();
  });

  async function insertProperty(
    tenantId: string,
    overrides: Partial<PropertyInsert> = {}
  ): Promise<string> {
    const id = randomUUID();
    sequenceCounter += 1;
    const values: PropertyInsert = {
      id,
      tenantId,
      capturedByUserId: capturerId,
      sequence: sequenceCounter,
      reference: `T5-${sequenceCounter}`,
      kind: "casa",
      modality: "novo",
      status: "disponivel",
      published: true,
      neighborhood: "Santa Maria",
      neighborhoodNormalized: "santa maria",
      city: "Uberaba",
      cityNormalized: "uberaba",
      state: "MG",
      priceCents: 100_000_00n,
      areaSqm: 80,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpots: 1,
      ...overrides,
    };
    await db.insert(properties).values(values);
    insertedPropertyIds.push(id);
    return id;
  }

  describe("getProperties — filtros", () => {
    it("sem filtros retorna os imóveis do tenant", async () => {
      const id = await insertProperty(tenantAId);
      const result = await getProperties(tenantAId);
      expect(result.some((p) => p.id === id)).toBe(true);
      for (const property of result) expect(property.tenantId).toBe(tenantAId);
    });

    it("filtra por status (IMOV-05)", async () => {
      const soldId = await insertProperty(tenantAId, { status: "vendido" });
      const result = await getProperties(tenantAId, { status: "vendido" });
      expect(result.some((p) => p.id === soldId)).toBe(true);
      for (const property of result) expect(property.status).toBe("vendido");
    });

    it("filtra por publicação (IMOV-05)", async () => {
      const unpublishedId = await insertProperty(tenantAId, {
        published: false,
      });
      const result = await getProperties(tenantAId, { published: false });
      expect(result.some((p) => p.id === unpublishedId)).toBe(true);
      for (const property of result) expect(property.published).toBe(false);
    });

    it("filtra por tipo (kind)", async () => {
      const terrenoId = await insertProperty(tenantAId, { kind: "terreno" });
      const result = await getProperties(tenantAId, { kind: "terreno" });
      expect(result.some((p) => p.id === terrenoId)).toBe(true);
      for (const property of result) expect(property.kind).toBe("terreno");
    });

    it("filtra por modalidade", async () => {
      const usadoId = await insertProperty(tenantAId, { modality: "usado" });
      const result = await getProperties(tenantAId, { modality: "usado" });
      expect(result.some((p) => p.id === usadoId)).toBe(true);
      for (const property of result) expect(property.modality).toBe("usado");
    });

    it("busca textual normalizada casa com diferença de acento e caixa (Edge Case)", async () => {
      const id = await insertProperty(tenantAId, {
        neighborhood: "São José",
        neighborhoodNormalized: "sao jose",
      });
      const result = await getProperties(tenantAId, { search: "SÃO JOSÉ" });
      expect(result.some((p) => p.id === id)).toBe(true);
    });

    it("busca textual casa por cidade também", async () => {
      const id = await insertProperty(tenantAId, {
        city: "Araguari",
        cityNormalized: "araguari",
      });
      const result = await getProperties(tenantAId, { search: "araguari" });
      expect(result.some((p) => p.id === id)).toBe(true);
    });

    it("combina múltiplos filtros por conjunção", async () => {
      const id = await insertProperty(tenantAId, {
        status: "reservado",
        kind: "cobertura",
        modality: "usado",
      });
      const result = await getProperties(tenantAId, {
        status: "reservado",
        kind: "cobertura",
        modality: "usado",
      });
      expect(result.some((p) => p.id === id)).toBe(true);
      for (const property of result) {
        expect(property.status).toBe("reservado");
        expect(property.kind).toBe("cobertura");
        expect(property.modality).toBe("usado");
      }
    });

    it("retorna [] para um tenant inexistente, nunca um erro (edge case)", async () => {
      const result = await getProperties(NON_EXISTENT_TENANT_ID);
      expect(result).toEqual([]);
    });

    it("isolamento: imóvel de outro tenant nunca aparece (IMOV-01)", async () => {
      const idA = await insertProperty(tenantAId);
      const idB = await insertProperty(tenantBId);

      const resultA = await getProperties(tenantAId);
      const resultB = await getProperties(tenantBId);

      expect(resultA.some((p) => p.id === idA)).toBe(true);
      expect(resultA.some((p) => p.id === idB)).toBe(false);
      expect(resultB.some((p) => p.id === idB)).toBe(true);
      expect(resultB.some((p) => p.id === idA)).toBe(false);

      const idsA = new Set(resultA.map((p) => p.id));
      const idsB = new Set(resultB.map((p) => p.id));
      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toEqual([]);
    });
  });

  describe("isActiveMemberOf (IMOV-02)", () => {
    it("verdadeiro para membro ativo da imobiliária", async () => {
      expect(await isActiveMemberOf(tenantAId, capturerId)).toBe(true);
    });

    it("falso para usuário de outro tenant", async () => {
      expect(await isActiveMemberOf(tenantBId, capturerId)).toBe(false);
    });

    it("falso para usuário inexistente", async () => {
      expect(await isActiveMemberOf(tenantAId, NON_EXISTENT_USER_ID)).toBe(
        false
      );
    });

    it("falso para vínculo com deactivatedAt preenchido", async () => {
      const deactivatedUserId = randomUUID();
      await db.insert(users).values({
        id: deactivatedUserId,
        name: "Corretor Desativado Fixture T5",
        email: `${deactivatedUserId}@fixture.test`,
      });
      await db.insert(tenant_members).values({
        id: randomUUID(),
        organizationId: tenantAId,
        userId: deactivatedUserId,
        role: "corretor",
        deactivatedAt: new Date(),
      });

      expect(await isActiveMemberOf(tenantAId, deactivatedUserId)).toBe(
        false
      );

      await db
        .delete(tenant_members)
        .where(
          and(
            eq(tenant_members.organizationId, tenantAId),
            eq(tenant_members.userId, deactivatedUserId)
          )
        );
      await db.delete(users).where(eq(users.id, deactivatedUserId));
    });
  });
});
