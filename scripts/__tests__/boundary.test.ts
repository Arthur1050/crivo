import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import map from "../boundary/map.json";
import { checkClassification, classifyFile, type BoundaryRule } from "../boundary/check";

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
