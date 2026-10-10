/**
 * `npm run vitrine:e2e` — prova da vitrine por HTTP, contra a app rodando
 * (lote-16b — T14; VSEG-02, VCACHE-02, VSEO-01, VCAT-03).
 *
 * Sequência: fixture de sentinelas na branch de TESTE -> `next build` e
 * `next start` da vitrine com o papel `crivo_vitrine` e um segredo aleatório ->
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
import {
  abrirBancoDeTeste,
  criarFixtureVitrine,
  removerFixtureVitrine,
  type FixtureVitrine,
} from "./vitrine-fixture";
import { ambienteDaVitrine, ambienteDoFilho } from "./vitrine-dev";

/** Porta própria: o `vitrine:dev` fica na 3100 e pode estar aberto. */
export const PORTA_E2E = 3110;

export interface RespostaRegistrada {
  metodo: string;
  caminho: string;
  status: number;
  cabecalhos: Headers;
  /** Corpo como texto (vazio para binário). */
  texto: string;
}

export interface Contexto {
  base: string;
  segredo: string;
  fixture: FixtureVitrine;
  /** Faz a requisição e registra a resposta para as asserções globais. */
  pedir(
    caminho: string,
    opcoes?: { metodo?: string; cabecalhos?: Record<string, string>; corpo?: string; binario?: boolean }
  ): Promise<RespostaRegistrada>;
  /** O que o servidor imprimiu até agora (stdout e stderr). */
  saidaDoServidor(): string;
  /** Todas as respostas já registradas. */
  respostas(): readonly RespostaRegistrada[];
}

type Corpo = (ctx: Contexto) => Promise<void> | void;
interface Asercao {
  nome: string;
  corpo: Corpo;
}

const comuns: Asercao[] = [];
const globais: Asercao[] = [];

/** Registra uma asserção nomeada (roda na ordem de registro). */
export function registrar(nome: string, corpo: Corpo): void {
  comuns.push({ nome, corpo });
}

/** Registra uma asserção que roda depois de todas as outras. */
export function registrarGlobal(nome: string, corpo: Corpo): void {
  globais.push({ nome, corpo });
}

/** Texto visível de uma página neutra de não encontrado. */
const TEXTO_NEUTRO = "Página não encontrada";

/** Nenhuma loja de fixture pode aparecer numa página neutra (VCAT AC9). */
function semIdentidadeDeLoja(ctx: Contexto, texto: string): void {
  for (const loja of Object.values(ctx.fixture.lojas)) {
    assert.ok(!texto.includes(loja.nome), `a página cita a loja "${loja.nome}"`);
    assert.ok(!texto.includes(loja.slug), `a página cita o slug "${loja.slug}"`);
    assert.ok(!texto.includes(loja.razaoSocial), `a página cita a razão social "${loja.razaoSocial}"`);
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
    String(Buffer.byteLength(r.texto)),
    "a resposta não veio inteira (sem Content-Length)"
  );
  assert.ok(!r.texto.includes("<!--$?-->"), "limite Suspense pendente: a resposta saiu em streaming");
  assert.ok(!r.texto.includes("$RC("), "script de revelação do Suspense: a resposta saiu em streaming");
  assert.ok(r.texto.includes(TEXTO_NEUTRO), "falta a mensagem neutra");
  assert.match(r.texto, /<meta name="robots" content="noindex, nofollow"/);
  semIdentidadeDeLoja(ctx, r.texto);
});

registrar("T14 slug inválido → página de não encontrado neutra, sem marca de loja", async (ctx) => {
  for (const slug of ["Slug_Invalido", "UPPER", "com%20espaco"]) {
    const r = await ctx.pedir(`/c/${slug}`);
    assert.ok(r.texto.includes(TEXTO_NEUTRO), `/c/${slug}: falta a mensagem neutra`);
    assert.match(r.texto, /<meta name="robots" content="noindex, nofollow"/, `/c/${slug}: sem noindex`);
    semIdentidadeDeLoja(ctx, r.texto);
  }
});

registrar("T14 POST /api/revalidar com o segredo e um slug válido → 204 sem corpo", async (ctx) => {
  const r = await ctx.pedir("/api/revalidar", {
    metodo: "POST",
    cabecalhos: { authorization: `Bearer ${ctx.segredo}`, "content-type": "application/json" },
    corpo: JSON.stringify({ slug: ctx.fixture.lojas.a.slug }),
  });
  assert.equal(r.status, 204);
  assert.equal(r.texto, "");
});

registrar("T14 POST /api/revalidar sem segredo, com segredo errado ou vazio → 401", async (ctx) => {
  const corpo = JSON.stringify({ slug: ctx.fixture.lojas.a.slug });
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
      ...(metodo === "GET" ? {} : { corpo: JSON.stringify({ slug: ctx.fixture.lojas.a.slug }) }),
    });
    assert.equal(r.status, 405, metodo);
    assert.equal(r.cabecalhos.get("allow"), "POST", metodo);
  }
});

registrar("T14 a revalidação aceita sai no log com prefixo, slug e desfecho", async (ctx) => {
  assert.ok(
    ctx.saidaDoServidor().includes(`[vitrine] revalidar: ${ctx.fixture.lojas.a.slug} (204)`),
    "o log da revalidação 204 não apareceu"
  );
});

// ── T16: layout e tema da loja ─────────────────────────────────────────────

/** `<style>` do HTML, na ordem do documento. */
function blocosDeStyle(html: string): string[] {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/** Primeiro valor de uma propriedade CSS num bloco (`--color-accent: ...;`). */
function valorDaPropriedade(css: string, propriedade: string): string | null {
  const m = new RegExp(`${propriedade.replace(/[-]/g, "\\-")}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1].trim() : null;
}

/** Âncoras do HTML com href e texto interno (sem tags). */
function ancoras(html: string): Array<{ href: string; texto: string }> {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].flatMap((m) => {
    const href = /\bhref="([^"]*)"/.exec(m[1])?.[1];
    return href === undefined ? [] : [{ href, texto: m[2].replace(/<[^>]*>/g, "").trim() }];
  });
}

/** Marca, nome e cor de nenhuma loja: o slug pedido pode aparecer (a URL é do visitante). */
function semMarcaDeLoja(ctx: Contexto, texto: string): void {
  for (const loja of Object.values(ctx.fixture.lojas)) {
    assert.ok(!texto.includes(loja.nome), `cita a loja "${loja.nome}"`);
    assert.ok(!texto.includes(loja.razaoSocial), `cita a razão social "${loja.razaoSocial}"`);
    assert.ok(!texto.includes(loja.creci), `cita o CRECI "${loja.creci}"`);
    if (loja.cor) assert.ok(!texto.toLowerCase().includes(loja.cor), `contém a cor ${loja.cor}`);
  }
}

registrar("T16 loja inativa (C) e slug sem loja → não encontrado neutro, noindex, sem marca (status registrado)", async (ctx) => {
  for (const slug of [ctx.fixture.lojas.c.slug, "vt-e2e-sem-loja"]) {
    const r = await ctx.pedir(`/c/${slug}`);
    // F8 (gate T0): a página sai em streaming, então a doc manda HTTP 200 com a UI de não encontrado.
    assert.equal(r.status, 200, `/c/${slug}: status registrado (F8: 200 esperado pela doc)`);
    assert.ok(r.texto.includes(TEXTO_NEUTRO), `/c/${slug}: falta a mensagem neutra`);
    assert.match(r.texto, /<meta name="robots" content="noindex, nofollow"/, `/c/${slug}: sem noindex`);
    semMarcaDeLoja(ctx, r.texto);
    assert.ok(!r.texto.includes("astryx-theme"), `/c/${slug}: carrega o tema de uma loja`);
  }
});

registrar("T16 lojas A, B e D: o HTML sem JS traz o bloco de tema da própria loja (VTEMA AC2, AC7)", async (ctx) => {
  for (const loja of [ctx.fixture.lojas.a, ctx.fixture.lojas.b, ctx.fixture.lojas.d]) {
    const r = await ctx.pedir(`/c/${loja.slug}`);
    assert.equal(r.status, 200, loja.slug);
    const escopo = `@scope ([data-astryx-theme="loja-${loja.slug}"])`;
    const blocos = blocosDeStyle(r.texto).map((b) => b.trim());

    const dosTokens = blocos.filter((b) => b.startsWith("@layer astryx-theme {"));
    assert.equal(dosTokens.length, 1, `${loja.slug}: blocos @layer astryx-theme`);
    assert.ok(dosTokens[0].includes(escopo), `${loja.slug}: falta ${escopo} no bloco do tema`);

    const dosResets = blocos.filter((b) => b.startsWith("@layer reset {"));
    assert.equal(dosResets.length, 1, `${loja.slug}: blocos @layer reset`);
    assert.ok(dosResets[0].includes(escopo), `${loja.slug}: falta ${escopo} no bloco reset`);
    assert.ok(dosResets[0].includes(":where(h1, h2, h3, h4, h5, h6)"), `${loja.slug}: falta o seletor de títulos`);

    assert.match(
      r.texto,
      new RegExp(`<[a-z]+\\b[^>]*data-astryx-theme="loja-${loja.slug}"[^>]*>`),
      `${loja.slug}: falta o wrapper do tema`
    );
  }
});

registrar("T16 o HTML de uma loja não carrega o tema de outra", async (ctx) => {
  const { a, b, d } = ctx.fixture.lojas;
  const paginaA = await ctx.pedir(`/c/${a.slug}`);
  for (const outra of [b, d]) {
    assert.ok(!paginaA.texto.includes(`loja-${outra.slug}`), `o HTML de ${a.slug} cita loja-${outra.slug}`);
  }
});

registrar("T16 --color-accent de A, B e D é diferente entre si, sem comparar com hex literal (AD-046)", async (ctx) => {
  const acentos: Record<string, string> = {};
  for (const loja of [ctx.fixture.lojas.a, ctx.fixture.lojas.b, ctx.fixture.lojas.d]) {
    const r = await ctx.pedir(`/c/${loja.slug}`);
    const bloco = blocosDeStyle(r.texto).find((b) => b.trim().startsWith("@layer astryx-theme {"));
    assert.ok(bloco, `${loja.slug}: sem bloco de tema`);
    const acento = valorDaPropriedade(bloco, "--color-accent");
    assert.ok(acento, `${loja.slug}: sem --color-accent no bloco do tema`);
    acentos[loja.slug] = acento;
  }
  const { a, b, d } = ctx.fixture.lojas;
  assert.notEqual(acentos[a.slug], acentos[b.slug], "accent de A = accent de B");
  assert.notEqual(acentos[a.slug], acentos[d.slug], "accent de A = accent da loja sem cor (D)");
  assert.notEqual(acentos[b.slug], acentos[d.slug], "accent de B = accent da loja sem cor (D)");
});

registrar("T16 --font-family-body e --font-family-heading seguem a fonte de cada loja (VTEMA AC3)", async (ctx) => {
  const corpos: Record<string, string> = {};
  for (const loja of [ctx.fixture.lojas.a, ctx.fixture.lojas.b, ctx.fixture.lojas.d]) {
    const r = await ctx.pedir(`/c/${loja.slug}`);
    const bloco = blocosDeStyle(r.texto).find((b) => b.trim().startsWith("@layer astryx-theme {")) ?? "";
    const esperada = `var(--font-${loja.fonte})`;
    assert.equal(valorDaPropriedade(bloco, "--font-family-body"), esperada, `${loja.slug}: corpo`);
    assert.equal(valorDaPropriedade(bloco, "--font-family-heading"), esperada, `${loja.slug}: títulos`);
    corpos[loja.slug] = esperada;
  }
  const { a, b } = ctx.fixture.lojas;
  assert.notEqual(corpos[a.slug], corpos[b.slug], "A e B com a mesma fonte");
});

registrar("T16 rodapé com razão social, CRECI e aviso em A, B e D; contatos só quando a loja os tem (VLEGAL AC1–AC4)", async (ctx) => {
  const { a, b, d } = ctx.fixture.lojas;
  const aviso = "Preços e disponibilidade sujeitos a alteração sem aviso prévio.";
  for (const loja of [a, b, d]) {
    const r = await ctx.pedir(`/c/${loja.slug}`);
    assert.ok(r.texto.includes(loja.razaoSocial), `${loja.slug}: razão social`);
    assert.ok(r.texto.includes(loja.creci), `${loja.slug}: CRECI`);
    assert.ok(r.texto.includes(aviso), `${loja.slug}: aviso`);
  }

  const paginaA = (await ctx.pedir(`/c/${a.slug}`)).texto;
  const linksA = ancoras(paginaA).map((x) => x.href);
  assert.ok(paginaA.includes(a.endereco ?? ""), "A: endereço");
  assert.ok(linksA.includes(`https://instagram.com/${a.instagram}`), "A: link do Instagram");
  assert.ok(linksA.includes(`tel:+55${a.telefone}`), "A: link do telefone com o prefixo 55");

  const paginaB = (await ctx.pedir(`/c/${b.slug}`)).texto;
  const linksB = ancoras(paginaB).map((x) => x.href);
  assert.ok(!linksB.some((href) => href.includes("instagram.com")), "B (sem Instagram) mostra o link");
  assert.ok(linksB.includes(`tel:+55${b.telefone}`), "B: telefone de 11 dígitos recebe 55");
  assert.ok(!paginaB.includes("Rua Alfa"), "B mostra o endereço da A");
});

registrar("T16 o botão de WhatsApp do cabeçalho abre o wa.me com a mensagem de catálogo (VCAT AC12)", async (ctx) => {
  for (const loja of [ctx.fixture.lojas.a, ctx.fixture.lojas.b, ctx.fixture.lojas.d]) {
    const r = await ctx.pedir(`/c/${loja.slug}`);
    const botao = ancoras(r.texto).find((x) => x.texto.includes("Falar no WhatsApp"));
    assert.ok(botao, `${loja.slug}: sem botão "Falar no WhatsApp"`);
    const url = new URL(botao.href);
    assert.equal(url.origin + url.pathname, `https://wa.me/${loja.whatsappComPrefixo}`, loja.slug);
    assert.equal(
      url.searchParams.get("text"),
      `Olá! Vi a vitrine da ${loja.nome} e gostaria de atendimento.`,
      loja.slug
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
  for (const slug of [ctx.fixture.lojas.c.slug, "vt-e2e-sem-loja", "Slug_Invalido"]) {
    const r = await ctx.pedir(`/c/${slug}`);
    const visivel = htmlVisivel(r.texto);
    assert.ok(visivel.includes(TEXTO_NEUTRO), `/c/${slug}: a mensagem neutra não está no HTML visível`);
    assert.ok(!r.texto.includes("<!--$!-->"), `/c/${slug}: o limite caiu para render no cliente`);
    semMarcaDeLoja(ctx, visivel);
  }
});

registrar("T17 referência que não existe na loja A → não encontrado com a marca da A, o link do catálogo e noindex (VITEM AC5)", async (ctx) => {
  const { a, b } = ctx.fixture.lojas;
  for (const ref of ["ap-9999", "REF_INVALIDA$"]) {
    const r = await ctx.pedir(`/c/${a.slug}/imovel/${encodeURIComponent(ref)}`);
    const visivel = htmlVisivel(r.texto);
    assert.equal(r.status, 200, `${ref}: status registrado (F8: 200 pela doc)`);
    assert.ok(visivel.includes("Este imóvel não está mais disponível."), `${ref}: falta a mensagem no HTML visível`);
    assert.ok(!r.texto.includes("<!--$!-->"), `${ref}: o limite caiu para render no cliente`);
    const voltar = ancoras(visivel).find((x) => x.texto.includes("Ver todos os imóveis"));
    assert.equal(
      voltar?.href,
      `/c/${a.slug}`,
      `${ref}: link do catálogo (âncoras: ${JSON.stringify(ancoras(visivel))})`
    );
    assert.ok(visivel.includes(a.creci), `${ref}: CRECI da loja A`);
    assert.ok(visivel.includes(a.razaoSocial), `${ref}: razão social da loja A`);
    assert.match(r.texto, /<meta name="robots" content="noindex/, `${ref}: sem noindex`);
    assert.match(visivel, new RegExp(`data-astryx-theme="loja-${a.slug}"`), `${ref}: sem a marca da loja A`);
    assert.ok(!visivel.includes(b.nome), `${ref}: cita a loja B`);
  }
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
  const log = ctx.saidaDoServidor();
  for (const sentinela of ctx.fixture.sentinelas) {
    assert.ok(!log.includes(sentinela), `sentinela "${sentinela}" no log do servidor`);
    for (const r of ctx.respostas()) {
      assert.ok(!r.texto.includes(sentinela), `sentinela "${sentinela}" em ${r.metodo} ${r.caminho}`);
    }
  }
});

registrarGlobal("Global: o segredo da revalidação não aparece no log nem em resposta (VCACHE AC10)", (ctx) => {
  assert.ok(!ctx.saidaDoServidor().includes(ctx.segredo), "segredo no log do servidor");
  for (const r of ctx.respostas()) {
    assert.ok(!r.texto.includes(ctx.segredo), `segredo em ${r.metodo} ${r.caminho}`);
  }
});

// ── Execução ───────────────────────────────────────────────────────────────

const RAIZ = path.resolve(__dirname, "..");
const PASTA_DA_VITRINE = path.join(RAIZ, "vitrine");
const BIN_DO_NEXT = path.join(PASTA_DA_VITRINE, "node_modules", "next", "dist", "bin", "next");

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
      cwd: PASTA_DA_VITRINE,
      env: env as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let saida = "";
    filho.stdout?.on("data", (parte) => (saida += String(parte)));
    filho.stderr?.on("data", (parte) => (saida += String(parte)));
    filho.on("error", reject);
    filho.on("exit", (codigo) => {
      if (codigo === 0) return resolve();
      reject(new Error(`next ${args.join(" ")} saiu com ${codigo}:\n${redigir(saida).slice(-3000)}`));
    });
  });
}

async function esperarServidor(base: string, filho: ChildProcess, limiteMs = 60_000): Promise<void> {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
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

export interface Resultado {
  nome: string;
  ok: boolean;
  erro?: string;
}

/** Roda as asserções (comuns e depois globais) e devolve o resultado de cada uma. */
export async function rodarAsercoes(ctx: Contexto): Promise<Resultado[]> {
  const resultados: Resultado[] = [];
  for (const { nome, corpo } of [...comuns, ...globais]) {
    try {
      await corpo(ctx);
      resultados.push({ nome, ok: true });
    } catch (e) {
      resultados.push({ nome, ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return resultados;
}

export async function main(): Promise<number> {
  if (!process.env.VITRINE_TEST_DB_PASSWORD) {
    console.error("VITRINE_TEST_DB_PASSWORD não definida no ambiente local: o e2e lê como o papel da vitrine.");
    return 1;
  }
  const segredo = randomBytes(24).toString("hex");
  let ambiente;
  try {
    ambiente = ambienteDaVitrine({
      baseUrl: process.env.TEST_DATABASE_URL,
      password: process.env.VITRINE_TEST_DB_PASSWORD,
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

  const redigir = (texto: string) =>
    texto.split(ambiente.VITRINE_DATABASE_URL).join("[url]").split(segredo).join("[segredo]");
  const { NODE_ENV: _ignorado, ...ambienteDoNext } = ambienteDoFilho(process.env, ambiente);
  void _ignorado;

  const { db, encerrar } = abrirBancoDeTeste();
  let servidor: ChildProcess | null = null;
  let saida = "";
  let falhou = false;

  try {
    console.log("vitrine:e2e -> banco DE TESTE; fixture de sentinelas...");
    const fixture = await criarFixtureVitrine(db);

    console.log("vitrine:e2e -> next build...");
    await executarAteSair(["build"], ambienteDoNext, redigir);

    console.log(`vitrine:e2e -> next start -p ${PORTA_E2E}...`);
    servidor = spawn(process.execPath, [BIN_DO_NEXT, "start", "-p", String(PORTA_E2E)], {
      cwd: PASTA_DA_VITRINE,
      env: ambienteDoNext as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    servidor.stdout?.on("data", (parte) => (saida += String(parte)));
    servidor.stderr?.on("data", (parte) => (saida += String(parte)));
    await esperarServidor(base, servidor);

    const registro: RespostaRegistrada[] = [];
    const ctx: Contexto = {
      base,
      segredo,
      fixture,
      saidaDoServidor: () => saida,
      respostas: () => registro,
      async pedir(caminho, opcoes = {}) {
        const resposta = await fetch(`${base}${caminho}`, {
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
          texto: opcoes.binario ? "" : buffer.toString("utf8"),
        };
        registro.push(registrada);
        return registrada;
      },
    };

    const resultados = await rodarAsercoes(ctx);
    for (const r of resultados) {
      console.log(`${r.ok ? "  ok  " : " FALHA"} ${r.nome}`);
      if (!r.ok) console.log(`        ${redigir(r.erro ?? "").split("\n").join("\n        ")}`);
    }
    const reprovadas = resultados.filter((r) => !r.ok).length;
    console.log(`\nvitrine:e2e -> ${resultados.length - reprovadas} de ${resultados.length} asserções passaram`);
    falhou = reprovadas > 0;
  } catch (e) {
    console.error(redigir(e instanceof Error ? e.message : String(e)));
    falhou = true;
  } finally {
    encerrarProcesso(servidor);
    try {
      await removerFixtureVitrine(db);
    } catch (e) {
      console.error(`Falha ao remover a fixture: ${(e as Error).message}`);
      falhou = true;
    }
    await encerrar();
  }
  return falhou ? 1 : 0;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/vitrine-e2e.ts")) {
  main().then(
    (codigo) => process.exit(codigo),
    (e) => {
      console.error(e);
      process.exit(1);
    }
  );
}
