/**
 * Cor da loja (lote-16b — VTEMA-01 AC2). Sem importar a Astryx: este módulo é
 * usado também no servidor (cartão OG, T24), e `defineTheme`/`neutralTheme`
 * não podem ser avaliados num Server Component (achado do gate T0).
 */

/** Formato aceito para a cor da loja (check do banco: `^#[0-9a-f]{6}$`). */
const COR_VALIDA = /^#[0-9a-f]{6}$/;

/**
 * Accent do tema neutro da Astryx, no modo claro: a cor padrão da vitrine.
 * `tema-da-loja.test.ts` confere que este valor é o do tema neutro; se a lib
 * mudar o accent, o teste quebra e este literal acompanha.
 */
export const COR_PADRAO = "#262626";

/** A cor da loja se tiver o formato `#rrggbb` em minúsculas; senão `null` (usa o padrão). */
export function corValida(cor: string | null | undefined): string | null {
  return typeof cor === "string" && COR_VALIDA.test(cor) ? cor : null;
}

/** Cor do cartão OG: a da loja ou a padrão. */
export function corDoCartao(cor: string | null | undefined): string {
  return corValida(cor) ?? COR_PADRAO;
}
