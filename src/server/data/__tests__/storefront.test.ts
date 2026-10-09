import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { tenants, tenantStorefronts } from "../../../db/schema";
import type { StorefrontValue } from "../../../lib/storefront";
import { getStorefront, getTenantSlug, saveStorefront } from "../storefront";

const created: string[] = [];

async function newTenant() {
  const id = randomUUID();
  created.push(id);
  await db.insert(tenants).values({
    id, slug: `fixture-dal-vitrine-${id}`, name: "Fixture DAL vitrine", agentName: "Agente", supportedModality: "ambos",
  });
  return id;
}

async function rowOf(tenantId: string) {
  return db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, tenantId));
}

const completeValue: StorefrontValue = {
  active: true,
  layout: "editorial",
  accentColor: "#aabbcc",
  font: "playfair",
  creci: "CRECI 12345-J",
  legalName: "Imobiliária Exemplo Ltda",
  headline: "Casas e apartamentos",
  about: "Texto institucional.",
  instagram: "imobiliaria.x",
  phone: "11999991234",
  address: "Rua Exemplo, 100",
};

afterAll(async () => {
  if (created.length > 0) await db.delete(tenants).where(inArray(tenants.id, created));
  await db.$client.end();
});

describe("L16a T5 — DAL da vitrine", () => {
  it("VCFG-01 AC4: tenant sem linha devolve a vitrine inativa com os padrões e não cria linha", async () => {
    const tenantId = await newTenant();
    const storefront = await getStorefront(tenantId);
    expect(storefront).toEqual({
      tenantId,
      active: false, layout: "grade", accentColor: null, font: "inter",
      creci: null, legalName: null, headline: null, about: null,
      instagram: null, phone: null, address: null, updatedAt: null,
    });
    expect(await rowOf(tenantId)).toHaveLength(0);
  });

  it("o upsert grava a configuração e a leitura devolve exatamente o que foi gravado", async () => {
    const tenantId = await newTenant();
    const result = await saveStorefront(tenantId, completeValue);
    expect(result.ok).toBe(true);
    const storefront = await getStorefront(tenantId);
    expect(storefront).toMatchObject({ tenantId, ...completeValue });
    expect(storefront.updatedAt).toBeInstanceOf(Date);
  });

  it("uma segunda gravação atualiza a mesma linha e renova updated_at", async () => {
    const tenantId = await newTenant();
    await saveStorefront(tenantId, completeValue);
    const first = await getStorefront(tenantId);
    await saveStorefront(tenantId, { ...completeValue, layout: "grade", headline: null, font: "lora" });
    const second = await getStorefront(tenantId);
    expect(await rowOf(tenantId)).toHaveLength(1);
    expect(second).toMatchObject({ layout: "grade", headline: null, font: "lora", creci: completeValue.creci });
    expect(second.updatedAt!.getTime()).toBeGreaterThan(first.updatedAt!.getTime());
  });

  it("L-035/L-053: gravar um tenant deixa a linha de outro tenant, com valores diferentes, intocada", async () => {
    const tenantA = await newTenant();
    const tenantB = await newTenant();
    const valueB: StorefrontValue = {
      ...completeValue, layout: "editorial", font: "lora", accentColor: "#112233",
      creci: "CRECI B-777", legalName: "Imobiliária B Ltda", headline: "Título B", phone: "11333344445",
    };
    await saveStorefront(tenantB, valueB);
    const beforeB = await getStorefront(tenantB);

    const valueA: StorefrontValue = {
      ...completeValue, active: false, layout: "grade", font: "inter", accentColor: null,
      creci: "CRECI A-111", legalName: "Imobiliária A Ltda", headline: null, phone: null,
    };
    await saveStorefront(tenantA, valueA);
    await saveStorefront(tenantA, { ...valueA, about: "segunda gravação de A" });

    expect(await getStorefront(tenantB)).toEqual(beforeB);
    expect(await getStorefront(tenantA)).toMatchObject({ ...valueA, about: "segunda gravação de A" });
  });

  it("VCFG-01 AC11 (L-002): falha forçada no upsert não deixa parte alguma gravada", async () => {
    const tenantId = await newTenant();
    await saveStorefront(tenantId, completeValue);
    const before = await getStorefront(tenantId);

    // Cor inválida entra por fora da validação e viola o check do banco no
    // upsert; os demais campos do mesmo payload não podem ficar gravados.
    await expect(
      saveStorefront(tenantId, { ...completeValue, layout: "grade", headline: "NÃO GRAVAR", accentColor: "vermelho" })
    ).rejects.toThrow();

    expect(await getStorefront(tenantId)).toEqual(before);
  });

  it("VATIV-01 AC5: gravar CRECI vazio com a vitrine ativa é recusado e nada é gravado", async () => {
    const tenantId = await newTenant();
    await saveStorefront(tenantId, completeValue);
    const before = await getStorefront(tenantId);

    for (const patch of [{ creci: null }, { creci: "   " }, { legalName: null }, { legalName: "" }]) {
      const result = await saveStorefront(tenantId, { ...completeValue, headline: "NÃO GRAVAR", ...patch });
      expect(result).toEqual({ ok: false, reason: "identidade-incompleta" });
    }
    expect(await getStorefront(tenantId)).toEqual(before);
  });

  it("VATIV-01 AC7: desativar grava sem exigir CRECI nem razão social", async () => {
    const tenantId = await newTenant();
    await saveStorefront(tenantId, completeValue);
    const result = await saveStorefront(tenantId, { ...completeValue, active: false, creci: null, legalName: null });
    expect(result.ok).toBe(true);
    expect(await getStorefront(tenantId)).toMatchObject({ active: false, creci: null, legalName: null });
  });

  it("getTenantSlug devolve o slug do tenant e nulo para um id inexistente", async () => {
    const tenantId = await newTenant();
    expect(await getTenantSlug(tenantId)).toBe(`fixture-dal-vitrine-${tenantId}`);
    expect(await getTenantSlug(randomUUID())).toBeNull();
  });
});
