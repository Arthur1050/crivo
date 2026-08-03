/**
 * Preparação das fatias de um gráfico de distribuição (donut do dashboard).
 *
 * Lógica pura, fora do componente de propósito: tem branching real
 * (denominador zero, rótulo ausente, bucket desconhecido) e a regra viva do
 * projeto manda testar isso em `src/lib` em vez de deixar inline num
 * componente que só passa pelo build gate.
 */

/**
 * Matizes disponíveis para as fatias. Os nomes casam com os sufixos dos
 * tokens de cor da Astryx (`--color-icon-blue`, `--color-text-blue`, …),
 * então o componente resolve a cor sem nenhum hex cru.
 */
export const DISTRIBUTION_HUES = [
  "blue",
  "orange",
  "purple",
  "teal",
  "pink",
] as const;

export type DistributionHue = (typeof DISTRIBUTION_HUES)[number] | "gray";

/**
 * Matiz fixo por bucket conhecido. Modalidade segue a Referência Visual R1
 * (Novo = azul, Usado = laranja, Ambos = roxo), e o balde residual
 * "não informado" é sempre cinza — ele representa ausência de dado, não uma
 * categoria concorrente, e não deve competir por atenção.
 */
const BUCKET_HUES: Record<string, DistributionHue> = {
  novo: "blue",
  usado: "orange",
  ambos: "purple",
  investidor: "teal",
  morador: "pink",
  nao_informado: "gray",
};

export interface DistributionInput {
  bucket: string;
  count: number;
}

export interface DistributionSlice {
  bucket: string;
  /** Rótulo pt-BR pronto para exibição. */
  label: string;
  count: number;
  /** Fração 0–1 do total. Zero quando o total é zero (nunca `NaN`). */
  percent: number;
  hue: DistributionHue;
}

/**
 * Converte os buckets crus da DAL nas fatias do donut, resolvendo rótulo,
 * participação e matiz de cada uma. A ordem de entrada é preservada: os
 * buckets vêm fixos da DAL e mantê-los estáveis evita que as fatias troquem
 * de lugar a cada mudança de período.
 */
export function toDistributionSlices(
  data: DistributionInput[],
  labels: Record<string, string>
): DistributionSlice[] {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  let paletteCursor = 0;

  return data.map((item) => {
    let hue = BUCKET_HUES[item.bucket];

    if (hue === undefined) {
      // Bucket desconhecido (a DAL pode ganhar categorias novas): puxa a
      // próxima cor da paleta em vez de repetir uma cor semântica já usada.
      hue = DISTRIBUTION_HUES[paletteCursor % DISTRIBUTION_HUES.length];
      paletteCursor += 1;
    }

    return {
      bucket: item.bucket,
      label: labels[item.bucket] ?? item.bucket,
      count: item.count,
      percent: total === 0 ? 0 : item.count / total,
      hue,
    };
  });
}
