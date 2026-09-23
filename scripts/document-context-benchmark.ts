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
 *
 * A identidade vem das fontes versionadas (`principal.ts` e os módulos do
 * system message) mais a versão publicada do workflow, informada no arquivo
 * de resultados (`persist`) ou em `--workflow-version` (`check`).
 *
 * Uso (o repositório importa `server-only`):
 *   npx tsx --conditions=react-server scripts/document-context-benchmark.ts persist <arquivo>
 *   npx tsx --conditions=react-server scripts/document-context-benchmark.ts check --workflow-version <id>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { db } from "../src/db";
import { tenants } from "../src/db/schema";
import { deriveBenchmarkIdentity } from "../src/server/documents/benchmark-identity";
import {
  computeContextCeiling,
  DEFAULT_CEILING_POLICY,
  diffBenchmarkIdentity,
  type BenchmarkRun,
} from "../src/server/documents/context-ceiling";
import {
  listDocumentContextLimits,
  markDocumentContextLimitStale,
  reconcileTenantDocumentAdmission,
  upsertDocumentContextLimit,
} from "../src/server/documents/repository";

const MODALITIES = ["novo", "usado", "ambos"] as const;

interface BenchmarkResultsFile {
  benchmarkedAt: string;
  benchmarkWorkflowId: string;
  /** `activeVersionId` do `crivo-agente-principal` no momento da medição. */
  agentWorkflowVersion: string;
  tokenSource: string;
  runs: Array<BenchmarkRun & { executionId: string }>;
}

function currentIdentity(workflowVersion: string) {
  return deriveBenchmarkIdentity({
    principalSource: readFileSync("n8n/workflows/principal.ts", "utf8"),
    systemMessageSources: ["business-hours.mjs", "phase.mjs", "system-message.mjs"].map((file) =>
      readFileSync(`n8n/src/${file}`, "utf8")
    ),
    workflowVersion,
  });
}

async function persist(file: string) {
  const results = JSON.parse(readFileSync(file, "utf8")) as BenchmarkResultsFile;
  const identity = currentIdentity(results.agentWorkflowVersion);

  const ceilings = MODALITIES.map((modality) => ({
    modality,
    result: computeContextCeiling(results.runs, modality, DEFAULT_CEILING_POLICY),
  }));
  // Teto zero significa que nenhuma faixa passou: gravar isso seria inventar
  // um limite. Melhor falhar e deixar o banner apontando a ausência.
  const empty = ceilings.filter((ceiling) => ceiling.result.maxResponseBytes <= 0);
  if (empty.length > 0) throw new Error(`Sem faixa aprovada para: ${empty.map((c) => c.modality).join(", ")}.`);

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

async function check(workflowVersion: string) {
  const identity = currentIdentity(workflowVersion);
  const rows = await listDocumentContextLimits();
  let marked = 0;
  for (const row of rows) {
    const changed = diffBenchmarkIdentity(row, identity);
    if (changed.length === 0 || row.staleAt) continue;
    if (await markDocumentContextLimitStale(row.tenantId, row.queryModality, `mudou: ${changed.join(", ")}`)) marked += 1;
  }
  console.log(`${rows.length} teto(s) conferido(s); ${marked} marcado(s) como desatualizado(s).`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "persist" && args[0]) await persist(args[0]);
    else if (command === "check" && args[0] === "--workflow-version" && args[1]) await check(args[1]);
    else {
      console.error("Uso: persist <resultados.json> | check --workflow-version <id>");
      process.exitCode = 1;
    }
  } finally {
    await db.$client.end();
  }
}

void main();
