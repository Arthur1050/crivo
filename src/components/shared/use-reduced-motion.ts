"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onStoreChange);

  return () => query.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/**
 * O servidor não tem como conhecer a preferência do usuário; assumir "não
 * reduzir" mantém o HTML do servidor e a hidratação consistentes, e o
 * cliente corrige na primeira leitura real.
 */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * `true` quando o sistema do usuário pede movimento reduzido.
 *
 * `matchMedia` é uma fonte externa ao React, então a assinatura passa por
 * `useSyncExternalStore` — sem `setState` dentro de efeito. Quem consome
 * deve usar isto para ZERAR a animação, nunca para trocá-la por outra.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
