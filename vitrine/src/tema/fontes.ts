import { Inter, Lora, Montserrat, Playfair_Display } from "next/font/google";
import type { Fonte } from "../contrato";

/**
 * As 4 fontes da lista fechada (VTEMA AC3), carregadas pelo `next/font/google`
 * em tempo de build e servidas junto com os assets (nenhuma requisição ao
 * Google do navegador). Cada uma expõe `--font-<id>`, que o tema da loja usa
 * como `var(--font-<id>)`.
 *
 * Módulo próprio porque `next/font/google` é vazio fora do compilador do Next
 * (`index.js` de 0 bytes) e não pode ser importado por um teste. Tipado como
 * `Record<Fonte, …>`: fonte nova ou renomeada no contrato quebra a compilação
 * (L-029).
 */
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const FONTES_DO_NEXT: Record<Fonte, { variable: string }> = {
  inter,
  montserrat,
  lora,
  playfair,
};

/** Classe do `<html>` que declara as 4 variáveis de fonte. */
export const CLASSE_DAS_FONTES = Object.values(FONTES_DO_NEXT)
  .map((fonte) => fonte.variable)
  .join(" ");
