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

/**
 * Cor do texto sobre o cartão OG: branco ou quase preto, a de maior contraste
 * com o fundo (luminância relativa WCAG; o corte de 0,179 é onde o contraste
 * com o branco e com o preto se igualam). Recebe a cor já validada.
 */
export function corDoTextoSobre(fundo: string): string {
  const canais = [1, 3, 5].map((inicio) => {
    const c = parseInt(fundo.slice(inicio, inicio + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminancia = 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
  return luminancia > 0.179 ? "#111111" : "#ffffff";
}
