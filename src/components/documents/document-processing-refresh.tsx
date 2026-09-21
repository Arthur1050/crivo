"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  PROCESSING_REFRESH_INTERVAL_MS,
  shouldPollForProcessing,
} from "./processing-refresh-policy";

interface DocumentProcessingRefreshProps {
  /**
   * Calculado no servidor a partir da lista já filtrada. Quando nenhum
   * documento está `processando`, o componente não agenda nada.
   */
  hasProcessingDocuments: boolean;
}

/**
 * Ilha cliente que atualiza o RSC enquanto houver extração em andamento
 * (lote-12 — T26, DOCTXT-01). Não renderiza nada: existe só pelo efeito.
 *
 * Um único timer por montagem, recriado quando a visibilidade muda. Sair da
 * aba cancela o intervalo e voltar reagenda, então uma aba em segundo plano
 * não gera carga. Desmontar ou o último documento sair de `processando`
 * limpa o timer pela própria dependência do efeito.
 */
export function DocumentProcessingRefresh({
  hasProcessingDocuments,
}: DocumentProcessingRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!hasProcessingDocuments) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const sync = () => {
      const visibility = document.visibilityState === "hidden" ? "hidden" : "visible";
      const shouldPoll = shouldPollForProcessing(hasProcessingDocuments, visibility);

      // Parar antes de decidir garante um único intervalo vivo por vez, mesmo
      // que o evento de visibilidade dispare repetidamente.
      stop();
      if (shouldPoll) {
        intervalId = setInterval(() => router.refresh(), PROCESSING_REFRESH_INTERVAL_MS);
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [hasProcessingDocuments, router]);

  return null;
}
