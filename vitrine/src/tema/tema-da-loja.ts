import { defineTheme, generateThemeCSS, type DefinedTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";
import { FONTES, type Fonte } from "../contrato";
import { slugValido } from "../lib/catalogo";
import { corValida } from "./cor";

/**
 * Tema por loja (lote-16b — VTEMA-01; AD-046). Puro e sem `next/font`: o teste
 * o importa direto. Só pode ser avaliado em código de cliente (ver
 * `tema-da-loja-provider.tsx`): `defineTheme` e o tema neutro não rodam em
 * Server Component.
 */

const FONTE_PADRAO: Fonte = "inter";

export interface EntradaDoTema {
  slug: string;
  /** `#rrggbb` minúsculo, ou `null`/inválida para o accent do tema neutro. */
  cor: string | null;
  fonte: Fonte;
}

/**
 * `defineTheme` estendendo o tema neutro, nome `loja-<slug>` (escopo `@scope` e
 * chave de injeção por loja). Sem cor válida, a loja herda o accent do tema
 * neutro. As fontes entram por `tokens`: a string do `next/font` em
 * `typography.body.family` vira uma família entre aspas que não casa com a fonte
 * (achado do gate T0); aqui vai `var(--font-<fonte>)`, declarada no `<html>`.
 */
export function temaDaLoja(entrada: EntradaDoTema): DefinedTheme {
  if (!slugValido(entrada.slug)) {
    throw new Error("Slug fora do formato aceito: o tema da loja não é criado.");
  }
  const fonte = FONTES.includes(entrada.fonte) ? entrada.fonte : FONTE_PADRAO;
  const cor = corValida(entrada.cor);
  const familia = `var(--font-${fonte})`;
  return defineTheme({
    name: `loja-${entrada.slug}`,
    extends: neutralTheme,
    ...(cor ? { color: { accent: cor, neutralStyle: "neutral" as const } } : {}),
    tokens: {
      "--font-family-body": familia,
      "--font-family-heading": familia,
    },
  });
}

export interface CssDoTema {
  /** Prosa do tema, na camada `reset` (vazio se o tema não define). */
  reset: string;
  /** Tokens e overrides de componente, na camada `astryx-theme`. */
  tema: string;
}

/**
 * O CSS que o `<Theme>` injetaria no cliente (`generateThemeCSS`, o gerador
 * único do runtime e do `astryx theme build`), nas mesmas camadas, para sair
 * no HTML do servidor (AD-046).
 */
export function cssDoTema(tema: DefinedTheme): CssDoTema {
  const { prose, component } = generateThemeCSS(tema);
  return {
    reset: prose ? `@layer reset {\n${prose}\n}` : "",
    tema: component ? `@layer astryx-theme {\n${component}\n}` : "",
  };
}
