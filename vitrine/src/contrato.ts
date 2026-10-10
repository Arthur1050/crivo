/**
 * Contrato espelhado com o CRM (lote-16b — VPROJ-02; AD-041).
 *
 * Cópia de `src/lib/storefront-contract.ts`: a vitrine nunca importa de fora de
 * `vitrine/`. O que precisa ser igual dos dois lados (formato da tag de cache,
 * layouts, fontes, payload da revalidação e nome/ordem das colunas das duas
 * views) é declarado nos dois arquivos, e `storefront-contract-parity.test.ts`,
 * na suíte raiz, falha se divergirem. Mudou aqui, muda lá.
 */

export const LAYOUTS = ["grade", "editorial"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const FONTES = ["inter", "montserrat", "lora", "playfair"] as const;
export type Fonte = (typeof FONTES)[number];

/** Tag única por loja: toda leitura cacheada (loja, lista, item) a recebe. */
export function tagDaLoja(slug: string): string {
  return `tenant:${slug}:catalogo`;
}

/** Corpo do `POST /api/revalidar`: só o slug (AD-042). */
export type CorpoRevalidacao = { slug: string };

/** Colunas das views do schema `vitrine`, no nome e na ordem exatos (AD-040). */
export const COLUNAS_DAS_VIEWS = {
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
