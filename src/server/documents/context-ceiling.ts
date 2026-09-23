/**
 * Cálculo do teto de contexto documental a partir do benchmark (lote-12 — T34,
 * DOCLIM-01 AC1–AC3; design.md "Benchmark reproduzível").
 *
 * Função pura: recebe as medições das faixas e devolve o teto e o motivo. A
 * persistência, a identidade do benchmark e a detecção de desatualização
 * ficam no script que a chama.
 */

import type { DocumentModality } from "./context-budget";

export interface BenchmarkRun {
  modality: DocumentModality;
  /** Faixa pedida ao gerador; agrupa as rodadas de uma e duas observações. */
  bandBytes: number;
  /** Bytes do envelope canônico realmente gerado (o que a admissão mede). */
  envelopeBytes: number;
  observations: 1 | 2;
  /** Maior contexto de entrada entre as chamadas ao modelo no turno. */
  inputTokens: number;
  /** Duração do turno do agente, do primeiro pedido ao modelo à resposta. */
  latencyMs: number;
  /** Os três fatos recuperados e a tool de documentos consultada. */
  approved: boolean;
}

export interface CeilingPolicy {
  modelWindowTokens: number;
  /** Folga para a resposta e o raciocínio do modelo dentro da janela. */
  outputReserveTokens: number;
  /** Definições JSON das tools, que a estimativa de tokens do n8n não conta. */
  toolSchemaAllowanceTokens: number;
  /** Tempo máximo aceitável de um turno do agente no WhatsApp. */
  latencyBudgetMs: number;
  /** Maior resposta que uma função da Vercel entrega. */
  transportLimitBytes: number;
  /** Fração do menor limite que vira teto (margem de segurança). */
  safetyFactor: number;
  /**
   * Limite de tokens por minuto da organização na OpenAI, COMPARTILHADO por
   * todos os tenants. O benchmark de 2026-09-23 esbarrou nele: a faixa de
   * 512 KB pediu ~108 mil tokens numa chamada, e um turno faz ao menos duas
   * chamadas com o corpus.
   */
  tokensPerMinuteLimit: number;
  /** Chamadas ao modelo, por turno, que carregam o corpus depois da consulta. */
  corpusCallsPerTurn: number;
  /** Turnos com documentos que precisam caber no mesmo minuto, somando tenants. */
  concurrentTurnsPerMinute: number;
}

export type CeilingComponent = "quality" | "latency" | "window" | "transport" | "throughput";

export interface CeilingResult {
  maxResponseBytes: number;
  limitedBy: CeilingComponent;
  components: Record<CeilingComponent, number>;
  fixedTokens: number;
  tokensPerByte: number;
}

export const DEFAULT_CEILING_POLICY: CeilingPolicy = {
  // gpt-5.4-nano-2026-03-17: janela de 400.000 tokens (documentação da OpenAI).
  modelWindowTokens: 400_000,
  outputReserveTokens: 16_000,
  toolSchemaAllowanceTokens: 2_000,
  latencyBudgetMs: 30_000,
  // Limite de corpo de resposta das Vercel Functions: 4,5 MB.
  transportLimitBytes: 4_500_000,
  safetyFactor: 0.8,
  // Tier atual da organização, informado pela própria OpenAI no erro 429.
  tokensPerMinuteLimit: 200_000,
  // Medido: depois da consulta, o modelo é chamado para responder e para fechar o turno.
  corpusCallsPerTurn: 2,
  // Piloto: dois turnos com documentos no mesmo minuto, somando todos os tenants.
  concurrentTurnsPerMinute: 2,
};

/**
 * Maior faixa que passa no critério, exigindo que TODAS as faixas menores
 * também passem: um acerto isolado numa faixa grande não compensa uma falha
 * numa menor. Devolve os bytes de envelope da faixa (o menor entre as rodadas
 * dela), ou 0 quando nem a menor faixa passa.
 */
function contiguousBand(runs: BenchmarkRun[], passes: (run: BenchmarkRun) => boolean): number {
  // Só conta a faixa medida também com a segunda observação no mesmo turno
  // (design — "comportamento com histórico cheio e uma segunda observação"):
  // uma faixa provada só com uma consulta não sustenta o teto.
  const bands = [
    ...new Set(runs.filter((run) => run.bandBytes > 0 && run.observations === 2).map((run) => run.bandBytes)),
  ].sort((a, b) => a - b);
  let best = 0;
  for (const band of bands) {
    const inBand = runs.filter((run) => run.bandBytes === band);
    if (!inBand.every(passes)) break;
    best = Math.min(...inBand.map((run) => run.envelopeBytes));
  }
  return best;
}

export function computeContextCeiling(
  runs: BenchmarkRun[],
  modality: DocumentModality,
  policy: CeilingPolicy = DEFAULT_CEILING_POLICY
): CeilingResult {
  const own = runs.filter((run) => run.modality === modality);
  const single = own.filter((run) => run.observations === 1);

  const empty = single.filter((run) => run.bandBytes === 0);
  if (empty.length === 0) throw new Error(`Benchmark sem faixa zero para ${modality}: custo fixo desconhecido.`);
  const fixedTokens = Math.max(...empty.map((run) => run.inputTokens)) + policy.toolSchemaAllowanceTokens;

  // Inclinação conservadora: o maior custo por byte observado entre as faixas
  // não vazias de uma observação.
  const slopes = single
    .filter((run) => run.bandBytes > 0 && run.envelopeBytes > 0)
    .map((run) => (run.inputTokens + policy.toolSchemaAllowanceTokens - fixedTokens) / run.envelopeBytes)
    .filter((slope) => slope > 0);
  if (slopes.length === 0) throw new Error(`Benchmark sem faixa medida para ${modality}.`);
  const tokensPerByte = Math.max(...slopes);

  const components: Record<CeilingComponent, number> = {
    quality: contiguousBand(own, (run) => run.approved),
    latency: contiguousBand(own, (run) => run.latencyMs <= policy.latencyBudgetMs),
    // O corpus pode aparecer duas vezes no mesmo turno (segunda consulta).
    window: Math.floor(
      (policy.modelWindowTokens - fixedTokens - policy.outputReserveTokens) / (2 * tokensPerByte)
    ),
    transport: policy.transportLimitBytes,
    // Tokens que cada chamada com corpus pode gastar para que os turnos
    // simultâneos caibam no limite por minuto compartilhado.
    throughput: Math.max(
      0,
      Math.floor(
        (policy.tokensPerMinuteLimit / (policy.concurrentTurnsPerMinute * policy.corpusCallsPerTurn) - fixedTokens) /
          tokensPerByte
      )
    ),
  };

  const limitedBy = (Object.keys(components) as CeilingComponent[]).reduce((min, key) =>
    components[key] < components[min] ? key : min
  );

  return {
    maxResponseBytes: Math.max(0, Math.floor(components[limitedBy] * policy.safetyFactor)),
    limitedBy,
    components,
    fixedTokens,
    tokensPerByte,
  };
}

export interface BenchmarkIdentity {
  modelId: string;
  workflowVersion: string;
  systemMessageHash: string;
  toolsHash: string;
  memoryWindow: number;
}

/** Campos da identidade que mudaram desde a medição (DOCLIM-01 AC11). */
export function diffBenchmarkIdentity(stored: BenchmarkIdentity, current: BenchmarkIdentity): (keyof BenchmarkIdentity)[] {
  return (Object.keys(current) as (keyof BenchmarkIdentity)[]).filter((key) => stored[key] !== current[key]);
}
