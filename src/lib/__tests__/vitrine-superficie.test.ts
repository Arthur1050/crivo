import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Superfície da vitrine (lote-16b, fechamento): o que não pode existir em
 * `vitrine/` e que nenhum teste de comportamento provaria, porque o defeito
 * é uma rota, uma tag ou um arquivo a mais.
 *
 * - VSEG AC6: `POST /api/revalidar` é a única rota que aceita escrita.
 * - VTEMA AC8: páginas só com componentes e tokens da Astryx, sem `style`,
 *   sem `<div>` de layout e sem CSS escrito à mão (exceções sancionadas).
 * - VSEO AC3: sem sitemap e sem `Disallow` em `robots.txt`.
 * - VTEMA AC1: o tema da loja é montado em `mode="light"`.
 *
 * É teste da suíte raiz que lê arquivos de `vitrine/` (AD-044).
 */

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const VITRINE = path.join(RAIZ, "vitrine");

const PASTAS_IGNORADAS = new Set(["node_modules", ".next", "__tests__", "public"]);

function listar(pasta: string, aceita: (arquivo: string) => boolean): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(pasta, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (PASTAS_IGNORADAS.has(entrada.name)) continue;
      achados.push(...listar(path.join(pasta, entrada.name), aceita));
    } else if (aceita(entrada.name)) {
      achados.push(path.join(pasta, entrada.name));
    }
  }
  return achados;
}

function relativo(arquivo: string): string {
  return path.relative(VITRINE, arquivo).split(path.sep).join("/");
}

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`\\])\/\/.*$/gm, "$1");
}

const codigoDaVitrine = [
  ...listar(path.join(VITRINE, "app"), (nome) => /\.(ts|tsx)$/.test(nome)),
  ...listar(path.join(VITRINE, "src"), (nome) => /\.(ts|tsx)$/.test(nome)),
].map((arquivo) => ({ arquivo: relativo(arquivo), codigo: semComentarios(readFileSync(arquivo, "utf8")) }));

/** O Satori só renderiza `div` com `style` inline; o cartão não é página nem passa pela Astryx. */
const CARTAO_DE_COMPARTILHAMENTO = "app/c/[slug]/opengraph-image.tsx";
/** Os dois `<style>` com a saída de `generateThemeCSS` (AD-046). */
const PROVEDOR_DO_TEMA = "src/tema/tema-da-loja-provider.tsx";

describe("VPROJ AC6: o banco só entra por VITRINE_DATABASE_URL", () => {
  it("nenhum arquivo da vitrine lê a DATABASE_URL do CRM nem outra variável de conexão", () => {
    const padrao = /process\.env\.([A-Z0-9_]*(?:DATABASE|POSTGRES|PG)[A-Z0-9_]*)/g;
    const leituras = codigoDaVitrine.flatMap(({ arquivo, codigo }) =>
      [...codigo.matchAll(padrao)].map((m) => `${arquivo}: ${m[1]}`)
    );
    expect(leituras.length).toBeGreaterThan(0);
    expect(leituras.filter((leitura) => !leitura.endsWith(": VITRINE_DATABASE_URL"))).toEqual([]);
  });
});

describe("VSEG AC6: só POST /api/revalidar aceita escrita", () => {
  it("há um único arquivo de rota na vitrine: app/api/revalidar/route.ts", () => {
    const rotas = listar(path.join(VITRINE, "app"), (nome) => /^route\.(ts|tsx|js|jsx)$/.test(nome)).map(relativo);
    expect(rotas).toEqual(["app/api/revalidar/route.ts"]);
  });

  it("a rota exporta POST e os demais métodos de escrita só respondem 405", () => {
    const fonte = semComentarios(readFileSync(path.join(VITRINE, "app/api/revalidar/route.ts"), "utf8"));
    const exportados = [...fonte.matchAll(/export\s+(?:async\s+function|const|function)\s+([A-Z]+)\b/g)].map((m) => m[1]);
    expect(exportados.sort()).toEqual(["DELETE", "GET", "PATCH", "POST", "PUT"]);
    for (const metodo of ["GET", "PUT", "PATCH", "DELETE"]) {
      expect(fonte).toContain(`export const ${metodo} = naoPermitido;`);
    }
  });

  it('nenhum arquivo da vitrine tem server action ("use server")', () => {
    const comAcao = codigoDaVitrine.filter(({ codigo }) => /['"]use server['"]/.test(codigo)).map((x) => x.arquivo);
    expect(comAcao).toEqual([]);
  });
});

describe("VTEMA AC8: páginas só com componentes e tokens da Astryx", () => {
  it("nenhum arquivo tem atributo style, fora o cartão de compartilhamento", () => {
    const comStyle = codigoDaVitrine
      .filter(({ arquivo, codigo }) => arquivo !== CARTAO_DE_COMPARTILHAMENTO && /\sstyle\s*=/.test(codigo))
      .map((x) => x.arquivo);
    expect(comStyle).toEqual([]);
  });

  it("nenhum arquivo tem <div> nem <span> de layout, fora o cartão de compartilhamento", () => {
    const comTagDeLayout = codigoDaVitrine
      .filter(({ arquivo, codigo }) => arquivo !== CARTAO_DE_COMPARTILHAMENTO && /<(div|span)[\s>]/.test(codigo))
      .map((x) => x.arquivo);
    expect(comTagDeLayout).toEqual([]);
  });

  it("<style> só no provedor do tema e nenhum HTML injetado", () => {
    const comStyleTag = codigoDaVitrine.filter(({ codigo }) => /<style[\s>]/.test(codigo)).map((x) => x.arquivo);
    expect(comStyleTag).toEqual([PROVEDOR_DO_TEMA]);
    const comHtmlInjetado = codigoDaVitrine.filter(({ codigo }) => codigo.includes("dangerouslySetInnerHTML")).map((x) => x.arquivo);
    expect(comHtmlInjetado).toEqual([]);
  });

  it("o único CSS do projeto é app/globals.css e só declara camadas e importações", () => {
    const folhas = listar(VITRINE, (nome) => nome.endsWith(".css")).map(relativo);
    expect(folhas).toEqual(["app/globals.css"]);
    const css = readFileSync(path.join(VITRINE, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const declaracoes = css.split(";").map((trecho) => trecho.trim()).filter(Boolean);
    expect(declaracoes.length).toBeGreaterThan(0);
    for (const declaracao of declaracoes) {
      expect(declaracao, declaracao).toMatch(/^@(layer|import)\b/);
      expect(declaracao, declaracao).not.toContain("{");
    }
  });
});

describe("VSEO AC3: sem sitemap e sem Disallow", () => {
  it("não há robots, sitemap nem arquivo equivalente em app/ ou public/", () => {
    const candidatos = [
      "app/robots.ts",
      "app/robots.js",
      "app/robots.txt",
      "app/sitemap.ts",
      "app/sitemap.js",
      "app/sitemap.xml",
      "public/robots.txt",
      "public/sitemap.xml",
    ];
    expect(candidatos.filter((c) => existsSync(path.join(VITRINE, c)))).toEqual([]);
  });

  it('nenhum arquivo da vitrine escreve "Disallow"', () => {
    const comDisallow = codigoDaVitrine.filter(({ codigo }) => /disallow/i.test(codigo)).map((x) => x.arquivo);
    expect(comDisallow).toEqual([]);
  });
});

describe("VTEMA AC1: o tema da loja é montado em modo claro", () => {
  it('o provedor renderiza <Theme theme={tema} mode="light">', () => {
    const provedor = codigoDaVitrine.find((x) => x.arquivo === PROVEDOR_DO_TEMA);
    expect(provedor).toBeDefined();
    expect(provedor?.codigo).toMatch(/<Theme\s+theme=\{tema\}\s+mode="light">/);
  });
});

describe("VCAT AC3: o controle de paginação navega pelo destino testado", () => {
  it("o componente usa urlDaPagina e não monta a URL por conta própria", () => {
    const componente = codigoDaVitrine.find((x) => x.arquivo === "src/templates/comum/paginacao.tsx");
    expect(componente).toBeDefined();
    expect(componente?.codigo).toContain("urlDaPagina(caminho, destino)");
    expect(componente?.codigo).not.toContain("?pagina=");
  });
});
