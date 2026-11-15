import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderWorkflows } from "../n8n-inline.mjs";

// AGENT-02 AC1: a linha de comando grava o vertical pedido na pasta pedida, sem tocar em `n8n/generated/`.
const script = join("scripts", "n8n-inline.mjs");
const generatedDir = join("n8n", "generated");
const directories: string[] = [];

function outputDir() {
  const directory = mkdtempSync(join(tmpdir(), "n8n-inline-cli-"));
  directories.push(directory);
  return directory;
}

function run(args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function repositoryGenerated() {
  return Object.fromEntries(readdirSync(generatedDir).map((file) => [file, statSync(join(generatedDir, file)).mtimeMs]));
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("linha de comando do inliner (--vertical, --out)", () => {
  it.each([
    ["--out", []],
    ["--vertical real-estate --out", ["--vertical", "real-estate"]],
  ])("com %s, grava o vertical da imobiliária só na pasta pedida", (_label, verticalArgs) => {
    const before = repositoryGenerated();
    const out = outputDir();
    const result = run([...verticalArgs, "--out", out]);
    expect(result.status).toBe(0);
    const expected = renderWorkflows({ vertical: "real-estate" });
    expect(readdirSync(out).sort()).toEqual(expected.map(({ file }) => file));
    for (const { file, generatedText } of expected) {
      expect(readFileSync(join(out, file), "utf8")).toBe(generatedText);
      expect(result.stdout).toContain(`n8n-inline: ${join(out, file)}`);
    }
    expect(result.stdout).toContain(`n8n-inline: ${expected.length} arquivo(s) gerado(s).`);
    expect(repositoryGenerated()).toEqual(before);
  });

  it.each([
    ["sem manifesto", "inexistente", "n8n-inline: manifesto ausente para inexistente"],
    ["com nome inválido", "../real-estate", "n8n-inline: vertical inválido ../real-estate"],
  ])("recusa vertical %s sem gravar nada", (_label, vertical, message) => {
    const before = repositoryGenerated();
    const out = outputDir();
    const result = run(["--vertical", vertical, "--out", out]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(message);
    expect(readdirSync(out)).toEqual([]);
    expect(repositoryGenerated()).toEqual(before);
  });
});
