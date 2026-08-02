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
