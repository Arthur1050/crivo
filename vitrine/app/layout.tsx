import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import type { Metadata } from "next";
import { MENSAGENS_PT_BR } from "../src/i18n/mensagens";
import { CLASSE_DAS_FONTES } from "../src/tema/fontes";
import "./globals.css";

/** Base das URLs absolutas de `og:url` e `og:image` (VOG AC1); sem a variável, ficam relativas. */
function urlPublica(): URL | undefined {
  const valor = process.env.VITRINE_PUBLIC_URL;
  if (!valor) return undefined;
  try {
    return new URL(valor);
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: urlPublica(),
  // AD-043: noindex em toda página (o `X-Robots-Tag` cobre as rotas sem HTML).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `data-theme="light"`: a vitrine é só no modo claro (design.md § Tema).
    // As classes do `next/font` declaram `--font-<fonte>` no `<html>`, de onde o
    // tema da loja as lê (`var(--font-<fonte>)`, VTEMA AC3).
    <html lang="pt-BR" data-theme="light" className={CLASSE_DAS_FONTES}>
      <body>
        <InternationalizationProvider locale="pt-BR" messages={{ "pt-BR": MENSAGENS_PT_BR }}>
          {children}
        </InternationalizationProvider>
      </body>
    </html>
  );
}
