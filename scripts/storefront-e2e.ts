import { PROPERTY_KIND, PROPERTY_STATUS, STOREFRONT_LAYOUT } from "../src/verticals/real-estate/vocabulary";
/**
 * `npm run vitrine:e2e` — prova da vitrine por HTTP, contra a app rodando
 * (lote-16b — T14; VSEG-02, VCACHE-02, VSEO-01, VCAT-03).
 *
 * Sequência: fixture de sentinelas na branch de TESTE -> `next build` e
 * `next start` da vitrine com o papel `krivo_vitrine` e um segredo aleatório ->
 * asserções nomeadas por `fetch` (sem JS) -> derruba o processo e remove a
 * fixture, mesmo com falha. O stdout do servidor é capturado para a varredura
 * de sentinelas e de segredo.
 *
 * Não rode junto com testes pontuais: usa a branch `test` (L-033). Nada deste
 * arquivo importa de `vitrine/` (AD-044): o harness só fala com a app por HTTP.
 *
 * Cada task de rota acrescenta as próprias asserções com `registrar(...)`, na
 * ordem; as anteriores não mudam. As asserções GLOBAIS (`registrarGlobal`) rodam
 * por último e olham todas as respostas e o stdout acumulados.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { properties } from "../src/verticals/real-estate/schema";
import { tenants } from "../src/db/schema";
import { tenantStorefronts } from "../src/verticals/real-estate/schema";
import {
  abrirBancoDeTeste,
  type BancoDoDono,
  createStorefrontFixture,
  removeStorefrontFixture,
  type StorefrontFixture,
} from "./storefront-fixture";
import { storefrontEnvironment, ambienteDoFilho } from "./storefront-dev";

/** Porta própria: o `vitrine:dev` fica na 3100 e pode estar aberto. */
export const PORTA_E2E = 3110;

export interface RespostaRegistrada {
  metodo: string;
  caminho: string;
  status: number;
  cabecalhos: Headers;
  /** Corpo como texto (vazio para binário). */
  text: string;
}

export interface Contexto {
  base: string;
  segredo: string;
  fixture: StorefrontFixture;
  /** Banco de TESTE como dono: para mudar dados no meio da prova (cache, revalidação). */
  db: BancoDoDono;
  /** Faz a requisição e registra a resposta para as asserções globais. */
  pedir(
    caminho: string,
    opcoes?: {
      metodo?: string;
      cabecalhos?: Record<string, string>;
      corpo?: string;
      binario?: boolean;
      /** Outra instância (ver `iniciarInstancia`); sem isto, a instância principal. */
      base?: string;
    }
  ): Promise<RespostaRegistrada>;
  /**
   * Sobe outra instância da vitrine já construída, na `porta`, com variáveis de
   * ambiente trocadas. É encerrada por `parar()` ou, no mais tardar, no fim da execução.
   */
  iniciarInstancia(
    porta: number,
    sobrescritas: Record<string, string>
  ): Promise<{ base: string; output: () => string; parar: () => void }>;
  /** O que o servidor imprimiu até agora (stdout e stderr). */
  serverOutput(): string;
  /** Todas as respostas já registradas. */
  respostas(): readonly RespostaRegistrada[];
}

type Corpo = (ctx: Contexto) => Promise<void> | void;
interface Asercao {
  name: string;
  corpo: Corpo;
}

const comuns: Asercao[] = [];
const globais: Asercao[] = [];

/** Registra uma asserção nomeada (roda na ordem de registro). */
export function registrar(name: string, corpo: Corpo): void {
  comuns.push({ name, corpo });
}

/** Registra uma asserção que roda depois de todas as outras. */
export function registrarGlobal(name: string, corpo: Corpo): void {
  globais.push({ name, corpo });
}

/** Texto visível de uma página neutra de não encontrado. */
const NEUTRAL_TEXT = "Página não encontrada";

/** Nenhuma loja de fixture pode aparecer numa página neutra (VCAT AC9). */
function assertNoStoreIdentity(ctx: Contexto, text: string): void {
  for (const store of Object.values(ctx.fixture.stores)) {
    assert.ok(!text.includes(store.name), `a página cita a loja "${store.name}"`);
    assert.ok(!text.includes(store.slug), `a página cita o slug "${store.slug}"`);
    assert.ok(!text.includes(store.razaoSocial), `a página cita a razão social "${store.razaoSocial}"`);
  }
}

// ── T14: asserções iniciais ────────────────────────────────────────────────

registrar("T14 rota sem correspondência → 404 neutro, resposta inteira (sem streaming)", async (ctx) => {
  // `identity`: sem compressão, uma resposta inteira traz `Content-Length`; a
  // que sai em streaming (Suspense) não traz e deixa limite pendente no HTML.
  const r = await ctx.pedir("/rota-que-nao-existe", { cabecalhos: { "accept-encoding": "identity" } });
  assert.equal(r.status, 404);
  assert.equal(
    r.cabecalhos.get("content-length"),
    String(Buffer.byteLength(r.text)),
    "a resposta não veio inteira (sem Content-Length)"
  );
  assert.ok(!r.text.includes("<!--$?-->"), "limite Suspense pendente: a resposta saiu em streaming");
  assert.ok(!r.text.includes("$RC("), "script de revelação do Suspense: a resposta saiu em streaming");
  assert.ok(r.text.includes(NEUTRAL_TEXT), "falta a mensagem neutra");
  assert.match(r.text, /<meta name="robots" content="noindex, nofollow"/);
  assertNoStoreIdentity(ctx, r.text);
});

registrar("T14 slug inválido → página de não encontrado neutra, sem marca de loja", async (ctx) => {
  for (const slug of ["Slug_Invalido", "UPPER", "com%20espaco"]) {
    const r = await ctx.pedir(`/c/${slug}`);
    assert.ok(r.text.includes(NEUTRAL_TEXT), `/c/${slug}: falta a mensagem neutra`);
    assert.match(r.text, /<meta name="robots" content="noindex, nofollow"/, `/c/${slug}: sem noindex`);
    assertNoStoreIdentity(ctx, r.text);
  }
});

registrar("T14 POST /api/revalidar com o segredo e um slug válido → 204 sem corpo", async (ctx) => {
  const r = await ctx.pedir("/api/revalidar", {
    metodo: "POST",
    cabecalhos: { authorization: `Bearer ${ctx.segredo}`, "content-type": "application/json" },
    corpo: JSON.stringify({ slug: ctx.fixture.stores.a.slug }),
  });
  assert.equal(r.status, 204);
  assert.equal(r.text, "");
});

registrar("T14 POST /api/revalidar sem segredo, com segredo errado ou vazio → 401", async (ctx) => {
  const corpo = JSON.stringify({ slug: ctx.fixture.stores.a.slug });
  const tentativas: Array<Record<string, string>> = [
    {},
    { authorization: "Bearer segredo-errado" },
    { authorization: `Bearer ${ctx.segredo.slice(0, -1)}x` },
    { authorization: ctx.segredo },
    { authorization: "Bearer " },
  ];
  for (const cabecalhos of tentativas) {
    const r = await ctx.pedir("/api/revalidar", { metodo: "POST", cabecalhos, corpo });
    assert.equal(r.status, 401, `cabeçalhos ${JSON.stringify(Object.keys(cabecalhos))}`);
  }
});

registrar("T14 POST /api/revalidar com corpo inválido → 400", async (ctx) => {
  const cabecalhos = { authorization: `Bearer ${ctx.segredo}` };
  const corpos = ["isto não é json", "{}", JSON.stringify({ slug: "Slug_Invalido" }), JSON.stringify({ slug: "" })];
  for (const corpo of corpos) {
    const r = await ctx.pedir("/api/revalidar", { metodo: "POST", cabecalhos, corpo });
    assert.equal(r.status, 400, corpo);
  }
});

registrar("T14 /api/revalidar com GET, PUT, PATCH e DELETE → 405 com Allow: POST", async (ctx) => {
  for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
    const r = await ctx.pedir("/api/revalidar", {
      metodo,
      cabecalhos: { authorization: `Bearer ${ctx.segredo}` },
      ...(metodo === "GET" ? {} : { corpo: JSON.stringify({ slug: ctx.fixture.stores.a.slug }) }),
    });
    assert.equal(r.status, 405, metodo);
    assert.equal(r.cabecalhos.get("allow"), "POST", metodo);
  }
});

registrar("T14 a revalidação aceita sai no log com prefixo, slug e desfecho", async (ctx) => {
  assert.ok(
    ctx.serverOutput().includes(`[vitrine] revalidar: ${ctx.fixture.stores.a.slug} (204)`),
    "o log da revalidação 204 não apareceu"
  );
});

// ── T16: layout e tema da loja ─────────────────────────────────────────────

/** `<style>` do HTML, na ordem do documento. */
function blocosDeStyle(html: string): string[] {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/** Primeiro valor de uma propriedade CSS num bloco (`--color-accent: ...;`). */
function propertyValue(css: string, propriedade: string): string | null {
  const m = new RegExp(`${propriedade.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1].trim() : null;
}

/** Âncoras do HTML com href e texto interno (sem tags). */
function ancoras(html: string): Array<{ href: string; text: string }> {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].flatMap((m) => {
    const href = /\bhref="([^"]*)"/.exec(m[1])?.[1];
    return href === undefined ? [] : [{ href, text: m[2].replace(/<[^>]*>/g, "").trim() }];
  });
}

/** Marca, nome e cor de nenhuma loja: o slug pedido pode aparecer (a URL é do visitante). */
function assertNoStoreBrand(ctx: Contexto, text: string): void {
  for (const store of Object.values(ctx.fixture.stores)) {
    assert.ok(!text.includes(store.name), `cita a loja "${store.name}"`);
    assert.ok(!text.includes(store.razaoSocial), `cita a razão social "${store.razaoSocial}"`);
    assert.ok(!text.includes(store.creci), `cita o CRECI "${store.creci}"`);
    if (store.color) assert.ok(!text.toLowerCase().includes(store.color), `contém a cor ${store.color}`);
  }
}

registrar("T16 loja inativa (C) e slug sem loja → não encontrado neutro, noindex, sem marca (status registrado)", async (ctx) => {
  for (const slug of [ctx.fixture.stores.c.slug, "vt-e2e-sem-loja"]) {
    const r = await ctx.pedir(`/c/${slug}`);
    // F8 (gate T0): a página sai em streaming, então a doc manda HTTP 200 com a UI de não encontrado.
    assert.equal(r.status, 200, `/c/${slug}: status registrado (F8: 200 esperado pela doc)`);
    assert.ok(r.text.includes(NEUTRAL_TEXT), `/c/${slug}: falta a mensagem neutra`);
    assert.match(r.text, /<meta name="robots" content="noindex, nofollow"/, `/c/${slug}: sem noindex`);
    assertNoStoreBrand(ctx, r.text);
    assert.ok(!r.text.includes("astryx-theme"), `/c/${slug}: carrega o tema de uma loja`);
  }
});

registrar("T16 lojas A, B e D: o HTML sem JS traz o bloco de tema da própria loja (VTEMA AC2, AC7)", async (ctx) => {
  for (const store of [ctx.fixture.stores.a, ctx.fixture.stores.b, ctx.fixture.stores.d]) {
    const r = await ctx.pedir(`/c/${store.slug}`);
    assert.equal(r.status, 200, store.slug);
    const escopo = `@scope ([data-astryx-theme="loja-${store.slug}"])`;
    const blocos = blocosDeStyle(r.text).map((b) => b.trim());

    const dosTokens = blocos.filter((b) => b.startsWith("@layer astryx-theme {"));
    assert.equal(dosTokens.length, 1, `${store.slug}: blocos @layer astryx-theme`);
    assert.ok(dosTokens[0].includes(escopo), `${store.slug}: falta ${escopo} no bloco do tema`);

    const dosResets = blocos.filter((b) => b.startsWith("@layer reset {"));
    assert.equal(dosResets.length, 1, `${store.slug}: blocos @layer reset`);
    assert.ok(dosResets[0].includes(escopo), `${store.slug}: falta ${escopo} no bloco reset`);
    assert.ok(dosResets[0].includes(":where(h1, h2, h3, h4, h5, h6)"), `${store.slug}: falta o seletor de títulos`);

    assert.match(
      r.text,
      new RegExp(`<[a-z]+\\b[^>]*data-astryx-theme="loja-${store.slug}"[^>]*>`),
      `${store.slug}: falta o wrapper do tema`
    );
  }
});

registrar("T16 o HTML de uma loja não carrega o tema de outra", async (ctx) => {
  const { a, b, d } = ctx.fixture.stores;
  const pageA = await ctx.pedir(`/c/${a.slug}`);
  for (const outra of [b, d]) {
    assert.ok(!pageA.text.includes(`loja-${outra.slug}`), `o HTML de ${a.slug} cita loja-${outra.slug}`);
  }
});

registrar("T16 --color-accent de A, B e D é diferente entre si, sem comparar com hex literal (AD-046)", async (ctx) => {
  const acentos: Record<string, string> = {};
  for (const store of [ctx.fixture.stores.a, ctx.fixture.stores.b, ctx.fixture.stores.d]) {
    const r = await ctx.pedir(`/c/${store.slug}`);
    const bloco = blocosDeStyle(r.text).find((b) => b.trim().startsWith("@layer astryx-theme {"));
    assert.ok(bloco, `${store.slug}: sem bloco de tema`);
    const acento = propertyValue(bloco, "--color-accent");
    assert.ok(acento, `${store.slug}: sem --color-accent no bloco do tema`);
    acentos[store.slug] = acento;
  }
  const { a, b, d } = ctx.fixture.stores;
  assert.notEqual(acentos[a.slug], acentos[b.slug], "accent de A = accent de B");
  assert.notEqual(acentos[a.slug], acentos[d.slug], "accent de A = accent da loja sem cor (D)");
  assert.notEqual(acentos[b.slug], acentos[d.slug], "accent de B = accent da loja sem cor (D)");
});

registrar("T16 --font-family-body e --font-family-heading seguem a fonte de cada loja (VTEMA AC3)", async (ctx) => {
  const corpos: Record<string, string> = {};
  for (const store of [ctx.fixture.stores.a, ctx.fixture.stores.b, ctx.fixture.stores.d]) {
    const r = await ctx.pedir(`/c/${store.slug}`);
    const bloco = blocosDeStyle(r.text).find((b) => b.trim().startsWith("@layer astryx-theme {")) ?? "";
    const esperada = `var(--font-${store.font})`;
    assert.equal(propertyValue(bloco, "--font-family-body"), esperada, `${store.slug}: corpo`);
    assert.equal(propertyValue(bloco, "--font-family-heading"), esperada, `${store.slug}: títulos`);
    corpos[store.slug] = esperada;
  }
  const { a, b } = ctx.fixture.stores;
  assert.notEqual(corpos[a.slug], corpos[b.slug], "A e B com a mesma fonte");
});

registrar("T16 rodapé com razão social, CRECI e aviso em A, B e D; contatos só quando a loja os tem (VLEGAL AC1–AC4)", async (ctx) => {
  const { a, b, d } = ctx.fixture.stores;
  const aviso = "Preços e disponibilidade sujeitos a alteração sem aviso prévio.";
  for (const store of [a, b, d]) {
    const r = await ctx.pedir(`/c/${store.slug}`);
    assert.ok(r.text.includes(store.razaoSocial), `${store.slug}: razão social`);
    assert.ok(r.text.includes(store.creci), `${store.slug}: CRECI`);
    assert.ok(r.text.includes(aviso), `${store.slug}: aviso`);
  }

  const pageA = (await ctx.pedir(`/c/${a.slug}`)).text;
  const linksA = ancoras(pageA).map((x) => x.href);
  assert.ok(pageA.includes(a.endereco ?? ""), "A: endereço");
  assert.ok(linksA.includes(`https://instagram.com/${a.instagram}`), "A: link do Instagram");
  assert.ok(linksA.includes(`tel:+55${a.telefone}`), "A: link do telefone com o prefixo 55");

  const pageB = (await ctx.pedir(`/c/${b.slug}`)).text;
  const linksB = ancoras(pageB).map((x) => x.href);
  assert.ok(!linksB.some((href) => href.includes("instagram.com")), "B (sem Instagram) mostra o link");
  assert.ok(linksB.includes(`tel:+55${b.telefone}`), "B: telefone de 11 dígitos recebe 55");
  assert.ok(!pageB.includes("Rua Alfa"), "B mostra o endereço da A");
});

registrar("T16 o botão de WhatsApp do cabeçalho abre o wa.me com a mensagem de catálogo (VCAT AC12)", async (ctx) => {
  for (const store of [ctx.fixture.stores.a, ctx.fixture.stores.b, ctx.fixture.stores.d]) {
    const r = await ctx.pedir(`/c/${store.slug}`);
    const botao = ancoras(r.text).find((x) => x.text.includes("Falar no WhatsApp"));
    assert.ok(botao, `${store.slug}: sem botão "Falar no WhatsApp"`);
    const url = new URL(botao.href);
    assert.equal(url.origin + url.pathname, `https://wa.me/${store.whatsappComPrefixo}`, store.slug);
    assert.equal(
      url.searchParams.get("text"),
      `Olá! Vi a vitrine da ${store.name} e gostaria de atendimento.`,
      store.slug
    );
  }
});

// ── T17: imóvel indisponível ───────────────────────────────────────────────

/**
 * HTML sem `<script>`: o payload RSC repete o texto das páginas, então um
 * `includes` no corpo inteiro passaria mesmo com a UI só montada no cliente.
 */
function htmlVisivel(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
}

registrar("T17 páginas neutras (loja inativa, sem loja, slug inválido) estão no HTML sem JS, sem render no cliente", async (ctx) => {
  for (const slug of [ctx.fixture.stores.c.slug, "vt-e2e-sem-loja", "Slug_Invalido"]) {
    const r = await ctx.pedir(`/c/${slug}`);
    const visivel = htmlVisivel(r.text);
    assert.ok(visivel.includes(NEUTRAL_TEXT), `/c/${slug}: a mensagem neutra não está no HTML visível`);
    assert.ok(!r.text.includes("<!--$!-->"), `/c/${slug}: o limite caiu para render no cliente`);
    assertNoStoreBrand(ctx, visivel);
  }
});

registrar("T17 referência que não existe na loja A → não encontrado com a marca da A, o link do catálogo e noindex (VITEM AC5)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  for (const ref of ["ap-9999", "REF_INVALIDA$"]) {
    const r = await ctx.pedir(`/c/${a.slug}/imovel/${encodeURIComponent(ref)}`);
    const visivel = htmlVisivel(r.text);
    assert.equal(r.status, 200, `${ref}: status registrado (F8: 200 pela doc)`);
    assert.ok(visivel.includes("Este imóvel não está mais disponível."), `${ref}: falta a mensagem no HTML visível`);
    assert.ok(!r.text.includes("<!--$!-->"), `${ref}: o limite caiu para render no cliente`);
    const voltar = ancoras(visivel).find((x) => x.text.includes("Ver todos os imóveis"));
    assert.equal(
      voltar?.href,
      `/c/${a.slug}`,
      `${ref}: link do catálogo (âncoras: ${JSON.stringify(ancoras(visivel))})`
    );
    assert.ok(visivel.includes(a.creci), `${ref}: CRECI da loja A`);
    assert.ok(visivel.includes(a.razaoSocial), `${ref}: razão social da loja A`);
    assert.match(r.text, /<meta name="robots" content="noindex/, `${ref}: sem noindex`);
    assert.match(visivel, new RegExp(`data-astryx-theme="loja-${a.slug}"`), `${ref}: sem a marca da loja A`);
    assert.ok(!visivel.includes(b.name), `${ref}: cita a loja B`);
  }
});

// ── T18: vitrine indisponível ──────────────────────────────────────────────

registrar("T18 banco inalcançável → a mensagem sai no HTML, sem host, senha, SQL nem pilha (VSEG-02)", async (ctx) => {
  const host = "banco-inalcancavel.invalid";
  const password = "senha-de-teste-inalcancavel";
  const outra = await ctx.iniciarInstancia(PORTA_E2E + 1, {
    "VITRINE_DATABASE_URL": `postgresql://krivo_vitrine:${password}@${host}:5432/neondb`,
  });
  try {
    const store = ctx.fixture.stores.a.slug;
    for (const caminho of [`/c/${store}`, `/c/${store}/imovel/ap-0001`]) {
      const r = await ctx.pedir(caminho, { base: outra.base });
      const visivel = htmlVisivel(r.text);
      assert.equal(r.status, 200, `${caminho}: status (streaming → 200 pela doc)`);
      assert.ok(visivel.includes("Vitrine temporariamente indisponível."), `${caminho}: falta a mensagem no HTML visível`);
      assert.ok(!r.text.includes("<!--$!-->"), `${caminho}: o limite caiu para render no cliente`);
      assert.match(r.text, /<meta name="robots" content="noindex/, `${caminho}: sem noindex`);
      for (const proibido of [host, password, "ENOTFOUND", "getaddrinfo", "node_modules", "vitrine\".\"lojas", "select \""]) {
        assert.ok(!r.text.includes(proibido), `${caminho}: o HTML contém "${proibido}"`);
      }
      assert.ok(!/\n\s+at\s/.test(r.text), `${caminho}: o HTML contém pilha de chamadas`);
      assertNoStoreBrand(ctx, visivel);
    }
    const log = outra.output();
    assert.match(log, /\[vitrine\] erro \(loja\): /, "o log não registrou a falha com o prefixo");
    for (const proibido of [host, password, "vitrine\".\"lojas", "select \""]) {
      assert.ok(!log.includes(proibido), `o log contém "${proibido}"`);
    }
  } finally {
    outra.parar();
  }
});

// ── T21: página de catálogo ────────────────────────────────────────────────

const UA_WHATSAPP = "WhatsApp/2.23.20.0 A";

/** Referências dos imóveis nos links `/c/<slug>/imovel/<ref>`, na ordem do documento, sem repetir. */
function referenciasNosLinks(html: string, slug: string): string[] {
  const prefixo = `/c/${slug}/imovel/`;
  const vistas: string[] = [];
  for (const { href } of ancoras(html)) {
    if (!href.startsWith(prefixo)) continue;
    const ref = href.slice(prefixo.length);
    if (!vistas.includes(ref)) vistas.push(ref);
  }
  return vistas;
}

/** Trecho do HTML entre dois marcadores de texto (o início de `de` até o início de `ate`). */
function trecho(html: string, de: string, ate?: string): string {
  const start = html.indexOf(de);
  if (start < 0) return "";
  const end = ate ? html.indexOf(ate, start + de.length) : -1;
  return end < 0 ? html.slice(start) : html.slice(start, end);
}

/** Ordem do catálogo pela spec (VCAT AC2): destaque, mais recente, referência. */
function ordemDoCatalogo(properties: ReadonlyArray<{ referencia: string; destaque: boolean; atualizadoEm: Date; visivel: boolean }>) {
  return properties
    .filter((property) => property.visivel)
    .sort(
      (x, y) =>
        Number(y.destaque) - Number(x.destaque) ||
        y.atualizadoEm.getTime() - x.atualizadoEm.getTime() ||
        x.referencia.localeCompare(y.referencia)
    )
    .map((property) => property.referencia.toLowerCase());
}

/** Valor de `content` da meta `og:*`/`twitter:*` no `<head>`; `null` se não houver. */
function metaDoHead(html: string, name: string): string | null {
  const headEnd = html.indexOf("</head>");
  const head = headEnd < 0 ? "" : html.slice(0, headEnd);
  for (const meta of head.split("<meta ").slice(1)) {
    const tag = meta.slice(0, meta.indexOf(">"));
    const key = /(?:property|name)="([^"]*)"/.exec(tag)?.[1];
    if (key === name) return /content="([^"]*)"/.exec(tag)?.[1] ?? null;
  }
  return null;
}

registrar("T21 A: 24 imóveis na página 1 e 1 na página 2, na ordem destaque → recente → referência (VCAT AC2, AC3)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const esperada = ordemDoCatalogo(a.properties);
  assert.equal(esperada.length, 25);

  const p1 = htmlVisivel((await ctx.pedir(`/c/${a.slug}`)).text);
  const grade1 = referenciasNosLinks(trecho(p1, ">Imóveis disponíveis<"), a.slug);
  assert.deepEqual(grade1, esperada.slice(0, 24), "página 1: ordem e conteúdo da grade");
  const faixa = referenciasNosLinks(trecho(p1, ">Destaques<", ">Imóveis disponíveis<"), a.slug);
  assert.deepEqual(faixa, esperada.slice(0, 3), "faixa Destaques: os 3 destaques, na mesma ordem");

  const p2 = htmlVisivel((await ctx.pedir(`/c/${a.slug}?pagina=2`)).text);
  assert.deepEqual(referenciasNosLinks(p2, a.slug), esperada.slice(24), "página 2: só o 25º");
  assert.ok(!p2.includes(">Destaques<"), "a faixa Destaques aparece fora da página 1");
});

registrar("T21 ?pagina= inválida → página 1; acima da última → última (VCAT AC4, AC5)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const esperada = ordemDoCatalogo(a.properties);
  for (const page of ["abc", "0", "-1", "1.5", ""]) {
    const html = htmlVisivel((await ctx.pedir(`/c/${a.slug}?pagina=${encodeURIComponent(page)}`)).text);
    const grade = referenciasNosLinks(trecho(html, ">Imóveis disponíveis<"), a.slug);
    assert.deepEqual(grade, esperada.slice(0, 24), `pagina=${JSON.stringify(page)}`);
  }
  const ultima = htmlVisivel((await ctx.pedir(`/c/${a.slug}?pagina=99`)).text);
  assert.deepEqual(referenciasNosLinks(ultima, a.slug), esperada.slice(24), "pagina=99");
});

registrar("T21 imóvel vendido, reservado e despublicado não aparece em nenhuma página da A (VSEG AC4)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const ocultos = a.properties.filter((property) => !property.visivel).map((property) => property.referencia.toLowerCase());
  assert.equal(ocultos.length, 3);
  for (const caminho of [`/c/${a.slug}`, `/c/${a.slug}?pagina=2`]) {
    const html = htmlVisivel((await ctx.pedir(caminho)).text).toLowerCase();
    for (const ref of ocultos) assert.ok(!html.includes(ref), `${caminho}: lista ${ref}`);
    for (const property of a.properties.filter((x) => !x.visivel)) {
      assert.ok(!html.includes(`r$ ${property.priceReais.toLocaleString("pt-BR")}`), `${caminho}: mostra o preço de ${property.referencia}`);
    }
  }
});

registrar("T21 nenhuma página da A traz imóvel, bairro, preço ou foto da B, e vice-versa (VSEG AC3)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const paginasDaA = ["", "?pagina=2"].map((q) => `/c/${a.slug}${q}`);
  const exclusivosDaB = ["Bairro Beta Exclusivo", "BETA-EXCLUSIVO", "fotos.vitrine-e2e.test/b/"];
  for (const property of b.properties) exclusivosDaB.push(`R$ ${property.priceReais.toLocaleString("pt-BR")}`);
  for (const caminho of paginasDaA) {
    const html = (await ctx.pedir(caminho)).text;
    for (const marca of exclusivosDaB) assert.ok(!html.includes(marca), `${caminho} contém "${marca}" da B`);
  }

  const pageB = (await ctx.pedir(`/c/${b.slug}`)).text;
  for (const marca of ["Bairro Alfa", "fotos.vitrine-e2e.test/a/", "R$ 160.000", "R$ 400.000"]) {
    assert.ok(!pageB.includes(marca), `a página da B contém "${marca}" da A`);
  }

  // A referência AP-0001 existe nas duas lojas: cada uma mostra o preço da própria.
  const pageA2 = htmlVisivel((await ctx.pedir(`/c/${a.slug}?pagina=2`)).text);
  assert.ok(pageA2.includes("R$ 160.000"), "A: preço de AP-0001 da A");
  assert.ok(htmlVisivel(pageB).includes("R$ 987.000"), "B: preço de AP-0001 da B");
});

registrar("T21 A sai em grade e B em editorial, cada uma pelos marcadores do próprio template (VTEMA AC4, AC5)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const htmlA = htmlVisivel((await ctx.pedir(`/c/${a.slug}`)).text);
  const htmlB = htmlVisivel((await ctx.pedir(`/c/${b.slug}`)).text);

  assert.ok(htmlA.includes("astryx-clickable-card"), "A (grade): sem cards");
  assert.ok(!htmlA.includes("astryx-list-item"), "A (grade): tem linhas de lista");
  assert.ok(htmlB.includes("astryx-list-item"), "B (editorial): sem linhas de lista");
  assert.ok(!htmlB.includes("astryx-clickable-card"), "B (editorial): tem cards");

  // Cabeçalho do editorial: a foto do primeiro destaque (AP-0003) aparece no cabeçalho e na linha.
  const primeiroDestaque = ordemDoCatalogo(b.properties)[0];
  const foto = `https://fotos.vitrine-e2e.test/b/${primeiroDestaque}-1.jpg`;
  assert.equal(htmlB.split(foto).length - 1, 2, "B: foto do destaque no cabeçalho e na linha");
  assert.equal(htmlB.split("Destaque").length - 1 >= 1, true, "B: marcador Destaque na linha");

  // Cada loja mantém o tema do layout em volta do catálogo (VTEMA AC7).
  for (const store of [a, b]) {
    const bruto = (await ctx.pedir(`/c/${store.slug}`)).text;
    const blocos = blocosDeStyle(bruto).map((x) => x.trim()).filter((x) => x.startsWith("@layer astryx-theme {"));
    assert.equal(blocos.length, 1, `${store.slug}: blocos de tema no catálogo`);
    assert.ok(blocos[0].includes(`@scope ([data-astryx-theme="loja-${store.slug}"])`), `${store.slug}: escopo`);
  }
});

registrar("T21 cards e linhas trazem foto com lazy, no-referrer e alt; imóvel sem foto mantém a moldura (VITEM AC6, AC8)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const html = htmlVisivel((await ctx.pedir(`/c/${a.slug}`)).text);
  const tag = html.split("<img ").map((t) => t.slice(0, t.indexOf(">"))).find((t) => t.includes("/a/ap-0025-1.jpg"));
  assert.ok(tag, "foto de AP-0025 não encontrada");
  assert.match(tag, /loading="lazy"/);
  assert.match(tag, /referrerPolicy="no-referrer"/i);
  assert.match(tag, /alt="Apartamento em Bairro Alfa 25, foto 1 de 2"/);
  const semFoto = a.properties.filter((property) => property.visivel && property.fotos === null).length;
  assert.equal(html.split("Sem foto").length - 1, semFoto, "espaço reservado do imóvel sem foto");
});

registrar("T21 catálogo sem imóvel visível (D) → estado vazio com WhatsApp e HTTP 200 (VCAT AC7)", async (ctx) => {
  const d = ctx.fixture.stores.d;
  const r = await ctx.pedir(`/c/${d.slug}`);
  const html = htmlVisivel(r.text);
  assert.equal(r.status, 200);
  assert.ok(html.includes("Nenhum imóvel disponível no momento."), "falta a mensagem de catálogo vazio");
  assert.ok(!html.includes("astryx-clickable-card") && !html.includes("astryx-list-item"), "mostra imóvel");
  // A descrição nos metadados ("Imóveis disponíveis em <cidade>/<uf>") não conta: só o título da seção.
  assert.ok(!html.includes(">Imóveis disponíveis<"), "mostra a seção de imóveis");
  const botoes = ancoras(html).filter((x) => x.text.includes("Falar no WhatsApp"));
  assert.equal(botoes.length, 2, "botões de WhatsApp: cabeçalho e estado vazio");
  for (const botao of botoes) {
    const url = new URL(botao.href);
    assert.equal(url.origin + url.pathname, `https://wa.me/${d.whatsappComPrefixo}`);
    assert.equal(url.searchParams.get("text"), `Olá! Vi a vitrine da ${d.name} e gostaria de atendimento.`);
  }
});

registrar("T21 paginação em português, só quando há mais de uma página (VCAT AC3, Edge Case de 24/25)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const pageA = htmlVisivel((await ctx.pedir(`/c/${a.slug}`)).text);
  assert.ok(pageA.includes('aria-label="Paginação"'), "A: sem a navegação em português");
  assert.ok(pageA.includes('aria-label="Ir para a próxima página"'), "A: botão de próxima página");
  assert.ok(!pageA.includes("Go to") && !pageA.includes('aria-label="Pagination"'), "A: texto em inglês da lib");

  const pageB = htmlVisivel((await ctx.pedir(`/c/${b.slug}`)).text);
  assert.ok(!pageB.includes("astryx-pagination"), "B (4 imóveis) mostra paginação");
});

registrar("T21 og:* do catálogo no <head> para o user-agent do WhatsApp (VOG AC1, AC2, AC6)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const cabecalhos = { "user-agent": UA_WHATSAPP };

  const ra = await ctx.pedir(`/c/${a.slug}`, { cabecalhos });
  assert.equal(metaDoHead(ra.text, "og:title"), `${a.name} — imóveis`);
  assert.equal(metaDoHead(ra.text, "og:description"), a.title, "descrição = título institucional");
  assert.equal(metaDoHead(ra.text, "og:url"), `${ctx.base}/c/${a.slug}`, "URL absoluta a partir de VITRINE_PUBLIC_URL");
  assert.equal(metaDoHead(ra.text, "twitter:card"), "summary_large_image");
  assert.equal(metaDoHead(ra.text, "twitter:title"), `${a.name} — imóveis`);
  assert.ok(ra.text.includes(`<title>${a.name} — imóveis</title>`), "<title>");

  const rb = await ctx.pedir(`/c/${b.slug}`, { cabecalhos });
  assert.equal(metaDoHead(rb.text, "og:title"), `${b.name} — imóveis`);
  assert.equal(metaDoHead(rb.text, "og:description"), "Imóveis disponíveis em Uberlândia/MG", "sem título institucional");
});

registrar("T21 cache: a mudança no banco só aparece depois do aviso certo; a loja B segue do cache (VCACHE AC8, AC9)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const avisar = (slug: string, segredo: string) =>
    ctx.pedir("/api/revalidar", {
      metodo: "POST",
      cabecalhos: { authorization: `Bearer ${segredo}` },
      corpo: JSON.stringify({ slug }),
    });
  const price = (html: string, value: string) => htmlVisivel(html).includes(value);

  // Estado de partida: as duas lojas recém-lidas do banco.
  assert.equal((await avisar(a.slug, ctx.segredo)).status, 204);
  assert.equal((await avisar(b.slug, ctx.segredo)).status, 204);
  assert.ok(price((await ctx.pedir(`/c/${a.slug}`)).text, "R$ 400.000"), "A: preço de partida de AP-0025");
  assert.ok(price((await ctx.pedir(`/c/${b.slug}`)).text, "R$ 530.000"), "B: preço de partida de CA-0004");

  // O banco muda nas duas lojas, sem aviso.
  await ctx.db
    .update(properties)
    .set({ priceCents: 777_000n * 100n })
    .where(and(eq(properties.tenantId, a.id), eq(properties.reference, "AP-0025")));
  await ctx.db
    .update(properties)
    .set({ priceCents: 888_000n * 100n })
    .where(and(eq(properties.tenantId, b.id), eq(properties.reference, "CA-0004")));

  const antigaA = (await ctx.pedir(`/c/${a.slug}`)).text;
  assert.ok(price(antigaA, "R$ 400.000") && !price(antigaA, "R$ 777.000"), "A sem aviso: tem de seguir do cache");

  // Segredo errado: 401 e a página continua a antiga.
  assert.equal((await avisar(a.slug, "segredo-errado")).status, 401);
  const aindaAntiga = (await ctx.pedir(`/c/${a.slug}`)).text;
  assert.ok(price(aindaAntiga, "R$ 400.000") && !price(aindaAntiga, "R$ 777.000"), "A com segredo errado");

  // Aviso certo para A: A reflete o banco; B, que não foi avisada, segue do cache.
  assert.equal((await avisar(a.slug, ctx.segredo)).status, 204);
  const novaA = (await ctx.pedir(`/c/${a.slug}`)).text;
  assert.ok(price(novaA, "R$ 777.000") && !price(novaA, "R$ 400.000"), "A depois do aviso: tem de refletir o banco");
  const pageB = (await ctx.pedir(`/c/${b.slug}`)).text;
  assert.ok(price(pageB, "R$ 530.000") && !price(pageB, "R$ 888.000"), "B não foi avisada: tem de seguir do cache");

  // O aviso da B, por fim, a atualiza.
  assert.equal((await avisar(b.slug, ctx.segredo)).status, 204);
  assert.ok(price((await ctx.pedir(`/c/${b.slug}`)).text, "R$ 888.000"), "B depois do próprio aviso");
});

registrar("R15 serverless: com a memória da instância efêmera, a leitura sai do cache remoto e não consulta o banco a cada visita; o aviso a derruba (AD-048)", async (ctx) => {
  // A Vercel não guarda o `use cache` comum entre invocações; o `use cache: remote`
  // vai para o cache que a plataforma injeta. A pré-carga imita os dois handlers.
  const preCarga = path.join(__dirname, "storefront-e2e-platform.cjs").replace(/\\/g, "/");
  const outra = await ctx.iniciarInstancia(PORTA_E2E + 4, { NODE_OPTIONS: `--require "${preCarga}"` });
  const { a } = ctx.fixture.stores;
  const caminhos = [`/c/${a.slug}/imovel/${ctx.fixture.ordemDaA[0].toLowerCase()}`, `/c/${a.slug}`];
  /** Sessões do papel da vitrine que rodaram consulta durante `acao` (L-090). */
  const sessoesQueConsultaram = async (acao: () => Promise<unknown>): Promise<number> => {
    const { rows: antes } = await ctx.db.execute<{ t: string }>(sql`select clock_timestamp()::text as t`);
    await acao();
    await new Promise((r) => setTimeout(r, 400));
    const { rows } = await ctx.db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_stat_activity
          where usename = 'krivo_vitrine' and query_start > ${antes[0].t}::timestamptz`
    );
    return rows[0].n;
  };
  const visitar = (caminho: string) =>
    sessoesQueConsultaram(async () => assert.equal((await ctx.pedir(caminho, { base: outra.base })).status, 200));
  try {
    assert.ok(outra.output().includes("[plataforma] handlers injetados"), "a pré-carga da plataforma não rodou");
    for (const caminho of caminhos) {
      assert.ok((await visitar(caminho)) > 0, `${caminho}: a 1ª visita tem de ler o banco (prova que a contagem enxerga a consulta)`);
      for (let visita = 2; visita <= 4; visita += 1) {
        assert.equal(await visitar(caminho), 0, `${caminho}: a visita ${visita} consultou o banco (o cache não reteve)`);
      }
    }
    const output = outra.output();
    assert.ok(!output.includes("[plataforma] default.get"), "a leitura passou pelo handler do `use cache` comum (memória efêmera)");
    assert.match(output, /\[plataforma\] remote\.get HIT/, "nenhuma leitura veio do cache remoto");
    assert.match(
      output,
      new RegExp(`\\[plataforma\\] remote\\.set tags=[^\\n]*tenant:${a.slug}:catalogo[^\\n]* revalidate=60 expire=300`),
      "a entrada remota não leva a tag da loja e o perfil vitrine (60/300 s)"
    );

    // O aviso do CRM, recebido por esta instância, derruba a entrada remota.
    const aviso = await ctx.pedir("/api/revalidar", {
      base: outra.base,
      metodo: "POST",
      cabecalhos: { authorization: `Bearer ${ctx.segredo}` },
      corpo: JSON.stringify({ slug: a.slug }),
    });
    assert.equal(aviso.status, 204);
    assert.ok(outra.output().includes(`[plataforma] remote.updateTags tenant:${a.slug}:catalogo`), "o aviso não chegou ao cache remoto");
    assert.ok((await visitar(caminhos[0])) > 0, "depois do aviso, a próxima visita tem de ler o banco");
    assert.equal(await visitar(caminhos[0]), 0, "depois da releitura, a visita seguinte volta a sair do cache");
  } finally {
    outra.parar();
  }
});

// ── T23: página de imóvel ──────────────────────────────────────────────────

/** Valor que acompanha um rótulo de atributo do imóvel (`>Quartos</span>` → texto do `<span>` seguinte). */
function attributeValue(html: string, rotulo: string): string | null {
  const marca = `>${rotulo}</span>`;
  const start = html.indexOf(marca);
  if (start < 0) return null;
  const resto = html.slice(start + marca.length);
  const abre = resto.indexOf(">");
  const fecha = resto.indexOf("</span>", abre);
  return abre < 0 || fecha < 0 ? null : resto.slice(abre + 1, fecha);
}

/** Tags `<img>` do HTML visível, cada uma só com o próprio conteúdo. */
function imagens(html: string): string[] {
  return html.split("<img ").slice(1).map((t) => t.slice(0, t.indexOf(">")));
}

registrar("T23 imóvel visível da A: 200 com os campos de VITEM AC1 e a descrição como texto", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const property = a.properties.find((x) => x.referencia === "AP-0001");
  assert.ok(property?.fotos, "AP-0001 da fixture precisa ter foto");
  const r = await ctx.pedir(`/c/${a.slug}/imovel/ap-0001`);
  const html = htmlVisivel(r.text);
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes("<!--$!-->"), "o limite caiu para render no cliente");
  assert.ok(html.includes(">Apartamento em Bairro Alfa 1<"), "tipo e bairro");
  assert.ok(html.includes(">Uberaba/MG<"), "cidade e UF");
  assert.ok(html.includes(">AP-0001 · Usado<"), "referência e modalidade");
  assert.ok(html.includes(`>R$ ${property.priceReais.toLocaleString("pt-BR")}<`), "preço");
  assert.equal(attributeValue(html, "Quartos"), String(property.quartos));
  assert.equal(attributeValue(html, "Banheiros"), String(property.banheiros));
  assert.equal(attributeValue(html, "Vagas"), String(property.vagas));
  assert.equal(attributeValue(html, "Área"), `${property.areaM2} m²`);
  assert.ok(html.includes(`>${property.description}<`), "descrição");
  for (const foto of property.fotos) assert.ok(html.includes(foto), `foto ${foto}`);
  assert.match(r.text, /<meta name="robots" content="noindex/, "sem noindex");
  assert.match(html, new RegExp(`data-astryx-theme="loja-${a.slug}"`), "sem a marca da loja A");
  assert.ok(html.includes(a.creci) && html.includes(a.razaoSocial), "rodapé legal da loja");
});

registrar("T23 os quatro atributos do imóvel vêm cada um do próprio campo (valores todos distintos)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const property = a.properties.find((x) => x.referencia === "CA-0006");
  assert.ok(property, "CA-0006 da fixture");
  const valores = [property.quartos, property.banheiros, property.vagas, property.areaM2];
  assert.equal(new Set(valores).size, 4, "a fixture precisa de valores distintos para discriminar a troca de campo");
  const html = htmlVisivel((await ctx.pedir(`/c/${a.slug}/imovel/ca-0006`)).text);
  assert.equal(attributeValue(html, "Quartos"), String(property.quartos));
  assert.equal(attributeValue(html, "Banheiros"), String(property.banheiros));
  assert.equal(attributeValue(html, "Vagas"), String(property.vagas));
  assert.equal(attributeValue(html, "Área"), `${property.areaM2} m²`);
});

registrar("T23 AP-0001 e ap-0001 abrem a mesma página, com og:url em minúsculas (VITEM AC2)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const cabecalhos = { "user-agent": UA_WHATSAPP };
  const minuscula = await ctx.pedir(`/c/${a.slug}/imovel/ap-0001`, { cabecalhos });
  const maiuscula = await ctx.pedir(`/c/${a.slug}/imovel/AP-0001`, { cabecalhos });
  assert.equal(maiuscula.status, 200);
  for (const r of [minuscula, maiuscula]) {
    const html = htmlVisivel(r.text);
    assert.ok(html.includes(">Apartamento em Bairro Alfa 1<"), "tipo e bairro");
    assert.ok(html.includes(">R$ 160.000<"), "preço");
    assert.equal(metaDoHead(r.text, "og:url"), `${ctx.base}/c/${a.slug}/imovel/ap-0001`);
  }
  // Os links que a vitrine gera usam minúsculas (VITEM AC2): o do catálogo é o canônico.
  const catalogo = await ctx.pedir(`/c/${a.slug}?pagina=2`);
  assert.ok(referenciasNosLinks(htmlVisivel(catalogo.text), a.slug).includes("ap-0001"));
});

registrar("T23 vendido, reservado e despublicado pela URL direta → não encontrado, sem preço nem descrição (VSEG AC4)", async (ctx) => {
  const { a, b, d } = ctx.fixture.stores;
  const ocultos = [
    ...a.properties.filter((x) => !x.visivel).map((x) => ({ store: a, property: x })),
    ...b.properties.filter((x) => !x.visivel).map((x) => ({ store: b, property: x })),
    ...d.properties.filter((x) => !x.visivel).map((x) => ({ store: d, property: x })),
  ];
  assert.equal(ocultos.length, 3 + 1 + 3);
  for (const { store, property } of ocultos) {
    const ref = property.referencia.toLowerCase();
    const r = await ctx.pedir(`/c/${store.slug}/imovel/${ref}`, { cabecalhos: { "user-agent": UA_WHATSAPP } });
    const html = htmlVisivel(r.text);
    const onde = `${store.slug}/${ref}`;
    assert.equal(r.status, 200, `${onde}: status registrado (F8: 200 pela doc)`);
    assert.ok(html.includes("Este imóvel não está mais disponível."), `${onde}: falta a mensagem`);
    assert.ok(!r.text.includes(property.description), `${onde}: contém a descrição`);
    assert.ok(!r.text.includes(`R$ ${property.priceReais.toLocaleString("pt-BR")}`), `${onde}: contém o preço`);
    assert.ok(!r.text.includes(`/${ref}-1.jpg`), `${onde}: contém foto do imóvel`);
    // F4 (VOG AC1, decisão do usuário): a página de imóvel indisponível é de loja e leva os
    // metadados do catálogo; que nada do imóvel entra neles é provado pela V17.
    assert.equal(metaDoHead(r.text, "og:title"), `${store.name} — imóveis`, `${onde}: og:title do catálogo da loja`);
    assert.match(r.text, /<meta name="robots" content="noindex/, `${onde}: sem noindex`);
  }
});

registrar("T23 loja inativa e referência inválida na URL do imóvel → sem dado de imóvel (VSEG AC3, VCAT AC9)", async (ctx) => {
  const { a, c } = ctx.fixture.stores;
  const inativa = await ctx.pedir(`/c/${c.slug}/imovel/ap-0001`);
  assert.ok(htmlVisivel(inativa.text).includes(NEUTRAL_TEXT), "loja inativa: falta a mensagem neutra");
  assertNoStoreBrand(ctx, htmlVisivel(inativa.text));
  for (const ref of ["..%2F..%2Fapi", "ap_0001", "x".repeat(41)]) {
    const r = await ctx.pedir(`/c/${a.slug}/imovel/${ref}`);
    assert.ok(htmlVisivel(r.text).includes("Este imóvel não está mais disponível."), ref);
  }
});

registrar("T23 isolamento: referência de uma loja sob o slug de outra → não encontrado; a repetida mostra a própria (VSEG AC2, AC3)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;

  // AP-0007 só existe na A: sob o slug da B, é imóvel indisponível.
  const alheia = await ctx.pedir(`/c/${b.slug}/imovel/ap-0007`);
  const htmlAlheia = htmlVisivel(alheia.text);
  assert.ok(htmlAlheia.includes("Este imóvel não está mais disponível."), "AP-0007 sob a B");
  assert.ok(!alheia.text.includes("Bairro Alfa"), "dado da A sob a B");

  // CA-0002 existe nas duas: cada loja mostra o preço, o bairro e o texto da própria.
  const daA = htmlVisivel((await ctx.pedir(`/c/${a.slug}/imovel/ca-0002`)).text);
  assert.ok(daA.includes(">R$ 170.000<") && daA.includes(">Casa em Bairro Alfa 2<"), "A: CA-0002 da A");
  for (const marca of ["BETA-EXCLUSIVO", "Bairro Beta Exclusivo", "R$ 612.000", "fotos.vitrine-e2e.test/b/"]) {
    assert.ok(!daA.includes(marca), `CA-0002 sob a A traz "${marca}" da B`);
  }
  const daB = htmlVisivel((await ctx.pedir(`/c/${b.slug}/imovel/ca-0002`)).text);
  assert.ok(daB.includes(">R$ 612.000<") && daB.includes(">Casa em Bairro Beta Exclusivo<"), "B: CA-0002 da B");
  for (const marca of ["Bairro Alfa", "R$ 170.000", "fotos.vitrine-e2e.test/a/"]) {
    assert.ok(!daB.includes(marca), `CA-0002 sob a B traz "${marca}" da A`);
  }
});

registrar("T23 <script> na descrição sai escapado como texto, com as quebras de linha (VITEM AC7)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const r = await ctx.pedir(`/c/${a.slug}/imovel/ap-0009`);
  assert.equal(r.status, 200);
  assert.ok(!r.text.includes("<script>window.__xss_vitrine"), "o <script> da descrição virou tag");
  assert.ok(
    htmlVisivel(r.text).includes(
      "Primeira linha<br/>&lt;script&gt;window.__xss_vitrine=1&lt;/script&gt;<br/>Terceira linha"
    ),
    "texto escapado com as quebras de linha preservadas"
  );
});

registrar("T23 fotos do imóvel: <img> com a URL cadastrada, lazy, no-referrer e alt de tipo, bairro e posição (VITEM AC8)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const html = htmlVisivel((await ctx.pedir(`/c/${a.slug}/imovel/ap-0001`)).text);
  const tags = imagens(html);
  for (const posicao of [1, 2]) {
    const tag = tags.find((t) => t.includes(`/a/ap-0001-${posicao}.jpg`));
    assert.ok(tag, `foto ${posicao}`);
    assert.match(tag, /loading="lazy"/);
    assert.match(tag, /referrerPolicy="no-referrer"/i);
    assert.ok(tag.includes(`alt="Apartamento em Bairro Alfa 1, foto ${posicao} de 2"`), `alt da foto ${posicao}: ${tag}`);
  }
});

registrar("T23 imóvel sem foto mantém a moldura com espaço reservado e sem <img> (VITEM AC6)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const html = htmlVisivel((await ctx.pedir(`/c/${a.slug}/imovel/ap-0005`)).text);
  assert.ok(html.includes("Sem foto"), "espaço reservado");
  assert.ok(!html.includes("/a/ap-0005-1.jpg"), "foto inexistente");
  assert.ok(html.includes(">Apartamento em Bairro Alfa 5<"));
});

registrar("T23 o botão de interesse abre o wa.me com a referência e o nome da loja (VITEM AC3, AC4)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  for (const [store, ref, REF] of [
    [a, "ap-0001", "AP-0001"],
    [b, "ca-0004", "CA-0004"],
  ] as const) {
    const html = htmlVisivel((await ctx.pedir(`/c/${store.slug}/imovel/${ref}`)).text);
    const botao = ancoras(html).find((x) => x.text.includes("Tenho interesse"));
    assert.ok(botao, `${store.slug}: sem o botão "Tenho interesse"`);
    const url = new URL(botao.href);
    assert.equal(url.origin + url.pathname, `https://wa.me/${store.whatsappComPrefixo}`, store.slug);
    assert.equal(
      url.searchParams.get("text"),
      `Olá! Vi o imóvel ${REF} na vitrine da ${store.name} e tenho interesse.`,
      store.slug
    );
    const voltar = ancoras(html).find((x) => x.text.includes("Ver todos os imóveis"));
    assert.equal(voltar?.href, `/c/${store.slug}`);
  }
});

registrar("T23 og:* do imóvel no <head> para o user-agent do WhatsApp, com a primeira foto em og:image (VOG AC3, AC4, AC6)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const cabecalhos = { "user-agent": UA_WHATSAPP };
  const r = await ctx.pedir(`/c/${a.slug}/imovel/ap-0001`, { cabecalhos });
  assert.equal(metaDoHead(r.text, "og:title"), "Apartamento em Bairro Alfa 1 — AP-0001");
  assert.equal(metaDoHead(r.text, "og:description"), "2 quartos · 43 m² · R$ 160.000");
  assert.equal(metaDoHead(r.text, "og:image"), "https://fotos.vitrine-e2e.test/a/ap-0001-1.jpg");
  assert.equal(metaDoHead(r.text, "og:url"), `${ctx.base}/c/${a.slug}/imovel/ap-0001`);
  assert.equal(metaDoHead(r.text, "twitter:card"), "summary_large_image");
  assert.equal(metaDoHead(r.text, "twitter:image"), "https://fotos.vitrine-e2e.test/a/ap-0001-1.jpg");
  assert.ok(r.text.includes("<title>Apartamento em Bairro Alfa 1 — AP-0001</title>"), "<title>");
});

// ── T24: imagem de compartilhamento da loja ────────────────────────────────

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Largura, altura e cor do primeiro pixel de um PNG de 8 bits RGB ou RGBA; `null` se não for PNG. */
async function readPng(bytes: Buffer): Promise<{ largura: number; altura: number; primeiroPixel: string } | null> {
  if (bytes.length < 33 || !ASSINATURA_PNG.every((value, indice) => bytes[indice] === value)) return null;
  const { inflateSync } = await import("node:zlib");
  const largura = bytes.readUInt32BE(16);
  const altura = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8, "profundidade de cor do PNG");
  assert.ok([2, 6].includes(bytes[25]), `tipo de cor do PNG ${bytes[25]}`);
  const data: Buffer[] = [];
  for (let posicao = 8; posicao + 12 <= bytes.length; ) {
    const tamanho = bytes.readUInt32BE(posicao);
    if (bytes.toString("ascii", posicao + 4, posicao + 8) === "IDAT") {
      data.push(bytes.subarray(posicao + 8, posicao + 8 + tamanho));
    }
    posicao += 12 + tamanho;
  }
  const linhas = inflateSync(Buffer.concat(data));
  // Primeira linha, primeiro pixel: com vizinhos à esquerda e acima iguais a
  // zero, todo filtro do PNG deixa o valor cru igual ao valor real.
  const primeiroPixel = `#${[linhas[1], linhas[2], linhas[3]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return { largura, altura, primeiroPixel };
}

/** Caminho (sem a origem) da imagem `og:image` declarada pelo catálogo da loja. */
async function caminhoDoCartao(ctx: Contexto, slug: string): Promise<string> {
  const r = await ctx.pedir(`/c/${slug}`, { cabecalhos: { "user-agent": UA_WHATSAPP } });
  const url = metaDoHead(r.text, "og:image");
  assert.ok(url, `${slug}: o catálogo não declara og:image`);
  assert.ok(url.startsWith(`${ctx.base}/c/${slug}/opengraph-image`), `${slug}: og:image fora do esperado: ${url}`);
  return url.slice(ctx.base.length);
}

async function baixar(ctx: Contexto, caminho: string, base?: string): Promise<{ status: number; kind: string | null; bytes: Buffer }> {
  // Registra a resposta (cabeçalhos entram nas asserções globais) e lê os bytes à parte.
  const registrada = await ctx.pedir(caminho, { binario: true, ...(base ? { base } : {}) });
  const resposta = await fetch(`${base ?? ctx.base}${caminho}`, { signal: AbortSignal.timeout(30_000) });
  assert.equal(registrada.status, resposta.status, `${caminho}: status diferente entre as duas leituras`);
  return { status: resposta.status, kind: resposta.headers.get("content-type"), bytes: Buffer.from(await resposta.arrayBuffer()) };
}

registrar("T24 o catálogo e o imóvel sem foto declaram o cartão da própria loja como og:image absoluto (VOG AC1, AC4)", async (ctx) => {
  const { a, b, d } = ctx.fixture.stores;
  const cabecalhos = { "user-agent": UA_WHATSAPP };
  for (const store of [a, b, d]) {
    const r = await ctx.pedir(`/c/${store.slug}`, { cabecalhos });
    const imagem = metaDoHead(r.text, "og:image");
    assert.ok(imagem?.startsWith(`${ctx.base}/c/${store.slug}/opengraph-image`), `${store.slug}: og:image ${imagem}`);
    assert.equal(metaDoHead(r.text, "og:image:width"), "1200", `${store.slug}: largura declarada`);
    assert.equal(metaDoHead(r.text, "og:image:height"), "630", `${store.slug}: altura declarada`);
    assert.equal(metaDoHead(r.text, "twitter:image"), imagem, `${store.slug}: twitter:image`);
  }
  // Imóvel sem foto (AP-0005 da A): a imagem da loja; com foto, a foto (provado na T23).
  const doCatalogo = await caminhoDoCartao(ctx, a.slug);
  const semFoto = await ctx.pedir(`/c/${a.slug}/imovel/ap-0005`, { cabecalhos });
  assert.equal(metaDoHead(semFoto.text, "og:image"), `${ctx.base}${doCatalogo}`, "AP-0005 sem foto");
});

registrar("T24 o cartão de A e B é um PNG 1200×630 sobre o hex literal da loja; D usa outra cor (VOG AC5)", async (ctx) => {
  const { a, b, d } = ctx.fixture.stores;
  const cartoes: Record<string, { bytes: Buffer; pixel: string }> = {};
  for (const store of [a, b, d]) {
    const { status, kind, bytes } = await baixar(ctx, await caminhoDoCartao(ctx, store.slug));
    assert.equal(status, 200, store.slug);
    assert.equal(kind, "image/png", store.slug);
    const png = await readPng(bytes);
    assert.ok(png, `${store.slug}: a resposta não é PNG`);
    assert.equal(png.largura, 1200, `${store.slug}: largura`);
    assert.equal(png.altura, 630, `${store.slug}: altura`);
    cartoes[store.slug] = { bytes, pixel: png.primeiroPixel };
  }
  assert.equal(cartoes[a.slug].pixel, a.color, "A: o fundo é o hex literal da loja, não o accent derivado");
  assert.equal(cartoes[b.slug].pixel, b.color, "B: o fundo é o hex literal da loja");
  assert.equal(a.color && b.color && d.color, null, "D da fixture não tem cor");
  assert.notEqual(cartoes[d.slug].pixel, a.color, "D com a cor da A");
  assert.notEqual(cartoes[d.slug].pixel, b.color, "D com a cor da B");
  assert.ok(!cartoes[a.slug].bytes.equals(cartoes[b.slug].bytes), "A e B com o mesmo cartão");
});

registrar("T24 loja inativa (C), slug sem loja e slug inválido → sem PNG da loja, sem marca (VCAT AC9)", async (ctx) => {
  const { a, c } = ctx.fixture.stores;
  const modelo = await caminhoDoCartao(ctx, a.slug);
  for (const slug of [c.slug, "vt-e2e-sem-loja", "Slug_Invalido"]) {
    const caminho = modelo.replace(`/c/${a.slug}/`, `/c/${slug}/`);
    const { status, kind, bytes } = await baixar(ctx, caminho);
    assert.equal(status, 404, `${slug}: status`);
    assert.notEqual(kind, "image/png", `${slug}: devolveu imagem`);
    assert.equal(await readPng(bytes), null, `${slug}: o corpo é um PNG`);
    assertNoStoreBrand(ctx, bytes.toString("utf8"));
  }
});

registrar("T24 gerar o cartão não faz nenhuma requisição de saída (VOG AC5)", async (ctx) => {
  const [{ mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync }, { tmpdir }] = await Promise.all([
    import("node:fs"),
    import("node:os"),
  ]);
  const directory = mkdtempSync(path.join(tmpdir(), "vitrine-e2e-saidas-"));
  const registro = path.join(directory, "saidas.log");
  const gancho = path.join(directory, "gancho.cjs");
  // Pré-carregado no servidor: anota todo `fetch` e toda chamada a `http(s).request/get`,
  // ainda antes de a requisição sair. A conexão do banco usa `net`/`tls` e não entra aqui.
  writeFileSync(
    gancho,
    [
      'const fs = require("node:fs");',
      "const registro = process.env.VITRINE_E2E_SAIDAS;",
      'const anotar = (tipo, alvo) => { try { fs.appendFileSync(registro, tipo + " " + String(alvo) + "\\n"); } catch {} };',
      "const original = globalThis.fetch;",
      'globalThis.fetch = function (entrada, ...resto) { anotar("fetch", entrada && entrada.url ? entrada.url : entrada); return original.call(this, entrada, ...resto); };',
      'for (const nome of ["node:http", "node:https"]) {',
      "  const modulo = require(nome);",
      '  for (const metodo of ["request", "get"]) {',
      "    const feito = modulo[metodo];",
      '    modulo[metodo] = function (...args) { const a = args[0]; anotar(nome + "." + metodo, typeof a === "string" ? a : a && (a.href || a.hostname || a.host)); return feito.apply(this, args); };',
      "  }",
      "}",
    ].join("\n")
  );
  const outra = await ctx.iniciarInstancia(PORTA_E2E + 2, {
    NODE_OPTIONS: `--require "${gancho.replace(/\\/g, "/")}"`,
    "VITRINE_E2E_SAIDAS": registro,
  });
  try {
    const { a, b } = ctx.fixture.stores;
    for (const store of [a, b]) {
      const r = await ctx.pedir(`/c/${store.slug}`, { base: outra.base, cabecalhos: { "user-agent": UA_WHATSAPP } });
      const url = metaDoHead(r.text, "og:image");
      assert.ok(url, `${store.slug}: sem og:image`);
      const { status, kind } = await baixar(ctx, new URL(url).pathname, outra.base);
      assert.equal(status, 200, `${store.slug}: cartão`);
      assert.equal(kind, "image/png", `${store.slug}: tipo`);
    }
    const saidas = existsSync(registro)
      ? readFileSync(registro, "utf8").split("\n").filter((linha) => linha.trim() !== "")
      : [];
    // `data:` é o módulo WASM do renderizador lido em memória, não rede; `localhost` é o próprio servidor.
    const externas = saidas
      .filter((linha) => !/^[^ ]+ data:/.test(linha) && !/localhost|127\.0\.0\.1|\[::1\]/.test(linha))
      .map((linha) => linha.slice(0, 160));
    assert.deepEqual(externas, [], "o servidor fez requisição de saída ao gerar o cartão");
  } finally {
    outra.parar();
    try {
      rmSync(directory, { recursive: true, force: true });
    } catch {
      // arquivo ainda aberto pelo processo que encerra: o diretório temporário fica para o sistema
    }
  }
});

// ── Fechamento do lote: ramos vazios, desativação, texto do catálogo e do cartão ──
// (lacunas apontadas pelo Verifier na rodada 1; cada asserção que muda dado no banco
// restaura o que mudou e avisa a vitrine de novo, mesmo em falha)

/** Avisa a vitrine, como o CRM faz depois de uma escrita, e confere o 204. */
async function notifyStorefront(ctx: Contexto, slug: string): Promise<void> {
  const r = await ctx.pedir("/api/revalidar", {
    metodo: "POST",
    cabecalhos: { authorization: `Bearer ${ctx.segredo}` },
    corpo: JSON.stringify({ slug }),
  });
  assert.equal(r.status, 204, `aviso para ${slug}`);
}

/** Texto do HTML visível sem os comentários que o React põe entre nós de texto vizinhos. */
function plainText(html: string): string {
  return htmlVisivel(html).split("<!-- -->").join("");
}

/** "3 quartos · 1 banheiro · 0 vagas · 58 m²": singular só para 1 (VCAT AC6). */
function resumoDoCard(property: { quartos: number; banheiros: number; vagas: number; areaM2: number }): string {
  const contar = (n: number, singular: string, plural: string) => `${n} ${n === 1 ? singular : plural}`;
  return [
    contar(property.quartos, "quarto", "quartos"),
    contar(property.banheiros, "banheiro", "banheiros"),
    contar(property.vagas, "vaga", "vagas"),
    `${property.areaM2} m²`,
  ].join(" · ");
}

registrar("V1 card do catálogo: bairro, cidade, quartos, banheiros, vagas e área de cada imóvel da página (VCAT AC6)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const htmlA = plainText((await ctx.pedir(`/c/${a.slug}`)).text);
  const naPagina1 = ordemDoCatalogo(a.properties).slice(0, 24);
  assert.equal(naPagina1.length, 24);
  for (const property of a.properties.filter((x) => x.visivel && naPagina1.includes(x.referencia.toLowerCase()))) {
    assert.ok(htmlA.includes(`>${property.neighborhood}, ${property.city}<`), `A ${property.referencia}: bairro e cidade`);
    assert.ok(htmlA.includes(`>${resumoDoCard(property)}<`), `A ${property.referencia}: ${resumoDoCard(property)}`);
  }
  // Editorial (B): as mesmas informações na linha de cada imóvel, com o singular de 1 banheiro e 1 vaga.
  const htmlB = plainText((await ctx.pedir(`/c/${b.slug}`)).text);
  for (const property of b.properties.filter((x) => x.visivel)) {
    assert.ok(htmlB.includes(resumoDoCard(property)), `B ${property.referencia}: ${resumoDoCard(property)}`);
    assert.ok(htmlB.includes(property.neighborhood) && htmlB.includes(property.city), `B ${property.referencia}: lugar`);
  }
});

registrar("V2 título, 'Sobre' e nome da loja no corpo do catálogo; loja sem sobre não mostra a seção (VCAT AC1, VTEMA AC4, AC5)", async (ctx) => {
  const { a, b, d } = ctx.fixture.stores;
  for (const store of [a, b]) {
    const html = plainText((await ctx.pedir(`/c/${store.slug}`)).text);
    assert.ok(html.includes(`>${store.name}<`), `${store.slug}: nome`);
    assert.ok(html.includes(">Sobre<"), `${store.slug}: seção Sobre`);
    assert.ok(html.includes(`>${store.sobre}<`), `${store.slug}: texto do Sobre`);
    if (store.title) assert.ok(html.includes(`>${store.title}<`), `${store.slug}: título institucional`);
  }
  const htmlD = plainText((await ctx.pedir(`/c/${d.slug}`)).text);
  assert.ok(htmlD.includes(`>${d.name}<`), "D: nome");
  assert.ok(!htmlD.includes(">Sobre<"), "D (sem sobre) mostra a seção Sobre");
});

registrar("V3 aviso legal também na página do imóvel e na do imóvel indisponível (VLEGAL AC1)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const aviso = "Preços e disponibilidade sujeitos a alteração sem aviso prévio.";
  for (const caminho of [`/c/${a.slug}/imovel/ap-0001`, `/c/${a.slug}/imovel/ap-9999`]) {
    const html = htmlVisivel((await ctx.pedir(caminho)).text);
    assert.ok(html.includes(aviso), `${caminho}: aviso`);
    assert.ok(html.includes(a.razaoSocial) && html.includes(a.creci), `${caminho}: razão social e CRECI`);
  }
});

registrar("V4 sem destaque o grade omite a faixa e o editorial omite a foto do cabeçalho; com 8 destaques a faixa mostra 6 (VTEMA AC4–AC6)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const fotografar = (tenantId: string) =>
    ctx.db
      .select({
        reference: properties.reference,
        featured: properties.featured,
        published: properties.published,
        updatedAt: properties.updatedAt,
        status: properties.status,
      })
      .from(properties)
      .where(eq(properties.tenantId, tenantId));
  const marcar = (tenantId: string, referencias: string[], featured: boolean) =>
    Promise.all(
      referencias.map((reference) =>
        ctx.db
          .update(properties)
          .set({ featured })
          .where(and(eq(properties.tenantId, tenantId), eq(properties.reference, reference)))
      )
    );
  const restaurar = async (tenantId: string, linhas: Awaited<ReturnType<typeof fotografar>>) => {
    for (const linha of linhas) {
      await ctx.db
        .update(properties)
        .set({ featured: linha.featured, published: linha.published, updatedAt: linha.updatedAt })
        .where(and(eq(properties.tenantId, tenantId), eq(properties.reference, linha.reference)));
    }
  };

  const originaisA = await fotografar(a.id);
  const originaisB = await fotografar(b.id);
  try {
    // A (grade) sem nenhum destaque: a faixa some e a grade segue com os 24 da página.
    await marcar(a.id, originaisA.filter((x) => x.featured).map((x) => x.reference), false);
    await notifyStorefront(ctx, a.slug);
    const semDestaque = plainText((await ctx.pedir(`/c/${a.slug}`)).text);
    assert.ok(!semDestaque.includes(">Destaques<"), "grade sem destaque mostra a faixa");
    assert.equal(referenciasNosLinks(trecho(semDestaque, ">Imóveis disponíveis<"), a.slug).length, 24);

    // A com 8 destaques: a faixa mostra os 6 primeiros da ordem destaque → recente → referência.
    const escolhidos = ["AP-0001", "CA-0002", "CA-0004", "CA-0006", "CA-0008", "AP-0009", "CA-0010", "CA-0012"];
    await marcar(a.id, escolhidos, true);
    await notifyStorefront(ctx, a.slug);
    const doBanco = await fotografar(a.id);
    const esperados = doBanco
      .filter((x) => x.featured && x.published && x.status === PROPERTY_STATUS.available)
      .sort((x, y) => y.updatedAt.getTime() - x.updatedAt.getTime() || x.reference.localeCompare(y.reference))
      .slice(0, 6)
      .map((x) => x.reference.toLowerCase());
    assert.equal(esperados.length, 6);
    const comOito = plainText((await ctx.pedir(`/c/${a.slug}`)).text);
    const faixa = referenciasNosLinks(trecho(comOito, ">Destaques<", ">Imóveis disponíveis<"), a.slug);
    assert.deepEqual(faixa, esperados, "a faixa tem de mostrar só os 6 primeiros destaques, na ordem do catálogo");

    // B (editorial) sem destaque: nenhuma foto de cabeçalho (a foto aparece só na linha) e nenhum marcador.
    await marcar(b.id, originaisB.filter((x) => x.featured).map((x) => x.reference), false);
    await notifyStorefront(ctx, b.slug);
    const editorialSemDestaque = plainText((await ctx.pedir(`/c/${b.slug}`)).text);
    const primeira = editorialSemDestaque.indexOf("fotos.vitrine-e2e.test/b/");
    assert.ok(primeira >= 0, "o editorial perdeu as fotos das linhas");
    const fotosDaLista = editorialSemDestaque.split("fotos.vitrine-e2e.test/b/").length - 1;
    assert.equal(fotosDaLista, b.properties.filter((x) => x.visivel).length, "uma foto por linha, nenhuma no cabeçalho");
    assert.ok(!editorialSemDestaque.includes("Destaque"), "o editorial sem destaque mostra o marcador");
  } finally {
    await restaurar(a.id, originaisA);
    await restaurar(b.id, originaisB);
    await notifyStorefront(ctx, a.slug);
    await notifyStorefront(ctx, b.slug);
  }
});

registrar("V5 loja com exatamente 24 imóveis visíveis → uma página só, sem paginação; ?pagina=2 mostra os mesmos 24 (Edge Case de 24)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const antes = await ctx.db
    .select({ published: properties.published, updatedAt: properties.updatedAt })
    .from(properties)
    .where(and(eq(properties.tenantId, a.id), eq(properties.reference, "AP-0001")));
  try {
    await ctx.db
      .update(properties)
      .set({ published: false })
      .where(and(eq(properties.tenantId, a.id), eq(properties.reference, "AP-0001")));
    await notifyStorefront(ctx, a.slug);
    const esperada = ordemDoCatalogo(a.properties).filter((ref) => ref !== "ap-0001");
    assert.equal(esperada.length, 24);
    for (const caminho of [`/c/${a.slug}`, `/c/${a.slug}?pagina=2`]) {
      const html = plainText((await ctx.pedir(caminho)).text);
      assert.ok(!html.includes("astryx-pagination"), `${caminho}: mostra paginação com 24 imóveis`);
      assert.deepEqual(referenciasNosLinks(trecho(html, ">Imóveis disponíveis<"), a.slug), esperada, caminho);
    }
  } finally {
    await ctx.db
      .update(properties)
      .set({ published: antes[0].published, updatedAt: antes[0].updatedAt })
      .where(and(eq(properties.tenantId, a.id), eq(properties.reference, "AP-0001")));
    await notifyStorefront(ctx, a.slug);
  }
});

registrar("V6 loja desativada no CRM + aviso → a próxima visita mostra a página neutra; reativada + aviso → volta (Edge Case de VCACHE)", async (ctx) => {
  const d = ctx.fixture.stores.d;
  const ativar = (ativa: boolean) =>
    ctx.db.update(tenantStorefronts).set({ active: ativa }).where(eq(tenantStorefronts.tenantId, d.id));
  const vazio = "Nenhum imóvel disponível no momento.";
  await notifyStorefront(ctx, d.slug);
  assert.ok(plainText((await ctx.pedir(`/c/${d.slug}`)).text).includes(vazio), "D de partida");
  try {
    await ativar(false);
    // Sem aviso, a página continua a do cache (VCACHE AC9).
    assert.ok(plainText((await ctx.pedir(`/c/${d.slug}`)).text).includes(vazio), "sem aviso tem de seguir do cache");
    await notifyStorefront(ctx, d.slug);
    const depois = await ctx.pedir(`/c/${d.slug}`);
    const visivel = plainText(depois.text);
    assert.ok(visivel.includes(NEUTRAL_TEXT), "depois do aviso: página neutra");
    assert.ok(!visivel.includes(vazio), "depois do aviso: ainda mostra o catálogo");
    assertNoStoreBrand(ctx, visivel);
    const cartao = await baixar(ctx, `/c/${d.slug}/opengraph-image`);
    assert.equal(cartao.status, 404, "o cartão da loja desativada");
    const property = await ctx.pedir(`/c/${d.slug}/imovel/ca-0001`);
    assert.ok(plainText(property.text).includes(NEUTRAL_TEXT), "o imóvel da loja desativada");
  } finally {
    await ativar(true);
    await notifyStorefront(ctx, d.slug);
  }
  assert.ok(plainText((await ctx.pedir(`/c/${d.slug}`)).text).includes(vazio), "D reativada volta ao catálogo");
});

registrar("V7 o cartão de compartilhamento traz o nome da loja: com a mesma cor e a mesma cidade, B e A geram PNGs diferentes (VOG AC5)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const doA = await baixar(ctx, `/c/${a.slug}/opengraph-image`);
  assert.equal(doA.status, 200);
  try {
    await ctx.db.update(tenantStorefronts).set({ accentColor: a.color }).where(eq(tenantStorefronts.tenantId, b.id));
    await ctx.db.update(tenants).set({ city: a.city, state: a.uf }).where(eq(tenants.id, b.id));
    await notifyStorefront(ctx, b.slug);
    const doB = await baixar(ctx, `/c/${b.slug}/opengraph-image`);
    assert.equal(doB.status, 200);
    const pngB = await readPng(doB.bytes);
    assert.equal(pngB?.primeiroPixel, a.color, "B ficou com a cor da A (preparo da prova)");
    assert.ok(!doA.bytes.equals(doB.bytes), "só o nome muda e os PNGs saíram iguais: o cartão não traz o nome");
  } finally {
    await ctx.db.update(tenantStorefronts).set({ accentColor: b.color }).where(eq(tenantStorefronts.tenantId, b.id));
    await ctx.db.update(tenants).set({ city: b.city, state: b.uf }).where(eq(tenants.id, b.id));
    await notifyStorefront(ctx, b.slug);
  }
});

registrar("V8 slug fora do formato não consulta o banco: com o banco inalcançável a página neutra sai, não 'indisponível' (VCAT AC8)", async (ctx) => {
  const outra = await ctx.iniciarInstancia(PORTA_E2E + 3, {
    "VITRINE_DATABASE_URL": "postgresql://krivo_vitrine:senha-de-teste@banco-inalcancavel.invalid:5432/neondb",
  });
  try {
    for (const slug of ["Slug_Invalido", "UPPER", "a".repeat(64)]) {
      const r = await ctx.pedir(`/c/${slug}`, { base: outra.base });
      const html = plainText(r.text);
      assert.ok(html.includes(NEUTRAL_TEXT), `/c/${slug}: falta a página neutra`);
      assert.ok(!html.includes("Vitrine temporariamente indisponível."), `/c/${slug}: consultou o banco`);
    }
    assert.ok(!outra.output().includes("[vitrine] erro"), "o servidor registrou erro de leitura para slug inválido");
  } finally {
    outra.parar();
  }
});

// ── Fechamento do lote, rodada 2 do Verifier: superfície, modo claro e fontes ──

registrar("V9 sem sitemap e sem Disallow: /robots.txt e /sitemap.xml não existem (VSEO AC3)", async (ctx) => {
  for (const caminho of ["/robots.txt", "/sitemap.xml", "/sitemap-0.xml", "/sitemap_index.xml"]) {
    const r = await ctx.pedir(caminho);
    assert.equal(r.status, 404, `${caminho}: status`);
    assert.ok(!/disallow/i.test(r.text), `${caminho}: tem Disallow`);
    assert.ok(!r.text.includes("<urlset") && !r.text.includes("<sitemapindex"), `${caminho}: tem sitemap`);
    assert.equal(r.cabecalhos.get("x-robots-tag"), "noindex, nofollow", `${caminho}: X-Robots-Tag`);
  }
});

registrar("V10 nenhuma outra rota aceita escrita: POST em rotas de API plausíveis → 404; as de /api/revalidar → 405 (VSEG AC6)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const corpo = JSON.stringify({ slug: a.slug });
  for (const caminho of ["/api", "/api/leads", "/api/imoveis", "/api/lojas", "/api/revalidate", "/api/revalidar/outra", "/api/v1/leads"]) {
    const r = await ctx.pedir(caminho, { metodo: "POST", cabecalhos: { authorization: `Bearer ${ctx.segredo}` }, corpo });
    assert.equal(r.status, 404, `POST ${caminho}`);
  }
  for (const metodo of ["PUT", "PATCH", "DELETE"]) {
    const r = await ctx.pedir("/api/revalidar", { metodo, cabecalhos: { authorization: `Bearer ${ctx.segredo}` }, corpo });
    assert.equal(r.status, 405, metodo);
    assert.equal(r.cabecalhos.get("allow"), "POST", metodo);
  }
});

registrar("V11 o tema de cada loja é montado em modo claro: wrapper com data-theme=light e <html> em light (VTEMA AC1)", async (ctx) => {
  for (const store of [ctx.fixture.stores.a, ctx.fixture.stores.b, ctx.fixture.stores.d]) {
    const r = await ctx.pedir(`/c/${store.slug}`);
    const html = htmlVisivel(r.text);
    const marca = `data-astryx-theme="loja-${store.slug}"`;
    const start = html.indexOf(marca);
    assert.ok(start >= 0, `${store.slug}: sem o wrapper do tema`);
    const abre = html.lastIndexOf("<", start);
    const tag = html.slice(abre, html.indexOf(">", start));
    assert.ok(tag.includes('data-theme="light"'), `${store.slug}: wrapper fora do modo claro: ${tag}`);
    assert.ok(!html.includes('data-theme="dark"'), `${store.slug}: há elemento em modo escuro`);
    const tagHtml = html.slice(html.indexOf("<html"), html.indexOf(">", html.indexOf("<html")));
    assert.ok(tagHtml.includes('data-theme="light"'), `${store.slug}: <html> fora do modo claro`);
  }
});

registrar("V12 a fonte da loja chega ao HTML: o <html> traz a classe de cada fonte e o CSS declara --font-<fonte> (VTEMA AC3)", async (ctx) => {
  const fontes = ["inter", "montserrat", "lora", "playfair"];
  for (const store of [ctx.fixture.stores.a, ctx.fixture.stores.b, ctx.fixture.stores.d]) {
    const r = await ctx.pedir(`/c/${store.slug}`);
    const html = r.text;
    const tagHtml = html.slice(html.indexOf("<html"), html.indexOf(">", html.indexOf("<html")));
    const classes = (/class="([^"]*)"/.exec(tagHtml)?.[1] ?? "").split(" ").filter(Boolean);
    for (const font of fontes) {
      assert.ok(
        classes.some((classe) => classe.startsWith(`${font}_`) && classe.endsWith("__variable")),
        `${store.slug}: o <html> não declara a variável da fonte ${font} (classes: ${classes.join(" ")})`
      );
    }
    // As folhas de estilo da página: precisam definir a variável da fonte desta loja.
    const caminhos = html
      .split('rel="stylesheet" href="')
      .slice(1)
      .map((trecho) => trecho.slice(0, trecho.indexOf('"')))
      .filter((href) => href.startsWith("/_next/"));
    assert.ok(caminhos.length > 0, `${store.slug}: nenhuma folha de estilo`);
    let css = "";
    for (const href of caminhos) css += (await ctx.pedir(href)).text;
    for (const font of fontes) {
      assert.ok(css.includes(`--font-${font}:`), `${store.slug}: o CSS não define --font-${font}`);
    }
  }
});

// ── Fechamento do lote, rodada 3 do Verifier: editorial paginado, UF, tipo e meta robots ──

registrar("V13 editorial com mais de 24 imóveis: paginação em português, 24 linhas na página 1 e 1 na 2 (VTEMA AC5)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const definir = (layout: typeof STOREFRONT_LAYOUT.grid | "editorial") =>
    ctx.db.update(tenantStorefronts).set({ layout }).where(eq(tenantStorefronts.tenantId, a.id));
  try {
    await definir("editorial");
    await notifyStorefront(ctx, a.slug);
    const esperada = ordemDoCatalogo(a.properties);
    assert.equal(esperada.length, 25);
    const p1 = plainText((await ctx.pedir(`/c/${a.slug}`)).text);
    assert.ok(p1.includes("astryx-list-item") && !p1.includes("astryx-clickable-card"), "A não saiu em editorial");
    assert.ok(p1.includes('aria-label="Paginação"'), "editorial sem a navegação de páginas");
    assert.ok(p1.includes('aria-label="Ir para a próxima página"'), "editorial sem o botão de próxima página");
    assert.deepEqual(referenciasNosLinks(trecho(p1, ">Imóveis disponíveis<"), a.slug), esperada.slice(0, 24), "página 1");
    for (const caminho of [`/c/${a.slug}?pagina=2`, `/c/${a.slug}?pagina=99`]) {
      const p2 = plainText((await ctx.pedir(caminho)).text);
      assert.deepEqual(referenciasNosLinks(trecho(p2, ">Imóveis disponíveis<"), a.slug), esperada.slice(24), caminho);
      assert.ok(p2.includes('aria-label="Paginação"'), `${caminho}: sem paginação`);
    }
  } finally {
    await definir(a.layout);
    await notifyStorefront(ctx, a.slug);
  }
});

registrar("V14 meta robots exata (noindex, nofollow) no catálogo, no imóvel, no indisponível e na página neutra (VSEO AC1)", async (ctx) => {
  const { a, b, d } = ctx.fixture.stores;
  const caminhos = [
    `/c/${a.slug}`,
    `/c/${a.slug}?pagina=2`,
    `/c/${b.slug}`,
    `/c/${d.slug}`,
    `/c/${a.slug}/imovel/ap-0001`,
    `/c/${a.slug}/imovel/ap-0005`,
    `/c/${a.slug}/imovel/ap-9999`,
    `/c/${ctx.fixture.stores.c.slug}`,
    "/c/Slug_Invalido",
  ];
  for (const caminho of caminhos) {
    const r = await ctx.pedir(caminho);
    assert.ok(
      r.text.includes('<meta name="robots" content="noindex, nofollow"'),
      `${caminho}: meta robots diferente de "noindex, nofollow"`
    );
    assert.equal(r.text.split('<meta name="robots"').length - 1, 1, `${caminho}: mais de uma meta robots`);
  }
});

registrar("V15 a UF do imóvel vem do imóvel: mudar a UF no banco muda a página depois do aviso (VITEM AC1)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const onde = and(eq(properties.tenantId, a.id), eq(properties.reference, "AP-0001"));
  const [antes] = await ctx.db.select({ state: properties.state, updatedAt: properties.updatedAt }).from(properties).where(onde);
  assert.equal(antes.state, "MG");
  try {
    await ctx.db.update(properties).set({ state: "SP" }).where(onde);
    await notifyStorefront(ctx, a.slug);
    const html = plainText((await ctx.pedir(`/c/${a.slug}/imovel/ap-0001`)).text);
    assert.ok(html.includes(">Uberaba/SP<"), "a UF do imóvel não aparece");
    assert.ok(!html.includes(">Uberaba/MG<"), "a UF antiga continua na página");
  } finally {
    await ctx.db.update(properties).set({ state: antes.state, updatedAt: antes.updatedAt }).where(onde);
    await notifyStorefront(ctx, a.slug);
  }
});

registrar("V16 o tipo do imóvel aparece no texto visível de cada card (grade) e de cada linha (editorial) (VCAT AC6)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const rotulo = (kind: string) => (kind === PROPERTY_KIND.apartment ? "Apartamento" : "Casa");
  const naPagina1 = ordemDoCatalogo(a.properties).slice(0, 24);
  const htmlA = plainText((await ctx.pedir(`/c/${a.slug}`)).text);
  for (const property of a.properties.filter((x) => x.visivel && naPagina1.includes(x.referencia.toLowerCase()))) {
    const linha = `>${rotulo(property.kind)} · Usado · ${property.referencia}<`;
    assert.ok(htmlA.includes(linha), `A ${property.referencia}: falta ${linha}`);
  }
  const htmlB = plainText((await ctx.pedir(`/c/${b.slug}`)).text);
  for (const property of b.properties.filter((x) => x.visivel)) {
    const title = `${rotulo(property.kind)} em ${property.neighborhood}`;
    assert.ok(htmlB.includes(`>${title}<`), `B ${property.referencia}: falta o título "${title}"`);
  }
});

// ── Fechamento do lote, rodada F4: metadados do imóvel indisponível, preço do card e espaço sem foto ──

registrar("V17 imóvel indisponível: metadados do catálogo da loja e nenhum dado do imóvel pedido (VOG AC1, AC2, AC6; VSEG AC4, AC5)", async (ctx) => {
  const { a, b, c, d } = ctx.fixture.stores;
  const cabecalhos = { "user-agent": UA_WHATSAPP };
  const chaves = [
    "og:title", "og:description", "og:url", "og:image", "og:image:width", "og:image:height",
    "twitter:card", "twitter:title", "twitter:description", "twitter:image",
  ];
  type Caso = { store: typeof a; ref: string; property: (typeof a.properties)[number] | null };
  const casos: Caso[] = [
    ...a.properties.filter((x) => !x.visivel).map((property) => ({ store: a, ref: property.referencia.toLowerCase(), property })),
    ...b.properties.filter((x) => !x.visivel).map((property) => ({ store: b, ref: property.referencia.toLowerCase(), property })),
    ...d.properties.filter((x) => !x.visivel).map((property) => ({ store: d, ref: property.referencia.toLowerCase(), property })),
    { store: a, ref: "ap-9999", property: null },
    { store: a, ref: "ref_invalida%24", property: null },
    // AP-0007 existe só na A: sob o slug da B é imóvel indisponível, sem nada da A.
    { store: b, ref: "ap-0007", property: a.properties.find((x) => x.referencia === "AP-0007") ?? null },
  ];
  assert.ok(casos.length >= 10);

  const cabeca = (text: string) => {
    const end = text.indexOf("</head>");
    assert.ok(end > 0, "a resposta não tem </head>");
    return text.slice(0, end);
  };

  for (const store of [a, b, d]) {
    const catalogo = await ctx.pedir(`/c/${store.slug}`, { cabecalhos });
    for (const caso of casos.filter((x) => x.store === store)) {
      const r = await ctx.pedir(`/c/${store.slug}/imovel/${caso.ref}`, { cabecalhos });
      const onde = `${store.slug}/${caso.ref}`;
      assert.ok(htmlVisivel(r.text).includes("Este imóvel não está mais disponível."), `${onde}: não é a página de imóvel indisponível`);
      for (const key of chaves) {
        assert.equal(metaDoHead(r.text, key), metaDoHead(catalogo.text, key), `${onde}: ${key} diferente do catálogo da loja`);
      }
      assert.equal(metaDoHead(r.text, "og:url"), `${ctx.base}/c/${store.slug}`, `${onde}: og:url`);
      assert.ok(cabeca(r.text).includes(`<title>${store.name} — imóveis</title>`), `${onde}: <title> do catálogo`);

      // Nada do imóvel pedido (nem a referência na URL) nos metadados do <head>.
      const head = cabeca(r.text);
      assert.ok(!head.includes("/imovel/"), `${onde}: a URL do imóvel está nos metadados`);
      if (caso.property) {
        for (const dado of [
          caso.property.referencia,
          caso.property.referencia.toLowerCase(),
          caso.property.description,
          caso.property.neighborhood,
          `R$ ${caso.property.priceReais.toLocaleString("pt-BR")}`,
        ]) {
          assert.ok(!head.includes(dado), `${onde}: "${dado}" nos metadados`);
        }
      }
    }
  }

  // Loja inativa: página neutra, sem metadados de marca (VCAT AC9).
  const inativa = await ctx.pedir(`/c/${c.slug}/imovel/ap-0001`, { cabecalhos });
  for (const key of ["og:title", "og:description", "og:url"]) {
    assert.equal(metaDoHead(inativa.text, key), null, `loja inativa: ${key}`);
  }
  assert.ok(!cabeca(inativa.text).includes(c.name), "loja inativa: nome nos metadados");
});

registrar("V18 o preço do imóvel aparece como texto visível em cada card da grade e em cada linha do editorial (VCAT AC6)", async (ctx) => {
  const { a, b } = ctx.fixture.stores;
  const reais = (centavos: bigint) => `R$ ${(centavos / 100n).toLocaleString("pt-BR")}`;
  const precos = async (tenantId: string) =>
    new Map(
      (
        await ctx.db
          .select({ referencia: properties.reference, price: properties.priceCents })
          .from(properties)
          .where(eq(properties.tenantId, tenantId))
      ).map((x) => [x.referencia.toLowerCase(), reais(x.price)])
    );
  const precosDaA = await precos(a.id);
  const htmlA = plainText((await ctx.pedir(`/c/${a.slug}`)).text);
  for (const ref of ordemDoCatalogo(a.properties).slice(0, 24)) {
    const price = precosDaA.get(ref);
    assert.ok(price, `A ${ref}: sem preço no banco`);
    assert.ok(htmlA.includes(`>${price}<`), `A ${ref}: falta o texto visível ${price}`);
  }
  const precosDaB = await precos(b.id);
  const htmlB = plainText((await ctx.pedir(`/c/${b.slug}`)).text);
  for (const ref of ordemDoCatalogo(b.properties)) {
    const price = precosDaB.get(ref);
    assert.ok(price && htmlB.includes(`>${price}<`), `B ${ref}: falta o texto visível ${price}`);
  }
});

registrar("V19 imóvel sem foto: a moldura de proporção e o ícone estão no card do catálogo e na página do imóvel (VITEM AC6)", async (ctx) => {
  const { a } = ctx.fixture.stores;
  const conferir = (html: string, onde: string) => {
    const text = plainText(html);
    const indice = text.indexOf("Sem foto");
    assert.ok(indice >= 0, `${onde}: falta o texto "Sem foto"`);
    const moldura = text.lastIndexOf("astryx-aspect-ratio", indice);
    assert.ok(moldura >= 0, `${onde}: o espaço sem foto está fora da moldura de proporção`);
    const trecho = text.slice(moldura, indice);
    assert.ok(trecho.includes("<svg"), `${onde}: o espaço sem foto não tem ícone`);
    assert.ok(!trecho.includes("<img"), `${onde}: a moldura do imóvel sem foto tem <img>`);
  };
  conferir((await ctx.pedir(`/c/${a.slug}/imovel/ap-0005`)).text, "imóvel AP-0005");
  conferir((await ctx.pedir(`/c/${a.slug}`)).text, "card de AP-0005 no catálogo");
});

// ── Globais: olham tudo o que as asserções acima (e as das tasks seguintes) pediram ──

registrarGlobal("Global: X-Robots-Tag \"noindex, nofollow\" em toda resposta (VSEO AC2)", (ctx) => {
  assert.ok(ctx.respostas().length > 0, "nenhuma resposta registrada");
  for (const r of ctx.respostas()) {
    assert.equal(r.cabecalhos.get("x-robots-tag"), "noindex, nofollow", `${r.metodo} ${r.caminho} (${r.status})`);
  }
});

registrarGlobal("Global: nenhuma resposta define cookie (VSEG AC7)", (ctx) => {
  for (const r of ctx.respostas()) {
    assert.equal(r.cabecalhos.get("set-cookie"), null, `${r.metodo} ${r.caminho} (${r.status})`);
  }
});

registrarGlobal("Global: nenhuma sentinela de PII ou de imóvel oculto no HTML nem no log (VSEG AC4, AC5)", (ctx) => {
  const log = ctx.serverOutput();
  for (const sentinela of ctx.fixture.sentinelas) {
    assert.ok(!log.includes(sentinela), `sentinela "${sentinela}" no log do servidor`);
    for (const r of ctx.respostas()) {
      assert.ok(!r.text.includes(sentinela), `sentinela "${sentinela}" em ${r.metodo} ${r.caminho}`);
    }
  }
});

registrarGlobal("Global: o servidor principal não registrou nenhum erro de render nem de leitura", (ctx) => {
  const errors = ctx
    .serverOutput()
    .split("\n")
    .filter((linha) => linha.includes("⨯") || linha.includes("[vitrine] erro"));
  assert.deepEqual(errors, [], "o log do servidor tem erro");
});

registrarGlobal("Global: o segredo da revalidação não aparece no log nem em resposta (VCACHE AC10)", (ctx) => {
  assert.ok(!ctx.serverOutput().includes(ctx.segredo), "segredo no log do servidor");
  for (const r of ctx.respostas()) {
    assert.ok(!r.text.includes(ctx.segredo), `segredo em ${r.metodo} ${r.caminho}`);
  }
});

// ── Execução ───────────────────────────────────────────────────────────────

const RAIZ = path.resolve(__dirname, "..");
const STOREFRONT_DIRECTORY = path.join(RAIZ, "vitrine");
const BIN_DO_NEXT = path.join(STOREFRONT_DIRECTORY, "node_modules", "next", "dist", "bin", "next");

/** Mata o processo e a árvore dele (no Windows o `kill` simples deixa filhos). */
function encerrarProcesso(filho: ChildProcess | null): void {
  if (!filho || filho.pid === undefined || filho.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(filho.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    filho.kill("SIGTERM");
  }
}

function executarAteSair(
  args: string[],
  env: Record<string, string | undefined>,
  redigir: (t: string) => string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [BIN_DO_NEXT, ...args], {
      cwd: STOREFRONT_DIRECTORY,
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    filho.stdout?.on("data", (parte) => (output += String(parte)));
    filho.stderr?.on("data", (parte) => (output += String(parte)));
    filho.on("error", reject);
    filho.on("exit", (codigo) => {
      if (codigo === 0) return resolve();
      reject(new Error(`next ${args.join(" ")} saiu com ${codigo}:\n${redigir(output).slice(-3000)}`));
    });
  });
}

async function esperarServidor(base: string, filho: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (filho.exitCode !== null) throw new Error(`next start saiu com ${filho.exitCode} antes de responder`);
    try {
      await fetch(`${base}/rota-de-prontidao`, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("a vitrine não respondeu a tempo");
}

async function algumServidorNaPorta(base: string): Promise<boolean> {
  try {
    await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}

export interface Result {
  name: string;
  ok: boolean;
  error?: string;
}

/** Roda as asserções (comuns e depois globais) e devolve o resultado de cada uma. */
export async function rodarAsercoes(ctx: Contexto): Promise<Result[]> {
  const resultados: Result[] = [];
  for (const { name, corpo } of [...comuns, ...globais]) {
    try {
      await corpo(ctx);
      resultados.push({ name, ok: true });
    } catch (e) {
      resultados.push({ name, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return resultados;
}

export async function main(): Promise<number> {
  if (!process.env["VITRINE_TEST_DB_PASSWORD"]) {
    console.error("VITRINE_TEST_DB_PASSWORD não definida no ambiente local: o e2e lê como o papel da vitrine.");
    return 1;
  }
  const segredo = randomBytes(24).toString("hex");
  let ambiente;
  try {
    ambiente = storefrontEnvironment({
      baseUrl: process.env.TEST_DATABASE_URL,
      password: process.env["VITRINE_TEST_DB_PASSWORD"],
      porta: PORTA_E2E,
      segredo,
    });
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }
  const base = `http://localhost:${PORTA_E2E}`;
  if (await algumServidorNaPorta(base)) {
    console.error(`A porta ${PORTA_E2E} já responde: feche o processo antes de rodar o e2e.`);
    return 1;
  }

  const redigir = (text: string) =>
    text.split(ambiente["VITRINE_DATABASE_URL"]).join("[url]").split(segredo).join("[segredo]");
  const { NODE_ENV: _ignorado, ...ambienteDoNext } = ambienteDoFilho(process.env, ambiente);
  void _ignorado;

  const { db, encerrar } = abrirBancoDeTeste();
  let servidor: ChildProcess | null = null;
  const instanciasExtras: ChildProcess[] = [];
  let output = "";
  let falhou = false;

  try {
    console.log("vitrine:e2e -> banco DE TESTE; fixture de sentinelas...");
    const fixture = await createStorefrontFixture(db);

    console.log("vitrine:e2e -> next build...");
    await executarAteSair(["build"], ambienteDoNext, redigir);

    console.log(`vitrine:e2e -> next start -p ${PORTA_E2E}...`);
    servidor = spawn(process.execPath, [BIN_DO_NEXT, "start", "-p", String(PORTA_E2E)], {
      cwd: STOREFRONT_DIRECTORY,
      env: ambienteDoNext as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    servidor.stdout?.on("data", (parte) => (output += String(parte)));
    servidor.stderr?.on("data", (parte) => (output += String(parte)));
    await esperarServidor(base, servidor);

    const registro: RespostaRegistrada[] = [];
    const ctx: Contexto = {
      base,
      segredo,
      fixture,
      db,
      serverOutput: () => output,
      respostas: () => registro,
      async iniciarInstancia(porta, sobrescritas) {
        let extraOutput = "";
        const processo = spawn(process.execPath, [BIN_DO_NEXT, "start", "-p", String(porta)], {
          cwd: STOREFRONT_DIRECTORY,
          env: { ...ambienteDoNext, ...sobrescritas } as NodeJS.ProcessEnv,
          stdio: ["ignore", "pipe", "pipe"],
        });
        instanciasExtras.push(processo);
        processo.stdout?.on("data", (parte) => (extraOutput += String(parte)));
        processo.stderr?.on("data", (parte) => (extraOutput += String(parte)));
        const baseExtra = `http://localhost:${porta}`;
        await esperarServidor(baseExtra, processo);
        return { base: baseExtra, output: () => extraOutput, parar: () => encerrarProcesso(processo) };
      },
      async pedir(caminho, opcoes = {}) {
        const resposta = await fetch(`${opcoes.base ?? base}${caminho}`, {
          method: opcoes.metodo ?? "GET",
          headers: opcoes.cabecalhos,
          body: opcoes.corpo,
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
        const buffer = Buffer.from(await resposta.arrayBuffer());
        const registrada: RespostaRegistrada = {
          metodo: opcoes.metodo ?? "GET",
          caminho,
          status: resposta.status,
          cabecalhos: resposta.headers,
          text: opcoes.binario ? "" : buffer.toString("utf8"),
        };
        registro.push(registrada);
        return registrada;
      },
    };

    const resultados = await rodarAsercoes(ctx);
    for (const r of resultados) {
      console.log(`${r.ok ? "  ok  " : " FALHA"} ${r.name}`);
      if (!r.ok) console.log(`        ${redigir(r.error ?? "").split("\n").join("\n        ")}`);
    }
    const reprovadas = resultados.filter((r) => !r.ok).length;
    console.log(`\nvitrine:e2e -> ${resultados.length - reprovadas} de ${resultados.length} asserções passaram`);
    falhou = reprovadas > 0;
  } catch (e) {
    console.error(redigir(e instanceof Error ? e.message : String(e)));
    falhou = true;
  } finally {
    encerrarProcesso(servidor);
    for (const extra of instanciasExtras) encerrarProcesso(extra);
    try {
      await removeStorefrontFixture(db);
    } catch (e) {
      console.error(`Falha ao remover a fixture: ${(e as Error).message}`);
      falhou = true;
    }
    await encerrar();
  }
  return falhou ? 1 : 0;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/storefront-e2e.ts")) {
  main().then(
    (codigo) => process.exit(codigo),
    (e) => {
      console.error(e);
      process.exit(1);
    }
  );
}
