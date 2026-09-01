# Fase 1 — Fundação Técnica Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/fase-1-fundacao/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirmed with tasks. Guidelines found: `AGENTS.md` (ler docs do Next em `node_modules/next/dist/docs` antes de codar). Projeto sem nenhum teste existente — strong defaults aplicados; usuário delegou setup de Vitest (decisão de design).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Schema / config (drizzle, next.config, deps) | none | build gate only | — | build gate |
| Seed (dados mockados) | integration | Invariantes das ACs 1.2–1.5 + idempotência (AC 1.3) verificadas por queries reais | `src/db/__tests__/*.test.ts` | `npx vitest run` |
| DAL (`src/server/data`) | integration | Toda função: filtro por tenant + disjunção A/B (ACs 2.1–2.2); coleções vazias p/ tenant sem dados (edge case) | `src/server/data/__tests__/*.test.ts` | `npx vitest run` |
| Lógica de resolução de tenant (pure function) | unit | Fallback p/ 1º tenant quando cookie inválido/ausente (edge case do design) | `src/server/__tests__/*.test.ts` | `npx vitest run` |
| UI shell / páginas placeholder / store Zustand | none (nesta fase) | Placeholders sem comportamento além de navegação; verificação manual + Verifier + build gate. E2E entra quando as telas ganharem comportamento (Fases 2+) | — | build gate |

## Gate Check Commands

> Confirmados a partir do package.json (scripts `lint`, `build`) + Vitest a instalar em T1.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks com testes unit/integration | `npx vitest run` |
| Full | (sem e2e nesta fase — igual ao Quick) | `npx vitest run` |
| Build | Fim de fase ou tasks só de config/UI | `npm run lint && npm run build` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Stack e banco

```
T1 → T2 → T3
```

### Phase 2: Camada de dados e tenant

```
T4 → T5
```

### Phase 3: Shell e navegação

```
T6 → T7 → T8
```

---

## Task Breakdown

### T1: Instalar stack obrigatória + Astryx init

**What**: Instalar e configurar todas as dependências da fase: `@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli`, `zustand`, `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `tsx`, `dotenv`, `vitest`; rodar `npx astryx init`; importar CSS do tema Astryx no `app/globals.css`; registrar catálogo disponível (`npx astryx component` e `npx astryx template --list`) nos comentários do commit ou em nota para as tasks seguintes.
**Where**: `package.json`, `app/globals.css`
**Depends on**: None
**Reuses**: Tailwind v4 já configurado (`postcss.config.mjs`)
**Requirement**: FUND-07 (base), FUND-09 (base)

**Tools**: MCP: NONE | Skill: NONE

**Done when**:

- [ ] Todas as deps instaladas sem erro
- [ ] `npx astryx init` executado (não-interativo)
- [ ] Tema Astryx importado no globals.css (reset + astryx.css + theme.css)
- [ ] Saída de `npx astryx component` capturada (lista de componentes disponíveis anotada para T6/T7)
- [ ] Gate check passes: `npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `build(fundacao): install astryx, zustand, drizzle and test stack`

---

### T2: Schema Drizzle multi-tenant + push

**What**: Criar `drizzle.config.ts`, `src/db/schema.ts` (6 tabelas: `tenants`, `brokers`, `leads`, `conversations`, `messages`, `documents` + pgEnums `lead_status`, `modality`, `property_type`, `motivation`, `credit_status`, `sender` conforme design), `src/db/index.ts` (Pool `pg` + erro explícito se `DATABASE_URL` ausente apontando `.env.example`), e aplicar no banco com `npx drizzle-kit push`.
**Where**: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/index.ts`
**Depends on**: T1
**Reuses**: Data models do design.md (seção Data Models é a fonte)
**Requirement**: FUND-01, FUND-04

**Tools**: MCP: NONE | Skill: NONE

**Done when**:

- [ ] Toda tabela de negócio (exceto `tenants`) tem `tenant_id` NOT NULL com FK para `tenants`
- [ ] Enums pgEnum criados com os valores exatos do design
- [ ] Campos de qualificação do lead (PRD §6.4) + `executive_summary`, `escalation_reason`, `meeting_at`, `meeting_attended`, `first_contact_at`, `first_response_at`, `expires_at` (documents) presentes
- [ ] `npx drizzle-kit push` aplicado com sucesso no Neon (schema `public`)
- [ ] `src/db/index.ts` lança erro claro sem `DATABASE_URL`
- [ ] Gate check passes: `npm run lint && npm run build`

**Tests**: none (schema — build gate only, conforme matrix)
**Gate**: build
**Commit**: `feat(fundacao): add multi-tenant drizzle schema and db client`

---

### T3: Seed idempotente com testes de invariantes

**What**: Criar `src/db/seed.ts` (script `npm run db:seed` via `tsx`) populando 2 imobiliárias fictícias completas (corretores, 20–30 leads/tenant distribuídos nos 3 status, conversas 1:1 com mensagens, documentos) usando UUIDs determinísticos + delete-and-insert transacional; criar `src/db/__tests__/seed.test.ts` (Vitest) validando as invariantes por queries reais.
**Where**: `src/db/seed.ts`, `src/db/__tests__/seed.test.ts`, `package.json` (scripts), `vitest.config.ts`
**Depends on**: T2
**Reuses**: schema + cliente de T2
**Requirement**: FUND-02, FUND-03

**Tools**: MCP: NONE | Skill: NONE

**Done when**:

- [ ] `npm run db:seed` popula os 2 tenants com todas as entidades (AC 1.2)
- [ ] Teste: leads `qualificado_agendado` têm TODOS os campos de qualificação + resumo executivo (AC 1.4)
- [ ] Teste: leads `escalado_humano` têm motivo de escalonamento (AC 1.5)
- [ ] Teste: rodar seed 2x → contagens e IDs idênticos (AC 1.3, idempotência)
- [ ] Teste: valor fora do enum é rejeitado pelo banco (AC 1.6)
- [ ] Gate check passes: `npx vitest run`
- [ ] Test count: ≥5 testes passando (no silent deletions)

**Tests**: integration
**Gate**: quick
**Commit**: `feat(fundacao): add idempotent multi-tenant seed with invariant tests`

---

### T4: Camada de acesso a dados (DAL) com testes de isolamento

**What**: Criar `src/server/data/` com `import 'server-only'` e funções tipadas (`getTenants`, `getTenant`, `getBrokers`, `getLeads` c/ filtro status, `getLead`, `getConversations`, `getMessages`, `getDocuments`) — toda função (exceto `getTenants`) exige `tenantId`; criar `src/server/data/__tests__/isolation.test.ts` provando disjunção total entre tenants A e B em cada função + coleções vazias para tenant inexistente.
**Where**: `src/server/data/index.ts` (+ módulos), `src/server/data/__tests__/isolation.test.ts`
**Depends on**: T3 (testes precisam do banco seedado)
**Reuses**: schema/cliente T2, dados do seed T3
**Requirement**: FUND-05, FUND-06

**Tools**: MCP: NONE | Skill: NONE

**Done when**:

- [ ] Nenhuma função além de `getTenants` é chamável sem `tenantId` (assinatura obrigatória — AC 2.1)
- [ ] Teste por função: resultado do tenant A ∩ tenant B = ∅ e todos os registros retornados têm `tenant_id` correto (AC 2.2)
- [ ] Teste: tenant sem dados → `[]`, nunca erro (edge case da spec)
- [ ] `server-only` importado (falha se usado em client component)
- [ ] Gate check passes: `npx vitest run`
- [ ] Test count: ≥8 testes passando no arquivo de isolamento

**Tests**: integration
**Gate**: quick
**Commit**: `feat(fundacao): add tenant-scoped data access layer with isolation tests`

---

### T5: Contexto de tenant no servidor (cookie + server action)

**What**: Criar `src/server/tenant.ts`: pure function `resolveActiveTenant(cookieValue, tenants)` (retorna tenant do cookie se válido, senão o primeiro), `getActiveTenantId()` (lê cookie `crivo_tenant` via `cookies()` — assíncrono no Next 16), `setActiveTenant(tenantId)` (server action: valida contra `getTenants`, grava cookie); testes unit da pure function.
**Where**: `src/server/tenant.ts`, `src/server/__tests__/tenant.test.ts`
**Depends on**: T4
**Reuses**: DAL (`getTenants`)
**Requirement**: FUND-08 (base servidor)

**Tools**: MCP: NONE | Skill: NONE

**Done when**:

- [ ] Teste: cookie válido → tenant do cookie
- [ ] Teste: cookie ausente → primeiro tenant
- [ ] Teste: cookie com tenant inexistente → primeiro tenant (edge case do design: seed recriado)
- [ ] `setActiveTenant` rejeita tenantId inexistente
- [ ] Gate check passes: `npx vitest run`
- [ ] Test count: ≥3 testes unit da pure function

**Tests**: unit
**Gate**: quick
**Commit**: `feat(fundacao): add tenant cookie context with server action`

---

### T6: Zustand tenantStore + TenantSwitcher

**What**: Criar `src/stores/tenant-store.ts` (Zustand: `tenantId`, `tenantName`, `setTenant`) e `src/components/shell/tenant-switcher.tsx` (client component: select/dropdown Astryx listando tenants, chama `setActiveTenant` + `router.refresh()`, espelha no store; inicializado por props do servidor).
**Where**: `src/stores/tenant-store.ts`, `src/components/shell/tenant-switcher.tsx`
**Depends on**: T1 (zustand), T5 (server action)
**Reuses**: catálogo Astryx anotado em T1
**Requirement**: FUND-08

**Tools**: MCP: NONE | Skill: NONE

**Done when**:

- [ ] Trocar tenant grava cookie via server action e faz `router.refresh()` (AC 3.3)
- [ ] Store espelha tenant ativo para uso client (AC 3.3)
- [ ] Persistência entre reloads garantida pelo cookie (AC 3.4 — fonte de verdade é o cookie, não localStorage; decisão AD-007)
- [ ] Gate check passes: `npm run lint && npm run build`

**Tests**: none (UI — conforme matrix; comportamento coberto por verificação manual do Verifier)
**Gate**: build
**Commit**: `feat(fundacao): add tenant switcher with zustand mirror`

---

### T7: App shell com sidebar Astryx + 5 rotas placeholder

**What**: Criar route group `app/(crm)/` com `layout.tsx` (sidebar Astryx com 5 itens: Configurações, Documentos, Pipeline, Chats, Dashboard + header com TenantSwitcher) e as 5 páginas placeholder — cada uma é RSC que resolve o tenant ativo (T5) e exibe nome da área + nome da imobiliária vindo do banco (DAL). Mover conteúdo default de `app/page.tsx` para redirect ao shell.
**Where**: `app/(crm)/layout.tsx`, `app/(crm)/{configuracoes,documentos,pipeline,chats,dashboard}/page.tsx`, `app/page.tsx`, `src/components/shell/sidebar.tsx`
**Depends on**: T4, T6
**Reuses**: componentes Astryx (catálogo de T1); fallback: primitivos de layout
**Requirement**: FUND-07

**Tools**: MCP: NONE | Skill: NONE

**Done when**:

- [ ] Sidebar com 5 itens navegáveis construída com componentes Astryx (AC 3.1)
- [ ] Cada rota exibe área + tenant ativo com dado real do banco (AC 3.2)
- [ ] Navegação client-side entre as 5 rotas funciona
- [ ] Gate check passes: `npm run lint && npm run build`

**Tests**: none (UI placeholder — conforme matrix)
**Gate**: build
**Commit**: `feat(fundacao): add crm shell with astryx sidebar and placeholder routes`

---

### T8: Error/empty states + build de produção deploy-ready

**What**: Criar `app/(crm)/error.tsx` (falha de banco → erro amigável por área + retry), garantir estados vazios nas placeholders (tenant sem dados), conferir `.env.example` atualizado, e validar build de produção completo (equivale ao smoke de deploy Vercel).
**Where**: `app/(crm)/error.tsx`, ajustes nas páginas, `.env.example`
**Depends on**: T7
**Reuses**: shell de T7
**Requirement**: FUND-09 + edge cases da spec

**Tools**: MCP: NONE | Skill: NONE

**Done when**:

- [ ] `error.tsx` cobre falha de banco sem derrubar o shell (edge case)
- [ ] Rota inexistente → 404 padrão dentro do app (edge case)
- [ ] `.env.example` documenta todas as env vars usadas
- [ ] Gate check passes: `npm run lint && npm run build` + `npx vitest run` (build final de fase = todos os testes)
- [ ] Test count total: ≥16 testes passando (T3+T4+T5, no silent deletions)

**Tests**: none (herda suites existentes no gate de fase)
**Gate**: build (fim de fase: build + lint + all tests)
**Commit**: `feat(fundacao): add error boundaries and production-ready build`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ──→ T2 ──→ T3
Phase 2:  T4 ──→ T5
Phase 3:  T6 ──→ T7 ──→ T8
```

**Batching decidido com o usuário:** o usuário pediu uso máximo de sub-agentes. Empacotamento padrão (~7 tasks) renderia 1 batch (8 tasks); por decisão explícita do usuário, cada fase vira um batch → **3 batch workers sequenciais + 1 Verifier**. Batches rodam estritamente em sequência (dependências lineares); dentro do batch, tasks em ordem. Workers não spawnam sub-agentes.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: deps + astryx init | 1 setup coeso (package.json + css) | ✅ Granular |
| T2: schema + client + push | 3 arquivos coesos do mesmo conceito (schema) | ⚠️ OK coeso |
| T3: seed + testes invariantes | 1 script + testes co-locados | ✅ Granular |
| T4: DAL + testes isolamento | 1 camada + testes co-locados | ✅ Granular |
| T5: contexto tenant + testes | 1 módulo + testes | ✅ Granular |
| T6: store + switcher | 2 arquivos acoplados (mesmo fluxo) | ⚠️ OK coeso |
| T7: layout + 5 placeholders | 5 páginas triviais do mesmo padrão + 1 layout | ⚠️ OK coeso (placeholders de 1 linha semântica) |
| T8: error/empty + build final | fechamento de fase | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | início Phase 1 | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | T3 | Phase 1→Phase 2 (T3→T4) | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T1, T5 | Phase 2→Phase 3 (T5→T6; T1 em fase anterior) | ✅ Match |
| T7 | T4, T6 | T6→T7 (T4 em fase anterior) | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | config/deps | none | none | ✅ OK |
| T2 | schema/config | none | none | ✅ OK |
| T3 | seed | integration | integration (co-located) | ✅ OK |
| T4 | DAL | integration | integration (co-located) | ✅ OK |
| T5 | lógica resolução tenant | unit | unit (co-located) | ✅ OK |
| T6 | UI/store | none (nesta fase) | none | ✅ OK |
| T7 | UI placeholder | none (nesta fase) | none | ✅ OK |
| T8 | UI/error + fechamento | none | none (gate de fase roda all tests) | ✅ OK |

---

## Status das tasks

| Task | Status | Commit |
| ---- | ------ | ------ |
| T1 | Done | e0bc5ad |
| T2 | Done | b6ca957 |
| T3 | Done | 6b3fe0f |
| T4 | Done | d03221e |
| T5 | Done | f530948 |
| T6 | Done | 1aa6228 |
| T7 | Done | f52667f |
| T8 | Done | b9804c2 |
