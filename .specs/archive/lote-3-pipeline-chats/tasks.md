# Lote 3 — Pipeline + Chats + Refinamentos · Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/lote-3-pipeline-chats/design.md`
**Status**: Approved (2026-08-02) — pronto para Execute via EXECUTE-PROMPT.md

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `AGENTS.md`/`CLAUDE.md` (docs do Next em `node_modules/next/dist/docs` antes de codar; regras Astryx), `vitest.config.ts`. Base existente: **95 testes Vitest** — rodar com `npx vitest run --no-file-parallelism` (flakiness conhecida do paralelismo contra Neon real, herdada do L2).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Schema (drizzle) | none | build gate + push sem erro | — | build gate |
| Seed (cores de categoria) | integration | Invariantes novos: toda categoria tem cor da paleta, ≥2 cores distintas por tenant; idempotência preservada | `src/db/__tests__/*.test.ts` | `npx vitest run --no-file-parallelism` |
| DAL leituras (summaries, ordenações) | integration | `getConversationSummaries`: shape completo, ordenação por última msg DESC, conversa sem msg por último, disjunção tenant A/B; ordenação determinística de `getLeads` (updatedAt DESC, id) e `getMessages` (sentAt ASC, id) | `src/server/data/__tests__/*.test.ts` | `npx vitest run --no-file-parallelism` |
| Validação (`validateCategoryColor`) | unit | Todos os branches: cada cor da paleta aceita; fora da paleta/vazio/casing errado rejeitados | `src/server/__tests__/*.test.ts` | `npx vitest run --no-file-parallelism` |
| DAL escritas (`updateLeadStatus`, categoria+cor) | integration | Happy path; cross-tenant = no-op/"não encontrado"; `updatedAt` avança no move; cor default gray; update de cor persiste | `src/server/data/__tests__/*.test.ts` | `npx vitest run --no-file-parallelism` |
| Server actions | integration | Por action: happy + entrada inválida rejeitada sem persistir + `{ error }`; 1:1 com ACs PIPE-02 e CAT-01 | `src/server/__tests__/*.test.ts` | `npx vitest run --no-file-parallelism` |
| UI (páginas, board, painel, chats, ícones) | none (nesta fase) | Sem harness e2e no projeto (decisão de matriz abaixo); regras de negócio cobertas em actions/DAL/validação; UI via build gate + smoke `build && start` do Verifier | — | build gate |

**Decisão de matriz (confirmar junto com as tasks):** não introduzir Playwright/e2e neste lote. O drag-and-drop é comportamento do componente `Board` da Astryx; toda regra de negócio do move (persistência, tenant-scope, no-op) vive na camada action/DAL, coberta por Vitest contra banco seedado. Browser-e2e permanece decisão explícita para lote futuro (candidato: quando dado real fluir, L7+).

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com testes unit | `npx vitest run --no-file-parallelism` |
| Full | Tasks com testes integration (banco seedado: `npm run db:seed` antes se necessário) | `npx vitest run --no-file-parallelism` |
| Build | Fim de fase / tasks só de schema/UI | `npm run lint && npx vitest run --no-file-parallelism && npm run build` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Dados e mutações (T1–T5)

Schema de cor, seed, leituras/escritas e actions — tudo que as telas consomem.

```
T1 → T2 → T3 → T4 → T5
```

### Phase 2: Ícones e refinamentos do Lote 2 (T6–T8)

Infra Lucide-Animated + retrofit de Documentos e Configurações.

```
T6 → T7 → T8
```

### Phase 3: Pipeline (T9–T11)

Board, drag e painel de detalhe.

```
T9 → T10 → T11
```

### Phase 4: Chats e fechamento (T12–T13)

```
T12 → T13
```

---

## Task Breakdown

### T1: Schema — enum e coluna de cor de categoria

**What**: `pgEnum category_color` (10 cores 1:1 com `Token color` da Astryx) + coluna `document_categories.color` NOT NULL DEFAULT `'gray'` + `drizzle-kit push` aplicado (migração não-destrutiva: categorias existentes viram gray).
**Where**: `src/db/schema.ts`
**Depends on**: None
**Reuses**: padrão de enums/tabelas existente
**Requirement**: CAT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `npx drizzle-kit push` aplica sem erro; categorias pré-existentes têm `color = 'gray'`
- [x] Tipo exportado (`DocumentCategory` com `color`)
- [x] Gate: `npm run lint && npx vitest run --no-file-parallelism && npm run build` (95 testes seguem passando)

**Tests**: none (build gate)
**Gate**: build

**Commit**: `feat(db): add category color enum with gray default`

**Status**: ✅ Done — commit `6d0d4a6`

---

### T2: Seed — cores nas categorias + testes de invariantes

**What**: Seed idempotente atribui cores determinísticas às categorias (≥2 cores distintas por tenant, pelo menos uma gray); testes cobrem os invariantes novos.
**Where**: `src/db/seed.ts`, `src/db/__tests__/seed.test.ts`
**Depends on**: T1
**Reuses**: padrão delete-and-insert com UUIDs determinísticos
**Requirement**: CAT-01 (fixture)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `npm run db:seed` roda 2x sem erro (idempotência preservada)
- [x] Testes novos: toda categoria tem cor da paleta; ≥2 cores distintas por tenant
- [x] Gate full passa; contagem: 95 + novos, nenhum removido

**Tests**: integration
**Gate**: full

**Commit**: `feat(db): seed category colors deterministically`

**Status**: ✅ Done — commit `7ad27dc` (+3 tests)

---

### T3: DAL leituras — conversation summaries + ordenações determinísticas

**What**: `getConversationSummaries(tenantId)` (join lead + última mensagem, ordenado por última msg DESC com conversas sem msg por último, desempate por `createdAt DESC, id`); ORDER BY determinístico em `getLeads` (`updatedAt DESC, id`) e `getMessages` (`sentAt ASC, id`) + testes.
**Where**: `src/server/data/index.ts`, `src/server/data/__tests__/`
**Depends on**: T2
**Reuses**: padrão DAL tenant-scoped; lesson L2 (ordenação determinística — mesmo gap do `getTenants`)
**Requirement**: CHAT-01, PIPE-01 (ordenação)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Summary: shape completo (leadName, lastMessage), ordenação comprovada, conversa sem mensagem incluída por último com `lastMessage: null`
- [x] Disjunção tenant A/B para `getConversationSummaries`
- [x] Ordenações de `getLeads`/`getMessages` testadas contra o seed
- [x] Gate full passa; nenhum teste removido

**Tests**: integration
**Gate**: full

**Commit**: `feat(data): conversation summaries and deterministic lead/message ordering`

**Status**: ✅ Done — commit `977accd` (+7 tests)

---

### T4: DAL escritas — updateLeadStatus + cor de categoria

**What**: `updateLeadStatus(tenantId, leadId, status)` (`WHERE tenant_id AND id`, seta `updatedAt`, 0 rows → "não encontrado"); `createDocumentCategory` ganha `color` opcional (default gray); nova `updateDocumentCategory(tenantId, id, { color })` tenant-scoped + testes.
**Where**: `src/server/data/index.ts`, `src/server/data/__tests__/`
**Depends on**: T2
**Reuses**: padrão de escrita tenant-scoped do L2 (no-op cross-tenant)
**Requirement**: PIPE-02, CAT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Move happy path persiste status + `updatedAt` avança (comparação antes/depois)
- [x] Cross-tenant e leadId inexistente = no-op + "não encontrado"
- [x] Categoria criada sem cor → gray; com cor → persiste; update de cor persiste; update cross-tenant = no-op
- [x] Gate full passa; nenhum teste removido

**Tests**: integration
**Gate**: full

**Commit**: `feat(data): tenant-scoped lead status transition and category color writes`

**Status**: ✅ Done — commit `a0794c9` (+8 tests)

---

### T5: Validação de cor + server actions

**What**: `validateCategoryColor` em `src/server/validation.ts` (paleta fixa, unit-tested); `updateLeadStatusAction` (status validado contra o enum, tenant do cookie, revalidate `/pipeline`); `createDocumentCategoryAction` aceita cor; nova `updateDocumentCategoryAction` (cor) — todas `{ ok } | { error }` + testes.
**Where**: `src/server/validation.ts`, `src/server/actions/`, `src/server/__tests__/`
**Depends on**: T4
**Reuses**: `getActiveTenantId`, padrão de actions do L2 (nunca aceitar `tenantId` do client)
**Requirement**: PIPE-02, CAT-01

**Tools**: MCP: NONE · Skill: NONE (docs locais do Next para revalidate no Next 16)

**Done when**:

- [x] Unit: cada cor da paleta aceita; fora da paleta/vazio/casing rejeitados
- [x] Por action: happy persiste; inválido retorna `{ error }` e nada persiste (conferido por query); status fora do enum rejeitado
- [x] Nenhuma action aceita `tenantId` no payload
- [x] Gate full passa; nenhum teste removido

**Tests**: unit + integration
**Gate**: full

**Commit**: `feat(server): lead status action and category color validation/actions`

**Status**: ✅ Done — commit `1da319e` (+29 tests)

---

### T6: Infra de ícones Lucide-Animated + sidebar

**What**: `components.json` mínimo manual + dep `motion`; ícones necessários instalados via `npx shadcn@latest add "https://lucide-animated.com/r/<nome>.json"` (fallback: vendor manual do fonte) em `src/components/icons/`; cada ícone com `"use client"` garantido; sidebar com ícone nas 5 rotas.
**Where**: `components.json`, `package.json`, `src/components/icons/`, `src/components/shell/sidebar.tsx`
**Depends on**: None (fase anterior completa)
**Reuses**: mapa indicativo do design (kanban/message-circle/file-text/settings/chart-line + upload/plus/pencil/trash-2/x/search/tag); `SideNav` já aceita ícones (catálogo Astryx)
**Requirement**: ICON-01

**Tools**: MCP: NONE · Skill: NONE (CLI: shadcn, `npx astryx component SideNav`)

**Done when**:

- [x] Todos os ícones do mapa disponíveis como componentes locais com `"use client"`; nenhuma outra lib de ícones adicionada
- [x] Sidebar exibe ícone coerente nas 5 rotas; hover anima
- [x] CLI do shadcn não alterou nenhuma config existente do projeto (git diff limpo fora do escopo da task)
- [x] Self-check Astryx + gate build

**Tests**: none (build gate)
**Gate**: build

**Commit**: `feat(ui): lucide-animated icon infrastructure and sidebar icons`

**Status**: ✅ Done — commit `4a5496b`. Nota: `components.json` `aliases.ui` repontado para `@/src/components/icons` após 1º ícone (default do shadcn apontava para `src/components/ui`); helper local `cn()` adicionado em `src/lib/utils.ts` (dependência dos ícones vendorizados, sem clsx/tailwind-merge); 13º ícone (`check`) instalado em T8 para o botão "Salvar" (mapa do design.md era indicativo, não exaustivo — discretion do context.md). Substituições por ausência no registry: kanban→folder-kanban, pencil→square-pen, trash-2→delete, tag→bookmark.

---

### T7: Documentos — cores de categoria nas superfícies + respiro do Ações + ícones

**What**: Picker de paleta (grid de swatches token-backed) nos dialogs de categoria (criar + editar cor no manager); `<Token color>` na tabela, manager, selects de upload/edição e filtro; respiro entre o botão "Ações" e a borda direita (UI-01); ícones Lucide-Animated nas ações da tela.
**Where**: `src/components/documents/*`
**Depends on**: T5, T6
**Reuses**: dialogs/toolbar/tabela do L2; `updateDocumentCategoryAction`; `Token` (Astryx)
**Requirement**: CAT-02, UI-01, ICON-02

**Tools**: MCP: NONE · Skill: NONE (CLI: `npx astryx component Token`)

**Done when**:

- [x] Criar categoria com cor e editar cor refletem em TODAS as superfícies (tabela, manager, selects, filtro)
- [x] Categoria pré-existente aparece gray
- [x] Botão Ações com respiro visível da borda (token-backed, sem px cru)
- [x] Ações da tela (upload, categorias, editar/excluir) com ícones Lucide-Animated
- [x] Self-check Astryx + gate build

**Tests**: none (regras em T4/T5)
**Gate**: build

**Commit**: `feat(docs): category colors across surfaces, action spacing and icons`

**Status**: ✅ Done — commit `4f1fb77`. Nota (SPEC_DEVIATION menor): a coluna Ações estava clipando o botão (overflow:hidden cortando ~27px do conteúdo real, não só falta de respiro) — corrigido alargando a coluna de `pixel(72)` para `pixel(140)` (mesma API `pixel()` já usada nas outras colunas do arquivo), verificado por medição DOM no browser (gap final ~41px).

---

### T8: Configurações — Cards por seção + layout lado a lado + ícones

**What**: Cada seção (Imobiliária, Documentos) num `Card`; grid responsivo 2 colunas em viewport larga (campos/seções lado a lado, sem esticar), empilhando em viewport estreita; ícones nas ações (salvar, ver todos).
**Where**: `app/(crm)/configuracoes/page.tsx`, `src/components/settings/*`
**Depends on**: T6
**Reuses**: `Card`, `Grid`/layout Astryx (conferir `npx astryx docs layout`); form existente do L2
**Requirement**: UI-02, ICON-02

**Tools**: MCP: NONE · Skill: NONE (CLI: `npx astryx component Card`, `docs layout`)

**Done when**:

- [x] Duas seções em Cards; viewport larga sem campos esticados na largura total; estreita empilha sem quebra
- [x] Comportamento funcional do form intacto (salvar, erros por campo, amostra de documentos)
- [x] Ícones Lucide-Animated nas ações
- [x] Self-check Astryx + gate build

**Tests**: none (regras já cobertas no L2)
**Gate**: build

**Commit**: `refactor(config): card-based two-column settings layout with icons`

**Status**: ✅ Done — commit `fba7ae6`

---

### T9: Pipeline — board read-only

**What**: `/pipeline` real — RSC carrega `getLeads`; `PipelineBoard` client agrupa por status em 3 colunas ("Em qualificação", "Qualificado e agendado", "Escalado para humano") com contagem, cards (nome + modalidade quando houver + tempo desde primeiro contato), ordenação `updatedAt` DESC, estados vazios, status desconhecido ignorado.
**Where**: `app/(crm)/pipeline/page.tsx`, `src/components/pipeline/pipeline-board.tsx`
**Depends on**: T3 (fases anteriores completas)
**Reuses**: template `kanban-board` (`npx astryx template kanban-board`), componentes `Board*`; padrão RSC→client do L2
**Requirement**: PIPE-01

**Tools**: MCP: NONE · Skill: NONE (CLI Astryx: `template kanban-board`, `component Board`)

**Done when**:

- [x] 3 colunas com contagens e cards corretos do tenant ativo (seed); ordenação DESC visível
- [x] Tenant sem leads → colunas vazias com estado vazio
- [x] Troca de tenant re-renderiza só com dados do novo tenant
- [x] Self-check Astryx + gate build

**Tests**: none (dados/ordenação em T3)
**Gate**: build

**Commit**: `feat(pipeline): kanban board with status columns and lead cards`

**Status**: ✅ Done — commit `8d26b21`. Nota: sem componente `Board` na Astryx (confirmado via `astryx component Board` → not found; só o template `kanban-board`, hand-rolled) — board construído com `Grid`/`Card`/`Badge`/`Timestamp` (Badge usado só para a contagem por coluna).

---

### T10: Pipeline — drag-and-drop persistente

**What**: Drag entre colunas chama `updateLeadStatusAction`; override otimista durante o voo; sucesso → `router.refresh()`; falha → revert + mensagem de erro; soltar na mesma coluna = no-op.
**Where**: `src/components/pipeline/pipeline-board.tsx`
**Depends on**: T9 (e T5 pelas actions)
**Reuses**: API de drag do `Board` Astryx (`DragState`/`ColumnId` do template); action de T5
**Requirement**: PIPE-02

**Tools**: MCP: NONE · Skill: NONE (CLI Astryx: `component Board`; docs Next para `router.refresh`)

**Done when**:

- [x] Drag persiste e sobrevive a reload; contagens das colunas atualizam
- [x] Falha simulada de action → card volta + erro visível
- [x] Mesmo destino = nenhuma action disparada
- [x] Self-check Astryx + gate build

**Tests**: none (regras do move em T4/T5)
**Gate**: build

**Commit**: `feat(pipeline): drag-and-drop status transitions with optimistic revert`

**Status**: ✅ Done — commit `1875384`. Drag implementado com a API nativa HTML5 (`draggable`/`onDragStart`/`onDragOver`/`onDrop`) diretamente nos props de `Card`/`VStack` (ambos estendem `BaseProps`, que mantém `draggable` e os handlers de drag no spread) — sem `style={{}}` nem lib externa.

---

### T11: Pipeline — painel de detalhe do lead

**What**: Clique no card abre painel lateral (`Layout`/`LayoutPanel`; fallback `Dialog` se inviável) com resumo executivo (fallback "Resumo ainda não disponível"), seção de escalonamento apenas quando escalado ("Motivo não informado" se nulo), campos de qualificação formatados (nulos → "—"), moeda via `formatCurrencyBRL` nova em `src/lib/format.ts` (nunca "R$ NaN"); fechar preserva o quadro.
**Where**: `src/components/pipeline/lead-detail-panel.tsx`, `src/lib/format.ts`
**Depends on**: T10
**Reuses**: `Timestamp`, `Token`, `formatFileSize` como referência de estilo em `format.ts`
**Requirement**: PIPE-03

**Tools**: MCP: NONE · Skill: NONE (CLI Astryx: `component Layout`, `search panel`)

**Done when**:

- [x] Lead escalado: resumo + motivo; lead em qualificação: sem seção de escalonamento
- [x] Todos os campos nulos exibem "—"; `budgetCents` nulo nunca vira "R$ NaN"
- [x] Fechar painel preserva estado do quadro
- [x] Self-check Astryx + gate build

**Tests**: none (formatCurrencyBRL coberta por unit se houver branch não-trivial — a critério do worker com aprovação da matriz: função pura nova ⇒ adicionar unit test em `src/lib/__tests__/`)
**Gate**: build

**Commit**: `feat(pipeline): lead detail side panel with summary and escalation`

**Status**: ✅ Done — commit `8c9bb32` (+4 testes de `formatCurrencyBRL`, incluindo o branch não-trivial nulo→null). Painel via `Layout`/`LayoutPanel` in-page (Plano A do design.md — Astryx confirma não ter Drawer, mas `LayoutPanel` cobriu bem, fallback `Dialog` não foi necessário). Estado guarda `selectedLeadId` (não o objeto `Lead`) para o painel refletir sempre os dados mais recentes de `leads` após um `router.refresh()`.

---

### T12: Chats — lista + thread somente leitura + link cruzado

**What**: `/chats` real — RSC lê `?conversa=`; lista de conversas (`getConversationSummaries`: nome do lead, prévia, timestamp) com seleção por `NavLink`; thread (`getMessages` ASC) com bolhas distintas agente/lead e timestamps; estados: nenhuma selecionada, tenant sem conversas, conversa sem mensagens, conversa inválida/cross-tenant → neutro; SEM composer. Link "Ver conversa" no painel do lead (T11) quando houver conversa (PIPE-04).
**Where**: `app/(crm)/chats/page.tsx`, `src/components/chats/*`, `src/components/pipeline/lead-detail-panel.tsx` (link)
**Depends on**: T11
**Reuses**: template `ai-chat` (`ChatLayout`, `ChatMessage*`), `NavLink`, `getConversationSummaries` (T3)
**Requirement**: CHAT-01, PIPE-04

**Tools**: MCP: NONE · Skill: NONE (CLI Astryx: `template ai-chat`, `component ChatMessage`)

**Done when**:

- [x] Lista ordenada pela última mensagem DESC com prévia; seleção via URL funciona
- [x] Bolhas agente vs lead visualmente distintas; ordem ASC; sem campo de envio
- [x] 4 estados vazios/neutros correta e distintamente exibidos
- [x] Painel do lead mostra "Ver conversa" só quando há conversa; navega com `?conversa=` correto
- [x] Troca de tenant: lista/thread só do novo tenant
- [x] Self-check Astryx + gate build

**Tests**: none (dados em T3)
**Gate**: build

**Commit**: `feat(chats): read-only conversation list and thread with lead cross-link`

**Status**: ✅ Done — commit `8bad4ce`. Link cruzado (PIPE-04) exigiu tocar `app/(crm)/pipeline/page.tsx` e `pipeline-board.tsx` além do listado (busca `getConversations` já existente e monta `leadId → conversationId` como objeto simples, passado até `LeadDetailPanel`) — extensão mínima implícita na própria AC de T12, não uma mudança fora de escopo.

---

### T13: Fechamento do lote — gate final + traceability

**What**: Passada final: revisão self-check Astryx nas 4 telas tocadas, verificação de que nenhum ícone vem de fora de `src/components/icons/`, gate build completo, smoke `build && start` (200 em `/pipeline`, `/chats`, `/documentos`, `/configuracoes`), traceability no spec.md → Implementing.
**Where**: spec.md (traceability), ajustes residuais
**Depends on**: T8, T12
**Reuses**: —
**Requirement**: todos (fechamento)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `npm run lint && npx vitest run --no-file-parallelism && npm run build` limpo; contagem final ≥ 95 + novos de T2–T5, nenhum removido
- [x] `next start`: as 4 rotas respondem 200 com conteúdo real
- [x] `grep` de imports de ícones fora de `src/components/icons/` vazio
- [x] Traceability atualizada no spec.md

**Tests**: none
**Gate**: build

**Commit**: `chore(lote3): final gate, smoke and traceability update`

**Status**: ✅ Done — commit (deste commit). Gate final limpo: lint sem erros, 146 testes Vitest passando (baseline 142 + 4 novos de `formatCurrencyBRL` em T11), build limpo. Smoke `next start` (porta alternativa 3011, build isolado) → 200 com conteúdo real nas 4 rotas (`/pipeline`, `/chats`, `/documentos`, `/configuracoes`). `grep` por ícones fora de `src/components/icons/` vazio (única exceção: `@astryxdesign/core/Icon`/`IconButton`, parte do próprio design system, não uma lib de ícones concorrente). Traceability em spec.md → todos os 11 IDs para "Implementing".

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5
Phase 2:  T6 ──→ T7 ──→ T8
Phase 3:  T9 ──→ T10 ──→ T11
Phase 4:  T12 ──→ T13
```

13 tasks → 2 batches (corte em fronteira de fase): **Batch 1 = Phases 1–2 (T1–T8, 8 tasks)**; **Batch 2 = Phases 3–4 (T9–T13, 5 tasks)**. No Execute, o orquestrador DEVE apresentar a oferta de sub-agentes (offer-then-confirm) antes de iniciar. Verifier independente roda automaticamente após T13, sempre.

Notas de ordem interna: T4 depende de T2 (não de T3) — ordem T3→T4 mantida por simplicidade sequencial; T6 não depende de Phase 1, mas Phase 2 roda após por sequência de fases; T10 usa actions de T5 (fase anterior, satisfeita).

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: schema cor | 1 arquivo | ✅ Granular |
| T2: seed + testes | 1 script + testes co-locados | ✅ Granular |
| T3: DAL leituras | 1 função nova + 2 ordenações na mesma camada + testes | ✅ OK (coeso) |
| T4: DAL escritas | 3 funções coesas na mesma camada + testes | ✅ OK (coeso) |
| T5: validação + actions | 1 validador + 3 actions + testes | ✅ OK (coeso — mesma costura do L2 T6) |
| T6: infra ícones + sidebar | config + ícones vendorizados + 1 componente | ⚠️ OK (coeso — uma capability) |
| T7: retrofit Documentos | componentes irmãos da mesma tela | ⚠️ OK (coesos — uma tela) |
| T8: retrofit Configurações | 1 página + form | ✅ OK (coeso — uma tela) |
| T9: board read-only | 1 página + 1 componente | ✅ OK (coeso) |
| T10: drag | 1 componente (modificação) | ✅ Granular |
| T11: painel detalhe | 1 componente + 1 util | ✅ OK (coeso) |
| T12: chats + link | 1 tela + link no painel | ⚠️ OK (coeso — consumidor do formato de URL) |
| T13: fechamento | gate + docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | T2 | T3→T4 (ordem; dependência real T2 anterior — nota no mapa) | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | None (fase anterior completa) | início Phase 2 | ✅ Match |
| T7 | T5, T6 | T6→T7 (T5 em fase anterior) | ✅ Match |
| T8 | T6 | T7→T8 (ordem; dependência real T6 anterior) | ✅ Match |
| T9 | T3 | início Phase 3 (Phases 1–2 completas) | ✅ Match |
| T10 | T9, T5 | T9→T10 (T5 em fase anterior) | ✅ Match |
| T11 | T10 | T10→T11 | ✅ Match |
| T12 | T11 | início Phase 4 (T11 última da Phase 3) | ✅ Match |
| T13 | T8, T12 | T12→T13 (T8 em fase anterior) | ✅ Match |

Nenhuma dependência aponta para fase posterior.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Schema | none (build gate) | none/build | ✅ OK |
| T2 | Seed | integration | integration | ✅ OK |
| T3 | DAL leituras | integration | integration | ✅ OK |
| T4 | DAL escritas | integration | integration | ✅ OK |
| T5 | Validação + actions | unit + integration | unit + integration | ✅ OK |
| T6 | UI/config | none | none/build | ✅ OK |
| T7 | UI | none | none/build | ✅ OK |
| T8 | UI | none | none/build | ✅ OK |
| T9 | UI | none | none/build | ✅ OK |
| T10 | UI | none | none/build | ✅ OK |
| T11 | UI + util pura (`formatCurrencyBRL`) | none (UI); util pura nova → unit leve | none + unit da util | ✅ OK |
| T12 | UI | none | none/build | ✅ OK |
| T13 | — | — | none/build | ✅ OK |

`Tests: none` nas tasks de UI é válido pela matriz (camada UI = none nesta fase, decisão registrada acima); toda regra de negócio tem teste na camada actions/DAL/validação.
