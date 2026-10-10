import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // AD-043: noindex em toda página (o `X-Robots-Tag` cobre as rotas sem HTML).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
