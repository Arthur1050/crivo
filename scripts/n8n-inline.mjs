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
 * Uso: `node scripts/n8n-inline.mjs`
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

export const DEFAULT_WORKFLOWS_DIR = join(REPO_ROOT, "n8n", "workflows");
export const DEFAULT_SRC_DIR = join(REPO_ROOT, "n8n", "src");
export const DEFAULT_GENERATED_DIR = join(REPO_ROOT, "n8n", "generated");

// Marcador: '__INLINE(<arquivo>)__' — aspas simples, sem espaços, nome de
// arquivo restrito a caracteres seguros (letras/números/ponto/hífen/underscore).
const MARKER_PATTERN = /'__INLINE\(([a-zA-Z0-9_.-]+)\)__'/g;

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
 * @param {string} srcDir
 * @returns {string}
 */
export function readInlinedModule(filename, srcDir = DEFAULT_SRC_DIR) {
  const filePath = join(srcDir, filename);
  if (!existsSync(filePath)) {
    throw new Error(
      `n8n-inline: marcador referencia arquivo inexistente n8n/src/${filename}`
    );
  }
  const raw = readFileSync(filePath, "utf8");
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
 * @param {string} srcDir
 * @returns {string}
 */
export function inlineWorkflowSource(sourceText, srcDir = DEFAULT_SRC_DIR) {
  return sourceText.replace(MARKER_PATTERN, (_match, filename) =>
    JSON.stringify(readInlinedModule(filename, srcDir))
  );
}

/**
 * Gera `n8n/generated/*.ts` a partir de todo `n8n/workflows/*.ts`,
 * substituindo os marcadores pelos módulos de `n8n/src/`. Determinístico:
 * mesma entrada -> mesmos bytes de saída, sempre (nenhum timestamp/random).
 * @param {{workflowsDir?: string, srcDir?: string, generatedDir?: string}} [options]
 * @returns {{file: string, generatedText: string}[]} um registro por arquivo gerado, na mesma ordem (alfabética)
 */
export function generateAll({
  workflowsDir = DEFAULT_WORKFLOWS_DIR,
  srcDir = DEFAULT_SRC_DIR,
  generatedDir = DEFAULT_GENERATED_DIR,
} = {}) {
  if (!existsSync(generatedDir)) {
    mkdirSync(generatedDir, { recursive: true });
  }

  const files = readdirSync(workflowsDir)
    .filter((name) => name.endsWith(".ts"))
    .sort();

  const results = [];
  for (const file of files) {
    const sourceText = readFileSync(join(workflowsDir, file), "utf8");
    const generatedText = inlineWorkflowSource(sourceText, srcDir);
    writeFileSync(join(generatedDir, file), generatedText, "utf8");
    results.push({ file, generatedText });
  }
  return results;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const generated = generateAll();
  for (const { file } of generated) {
    console.log(`n8n-inline: n8n/workflows/${file} -> n8n/generated/${file}`);
  }
  console.log(`n8n-inline: ${generated.length} arquivo(s) gerado(s).`);
}
