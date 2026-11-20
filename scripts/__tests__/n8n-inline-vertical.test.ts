import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateAll } from "../n8n-inline.mjs";

const directories: string[] = [];
const workflow = [
  'const url = "__VALUE(crmBaseUrl)__";',
  "// __BLOCK(catalog)__",
  "// __IF(appointments)__",
  "const appointments = true;",
  "// __ENDIF__",
  "const genericCode = '__INLINE(generic.mjs)__';",
  "const verticalCode = '__INLINE(vertical.mjs)__';",
  "",
].join("\r\n");

function setup(overrides: Record<string, unknown> = {}, source = workflow) {
  const root = mkdtempSync(join(tmpdir(), "n8n-inline-vertical-"));
  directories.push(root);
  const verticalsDir = join(root, "verticals");
  const verticalDir = join(verticalsDir, "fixture");
  const srcDir = join(root, "src");
  const workflowsDir = join(root, "workflows");
  const generatedDir = join(root, "generated");
  const verticalSrcDir = join(verticalDir, "src");
  const blocksDir = join(verticalDir, "blocks");
  const verticalWorkflowsDir = join(verticalDir, "workflows");
  for (const directory of [srcDir, workflowsDir, verticalSrcDir, blocksDir, verticalWorkflowsDir]) {
    mkdirSync(directory, { recursive: true });
  }
  const agent = {
    appointments: false,
    values: { crmBaseUrl: "https://fixture.example" },
    blocks: ["catalog"],
    workflows: ["main", "only-in-fixture"],
    ...overrides,
  };
  writeFileSync(join(verticalDir, "agent.mjs"), "export const agent = " + JSON.stringify(agent));
  writeFileSync(join(workflowsDir, "main.ts"), source);
  writeFileSync(join(workflowsDir, "omitted.ts"), "// __BLOCK(ignored)__\n");
  writeFileSync(join(verticalWorkflowsDir, "only-in-fixture.ts"), "const fixture = true;\r\n");
  writeFileSync(join(srcDir, "generic.mjs"), "export const generic = 11;\n");
  writeFileSync(join(verticalSrcDir, "vertical.mjs"), "export const vertical = 22;\n");
  writeFileSync(join(blocksDir, "catalog.ts"), "const catalog = true;\r\n");
  return { root, srcDir, workflowsDir, generatedDir, vertical: "fixture", verticalsDir, verticalSrcDir, blocksDir };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("inliner por vertical", () => {
  it.each([false, true])("expande as marcas sem linhas extras com agendamento %s", (appointments) => {
    const options = setup({ appointments });
    const generated = generateAll(options);
    const expected = [
      'const url = "https://fixture.example";',
      "const catalog = true;",
      ...(appointments ? ["const appointments = true;"] : []),
      'const genericCode = "const generic = 11;";',
      'const verticalCode = "const vertical = 22;";',
      "",
    ].join("\n");
    expect(generated.map(({ file }) => file)).toEqual(["main.ts", "only-in-fixture.ts"]);
    expect(readdirSync(options.generatedDir).sort()).toEqual(["main.ts", "only-in-fixture.ts"]);
    expect(readFileSync(join(options.generatedDir, "main.ts"), "utf8")).toBe(expected);
    expect(readFileSync(join(options.generatedDir, "only-in-fixture.ts"), "utf8")).toBe("const fixture = true;\n");

    const secondOutput = join(options.root, "second");
    generateAll({ ...options, generatedDir: secondOutput });
    for (const { file } of generated) {
      expect(readFileSync(join(secondOutput, file))).toEqual(readFileSync(join(options.generatedDir, file)));
    }
  });

  it("identifica o bloco referenciado que está sem arquivo", () => {
    const options = setup();
    rmSync(join(options.blocksDir, "catalog.ts"));
    expect(() => generateAll(options)).toThrow(/bloco ausente catalog/);
  });

  it("identifica o bloco declarado sem referência", () => {
    const options = setup({ blocks: ["catalog", "unused"] });
    writeFileSync(join(options.blocksDir, "unused.ts"), "const unused = true;\n");
    expect(() => generateAll(options)).toThrow(/bloco sem referência unused/);
  });

  it.each([{}, { crmBaseUrl: null }, { crmBaseUrl: 123 }])("rejeita o valor ausente ou inválido %j", (values) => {
    expect(() => generateAll(setup({ values }))).toThrow(/valor ausente ou inválido crmBaseUrl/);
  });

  it("identifica módulo duplicado mesmo sem uma marca que o use", () => {
    const options = setup();
    writeFileSync(join(options.srcDir, "duplicate.mjs"), "export const value = 1;\n");
    writeFileSync(join(options.verticalSrcDir, "duplicate.mjs"), "export const value = 2;\n");
    expect(() => generateAll(options)).toThrow(/módulo duplicado duplicate\.mjs/);
  });

  it("identifica a condição que ficou aberta", () => {
    expect(() => generateAll(setup({}, workflow.replace("// __ENDIF__\r\n", ""))))
      .toThrow(/__IF\(appointments\)__ sem __ENDIF__/);
  });
});
