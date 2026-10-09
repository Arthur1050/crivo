import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyVitrineSql } from "../../../scripts/vitrine/apply";
import { STOREFRONT_VIEW_COLUMNS } from "../../lib/storefront-contract";
import { searchVisibleProperties } from "../../server/integration/properties";
import { db } from "../index";
import { properties, tenants, tenantStorefronts, users } from "../schema";
import { currentTestDatabaseUrl } from "./vitrine-helpers";

type PropertyInsert = typeof properties.$inferInsert;
type StorefrontInsert = typeof tenantStorefronts.$inferInsert;

const STATUSES = ["disponivel", "reservado", "vendido"] as const;

describe("L16a T8 — views públicas da vitrine (VBANCO-01)", () => {
  const tenantIds: string[] = [];
  const url = currentTestDatabaseUrl();
  let userId: string;
  let sequence = 0;

  async function newTenant(opts: { whatsapp?: string | null; storefront?: Partial<StorefrontInsert> | null }) {
    const id = randomUUID();
    tenantIds.push(id);
    const slug = `fixture-vitrine-${id}`;
    await db.insert(tenants).values({
      id, slug, name: `Imobiliária ${id.slice(0, 8)}`, agentName: "Agente", supportedModality: "ambos",
      logo: `https://example.com/${id}.png`, city: "Uberaba", state: "MG",
      agentWhatsapp: opts.whatsapp === undefined ? "5534999990000" : opts.whatsapp,
    });
    if (opts.storefront !== null) {
      await db.insert(tenantStorefronts).values({
        tenantId: id, active: true, layout: "editorial", accentColor: "#112233", font: "lora",
        creci: "CRECI 12345-J", legalName: "Imobiliária Fixture Ltda", headline: "Título fixture",
        about: "Sobre fixture", instagram: "fixture.imob", phone: "3433334444", address: "Rua Fixture, 10",
        ...opts.storefront,
      });
    }
    return { id, slug };
  }

  async function addProperty(tenantId: string, overrides: Partial<PropertyInsert> = {}) {
    sequence += 1;
    const [row] = await db.insert(properties).values({
      tenantId, capturedByUserId: userId, sequence, reference: `VIT-${sequence}`,
      kind: "apartamento", modality: "usado", status: "disponivel", published: true,
      street: "Rua Secreta", number: "999", complement: "Apto 1",
      neighborhood: "Centro", neighborhoodNormalized: "centro", city: "Uberaba", cityNormalized: "uberaba", state: "MG",
      priceCents: 350_000_00n, areaSqm: 70, bedrooms: 2, bathrooms: 1, parkingSpots: 1,
      description: "Descrição fixture", photoUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"], featured: true,
      ...overrides,
    }).returning();
    return row;
  }

  async function addAllCombinations(tenantId: string) {
    const rows = [];
    for (const status of STATUSES) {
      for (const published of [true, false]) {
        rows.push(await addProperty(tenantId, { status, published, featured: false }));
      }
    }
    return rows;
  }

  async function lojas(slugs: string[]) {
    const result = await db.execute(sql`select * from vitrine.lojas where slug in (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)}) order by slug`);
    return result.rows as Record<string, unknown>[];
  }

  async function imoveis(slugs: string[]) {
    const result = await db.execute(sql`select * from vitrine.imoveis where loja_slug in (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)}) order by referencia`);
    return result.rows as Record<string, unknown>[];
  }

  beforeAll(async () => {
    userId = randomUUID();
    await db.insert(users).values({ id: userId, name: "Captador vitrine", email: `${userId}@fixture.test` });
    await applyVitrineSql(url);
  });

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await db.delete(properties).where(inArray(properties.tenantId, tenantIds));
      await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    }
    await db.delete(users).where(eq(users.id, userId));
    await db.$client.end();
  });

  it("AC1: as duas views existem no schema vitrine com security_barrier", async () => {
    const result = await db.execute(sql`
      select c.relname, c.relkind, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'vitrine' order by c.relname`);
    const rows = result.rows as { relname: string; relkind: string; reloptions: string[] | null }[];
    expect(rows.map((row) => [row.relname, row.relkind])).toEqual([["imoveis", "v"], ["lojas", "v"]]);
    for (const row of rows) expect(row.reloptions, row.relname).toContain("security_barrier=true");
  });

  it("AC2 e AC3: as colunas das duas views são exatamente as da spec, na ordem", async () => {
    for (const view of ["lojas", "imoveis"] as const) {
      const result = await db.execute(sql`
        select column_name from information_schema.columns
        where table_schema = 'vitrine' and table_name = ${view} order by ordinal_position`);
      expect((result.rows as { column_name: string }[]).map((row) => row.column_name), view).toEqual([
        ...STOREFRONT_VIEW_COLUMNS[view],
      ]);
    }
  });

  describe("corte de loja (AC4)", () => {
    it("só a loja ativa e completa aparece; a sem WhatsApp, a inativa e a sem linha ficam de fora", async () => {
      const complete = await newTenant({});
      const noWhatsappNull = await newTenant({ whatsapp: null });
      const noWhatsappBlank = await newTenant({ whatsapp: "   " });
      const inactive = await newTenant({ storefront: { active: false } });
      const noRow = await newTenant({ storefront: null });

      const rows = await lojas([complete.slug, noWhatsappNull.slug, noWhatsappBlank.slug, inactive.slug, noRow.slug]);
      expect(rows.map((row) => row.slug)).toEqual([complete.slug]);
    });

    it("a linha da loja traz cada coluna com o valor da origem certa", async () => {
      const { id, slug } = await newTenant({});
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
      // Timestamp cru (texto, microssegundos) dos dois lados: `db.execute` não converte tipos.
      const source = await db.execute(sql`select updated_at from public.tenant_storefronts where tenant_id = ${id}`);
      const [row] = await lojas([slug]);
      expect(row).toEqual({
        slug,
        nome: tenant.name,
        logo: `https://example.com/${id}.png`,
        whatsapp: "5534999990000",
        cidade: "Uberaba",
        uf: "MG",
        layout: "editorial",
        cor: "#112233",
        fonte: "lora",
        creci: "CRECI 12345-J",
        razao_social: "Imobiliária Fixture Ltda",
        titulo: "Título fixture",
        sobre: "Sobre fixture",
        instagram: "fixture.imob",
        telefone: "3433334444",
        endereco: "Rua Fixture, 10",
        atualizado_em: source.rows[0].updated_at,
      });
    });
  });

  describe("corte de imóvel (AC5)", () => {
    it("só disponível E publicado aparece, em todas as combinações de status e publicação", async () => {
      const store = await newTenant({});
      const all = await addAllCombinations(store.id);
      const expected = all.filter((p) => p.status === "disponivel" && p.published).map((p) => p.reference);
      expect(expected).toHaveLength(1);

      const rows = await imoveis([store.slug]);
      expect(rows.map((row) => row.referencia)).toEqual(expected);
    });

    it("imóveis de loja inativa ou sem WhatsApp do agente não aparecem, mesmo publicados e disponíveis", async () => {
      const inactive = await newTenant({ storefront: { active: false } });
      const noWhatsapp = await newTenant({ whatsapp: null });
      await addProperty(inactive.id);
      await addProperty(noWhatsapp.id);
      expect(await imoveis([inactive.slug, noWhatsapp.slug])).toEqual([]);
    });

    it("a linha do imóvel traz cada coluna com o valor da origem certa", async () => {
      const store = await newTenant({});
      const property = await addProperty(store.id);
      const source = await db.execute(sql`select updated_at from public.properties where id = ${property.id}`);
      const [row] = await imoveis([store.slug]);
      expect(row).toEqual({
        loja_slug: store.slug,
        referencia: property.reference,
        tipo: "apartamento",
        modalidade: "usado",
        bairro: "Centro",
        cidade: "Uberaba",
        uf: "MG",
        preco_centavos: "35000000",
        area_m2: 70,
        quartos: 2,
        banheiros: 1,
        vagas: 1,
        descricao: "Descrição fixture",
        fotos: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        destaque: true,
        atualizado_em: source.rows[0].updated_at,
      });
    });
  });

  describe("Edge Cases de visibilidade", () => {
    it("loja ativa com todos os imóveis vendidos está em lojas e não tem nenhum imóvel em imoveis", async () => {
      const store = await newTenant({});
      await addProperty(store.id, { status: "vendido" });
      await addProperty(store.id, { status: "vendido", published: false });
      expect((await lojas([store.slug])).map((row) => row.slug)).toEqual([store.slug]);
      expect(await imoveis([store.slug])).toEqual([]);
    });

    it("desativar a vitrine tira a loja e todos os imóveis, mesmo publicados e disponíveis", async () => {
      const store = await newTenant({});
      await addProperty(store.id);
      expect(await imoveis([store.slug])).toHaveLength(1);

      await db.update(tenantStorefronts).set({ active: false }).where(eq(tenantStorefronts.tenantId, store.id));

      expect(await lojas([store.slug])).toEqual([]);
      expect(await imoveis([store.slug])).toEqual([]);
    });

    it("marcar o imóvel como vendido o tira da view no mesmo instante", async () => {
      const store = await newTenant({});
      const property = await addProperty(store.id);
      expect(await imoveis([store.slug])).toHaveLength(1);
      await db.update(properties).set({ status: "vendido" }).where(eq(properties.id, property.id));
      expect(await imoveis([store.slug])).toEqual([]);
    });
  });

  describe("idempotência do SQL (AC13)", () => {
    async function constraintNames() {
      const result = await db.execute(sql`
        select conname from pg_constraint
        where conrelid = 'public.tenant_storefronts'::regclass and contype = 'c' order by conname`);
      return (result.rows as { conname: string }[]).map((row) => row.conname);
    }
    async function viewDefinitions() {
      const result = await db.execute(sql`
        select pg_get_viewdef('vitrine.lojas'::regclass) as lojas, pg_get_viewdef('vitrine.imoveis'::regclass) as imoveis`);
      return result.rows[0];
    }

    it("aplicar duas vezes não falha, não duplica check e não muda as views", async () => {
      const before = { checks: await constraintNames(), views: await viewDefinitions() };
      await applyVitrineSql(url);
      await applyVitrineSql(url);
      expect(await constraintNames()).toEqual(before.checks);
      expect(before.checks).toEqual([
        "tenant_storefronts_accent_color_check",
        "tenant_storefronts_active_requires_identity_check",
      ]);
      expect(await viewDefinitions()).toEqual(before.views);
    });

    it("com um check removido à mão, aplicar o recria e o banco volta a recusar", async () => {
      await db.execute(sql`alter table public.tenant_storefronts drop constraint tenant_storefronts_accent_color_check`);
      await db.execute(sql`alter table public.tenant_storefronts drop constraint tenant_storefronts_active_requires_identity_check`);
      expect(await constraintNames()).toEqual([]);

      await applyVitrineSql(url);

      expect(await constraintNames()).toEqual([
        "tenant_storefronts_accent_color_check",
        "tenant_storefronts_active_requires_identity_check",
      ]);
      const store = await newTenant({ storefront: null });
      await expect(
        db.insert(tenantStorefronts).values({ tenantId: store.id, active: true, creci: null, legalName: "Ltda" })
      ).rejects.toThrow();
      await expect(
        db.insert(tenantStorefronts).values({ tenantId: store.id, accentColor: "#ABC" })
      ).rejects.toThrow();
    });
  });

  it("AC14: para a loja com 3 imóveis visíveis, a busca do contrato e a view devolvem as mesmas referências e o mesmo total", async () => {
    const store = await newTenant({});
    const visible = [];
    for (let i = 0; i < 3; i++) visible.push(await addProperty(store.id, { featured: i === 0 }));
    await addProperty(store.id, { status: "reservado" });
    await addProperty(store.id, { published: false });
    await addProperty(store.id, { status: "vendido" });

    const search = await searchVisibleProperties(store.id, {});
    const viewRows = await imoveis([store.slug]);

    expect(viewRows).toHaveLength(3);
    expect(search.total).toBe(viewRows.length);
    expect(search.imoveis.map((item) => item.referencia).sort()).toEqual(
      viewRows.map((row) => row.referencia as string).sort()
    );
    expect(search.imoveis.map((item) => item.referencia).sort()).toEqual(visible.map((p) => p.reference).sort());
  });
});
