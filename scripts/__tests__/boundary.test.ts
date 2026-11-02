import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import map from "../boundary/map.json";
import transitional from "../boundary/transitional.json";
import { checkClassification, checkImports, classifyFile, isTest, type BoundaryRule } from "../boundary/check";

export function repositoryFiles(): string[] {
  function walk(directory: string): string[] {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = join(directory, entry.name).replace(/\\/g, "/");
      return entry.isDirectory() ? walk(file) : [file];
    });
  }
  return ["src", "app", "n8n", "scripts", "workflows"].flatMap(walk).concat("proxy.ts");
}

const rules = map as BoundaryRule[];

function repositorySources() {
  return Object.fromEntries(repositoryFiles().filter((file) => !isTest(file))
    .map((file) => [file, /\.[cm]?[jt]sx?$/.test(file) ? readFileSync(file, "utf8") : ""]));
}

describe("classificação da fronteira (BOUND-01)", () => {
  it("classifica a árvore real sem regra órfã e com pacote em todo arquivo core", () => {
    expect(checkClassification(repositoryFiles(), rules)).toEqual([]);
  });

  it("reprova arquivo sem classificação, citando o caminho", () => {
    expect(checkClassification(["src/new.ts"], [])).toEqual([
      { file: "src/new.ts", line: 1, message: "Arquivo sem classificação: src/new.ts" },
    ]);
  });

  it("reprova regra órfã, citando o caminho", () => {
    expect(checkClassification([], [{ glob: "src/missing.ts", layer: "app" }])).toEqual([
      { file: "src/missing.ts", line: 1, message: "Regra órfã: src/missing.ts" },
    ]);
  });

  it("exige pacote de destino para arquivo core", () => {
    expect(checkClassification(["src/core.ts"], [{ glob: "src/core.ts", layer: "core" }])).toEqual([
      { file: "src/core.ts", line: 1, message: "Arquivo core sem pacote: src/core.ts" },
    ]);
  });

  it("faz o teste herdar a classificação do módulo testado", () => {
    const fixture: BoundaryRule[] = [
      { glob: "src/lib/sample.ts", layer: "vertical" },
      { glob: "src/lib/**", layer: "core", package: "@core/client" },
    ];
    expect(classifyFile("src/lib/__tests__/sample.test.ts", fixture)).toEqual(fixture[0]);
    expect(checkClassification(["src/lib/sample.ts", "src/lib/__tests__/sample.test.ts"], fixture)).toEqual([]);
  });
});

describe("direção dos imports (BOUND-02/04)", () => {
  const fixture: BoundaryRule[] = [
    { glob: "src/core/**", layer: "core", package: "@core/server" },
    { glob: "src/client/**", layer: "core", package: "@core/client" },
    { glob: "src/vertical/**", layer: "vertical" },
    { glob: "app/**", layer: "app" },
  ];

  it("aceita a árvore real com as dependências transitórias atuais", () => {
    expect(checkImports(repositorySources(), rules, transitional)).toEqual([]);
  });

  it.each([
    ["src/core/sample.ts", "src/vertical/index.ts", "@/src/vertical"],
    ["src/core/sample.ts", "app/page.ts", "../../app/page"],
    ["src/vertical/sample.ts", "app/page.ts", "@/app/page"],
    ["src/client/sample.ts", "src/core/index.ts", "@/src/core"],
    ["src/client/sample.ts", "server-only", "server-only"],
  ])("recusa %s -> %s", (file, target, specifier) => {
    expect(checkImports({ [file]: `\nimport '${specifier}';`, [target]: "" }, fixture)).toEqual([
      { file, line: 2, message: `Import proibido: ${file} -> ${target}` },
    ]);
  });

  it.each(["export { sample } from '@/src/vertical';", "const sample = import('@/src/vertical');"])("checa reexportação e import dinâmico: %s", (source) => {
    expect(checkImports({ "src/core/sample.ts": source, "src/vertical/index.ts": "" }, fixture)).toEqual([
      { file: "src/core/sample.ts", line: 1, message: "Import proibido: src/core/sample.ts -> src/vertical/index.ts" },
    ]);
  });

  it("aceita só a ocorrência registrada e reprova a exceção quando ela fica órfã", () => {
    const entry = { path: "src/core/sample.ts", term: "import:src/vertical/index.ts", reason: "Costura pendente", removedIn: "L18a", category: "import" };
    expect(checkImports({ "src/core/sample.ts": "import '@/src/vertical';", "src/vertical/index.ts": "" }, fixture, [entry])).toEqual([]);
    expect(checkImports({ "src/core/sample.ts": "", "src/vertical/index.ts": "" }, fixture, [entry])).toEqual([
      { file: entry.path, line: 1, message: `Exceção sem ocorrência: ${entry.path} -> ${entry.term}` },
    ]);
  });
});
