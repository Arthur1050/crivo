/**
 * Fixture de sentinelas da vitrine (lote-16b — T13; VSEG-01, VSEG-02).
 *
 * Cria, no banco de TESTE, quatro lojas de fixture com imóveis em todos os
 * estados e textos sentinela únicos (captador, endereço, lead e descrições de
 * imóvel que não podem aparecer). O harness HTTP (`vitrine-e2e.ts`) varre o HTML
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
import { leads, properties, tenants, tenantStorefronts, users } from "../src/db/schema";

export type BancoDoDono = NodePgDatabase<typeof schema>;

export const SLUGS_DA_FIXTURE = {
  a: "vt-e2e-a",
  b: "vt-e2e-b",
  c: "vt-e2e-c",
  d: "vt-e2e-d",
} as const;

/** Textos que nenhuma resposta pública pode conter (VSEG AC5, AC4). */
export const SENTINELAS = {
  captadorNome: "CAPTADOR-SENTINELA-NOME-4d9",
  captadorEmail: "captador-sentinela-4d9@sentinela.test",
  logradouro: "LOGRADOURO-SENTINELA-7c1",
  numero: "NUM-SENTINELA-S9317",
  complemento: "COMPL-SENTINELA-BLOCO-Z",
  leadNome: "LEAD-SENTINELA-NOME-81f",
  leadTelefone: "5599912345678",
  vendidoA: "DESCRICAO-SENTINELA-VENDIDO-A",
  reservadoA: "DESCRICAO-SENTINELA-RESERVADO-A",
  despublicadoA: "DESCRICAO-SENTINELA-DESPUBLICADO-A",
  imovelDaInativaC: "DESCRICAO-SENTINELA-LOJA-INATIVA-C",
} as const;

export interface ImovelDaFixture {
  referencia: string;
  tipo: "apartamento" | "casa";
  bairro: string;
  cidade: string;
  uf: string;
  precoReais: number;
  destaque: boolean;
  atualizadoEm: Date;
  fotos: string[] | null;
  descricao: string;
  quartos: number;
  banheiros: number;
  vagas: number;
  areaM2: number;
  /** Visível na vitrine: `disponivel` e publicado, em loja ativa. */
  visivel: boolean;
}

export interface LojaDaFixture {
  id: string;
  slug: string;
  nome: string;
  razaoSocial: string;
  creci: string;
  /** Cor digitada pelo gestor (`#rrggbb`), ou `null` (cor padrão). */
  cor: string | null;
  fonte: "inter" | "montserrat" | "lora" | "playfair";
  layout: "grade" | "editorial";
  ativa: boolean;
  /** Como está gravado no CRM (pode ter máscara). */
  whatsapp: string;
  /** Só dígitos, com o `55` quando a vitrine o acrescenta. */
  whatsappComPrefixo: string;
  titulo: string | null;
  sobre: string | null;
  instagram: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string;
  uf: string;
  imoveis: ImovelDaFixture[];
}

export interface FixtureVitrine {
  lojas: { a: LojaDaFixture; b: LojaDaFixture; c: LojaDaFixture; d: LojaDaFixture };
  /** Referências visíveis da A na ordem do catálogo: destaque, mais recente, referência. */
  ordemDaA: string[];
  /** Todos os textos sentinela (valores de `SENTINELAS`). */
  sentinelas: string[];
}

const BASE_TEMPO = Date.UTC(2026, 0, 1, 12, 0, 0);
const DIA = 24 * 60 * 60 * 1000;

function referenciaDe(tipo: "apartamento" | "casa", sequencia: number): string {
  return `${tipo === "apartamento" ? "AP" : "CA"}-${String(sequencia).padStart(4, "0")}`;
}

function fotosDe(prefixo: string, referencia: string): string[] {
  const ref = referencia.toLowerCase();
  return [
    `https://fotos.vitrine-e2e.test/${prefixo}/${ref}-1.jpg`,
    `https://fotos.vitrine-e2e.test/${prefixo}/${ref}-2.jpg`,
  ];
}

interface Especificacao extends ImovelDaFixture {
  sequencia: number;
  status: "disponivel" | "reservado" | "vendido";
  publicado: boolean;
}

function especificacoesDaA(): Especificacao[] {
  const itens: Especificacao[] = [];
  const destaques = new Set([3, 7, 11]);
  for (let sequencia = 1; sequencia <= 25; sequencia += 1) {
    const tipo = sequencia % 2 === 1 ? "apartamento" : "casa";
    const referencia = referenciaDe(tipo, sequencia);
    // O 20 empata com o 19 em `atualizado_em`: a referência decide (VCAT AC2).
    const dias = sequencia === 20 ? 19 : sequencia;
    itens.push({
      sequencia,
      status: "disponivel",
      publicado: true,
      referencia,
      tipo,
      bairro: `Bairro Alfa ${sequencia}`,
      cidade: "Uberaba",
      uf: "MG",
      precoReais: 150_000 + sequencia * 10_000,
      destaque: destaques.has(sequencia),
      atualizadoEm: new Date(BASE_TEMPO + dias * DIA),
      // O 5 não tem foto (VITEM AC6).
      fotos: sequencia === 5 ? null : fotosDe("a", referencia),
      // O 9 traz HTML na descrição (VITEM Edge Case).
      descricao:
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
    [26, "vendido", true, SENTINELAS.vendidoA],
    [27, "reservado", true, SENTINELAS.reservadoA],
    [28, "disponivel", false, SENTINELAS.despublicadoA],
  ];
  for (const [sequencia, status, publicado, descricao] of invisiveis) {
    const referencia = referenciaDe("apartamento", sequencia);
    itens.push({
      sequencia,
      status,
      publicado,
      referencia,
      tipo: "apartamento",
      bairro: "Bairro Oculto",
      cidade: "Uberaba",
      uf: "MG",
      precoReais: 888_000 + sequencia,
      destaque: false,
      atualizadoEm: new Date(BASE_TEMPO + 40 * DIA),
      fotos: fotosDe("a", referencia),
      descricao,
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
    cidade: "Uberlândia",
    uf: "MG",
    status: "disponivel" as const,
    publicado: true,
    visivel: true,
    bairro: "Bairro Beta Exclusivo",
    quartos: 2,
    banheiros: 1,
    vagas: 1,
    areaM2: 70,
  };
  return [
    {
      ...base, sequencia: 1, referencia: "AP-0001", tipo: "apartamento", precoReais: 987_000,
      destaque: false, atualizadoEm: new Date(BASE_TEMPO + 3 * DIA), fotos: fotosDe("b", "AP-0001"),
      descricao: "Descrição do imóvel AP-0001 da loja B (BETA-EXCLUSIVO).",
    },
    {
      ...base, sequencia: 2, referencia: "CA-0002", tipo: "casa", precoReais: 612_000,
      destaque: false, atualizadoEm: new Date(BASE_TEMPO + 2 * DIA), fotos: fotosDe("b", "CA-0002"),
      descricao: "Descrição do imóvel CA-0002 da loja B (BETA-EXCLUSIVO).",
    },
    {
      ...base, sequencia: 3, referencia: "AP-0003", tipo: "apartamento", precoReais: 745_000,
      destaque: true, atualizadoEm: new Date(BASE_TEMPO + 1 * DIA), fotos: fotosDe("b", "AP-0003"),
      descricao: "Descrição do imóvel AP-0003 da loja B (BETA-EXCLUSIVO).",
    },
    {
      ...base, sequencia: 4, referencia: "CA-0004", tipo: "casa", precoReais: 530_000,
      destaque: false, atualizadoEm: new Date(BASE_TEMPO + 4 * DIA), fotos: fotosDe("b", "CA-0004"),
      descricao: "Descrição do imóvel CA-0004 da loja B (BETA-EXCLUSIVO).",
    },
    {
      ...base, sequencia: 5, referencia: "AP-0005", tipo: "apartamento", precoReais: 999_000,
      destaque: false, atualizadoEm: new Date(BASE_TEMPO + 5 * DIA), fotos: fotosDe("b", "AP-0005"),
      descricao: "Descrição do imóvel vendido da loja B (BETA-EXCLUSIVO).",
      status: "vendido", visivel: false,
    },
  ];
}

function especificacoesDaC(): Especificacao[] {
  return [1, 2].map((sequencia) => {
    const referencia = referenciaDe("apartamento", sequencia);
    return {
      sequencia, status: "disponivel", publicado: true, visivel: false,
      referencia, tipo: "apartamento", bairro: "Bairro Gama", cidade: "Araxá", uf: "MG",
      precoReais: 300_000 + sequencia, destaque: sequencia === 1,
      atualizadoEm: new Date(BASE_TEMPO + sequencia * DIA), fotos: fotosDe("c", referencia),
      descricao: SENTINELAS.imovelDaInativaC, quartos: 2, banheiros: 1, vagas: 1, areaM2: 60,
    } satisfies Especificacao;
  });
}

function especificacoesDaD(): Especificacao[] {
  const estados: Array<[number, Especificacao["status"], boolean]> = [
    [1, "vendido", true],
    [2, "reservado", true],
    [3, "disponivel", false],
  ];
  return estados.map(([sequencia, status, publicado]) => {
    const referencia = referenciaDe("casa", sequencia);
    return {
      sequencia, status, publicado, visivel: false,
      referencia, tipo: "casa", bairro: "Bairro Delta", cidade: "Franca", uf: "SP",
      precoReais: 410_000 + sequencia, destaque: false,
      atualizadoEm: new Date(BASE_TEMPO + sequencia * DIA), fotos: fotosDe("d", referencia),
      descricao: `Descrição do imóvel ${referencia} da loja D (fora do ar).`,
      quartos: 3, banheiros: 2, vagas: 2, areaM2: 120,
    } satisfies Especificacao;
  });
}

interface DefinicaoDaLoja {
  chave: "a" | "b" | "c" | "d";
  dados: Omit<LojaDaFixture, "id" | "imoveis">;
  imoveis: Especificacao[];
}

function definicoes(): DefinicaoDaLoja[] {
  return [
    {
      chave: "a",
      dados: {
        slug: SLUGS_DA_FIXTURE.a, nome: "Imobiliária Alfa", razaoSocial: "Alfa Negócios Imobiliários Ltda",
        creci: "CRECI-MG 11111-J", cor: "#d4145a", fonte: "lora", layout: "grade", ativa: true,
        whatsapp: "(34) 99999-0001", whatsappComPrefixo: "5534999990001",
        titulo: "Imóveis selecionados em Uberaba", sobre: "A Alfa atende famílias de Uberaba desde 2010.",
        instagram: "alfa.imoveis", telefone: "3433330001", endereco: "Rua Alfa, 100, Centro, Uberaba/MG",
        cidade: "Uberaba", uf: "MG",
      },
      imoveis: especificacoesDaA(),
    },
    {
      chave: "b",
      dados: {
        slug: SLUGS_DA_FIXTURE.b, nome: "Imobiliária Beta", razaoSocial: "Beta Corretora de Imóveis Ltda",
        creci: "CRECI-MG 22222-J", cor: "#12a150", fonte: "playfair", layout: "editorial", ativa: true,
        whatsapp: "5534988880002", whatsappComPrefixo: "5534988880002",
        titulo: null, sobre: "A Beta é especialista em apartamentos.",
        instagram: null, telefone: "34988880002", endereco: null,
        cidade: "Uberlândia", uf: "MG",
      },
      imoveis: especificacoesDaB(),
    },
    {
      chave: "c",
      dados: {
        slug: SLUGS_DA_FIXTURE.c, nome: "Imobiliária Gama Inativa", razaoSocial: "Gama Imóveis Ltda",
        creci: "CRECI-MG 33333-J", cor: "#8e24aa", fonte: "montserrat", layout: "grade", ativa: false,
        whatsapp: "34977770003", whatsappComPrefixo: "5534977770003",
        titulo: "Loja inativa", sobre: "Esta vitrine está desativada.",
        instagram: "gama.inativa", telefone: null, endereco: null,
        cidade: "Araxá", uf: "MG",
      },
      imoveis: especificacoesDaC(),
    },
    {
      chave: "d",
      dados: {
        slug: SLUGS_DA_FIXTURE.d, nome: "Imobiliária Delta", razaoSocial: "Delta Participações Ltda",
        creci: "CRECI-SP 44444-J", cor: null, fonte: "inter", layout: "grade", ativa: true,
        whatsapp: "3433330004", whatsappComPrefixo: "553433330004",
        titulo: null, sobre: null, instagram: null, telefone: null, endereco: null,
        cidade: "Franca", uf: "SP",
      },
      imoveis: especificacoesDaD(),
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
export async function removerFixtureVitrine(db: BancoDoDono): Promise<void> {
  const slugs = Object.values(SLUGS_DA_FIXTURE);
  const lojas = await db.select({ id: tenants.id }).from(tenants).where(inArray(tenants.slug, slugs));
  const ids = lojas.map((loja) => loja.id);
  if (ids.length > 0) {
    await db.delete(leads).where(inArray(leads.tenantId, ids));
    await db.delete(properties).where(inArray(properties.tenantId, ids));
    // `tenant_storefronts` sai junto (on delete cascade).
    await db.delete(tenants).where(inArray(tenants.id, ids));
  }
  await db.delete(users).where(eq(users.email, SENTINELAS.captadorEmail));
}

/** Recria a fixture do zero e devolve o que foi gravado. */
export async function criarFixtureVitrine(db: BancoDoDono): Promise<FixtureVitrine> {
  await removerFixtureVitrine(db);

  const [captador] = await db
    .insert(users)
    .values({ name: SENTINELAS.captadorNome, email: SENTINELAS.captadorEmail })
    .returning({ id: users.id });

  const lojas: Partial<FixtureVitrine["lojas"]> = {};
  for (const definicao of definicoes()) {
    const { dados } = definicao;
    const [tenant] = await db
      .insert(tenants)
      .values({
        slug: dados.slug,
        name: dados.nome,
        agentName: "Agente Fixture",
        supportedModality: "ambos",
        city: dados.cidade,
        state: dados.uf,
        agentWhatsapp: dados.whatsapp,
        logo: null,
      })
      .returning({ id: tenants.id });

    await db.insert(tenantStorefronts).values({
      tenantId: tenant.id,
      active: dados.ativa,
      layout: dados.layout,
      accentColor: dados.cor,
      font: dados.fonte,
      creci: dados.creci,
      legalName: dados.razaoSocial,
      headline: dados.titulo,
      about: dados.sobre,
      instagram: dados.instagram,
      phone: dados.telefone,
      address: dados.endereco,
    });

    await db.insert(properties).values(
      definicao.imoveis.map((imovel) => ({
        tenantId: tenant.id,
        capturedByUserId: captador.id,
        sequence: imovel.sequencia,
        reference: imovel.referencia,
        kind: imovel.tipo,
        modality: "usado" as const,
        status: imovel.status,
        published: imovel.publicado,
        featured: imovel.destaque,
        street: SENTINELAS.logradouro,
        number: SENTINELAS.numero,
        complement: SENTINELAS.complemento,
        neighborhood: imovel.bairro,
        neighborhoodNormalized: imovel.bairro.toLowerCase(),
        city: imovel.cidade,
        cityNormalized: imovel.cidade.toLowerCase(),
        state: imovel.uf,
        priceCents: BigInt(imovel.precoReais) * 100n,
        areaSqm: imovel.areaM2,
        bedrooms: imovel.quartos,
        bathrooms: imovel.banheiros,
        parkingSpots: imovel.vagas,
        description: imovel.descricao,
        photoUrls: imovel.fotos,
        updatedAt: imovel.atualizadoEm,
      }))
    );

    // Um lead por loja ativa com nome e telefone sentinela (nunca pode vazar).
    await db.insert(leads).values({
      tenantId: tenant.id,
      name: SENTINELAS.leadNome,
      phone: SENTINELAS.leadTelefone,
      status: "em_qualificacao",
      firstContactAt: new Date(BASE_TEMPO),
    });

    lojas[definicao.chave] = {
      ...dados,
      id: tenant.id,
      imoveis: definicao.imoveis.map((item): ImovelDaFixture => ({
        referencia: item.referencia,
        tipo: item.tipo,
        bairro: item.bairro,
        cidade: item.cidade,
        uf: item.uf,
        precoReais: item.precoReais,
        destaque: item.destaque,
        atualizadoEm: item.atualizadoEm,
        fotos: item.fotos,
        descricao: item.descricao,
        quartos: item.quartos,
        banheiros: item.banheiros,
        vagas: item.vagas,
        areaM2: item.areaM2,
        visivel: item.visivel,
      })),
    };
  }

  const a = lojas.a as LojaDaFixture;
  const ordemDaA = a.imoveis
    .filter((imovel) => imovel.visivel)
    .sort(
      (x, y) =>
        Number(y.destaque) - Number(x.destaque) ||
        y.atualizadoEm.getTime() - x.atualizadoEm.getTime() ||
        x.referencia.localeCompare(y.referencia)
    )
    .map((imovel) => imovel.referencia);

  return {
    lojas: lojas as FixtureVitrine["lojas"],
    ordemDaA,
    sentinelas: Object.values(SENTINELAS),
  };
}
