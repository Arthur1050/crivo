/**
 * Inline determinístico de `n8n/src/*.mjs` (a camada de decisão pura, T5-T8)
 * nos marcadores `__INLINE(<arquivo>)__` dos workflows SDK em
 * `n8n/workflows/*.ts`, produzindo `n8n/generated/*.ts` — o código que de
 * fato é publicado na instância n8n via MCP (design.md — Componente 2;
 * AD-014: fonte no repo, publicação gerada de forma reproduzível).
 *
 * Convenção do marcador: dentro do valor de `parameters.jsCode` de um nó
 * `n8n-nodes-base.code`, o AUTOR do workflow escreve o marcador como uma
 * string literal isolada, concatenada (`+`) com o "harness" (o código de
 * cola específico daquele nó — leitura de `$json`, chamada da função pura,
 * formato de retorno esperado pelo Code node):
 *
 *   jsCode:
 *     '__INLINE(gate.mjs)__' +
 *     '\n\nconst route = gate({ optedOutAt: $json.optedOutAt, ... });\n' +
 *     'return { json: { ...$json, route } };\n',
 *
 * Cada ocorrência de `'__INLINE(<arquivo>)__'` (aspas simples incluídas) é
 * substituída pelo resultado de `JSON.stringify(<fonte inlined>)` — uma
 * string literal válida em qualquer contexto TS/JS, imune a aspas/backticks/
 * quebras de linha que o módulo original contenha (ex.: `prompt.mjs` usa
 * template literals com backtick internamente; textualmente colar isso
 * dentro de OUTRO template literal quebraria a sintaxe — por isso o marcador
 * nunca é um backtick e a substituição sempre passa por `JSON.stringify`).
 *
 * Dependência entre módulos de `n8n/src/` (hoje só `validate-llm.mjs`
 * importa `business-hours.mjs`): a linha `import { x } from "./y.mjs"` é
 * removida do texto inlined — é responsabilidade do AUTOR do workflow
 * colocar o marcador do módulo dependido (`business-hours.mjs`) ANTES do
 * marcador do módulo dependente (`validate-llm.mjs`) no mesmo `jsCode`, para
 * que `isSlotWithinBusinessHours` já esteja definida no escopo quando
 * `validateLlmOutput` for chamada. Documentado também em `n8n/README.md`.
 *
 * Determinismo: transformação puramente textual (sem timestamp, sem
 * random, sem depender de ordem de objeto não determinística) — rodar este
 * script duas vezes seguidas sobre a mesma árvore produz bytes idênticos em
 * `n8n/generated/` (coberto por `scripts/__tests__/n8n-inline.test.ts`).
 *
 * Uso: `node scripts/n8n-inline.mjs [--vertical <id>] [--out <pasta>]`
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const require = createRequire(import.meta.url);

export const DEFAULT_WORKFLOWS_DIR = join(REPO_ROOT, "n8n", "workflows");
export const DEFAULT_SRC_DIR = join(REPO_ROOT, "n8n", "src");
export const DEFAULT_GENERATED_DIR = join(REPO_ROOT, "n8n", "generated");
const DEFAULT_VERTICAL = "real-estate";
const DEFAULT_VERTICALS_DIR = join(REPO_ROOT, "n8n", "verticals");

// Marcador: '__INLINE(<arquivo>)__' — aspas simples, sem espaços, nome de
// arquivo restrito a caracteres seguros (letras/números/ponto/hífen/underscore).
const MARKER_PATTERN = /'__INLINE\(([a-zA-Z0-9_.-]+)\)__'/g;
const CONDITIONAL_PATTERN = /^[ \t]*\/\/ __(?:IF\(([a-zA-Z0-9_-]+)\)__|(ENDIF)__)[ \t]*(?:\n|$)/gm;
const BLOCK_PATTERN = /^[ \t]*\/\/ __BLOCK\(([a-zA-Z0-9_-]+)\)__[ \t]*(\n|$)/gm;
const VALUE_PATTERN = /__VALUE\(([a-zA-Z0-9_-]+)\)__/g;

// `export function foo(...)` -> `function foo(...)`, `export const X = ...`
// -> `const X = ...` (e `export let`/`export class`, por simetria — só
// `export function`/`export const` existem em n8n/src/*.mjs hoje, mas o
// padrão vale para as quatro formas de declaração top-level do JS).
const EXPORT_DECLARATION_PATTERN = /^export (function|const|let|class)\b/gm;

// Remove imports locais entre módulos de n8n/src (`import { x } from
// "./y.mjs";`) — a resolução da dependência é responsabilidade de quem
// ordena os marcadores no jsCode (ver docstring acima).
const IMPORT_LINE_PATTERN = /^import\s*\{[^}]*\}\s*from\s*["'][^"']+["'];?\s*$/gm;

/**
 * Lê `n8n/src/<filename>` e devolve o texto pronto para ser inlined num
 * Code node: sem `import` locais, sem `export` — só declarações de função
 * direto no escopo do script.
 * @param {string} filename - ex.: "gate.mjs"
 * @param {string | string[]} srcDir
 * @returns {string}
 */
export function readInlinedModule(filename, srcDir = DEFAULT_SRC_DIR) {
  const matches = [srcDir].flat().map((dir) => join(dir, filename)).filter(existsSync);
  if (matches.length > 1) {
    throw new Error("n8n-inline: módulo duplicado " + filename);
  }
  if (matches.length === 0) {
    throw new Error(
      `n8n-inline: marcador referencia arquivo inexistente n8n/src/${filename}`
    );
  }
  // Com `core.autocrlf=true` (Windows) o checkout grava as fontes com CRLF.
  // Sem normalizar, o CR entra no código inlined e o mesmo commit gera um
  // workflow diferente conforme a máquina — o hash publicado deixa de bater.
  const raw = readSource(matches[0]);
  return raw
    .replace(IMPORT_LINE_PATTERN, "")
    .replace(EXPORT_DECLARATION_PATTERN, "$1")
    .trim();
}

/**
 * Substitui todo marcador `'__INLINE(<arquivo>)__'` presente em
 * `sourceText` pelo módulo correspondente de `srcDir`, serializado via
 * `JSON.stringify` (string literal segura para qualquer conteúdo).
 * @param {string} sourceText - conteúdo de um arquivo `n8n/workflows/*.ts`
 * @param {string | string[]} srcDir
 * @returns {string}
 */
export function inlineWorkflowSource(sourceText, srcDir = DEFAULT_SRC_DIR) {
  return sourceText.replace(MARKER_PATTERN, (_match, filename) =>
    JSON.stringify(readInlinedModule(filename, srcDir))
  );
}

function readSource(filePath) {
  return readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function applyConditionals(sourceText, agent) {
  const conditions = [];
  let offset = 0;
  let result = "";
  for (const { 0: marker, 1: key, index } of sourceText.matchAll(CONDITIONAL_PATTERN)) {
    if (conditions.every((condition) => agent[condition] === true)) {
      result += sourceText.slice(offset, index);
    }
    if (key) {
      conditions.push(key);
    } else if (conditions.pop() === undefined) {
      throw new Error("n8n-inline: __ENDIF__ sem __IF");
    }
    offset = index + marker.length;
  }
  if (conditions.length > 0) {
    throw new Error("n8n-inline: __IF(" + conditions.at(-1) + ")__ sem __ENDIF__");
  }
  return result + sourceText.slice(offset);
}

function applyManifest(sourceText, agent, blocksDir, usedBlocks) {
  return applyConditionals(sourceText, agent)
    .replace(BLOCK_PATTERN, (_match, name, lineEnding) => {
      const blockPath = join(blocksDir, name + ".ts");
      if (!agent.blocks.includes(name) || !existsSync(blockPath)) {
        throw new Error("n8n-inline: bloco ausente " + name);
      }
      usedBlocks.add(name);
      // O bloco contém o recuo do SDK. A quebra final vem da linha da marca.
      return readSource(blockPath).replace(/\n$/, "") + lineEnding;
    })
    .replace(VALUE_PATTERN, (_match, name) => {
      const value = Object.hasOwn(agent.values, name) ? agent.values[name] : undefined;
      if (typeof value !== "string") {
        throw new Error("n8n-inline: valor ausente ou inválido " + name);
      }
      return value;
    });
}

function listFiles(dir, extension) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name);
}

/**
 * Gera `n8n/generated/*.ts` a partir de todo `n8n/workflows/*.ts`,
 * substituindo os marcadores pelos módulos de `n8n/src/`. Determinístico:
 * mesma entrada -> mesmos bytes de saída, sempre (nenhum timestamp/random).
 * @param {{workflowsDir?: string, srcDir?: string, generatedDir?: string, vertical?: string, verticalsDir?: string}} [options]
 * @returns {{file: string, generatedText: string}[]} um registro por arquivo gerado, na mesma ordem (alfabética)
 */
export function generateAll({
  workflowsDir = DEFAULT_WORKFLOWS_DIR,
  srcDir = DEFAULT_SRC_DIR,
  generatedDir = DEFAULT_GENERATED_DIR,
  vertical = DEFAULT_VERTICAL,
  verticalsDir = DEFAULT_VERTICALS_DIR,
} = {}) {
  if (!/^[a-zA-Z0-9_-]+$/.test(vertical)) {
    throw new Error("n8n-inline: vertical inválido " + vertical);
  }
  const verticalDir = join(verticalsDir, vertical);
  const manifestPath = join(verticalDir, "agent.mjs");
  // O manifesto da imobiliária passa a existir quando as fontes forem separadas.
  const agent = existsSync(manifestPath) ? require(resolve(manifestPath)).agent : undefined;
  if (!agent && vertical !== DEFAULT_VERTICAL) {
    throw new Error("n8n-inline: manifesto ausente para " + vertical);
  }
  const verticalSrcDir = join(verticalDir, "src");
  const srcDirs = [srcDir, verticalSrcDir];
  const genericModules = new Set(listFiles(srcDir, ".mjs"));
  for (const file of listFiles(verticalSrcDir, ".mjs")) {
    if (genericModules.has(file)) {
      throw new Error("n8n-inline: módulo duplicado " + file);
    }
  }

  const workflows = new Map();
  for (const dir of [workflowsDir, join(verticalDir, "workflows")]) {
    for (const file of listFiles(dir, ".ts")) {
      if (agent && !agent.workflows.includes(file.slice(0, -3))) continue;
      if (workflows.has(file)) {
        throw new Error("n8n-inline: workflow duplicado " + file);
      }
      workflows.set(file, join(dir, file));
    }
  }

  const usedBlocks = new Set();
  const results = [...workflows.keys()].sort().map((file) => {
    const sourceText = readSource(workflows.get(file));
    const expanded = agent
      ? applyManifest(sourceText, agent, join(verticalDir, "blocks"), usedBlocks)
      : sourceText;
    return { file, generatedText: inlineWorkflowSource(expanded, srcDirs) };
  });
  for (const block of agent?.blocks ?? []) {
    if (!usedBlocks.has(block)) {
      throw new Error("n8n-inline: bloco sem referência " + block);
    }
  }

  mkdirSync(generatedDir, { recursive: true });
  for (const { file, generatedText } of results) {
    writeFileSync(join(generatedDir, file), generatedText, "utf8");
  }
  return results;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const { values } = parseArgs({
    options: { vertical: { type: "string" }, out: { type: "string" } },
  });
  const generatedDir = values.out ?? DEFAULT_GENERATED_DIR;
  const generated = generateAll({ vertical: values.vertical, generatedDir });
  for (const { file } of generated) {
    console.log(`n8n-inline: ${join(generatedDir, file)}`);
  }
  console.log(`n8n-inline: ${generated.length} arquivo(s) gerado(s).`);
}
