# Fase 1 — Fundação Técnica Validation

**Date**: 2026-08-02
**Spec**: `.specs/features/fase-1-fundacao/spec.md`
**Diff range**: `bcc01b7..b9804c2` (8 commits, scope `fundacao`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | Stack installed (`e0bc5ad`) — deps present in `package.json`, build green |
| T2   | ✅ Done | Schema + client (`b6ca957`) — `src/db/schema.ts`, `src/db/index.ts` |
| T3   | ✅ Done | Seed + invariant tests (`6b3fe0f`) — `src/db/seed.ts`, `src/db/__tests__/seed.test.ts` |
| T4   | ✅ Done | DAL + isolation tests (`d03221e`) — `src/server/data/index.ts`, `.../__tests__/isolation.test.ts` |
| T5   | ✅ Done | Tenant cookie context (`f530948`) — `src/server/tenant.ts` |
| T6   | ✅ Done | Zustand store + switcher (`1aa6228`) — `src/stores/tenant-store.ts`, `src/components/shell/tenant-switcher.tsx` |
| T7   | ✅ Done | Shell + 5 routes (`f52667f`) — `app/(crm)/layout.tsx` + 5 pages |
| T8   | ✅ Done | Error boundary + prod build (`b9804c2`) — `app/(crm)/error.tsx`, `.env.example` |

All 8 tasks committed, matches `tasks.md` "Status das tasks" table.

---

## Spec-Anchored Acceptance Criteria

### P1: Modelo de dados multi-tenant com seed mockado

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| AC1.1: toda tabela de negócio SHALL ter `tenant_id` NOT NULL (exceto `tenants`) | 5 tabelas (`brokers`,`leads`,`conversations`,`messages`,`documents`) com `tenant_id` NOT NULL + FK; `tenants` sem a coluna | `src/db/schema.ts:52-54` (brokers), `:65-67` (leads), `:99-101` (conversations), `:113-115` (messages), `:126-128` (documents) — all `.notNull().references(() => tenants.id)`; `tenants` table (`:40-48`) has no `tenantId` column | ✅ PASS |
| AC1.2: seed popula 2 tenants com corretores, leads nos 3 status, conversas+mensagens, documentos | 2 tenants; each has brokers>0, leads 20-30 split across all 3 statuses, 1 conversation/lead with messages, documents>0 | `src/db/__tests__/seed.test.ts:50-83` — `expect(allTenants).toHaveLength(2)`, per-tenant `expect(tenantLeads.length).toBeGreaterThanOrEqual(20)`/`toBeLessThanOrEqual(30)`; `:85-96` — `expect(rows.length).toBeGreaterThan(0)` for each of the 3 statuses | ✅ PASS |
| AC1.3: seed rodado 2x termina no mesmo estado (idempotente) | Segunda execução produz contagens e IDs idênticos | `src/db/__tests__/seed.test.ts:130-135` — `expect(after).toEqual(before)` comparing sorted ID snapshots before/after a second `runSeed()` call | ✅ PASS |
| AC1.4: lead `qualificado_agendado` tem todos os campos de qualificação (PRD §6.4) + resumo executivo | region, budgetCents, propertyType, purchaseHorizon, motivation, creditStatus, chainedOperation, executiveSummary all non-null | `src/db/__tests__/seed.test.ts:98-116` — individual `expect(lead.<field>).not.toBeNull()` for every field + `expect(lead.executiveSummary).toBeTruthy()` | ✅ PASS |
| AC1.5: lead `escalado_humano` tem motivo de escalonamento | `escalationReason` non-empty | `src/db/__tests__/seed.test.ts:118-128` — `expect(lead.escalationReason).toBeTruthy()` | ✅ PASS |
| AC1.6: valor fora do enum (status de lead OU modalidade) é rejeitado pelo banco | INSERT with invalid enum value throws | `src/db/__tests__/seed.test.ts:137-147` — raw SQL insert with `status = 'status_invalido'`, `expect(...).rejects.toThrow()`. `modality` enum rejection is NOT separately queried/tested, but the identical DB-level mechanism (`pgEnum`) backs `leads.modality` (`schema.ts:18,73`) | ⚠️ Spec-precision gap (partial) — `lead_status` directly tested; `modality` enum enforcement is structurally identical but not independently verified by a test |

### P1: Camada de acesso a dados isolada por tenant

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC2.1: toda função exige `tenant_id`, retorna só do tenant | Every DAL function (except `getTenants`) has `tenantId` as a required (non-optional) parameter | `src/server/data/index.ts:38` `getBrokers(tenantId: string)`, `:42-45` `getLeads(tenantId: string, filters?)`, `:57-60` `getLead(tenantId, leadId)`, `:69-71` `getConversations(tenantId)`, `:78-81` `getMessages(tenantId, conversationId)`, `:93` `getDocuments(tenantId)` — all required params; only `getTenants()` (`:25`) has none | ✅ PASS |
| AC2.2: tenant A e B disjuntos (teste automatizado) | Zero ID intersection between tenant A/B results, every record's `tenantId` matches queried tenant | `src/server/data/__tests__/isolation.test.ts:62-76` (getBrokers), `:85-99` (getLeads), `:133-149` (getConversations), `:182-198` (getDocuments) — each computes `intersection` via Set and asserts `expect(intersection).toEqual([])` plus per-record `tenantId` assertions; `:118-124` `getLead(tenantB, leadA.id)` → `expect(result).toBeNull()` (cross-tenant read blocked) | ✅ PASS |
| AC2.3: nenhum acesso direto ao Drizzle fora da DAL (verificável por convenção) | Only `src/db/*` and `src/server/data/*` import `src/db` | Grep across `**/*.{ts,tsx}` for imports of `../db` / `../../db` / `@/src/db` returns exactly `src/server/data/index.ts:3,11` and `src/server/data/__tests__/isolation.test.ts:3` (plus `src/db/*` itself, which is in-module) — no other file imports it | ✅ PASS |

### P1: App shell navegável com seletor de tenant

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC3.1: sidebar com 5 itens (Configurações, Documentos, Pipeline, Chats, Dashboard) com Astryx | Sidebar built from Astryx `SideNav`/`SideNavItem` components listing exactly these 5 routes | `src/components/shell/sidebar.tsx:1-40` — imports `SideNav, SideNavItem, SideNavSection` from `@astryxdesign/core/SideNav`; `NAV_ITEMS` (`:8-14`) = Dashboard, Pipeline, Chats, Documentos, Configurações (5 items, matches spec set) | ✅ PASS |
| AC3.2: item clicado navega para rota placeholder mostrando área + tenant ativo | Each of the 5 routes renders area name + active tenant's real name from DB | `app/(crm)/dashboard/page.tsx:7-17`, `app/(crm)/pipeline/page.tsx:7-17`, `app/(crm)/chats/page.tsx:7-17`, `app/(crm)/documentos/page.tsx:7-17`, `app/(crm)/configuracoes/page.tsx:7-17` — each resolves `getActiveTenantId()` + `getTenant(tenantId)` and renders `<Heading>` with area name + `Imobiliária ativa: {tenant?.name}`; client-side nav via `Link`/`LinkProvider` in `sidebar.tsx:25` | ✅ PASS |
| AC3.3: troca de tenant reflete em toda UI (Zustand) e dados exclusivos do novo tenant | Switch updates store + triggers re-render with new tenant's data only | `src/components/shell/tenant-switcher.tsx:42-51` `handleChange` — calls `onTenantChange(tenantId)` (server action `setActiveTenant`, writes cookie), then `setTenant(...)` (Zustand mirror), then `router.refresh()`; RSC pages re-read `getActiveTenantId()` off the updated cookie on refresh, so DAL calls are scoped to the new tenant (same isolation guarantee as AC2.2) | ✅ PASS |
| AC3.4: tenant ativo persiste após reload | Persistence across reload | `src/server/tenant.ts:53-54` `setActiveTenant` writes cookie `crivo_tenant` (no `maxAge`, i.e. session cookie — survives page reload, cleared on full browser close); `src/stores/tenant-store.ts:1-20` confirmed has **no** `zustand/persist` / localStorage middleware | ⚠️ Spec-precision note (not a gap) — spec.md's AC 3.4 illustrative example says "ex.: localStorage via Zustand persist"; design.md's Tech Decisions table (line 179) explicitly supersedes this with the cookie-as-source-of-truth decision (RSC needs server-readable state; localStorage is invisible server-side). Implementation follows design.md correctly. Documented below as a resolved spec/design conflict, not an implementation gap. |

### P2: Projeto deploy-ready para Vercel

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC4.1: `next build` completa sem erros com env vars documentadas | Clean production build; `.env.example` documents required vars | Verified by running `npm run build` — `✓ Compiled successfully`, all 5 routes + `/` + `/_not-found` listed in route table (see Gate Check below); `.env.example:1-4` documents `DATABASE_URL` | ✅ PASS |
| AC4.2: build+start funciona igual ao dev (5 rotas + seletor) | Production server serves the 5 routes + switcher identically to dev | Verified by running `npm run build && npm run start` and curling routes: `GET /dashboard` → `200`, `GET /pipeline` → `200`, `GET /rota-que-nao-existe` → `404` (see Gate Check below) | ✅ PASS |

**Status**: ✅ All ACs covered — 1 partial spec-precision gap (AC1.6 modality enum not independently query-tested, though structurally identical to the tested mechanism) and 1 spec-precision note (AC3.4 design.md legitimately supersedes spec.md's illustrative example).

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `src/server/data/index.ts:38-40` (`getBrokers`) | Removed the `tenantId` WHERE filter (`.where(eq(brokers.tenantId, tenantId))` → no filter, returns all rows) | ✅ Killed — `isolation.test.ts` "getBrokers" block: 2 tests failed (disjunction assertion received all 6 brokers instead of 3; empty-for-nonexistent-tenant assertion received all rows instead of `[]`) |
| 2 | `src/server/tenant.ts:17` (`resolveActiveTenant`) | Inverted the cookie-match check: `tenant.id === cookieValue` → `tenant.id !== cookieValue` | ✅ Killed — `tenant.test.ts` "retorna o tenant correspondente quando o cookie aponta para um tenant válido" failed (`expected Imobiliária A to be Imobiliária B`) |
| 3 | `src/db/seed.ts:532` (`runSeed` transaction) | Removed `await tx.delete(tenants);` from the delete phase (idempotency mechanism) | ✅ Killed — `seed.test.ts` suite failed entirely: `beforeAll`'s `runSeed()` threw `duplicate key value violates unique constraint "tenants_pkey"` (Postgres error code 23505) since the deterministic tenant IDs already existed and were never cleared |

**Sensor depth**: lightweight (default tier — 3 targeted mutations on highest-risk new code: tenant filtering, tenant resolution fallback, seed idempotency)
**Result**: 3/3 killed — PASS ✅

All mutations were applied via `Edit`, tested against their respective Vitest file, confirmed failing, then reverted via `Edit` back to the exact original content. `git diff` on each file after restoration showed **no changes** (only line-ending warnings, no content diff). Full suite re-run after all 3 mutations (`npx vitest run`) still shows 27/27 passing, confirming the transactional rollback of mutation 3's failed insert left the seeded DB state intact.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — DAL exposes exactly the 8 read functions the design specifies, no CRUD beyond what's needed for Fase 1 |
| Surgical changes | ✅ — diff touches only files listed in tasks.md; no unrelated refactors |
| No scope creep | ✅ — no auth, no write endpoints, no extra entities beyond spec's 6 tables |
| Matches patterns | ✅ — consistent RSC-first pattern across all 5 placeholder pages; Next 16 APIs used correctly (`unstable_retry` in `error.tsx`, confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md:329` — "v16.2.0 — unstable_retry prop added") |
| Spec-anchored outcome check (asserted values match spec) | ✅ (with 1 partial gap noted — AC1.6 modality) |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — matches Test Coverage Matrix exactly: seed=integration, DAL=integration, tenant resolution=unit, UI=none (build gate only) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every `it()` block's description cites an AC number or "edge case" |
| Documented guidelines followed: AGENTS.md (read `node_modules/next/dist/docs` before coding) | ✅ — evidenced by correct use of Next 16.2 `unstable_retry` API and async `cookies()` |

---

## Edge Cases

- [x] Tenant sem leads/conversas/documentos → coleções vazias, nunca erro: `isolation.test.ts:78-81,101-104,151-154,175-178,200-203` ("retorna [] para um tenant inexistente, nunca um erro") + placeholder pages render `<EmptyState>` when collection length is 0 (e.g. `dashboard/page.tsx:18-22`)
- [x] Banco indisponível → erro claro por área, shell não crasha: `app/(crm)/error.tsx:1-42` — route-group-scoped Client Component error boundary with `Banner` + retry button (`unstable_retry`); shell (`layout.tsx`) itself is a separate Server Component tree, so a data-fetch failure inside a page is caught by this boundary without unmounting the sidebar/header
- [x] `DATABASE_URL` ausente → falha no startup com mensagem explícita: `src/db/index.ts:5-9` — `throw new Error("DATABASE_URL não definida. Copie .env.example...")`; `drizzle.config.ts:4-8` has the equivalent guard for drizzle-kit commands
- [x] Rota inexistente → 404 padrão dentro do shell: verified live via `npm run build && npm run start` + `curl http://localhost:3000/rota-que-nao-existe` → `404`; build output also lists `○ /_not-found` as a static route

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npx vitest run` (Build-level gate per tasks.md)
- **Result**: lint — 0 errors; build — succeeded (`✓ Compiled successfully in 2.3s`, TypeScript check passed, all 7 routes generated: `/`, `/_not-found`, `/chats`, `/configuracoes`, `/dashboard`, `/documentos`, `/pipeline`); vitest — **27 passed, 0 failed** (3 test files: `seed.test.ts`, `isolation.test.ts`, `tenant.test.ts`)
- **Test count before feature**: 0 (project had no test infrastructure prior to this feature — confirmed by tasks.md's Test Coverage Matrix note: "Projeto sem nenhum teste existente")
- **Test count after feature**: 27
- **Delta**: +27 new tests
- **Skipped tests**: none
- **Failures**: none
- **Additional smoke test (AC4.2)**: `npm run start` (production server) + `curl`: `GET /dashboard` → `200`, `GET /pipeline` → `200`, `GET /rota-que-nao-existe` → `404`. Server process exited cleanly after the check (verified via `Get-Process node` returning empty).

---

## Known Deviations (reported by implementers) — Verification

| # | Deviation | Verified? | Evidence |
| - | --------- | --------- | -------- |
| 1 | `npx astryx init` appended ASTRYX:START/END block to `AGENTS.md`/`CLAUDE.md`, left uncommitted | ✅ Confirmed | `git log bcc01b7..b9804c2 -- AGENTS.md CLAUDE.md` → empty; `git log --all -- AGENTS.md CLAUDE.md` → only `98a05ba` (initial commit, predates the block); `git status --short` shows `M AGENTS.md`, `M CLAUDE.md` (working-tree only); `git diff AGENTS.md CLAUDE.md` shows the exact `<!-- ASTRYX:START -->...<!-- ASTRYX:END -->` block as the only uncommitted change |
| 2 | `server-only` package + `vitest.config.ts` alias so DAL tests run under plain Vitest | ✅ Confirmed | `src/server/data/index.ts:1` — `import "server-only";`; `vitest.config.ts:11-21` — `resolve.alias` maps `"server-only"` to `node_modules/server-only/empty.js` with an explanatory comment about the `react-server` export condition |
| 3 | `isolation.test.ts` does not call the seed itself (assumes DB pre-seeded from T3), to avoid a concurrent-seed FK race | ✅ Confirmed reasonable | `isolation.test.ts:18-22` documents the reasoning explicitly in a comment; the DB is genuinely seeded — proven by `isolation.test.ts`'s `beforeAll` (`getTenants().length >= 2`) passing and all 17 isolation tests passing without running `runSeed()` themselves. Not silently-skipped coverage: seed invariants are independently covered by `seed.test.ts` |
| 4 | `tenant-switcher.tsx` revised to not import from `src/server/tenant.ts` directly; server action passed as `onTenantChange` prop | ✅ Confirmed, with nuance | `tenant-switcher.tsx` has no import from `src/server/tenant.ts` at all, and no **runtime** import from `src/server/data` — it does have `import type { Tenant } from "@/src/server/data"` (`:7`), which is a type-only import erased at compile time (zero JS/runtime footprint, does not pull the `server-only`/`pg`-backed module into the client bundle). `onTenantChange` prop confirmed passed from the Server Component layout (`layout.tsx:29` — `onTenantChange={setActiveTenant}`). Production build succeeded, which is itself evidence the bundle boundary holds (a runtime import of `server-only` code into a client component fails the Next build) |
| 5 | Spec (AC 3.4) says localStorage via Zustand persist; design.md says cookie is source of truth; implementers followed design.md | ✅ Confirmed | `src/stores/tenant-store.ts:1-20` — plain `create<TenantState>(...)`, no `zustand/persist` import, no localStorage reference anywhere in the store. Recorded as a **spec-precision note** in the AC3.4 row above — design.md legitimately supersedes the spec's illustrative example (design.md Tech Decisions, line 179, gives the RSC-compatibility rationale); not treated as a gap |

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ----------- |
| FUND-01     | Pending          | ✅ Verified |
| FUND-02     | Pending          | ✅ Verified |
| FUND-03     | Pending          | ✅ Verified |
| FUND-04     | Pending          | ✅ Verified (see spec-precision note: modality enum not independently query-tested, but same DB mechanism as the tested lead_status enum) |
| FUND-05     | Pending          | ✅ Verified |
| FUND-06     | Pending          | ✅ Verified |
| FUND-07     | Pending          | ✅ Verified |
| FUND-08     | Pending          | ✅ Verified (see spec-precision note on AC3.4 — cookie, not localStorage, per design.md) |
| FUND-09     | Pending          | ✅ Verified |

All 9 requirements verified — none left as gaps requiring a fix task. The two notes above are precision flags, not blocking issues.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 15/16 ACs matched spec outcome precisely; 1 partial spec-precision gap (AC1.6 — modality enum rejection not independently query-tested); 1 spec-precision note (AC3.4 — design.md's cookie decision legitimately supersedes spec.md's localStorage example)
**Sensor**: 3/3 mutations killed
**Gate**: 27 passed, 0 failed (lint clean, build clean)

**What works**: Full multi-tenant schema with enforced `tenant_id` NOT NULL + FK on all 5 business tables; idempotent seed populating 2 realistic tenants with all pipeline statuses, qualification invariants, and escalation reasons; DAL with mandatory-tenant-id signatures and proven cross-tenant disjunction; cookie-based tenant resolution with correct fallback behavior; 5-route Astryx shell with working navigation, tenant switcher, and per-area empty states; route-group error boundary using the (correctly researched) Next 16.2 `unstable_retry` API; clean production build and confirmed working `build+start` smoke test including the 404 edge case.

**Issues found**:
1. (Minor, non-blocking) AC1.6's "modalidade" half is not independently tested with an actual invalid-value INSERT — only `lead_status` is. Since both use the identical `pgEnum` DDL mechanism, this is a low-risk gap. Optional follow-up: add one more `it()` in `seed.test.ts` mirroring the existing enum-rejection test but targeting `modality`.
2. (Informational, not a defect) The `crivo_tenant` cookie is set without an explicit `maxAge`/`expires`, making it a session cookie. This satisfies AC3.4's literal wording ("recarregado" = reload), but if "persist across browser restarts" is ever an implicit expectation for later phases, this would need an explicit `maxAge`.

**Next steps**: No blocking fix tasks. Optionally add the modality-enum-rejection test noted above in a future small task. Feature is ready to be marked complete.
