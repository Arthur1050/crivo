# Lote 2 — Configurações + Documentos · Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/lote-2-configuracoes-documentos/design.md`
**Status**: Done — all 11 tasks (T1–T11) committed across 2 batch workers; Verifier PASS after 1 fix→re-verify iteration (2 gaps found and fixed: tenant-ordering determinism, upload category-race). See `validation.md`.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `AGENTS.md`/`CLAUDE.md` (ler docs do Next em `node_modules/next/dist/docs` antes de codar; regras Astryx). Base existente: 27 testes Vitest (seed, DAL/isolamento, tenant) em `src/**/__tests__/*.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Schema (drizzle) | none | build gate + push sem erro | — | build gate |
| Seed (incremento categorias) | integration | Invariantes novos: 2–3 categorias/tenant, nome repetido entre tenants presente, docs com e sem categoria; idempotência preservada | `src/db/__tests__/*.test.ts` | `npx vitest run` |
| DAL leituras (filtros, sample, categorias) | integration | Cada filtro (modalidade, categoria, busca case-insensitive) e combinações; ordenação DESC; disjunção tenant A/B; sample = 5 recentes + contagens | `src/server/data/__tests__/*.test.ts` | `npx vitest run` |
| Validação (`src/server/validation.ts`) | unit | Todos os branches: trim/vazio/120/121 chars; cada MIME aceito + 1 rejeitado; 10 MB exato + acima; modalidade ausente | `src/server/__tests__/*.test.ts` | `npx vitest run` |
| DAL escritas | integration | Happy path de cada função; escrita filtra por tenant (update/delete de doc de outro tenant = no-op); categoria duplicada → erro de domínio; duplicada em outro tenant → OK; delete categoria → docs SET NULL; update de doc inexistente → "não encontrado" | `src/server/data/__tests__/*.test.ts` | `npx vitest run` |
| Server actions | integration | Por action: happy + entrada inválida rejeitada sem persistir + erro retornado como `{ error }` (1:1 com ACs CONF-01/02, DOC-02/03/04/05/06) | `src/server/__tests__/*.test.ts` | `npx vitest run` |
| UI (páginas RSC, forms, dialogs) | none (nesta fase) | Sem harness de e2e/browser no projeto (decisão abaixo); comportamento de regra coberto na camada de actions/DAL; UI verificada por build gate + smoke `build && start` do Verifier (padrão Fase 1) | — | build gate |

**Decisão de matriz (confirmar junto com as tasks):** não introduzir Playwright/e2e neste lote — as regras de negócio das ACs são todas exercitadas na camada actions/DAL/validação (testável por Vitest contra banco seedado, como na Fase 1); o Verifier cobre a UI via smoke test HTTP. Introduzir browser-e2e fica como decisão explícita para um lote futuro (candidato natural: Lote 3, Kanban interativo).

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com testes unit | `npx vitest run` |
| Full | Tasks com testes integration (banco seedado: `npm run db:seed` antes se necessário) | `npx vitest run` |
| Build | Fim de fase / tasks só de schema/UI | `npm run lint && npx vitest run && npm run build` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Dados e mutações (T1–T6)

Schema, seed, leituras, validação, escritas e actions — tudo que as telas consomem.

```
T1 → T2 → T3 → T4 → T5 → T6
```

### Phase 2: Telas (T7–T11)

As duas páginas sobre a camada pronta, e o fechamento do lote.

```
T7 → T8 → T9 → T10 → T11
```

---

## Task Breakdown

### T1: Incremento de schema — categorias + vínculo

**What**: Tabela `document_categories` (unique index case-insensitive por tenant em `lower(name)`) + coluna `documents.category_id` (FK `ON DELETE SET NULL`) + `drizzle-kit push` aplicado.
**Where**: `src/db/schema.ts`
**Depends on**: None
**Reuses**: enum `modality`, padrão de tabelas/FKs da Fase 1
**Requirement**: DOC-06 (modelo)

**Tools**:

- MCP: NONE
- Skill: NONE (docs do drizzle-kit instalado se a sintaxe do unique index em expressão gerar dúvida)

**Done when**:

- [ ] `npx drizzle-kit push` aplica sem erro; tabela e coluna existem no banco
- [ ] Tipos exportados (`DocumentCategory`, `Document` com `categoryId`)
- [ ] Gate: `npm run lint && npx vitest run && npm run build` (27 testes existentes seguem passando)

**Tests**: none (build gate)
**Gate**: build

**Commit**: `feat(db): add document categories schema with tenant-scoped unique names`
**Status**: ✅ Done — `397c739`

---

### T2: Incremento do seed + testes de invariantes

**What**: Seed idempotente ganha 2–3 categorias por tenant (com um nome repetido entre tenants), parte dos documentos categorizada e parte sem categoria; testes de seed cobrem os invariantes novos.
**Where**: `src/db/seed.ts`, `src/db/__tests__/seed.test.ts`
**Depends on**: T1
**Reuses**: padrão delete-and-insert com UUIDs determinísticos
**Requirement**: DOC-06.4 (fixture), DOC-01 (fixture de filtros)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `npm run db:seed` roda 2x sem erro (idempotência preservada)
- [ ] Testes novos: categorias por tenant, nome repetido entre tenants, docs com/sem categoria
- [ ] Gate quick passa; contagem: 27 + ≥3 novos, nenhum removido

**Tests**: integration
**Gate**: full

**Commit**: `feat(db): seed document categories and assignments`
**Status**: ✅ Done — `cff8288`

---

### T3: DAL — leituras (filtros, categorias, amostra)

**What**: `getDocuments(tenantId, { modality?, categoryId?, search? })` (filtros em SQL, `ILIKE`, ordenação `uploadedAt DESC`), `getDocumentCategories(tenantId)`, `getDocumentSample(tenantId)` (5 recentes + contagem por modalidade) + testes de integração.
**Where**: `src/server/data/index.ts`, `src/server/data/__tests__/`
**Depends on**: T2
**Reuses**: padrão DAL da Fase 1 (`server-only`, tenant_id obrigatório)
**Requirement**: DOC-01, CONF-04, DOC-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Cada filtro isolado + combinação testados contra o seed; busca case-insensitive comprovada
- [ ] Disjunção tenant A/B para as 3 funções (extensão do isolation.test)
- [ ] Sample: exatamente 5 mais recentes + contagens corretas
- [ ] Gate full passa; nenhum teste removido

**Tests**: integration
**Gate**: full

**Commit**: `feat(data): document queries with modality/category/search filters`
**Status**: ✅ Done — `28291f6`

---

### T4: Módulo de validação + testes unitários

**What**: `src/server/validation.ts` — funções puras: nome (trim, não-vazio, ≤120), MIME aceito (PDF/DOCX/TXT/MD/CSV), tamanho ≤10 MB, modalidade obrigatória; retorno `{ ok } | { error }`.
**Where**: `src/server/validation.ts`, `src/server/__tests__/validation.test.ts`
**Depends on**: None (puro; ordenado aqui por coesão de fase)
**Reuses**: enum `modality` (tipos)
**Requirement**: CONF-02, DOC-03, DOC-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Todos os branches testados: vazio pós-trim, 120 ok / 121 falha, cada MIME aceito + rejeitado, 10 MB exato ok / acima falha, modalidade ausente
- [ ] Gate quick passa; nenhum teste removido

**Tests**: unit
**Gate**: quick

**Commit**: `feat(server): shared validation rules for settings and documents`
**Status**: ✅ Done — `38150cb`

---

### T5: DAL — escritas + testes de isolamento em escrita

**What**: `updateTenantSettings`, `createDocument`, `updateDocument` (com "não encontrado"), `deleteDocument`, `createDocumentCategory` (traduz violação de unique em erro de domínio), `deleteDocumentCategory` — todas com `tenant_id` no `WHERE`.
**Where**: `src/server/data/index.ts` (ou `mutations.ts` na pasta), `src/server/data/__tests__/`
**Depends on**: T2
**Reuses**: cliente db, padrão DAL
**Requirement**: CONF-01, DOC-02, DOC-04, DOC-05, DOC-06, DOC-07

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Happy path de cada função testado (registros criados no próprio teste)
- [ ] Update/delete com tenant errado = no-op comprovado (DOC-07 em escrita)
- [ ] Categoria duplicada mesmo tenant → erro; mesmo nome outro tenant → OK; delete categoria → doc vira `categoryId: null`
- [ ] Update de documento inexistente retorna "não encontrado" (edge case de abas concorrentes)
- [ ] Gate full passa; nenhum teste removido

**Tests**: integration
**Gate**: full

**Commit**: `feat(data): tenant-scoped write layer for settings, documents and categories`
**Status**: ✅ Done — `4b6d5da` (+ fix `ba650f4` post-Verifier: deterministic `getTenants()` ordering)

---

### T6: Server actions + testes

**What**: `src/server/actions/settings.ts` (`updateTenantSettingsAction`) e `src/server/actions/documents.ts` (create/update/delete de documento, create/delete de categoria) — tenant sempre do cookie (`getActiveTenantId`), validação de T4 como autoridade, `revalidatePath`, retorno `{ ok } | { error }`.
**Where**: `src/server/actions/`, `src/server/__tests__/actions.test.ts`
**Depends on**: T4, T5
**Reuses**: `getActiveTenantId` (Fase 1), validação T4, escritas T5
**Requirement**: CONF-01, CONF-02, DOC-02, DOC-03, DOC-04, DOC-05, DOC-06

**Tools**: MCP: NONE · Skill: NONE (docs locais do Next para `revalidatePath` no Next 16)

**Done when**:

- [ ] Por action: happy persiste; entrada inválida retorna `{ error }` e nada persiste (conferido por query)
- [ ] Tenant vem do cookie — nenhuma action aceita `tenantId` no payload (checável por assinatura)
- [ ] Gate full passa; nenhum teste removido

**Tests**: integration
**Gate**: full

**Commit**: `feat(server): server actions for settings and document management`
**Status**: ✅ Done — `a87b7eb`

---

### T7: Tela Configurações

**What**: `/configuracoes` real — RSC carrega `getTenant` + `getDocumentSample`; form client (nome, nome do agente, select de modalidade) com erros por campo, sucesso visível e reflexo do nome no shell via revalidate; seção "Documentos" com 5 recentes, contagens por modalidade, link "Ver todos" e estado vazio.
**Where**: `app/(crm)/configuracoes/page.tsx`, `src/components/settings/`
**Depends on**: T3, T6
**Reuses**: shell/header da Fase 1; template Astryx `settings` como referência (`npx astryx template settings`); validação T4 como cortesia client
**Requirement**: CONF-01, CONF-02, CONF-03, CONF-04

**Tools**: MCP: NONE · Skill: NONE (CLI Astryx: `template settings`, `component <Name>` dos usados)

**Done when**:

- [ ] Editar+salvar persiste e mostra confirmação; reload mantém valores; nome novo aparece no header
- [ ] Nome vazio/121 chars: erro no campo, nada persiste
- [ ] Amostra correta com seed; estado vazio ao zerar documentos; link navega para `/documentos`
- [ ] Troca de tenant atualiza os valores exibidos
- [ ] Self-check Astryx (sem div/style cru, tokens) + gate build

**Tests**: none (regras cobertas em T4/T6; UI via smoke do Verifier)
**Gate**: build

**Commit**: `feat(config): settings screen with agency, agent and modality editing`
**Status**: ✅ Done — `bd560a4`

---

### T8: Tela Documentos — listagem, filtros, busca, estados vazios

**What**: `/documentos` real — RSC lê `searchParams` (`modalidade`, `categoria`, `q`) e chama `getDocuments`/`getDocumentCategories`; tabela edge-to-edge (nome, modalidade, categoria/"Sem categoria", tamanho, data); toolbar client grava filtros/busca na URL (`router.replace`, debounce ~300ms); dois estados vazios distintos (sem documentos × sem resultados).
**Where**: `app/(crm)/documentos/page.tsx`, `src/components/documents/toolbar.tsx` (+ tabela)
**Depends on**: T3
**Reuses**: blocos Astryx `Table — Inline/Popover Filters` ou `PowerSearch — Search with Table` (avaliar no Execute); padrão RSC+searchParams
**Requirement**: DOC-01, DOC-07

**Tools**: MCP: NONE · Skill: NONE (CLI Astryx: `template file-explorer`, `TableInlineFilterTable`, `PowerSearchSearchWithTable`)

**Done when**:

- [ ] Listagem completa do tenant ativo, DESC por data
- [ ] Cada filtro e busca refletem na URL e no resultado; combinações funcionam
- [ ] Estados vazios distintos exibidos nas duas situações
- [ ] Troca de tenant re-renderiza só com dados do novo tenant
- [ ] Self-check Astryx + gate build

**Tests**: none (filtros cobertos em T3; UI via smoke do Verifier)
**Gate**: build

**Commit**: `feat(docs): documents list with modality/category filters and search`
**Status**: ✅ Done — `975aa0b`

---

### T9: Documentos — upload metadata-only

**What**: Dialog de upload com `FileInput` Astryx — extrai `name/type/size` do arquivo no client, seleção obrigatória de modalidade e opcional de categoria (com criação inline de categoria), submit envia **só metadados** à action; validação de cortesia no client, erros da action exibidos.
**Where**: `src/components/documents/upload-dialog.tsx` (+ integração na página)
**Depends on**: T6, T8
**Reuses**: `FileInput`, bloco `Dialog — Form` (Astryx); `createDocumentAction`, `createCategoryAction`; validação T4
**Requirement**: DOC-02, DOC-03, DOC-06.1

**Tools**: MCP: NONE · Skill: NONE (CLI Astryx: `component FileInput`, `template DialogFormDialog`)

**Done when**:

- [ ] Upload de TXT pequeno aparece na listagem com metadados corretos; binário não trafega (payload da action só tem metadados)
- [ ] Tipo inválido e >10 MB rejeitados com motivo; sem modalidade rejeitado
- [ ] Categoria criada inline fica disponível e atribuída
- [ ] Self-check Astryx + gate build

**Tests**: none (regras em T4/T6)
**Gate**: build

**Commit**: `feat(docs): metadata-only upload dialog with inline category creation`
**Status**: ✅ Done — `9b37d65` (+ fix `2e00165` post-Verifier: disable submit during category-creation race)

---

### T10: Documentos — editar, excluir e gerenciar categorias

**What**: Ações por linha — editar (Dialog form: nome/modalidade/categoria) e excluir (confirmação antes da action); gestão de categorias (excluir categoria com aviso de que documentos ficam "Sem categoria"); erros de duplicidade e "documento não existe mais" exibidos.
**Where**: `src/components/documents/` (row-actions, edit-dialog, category-manager)
**Depends on**: T9
**Reuses**: dialogs Astryx; `updateDocumentAction`, `deleteDocumentAction`, `deleteCategoryAction`
**Requirement**: DOC-04, DOC-05, DOC-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] Excluir pede confirmação; confirmado some da listagem e da amostra em Configurações; cancelado mantém
- [ ] Renomear/reclassificar persiste; nome vazio/121 rejeitado no campo
- [ ] Excluir categoria: documentos viram "Sem categoria" na hora
- [ ] Self-check Astryx + gate build

**Tests**: none (regras em T5/T6)
**Gate**: build

**Commit**: `feat(docs): edit, delete and category management actions`
**Status**: ✅ Done — `04bf5e9`

---

### T11: Fechamento do lote — gate final + traceability

**What**: Passada final: estados de erro (action falhando exibe mensagem), revisão self-check Astryx nas duas telas, gate build completo, smoke `build && start` (200 em `/configuracoes` e `/documentos`), atualização da tabela de traceability no spec.md (status → Implementing).
**Where**: spec.md (traceability), ajustes residuais
**Depends on**: T7, T10
**Reuses**: —
**Requirement**: todos (fechamento)

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [ ] `npm run lint && npx vitest run && npm run build` limpo; contagem final de testes ≥ 27 + novos de T2–T6, nenhum removido
- [ ] `next start`: `/configuracoes` e `/documentos` respondem 200 com conteúdo real
- [ ] Traceability atualizada no spec.md
- [ ] Working tree do lote commitada (só arquivos do lote)

**Tests**: none
**Gate**: build

**Commit**: `chore(lote2): final gate, smoke and traceability update`
**Status**: ✅ Done — `afda03b` (+ `31d1fae` prod-only NavLink fix found during smoke)

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6
Phase 2:  T7 ──→ T8 ──→ T9 ──→ T10 ──→ T11
```

11 tasks → 2 batches (~6 + ~5, corte na fronteira de fase). No Execute, o orquestrador DEVE apresentar a oferta de sub-agentes (offer-then-confirm) antes de iniciar — 2 workers: batch 1 = Phase 1, batch 2 = Phase 2. Verifier independente roda automaticamente após T11, sempre.

Nota de ordem interna: T4 não depende de T3 (módulo puro), mas a ordem T3→T4 é mantida por simplicidade sequencial — nenhum custo real.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: schema | 1 arquivo (schema) | ✅ Granular |
| T2: seed + testes | 1 script + testes co-locados | ✅ Granular |
| T3: DAL leituras | 3 funções coesas na mesma camada + testes | ✅ OK (coeso) |
| T4: validação | 1 módulo puro + testes | ✅ Granular |
| T5: DAL escritas | 6 funções coesas na mesma camada + testes | ✅ OK (coeso — mesma costura) |
| T6: actions | 2 arquivos de actions + testes | ✅ OK (coeso) |
| T7: tela Configurações | 1 página (RSC + form + amostra) | ✅ OK (coeso — uma tela) |
| T8: listagem+toolbar | 1 página + toolbar | ✅ OK (coeso — uma tela) |
| T9: upload dialog | 1 componente | ✅ Granular |
| T10: editar/excluir/categorias | 3 componentes irmãos da mesma tabela | ⚠️ OK (coesos — ações da mesma linha) |
| T11: fechamento | gate + docs | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | None (ordenado por coesão) | T3→T4 (ordem, não dependência — nota no mapa) | ✅ Match |
| T5 | T2 | T4→T5 (ordem; dependência real T2 é anterior) | ✅ Match |
| T6 | T4, T5 | T5→T6 (T4 anterior na mesma fase) | ✅ Match |
| T7 | T3, T6 | início Phase 2 (Phase 1 completa) | ✅ Match |
| T8 | T3 | T7→T8 (ordem; dependência real T3 é anterior) | ✅ Match |
| T9 | T6, T8 | T8→T9 | ✅ Match |
| T10 | T9 | T9→T10 | ✅ Match |
| T11 | T7, T10 | T10→T11 | ✅ Match |

Nenhuma dependência aponta para fase posterior. Setas do diagrama = ordem de execução; todo `Depends on` está satisfeito quando a task inicia.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Schema | none (build gate) | none/build | ✅ OK |
| T2 | Seed | integration | integration | ✅ OK |
| T3 | DAL leituras | integration | integration | ✅ OK |
| T4 | Validação | unit | unit | ✅ OK |
| T5 | DAL escritas | integration | integration | ✅ OK |
| T6 | Actions | integration | integration | ✅ OK |
| T7 | UI | none (nesta fase) | none/build | ✅ OK |
| T8 | UI | none | none/build | ✅ OK |
| T9 | UI | none | none/build | ✅ OK |
| T10 | UI | none | none/build | ✅ OK |
| T11 | — | — | none/build | ✅ OK |

`Tests: none` nas tasks de UI é válido pela matriz (camada UI = none nesta fase, com a decisão de matriz registrada acima); nenhuma regra de negócio depende de teste de UI — todas têm teste na camada actions/DAL/validação.
