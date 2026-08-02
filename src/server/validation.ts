/**
 * Regras de validação compartilhadas por configurações de tenant e por
 * documentos (lote-2 — CONF-01/02, DOC-01/02/04/05/06/07). Funções puras,
 * sem I/O — a autoridade de validação nas server actions (T6) chama essas
 * funções antes de qualquer escrita no banco.
 */

export type ValidationResult = { ok: true } | { ok: false; error: string };

export const MAX_NAME_LENGTH = 120;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

/**
 * Reutilizada para nome de tenant, nome do agente, nome de documento e nome
 * de categoria: aparado (trim), não pode ficar vazio após o trim, e no
 * máximo `MAX_NAME_LENGTH` caracteres.
 */
export function validateName(name: string, label = "Nome"): ValidationResult {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: `${label} não pode ser vazio.` };
  }

  if (trimmed.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `${label} deve ter no máximo ${MAX_NAME_LENGTH} caracteres.`,
    };
  }

  return { ok: true };
}

export function validateMimeType(mimeType: string): ValidationResult {
  if (!ACCEPTED_MIME_TYPES.includes(mimeType as AcceptedMimeType)) {
    return {
      ok: false,
      error: `Tipo de arquivo não suportado: ${mimeType}.`,
    };
  }

  return { ok: true };
}

/**
 * Aceita `number` (ex.: `File.size` no upload) ou `bigint` (ex.: valor lido
 * de `documents.size_bytes`, coluna bigint).
 */
export function validateFileSize(sizeBytes: number | bigint): ValidationResult {
  const size =
    typeof sizeBytes === "bigint" ? sizeBytes : BigInt(Math.trunc(sizeBytes));

  if (size > BigInt(MAX_FILE_SIZE_BYTES)) {
    return {
      ok: false,
      error: "Arquivo excede o tamanho máximo permitido (10MB).",
    };
  }

  return { ok: true };
}

export function validateModality(
  modality: string | null | undefined
): ValidationResult {
  if (!modality) {
    return { ok: false, error: "Modalidade é obrigatória." };
  }

  return { ok: true };
}
