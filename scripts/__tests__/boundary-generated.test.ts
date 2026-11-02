import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import hashes from "../boundary/generated-hashes.json";
import { DEFAULT_GENERATED_DIR, DEFAULT_SRC_DIR, generateAll } from "../n8n-inline.mjs";

const directories: string[] = [];
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "krivo-generated-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function checkGenerated(directory: string): string[] {
  const files = readdirSync(directory).filter((file) => file.endsWith(".ts")).sort();
  const expectedFiles = Object.keys(hashes).sort();
  const failures: string[] = [];
  for (const file of new Set([...files, ...expectedFiles])) {
    if (!files.includes(file) || !expectedFiles.includes(file)) {
      failures.push(`${file}:1: arquivo ausente ou adicional`);
      continue;
    }
    const actual = readFileSync(join(directory, file), "utf8").replace(/\r\n/g, "\n");
    const hash = createHash("sha256").update(actual).digest("hex");
    if (hash === hashes[file as keyof typeof hashes]) continue;
    const expected = execFileSync("git", ["show", `bf5e646:n8n/generated/${file}`], {
      encoding: "utf8", maxBuffer: 10 * 1024 * 1024,
    }).replace(/\r\n/g, "\n");
    const actualLines = actual.split("\n");
    const expectedLines = expected.split("\n");
    let line = 0;
    while (line < Math.max(actualLines.length, expectedLines.length) && actualLines[line] === expectedLines[line]) line++;
    failures.push(`${file}:${line + 1}: primeira linha diferente da base`);
  }
  return failures;
}

describe("workflows idênticos à base (KEEP-02)", () => {
  it("regenera os nove arquivos temporariamente com os hashes de bf5e646", () => {
    const directory = temporaryDirectory();
    const generated = generateAll({ generatedDir: directory });
    expect(generated).toHaveLength(9);
    expect(checkGenerated(directory)).toEqual([]);
  });

  it("confere também os arquivos em disco", () => {
    expect(checkGenerated(DEFAULT_GENERATED_DIR)).toEqual([]);
  });

  it("detecta edição manual, citando arquivo e primeira linha diferente", () => {
    const directory = temporaryDirectory();
    cpSync(DEFAULT_GENERATED_DIR, directory, { recursive: true });
    const file = join(directory, "erros.ts");
    writeFileSync(file, "// alteração manual\n" + readFileSync(file, "utf8"));
    expect(checkGenerated(directory)).toEqual(["erros.ts:1: primeira linha diferente da base"]);
  });

  it("detecta uma mudança em gate.mjs mesmo sem regenerar o disco", () => {
    const sourceDirectory = temporaryDirectory();
    cpSync(DEFAULT_SRC_DIR, sourceDirectory, { recursive: true });
    const gate = join(sourceDirectory, "gate.mjs");
    writeFileSync(gate, readFileSync(gate, "utf8") + "\n// injeção de teste\n");
    const directory = temporaryDirectory();
    generateAll({ srcDir: sourceDirectory, generatedDir: directory });
    expect(checkGenerated(directory)).toContainEqual(expect.stringMatching(/^principal\.ts:\d+: primeira linha diferente da base$/));
  });
});
