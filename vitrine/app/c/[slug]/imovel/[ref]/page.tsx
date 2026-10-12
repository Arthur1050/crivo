import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { imovelCacheado, lojaCacheada } from "../../../../../src/dados/cache";
import { PaginaItem } from "../../../../../src/item/pagina-item";
import { metadadosDoItem } from "../../../../../src/lib/apresentacao";
import { referenciaDaUrl, referenciaParaUrl, slugValido } from "../../../../../src/lib/catalogo";
import { registrarErro, VitrineIndisponivel } from "../../../../../src/loja/indisponivel";
import { ImovelIndisponivel } from "../../../../../src/loja/nao-encontrado";

interface Props {
  params: Promise<{ slug: string; ref: string }>;
}

/**
 * Metadados de compartilhamento do imóvel (VOG-01 AC1, AC3, AC4): título
 * "<Tipo> em <bairro> — <REF>", descrição "<quartos> quartos · <área> m² ·
 * <preço>" e `og:image` = primeira foto cadastrada. Sem foto, `images` fica de
 * fora e o segmento herda o cartão gerado da loja (`opengraph-image`, T24).
 * Imóvel que a página não mostra (inexistente, vendido, reservado,
 * despublicado, de outra loja) fica sem metadados próprios: nada dele vaza.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, ref } = await params;
  const referencia = referenciaDaUrl(ref);
  if (!slugValido(slug) || !referencia) return {};
  try {
    const imovel = await imovelCacheado(slug, referencia);
    if (!imovel) return {};
    const { titulo, descricao } = metadadosDoItem(imovel);
    const primeiraFoto = imovel.fotos?.[0];
    const imagens = primeiraFoto ? [primeiraFoto] : undefined;
    return {
      title: titulo,
      description: descricao,
      openGraph: {
        title: titulo,
        description: descricao,
        url: `/c/${slug}/imovel/${referenciaParaUrl(imovel.referencia)}`,
        locale: "pt_BR",
        type: "website",
        ...(imagens ? { images: imagens } : {}),
      },
      twitter: {
        card: "summary_large_image",
        title: titulo,
        description: descricao,
        ...(imagens ? { images: imagens } : {}),
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
