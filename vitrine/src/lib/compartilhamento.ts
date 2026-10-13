import type { Metadata } from "next";
import type { Loja } from "../db/views";
import { metadadosDoCatalogo } from "./apresentacao";

type ImagensOg = NonNullable<Metadata["openGraph"]>["images"];
type ImagensTwitter = NonNullable<Metadata["twitter"]>["images"];

/**
 * Metadados de compartilhamento da loja (VOG-01 AC1, AC2, AC4): título
 * "<nome> — imóveis", descrição institucional ou "Imóveis disponíveis em
 * <cidade>/<uf>", `og:url` do catálogo e `twitter:card`. Servem ao catálogo e
 * à página de imóvel indisponível (VITEM AC5), que é página de loja (VLEGAL
 * AC1) e não leva nenhum dado do imóvel pedido.
 *
 * `imagens` só entra quando é passado: o `opengraph-image` do segmento da loja
 * é herdado pelo catálogo, mas o `openGraph` de uma página filha substitui o do
 * pai por inteiro, então a página do imóvel repassa as imagens do `parent`.
 * Não define `robots`: o `noindex` vem do layout raiz.
 */
export function metadataDoCatalogo(
  loja: Pick<Loja, "slug" | "nome" | "titulo" | "cidade" | "uf">,
  imagens: { og?: ImagensOg; twitter?: ImagensTwitter } = {}
): Metadata {
  const { titulo, descricao } = metadadosDoCatalogo(loja);
  return {
    title: titulo,
    description: descricao,
    openGraph: {
      title: titulo,
      description: descricao,
      url: `/c/${loja.slug}`,
      siteName: loja.nome,
      locale: "pt_BR",
      type: "website",
      ...(imagens.og ? { images: imagens.og } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descricao,
      ...(imagens.twitter ? { images: imagens.twitter } : {}),
    },
  };
}
