import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { properties, tenant_members, tenants, users } from "../../../db/schema";
import { normalizeForSearch } from "../../../lib/normalize-text";
import {
  createProperty,
  deleteProperty,
  getProperties,
  getTenants,
  isActiveMemberOf,
  updateProperty,
  type NewProperty,
  type UpdatePropertyPatch,
} from "../index";

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

// Assume o banco já está seedado (mesmo padrão do describe acima). Cada teste
// de escrita cria seus PRÓPRIOS tenants/usuários (molde de
// `assignment.test.ts` — `createTenant`) em vez de reaproveitar os tenants do
// seed: `createProperty` calcula `sequence` a partir do `max(sequence)` já
// existente para o tenant, e o describe de leitura (T5) acima já grava várias
// linhas nos tenants do seed — um tenant novo é o único jeito de provar
// "começa em 1" de forma determinística.
describe("server/data properties — escrita (T6)", () => {
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createFreshTenant(name: string): Promise<string> {
    const id = randomUUID();
    await db.insert(tenants).values({
      id,
      name,
      agentName: "Agente Teste T6",
      supportedModality: "ambos",
      slug: `fixture-t6-${id}`,
    });
    createdTenantIds.push(id);
    return id;
  }

  async function createFreshCapturer(tenantId: string): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({
      id,
      name: "Captador Fixture T6",
      email: `${id}@fixture.test`,
    });
    await db.insert(tenant_members).values({
      id: randomUUID(),
      organizationId: tenantId,
      userId: id,
      role: "corretor",
    });
    createdUserIds.push(id);
    return id;
  }

  function baseInput(
    capturedByUserId: string,
    overrides: Partial<NewProperty> = {}
  ): NewProperty {
    return {
      capturedByUserId,
      kind: "casa",
      modality: "novo",
      neighborhood: "Centro",
      city: "Uberaba",
      state: "MG",
      priceCents: 100_000_00n,
      areaSqm: 80,
      bedrooms: 2,
      bathrooms: 1,
      parkingSpots: 1,
      ...overrides,
    };
  }

  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      await db
        .delete(properties)
        .where(inArray(properties.tenantId, createdTenantIds));
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.organizationId, createdTenantIds));
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
      createdTenantIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
  });

  describe("createProperty — referência sequencial (IMOV-03)", () => {
    it("primeiro imóvel de um tenant novo nasce com sequence 1 e referência derivada (AC5)", async () => {
      const tenantId = await createFreshTenant("T6 Sequence A");
      const capturerId = await createFreshCapturer(tenantId);

      const result = await createProperty(tenantId, baseInput(capturerId));
      expect(result.ok).toBe(true);

      const [row] = await getProperties(tenantId);
      expect(row.sequence).toBe(1);
      expect(row.reference).toBe("IM-0001");
    });

    it("dois tenants diferentes começam ambos em sequence 1 (AC5)", async () => {
      const tenantX = await createFreshTenant("T6 Sequence X");
      const tenantY = await createFreshTenant("T6 Sequence Y");
      const capturerX = await createFreshCapturer(tenantX);
      const capturerY = await createFreshCapturer(tenantY);

      const resultX = await createProperty(tenantX, baseInput(capturerX));
      const resultY = await createProperty(tenantY, baseInput(capturerY));
      expect(resultX.ok).toBe(true);
      expect(resultY.ok).toBe(true);

      const [rowX] = await getProperties(tenantX);
      const [rowY] = await getProperties(tenantY);
      expect(rowX.sequence).toBe(1);
      expect(rowY.sequence).toBe(1);
    });

    it("segunda criação no mesmo tenant recebe sequence 2 e referência diferente", async () => {
      const tenantId = await createFreshTenant("T6 Sequence Incremento");
      const capturerId = await createFreshCapturer(tenantId);

      const first = await createProperty(tenantId, baseInput(capturerId));
      const second = await createProperty(tenantId, baseInput(capturerId));
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) throw new Error("unreachable");

      const rows = await getProperties(tenantId);
      const firstRow = rows.find((p) => p.id === first.id);
      const secondRow = rows.find((p) => p.id === second.id);
      expect(firstRow?.sequence).toBe(1);
      expect(secondRow?.sequence).toBe(2);
      expect(secondRow?.reference).not.toBe(firstRow?.reference);
    });

    it("colisão de sequence forçada direto no banco é rejeitada pelo índice, sem gravar linha parcial (AC7)", async () => {
      const tenantId = await createFreshTenant("T6 Colisao");
      const capturerId = await createFreshCapturer(tenantId);

      const first = await createProperty(tenantId, baseInput(capturerId));
      expect(first.ok).toBe(true);
      const [firstRow] = await getProperties(tenantId);
      expect(firstRow.sequence).toBe(1);

      // Colisão forçada: insere direto no banco com a MESMA sequence,
      // contornando createProperty (que sempre recalcula o max).
      await expect(
        db.insert(properties).values({
          tenantId,
          capturedByUserId: capturerId,
          sequence: firstRow.sequence,
          reference: "IM-9999",
          kind: "casa",
          modality: "novo",
          neighborhood: "Centro",
          neighborhoodNormalized: "centro",
          city: "Uberaba",
          cityNormalized: "uberaba",
          state: "MG",
          priceCents: 1n,
          areaSqm: 1,
          bedrooms: 0,
          bathrooms: 0,
          parkingSpots: 0,
        })
      ).rejects.toThrow();

      const rows = await getProperties(tenantId);
      expect(rows).toHaveLength(1);
    });

    it("grava neighborhoodNormalized/cityNormalized via normalizeForSearch", async () => {
      const tenantId = await createFreshTenant("T6 Normalizacao");
      const capturerId = await createFreshCapturer(tenantId);

      const result = await createProperty(
        tenantId,
        baseInput(capturerId, { neighborhood: "São José", city: "Araguari" })
      );
      expect(result.ok).toBe(true);

      const [row] = await getProperties(tenantId);
      expect(row.neighborhoodNormalized).toBe(normalizeForSearch("São José"));
      expect(row.cityNormalized).toBe(normalizeForSearch("Araguari"));
    });
  });

  describe("updateProperty", () => {
    it("avança updatedAt (happy path)", async () => {
      const tenantId = await createFreshTenant("T6 Update");
      const capturerId = await createFreshCapturer(tenantId);
      const created = await createProperty(tenantId, baseInput(capturerId));
      expect(created.ok).toBe(true);
      if (!created.ok) throw new Error("unreachable");

      const [before] = await getProperties(tenantId);
      const originalUpdatedAt = before.updatedAt;

      // Garante uma diferença de relógio mensurável (molde de
      // mutations.test.ts — updateLeadStatus).
      await new Promise((resolve) => setTimeout(resolve, 5));

      const ok = await updateProperty(tenantId, created.id, { areaSqm: 120 });
      expect(ok).toBe(true);

      const [after] = await getProperties(tenantId);
      expect(after.areaSqm).toBe(120);
      expect(after.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      );
    });

    it("com tenantId incompatível é no-op — não altera o imóvel e retorna false (isolamento)", async () => {
      const tenantId = await createFreshTenant("T6 Update Isolamento A");
      const outroTenantId = await createFreshTenant("T6 Update Isolamento B");
      const capturerId = await createFreshCapturer(tenantId);
      const created = await createProperty(tenantId, baseInput(capturerId));
      if (!created.ok) throw new Error("unreachable");

      const ok = await updateProperty(outroTenantId, created.id, {
        areaSqm: 999,
      });
      expect(ok).toBe(false);

      const [row] = await getProperties(tenantId);
      expect(row.areaSqm).toBe(80);
    });

    it("retorna false (no-op) para um propertyId inexistente", async () => {
      const tenantId = await createFreshTenant("T6 Update Inexistente");
      const ok = await updateProperty(tenantId, randomUUID(), {
        areaSqm: 10,
      });
      expect(ok).toBe(false);
    });

    it("o tipo do patch não aceita sequence nem reference — imutabilidade por construção (AC6)", () => {
      // @ts-expect-error `sequence` não faz parte de UpdatePropertyPatch — imutável por construção, não por checagem em runtime.
      const withSequence: UpdatePropertyPatch = { sequence: 999 };
      // @ts-expect-error `reference` não faz parte de UpdatePropertyPatch — imutável por construção, não por checagem em runtime.
      const withReference: UpdatePropertyPatch = { reference: "X" };
      expect(withSequence).toBeDefined();
      expect(withReference).toBeDefined();
    });
  });

  describe("deleteProperty (IMOV-01 AC9)", () => {
    it("remove a linha (happy path)", async () => {
      const tenantId = await createFreshTenant("T6 Delete");
      const capturerId = await createFreshCapturer(tenantId);
      const created = await createProperty(tenantId, baseInput(capturerId));
      if (!created.ok) throw new Error("unreachable");

      const ok = await deleteProperty(tenantId, created.id);
      expect(ok).toBe(true);

      const rows = await getProperties(tenantId);
      expect(rows.some((p) => p.id === created.id)).toBe(false);
    });

    it("com tenantId incompatível é no-op — o imóvel continua existindo (isolamento)", async () => {
      const tenantId = await createFreshTenant("T6 Delete Isolamento A");
      const outroTenantId = await createFreshTenant("T6 Delete Isolamento B");
      const capturerId = await createFreshCapturer(tenantId);
      const created = await createProperty(tenantId, baseInput(capturerId));
      if (!created.ok) throw new Error("unreachable");

      const ok = await deleteProperty(outroTenantId, created.id);
      expect(ok).toBe(false);

      const rows = await getProperties(tenantId);
      expect(rows.some((p) => p.id === created.id)).toBe(true);
    });
  });
});

// Hook de arquivo (fora de qualquer describe): fecha o pool compartilhado uma
// única vez, depois que os dois describes acima (T5 leitura + T6 escrita)
// terminam — nunca dentro do afterAll de um describe irmão, que rodaria
// antes do outro describe começar e quebraria suas queries.
afterAll(async () => {
  await db.$client.end();
});
