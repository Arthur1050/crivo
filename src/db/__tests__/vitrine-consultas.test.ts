import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// AD-044: o teste de banco das consultas fica na suíte raiz e importa de `vitrine/`.
import { criarDb } from "../../../vitrine/src/db/conexao";
import {
  imoveisDaLoja,
  imovelPorReferencia,
  lojaPorSlug,
} from "../../../vitrine/src/dados/consultas";
import { db } from "../index";
import { properties, tenants, tenantStorefronts, users } from "../schema";
import { resolveVitrineTestUrl } from "../test-connection";
import { currentTestDatabaseUrl } from "./vitrine-helpers";

type PropertyInsert = typeof properties.$inferInsert;

/** Instantes fixos: a ordem do catálogo precisa de empates e de datas controladas. */
const AGORA = new Date("2026-10-01T12:00:00.000Z");
const ha = (dias: number) => new Date(AGORA.getTime() - dias * 24 * 60 * 60 * 1000);

describe("L16b T4 — consultas da vitrine como crivo_vitrine (VSEG-01, VCAT-02, VITEM-01)", () => {
  const tenantIds: string[] = [];
  let userId: string;
  let sequence = 0;
  // Leitura pelo papel `crivo_vitrine` da branch do worker, com o `db` da própria vitrine.
  const leitura = criarDb(
    resolveVitrineTestUrl({
      baseUrl: currentTestDatabaseUrl(),
      password: process.env.VITRINE_TEST_DB_PASSWORD,
    })
  );

  async function novaLoja(opts: { ativa?: boolean; nome?: string } = {}) {
    const id = randomUUID();
    tenantIds.push(id);
    const slug = `fixture-consultas-${id}`;
    await db.insert(tenants).values({
      id,
      slug,
      name: opts.nome ?? `Imobiliária ${id.slice(0, 8)}`,
      agentName: "Agente",
      supportedModality: "ambos",
      city: "Uberaba",
      state: "MG",
      agentWhatsapp: "5534999990000",
    });
    await db.insert(tenantStorefronts).values({
      tenantId: id,
      active: opts.ativa ?? true,
      creci: "CRECI 12345-J",
      legalName: "Imobiliária Fixture Ltda",
    });
    return { id, slug };
  }

  async function novoImovel(tenantId: string, overrides: Partial<PropertyInsert> & { reference: string }) {
    sequence += 1;
    const [row] = await db
      .insert(properties)
      .values({
        tenantId,
        capturedByUserId: userId,
        sequence,
        kind: "apartamento",
        modality: "usado",
        status: "disponivel",
        published: true,
        featured: false,
        street: "Rua Secreta",
        number: "999",
        neighborhood: "Centro",
        neighborhoodNormalized: "centro",
        city: "Uberaba",
        cityNormalized: "uberaba",
        state: "MG",
        priceCents: 350_000_00n,
        areaSqm: 70,
        bedrooms: 2,
        bathrooms: 1,
        parkingSpots: 1,
        description: "Descrição fixture",
        photoUrls: ["https://example.com/a.jpg"],
        updatedAt: ha(10),
        ...overrides,
      })
      .returning();
    return row;
  }

  beforeAll(async () => {
    userId = randomUUID();
    await db.insert(users).values({ id: userId, name: "Captador consultas", email: `${userId}@fixture.test` });
  });

  afterAll(async () => {
    if (tenantIds.length > 0) {
      await db.delete(properties).where(inArray(properties.tenantId, tenantIds));
      await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    }
    await db.delete(users).where(eq(users.id, userId));
    await leitura.$client.end();
    await db.$client.end();
  });

  it("lê como o papel crivo_vitrine, não como o dono (VSEG AC8)", async () => {
    // String, não `sql`: o `sql` da raiz e o `db` da vitrine vêm de cópias distintas do drizzle (AD-044).
    const resultado = await leitura.execute("select current_user as usuario");
    expect((resultado.rows[0] as { usuario: string }).usuario).toBe("crivo_vitrine");
  });

  describe("isolamento por slug e corte de visibilidade (VSEG AC2, AC3, AC4)", () => {
    it("a loja A nunca devolve linha da B, na lista nem pela referência direta", async () => {
      const a = await novaLoja();
      const b = await novaLoja();
      await novoImovel(a.id, { reference: "AP-0001", priceCents: 100_000_00n, neighborhood: "Bairro da A" });
      // A loja B tem imóveis MAIS NOVOS e uma referência igual à da A, com dados diferentes.
      await novoImovel(b.id, { reference: "AP-0001", priceCents: 999_000_00n, neighborhood: "Bairro da B", updatedAt: ha(1) });
      await novoImovel(b.id, { reference: "BP-0002", updatedAt: ha(0) });

      const listaA = await imoveisDaLoja(leitura, a.slug);
      expect(listaA.map((i) => i.referencia)).toEqual(["AP-0001"]);
      expect(listaA[0].bairro).toBe("Bairro da A");
      expect(listaA.every((i) => i.lojaSlug === a.slug)).toBe(true);

      const direta = await imovelPorReferencia(leitura, a.slug, "ap-0001");
      expect(direta?.bairro).toBe("Bairro da A");
      expect(direta?.precoCentavos).toBe(100_000_00n);
      // Referência que só existe na B, pedida sob o slug da A.
      expect(await imovelPorReferencia(leitura, a.slug, "bp-0002")).toBeNull();
      expect(await imovelPorReferencia(leitura, b.slug, "BP-0002")).not.toBeNull();
    });

    it("vendido, reservado e despublicado ficam fora da lista e da referência direta", async () => {
      const a = await novaLoja();
      await novoImovel(a.id, { reference: "OK-0001" });
      await novoImovel(a.id, { reference: "VEN-0001", status: "vendido" });
      await novoImovel(a.id, { reference: "RES-0001", status: "reservado" });
      await novoImovel(a.id, { reference: "DES-0001", published: false });

      const lista = await imoveisDaLoja(leitura, a.slug);
      expect(lista.map((i) => i.referencia)).toEqual(["OK-0001"]);
      for (const ref of ["VEN-0001", "RES-0001", "DES-0001"]) {
        expect(await imovelPorReferencia(leitura, a.slug, ref), ref).toBeNull();
      }
      expect((await imovelPorReferencia(leitura, a.slug, "OK-0001"))?.referencia).toBe("OK-0001");
    });
  });

  describe("ordem do catálogo (VCAT AC2)", () => {
    it("destaque primeiro, depois atualizado_em decrescente, e o empate pela referência crescente", async () => {
      const a = await novaLoja();
      // Destaques mais ANTIGOS que os demais: sem a ordem por destaque eles iriam para o fim.
      await novoImovel(a.id, { reference: "D-ANTIGO", featured: true, updatedAt: ha(30) });
      await novoImovel(a.id, { reference: "D-RECENTE", featured: true, updatedAt: ha(20) });
      await novoImovel(a.id, { reference: "N-NOVO", updatedAt: ha(1) });
      // Empate de atualizado_em, inserido na ordem inversa da referência.
      await novoImovel(a.id, { reference: "Z-2", updatedAt: ha(5) });
      await novoImovel(a.id, { reference: "Z-1", updatedAt: ha(5) });
      await novoImovel(a.id, { reference: "N-VELHO", updatedAt: ha(9) });

      const refs = (await imoveisDaLoja(leitura, a.slug)).map((i) => i.referencia);
      expect(refs).toEqual(["D-RECENTE", "D-ANTIGO", "N-NOVO", "Z-1", "Z-2", "N-VELHO"]);
    });
  });

  describe("referência sem distinção de caixa (VITEM Edge Case)", () => {
    it("ap-0142 acha AP-0142 e a forma maiúscula também", async () => {
      const a = await novaLoja();
      await novoImovel(a.id, { reference: "AP-0142" });
      expect((await imovelPorReferencia(leitura, a.slug, "ap-0142"))?.referencia).toBe("AP-0142");
      expect((await imovelPorReferencia(leitura, a.slug, "AP-0142"))?.referencia).toBe("AP-0142");
      expect((await imovelPorReferencia(leitura, a.slug, "Ap-0142"))?.referencia).toBe("AP-0142");
      expect(await imovelPorReferencia(leitura, a.slug, "ap-0143")).toBeNull();
    });
  });

  describe("loja que não é pública", () => {
    it("loja inativa → loja nula, lista vazia e referência nula, mesmo com imóvel disponível", async () => {
      const inativa = await novaLoja({ ativa: false });
      await novoImovel(inativa.id, { reference: "IN-0001" });
      expect(await lojaPorSlug(leitura, inativa.slug)).toBeNull();
      expect(await imoveisDaLoja(leitura, inativa.slug)).toEqual([]);
      expect(await imovelPorReferencia(leitura, inativa.slug, "in-0001")).toBeNull();
    });

    it("slug inexistente → nulo e vazio", async () => {
      expect(await lojaPorSlug(leitura, "slug-que-nao-existe-nesta-fixture")).toBeNull();
      expect(await imoveisDaLoja(leitura, "slug-que-nao-existe-nesta-fixture")).toEqual([]);
    });

    it("loja ativa devolve a identidade pública e nunca o id do tenant", async () => {
      const a = await novaLoja({ nome: "Imobiliária Visível" });
      const loja = await lojaPorSlug(leitura, a.slug);
      expect(loja).toMatchObject({
        slug: a.slug,
        nome: "Imobiliária Visível",
        creci: "CRECI 12345-J",
        razaoSocial: "Imobiliária Fixture Ltda",
        whatsapp: "5534999990000",
        layout: "grade",
        fonte: "inter",
      });
      expect(Object.keys(loja ?? {})).not.toContain("tenantId");
      expect(Object.keys(loja ?? {})).not.toContain("id");
    });
  });
});
