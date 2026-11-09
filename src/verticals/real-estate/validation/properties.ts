import type { ValidationResult } from "../../../server/validation";
import { PROPERTY_KIND, PROPERTY_STATUS } from "../vocabulary";

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
  PROPERTY_KIND.house,
  PROPERTY_KIND.apartment,
  PROPERTY_KIND.townhouse,
  PROPERTY_KIND.penthouse,
  PROPERTY_KIND.land,
  PROPERTY_KIND.commercial_room,
  PROPERTY_KIND.farmhouse,
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
export const PROPERTY_STATUSES = [PROPERTY_STATUS.available, PROPERTY_STATUS.reserved, PROPERTY_STATUS.sold] as const;

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
