"use client";

import { useParams } from "next/navigation";
import { ImovelIndisponivel } from "../../../src/loja/nao-encontrado";

/**
 * Rede de segurança do segmento da loja (VITEM AC5): qualquer `notFound()`
 * lançado abaixo do layout cai aqui e mostra o imóvel indisponível dentro da
 * marca da loja. A página do imóvel não depende dele: com `notFound()` dentro de
 * `<Suspense>` o servidor manda o limite para render no cliente e o HTML sem JS
 * sai sem a mensagem; por isso a página renderiza `ImovelIndisponivel`
 * diretamente.
 *
 * O arquivo não recebe `params`; o slug vem de `useParams` (cliente).
 */
export default function ImovelIndisponivelDaLoja() {
  const { slug } = useParams<{ slug: string }>();
  return <ImovelIndisponivel slug={slug} />;
}
