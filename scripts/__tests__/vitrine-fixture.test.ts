import "dotenv/config";
import { count, eq, inArray, not, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../src/db";
import { leads, properties, tenants, tenantStorefronts, users } from "../../src/db/schema";
import {
  criarFixtureVitrine,
  removerFixtureVitrine,
  SENTINELAS,
  SLUGS_DA_FIXTURE,
} from "../vitrine-fixture";

const SLUGS = Object.values(SLUGS_DA_FIXTURE);

async function idsDaFixture(): Promise<string[]> {
  const donos = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.slug, SLUGS));
  return donos.map((dono) => dono.id);
}

/** Tudo o que NÃO é da fixture: o que o seed e os outros testes deixaram. */
async function fotografiaDoResto() {
  const ids = await idsDaFixture();
  // `not in ()` é inválido: sem loja da fixture, o filtro some.
  const fora = (coluna: Parameters<typeof inArray>[0]) => (ids.length > 0 ? not(inArray(coluna, ids)) : undefined);
  return {
    tenants: await db
      .select({ id: tenants.id, slug: tenants.slug })
      .from(tenants)
      .where(not(inArray(tenants.slug, SLUGS)))
      .orderBy(tenants.slug),
    vitrines: await db
      .select()
      .from(tenantStorefronts)
      .where(fora(tenantStorefronts.tenantId))
      .orderBy(tenantStorefronts.tenantId),
    imoveis: await db
      .select({ id: properties.id, atualizadoEm: properties.updatedAt, publicado: properties.published })
      .from(properties)
      .where(fora(properties.tenantId))
      .orderBy(properties.id),
    leads: await db.select({ total: count() }).from(leads).where(fora(leads.tenantId)),
    usuarios: await db
      .select({ total: count() })
      .from(users)
      .where(not(eq(users.email, SENTINELAS.captadorEmail))),
  };
}

async function contagemDaFixture() {
  const ids = await idsDaFixture();
  const [vitrines, imoveis, leadsDaFixture, captadores] = await Promise.all([
    ids.length ? db.select({ total: count() }).from(tenantStorefronts).where(inArray(tenantStorefronts.tenantId, ids)) : [{ total: 0 }],
    ids.length ? db.select({ total: count() }).from(properties).where(inArray(properties.tenantId, ids)) : [{ total: 0 }],
    ids.length ? db.select({ total: count() }).from(leads).where(inArray(leads.tenantId, ids)) : [{ total: 0 }],
    db.select({ total: count() }).from(users).where(eq(users.email, SENTINELAS.captadorEmail)),
  ]);
  return {
    lojas: ids.length,
    vitrines: vitrines[0].total,
    imoveis: imoveis[0].total,
    leads: leadsDaFixture[0].total,
    captadores: captadores[0].total,
  };
}

describe("L16b T13 — fixture de sentinelas da vitrine (VSEG-01, VSEG-02)", () => {
  beforeAll(async () => {
    await removerFixtureVitrine(db);
  });

  afterAll(async () => {
    await removerFixtureVitrine(db);
    await db.$client.end();
  });

  it("criar duas vezes não duplica nenhuma linha", async () => {
    await criarFixtureVitrine(db);
    const primeira = await contagemDaFixture();
    await criarFixtureVitrine(db);
    const segunda = await contagemDaFixture();

    // 4 lojas; A tem 28 imóveis, B 5, C 2 e D 3; um lead por loja; 1 captador.
    expect(primeira).toEqual({ lojas: 4, vitrines: 4, imoveis: 38, leads: 4, captadores: 1 });
    expect(segunda).toEqual(primeira);
  });

  it("remover deixa zero linhas das quatro lojas e não toca nenhuma linha fora da fixture", async () => {
    await removerFixtureVitrine(db);
    const antes = await fotografiaDoResto();

    const fixture = await criarFixtureVitrine(db);
    expect(fixture.lojas.a.id).toEqual(expect.any(String));
    await removerFixtureVitrine(db);

    expect(await contagemDaFixture()).toEqual({ lojas: 0, vitrines: 0, imoveis: 0, leads: 0, captadores: 0 });
    expect(await fotografiaDoResto()).toEqual(antes);
  });

  it("as views reais mostram exatamente o que a fixture promete: A 25 visíveis, B 4, C e D nenhum", async () => {
    const fixture = await criarFixtureVitrine(db);
    const lojasVisiveis = await db.execute(
      sql`select slug from vitrine.lojas where slug in (${sql.join(SLUGS.map((s) => sql`${s}`), sql`, `)}) order by slug`
    );
    expect((lojasVisiveis.rows as { slug: string }[]).map((linha) => linha.slug)).toEqual([
      SLUGS_DA_FIXTURE.a,
      SLUGS_DA_FIXTURE.b,
      SLUGS_DA_FIXTURE.d,
    ]);

    const imoveisVisiveis = await db.execute(
      sql`select loja_slug, count(*)::int as total from vitrine.imoveis where loja_slug in (${sql.join(SLUGS.map((s) => sql`${s}`), sql`, `)}) group by loja_slug order by loja_slug`
    );
    expect(imoveisVisiveis.rows).toEqual([
      { loja_slug: SLUGS_DA_FIXTURE.a, total: 25 },
      { loja_slug: SLUGS_DA_FIXTURE.b, total: 4 },
    ]);
    expect(fixture.ordemDaA).toHaveLength(25);
  });

  it("a fixture cobre o desenho: cores, fontes e layouts diferentes, D sem cor com a fonte padrão, imóvel sem foto e com <script>", async () => {
    const { lojas, ordemDaA } = await criarFixtureVitrine(db);

    expect(new Set([lojas.a.cor, lojas.b.cor, lojas.d.cor]).size).toBe(3);
    expect(lojas.a.fonte).not.toBe(lojas.b.fonte);
    expect(lojas.a.layout).toBe("grade");
    expect(lojas.b.layout).toBe("editorial");
    expect(lojas.c.ativa).toBe(false);
    expect(lojas.d.cor).toBeNull();
    expect(lojas.d.fonte).toBe("inter");
    expect(lojas.d.imoveis.filter((imovel) => imovel.visivel)).toEqual([]);

    const visiveisA = lojas.a.imoveis.filter((imovel) => imovel.visivel);
    expect(visiveisA.some((imovel) => imovel.fotos === null)).toBe(true);
    expect(visiveisA.some((imovel) => imovel.descricao.includes("<script>"))).toBe(true);

    // Ordem do catálogo: os 3 destaques (mais recente primeiro), depois o resto;
    // 19 e 20 empatam em `atualizado_em` e a referência decide.
    expect(ordemDaA.slice(0, 3)).toEqual(["AP-0011", "AP-0007", "AP-0003"]);
    expect(ordemDaA.indexOf("AP-0019")).toBe(ordemDaA.indexOf("CA-0020") - 1);
    expect(ordemDaA.at(-1)).toBe("AP-0001");
  });
});
