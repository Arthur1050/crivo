import type { Metadata, ResolvingMetadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { imovelCacheado, lojaCacheada } from "../../../../../src/dados/cache";
import { PaginaItem } from "../../../../../src/item/pagina-item";
import { metadadosDoItem } from "../../../../../src/lib/apresentacao";
import { referenciaDaUrl, referenciaParaUrl, slugValido } from "../../../../../src/lib/catalogo";
import { metadataDoCatalogo } from "../../../../../src/lib/compartilhamento";
import { registrarErro, VitrineIndisponivel } from "../../../../../src/loja/indisponivel";
import { ImovelIndisponivel } from "../../../../../src/loja/nao-encontrado";

interface Props {
  params: Promise<{ slug: string; ref: string }>;
}

/**
 * Metadados de compartilhamento do imóvel (VOG-01 AC1, AC3, AC4): título
 * "<Tipo> em <bairro> — <REF>", descrição "<quartos> quartos · <área> m² ·
 * <preço>" e `og:image` = primeira foto cadastrada. Sem foto, é o cartão
 * gerado da loja (`opengraph-image`, T24): o `openGraph` desta página substitui
 * o do segmento da loja por inteiro, então as imagens dele são repassadas do
 * `parent`.
 *
 * Imóvel que a página não mostra (inexistente, referência fora do formato,
 * vendido, reservado, despublicado, de outra loja) é a página de imóvel
 * indisponível, que é página de loja (VITEM AC5, VLEGAL AC1): leva os
 * metadados do catálogo da loja (VOG AC1, AC2) e nenhum dado do imóvel pedido.
 * Loja que a vitrine não mostra é a página neutra, sem metadados de marca
 * (VCAT AC9).
 */
export async function generateMetadata({ params }: Props, parent: ResolvingMetadata): Promise<Metadata> {
  const { slug, ref } = await params;
  if (!slugValido(slug)) return {};
  const referencia = referenciaDaUrl(ref);
  try {
    // Referência fora do formato não consulta o imóvel (nem entra no cache).
    const [loja, imovel] = await Promise.all([
      lojaCacheada(slug),
      referencia ? imovelCacheado(slug, referencia) : Promise.resolve(null),
    ]);
    if (!loja) return {};
    if (!imovel) {
      const herdadas = await parent;
      return metadataDoCatalogo(loja, { og: herdadas.openGraph?.images, twitter: herdadas.twitter?.images });
    }
    const { titulo, descricao } = metadadosDoItem(imovel);
    const primeiraFoto = imovel.fotos?.[0];
    const herdadas = primeiraFoto ? undefined : await parent;
    const imagensOg = primeiraFoto ? [primeiraFoto] : herdadas?.openGraph?.images;
    const imagensTwitter = primeiraFoto ? [primeiraFoto] : herdadas?.twitter?.images;
    return {
      title: titulo,
      description: descricao,
      openGraph: {
        title: titulo,
        description: descricao,
        url: `/c/${slug}/imovel/${referenciaParaUrl(imovel.referencia)}`,
        locale: "pt_BR",
        type: "website",
        ...(imagensOg ? { images: imagensOg } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: titulo,
        description: descricao,
        ...(imagensTwitter ? { images: imagensTwitter } : {}),
      },
    };
  } catch (erro) {
    unstable_rethrow(erro);
    registrarErro("metadados", erro);
    return {};
  }
}

/**
 * Página do imóvel (VITEM-01, VITEM-02). Referência fora do formato não
 * consulta o banco; referência que não está em `vitrine.imoveis` da loja
 * (inexistente, vendida, reservada, despublicada ou de outra loja) mostra o
 * imóvel indisponível dentro da marca da loja (VITEM AC5). É renderizado aqui
 * e não com `notFound()`: ver `not-found.tsx` da loja.
 */
export default function PaginaDoImovel({ params }: Props) {
  return (
    <Suspense fallback={null}>
      <ImovelDaLoja params={params} />
    </Suspense>
  );
}

async function ImovelDaLoja({ params }: Props) {
  const { slug, ref } = await params;
  // O layout valida o slug, mas layout e página renderizam em paralelo: aqui
  // também, para não consultar o banco com slug fora do formato (VCAT AC8).
  // Slug inválido: o layout já mostra a página neutra no lugar da loja.
  if (!slugValido(slug)) return null;
  const referencia = referenciaDaUrl(ref);
  if (!referencia) return <ImovelIndisponivel slug={slug} />;
  let imovel: Awaited<ReturnType<typeof imovelCacheado>>;
  let loja: Awaited<ReturnType<typeof lojaCacheada>>;
  try {
    [imovel, loja] = await Promise.all([imovelCacheado(slug, referencia), lojaCacheada(slug)]);
  } catch (erro) {
    unstable_rethrow(erro);
    registrarErro("imovel", erro);
    return <VitrineIndisponivel />;
  }
  // Loja sem vitrine visível: o layout já mostra a página neutra.
  if (!loja) return null;
  if (!imovel) return <ImovelIndisponivel slug={slug} />;
  return <PaginaItem loja={loja} imovel={imovel} />;
}
