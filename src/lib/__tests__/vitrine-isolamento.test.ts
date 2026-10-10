import { ESLint } from "eslint";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
// AD-044: arquivos de teste da suíte raiz podem importar de `vitrine/`.
import vitrineConfig from "../../../vitrine/next.config";

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
const VITRINE = path.join(RAIZ, "vitrine");

// ---------------------------------------------------------------------------
// Regra de importação (VPROJ AC4): nada em `vitrine/` sai da pasta nem usa
// pacote que o `package.json` da vitrine não declara. `vitest` é aceito só em
// arquivos de `__tests__/` (ele roda no Vitest da raiz).
// ---------------------------------------------------------------------------

interface Arquivo {
  caminho: string;
  conteudo: string;
}
interface Violacao {
  arquivo: string;
  especificador: string;
  motivo: "sai-da-pasta" | "pacote-nao-declarado";
}

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`\\])\/\/.*$/gm, "$1");
}

function especificadoresDe(codigo: string): string[] {
  const limpo = semComentarios(codigo);
  const padroes = [
    /\b(?:import|export)\s[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  return padroes.flatMap((padrao) => [...limpo.matchAll(padrao)].map((m) => m[1]));
}

function pacoteDe(especificador: string): string {
  const partes = especificador.split("/");
  return especificador.startsWith("@") ? partes.slice(0, 2).join("/") : partes[0];
}

function verificarImports(
  arquivos: Arquivo[],
  declarados: ReadonlySet<string>,
  raiz: string
): Violacao[] {
  const nativos = new Set(builtinModules);
  const violacoes: Violacao[] = [];
  for (const { caminho, conteudo } of arquivos) {
    const emTestes = caminho.split(path.sep).includes("__tests__") || caminho.includes("/__tests__/");
    for (const especificador of especificadoresDe(conteudo)) {
      if (especificador.startsWith(".") || path.isAbsolute(especificador)) {
        const alvo = path.resolve(path.dirname(caminho), especificador);
        const relativo = path.relative(raiz, alvo);
        if (relativo.startsWith("..") || path.isAbsolute(relativo)) {
          violacoes.push({ arquivo: caminho, especificador, motivo: "sai-da-pasta" });
        }
        continue;
      }
      if (especificador.startsWith("node:")) continue;
      const pacote = pacoteDe(especificador);
      if (nativos.has(pacote)) continue;
      if (declarados.has(pacote)) continue;
      if (emTestes && pacote === "vitest") continue;
      violacoes.push({ arquivo: caminho, especificador, motivo: "pacote-nao-declarado" });
    }
  }
  return violacoes;
}

function arquivosDe(dir: string): string[] {
  const resultado: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name === ".next") continue;
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) resultado.push(...arquivosDe(completo));
    else resultado.push(completo);
  }
  return resultado;
}

describe("L16b T1 — a regra de importação recusa o que deve recusar (VPROJ-01 AC4)", () => {
  const raiz = path.join("/repo", "vitrine");
  const declarados = new Set(["next", "react", "drizzle-orm", "@astryxdesign/core"]);
  const arquivo = (nome: string, conteudo: string): Arquivo => ({
    caminho: path.join(raiz, nome),
    conteudo,
  });

  it("recusa import relativo que sai da pasta", () => {
    const violacoes = verificarImports(
      [arquivo("src/dados/a.ts", 'import { db } from "../../../src/db";')],
      declarados,
      raiz
    );
    expect(violacoes.map((v) => v.motivo)).toEqual(["sai-da-pasta"]);
  });

  it("recusa pacote não declarado no package.json da vitrine", () => {
    const violacoes = verificarImports(
      [arquivo("src/lib/a.ts", 'import { z } from "zod";\nexport { y } from "outro-pacote/sub";')],
      declarados,
      raiz
    );
    expect(violacoes.map((v) => [v.especificador, v.motivo])).toEqual([
      ["zod", "pacote-nao-declarado"],
      ["outro-pacote/sub", "pacote-nao-declarado"],
    ]);
  });

  it("recusa o alias @/ e o vitest fora de __tests__", () => {
    const violacoes = verificarImports(
      [
        arquivo("src/lib/a.ts", 'import x from "@/lib/x";'),
        arquivo("src/lib/b.ts", 'import { it } from "vitest";'),
      ],
      declarados,
      raiz
    );
    expect(violacoes.map((v) => v.especificador)).toEqual(["@/lib/x", "vitest"]);
  });

  it("aceita relativo interno, nativo do Node, pacote declarado (com subcaminho) e vitest em __tests__", () => {
    const violacoes = verificarImports(
      [
        arquivo(
          "src/lib/a.ts",
          [
            'import a from "./b";',
            'import c from "../dados/c";',
            'import { join } from "node:path";',
            'import { createHash } from "crypto";',
            'import { cacheTag } from "next/cache";',
            'import { Center } from "@astryxdesign/core/Center";',
            'import { pgSchema } from "drizzle-orm/pg-core";',
            "// import { x } from 'fora-da-lista' (comentário)",
          ].join("\n")
        ),
        arquivo("src/lib/__tests__/a.test.ts", 'import { it } from "vitest";'),
      ],
      declarados,
      raiz
    );
    expect(violacoes).toEqual([]);
  });
});

describe("L16b T1 — projeto da vitrine (VPROJ-01)", () => {
  const pacote = JSON.parse(readFileSync(path.join(VITRINE, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const arquivos = arquivosDe(VITRINE);

  it("AC1: tem package.json, next.config.ts, tsconfig.json e lint próprios", () => {
    for (const nome of ["package.json", "next.config.ts", "tsconfig.json", "eslint.config.mjs"]) {
      expect(existsSync(path.join(VITRINE, nome)), nome).toBe(true);
    }
    expect(Object.keys(pacote.scripts ?? {})).toEqual(
      expect.arrayContaining(["dev", "build", "start", "lint", "typecheck"])
    );
  });

  it("AC2: next.config.ts habilita cacheComponents e define o perfil vitrine 60/60/300 (VCACHE-01 AC2)", () => {
    expect(vitrineConfig.cacheComponents).toBe(true);
    expect(vitrineConfig.cacheLife?.vitrine).toEqual({ stale: 60, revalidate: 60, expire: 300 });
  });

  it("F19: turbopack.root aponta para a própria pasta vitrine/", () => {
    expect(vitrineConfig.turbopack?.root).toBe(path.resolve(VITRINE));
  });

  it("AC3: não há proxy.ts nem middleware.ts em vitrine/", () => {
    const proibidos = arquivos
      .map((arquivo) => path.basename(arquivo))
      .filter((nome) => /^(proxy|middleware)\.(ts|tsx|js|mjs|cjs)$/.test(nome));
    expect(proibidos).toEqual([]);
  });

  it("AC4: nenhum arquivo de vitrine/ importa de fora da pasta nem pacote não declarado", () => {
    const declarados = new Set([
      ...Object.keys(pacote.dependencies ?? {}),
      ...Object.keys(pacote.devDependencies ?? {}),
    ]);
    const fontes = arquivos
      .filter((arquivo) => /\.(ts|tsx|mts|js|jsx|mjs|cjs)$/.test(arquivo))
      .map((caminho) => ({ caminho, conteudo: readFileSync(caminho, "utf8") }));
    expect(fontes.length).toBeGreaterThan(0);
    expect(verificarImports(fontes, declarados, VITRINE)).toEqual([]);
  });

  it("os testes da vitrine ficam fora do tsc dela (importam o vitest da raiz)", () => {
    const leitura = ts.readConfigFile(path.join(VITRINE, "tsconfig.json"), ts.sys.readFile);
    const analisado = ts.parseJsonConfigFileContent(leitura.config, ts.sys, VITRINE);
    expect(analisado.raw.exclude).toContain("**/__tests__/**");
    expect(analisado.fileNames.filter((nome) => nome.includes("__tests__"))).toEqual([]);
  });
});

describe("L16b T1 — a raiz não enxerga vitrine/ (VPROJ-01 AC5)", () => {
  it("o tsconfig.json da raiz não inclui nenhum arquivo de vitrine/", () => {
    const leitura = ts.readConfigFile(path.join(RAIZ, "tsconfig.json"), ts.sys.readFile);
    const analisado = ts.parseJsonConfigFileContent(leitura.config, ts.sys, RAIZ);
    const pastaVitrine = `${path.resolve(VITRINE).split(path.sep).join("/")}/`;
    const daVitrine = analisado.fileNames.filter((nome) =>
      nome.split(path.sep).join("/").startsWith(pastaVitrine)
    );
    expect(analisado.fileNames.length).toBeGreaterThan(100);
    expect(daVitrine).toEqual([]);
  });

  it("o lint da raiz ignora vitrine/ e continua valendo para o resto", async () => {
    const eslint = new ESLint({ cwd: RAIZ });
    expect(await eslint.isPathIgnored(path.join(VITRINE, "app", "layout.tsx"))).toBe(true);
    expect(await eslint.isPathIgnored(path.join(RAIZ, "src", "lib", "format.ts"))).toBe(false);
  });
});
