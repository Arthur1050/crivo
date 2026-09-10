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

// lote-6b — PER-03: um tom de voz é uma descrição curta do JEITO de falar,
// não um prompt paralelo — 500 chars é o teto acordado com o usuário.
export const MAX_AGENT_VOICE_TONE_LENGTH = 500;

/**
 * Campo opcional — vazio/`null`/ausente é sempre válido (a coluna limpa via
 * `optionalTenantText` na DAL). Só rejeita quando o texto (aparado) excede
 * o limite; a rejeição bloqueia o salvamento inteiro, sem persistir nada
 * (PER-03 AC5).
 */
export function validateAgentVoiceTone(
  value: string | null | undefined
): ValidationResult {
  if (!value) return { ok: true };

  const trimmed = value.trim();
  if (trimmed.length > MAX_AGENT_VOICE_TONE_LENGTH) {
    return {
      ok: false,
      error: `Tom de voz e personalidade deve ter no máximo ${MAX_AGENT_VOICE_TONE_LENGTH} caracteres.`,
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

// lote-9 — BASE-01: os cinco baselines pré-piloto são snapshot opcional
// (nullable) preenchido pelo usuário — ausência (`null`/`undefined`) nunca é
// erro, só um valor FORA da faixa é. `Number.isInteger` já reprova `NaN`
// (entrada não numérica que ainda assim tem o tipo `number` — ex.:
// `Number("abc")`) e fracionário na mesma checagem, sem precisar de uma
// terceira regra.

/**
 * Contagem de baseline (leads/mês, minutos até a primeira resposta): inteiro
 * maior ou igual a zero. Zero é um valor válido de propósito (a imobiliária
 * registrou "zero" — não é o mesmo que "não registrei nada").
 */
export function validateBaselineCount(
  value: number | null | undefined,
  label: string
): ValidationResult {
  if (value === null || value === undefined) return { ok: true };

  if (!Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      error: `${label} deve ser um número inteiro maior ou igual a zero.`,
    };
  }

  return { ok: true };
}

/**
 * Percentual de baseline (escalonamento, comparecimento, lead→reunião):
 * inteiro entre 0 e 100, inclusive nas duas pontas.
 */
export function validateBaselinePercent(
  value: number | null | undefined,
  label: string
): ValidationResult {
  if (value === null || value === undefined) return { ok: true };

  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return {
      ok: false,
      error: `${label} deve ser um número inteiro entre 0 e 100.`,
    };
  }

  return { ok: true };
}

// lote-11 — IMOV-06/07: catálogo de imóveis. Funções puras, sem I/O — mesmo
// padrão das validações acima; as server actions do catálogo (T8, fora deste
// batch) chamam essas funções antes de qualquer escrita na DAL.

/**
 * Preço em centavos (`properties.price_cents`, bigint). Aceita `number`
 * (payload do formulário) ou `bigint` (valor já lido do banco) — mesmo
 * cuidado de `validateFileSize`. Regra única (IMOV-07 AC1): inteiro maior
 * que zero. Zero é inválido de propósito — não existe imóvel de graça.
 */
export function validatePriceCents(value: number | bigint): ValidationResult {
  const isValid =
    typeof value === "bigint"
      ? value > 0n
      : Number.isInteger(value) && value > 0;

  if (!isValid) {
    return {
      ok: false,
      error: "Preço deve ser um número inteiro maior que zero.",
    };
  }

  return { ok: true };
}

/**
 * Área em metros quadrados (IMOV-07 AC2): inteiro maior que zero.
 */
export function validateAreaSqm(value: number): ValidationResult {
  if (!Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      error: "Área deve ser um número inteiro maior que zero.",
    };
  }

  return { ok: true };
}

/**
 * Quartos, banheiros e vagas (IMOV-07 AC3) compartilham a mesma regra —
 * inteiro maior ou igual a zero — por isso é uma função com rótulo, e não
 * três funções quase idênticas (design.md — Components). Zero é válido
 * (imóvel sem vaga de garagem, por exemplo); negativo ou fracionário não.
 */
export function validateRoomCount(value: number, label: string): ValidationResult {
  if (!Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      error: `${label} deve ser um número inteiro maior ou igual a zero.`,
    };
  }

  return { ok: true };
}

// IMOV-06 AC7: teto de 12 URLs por imóvel.
export const MAX_PHOTO_URLS = 12;

/**
 * Fotos como lista ordenada de URLs externas (IMOV-06 AC4/AC5/AC6/AC7):
 * cada URL precisa começar com `http://` ou `https://`, e a lista não pode
 * passar de `MAX_PHOTO_URLS`. Lista vazia é válida — fotos são opcionais.
 */
export function validatePhotoUrls(urls: string[]): ValidationResult {
  if (urls.length > MAX_PHOTO_URLS) {
    return {
      ok: false,
      error: `Fotos: no máximo ${MAX_PHOTO_URLS} URLs por imóvel.`,
    };
  }

  for (const url of urls) {
    if (!/^https?:\/\//.test(url)) {
      return {
        ok: false,
        error: `Fotos: URL inválida, deve começar com http:// ou https:// ("${url}").`,
      };
    }
  }

  return { ok: true };
}

// 1:1 com o enum `property_kind` do schema (design.md — Data Models). Fonte
// da verdade da lista para o seletor de tipo na UI e para a validação.
export const PROPERTY_KINDS = [
  "casa",
  "apartamento",
  "sobrado",
  "cobertura",
  "terreno",
  "sala_comercial",
  "chacara",
] as const;

export type PropertyKindValue = (typeof PROPERTY_KINDS)[number];

/**
 * Tipo do imóvel (IMOV-07 AC4 — campo presente e vazio é recusado; a
 * pertença ao enum é a segunda barreira, junto com a do próprio banco).
 */
export function validatePropertyKind(value: string): ValidationResult {
  if (!PROPERTY_KINDS.includes(value as PropertyKindValue)) {
    return {
      ok: false,
      error: `Tipo de imóvel inválido: "${value}".`,
    };
  }

  return { ok: true };
}

// 1:1 com o enum `property_status` do schema.
export const PROPERTY_STATUSES = ["disponivel", "reservado", "vendido"] as const;

export type PropertyStatusValue = (typeof PROPERTY_STATUSES)[number];

/**
 * Status do imóvel (IMOV-07 AC4). Transição livre entre os três valores
 * (design.md — Assumptions) — esta função só garante que o valor pertence
 * ao enum, nunca valida uma transição.
 */
export function validatePropertyStatus(value: string): ValidationResult {
  if (!PROPERTY_STATUSES.includes(value as PropertyStatusValue)) {
    return {
      ok: false,
      error: `Status de imóvel inválido: "${value}".`,
    };
  }

  return { ok: true };
}

// IMOV-07 AC6: teto de 4000 caracteres para a descrição do imóvel.
export const MAX_DESCRIPTION_LENGTH = 4000;

/**
 * Descrição do imóvel: campo opcional — vazio/`null`/ausente é sempre
 * válido (mesmo padrão de `validateAgentVoiceTone`). Só rejeita quando o
 * texto excede o limite.
 */
export function validateDescription(
  value: string | null | undefined
): ValidationResult {
  if (!value) return { ok: true };

  if (value.length > MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `Descrição deve ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres.`,
    };
  }

  return { ok: true };
}

/**
 * UF do imóvel (IMOV-07 AC4): campo obrigatório — presente e vazio é
 * recusado, mesma regra de `validateModality`. Campo AUSENTE do payload de
 * criação recebe a mesma recusa na camada que chama esta função (T8 — regra
 * "campo ausente não é 'manter valor atual'"), não aqui: esta função só
 * decide sobre o valor de string que recebe.
 */
export function validateUf(value: string | null | undefined): ValidationResult {
  if (!value) {
    return { ok: false, error: "UF é obrigatória." };
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
