/**
 * Textos da Astryx em português (lote-16b — T21). A lib só traz o catálogo em
 * inglês e cai nele para o que falta; sem isto a paginação, o carrossel e o
 * visualizador de fotos anunciariam "Go to next page", "Scroll left" e "Close"
 * a leitores de tela numa vitrine em português (L-010).
 *
 * Só as chaves dos componentes que a vitrine monta. O formato é o de
 * `@astryxdesign/core/locales/en.json`; o teste do arquivo confere que toda
 * chave existe na lib e que os marcadores `{...}` são os mesmos.
 */
export const MENSAGENS_PT_BR: Record<string, { defaultMessage: string }> = {
  "@astryx.pagination.label": { defaultMessage: "Paginação" },
  "@astryx.pagination.previous": { defaultMessage: "Ir para a página anterior" },
  "@astryx.pagination.next": { defaultMessage: "Ir para a próxima página" },
  "@astryx.pagination.goToPage": { defaultMessage: "Ir para a página {page, number}" },
  "@astryx.pagination.pageIndicators": { defaultMessage: "Indicadores de página" },
  "@astryx.pagination.itemsPerPage": { defaultMessage: "Itens por página" },
  "@astryx.pagination.count": { defaultMessage: "{from, number}–{to, number} de {total, number}" },
  "@astryx.pagination.pageOfTotal": { defaultMessage: "Página {current, number} de {total, number}" },
  "@astryx.pagination.pageAnnounce": { defaultMessage: "Página {current, number}" },
  "@astryx.carousel.label": { defaultMessage: "Carrossel de fotos" },
  "@astryx.carousel.scrollLeft": { defaultMessage: "Rolar para a esquerda" },
  "@astryx.carousel.scrollRight": { defaultMessage: "Rolar para a direita" },
  "@astryx.carousel.slideLabel": { defaultMessage: "Foto {current, number} de {total, number}" },
  "@astryx.lightbox.close": { defaultMessage: "Fechar" },
  "@astryx.lightbox.previous": { defaultMessage: "Anterior" },
  "@astryx.lightbox.next": { defaultMessage: "Próxima" },
  "@astryx.lightbox.mediaViewer": { defaultMessage: "Visualizador de fotos" },
  "@astryx.link.newTab": { defaultMessage: "(abre em nova aba)" },
};
