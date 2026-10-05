/**
 * Benchmark do teto de contexto documental (lote-12 — T34, DOCLIM-01).
 *
 * As medições saem do workflow `crivo-benchmark-contexto` no n8n
 * (`n8n/workflows/benchmark-contexto.ts`), uma execução por faixa, e são
 * registradas num arquivo de resultados versionado — só métricas, nunca o
 * corpus. Este script faz o resto:
 *
 *   persist <resultados.json>   calcula o teto de cada modalidade e grava
 *                               para TODOS os tenants, com a identidade do
 *                               agente medido e as métricas sem corpus.
 *   check                       compara a identidade atual com a gravada e
 *                               marca `stale` o que mudou (DOCLIM-01 AC11).
 *                               Rodar depois de toda publicação do agente.
 *   audit                       compara fontes e reserva o overhead do frame,
 *                               sem banco, chamadas pagas ou nova medição.
 *
 * A identidade vem das fontes versionadas (`principal.ts` e os módulos do
 * system message) mais a versão publicada do workflow, informada no arquivo
 * de resultados (`persist`) ou em `--workflow-version` (`check`).
 *
 * Uso (o repositório importa `server-only`):
 *   npx tsx --conditions=react-server scripts/document-context-benchmark.ts persist <arquivo>
 *   npx tsx --conditions=react-server scripts/document-context-benchmark.ts check --workflow-version <id>
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { deriveBenchmarkIdentity } from "../src/server/documents/benchmark-identity";
import { FIELD_LABELS } from "../n8n/src/phase.mjs";
import { buildSystemMessage } from "../n8n/src/system-message.mjs";
import { buildReengagementPrompt } from "../n8n/src/reengagement-prompt.mjs";
import type { PreparationFrame } from "../src/server/reengagement/context";
import {
  computeContextCeiling,
  DEFAULT_CEILING_POLICY,
  diffBenchmarkIdentity,
  type BenchmarkRun,
  type BenchmarkIdentity,
} from "../src/server/documents/context-ceiling";

const MODALITIES = ["novo", "usado", "ambos"] as const;

export interface BenchmarkResultsFile {
  benchmarkedAt: string;
  benchmarkWorkflowId: string;
  /** `activeVersionId` do `crivo-agente-principal` no momento da medição. */
  agentWorkflowVersion: string;
  tokenSource: string;
  runs: Array<BenchmarkRun & { executionId: string }>;
  /** Commit factual da fonte executada, distinto da versão publicada. */
  sourceRevision?: string;
}

export function currentIdentity(workflowVersion: string, sourceRevision?: string) {
  if (sourceRevision && !/^[a-f0-9]{7,40}$/i.test(sourceRevision)) throw new Error("Revisão da fonte inválida.");
  const source = (file: string) => sourceRevision
    ? execFileSync("git", ["show", `${sourceRevision}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    : readFileSync(file, "utf8");
  return deriveBenchmarkIdentity({
    principalSource: source("n8n/workflows/principal.ts"),
    systemMessageSources: ["business-hours.mjs", "phase.mjs", "system-message.mjs"].map((file) =>
      source(`n8n/src/${file}`)
    ),
    workflowVersion,
  });
}

const hash = (value: string) => createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex");
type PromptInput = Parameters<typeof buildReengagementPrompt>[0];
export interface MeasuredLimit {
  identity: BenchmarkIdentity;
  maxResponseBytes: number;
  benchmarkedAt: string;
  staleAt?: Date | null;
}

/** Auditoria local: hashes e contagens, sem texto de lead, corpus ou transporte.
 * Stale continua limitando; isso não comprova uma capacidade nova.
 */
export function auditProactiveBenchmark(input: {
  current: BenchmarkIdentity;
  measured: MeasuredLimit | null;
  frame: PreparationFrame;
  settings?: PromptInput["settings"];
  businessHours?: PromptInput["businessHours"];
}) {
  const measured = input.measured;
  const validMeasurement = !!measured && Number.isSafeInteger(measured.maxResponseBytes) && measured.maxResponseBytes > 0
    && Number.isFinite(Date.parse(measured.benchmarkedAt));
  const limitingCeilingBytes = validMeasurement ? measured.maxResponseBytes : 0;
  const prepared = buildReengagementPrompt({ frame: input.frame, settings: input.settings,
    businessHours: input.businessHours, documentCeilingBytes: limitingCeilingBytes });
  if (!prepared.ok || !prepared.baseSystemMessage || !prepared.systemMessage || !prepared.prompt
    || prepared.overheadBytes === undefined || prepared.maxDocumentBytes === undefined) throw new Error("Frame proativo inválido.");
  const informed = Object.keys(FIELD_LABELS).filter((field) => {
    const value = input.frame.facts[field as keyof PreparationFrame["facts"]];
    return value !== null && value !== undefined && value !== "";
  });
  const principal = buildSystemMessage({ settings: input.settings, businessHours: input.businessHours,
    now: input.frame.preparedAt, phase: input.frame.agent.phase, firstTurn: false,
    perguntados: [...new Set([...input.frame.agent.askedFields, ...informed])] });
  const previous = measured?.identity ?? null;
  const changed = previous ? diffBenchmarkIdentity(previous, input.current) : [];
  const parity = principal === prepared.baseSystemMessage;
  const stale = !!measured?.staleAt || changed.length > 0;
  return {
    paidCalls: 0 as const,
    previousIdentity: previous, currentIdentity: input.current, changed,
    sharedIdentityEqual: !!previous && previous.systemMessageHash === input.current.systemMessageHash,
    promptParity: parity,
    promptHashes: { principal: hash(principal), proactiveBase: hash(prepared.baseSystemMessage),
      proactiveEffective: hash(prepared.systemMessage + "\n" + prepared.prompt) },
    budget: { limitingCeilingBytes, overheadBytes: prepared.overheadBytes, maxDocumentBytes: prepared.maxDocumentBytes },
    measured: validMeasurement, stale,
    capacityVerified: validMeasurement && !stale && parity && prepared.maxDocumentBytes > 0,
    code: !validMeasurement ? "measurement-missing" : stale ? "remeasurement-required" : !parity ? "prompt-parity-failed" : "measured-ceiling-with-overhead-reserved",
  };
}

/** Não executa o workflow. Evidência interna do executor acompanha o gate
 * autorizado; o diagnóstico nunca solicita autorização nem dispara pagamento.
 */
export function planBenchmarkRemediation(audit: ReturnType<typeof auditProactiveBenchmark>, evidence?: { authorized: true; workflowId: string; gateExecutionId: string }) {
  if (audit.capacityVerified) return { required: false, ready: false, paidCalls: 0, code: "existing-measurement-preserved" };
  const ready = evidence?.authorized === true && /^[A-Za-z0-9]{16}$/.test(evidence.workflowId) && /^[A-Za-z0-9_-]{1,100}$/.test(evidence.gateExecutionId);
  return { required: true, ready, paidCalls: 0, code: ready ? "authorized-executor-measurement-plan" : "executor-evidence-required",
    ...(ready ? { workflowId: evidence.workflowId, runs: MODALITIES.flatMap((modality) => [
      { modality, bandBytes: 0, observations: 1, seed: 1 },
      ...[64_000, 128_000].flatMap((bandBytes) => [1, 2].map((observations) => ({ modality, bandBytes, observations, seed: 1 }))),
    ]) } : {}) };
}

/** Versões antigas versionadas usam sua proveniência Git explicitada. Arquivo
 * novo precisa declarar a revisão factual; nenhuma medição recebe o hash de hoje.
 */
export function validateMeasuredIdentity(measured: BenchmarkIdentity, current: BenchmarkIdentity) {
  const changed = diffBenchmarkIdentity(measured, current);
  if (changed.length) throw new Error(`Medição desatualizada: ${changed.join(", ")}.`);
}

async function persist(file: string, measuredSourceRevision?: string) {
  const results = JSON.parse(readFileSync(file, "utf8")) as BenchmarkResultsFile;
  const identity = currentIdentity(results.agentWorkflowVersion);
  const sourceRevision = measuredSourceRevision ?? results.sourceRevision
    ?? execFileSync("git", ["log", "-1", "--format=%H", "--", file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (!sourceRevision) throw new Error("Resultado sem fonte medida: informe sourceRevision ou --measured-source-ref.");
  const measuredIdentity = currentIdentity(results.agentWorkflowVersion, sourceRevision);
  validateMeasuredIdentity(measuredIdentity, identity);

  const ceilings = MODALITIES.map((modality) => ({
    modality,
    result: computeContextCeiling(results.runs, modality, DEFAULT_CEILING_POLICY),
  }));
  // Teto zero significa que nenhuma faixa passou: gravar isso seria inventar
  // um limite. Melhor falhar e deixar o banner apontando a ausência.
  const empty = ceilings.filter((ceiling) => ceiling.result.maxResponseBytes <= 0);
  if (empty.length > 0) throw new Error(`Sem faixa aprovada para: ${empty.map((c) => c.modality).join(", ")}.`);

  const [{ db }, { tenants }, { upsertDocumentContextLimit, reconcileTenantDocumentAdmission }] = await Promise.all([
    import("../src/db"), import("../src/db/schema"), import("../src/server/documents/repository"),
  ]);
  console.log(`fonte medida: ${sourceRevision}; identidade verificada contra a fonte atual`);
  const allTenants = await db.select({ id: tenants.id }).from(tenants);
  for (const tenant of allTenants) {
    for (const { modality, result } of ceilings) {
      await upsertDocumentContextLimit(tenant.id, {
        queryModality: modality,
        maxResponseBytes: result.maxResponseBytes,
        ...identity,
        benchmarkedAt: new Date(results.benchmarkedAt),
        metrics: {
          limitedBy: result.limitedBy,
          components: result.components,
          fixedTokens: result.fixedTokens,
          tokensPerByte: result.tokensPerByte,
          policy: DEFAULT_CEILING_POLICY,
          tokenSource: results.tokenSource,
          benchmarkWorkflowId: results.benchmarkWorkflowId,
          sourceRevision,
          runs: results.runs.filter((run) => run.modality === modality),
        },
      });
    }
    // O teto novo pode admitir ou excluir documentos já processados.
    await reconcileTenantDocumentAdmission(tenant.id);
  }

  for (const { modality, result } of ceilings) {
    console.log(`${modality}: ${result.maxResponseBytes} bytes (limitado por ${result.limitedBy})`);
  }
  console.log(`gravado para ${allTenants.length} tenant(s); identidade ${JSON.stringify(identity)}`);
}

export async function checkBenchmarkIdentity(workflowVersion: string, dependencies?: {
  identity: BenchmarkIdentity;
  list: () => Promise<Array<BenchmarkIdentity & { tenantId: string; queryModality: "novo" | "usado" | "ambos"; staleAt: Date | null }>>;
  markStale: (tenantId: string, modality: "novo" | "usado" | "ambos", reason: string) => Promise<boolean>;
}) {
  const identity = dependencies?.identity ?? currentIdentity(workflowVersion);
  const repository = dependencies ? null : await import("../src/server/documents/repository");
  const rows = await (dependencies?.list ?? repository!.listDocumentContextLimits)();
  let marked = 0;
  for (const row of rows) {
    const changed = diffBenchmarkIdentity(row, identity);
    if (changed.length === 0 || row.staleAt) continue;
    if (await (dependencies?.markStale ?? repository!.markDocumentContextLimitStale)(row.tenantId, row.queryModality, `mudou: ${changed.join(", ")}`)) marked += 1;
  }
  return { checked: rows.length, marked, paidCalls: 0 as const };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "persist" && args[0]) await persist(args[0], args[1] === "--measured-source-ref" ? args[2] : undefined);
    else if (command === "check" && args[0] === "--workflow-version" && args[1]) {
      const report = await checkBenchmarkIdentity(args[1]);
      console.log(`${report.checked} teto(s) conferido(s); ${report.marked} marcado(s) como desatualizado(s).`);
    }
    else if (command === "audit") {
      const value = (flag: string) => { const at = args.indexOf(flag); return at < 0 ? undefined : args[at + 1]; };
      const workflowVersion = value("--workflow-version"), frameFile = value("--frame");
      if (!workflowVersion || !frameFile) throw new Error("Audit requer --workflow-version e --frame.");
      const resultsFile = value("--results"), sourceRevision = value("--measured-source-ref");
      const results = resultsFile ? JSON.parse(readFileSync(resultsFile, "utf8")) as BenchmarkResultsFile : null;
      if (results && !sourceRevision) throw new Error("Audit de resultados requer --measured-source-ref.");
      const modality = value("--modality") ?? "ambos";
      if (!MODALITIES.includes(modality as typeof MODALITIES[number])) throw new Error("Modalidade inválida.");
      const report = auditProactiveBenchmark({ current: currentIdentity(workflowVersion),
        measured: results ? { identity: currentIdentity(results.agentWorkflowVersion, sourceRevision), benchmarkedAt: results.benchmarkedAt,
          maxResponseBytes: computeContextCeiling(results.runs, modality as typeof MODALITIES[number]).maxResponseBytes } : null,
        frame: JSON.parse(readFileSync(frameFile, "utf8")) as PreparationFrame });
      console.log(JSON.stringify(report, null, 2));
    }
    else {
      console.error("Uso: persist <resultados.json> [--measured-source-ref <commit>] | check --workflow-version <id> | audit --workflow-version <id> --frame <arquivo> [--results <arquivo> --measured-source-ref <commit> --modality <modalidade>]");
      process.exitCode = 1;
    }
  } finally {
    // Audit não importa banco; encerramento só dos comandos que o utilizam.
    if (command === "persist" || command === "check") await (await import("../src/db")).db.$client.end();
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/document-context-benchmark.ts")) {
  const start = process.argv[2] === "persist" || process.argv[2] === "check" ? import("dotenv/config").then(main) : main();
  start.catch(() => { console.error("Falha no benchmark de contexto."); process.exitCode = 1; });
}
