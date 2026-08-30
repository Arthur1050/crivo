import type { ReactNode } from "react";
import { VStack } from "@astryxdesign/core/Stack";

/**
 * Shell do grupo `(relatorio)` (lote-9 — REL-01): nasce SEM `AppShell`/
 * `Sidebar`, em vez de esconder o shell do CRM com CSS de impressão
 * (design.md — Rota de relatório, "Detalhe"). A proteção continua de pé —
 * `proxy.ts` exige cookie de sessão em toda rota fora de `/api` (esta
 * incluída) e a guarda real (`requirePermission("configuracoes", "ler")`)
 * mora na própria página.
 *
 * `padding` aqui substitui o `contentPadding` que o `AppShell` daria — sem
 * ele o relatório coleria nas bordas da janela/página impressa.
 */
export default function RelatorioLayout({ children }: { children: ReactNode }) {
  return <VStack padding={8}>{children}</VStack>;
}
