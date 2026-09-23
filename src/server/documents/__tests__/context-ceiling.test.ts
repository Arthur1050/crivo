import { describe, expect, it } from "vitest";
import {
  computeContextCeiling,
  diffBenchmarkIdentity,
  type BenchmarkRun,
  type CeilingPolicy,
} from "../context-ceiling";

const POLICY: CeilingPolicy = {
  modelWindowTokens: 400_000,
  outputReserveTokens: 16_000,
  toolSchemaAllowanceTokens: 2_000,
  latencyBudgetMs: 30_000,
  transportLimitBytes: 4_500_000,
  safetyFactor: 0.8,
  tokensPerMinuteLimit: 10_000_000,
  corpusCallsPerTurn: 2,
  concurrentTurnsPerMinute: 2,
};

function run(overrides: Partial<BenchmarkRun>): BenchmarkRun {
  return {
    modality: "ambos",
    bandBytes: 64_000,
    envelopeBytes: 64_000,
    observations: 1,
    inputTokens: 20_000,
    latencyMs: 10_000,
    approved: true,
    ...overrides,
  };
}

// Custo fixo 4.000 tokens medidos + 2.000 de folga das tools = 6.000.
// Cada faixa custa 0,25 token por byte acima do fixo.
const BASE: BenchmarkRun[] = [
  run({ bandBytes: 0, envelopeBytes: 41, inputTokens: 4_000 }),
  run({ bandBytes: 64_000, envelopeBytes: 64_000, inputTokens: 20_000 }),
  run({ bandBytes: 64_000, envelopeBytes: 64_000, observations: 2, inputTokens: 36_000 }),
  run({ bandBytes: 256_000, envelopeBytes: 256_000, inputTokens: 68_000 }),
  run({ bandBytes: 256_000, envelopeBytes: 256_000, observations: 2, inputTokens: 132_000 }),
];

describe("computeContextCeiling (lote-12 T34)", () => {
  it("usa o menor componente e aplica a margem de segurança", () => {
    const result = computeContextCeiling(BASE, "ambos", POLICY);
    expect(result.components.quality).toBe(256_000);
    expect(result.limitedBy).toBe("quality");
    expect(result.maxResponseBytes).toBe(Math.floor(256_000 * 0.8));
  });

  it("mede custo fixo pela faixa zero somando a folga das tools", () => {
    expect(computeContextCeiling(BASE, "ambos", POLICY).fixedTokens).toBe(6_000);
  });

  it("janela reserva espaço para duas observações do corpus", () => {
    const result = computeContextCeiling(BASE, "ambos", POLICY);
    // (400.000 - 6.000 - 16.000) / (2 × 0,25) = 756.000 bytes.
    expect(result.tokensPerByte).toBeCloseTo(0.25, 5);
    expect(result.components.window).toBe(756_000);
  });

  it("uma falha numa faixa menor corta as maiores, mesmo aprovadas", () => {
    const runs = BASE.map((r) => (r.bandBytes === 64_000 && r.observations === 2 ? { ...r, approved: false } : r));
    expect(computeContextCeiling(runs, "ambos", POLICY).components.quality).toBe(0);
  });

  it("a rodada de duas observações precisa passar para a faixa valer", () => {
    const runs = BASE.map((r) => (r.bandBytes === 256_000 && r.observations === 2 ? { ...r, approved: false } : r));
    expect(computeContextCeiling(runs, "ambos", POLICY).components.quality).toBe(64_000);
  });

  it("faixa medida só com uma observação não sustenta o teto", () => {
    const runs = BASE.filter((r) => !(r.bandBytes === 256_000 && r.observations === 2));
    expect(computeContextCeiling(runs, "ambos", POLICY).components.quality).toBe(64_000);
  });

  it("latência acima do orçamento limita a faixa", () => {
    const runs = BASE.map((r) => (r.bandBytes === 256_000 ? { ...r, latencyMs: 45_000 } : r));
    const result = computeContextCeiling(runs, "ambos", POLICY);
    expect(result.components.latency).toBe(64_000);
    expect(result.limitedBy).toBe("latency");
    expect(result.maxResponseBytes).toBe(Math.floor(64_000 * 0.8));
  });

  it("janela estreita vira o limite quando qualidade e latência sobram", () => {
    const tight = { ...POLICY, modelWindowTokens: 40_000 };
    const result = computeContextCeiling(BASE, "ambos", tight);
    // (40.000 - 6.000 - 16.000) / 0,5 = 36.000.
    expect(result.limitedBy).toBe("window");
    expect(result.maxResponseBytes).toBe(Math.floor(36_000 * 0.8));
  });

  it("limite de tokens por minuto compartilhado limita o corpus", () => {
    const shared = { ...POLICY, tokensPerMinuteLimit: 200_000 };
    const result = computeContextCeiling(BASE, "ambos", shared);
    // 200.000 / (2 turnos × 2 chamadas) = 50.000; menos 6.000 fixos = 44.000 / 0,25 = 176.000.
    expect(result.components.throughput).toBe(176_000);
    expect(result.limitedBy).toBe("throughput");
    expect(result.maxResponseBytes).toBe(Math.floor(176_000 * 0.8));
  });

  it("mais turnos simultâneos reduzem o teto na mesma proporção do orçamento", () => {
    const a = computeContextCeiling(BASE, "ambos", { ...POLICY, tokensPerMinuteLimit: 200_000, concurrentTurnsPerMinute: 1 });
    const b = computeContextCeiling(BASE, "ambos", { ...POLICY, tokensPerMinuteLimit: 200_000, concurrentTurnsPerMinute: 4 });
    expect(b.components.throughput).toBeLessThan(a.components.throughput);
  });

  it("nenhuma faixa aprovada produz teto zero, nunca um valor inventado", () => {
    const runs = BASE.map((r) => ({ ...r, approved: r.bandBytes === 0 }));
    expect(computeContextCeiling(runs, "ambos", POLICY).maxResponseBytes).toBe(0);
  });

  it("cada modalidade é calculada só com as próprias rodadas", () => {
    const runs = [...BASE, ...BASE.map((r) => ({ ...r, modality: "novo" as const, approved: r.bandBytes !== 256_000 }))];
    expect(computeContextCeiling(runs, "ambos", POLICY).components.quality).toBe(256_000);
    expect(computeContextCeiling(runs, "novo", POLICY).components.quality).toBe(64_000);
  });

  it("sem faixa zero o custo fixo é desconhecido e o cálculo recusa", () => {
    expect(() => computeContextCeiling(BASE.slice(1), "ambos", POLICY)).toThrow(/faixa zero/);
  });
});

describe("diffBenchmarkIdentity (lote-12 T34, DOCLIM-01 AC11)", () => {
  const stored = { modelId: "m", workflowVersion: "v1", systemMessageHash: "s", toolsHash: "t", memoryWindow: 50 };

  it("identidade igual não marca nada", () => {
    expect(diffBenchmarkIdentity(stored, { ...stored })).toEqual([]);
  });

  it.each([
    ["modelId", { modelId: "outro" }],
    ["workflowVersion", { workflowVersion: "v2" }],
    ["systemMessageHash", { systemMessageHash: "x" }],
    ["toolsHash", { toolsHash: "y" }],
    ["memoryWindow", { memoryWindow: 20 }],
  ])("mudança em %s é detectada", (field, change) => {
    expect(diffBenchmarkIdentity(stored, { ...stored, ...change })).toEqual([field]);
  });
});
