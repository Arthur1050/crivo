import { Center } from "@astryxdesign/core/Center";
import { Spinner } from "@astryxdesign/core/Spinner";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { imoveisCacheados, lojaCacheada } from "../../../src/dados/cache";
import { paginar, POR_PAGINA, slugValido } from "../../../src/lib/catalogo";
import { metadataDoCatalogo } from "../../../src/lib/compartilhamento";
import { registrarErro, VitrineIndisponivel } from "../../../src/loja/indisponivel";
import { MAXIMO_DE_DESTAQUES } from "../../../src/templates/comum/catalogo";
import { PaginacaoDoCatalogo } from "../../../src/templates/comum/paginacao";
import { CatalogoEditorial } from "../../../src/templates/editorial/catalogo-editorial";
import { CatalogoGrade } from "../../../src/templates/grade/catalogo-grade";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pagina?: string | string[] }>;
}

/**
 * Metadados de compartilhamento do catálogo (VOG-01 AC1, AC2): título
 * "<nome> — imóveis" e descrição institucional ou "Imóveis disponíveis em
 * <cidade>/<uf>". Loja que a página não mostra (slug inválido, inexistente ou
 * inativa) fica sem metadados próprios; a imagem vem do `opengraph-image`.
 */
export async function generateMetadata({ params }: Pick<Props, "params">): Promise<Metadata> {
  const { slug } = await params;
  if (!slugValido(slug)) return {};
  try {
    const loja = await lojaCacheada(slug);
    if (!loja) return {};
    return metadataDoCatalogo(loja);
  } catch (erro) {
    unstable_rethrow(erro);
    registrarErro("metadados", erro);
    return {};
  }
}

/**
 * Página de catálogo (VCAT-01, VCAT-02, VTEMA-02). `params` e `searchParams`
 * só são lidos dentro de `<Suspense>` (Cache Components): a casca é estática e
 * o catálogo da loja vem do cache por loja (AD-042). A loja que o layout não
 * mostra (slug inválido, sem vitrine) não chega a renderizar a página.
 */
export default function PaginaDaLoja({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <Center height="50vh">
          <Spinner label="Carregando os imóveis" />
        </Center>
      }
    >
      <CatalogoDaLoja params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function CatalogoDaLoja({ params, searchParams }: Props) {
  const { slug } = await params;
  const { pagina: pedida } = await searchParams;
  // O layout já mostra a página neutra; aqui só não consulta o banco (VCAT AC8).
  if (!slugValido(slug)) return null;

  let loja: Awaited<ReturnType<typeof lojaCacheada>>;
  let imoveis: Awaited<ReturnType<typeof imoveisCacheados>>;
  try {
    [loja, imoveis] = await Promise.all([lojaCacheada(slug), imoveisCacheados(slug)]);
  } catch (erro) {
    unstable_rethrow(erro);
    registrarErro("catalogo", erro);
    return <VitrineIndisponivel />;
  }
  if (!loja) return null;

  // `?pagina=` repetido chega como lista: vale o primeiro valor.
  const corrente = paginar(imoveis, Array.isArray(pedida) ? pedida[0] : pedida);
  // A faixa "Destaques" só abre o catálogo (página 1): nas outras páginas ela
  // repetiria imóveis que a página 2 não deve mostrar.
  const destaques =
    corrente.pagina === 1 ? imoveis.filter((imovel) => imovel.destaque).slice(0, MAXIMO_DE_DESTAQUES) : [];

  const propriedades = {
    loja,
    destaques,
    imoveis: corrente.itens,
    paginacao:
      corrente.totalPaginas > 1 ? (
        <PaginacaoDoCatalogo pagina={corrente.pagina} total={corrente.total} porPagina={POR_PAGINA} />
      ) : null,
  };

  return loja.layout === "editorial" ? <CatalogoEditorial {...propriedades} /> : <CatalogoGrade {...propriedades} />;
}
