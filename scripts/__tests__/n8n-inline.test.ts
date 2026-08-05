import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATED_DIR,
  DEFAULT_SRC_DIR,
  DEFAULT_WORKFLOWS_DIR,
  generateAll,
  inlineWorkflowSource,
  readInlinedModule,
} from "../n8n-inline.mjs";

// Diretórios de fixture isolados por teste (nunca a árvore real do repo,
// exceto nos testes que verificam explicitamente n8n/src/* real — T9,
// "Done when": inline determinístico testado, 2 execuções -> bytes idênticos).
const tempDirs: string[] = [];
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("readInlinedModule (T9 — AGT-09)", () => {
  it("remove o prefixo `export ` de `export function`, preservando o corpo", () => {
    const srcDir = makeTempDir("n8n-inline-src-");
    writeFileSync(
      join(srcDir, "sample.mjs"),
      'export function sample(a) {\n  return a + 1;\n}\n'
    );

    const result = readInlinedModule("sample.mjs", srcDir);

    expect(result).not.toContain("export function");
    expect(result).toContain("function sample(a)");
    expect(result).toContain("return a + 1;");
  });

  it("remove linhas `import { x } from \"./y.mjs\";` locais (dependência já inlined por outro marcador)", () => {
    const srcDir = makeTempDir("n8n-inline-src-");
    writeFileSync(
      join(srcDir, "dependent.mjs"),
      'import { helper } from "./helper.mjs";\n\nexport function useHelper(x) {\n  return helper(x);\n}\n'
    );

    const result = readInlinedModule("dependent.mjs", srcDir);

    expect(result).not.toContain("import");
    expect(result).toContain("function useHelper(x)");
    expect(result).toContain("return helper(x);");
  });

  it("preserva conteúdo com backtick/template literal e interpolação sem quebrar (motivo de usar JSON.stringify na substituição, não backtick)", () => {
    const srcDir = makeTempDir("n8n-inline-src-");
    writeFileSync(
      join(srcDir, "templated.mjs"),
      'export function greet(name) {\n  return `Olá, ${name}! Aspas: " e \'`;\n}\n'
    );

    const result = readInlinedModule("templated.mjs", srcDir);

    expect(result).toContain("`Olá, ${name}! Aspas: \" e '`");
  });

  it("lança erro claro quando o marcador referencia um arquivo inexistente (falha explícita, nunca silenciosa)", () => {
    const srcDir = makeTempDir("n8n-inline-src-");
    expect(() => readInlinedModule("nao-existe.mjs", srcDir)).toThrow(
      /nao-existe\.mjs/
    );
  });
});

describe("inlineWorkflowSource — substituição do marcador (T9 — AGT-09)", () => {
  it("substitui '__INLINE(arquivo.mjs)__' pelo módulo serializado via JSON.stringify — round-trip seguro mesmo com backtick/quebra de linha/aspas", () => {
    const srcDir = makeTempDir("n8n-inline-src-");
    const moduleSource =
      'export function withEverything(x) {\n  const s = `linha 1\nlinha 2 ${x} "aspas" \'aspas simples\' \\ barra`;\n  return s;\n}\n';
    writeFileSync(join(srcDir, "everything.mjs"), moduleSource);

    const sourceText = "const jsCode = '__INLINE(everything.mjs)__';";
    const generated = inlineWorkflowSource(sourceText, srcDir);

    // A string gerada é um literal JS/JSON válido: parseá-la via JSON.parse
    // (sintaxe de string JSON é um subconjunto da sintaxe de string JS — o
    // motor real do n8n avalia o mesmo texto como string literal) deve
    // devolver EXATAMENTE o módulo com `export ` removido.
    const literalMatch = generated.match(/const jsCode = ("(?:[^"\\]|\\.)*");/);
    expect(literalMatch).not.toBeNull();
    const roundTripped = JSON.parse(literalMatch![1]);
    expect(roundTripped).toBe(readInlinedModule("everything.mjs", srcDir));
  });

  it("substitui múltiplos marcadores no mesmo arquivo, cada um pelo seu próprio módulo", () => {
    const srcDir = makeTempDir("n8n-inline-src-");
    writeFileSync(join(srcDir, "a.mjs"), "export function a() { return 1; }\n");
    writeFileSync(join(srcDir, "b.mjs"), "export function b() { return 2; }\n");

    const sourceText =
      "const codeA = '__INLINE(a.mjs)__';\nconst codeB = '__INLINE(b.mjs)__';";
    const generated = inlineWorkflowSource(sourceText, srcDir);

    expect(generated).toContain(JSON.stringify(readInlinedModule("a.mjs", srcDir)));
    expect(generated).toContain(JSON.stringify(readInlinedModule("b.mjs", srcDir)));
    expect(generated).not.toContain("__INLINE(");
  });

  it("arquivo sem nenhum marcador é devolvido inalterado", () => {
    const srcDir = makeTempDir("n8n-inline-src-");
    const sourceText = "export default workflow('id', 'name').add(trigger);";
    expect(inlineWorkflowSource(sourceText, srcDir)).toBe(sourceText);
  });
});

describe("generateAll — pipeline completo workflows/ -> generated/ (T9 — Done when: 2 execuções -> bytes idênticos)", () => {
  it("gera um arquivo em generated/ por arquivo .ts em workflows/, ignorando não-.ts", () => {
    const workflowsDir = makeTempDir("n8n-inline-wf-");
    const srcDir = makeTempDir("n8n-inline-src-");
    const generatedDir = join(makeTempDir("n8n-inline-out-"), "generated");

    writeFileSync(join(srcDir, "pure.mjs"), "export function pure() { return true; }\n");
    writeFileSync(
      join(workflowsDir, "one.ts"),
      "const jsCode = '__INLINE(pure.mjs)__';"
    );
    writeFileSync(join(workflowsDir, "README.md"), "não é workflow, deve ser ignorado");

    const results = generateAll({ workflowsDir, srcDir, generatedDir });

    expect(results.map((r) => r.file)).toEqual(["one.ts"]);
    expect(results[0].generatedText).toContain(
      JSON.stringify(readInlinedModule("pure.mjs", srcDir))
    );
  });

  it("determinístico: rodar duas vezes seguidas sobre a mesma árvore produz bytes IDÊNTICOS em cada arquivo gerado", () => {
    const workflowsDir = makeTempDir("n8n-inline-wf-");
    const srcDir = makeTempDir("n8n-inline-src-");
    const generatedDirA = join(makeTempDir("n8n-inline-out-a-"), "generated");
    const generatedDirB = join(makeTempDir("n8n-inline-out-b-"), "generated");

    writeFileSync(
      join(srcDir, "gate-like.mjs"),
      'export function gate({ optedOutAt, text }) {\n  if (optedOutAt) return "somente-registrar";\n  return text ? "conversa" : "midia";\n}\n'
    );
    writeFileSync(
      join(workflowsDir, "principal.ts"),
      "const jsCode = '__INLINE(gate-like.mjs)__' + '\\nconst r = gate($json);\\nreturn { json: { r } };';"
    );

    const runOne = generateAll({ workflowsDir, srcDir, generatedDir: generatedDirA });
    const runTwo = generateAll({ workflowsDir, srcDir, generatedDir: generatedDirB });

    expect(runTwo).toEqual(runOne);
    expect(runTwo[0].generatedText).toBe(runOne[0].generatedText);
  });

  it("DETERMINISMO REAL (Done when): 2 execuções sobre n8n/workflows/ + n8n/src/ do repo produzem bytes idênticos por arquivo gerado", () => {
    // Usa a árvore real (não fixtures) — é literalmente o critério "Done
    // when" de T9: "inline determinístico testado (2 execuções -> bytes
    // idênticos)". Escreve em diretórios de saída temporários para não
    // depender de já existir n8n/generated/ no disco neste ponto do teste.
    const generatedDirA = join(makeTempDir("n8n-inline-real-a-"), "generated");
    const generatedDirB = join(makeTempDir("n8n-inline-real-b-"), "generated");
    mkdirSync(generatedDirA, { recursive: true });
    mkdirSync(generatedDirB, { recursive: true });

    const runOne = generateAll({
      workflowsDir: DEFAULT_WORKFLOWS_DIR,
      srcDir: DEFAULT_SRC_DIR,
      generatedDir: generatedDirA,
    });
    const runTwo = generateAll({
      workflowsDir: DEFAULT_WORKFLOWS_DIR,
      srcDir: DEFAULT_SRC_DIR,
      generatedDir: generatedDirB,
    });

    expect(runOne.length).toBeGreaterThan(0);
    expect(runTwo.map((r) => r.file)).toEqual(runOne.map((r) => r.file));
    for (let i = 0; i < runOne.length; i += 1) {
      expect(runTwo[i].generatedText).toBe(runOne[i].generatedText);
    }
  });

  it("gera de fato em n8n/generated/ quando chamado sem overrides (smoke do caminho default usado por `node scripts/n8n-inline.mjs`)", () => {
    const results = generateAll();
    expect(results.length).toBeGreaterThan(0);
    for (const { file } of results) {
      expect(file.endsWith(".ts")).toBe(true);
    }
    // n8n/generated/ é artefato gerado (não fixture de teste) — não faz
    // parte de tempDirs/cleanup; permanece em disco como saída real do
    // build, mesma pasta que `node scripts/n8n-inline.mjs` já produziu.
    expect(DEFAULT_GENERATED_DIR.endsWith(join("n8n", "generated"))).toBe(true);
  });
});
