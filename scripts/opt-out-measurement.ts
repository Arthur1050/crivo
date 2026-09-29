/**
 * Identidade do classificador de opt-out e carimbo da medição (lote-13 — T7,
 * OPTMED-01 AC8).
 *
 * A identidade é o sha256 do JSON canônico (chaves ordenadas, arrays na
 * ordem) de exatamente:
 * - do nó `Classificador: opt-out`: `parameters.inputText`,
 *   `parameters.categories` (a ordem das categorias define o índice de saída),
 *   `parameters.options` (`multiClass`, `fallback`, `systemPromptTemplate`,
 *   `enableAutoFixing`) e `onError`;
 * - do nó `lmChatOpenAi` ligado a ele por `ai_languageModel` (achado pelas
 *   conexões, nunca pela ordem dos nós): `parameters.model` e
 *   `parameters.options`;
 * - do fonte de `n8n/src/opt-out-intent.mjs`, com CRLF normalizado.
 * Posição, id, nome e `typeVersion` dos nós ficam de fora. Mudou qualquer
 * item acima, a medição aprovada deixa de valer.
 *
 * Subcomandos (lê `n8n/workflows/principal.ts`, o agente publicado):
 *   identity                  imprime o hash atual.
 *   stamp <relatorio.json>    grava `classifierHash`, `modelId` (modelo do
 *                             classificador) e `date` no relatório que o
 *                             `crivo-medicao-opt-out` devolveu.
 *
 * Uso: npx tsx scripts/opt-out-measurement.ts identity
 *      npx tsx scripts/opt-out-measurement.ts stamp <relatorio.json>
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CLASSIFIER_NODE = "Classificador: opt-out";
export const INTENT_SOURCE_PATH = "n8n/src/opt-out-intent.mjs";
export const PRINCIPAL_PATH = "n8n/workflows/principal.ts";

export interface WorkflowNodeJson {
  name: string;
  type?: string;
  typeVersion?: number;
  id?: string;
  position?: unknown;
  onError?: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

type Connection = { node: string; type?: string; index?: number };

export interface WorkflowJson {
  nodes: WorkflowNodeJson[];
  connections: Record<string, Record<string, Array<Connection[] | null | undefined>>>;
  [key: string]: unknown;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

function classifierNodes(workflowJson: WorkflowJson) {
  const classifier = workflowJson.nodes.find((node) => node.name === CLASSIFIER_NODE);
  if (!classifier) throw new Error(`Nó "${CLASSIFIER_NODE}" não encontrado no workflow.`);

  const modelNames = Object.entries(workflowJson.connections)
    .filter(([, outputs]) => (outputs.ai_languageModel ?? []).some((list) => (list ?? []).some((c) => c.node === CLASSIFIER_NODE)))
    .map(([source]) => source);
  if (modelNames.length !== 1) {
    throw new Error(`Esperado 1 nó de modelo ligado a "${CLASSIFIER_NODE}" por ai_languageModel; encontrado ${modelNames.length}.`);
  }
  const model = workflowJson.nodes.find((node) => node.name === modelNames[0]);
  if (!model) throw new Error(`Nó de modelo "${modelNames[0]}" do classificador não encontrado no workflow.`);
  return { classifier, model };
}

export function classifierIdentity(workflowJson: WorkflowJson, intentSource: string): string {
  const { classifier, model } = classifierNodes(workflowJson);
  const params = classifier.parameters ?? {};
  const modelParams = model.parameters ?? {};
  const payload = canonical({
    classificador: {
      inputText: params.inputText,
      categories: params.categories,
      options: params.options,
      onError: classifier.onError,
    },
    modelo: { model: modelParams.model, options: modelParams.options },
    intentSource: intentSource.replace(/\r\n/g, "\n"),
  });
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/** Snapshot do modelo do classificador (`parameters.model.value`). */
export function classifierModelId(workflowJson: WorkflowJson): string {
  const { model } = classifierNodes(workflowJson);
  const value = (model.parameters?.model as { value?: unknown } | undefined)?.value;
  if (typeof value !== "string" || value === "") throw new Error("Modelo do classificador sem id.");
  return value;
}

export function stampReport<T extends object>(
  report: T,
  stamp: { classifierHash: string; modelId: string; date: string }
): T & { classifierHash: string; modelId: string; date: string } {
  return { ...report, ...stamp };
}

/**
 * Diretórios onde a medição aprovada pode estar: o da feature e o do arquivo
 * morto (a higiene documental, AD-029, move os relatórios para `archive/`).
 */
export const MEASUREMENT_DIRS = [
  ".specs/features/lote-13-opt-out-linguagem-natural",
  ".specs/archive/lote-13-opt-out-linguagem-natural",
];

type MeasurementSummary = { file: string; veredito: string; classifierHash: string; date: string };

/**
 * Relatório `medicao-opt-out-*.json` com veredito `APROVADO` e `date` mais
 * recente entre os diretórios dados; `null` se não houver nenhum.
 */
export function latestApprovedMeasurement(dirs: string[]): MeasurementSummary | null {
  const approved: MeasurementSummary[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!/^medicao-opt-out-.*\.json$/.test(name)) continue;
      const file = join(dir, name);
      const report = JSON.parse(readFileSync(file, "utf8")) as Partial<MeasurementSummary>;
      if (report.veredito !== "APROVADO" || typeof report.classifierHash !== "string" || typeof report.date !== "string") continue;
      approved.push({ file, veredito: report.veredito, classifierHash: report.classifierHash, date: report.date });
    }
  }
  approved.sort((a, b) => b.date.localeCompare(a.date));
  return approved[0] ?? null;
}

/**
 * Trava de publicação (OPTMED-01 AC8, T13): lança erro se não houver medição
 * aprovada ou se a identidade atual do classificador não for a medida.
 */
export function assertApprovedIdentity(currentHash: string, dirs: string[] = MEASUREMENT_DIRS): MeasurementSummary {
  const latest = latestApprovedMeasurement(dirs);
  if (latest === null) {
    throw new Error("Nenhuma medição de opt-out aprovada: rode o crivo-medicao-opt-out e grave o relatório com `scripts/opt-out-measurement.ts stamp`.");
  }
  if (latest.classifierHash !== currentHash) {
    throw new Error(`O classificador mudou desde a medição aprovada (${latest.file}): rode a medição de novo. Atual ${currentHash}, medido ${latest.classifierHash}.`);
  }
  return latest;
}

async function principalJson(): Promise<WorkflowJson> {
  // Especificador não literal de propósito: um import literal puxaria
  // `n8n/workflows/` (excluído no tsconfig) para o type check do `next build`.
  const url = pathToFileURL(resolve(PRINCIPAL_PATH)).href;
  const { default: principal } = (await import(url)) as { default: { toJSON(): unknown } };
  return principal.toJSON() as WorkflowJson;
}

async function main() {
  const [command, file] = process.argv.slice(2);
  if (command === "identity") {
    console.log(classifierIdentity(await principalJson(), readFileSync(INTENT_SOURCE_PATH, "utf8")));
  } else if (command === "stamp" && file) {
    const json = await principalJson();
    const report = JSON.parse(readFileSync(file, "utf8")) as object;
    const stamped = stampReport(report, {
      classifierHash: classifierIdentity(json, readFileSync(INTENT_SOURCE_PATH, "utf8")),
      modelId: classifierModelId(json),
      date: new Date().toISOString(),
    });
    writeFileSync(file, `${JSON.stringify(stamped, null, 2)}\n`, "utf8");
    console.log(`carimbado: ${file} (classifierHash ${stamped.classifierHash}, modelo ${stamped.modelId})`);
  } else {
    console.error("Uso: identity | stamp <relatorio.json>");
    process.exitCode = 1;
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/opt-out-measurement.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
