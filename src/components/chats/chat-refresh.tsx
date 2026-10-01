"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  CHAT_REFRESH_INTERVAL_MS,
  shouldPollConversation,
} from "@/src/lib/conversation-control";

interface ChatRefreshProps {
  /** Calculado no servidor: há uma conversa selecionada na tela. */
  hasOpenConversation: boolean;
}

/**
 * Ilha cliente que atualiza o RSC da conversa aberta (lote-14 — THREAD-01
 * AC2/AC3, JANELA-01 AC5). Não renderiza nada: existe só pelo efeito.
 *
 * Mesmo desenho de `DocumentProcessingRefresh`: um único intervalo por vez,
 * cancelado quando a aba fica oculta e reagendado quando ela volta. A regra
 * de quando consultar e o intervalo vêm de `conversation-control.ts`, testados
 * fora do componente.
 */
export function ChatRefresh({ hasOpenConversation }: ChatRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!hasOpenConversation) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const sync = () => {
      const visibility = document.visibilityState === "hidden" ? "hidden" : "visible";
      // Parar antes de decidir garante um único intervalo vivo por vez.
      stop();
      if (shouldPollConversation(hasOpenConversation, visibility)) {
        intervalId = setInterval(() => router.refresh(), CHAT_REFRESH_INTERVAL_MS);
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);

    return () => {
      document.removeEventListener("visibilitychange", sync);
      stop();
    };
  }, [hasOpenConversation, router]);

  return null;
}
