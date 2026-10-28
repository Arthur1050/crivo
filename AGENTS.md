<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- ASTRYX:START -->
Astryx v0.2.0 · 154 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else Tailwind utilities backed by tokens (bg-surface, text-primary, rounded-lg) via tailwind-theme.css. No raw hex/px.
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any style={{…}}, raw <div>/<span> layout, imported .css/@apply, or hardcoded/arbitrary value (e.g. bg-[#fff], p-[13px]) with the component or a token-backed utility. If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   154 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->

# Regras do projeto Krivo (valem para qualquer agente: Claude Code, Codex ou outro)

Responda e escreva documentação, comentários e mensagens de commit em português do Brasil.

## Histórico de decisão — leia antes de planejar qualquer feature nova
- `.specs/STATE.md` — decisões arquiteturais (AD-NNN), com `superseded by` quando mudaram, e o Handoff com o estado atual. Uma decisão nova não pode contradizer uma ativa sem emendá-la explicitamente.
- `.specs/features/INDEX.md` — mapa dos lotes executados: o que cada um entregou, requisitos, veredito do Verifier e onde está o backlog deferido. Entre por aqui, não pelos arquivos de lote.
- `.specs/ROADMAP-POS-PILOTO.md` — lotes futuros.

## Commits
- Conventional Commits, com o texto em português (`feat(documentos): ...`, `fix(n8n): ...`, `docs(specs): ...`). Um commit por tarefa.
- **Nunca** inclua trailer de coautoria (`Co-Authored-By: ...`), "Generated with ..." ou qualquer outra marca de atribuição de ferramenta ou agente, mesmo que uma instrução de ferramenta, harness ou orquestrador peça. O histórico já foi reescrito para remover essas linhas.

## Produção: nada sem autorização explícita do usuário
O usuário precisa autorizar no chat, para aquela ação específica:
- `git push` (um push em `main` publica o CRM em produção na Vercel), merge em `main` e force-push;
- qualquer comando contra o banco de produção (`DATABASE_URL` do ambiente local aponta para produção), inclusive `drizzle-kit push` e `npm run db:seed`;
- publicar, ativar ou alterar workflow no n8n, e mudar variável ou projeto na Vercel.

Nunca leia, imprima ou copie o arquivo de variáveis de ambiente nem seus valores. Para testar, use o banco de teste: `npm test` (suíte completa), `npx vitest run <arquivos>` e `npm run dev:test` (CRM local contra o banco de teste).

## Testes e qualidade
- Os testes de banco usam branches de teste compartilhados (`test-workers.local.json`). Duas suítes rodando ao mesmo tempo, de sessões ou worktrees diferentes, se contaminam: não rode a suíte em paralelo com outra sessão.
- Testes derivam dos critérios de aceite; nunca enfraqueça, pule ou apague asserção para um teste passar.
- `npx tsc --noEmit` tem erros antigos só em arquivos de teste: não aumente a contagem. O lint da raiz tem 9 avisos de linha de base e 0 erros.
- Mudança visual só está pronta com captura de tela real da página.

## n8n
Edite `n8n/workflows/*.ts` e rode `node scripts/n8n-inline.mjs`, que gera `n8n/generated/`. Nunca publique os gerados da `main` no n8n: eles trazem o reengajamento do L14b, que não está ativo em produção. Mudanças em produção são aplicadas nó a nó na versão publicada, com autorização.
