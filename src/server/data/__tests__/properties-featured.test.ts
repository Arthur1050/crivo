import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { properties, tenant_members, tenants, users } from "../../../db/schema";
import { getProperties, setPropertyFeatured } from "../index";

type PropertyInsert = typeof properties.$inferInsert;

describe("L16a T6 — destaque de imóvel no DAL (VDEST-01)", () => {
  const tenantIds: string[] = [];
  let tenantA: string;
  let tenantB: string;
  let capturerA: string;
  let capturerB: string;
  let sequence = 0;

  async function newTenantWithCapturer() {
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    await db.insert(tenants).values({
      id: tenantId, slug: `fixture-destaque-${tenantId}`, name: "Fixture destaque", agentName: "Agente", supportedModality: "ambos",
    });
    const userId = randomUUID();
    await db.insert(users).values({ id: userId, name: "Captador destaque", email: `${userId}@fixture.test` });
    await db.insert(tenant_members).values({ organizationId: tenantId, userId, role: "corretor" });
    return { tenantId, userId };
  }

  async function insertProperty(tenantId: string, capturedByUserId: string, overrides: Partial<PropertyInsert> = {}) {
    const id = randomUUID();
    sequence += 1;
    await db.insert(properties).values({
      id, tenantId, capturedByUserId, sequence, reference: `DST-${sequence}`,
      kind: "casa", modality: "novo", status: "disponivel", published: true,
      neighborhood: "Centro", neighborhoodNormalized: "centro", city: "Uberaba", cityNormalized: "uberaba", state: "MG",
      priceCents: 100_000_00n, areaSqm: 80, bedrooms: 2, bathrooms: 1, parkingSpots: 1,
      ...overrides,
    });
    return id;
  }

  async function read(id: string) {
    const [row] = await db.select().from(properties).where(eq(properties.id, id));
    return row;
  }

  beforeAll(async () => {
    ({ tenantId: tenantA, userId: capturerA } = await newTenantWithCapturer());
    ({ tenantId: tenantB, userId: capturerB } = await newTenantWithCapturer());
  });

  afterAll(async () => {
    await db.delete(properties).where(inArray(properties.tenantId, tenantIds));
    await db.delete(tenant_members).where(inArray(tenant_members.organizationId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    await db.delete(users).where(inArray(users.id, [capturerA, capturerB]));
    await db.$client.end();
  });

  it("AC1: um imóvel novo nasce sem destaque", async () => {
    const id = await insertProperty(tenantA, capturerA);
    expect((await read(id)).featured).toBe(false);
  });

  it("AC2: marcar e desmarcar grava o valor e atualiza updated_at", async () => {
    const longAgo = new Date("2026-01-01T00:00:00.000Z");
    const id = await insertProperty(tenantA, capturerA, { updatedAt: longAgo });

    expect(await setPropertyFeatured(tenantA, id, true)).toBe(true);
    const marked = await read(id);
    expect(marked.featured).toBe(true);
    expect(marked.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());

    await db.update(properties).set({ updatedAt: longAgo }).where(eq(properties.id, id));
    expect(await setPropertyFeatured(tenantA, id, false)).toBe(true);
    const unmarked = await read(id);
    expect(unmarked.featured).toBe(false);
    expect(unmarked.updatedAt.getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it("AC2: marcar não altera nenhum outro campo do imóvel", async () => {
    const id = await insertProperty(tenantA, capturerA, { published: false, status: "reservado", description: "Texto original" });
    const before = await read(id);
    await setPropertyFeatured(tenantA, id, true);
    const after = await read(id);
    expect({ ...after, featured: before.featured, updatedAt: before.updatedAt }).toEqual(before);
  });

  it("AC4: id de outro tenant é tratado como inexistente e o imóvel fica intocado", async () => {
    const longAgo = new Date("2026-01-01T00:00:00.000Z");
    const foreign = await insertProperty(tenantB, capturerB, { updatedAt: longAgo, featured: false });
    const before = await read(foreign);

    expect(await setPropertyFeatured(tenantA, foreign, true)).toBe(false);
    expect(await read(foreign)).toEqual(before);

    // E o inverso: desmarcar um destaque de outro tenant também não funciona.
    const foreignFeatured = await insertProperty(tenantB, capturerB, { featured: true });
    expect(await setPropertyFeatured(tenantA, foreignFeatured, false)).toBe(false);
    expect((await read(foreignFeatured)).featured).toBe(true);
  });

  it("AC4: id inexistente devolve false sem lançar", async () => {
    expect(await setPropertyFeatured(tenantA, randomUUID(), true)).toBe(false);
  });

  it("AC5: sete destaques no mesmo tenant são aceitos, sem teto", async () => {
    const { tenantId, userId } = await newTenantWithCapturer();
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await insertProperty(tenantId, userId));
    for (const id of ids) expect(await setPropertyFeatured(tenantId, id, true)).toBe(true);
    const listed = await getProperties(tenantId);
    expect(listed.filter((property) => property.featured)).toHaveLength(7);
    await db.delete(properties).where(eq(properties.tenantId, tenantId));
    await db.delete(tenant_members).where(eq(tenant_members.organizationId, tenantId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it("a listagem de imóveis do CRM traz o campo featured de cada imóvel", async () => {
    const featuredId = await insertProperty(tenantA, capturerA, { featured: true });
    const plainId = await insertProperty(tenantA, capturerA, { featured: false });
    const listed = await getProperties(tenantA);
    expect(listed.find((property) => property.id === featuredId)?.featured).toBe(true);
    expect(listed.find((property) => property.id === plainId)?.featured).toBe(false);
  });
});
