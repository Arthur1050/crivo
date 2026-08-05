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

// 1:1 com o enum `category_color` do schema (paleta fixa Token da Astryx —
// lote-3 CAT-01). Fonte da verdade da paleta para o picker de cor na UI.
export const CATEGORY_COLOR_PALETTE = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "cyan",
  "blue",
  "purple",
  "pink",
  "gray",
] as const;

export type CategoryColorPaletteValue = (typeof CATEGORY_COLOR_PALETTE)[number];

/**
 * Única barreira de validação de cor antes da escrita (o enum do banco é a
 * segunda barreira — design.md — Error Handling Strategy). Não há color
 * picker livre: qualquer valor fora da paleta fixa (incluindo string vazia
 * ou casing diferente) é rejeitado.
 */
export function validateCategoryColor(color: string): ValidationResult {
  if (!CATEGORY_COLOR_PALETTE.includes(color as CategoryColorPaletteValue)) {
    return {
      ok: false,
      error: `Cor de categoria inválida: "${color}". Escolha uma cor da paleta.`,
    };
  }

  return { ok: true };
}

// 1:1 com o enum `lead_status` do schema — usado para validar o destino do
// drag-and-drop no Kanban (lote-3 — PIPE-02) antes de chamar a DAL.
export const LEAD_STATUSES = [
  "em_qualificacao",
  "qualificado_agendado",
  "escalado_humano",
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export function validateLeadStatus(status: string): ValidationResult {
  if (!LEAD_STATUSES.includes(status as LeadStatusValue)) {
    return {
      ok: false,
      error: `Status de lead inválido: "${status}".`,
    };
  }

  return { ok: true };
}

export interface BusinessHoursInput {
  meetingDays: number[] | null;
  meetingHoursStart: string | null;
  meetingHoursEnd: string | null;
}

/**
 * Valida o horário comercial do tenant (lote-6 — CONF-05, spec.md "Workflow
 * como código" AC3): início < fim e ao menos 1 dia selecionado quando a
 * janela (início + fim) está preenchida. Tudo vazio (sem dias, sem janela) é
 * válido — limpa a configuração e o fluxo do agente cai no fallback
 * seg-sex 9h-18h (design.md, `resolveBusinessHours`).
 *
 * Início/fim só podem ser avaliados como par: a checagem "início < fim" não
 * é decidível com só um dos dois preenchido, então essa combinação também é
 * rejeitada (consequência direta das duas regras pedidas, não uma terceira
 * regra independente).
 */
export function validateBusinessHours(
  input: BusinessHoursInput
): ValidationResult {
  const days = input.meetingDays ?? [];
  const hasStart = input.meetingHoursStart !== null && input.meetingHoursStart !== "";
  const hasEnd = input.meetingHoursEnd !== null && input.meetingHoursEnd !== "";

  if (hasStart !== hasEnd) {
    return {
      ok: false,
      error:
        "Horário de atendimento: informe o horário de início e término juntos, ou deixe os dois em branco.",
    };
  }

  const windowFilled = hasStart && hasEnd;
  if (!windowFilled) {
    return { ok: true };
  }

  if (days.length === 0) {
    return {
      ok: false,
      error:
        "Dias de atendimento: selecione ao menos um dia quando o horário de início/término estiver preenchido.",
    };
  }

  if (input.meetingHoursStart! >= input.meetingHoursEnd!) {
    return {
      ok: false,
      error:
        "Horário de atendimento: o horário de início deve ser anterior ao horário de término.",
    };
  }

  return { ok: true };
}
