/**
 * Validação da configuração da vitrine (lote-16a — VCFG-02).
 *
 * Função pura, sem I/O — mesmo padrão de `src/lib/permissions.ts`: a regra
 * vive aqui e é testada em vitest; quem faz I/O (DAL e server action) a
 * consome. A recusa aponta o campo pelo nome que a spec e a tela usam
 * (`cor`, `razaoSocial`, `telefone`...), não pelo nome da coluna.
 */
import {
  STOREFRONT_FONTS,
  STOREFRONT_LAYOUTS,
  type StorefrontFont,
  type StorefrontLayout,
} from "./storefront-contract";

/** Campos que a validação pode recusar, nos nomes da spec e da tela. */
export type StorefrontField =
  | "layout"
  | "fonte"
  | "cor"
  | "creci"
  | "razaoSocial"
  | "titulo"
  | "sobre"
  | "instagram"
  | "telefone"
  | "endereco";

/** Como a configuração chega do formulário (valores ainda não normalizados). */
export interface StorefrontInput {
  active: boolean;
  layout: string;
  accentColor?: string | null;
  font: string;
  creci?: string | null;
  legalName?: string | null;
  headline?: string | null;
  about?: string | null;
  instagram?: string | null;
  phone?: string | null;
  address?: string | null;
}

/** Configuração validada e normalizada, pronta para o DAL gravar. */
export interface StorefrontValue {
  active: boolean;
  layout: StorefrontLayout;
  accentColor: string | null;
  font: StorefrontFont;
  creci: string | null;
  legalName: string | null;
  headline: string | null;
  about: string | null;
  instagram: string | null;
  phone: string | null;
  address: string | null;
}

export type StorefrontValidation =
  | { ok: true; value: StorefrontValue }
  | { ok: false; field: StorefrontField; message: string };

export const STOREFRONT_LIMITS = {
  creci: 40,
  razaoSocial: 120,
  titulo: 120,
  sobre: 1500,
  endereco: 200,
} as const;

const ACCENT_PATTERN = /^#[0-9a-f]{6}$/;
const INSTAGRAM_PATTERN = /^[a-z0-9._]{1,30}$/;
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 13;

/** Texto opcional: aparado; vazio ou só espaços vira nulo (VCFG-02 AC10). */
export function normalizeOptionalText(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Cor: aparada e em minúsculas; vazia vira nulo (cor padrão da vitrine). */
export function normalizeAccent(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

/** Instagram: sem o `@` inicial e em minúsculas; vazio vira nulo. */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  const handle = (raw ?? "").trim().replace(/^@/, "").trim().toLowerCase();
  return handle === "" ? null : handle;
}

/** Telefone: só os dígitos; sem nenhum dígito vira nulo. */
export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
}

function refuse(field: StorefrontField, message: string): StorefrontValidation {
  return { ok: false, field, message };
}

function tooLong(
  value: string | null,
  max: number,
  field: StorefrontField,
  label: string
): StorefrontValidation | null {
  if (value !== null && value.length > max) {
    return refuse(field, `${label} deve ter no máximo ${max} caracteres.`);
  }
  return null;
}

/**
 * Valida e normaliza a configuração inteira (VCFG-02 AC5–AC10). Devolve a
 * primeira recusa, na ordem dos campos do formulário; qualquer recusa significa
 * que nada é gravado (AC11) — quem grava só chama o DAL com `ok: true`.
 */
export function validateStorefrontInput(input: StorefrontInput): StorefrontValidation {
  if (!(STOREFRONT_LAYOUTS as readonly string[]).includes(input.layout)) {
    return refuse("layout", "Escolha um layout válido.");
  }
  if (!(STOREFRONT_FONTS as readonly string[]).includes(input.font)) {
    return refuse("fonte", "Escolha uma fonte válida.");
  }

  const accentColor = normalizeAccent(input.accentColor);
  if (accentColor !== null && !ACCENT_PATTERN.test(accentColor)) {
    return refuse("cor", "Cor deve estar no formato #rrggbb.");
  }

  const creci = normalizeOptionalText(input.creci);
  const creciTooLong = tooLong(creci, STOREFRONT_LIMITS.creci, "creci", "CRECI");
  if (creciTooLong) return creciTooLong;

  const legalName = normalizeOptionalText(input.legalName);
  const legalNameTooLong = tooLong(legalName, STOREFRONT_LIMITS.razaoSocial, "razaoSocial", "Razão social");
  if (legalNameTooLong) return legalNameTooLong;

  const headline = normalizeOptionalText(input.headline);
  const headlineTooLong = tooLong(headline, STOREFRONT_LIMITS.titulo, "titulo", "Título");
  if (headlineTooLong) return headlineTooLong;

  const about = normalizeOptionalText(input.about);
  const aboutTooLong = tooLong(about, STOREFRONT_LIMITS.sobre, "sobre", "Sobre");
  if (aboutTooLong) return aboutTooLong;

  const instagram = normalizeInstagram(input.instagram);
  if (instagram !== null && !INSTAGRAM_PATTERN.test(instagram)) {
    return refuse(
      "instagram",
      "Instagram deve ter de 1 a 30 caracteres entre letras, números, ponto e sublinhado."
    );
  }

  const phone = normalizePhoneDigits(input.phone);
  if (phone !== null && (phone.length < PHONE_MIN_DIGITS || phone.length > PHONE_MAX_DIGITS)) {
    return refuse("telefone", "Telefone deve ter de 10 a 13 dígitos, com DDD.");
  }

  const address = normalizeOptionalText(input.address);
  const addressTooLong = tooLong(address, STOREFRONT_LIMITS.endereco, "endereco", "Endereço");
  if (addressTooLong) return addressTooLong;

  return {
    ok: true,
    value: {
      active: input.active === true,
      layout: input.layout as StorefrontLayout,
      accentColor,
      font: input.font as StorefrontFont,
      creci,
      legalName,
      headline,
      about,
      instagram,
      phone,
      address,
    },
  };
}
