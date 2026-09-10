# Catálogo de imóveis — Evidência

## §1 — Piso de testes (T1)

Medido em árvore limpa, nesta janela (2026-09-10), antes de qualquer mudança do lote-11 —
não copiado do Handoff do lote-10.

- `git status --porcelain` vazio antes da medição — confirmado.
- `npx vitest run`: **1076 testes passaram, 0 falharam, 82 arquivos de teste**.
- `npm run lint`: **0 erros, 3 avisos** — todos pré-existentes e esperados:
  - `n8n/generated/scheduler.ts:32:35` — `'ifElse' is defined but never used`
  - `n8n/workflows/scheduler.ts:32:35` — `'ifElse' is defined but never used`
  - `src/server/integration/__tests__/route-instrumentation.test.ts:60:7` — `Unused eslint-disable directive`
- `npm run build`: **exit 0**. Todas as rotas compilaram (20 rotas do app + proxy/middleware).
  Os `BetterAuthError`/warnings de `BETTER_AUTH_SECRET`/`baseURL` no log de build são ruído
  pré-existente da geração estática sem env de produção — não bloqueiam o build (exit 0) e não
  são deste lote.

Piso registrado: **1076 testes / 82 arquivos / lint 0 erros+3 avisos / build exit 0**. Este é o
número contra o qual toda task subsequente do lote-11 deve subir monotonicamente.
