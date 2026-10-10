import type { ReactNode } from "react";
import type { Imovel, Loja } from "../../db/views";

/**
 * Props dos dois templates de catálogo (grade e editorial): as mesmas, para a
 * página escolher o template só pelo `layout` da loja (VTEMA-02).
 */
export interface PropsDoCatalogo {
  loja: Pick<Loja, "slug" | "nome" | "titulo" | "sobre" | "whatsapp">;
  /** Até 6 destaques, na ordem do catálogo; vazio omite a faixa (VTEMA AC6). Só na página 1. */
  destaques: readonly Imovel[];
  /** Os imóveis da página corrente, já ordenados e fatiados. */
  imoveis: readonly Imovel[];
  /** Paginação já montada pela página; `null` quando há uma página só. */
  paginacao: ReactNode;
}

/** Teto da faixa "Destaques" (assumption da spec). */
export const MAXIMO_DE_DESTAQUES = 6;
