import { LEAD_STATUS } from "../src/lib/vocabulary";
import { MODALITY, PROPERTY_KIND, PROPERTY_STATUS, STOREFRONT_LAYOUT } from "../src/verticals/real-estate/vocabulary";
/**
 * Fixture de sentinelas da vitrine (lote-16b — T13; VSEG-01, VSEG-02).
 *
 * Cria, no banco de TESTE, quatro lojas de fixture com imóveis em todos os
 * estados e textos sentinela únicos (captador, endereço, lead e descrições de
 * imóvel que não podem aparecer). O harness HTTP (`storefront-e2e.ts`) varre o HTML
 * e o log do servidor atrás desses textos.
 *
 * - A: ativa, `grade`, cor e fonte própria, 25 imóveis visíveis (+ 3 invisíveis).
 * - B: ativa, `editorial`, outra cor e outra fonte, 4 visíveis; repete a
 *   referência `AP-0001` da A com preço e texto próprios (isolamento por slug).
 * - C: inativa, com imóveis que pareceriam visíveis.
 * - D: ativa, sem cor, fonte padrão, sem nenhum imóvel visível (catálogo vazio).
 *
 * Tenants próprios, com slug fixo: nenhuma linha do seed é criada, lida ou
 * alterada. `criarFixtureVitrine` remove antes de inserir, então chamá-la duas
 * vezes não duplica. Nunca importa `src/db/index.ts`: fora do Vitest ele
 * conectaria no banco real (`DATABASE_URL`); aqui o banco entra por parâmetro, e
 * `abrirBancoDeTeste` só aceita `TEST_DATABASE_URL`.
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { leads, tenants, users } from "../src/db/schema";
import { properties, tenantStorefronts } from "../src/verticals/real-estate/schema";

export type BancoDoDono = NodePgDatabase<typeof schema>;

export const SLUGS_DA_FIXTURE = {
  a: "vt-e2e-a",
  b: "vt-e2e-b",
  c: "vt-e2e-c",
  d: "vt-e2e-d",
} as const;

/** Textos que nenhuma resposta pública pode conter (VSEG AC5, AC4). */
export const SENTINELAS = {
  collectorName: "CAPTADOR-SENTINELA-NOME-4d9",
  captadorEmail: "captador-sentinela-4d9@sentinela.test",
  logradouro: "LOGRADOURO-SENTINELA-7c1",
  numero: "NUM-SENTINELA-S9317",
  complemento: "COMPL-SENTINELA-BLOCO-Z",
  leadName: "LEAD-SENTINELA-NOME-81f",
  leadTelefone: "5599912345678",
  vendidoA: "DESCRICAO-SENTINELA-VENDIDO-A",
  reservadoA: "DESCRICAO-SENTINELA-RESERVADO-A",
  despublicadoA: "DESCRICAO-SENTINELA-DESPUBLICADO-A",
  inactiveStoreProperty: "DESCRICAO-SENTINELA-LOJA-INATIVA-C",
} as const;

export interface FixtureProperty {
  referencia: string;
  kind: typeof PROPERTY_KIND.apartment | typeof PROPERTY_KIND.house;
  neighborhood: string;
  city: string;
  uf: string;
  priceReais: number;
  destaque: boolean;
  atualizadoEm: Date;
  fotos: string[] | null;
  description: string;
  quartos: number;
  banheiros: number;
  vagas: number;
  areaM2: number;
  /** Visível na vitrine: `disponivel` e publicado, em loja ativa. */
  visivel: boolean;
}

export interface FixtureStore {
  id: string;
  slug: string;
  name: string;
  razaoSocial: string;
  creci: string;
  /** Cor digitada pelo gestor (`#rrggbb`), ou `null` (cor padrão). */
  color: string | null;
  font: "inter" | "montserrat" | "lora" | "playfair";
  layout: typeof STOREFRONT_LAYOUT.grid | "editorial";
  ativa: boolean;
  /** Como está gravado no CRM (pode ter máscara). */
  whatsapp: string;
  /** Só dígitos, com o `55` quando a vitrine o acrescenta. */
  whatsappComPrefixo: string;
  title: string | null;
  sobre: string | null;
  instagram: string | null;
  telefone: string | null;
  endereco: string | null;
  city: string;
  uf: string;
  properties: FixtureProperty[];
}

export interface StorefrontFixture {
  stores: { a: FixtureStore; b: FixtureStore; c: FixtureStore; d: FixtureStore };
  /** Referências visíveis da A na ordem do catálogo: destaque, mais recente, referência. */
  ordemDaA: string[];
  /** Todos os textos sentinela (valores de `SENTINELAS`). */
  sentinelas: string[];
}

const BASE_TEMPO = Date.UTC(2026, 0, 1, 12, 0, 0);
const DIA = 24 * 60 * 60 * 1000;

function referenciaDe(kind: typeof PROPERTY_KIND.apartment | typeof PROPERTY_KIND.house, sequencia: number): string {
  return `${kind === PROPERTY_KIND.apartment ? "AP" : "CA"}-${String(sequencia).padStart(4, "0")}`;
}

function fotosDe(prefixo: string, referencia: string): string[] {
  const ref = referencia.toLowerCase();
  return [
    `https://fotos.vitrine-e2e.test/${prefixo}/${ref}-1.jpg`,
    `https://fotos.vitrine-e2e.test/${prefixo}/${ref}-2.jpg`,
  ];
}

interface Especificacao extends FixtureProperty {
  sequencia: number;
  status: typeof PROPERTY_STATUS.available | typeof PROPERTY_STATUS.reserved | typeof PROPERTY_STATUS.sold;
  publicado: boolean;
}

function especificacoesDaA(): Especificacao[] {
  const itens: Especificacao[] = [];
  const destaques = new Set([3, 7, 11]);
  for (let sequencia = 1; sequencia <= 25; sequencia += 1) {
    const kind = sequencia % 2 === 1 ? PROPERTY_KIND.apartment : PROPERTY_KIND.house;
    const referencia = referenciaDe(kind, sequencia);
    // O 20 empata com o 19 em `atualizado_em`: a referência decide (VCAT AC2).
    const days = sequencia === 20 ? 19 : sequencia;
    itens.push({
      sequencia,
      status: PROPERTY_STATUS.available,
      publicado: true,
      referencia,
      kind,
      neighborhood: `Bairro Alfa ${sequencia}`,
      city: "Uberaba",
      uf: "MG",
      priceReais: 150_000 + sequencia * 10_000,
      destaque: destaques.has(sequencia),
      atualizadoEm: new Date(BASE_TEMPO + days * DIA),
      // O 5 não tem foto (VITEM AC6).
      fotos: sequencia === 5 ? null : fotosDe("a", referencia),
      // O 9 traz HTML na descrição (VITEM Edge Case).
      description:
        sequencia === 9
          ? 'Primeira linha\n<script>window.__xss_vitrine=1</script>\nTerceira linha'
          : `Descrição do imóvel ${referencia} da loja A.`,
      quartos: 1 + (sequencia % 4),
      banheiros: 1 + (sequencia % 3),
      vagas: sequencia % 3,
      areaM2: 40 + sequencia * 3,
      visivel: true,
    });
  }
  const invisiveis: Array<[number, Especificacao["status"], boolean, string]> = [
    [26, PROPERTY_STATUS.sold, true, SENTINELAS.vendidoA],
    [27, PROPERTY_STATUS.reserved, true, SENTINELAS.reservadoA],
    [28, PROPERTY_STATUS.available, false, SENTINELAS.despublicadoA],
  ];
  for (const [sequencia, status, publicado, description] of invisiveis) {
    const referencia = referenciaDe(PROPERTY_KIND.apartment, sequencia);
    itens.push({
      sequencia,
      status,
      publicado,
      referencia,
      kind: PROPERTY_KIND.apartment,
      neighborhood: "Bairro Oculto",
      city: "Uberaba",
      uf: "MG",
      priceReais: 888_000 + sequencia,
      destaque: false,
      atualizadoEm: new Date(BASE_TEMPO + 40 * DIA),
      fotos: fotosDe("a", referencia),
      description,
      quartos: 3,
      banheiros: 2,
      vagas: 1,
      areaM2: 100,
      visivel: false,
    });
  }
  return itens;
}

function especificacoesDaB(): Especificacao[] {
  const base = {
    city: "Uberlândia",
    uf: "MG",
    status: PROPERTY_STATUS.available,
    publicado: true,
    visivel: true,
    neighborhood: "Bairro Beta Exclusivo",
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    areaM2: 70,
  };
  return [
    {
      ...base, sequencia: 1, referencia: "AP-0001", kind: PROPERTY_KIND.apartment, priceReais: 987_000,
      destaque: false, atualizadoEm: new Date(BASE_TEMPO + 3 * DIA), fotos: fotosDe("b", "AP-0001"),
      description: "Descrição do imóvel AP-0001 da loja B (BETA-EXCLUSIVO).",
    },
    {
      ...base, sequencia: 2, referencia: "CA-0002", kind: PROPERTY_KIND.house, priceReais: 612_000,
      destaque: false, atualizadoEm: new Date(BASE_TEMPO + 2 * DIA), fotos: fotosDe("b", "CA-0002"),
      description: "Descrição do imóvel CA-0002 da loja B (BETA-EXCLUSIVO).",
    },
    {
      ...base, sequencia: 3, referencia: "AP-0003", kind: PROPERTY_KIND.apartment, priceReais: 745_000,
      destaque: true, atualizadoEm: new Date(BASE_TEMPO + 1 * DIA), fotos: fotosDe("b", "AP-0003"),
      description: "Descrição do imóvel AP-0003 da loja B (BETA-EXCLUSIVO).",
    },
    {
      ...base, sequencia: 4, referencia: "CA-0004", kind: PROPERTY_KIND.house, priceReais: 530_000,
      destaque: false, atualizadoEm: new Date(BASE_TEMPO + 4 * DIA), fotos: fotosDe("b", "CA-0004"),
      description: "Descrição do imóvel CA-0004 da loja B (BETA-EXCLUSIVO).",
    },
    {
      ...base, sequencia: 5, referencia: "AP-0005", kind: PROPERTY_KIND.apartment, priceReais: 999_000,
      destaque: false, atualizadoEm: new Date(BASE_TEMPO + 5 * DIA), fotos: fotosDe("b", "AP-0005"),
      description: "Descrição do imóvel vendido da loja B (BETA-EXCLUSIVO).",
      status: PROPERTY_STATUS.sold, visivel: false,
    },
  ];
}

function especificacoesDaC(): Especificacao[] {
  return [1, 2].map((sequencia) => {
    const referencia = referenciaDe(PROPERTY_KIND.apartment, sequencia);
    return {
      sequencia, status: PROPERTY_STATUS.available, publicado: true, visivel: false,
      referencia, kind: PROPERTY_KIND.apartment, neighborhood: "Bairro Gama", city: "Araxá", uf: "MG",
      priceReais: 300_000 + sequencia, destaque: sequencia === 1,
      atualizadoEm: new Date(BASE_TEMPO + sequencia * DIA), fotos: fotosDe("c", referencia),
      description: SENTINELAS.inactiveStoreProperty, quartos: 2, banheiros: 1, vagas: 1, areaM2: 60,
    } satisfies Especificacao;
  });
}

function especificacoesDaD(): Especificacao[] {
  const estados: Array<[number, Especificacao["status"], boolean]> = [
    [1, PROPERTY_STATUS.sold, true],
    [2, PROPERTY_STATUS.reserved, true],
    [3, PROPERTY_STATUS.available, false],
  ];
  return estados.map(([sequencia, status, publicado]) => {
    const referencia = referenciaDe(PROPERTY_KIND.house, sequencia);
    return {
      sequencia, status, publicado, visivel: false,
      referencia, kind: PROPERTY_KIND.house, neighborhood: "Bairro Delta", city: "Franca", uf: "SP",
      priceReais: 410_000 + sequencia, destaque: false,
      atualizadoEm: new Date(BASE_TEMPO + sequencia * DIA), fotos: fotosDe("d", referencia),
      description: `Descrição do imóvel ${referencia} da loja D (fora do ar).`,
      quartos: 3, banheiros: 2, vagas: 2, areaM2: 120,
    } satisfies Especificacao;
  });
}

interface StoreDefinition {
  key: "a" | "b" | "c" | "d";
  data: Omit<FixtureStore, "id" | "properties">;
  properties: Especificacao[];
}

function definicoes(): StoreDefinition[] {
  return [
    {
      key: "a",
      data: {
        slug: SLUGS_DA_FIXTURE.a, name: "Imobiliária Alfa", razaoSocial: "Alfa Negócios Imobiliários Ltda",
        creci: "CRECI-MG 11111-J", color: "#d4145a", font: "lora", layout: STOREFRONT_LAYOUT.grid, ativa: true,
        whatsapp: "(34) 99999-0001", whatsappComPrefixo: "5534999990001",
        title: "Imóveis selecionados em Uberaba", sobre: "A Alfa atende famílias de Uberaba desde 2010.",
        instagram: "alfa.imoveis", telefone: "3433330001", endereco: "Rua Alfa, 100, Centro, Uberaba/MG",
        city: "Uberaba", uf: "MG",
      },
      properties: especificacoesDaA(),
    },
    {
      key: "b",
      data: {
        slug: SLUGS_DA_FIXTURE.b, name: "Imobiliária Beta", razaoSocial: "Beta Corretora de Imóveis Ltda",
        creci: "CRECI-MG 22222-J", color: "#12a150", font: "playfair", layout: "editorial", ativa: true,
        whatsapp: "5534988880002", whatsappComPrefixo: "5534988880002",
        title: null, sobre: "A Beta é especialista em apartamentos.",
        instagram: null, telefone: "34988880002", endereco: null,
        city: "Uberlândia", uf: "MG",
      },
      properties: especificacoesDaB(),
    },
    {
      key: "c",
      data: {
        slug: SLUGS_DA_FIXTURE.c, name: "Imobiliária Gama Inativa", razaoSocial: "Gama Imóveis Ltda",
        creci: "CRECI-MG 33333-J", color: "#8e24aa", font: "montserrat", layout: STOREFRONT_LAYOUT.grid, ativa: false,
        whatsapp: "34977770003", whatsappComPrefixo: "5534977770003",
        title: "Loja inativa", sobre: "Esta vitrine está desativada.",
        instagram: "gama.inativa", telefone: null, endereco: null,
        city: "Araxá", uf: "MG",
      },
      properties: especificacoesDaC(),
    },
    {
      key: "d",
      data: {
        slug: SLUGS_DA_FIXTURE.d, name: "Imobiliária Delta", razaoSocial: "Delta Participações Ltda",
        creci: "CRECI-SP 44444-J", color: null, font: "inter", layout: STOREFRONT_LAYOUT.grid, ativa: true,
        whatsapp: "3433330004", whatsappComPrefixo: "553433330004",
        title: null, sobre: null, instagram: null, telefone: null, endereco: null,
        city: "Franca", uf: "SP",
      },
      properties: especificacoesDaD(),
    },
  ];
}

/** Banco de teste para uso fora do Vitest. Nunca lê `DATABASE_URL`. */
export function abrirBancoDeTeste(env: Record<string, string | undefined> = process.env): {
  db: BancoDoDono;
  encerrar: () => Promise<void>;
} {
  const url = env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL não definida: a fixture da vitrine só roda contra o banco de teste.");
  }
  const pool = new Pool({ connectionString: url, max: 2 });
  return { db: drizzle(pool, { schema }), encerrar: () => pool.end() };
}

/** Apaga tudo o que a fixture cria; não toca nenhuma outra linha. */
export async function removeStorefrontFixture(db: BancoDoDono): Promise<void> {
  const slugs = Object.values(SLUGS_DA_FIXTURE);
  const stores = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.slug, slugs));
  const ids = stores.map((store) => store.id);
  if (ids.length > 0) {
    await db.delete(leads).where(inArray(leads.tenantId, ids));
    await db.delete(properties).where(inArray(properties.tenantId, ids));
    // `tenant_storefronts` sai junto (on delete cascade).
    await db.delete(tenants).where(inArray(tenants.id, ids));
  }
  await db.delete(users).where(eq(users.email, SENTINELAS.captadorEmail));
}

/** Recria a fixture do zero e devolve o que foi gravado. */
export async function createStorefrontFixture(db: BancoDoDono): Promise<StorefrontFixture> {
  await removeStorefrontFixture(db);

  const [captador] = await db
    .insert(users)
    .values({ name: SENTINELAS.collectorName, email: SENTINELAS.captadorEmail })
    .returning({ id: users.id });

  const stores: Partial<StorefrontFixture["stores"]> = {};
  for (const definicao of definicoes()) {
    const { data } = definicao;
    const [tenant] = await db
      .insert(tenants)
      .values({
        slug: data.slug,
        name: data.name,
        agentName: "Agente Fixture",
        supportedSegment: MODALITY.both,
        city: data.city,
        state: data.uf,
        agentWhatsapp: data.whatsapp,
        logo: null,
      })
      .returning({ id: tenants.id });

    await db.insert(tenantStorefronts).values({
      tenantId: tenant.id,
      active: data.ativa,
      layout: data.layout,
      accentColor: data.color,
      font: data.font,
      creci: data.creci,
      legalName: data.razaoSocial,
      headline: data.title,
      about: data.sobre,
      instagram: data.instagram,
      phone: data.telefone,
      address: data.endereco,
    });

    await db.insert(properties).values(
      definicao.properties.map((property) => ({
        tenantId: tenant.id,
        capturedByUserId: captador.id,
        sequence: property.sequencia,
        reference: property.referencia,
        kind: property.kind,
        modality: MODALITY.used,
        status: property.status,
        published: property.publicado,
        featured: property.destaque,
        street: SENTINELAS.logradouro,
        number: SENTINELAS.numero,
        complement: SENTINELAS.complemento,
        neighborhood: property.neighborhood,
        neighborhoodNormalized: property.neighborhood.toLowerCase(),
        city: property.city,
        cityNormalized: property.city.toLowerCase(),
        state: property.uf,
        priceCents: BigInt(property.priceReais) * 100n,
        areaSqm: property.areaM2,
        bedrooms: property.quartos,
        bathrooms: property.banheiros,
        parkingSpots: property.vagas,
        description: property.description,
        photoUrls: property.fotos,
        updatedAt: property.atualizadoEm,
      }))
    );

    // Um lead por loja ativa com nome e telefone sentinela (nunca pode vazar).
    await db.insert(leads).values({
      tenantId: tenant.id,
      name: SENTINELAS.leadName,
      phone: SENTINELAS.leadTelefone,
      status: LEAD_STATUS.engaged,
      firstContactAt: new Date(BASE_TEMPO),
    });

    stores[definicao.key] = {
      ...data,
      id: tenant.id,
      properties: definicao.properties.map((item): FixtureProperty => ({
        referencia: item.referencia,
        kind: item.kind,
        neighborhood: item.neighborhood,
        city: item.city,
        uf: item.uf,
        priceReais: item.priceReais,
        destaque: item.destaque,
        atualizadoEm: item.atualizadoEm,
        fotos: item.fotos,
        description: item.description,
        quartos: item.quartos,
        banheiros: item.banheiros,
        vagas: item.vagas,
        areaM2: item.areaM2,
        visivel: item.visivel,
      })),
    };
  }

  const a = stores.a as FixtureStore;
  const ordemDaA = a.properties
    .filter((property) => property.visivel)
    .sort(
      (x, y) =>
        Number(y.destaque) - Number(x.destaque) ||
        y.atualizadoEm.getTime() - x.atualizadoEm.getTime() ||
        x.referencia.localeCompare(y.referencia)
    )
    .map((property) => property.referencia);

  return {
    stores: stores as StorefrontFixture["stores"],
    ordemDaA,
    sentinelas: Object.values(SENTINELAS),
  };
}
