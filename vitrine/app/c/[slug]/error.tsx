"use client";

import { useEffect } from "react";
import { VitrineIndisponivel } from "../../../src/loja/indisponivel";

/**
 * Rede de segurança do segmento da loja (VSEG-02): erro inesperado de render
 * abaixo do layout mostra a mensagem sem detalhe técnico. A falha de leitura do
 * banco já é tratada onde acontece (layout e página do imóvel), no servidor,
 * porque erro lançado dentro de `<Suspense>` só chega aqui no cliente e o HTML
 * sem JS sairia sem a mensagem.
 *
 * O log leva só o digest (identificador opaco); a mensagem e a pilha do erro,
 * que podem citar host ou SQL, não são impressas.
 */
export default function ErroDaVitrine({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(`[vitrine] erro: ${error.digest ?? "sem digest"}`);
  }, [error]);

  return <VitrineIndisponivel />;
}
