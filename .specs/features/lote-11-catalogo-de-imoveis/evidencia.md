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

---

## §20 — Evidência visual da tela `/imoveis` (T20)

Capturas reais via `mcp__claude-in-chrome__*` (extensão Chrome), nunca o painel embutido nem
inspeção de DOM. Servidor: `npm run dev` (dev server local, porta 3000), banco de dev seedado com
`npm run db:seed`. Imagens em `.specs/features/lote-11-catalogo-de-imoveis/evidencia/`.

**Login real.** O seed só grava credencial (linha em `accounts`) para o administrador via
`npm run db:create-admin` — gestor e corretor nascem em estado de convite pendente, sem senha
(design.md). Para logar de verdade como gestor e como corretor, duas contas de teste
(`gestor.t20@local.test`, `corretor.t20@local.test`) foram criadas via
`POST /api/auth/sign-up/email` do próprio dev server e vinculadas ao tenant `vale-uberaba` com o
papel correspondente. As duas contas foram removidas do banco de dev ao final da captura — nenhum
usuário do seed foi tocado.

**Tema.** O app não tem toggle de tema — `astryx.css` resolve `light-dark()` pelo atributo
`data-theme` do `<html>` (`html[data-theme="light"] { color-scheme: light }` /
`[data-theme="dark"]`, `node_modules/@astryxdesign/theme-neutral/dist/theme.css:80-82`), e sem o
atributo segue `prefers-color-scheme` do SO — que nesta máquina é escuro. Setar
`document.documentElement.setAttribute('data-theme', 'light')` via `javascript_tool` força o mesmo
branch que o próprio app usaria se tivesse um toggle — não é alteração de UI, é a mesma chave que
o CSS do design system já expõe.

| # | Arquivo | Papel / tema | O que prova |
| --- | --- | --- | --- |
| 1 | `evidencia/t20-01-gestor-claro-catalogo.jpg` | Gestor, tema claro | Botão **Novo imóvel**, coluna **Ações** (editar/excluir) e toda a barra de filtros visíveis — os controles de escrita aparecem quando a permissão concede `escrever` (IMOV-04 AC1). |
| 2 | `evidencia/t20-02-corretor-claro-catalogo.jpg` | Corretor, tema claro | Mesma tela, mesmo inventário (4 imóveis, os mesmos preços e status) — mas **sem** botão de criar, **sem** coluna de Ações e **sem** nenhum controle de escrita. É a prova de `IMOV-04 AC2`, que o projeto não consegue provar por teste automatizado (zero `.test.tsx` — design.md § Risks). |
| 3 | `evidencia/t20-03-dialogo-cadastro-claro.jpg` | Gestor, tema claro | Diálogo **Novo imóvel** aberto (`property-form-dialog.tsx`, T17): Captador/Tipo/Modalidade/Status obrigatórios, switch de Publicado, nenhum campo de Referência (só existe na edição), campos de endereço opcionais. |
| 4 | `evidencia/t20-04-gestor-escuro-catalogo.jpg` | Gestor, tema escuro | A mesma tela do #1 com `data-theme="dark"` — confirma que a tabela, os badges de publicação e o `StatusDot` de status seguem os tokens de cor do tema escuro sem quebrar layout. |

**Desfecho:** as quatro capturas confirmam o comportamento esperado por IMOV-01/IMOV-04/IMOV-05 —
gestor com controle completo, corretor em leitura pura, diálogo único de cadastro/edição, e paridade
visual entre os dois temas. Nenhuma foi obtida por inspeção de DOM; todas são renderização real do
dev server via login de sessão real.
