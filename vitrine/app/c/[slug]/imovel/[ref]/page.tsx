import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { registrarErro, VitrineIndisponivel } from "../../../../../src/loja/indisponivel";
import { ImovelIndisponivel } from "../../../../../src/loja/nao-encontrado";
import { imovelCacheado } from "../../../../../src/dados/cache";
import { referenciaDaUrl, slugValido } from "../../../../../src/lib/catalogo";

interface Props {
  params: Promise<{ slug: string; ref: string }>;
}

/**
 * Página do imóvel. Até a T23 só decide entre "existe" e "indisponível": a
 * composição do imóvel (T22) e os metadados entram na T23. Referência fora do
 * formato não consulta o banco; referência que não está em `vitrine.imoveis`
 * da loja (inexistente, vendida, reservada, despublicada ou de outra loja)
 * mostra o imóvel indisponível dentro da marca da loja (VITEM AC5). É
 * renderizado aqui e não com `notFound()`: ver `not-found.tsx` da loja.
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
  try {
    imovel = await imovelCacheado(slug, referencia);
  } catch (erro) {
    unstable_rethrow(erro);
    registrarErro("imovel", erro);
    return <VitrineIndisponivel />;
  }
  if (!imovel) return <ImovelIndisponivel slug={slug} />;
  return null;
}
