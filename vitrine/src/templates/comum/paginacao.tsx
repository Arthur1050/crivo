"use client";

import { Pagination } from "@astryxdesign/core/Pagination";
import { usePathname, useRouter } from "next/navigation";
import { urlDaPagina } from "../../lib/catalogo";

interface Props {
  pagina: number;
  total: number;
  porPagina: number;
}

/**
 * Paginação do catálogo (VCAT AC3). A seleção é por `?pagina=<n>`: trocar de
 * página navega para a mesma rota com o parâmetro. O `Pagination` da Astryx só
 * dispara `onChange`, então é preciso cliente; o texto sai em português pelo
 * catálogo de `src/i18n/mensagens.ts`.
 */
export function PaginacaoDoCatalogo({ pagina, total, porPagina }: Props) {
  const roteador = useRouter();
  const caminho = usePathname();

  return (
    <Pagination
      page={pagina}
      totalItems={total}
      pageSize={porPagina}
      onChange={(destino) => roteador.push(urlDaPagina(caminho, destino))}
    />
  );
}
