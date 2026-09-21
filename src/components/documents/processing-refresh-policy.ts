/**
 * Política do refresh enquanto há documento processando (lote-12 — T26).
 * Separada do componente para ser verificável sem navegador: o componente só
 * aplica a decisão, não a toma.
 */

/**
 * Intervalo do refresh. Curto o bastante para a transição de `processando` não
 * parecer travada, longo o bastante para não transformar a lista num polling
 * agressivo contra o banco.
 */
export const PROCESSING_REFRESH_INTERVAL_MS = 3000;

export type PageVisibility = "visible" | "hidden";

/**
 * O refresh existe apenas enquanto duas condições valem ao mesmo tempo: há
 * documento em `processando` e a aba está visível. Aba oculta não gera carga —
 * ninguém está olhando, e a volta ao foco já dispara um ciclo novo.
 */
export function shouldPollForProcessing(
  hasProcessingDocuments: boolean,
  visibility: PageVisibility
): boolean {
  return hasProcessingDocuments && visibility === "visible";
}
