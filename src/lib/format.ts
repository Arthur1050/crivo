const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Formata centavos (coluna `leads.budget_cents`, bigint nullable) em Real
 * brasileiro (ex.: 350000n → "R$ 3.500,00"). Retorna `null` quando o valor é
 * nulo/indefinido — o painel de detalhe do lead (lote-3 — PIPE-03) usa esse
 * `null` para cair no fallback "—", nunca renderizando "R$ NaN".
 */
export function formatCurrencyBRL(
  cents: bigint | number | null | undefined
): string | null {
  if (cents === null || cents === undefined) {
    return null;
  }

  const value = (typeof cents === "bigint" ? Number(cents) : cents) / 100;
  return BRL_FORMATTER.format(value);
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Formata bytes em um rótulo legível (ex.: "1.2 MB"). Aceita `bigint` porque
 * `documents.size_bytes` é uma coluna bigint (lote-2 — DOC-01).
 */
export function formatFileSize(sizeBytes: number | bigint): string {
  let bytes = typeof sizeBytes === "bigint" ? Number(sizeBytes) : sizeBytes;

  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  let unitIndex = 0;
  while (bytes >= 1024 && unitIndex < UNITS.length - 1) {
    bytes /= 1024;
    unitIndex += 1;
  }

  const precision = unitIndex === 0 ? 0 : 1;
  return `${bytes.toFixed(precision)} ${UNITS[unitIndex]}`;
}
