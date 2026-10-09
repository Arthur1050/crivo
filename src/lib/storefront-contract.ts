/**
 * Contrato espelhado da vitrine pública (lote-16a — VCFG-01, VBANCO-01; AD-041).
 *
 * O que precisa ser igual dos dois lados (CRM e `vitrine/`): formato da tag de
 * cache, layouts, fontes, payload da revalidação e nome/ordem das colunas das
 * duas views. A vitrine nunca importa daqui; ela declara a própria cópia em
 * `vitrine/src/contrato.ts` e um teste de paridade da suíte raiz falha se as
 * duas divergirem (L16b). Função pura, sem I/O — mesmo padrão de
 * `src/lib/permissions.ts`.
 */

export const STOREFRONT_LAYOUTS = ["grade", "editorial"] as const;
export type StorefrontLayout = (typeof STOREFRONT_LAYOUTS)[number];

export const STOREFRONT_FONTS = ["inter", "montserrat", "lora", "playfair"] as const;
export type StorefrontFont = (typeof STOREFRONT_FONTS)[number];

/** Tag única por loja: toda leitura cacheada da vitrine (loja, lista, item) a recebe. */
export function storefrontCacheTag(slug: string): string {
  return `tenant:${slug}:catalogo`;
}

/** Corpo do `POST <VITRINE_PUBLIC_URL>/api/revalidar`: só o slug (AD-042). */
export type RevalidationRequest = { slug: string };

/** Colunas das views do schema `vitrine`, no nome e na ordem exatos (AD-040). */
export const STOREFRONT_VIEW_COLUMNS = {
  lojas: [
    "slug",
    "nome",
    "logo",
    "whatsapp",
    "cidade",
    "uf",
    "layout",
    "cor",
    "fonte",
    "creci",
    "razao_social",
    "titulo",
    "sobre",
    "instagram",
    "telefone",
    "endereco",
    "atualizado_em",
  ],
  imoveis: [
    "loja_slug",
    "referencia",
    "tipo",
    "modalidade",
    "bairro",
    "cidade",
    "uf",
    "preco_centavos",
    "area_m2",
    "quartos",
    "banheiros",
    "vagas",
    "descricao",
    "fotos",
    "destaque",
    "atualizado_em",
  ],
} as const;
