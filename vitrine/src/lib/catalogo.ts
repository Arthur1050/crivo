/**
 * Regras puras do catálogo e das rotas da vitrine (lote-16b — VCAT-02, VCAT-03,
 * VITEM-01). Sem `next`, sem I/O.
 */

/** Imóveis por página do catálogo (VCAT AC3). */
export const POR_PAGINA = 24;

export interface Pagina<T> {
  itens: T[];
  /** Página mostrada, já corrigida (inválida → 1; acima da última → última). */
  pagina: number;
  totalPaginas: number;
  total: number;
}

/**
 * Fatia `itens` na página pedida. `pagina` vem de `?pagina=` e pode ser
 * qualquer coisa: só inteiro maior que zero conta; o resto cai na página 1
 * (VCAT AC4), e número acima da última cai na última (VCAT AC5).
 */
export function paginar<T>(itens: readonly T[], pagina: unknown): Pagina<T> {
  const totalPaginas = Math.max(1, Math.ceil(itens.length / POR_PAGINA));
  let atual = 1;
  if (typeof pagina === "string" && /^\d+$/.test(pagina.trim())) {
    const pedida = Number(pagina.trim());
    if (pedida > 0) atual = Math.min(pedida, totalPaginas);
  }
  const inicio = (atual - 1) * POR_PAGINA;
  return {
    itens: itens.slice(inicio, inicio + POR_PAGINA),
    pagina: atual,
    totalPaginas,
    total: itens.length,
  };
}

/** Slug de loja aceito na URL (VCAT AC8, VCACHE AC5): minúsculas, dígitos e hífen, até 63. */
export const SLUG_VALIDO = /^[a-z0-9-]{1,63}$/;

export function slugValido(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_VALIDO.test(slug);
}

/** Referência na URL do imóvel: sempre em minúsculas (VITEM AC2). */
export function referenciaParaUrl(referencia: string): string {
  return encodeURIComponent(referencia.toLowerCase());
}

const REFERENCIA_VALIDA = /^[a-z0-9-]{1,40}$/;

/**
 * Referência vinda da URL, normalizada para minúsculas; `null` quando não tem
 * o formato de uma referência (letras, dígitos e hífen, até 40). Evita consulta
 * e entrada de cache para texto arbitrário.
 */
export function referenciaDaUrl(parametro: unknown): string | null {
  if (typeof parametro !== "string") return null;
  let texto = parametro;
  try {
    texto = decodeURIComponent(parametro);
  } catch {
    return null;
  }
  const referencia = texto.trim().toLowerCase();
  return REFERENCIA_VALIDA.test(referencia) ? referencia : null;
}

/**
 * Destino da navegação da paginação (VCAT AC3): a mesma rota com
 * `?pagina=<n>`; a página 1 volta à rota sem parâmetro.
 */
export function urlDaPagina(caminho: string, pagina: number): string {
  return pagina === 1 ? caminho : `${caminho}?pagina=${pagina}`;
}
