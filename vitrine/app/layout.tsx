import type { Metadata } from "next";
import { CLASSE_DAS_FONTES } from "../src/tema/fontes";
import "./globals.css";

export const metadata: Metadata = {
  // AD-043: noindex em toda página (o `X-Robots-Tag` cobre as rotas sem HTML).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `data-theme="light"`: a vitrine é só no modo claro (design.md § Tema).
    // As classes do `next/font` declaram `--font-<fonte>` no `<html>`, de onde o
    // tema da loja as lê (`var(--font-<fonte>)`, VTEMA AC3).
    <html lang="pt-BR" data-theme="light" className={CLASSE_DAS_FONTES}>
      <body>{children}</body>
    </html>
  );
}
