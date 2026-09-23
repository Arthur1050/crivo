/**
 * Aviso sobre o estado do benchmark de teto (lote-12 — T27, DOCLIM-01).
 *
 * Puro de propósito: este módulo só decide o que dizer. Ele nunca altera
 * admissão nem teto — um documento marcado `fora_do_agente` continua fora,
 * independentemente do aviso que a página mostra.
 */

export interface BenchmarkSummary {
  published: number;
  stale: number;
}

export interface BenchmarkNotice {
  status: "warning";
  title: string;
  description: string;
}

/** As três modalidades de consulta precisam de teto publicado: novo, usado e ambos. */
export const REQUIRED_BENCHMARK_MODALITIES = 3;

export function describeBenchmarkNotice(
  summary: BenchmarkSummary,
  canSeeOperationalWarnings: boolean
): BenchmarkNotice | null {
  // Corretor não opera o benchmark; o aviso só ruidaria a tela dele.
  if (!canSeeOperationalWarnings) return null;

  if (summary.published < REQUIRED_BENCHMARK_MODALITIES) {
    return {
      status: "warning",
      title: "Teto de contexto ainda não medido",
      description:
        "Enquanto o benchmark não é publicado para as três modalidades, nenhum documento entra no contexto do agente.",
    };
  }

  if (summary.stale > 0) {
    return {
      status: "warning",
      title: "Teto de contexto desatualizado",
      description:
        "O modelo, o workflow ou o prompt mudaram desde a última medição. O teto anterior continua valendo, mas não é ampliado até o benchmark ser refeito.",
    };
  }

  return null;
}
