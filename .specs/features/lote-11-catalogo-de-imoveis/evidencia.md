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
| 1 | `evidencia/t20-01-gestor-claro-catalogo.jpg` | Gestor, tema claro | Botão **Novo imóvel** e toda a barra de filtros visíveis no viewport capturado. A tabela tem mais colunas do que cabem nesse recorte — a barra de scroll horizontal no rodapé mostra isso — e a coluna **Ações** fica fora da área capturada nesta imagem. Ver #5 para a prova da coluna Ações. |
| 2 | `evidencia/t20-02-corretor-claro-catalogo.jpg` | Corretor, tema claro | Mesma tela, mesmo inventário (4 imóveis, os mesmos preços e status) — **sem** botão de criar. Este recorte, por si só, não distingue "coluna Ações ausente" de "coluna Ações fora da área capturada" (o mesmo corte de tabela que afeta #1); ver #6 para a distinção real. |
| 3 | `evidencia/t20-03-dialogo-cadastro-claro.jpg` | Gestor, tema claro | Diálogo **Novo imóvel** aberto (`property-form-dialog.tsx`, T17): Captador/Tipo/Modalidade/Status obrigatórios, switch de Publicado, nenhum campo de Referência (só existe na edição), campos de endereço opcionais. |
| 4 | `evidencia/t20-04-gestor-escuro-catalogo.jpg` | Gestor, tema escuro | A mesma tela do #1 com `data-theme="dark"` — confirma que a tabela, os badges de publicação e o `StatusDot` de status seguem os tokens de cor do tema escuro sem quebrar layout. Mesmo corte de tabela que #1 — coluna Ações também fora da área capturada aqui. |
| 5 | `evidencia/t20-01b-gestor-claro-acoes-visiveis.jpg` | Gestor, tema claro | Mesma tela do #1, tabela rolada horizontalmente até o fim (o monitor desta máquina é 1440px de largura — mais estreito que os 1600–1800px pedidos originalmente — então a rolagem, não o redimensionamento de janela, foi o jeito de trazer a coluna à vista). A coluna **Ações** aparece nas 4 linhas, cada uma com um botão "Ações" que abre `DropdownMenu` (editar/excluir) — prova real de `IMOV-04 AC1`. |
| 6 | `evidencia/t20-02b-corretor-claro-sem-acoes.jpg` | Corretor, tema claro | Mesma tela do #2, mesma rolagem até o fim. A última coluna visível é **Publicação** — não há coluna Ações nenhuma depois dela, nem vazia: `properties-table.tsx` só executa `columns.push({ key: "actions", ... })` quando `canWrite` é verdadeiro (`src/components/properties/properties-table.tsx:176-203`), então para o corretor a célula nunca é montada, não é apenas ocultada. Esta é a prova real de `IMOV-04 AC2`. |

**Desfecho:** as seis capturas confirmam o comportamento esperado por IMOV-01/IMOV-04/IMOV-05 —
gestor com controle completo (incluindo o menu de linha, #5), corretor em leitura pura sem a coluna
de ações existir no DOM (#6), diálogo único de cadastro/edição, e paridade visual entre os dois
temas. Nenhuma foi obtida por inspeção de DOM; todas são renderização real do dev server via login
de sessão real.

**Correção (mesma T20, registrada depois do commit original):** as capturas #1/#2/#4 originais não
mostravam a coluna Ações — ela ficava fora do viewport capturado, cortada pela barra de scroll
horizontal visível no rodapé das duas primeiras imagens — mas o texto desta tabela, na sua versão
anterior, afirmava que a captura 1 mostrava "coluna Ações (editar/excluir)" visível. Isso não era
verdade: a evidência provava apenas a diferença do botão "Novo imóvel" entre os dois papéis, não a
diferença do menu de linha que `IMOV-04 AC1`/`AC2` exige. As capturas #5 e #6 acima, tiradas com a
tabela rolada até o fim (mesma sessão, mesmas contas de teste, mesmo tema), fecham essa lacuna: #5
mostra o menu de linha para o gestor, #6 confirma pelo código (não só pela imagem) que ele não
existe para o corretor.
