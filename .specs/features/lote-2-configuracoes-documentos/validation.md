# Lote 2 — Configurações + Documentos · Validation

**Date**: 2026-08-02
**Spec**: `.specs/features/lote-2-configuracoes-documentos/spec.md`
**Diff range**: `d7fc4f8..afda03b063bc663fcbe19d5b954c173d96788fe5` (12 commits, all on `main`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1   | ✅ Done | `document_categories` table + `documents.category_id` FK, `src/db/schema.ts:126-164` |
| T2   | ✅ Done | Seed extended, `src/db/seed.ts`; invariants tested in `src/db/__tests__/seed.test.ts:140-173` |
| T3   | ✅ Done | `getDocuments`/`getDocumentCategories`/`getDocumentSample`, `src/server/data/index.ts:104-171` |
| T4   | ✅ Done | `src/server/validation.ts`, all branches tested |
| T5   | ✅ Done | Write layer, `src/server/data/index.ts:195-337` |
| T6   | ✅ Done | `src/server/actions/{settings,documents}.ts` |
| T7   | ✅ Done | `app/(crm)/configuracoes/page.tsx` + `src/components/settings/settings-form.tsx` |
| T8   | ✅ Done | `app/(crm)/documentos/page.tsx` + `documents-toolbar.tsx` |
| T9   | ✅ Done | `upload-dialog.tsx` (metadata-only) |
| T10  | ✅ Done | `edit-document-dialog.tsx`, `documents-table.tsx` (delete), `category-manager-dialog.tsx` |
| T11  | ✅ Done | Gate green, smoke 200/200, this report closes traceability |

---

## Spec-Anchored Acceptance Criteria

### CONF-01/02/03/04 — Editar configurações + amostra de documentos

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| -------------------------- | --------------------- | ------------------------ | ------ |
| CONF-01.1 abrir `/configuracoes` exibe valores atuais do tenant | name/agentName/supportedModality do tenant ativo, do Postgres | `app/(crm)/configuracoes/page.tsx:24-28` reads `getTenant(tenantId)`; smoke: `curl /configuracoes` body contains `"Imobiliária Vale do Uberaba"` (seeded tenant name) | ✅ PASS |
| CONF-01.2 salvar alterações válidas persiste + confirma sucesso | valores gravados em `tenants`, confirmação exibida | `src/server/__tests__/actions.test.ts:64-87` — `expect(persisted!.name).toBe("Nome Via Action")` (exact value) + `settings-form.tsx:88-91` sets success banner on `result.ok` | ✅ PASS |
| CONF-01.3 nome refletido no shell sem novo login | shell mostra novo nome após salvar (refresh aceitável) | `settings-form.tsx:95` `router.refresh()` after success; `app/(crm)/layout.tsx:14-17` re-reads `getTenants()`/`getActiveTenantId()` on every request — mechanism verified by code read, not by automated test (UI-only) | ⚠️ Verified by smoke/code-read, not automated test |
| CONF-01.4 nome vazio (trim) ou >120 chars rejeitado, nada persiste | erro no campo, sem persistência | `actions.test.ts:89-104` — `result.ok===false`, `after!.name` unchanged; `validation.test.ts:28-38` exact 120/121 boundary | ✅ PASS |
| CONF-01.5 mudar modalidade mantém documentos intactos | doc count unchanged incl. modalidade desativada | Not directly tested (no test asserts doc-count before/after a modality change), but `updateTenantSettings` (`src/server/data/index.ts:195-209`) only touches the `tenants` row — never touches `documents` — so by construction no code path can affect documents | ⚠️ Spec-precision gap (no explicit before/after doc-count assertion; behavior structurally guaranteed) |
| CONF-01.6 troca de tenant exibe valores do novo tenant | `/configuracoes` re-render com outro tenant | RSC always calls `getActiveTenantId()` fresh (`page.tsx:24`) — structurally correct; not exercised by an automated test (UI-only) | ⚠️ Verified by code-read, not automated test |
| CONF-04.1 amostra = 5 mais recentes + contagem por modalidade | exatamente `min(5, total)` recentes, contagem exata | `src/server/data/__tests__/documents.test.ts:137-157` — `expect(sample.recent.length).toBe(Math.min(5, allDocs.length))`, `expect(sample.countsByModality).toEqual(expectedCounts)` | ✅ PASS |
| CONF-04.2 link "Ver todos" navega para `/documentos` | navegação para `/documentos` | `app/(crm)/configuracoes/page.tsx:61` `<NavLink href="/documentos">` — verified by code read + smoke (link present in rendered HTML) | ⚠️ Verified by smoke, not automated test |
| CONF-04.3 tenant sem documentos exibe estado vazio + CTA | `EmptyState` com ação para Documentos | `page.tsx:64-73` — `sample.recent.length === 0` branch renders `EmptyState` with `NavLink` action; DAL-level empty case tested in `documents.test.ts:176-184` (`getDocumentSample` returns `[]`/zeros for nonexistent tenant) | ✅ PASS (DAL) / ⚠️ UI branch by code-read |

### DOC-01 — Listar/filtrar/buscar

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| DOC-01.1 lista todos os docs do tenant, DESC por data | ordenação `uploadedAt DESC` | `documents.test.ts:64-73` — loop asserts `result[i-1].uploadedAt >= result[i].uploadedAt` | ✅ PASS |
| DOC-01.2 filtro modalidade | só docs da modalidade | `documents.test.ts:75-79`; smoke: `curl /documentos?modalidade=novo` returns only the "novo" seed doc | ✅ PASS |
| DOC-01.3 filtro categoria | só docs da categoria | `documents.test.ts:81-92` | ✅ PASS |
| DOC-01.4 busca por nome case-insensitive | substring match, case-insensitive | `documents.test.ts:94-103` — uppercased term still matches | ✅ PASS |
| DOC-01.5 busca+filtros sem resultado → estado vazio distinto de "sem documentos" | dois estados vazios diferentes | `app/(crm)/documentos/page.tsx:65-81` — `!hasAnyDocuments` vs `filteredDocuments.length === 0` render different `EmptyState` copy; smoke: `curl /documentos?q=zzznaoexiste` → body contains "Nenhum resultado encontrado" + "Limpar filtros" (not the "Nenhum documento ainda" copy) | ⚠️ Verified by smoke, not automated test |
| DOC-01.6 troca de tenant isola listagem | nunca mistura tenants | `documents.test.ts:126-133` — disjoint id sets between tenant A/B | ✅ PASS |

### DOC-02/03 — Upload metadata-only

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| DOC-02.1 upload válido registra metadados, descarta binário, aparece na lista | name/mimeType/sizeBytes/modality/categoryId persisted with `tenant_id` ativo | `actions.test.ts:137-153` — creates via action, `getDocuments` finds it with correct `tenantId`; schema has no binary/blob column (`src/db/schema.ts:147-164`) | ✅ PASS |
| DOC-02.2 tipo/tamanho inválido rejeitado, nada persiste | erro com motivo, 0 registros | `actions.test.ts:155-181` — MIME inválido and >10MB both assert `result.ok===false` and `found` has length 0 | ✅ PASS |
| DOC-02.3 sem modalidade rejeitado | erro de campo obrigatório | `validation.test.ts:88-102` (`validateModality` unit) — action calls this as authority (`documents.ts:47-48`) | ✅ PASS |
| DOC-02.4 falha no registro não deixa parcial | listing unaffected on error | Insert is a single atomic statement (`createDocument`, `src/server/data/index.ts:219-238`) — no code path creates a partial row; not independently tested with an injected DB failure | ⚠️ Spec-precision gap (no fault-injection test for a DB-level insert failure; structurally atomic) |

### DOC-04 — Excluir documento

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| DOC-04.1 excluir pede confirmação | confirmação antes de qualquer efeito | `src/components/documents/documents-table.tsx:161-178` — `AlertDialog` gates `handleConfirmDelete`; UI-only, verified by code-read | ⚠️ Verified by code-read, not automated test |
| DOC-04.2 confirmado remove registro (hard delete), some da lista e da amostra | doc gone from `getDocuments` and `getDocumentSample` | `src/server/data/__tests__/mutations.test.ts:169-183` — `deleteDocument` returns `true`, doc gone from `getDocuments`; sample uses same table so structurally consistent | ✅ PASS |
| DOC-04.3 cancelado mantém documento | doc inalterado | Not directly tested (cancel is a pure UI no-op that never calls the action) — trivially true by construction (`documents-table.tsx` only calls `deleteDocumentAction` from `onAction`, never on dialog close) | ⚠️ Verified by code-read, not automated test |

### DOC-05 — Renomear/reclassificar

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| DOC-05.1 edição válida persiste nome/modalidade/categoria | valores gravados, refletidos | `actions.test.ts:193-218` — exact `updated.name`/`updated.modality` checked | ✅ PASS |
| DOC-05.2 nome vazio/>120 rejeitado, nada persiste | erro exibido, sem persistência | `validation.test.ts` boundary tests (shared `validateName`); action calls it as authority | ✅ PASS |

### DOC-06 — Categorias planas

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| DOC-06.1 criar categoria válida/inédita disponível para atribuição | persistida com `tenant_id` | `mutations.test.ts:187-196` — `result.category.tenantId === tenantAId` | ✅ PASS |
| DOC-06.2 nome duplicado (case-insensitive) rejeitado | erro de duplicidade, nada persiste | `mutations.test.ts:198-221` — exact + case-variant duplicate both rejected | ✅ PASS |
| DOC-06.3 excluir categoria → docs viram "Sem categoria" | `categoryId: null`, nenhum doc excluído | `mutations.test.ts:254-281` — `reread.categoryId` is `null` after category delete | ✅ PASS |
| DOC-06.4 tenants diferentes criam categoria de mesmo nome | ambas aceitas | `mutations.test.ts:223-234` + `seed.test.ts:140-163` (seed itself repeats a name across tenants) | ✅ PASS |

### DOC-07 — Isolamento transversal

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| Leituras isoladas por tenant | resultados disjuntos tenant A/B | `documents.test.ts:29-61,126-133,159-174` | ✅ PASS |
| Escritas isoladas por tenant (update/delete de outro tenant = no-op) | `null`/`false`, doc inalterado | `mutations.test.ts:126-167` (`updateDocument`/`deleteDocument` cross-tenant no-op), `mutations.test.ts:236-252` (category cross-tenant no-op) | ✅ PASS |
| Actions nunca usam `tenantId` do payload | tenant sempre do cookie | `actions.test.ts:106-133,236-259` — payload with a foreign `tenantId` cast in, proven ignored | ✅ PASS |

**Status**: ✅ All ACs have evidence. 22/31 criterion rows are direct PASS with a spec-matching assertion; 9 are flagged ⚠️ (7 "verified by smoke/code-read, not automated test" — consistent with the Test Coverage Matrix's documented decision to skip UI-layer tests this lote: CONF-01.3, CONF-01.6, CONF-04.2, CONF-04.3's UI branch, DOC-01.5, DOC-04.1, DOC-04.3; 2 genuine spec-precision gaps — CONF-01.5 and DOC-02.4 — where the spec's outcome is structurally guaranteed by the code's shape but has no dedicated assertion that would catch a future regression).

---

## Discrimination Sensor

All mutations applied to the real tracked files, run against the affected test file, confirmed killed, then reverted with `git checkout --` (tree confirmed clean via `git status` after each). No scratch/worktree copy was needed since each mutation targeted a single already-tracked file and revert-by-checkout is equivalent and lower-risk here.

| Mutation | File:line | Description | Killed? |
| -------- | --------- | ------------ | ------- |
| 1 | `src/server/data/index.ts:267` | `updateDocument` WHERE clause: removed `eq(documents.tenantId, tenantId)`, kept only `eq(documents.id, documentId)` (tenant-scoping flip) | ✅ Killed — `mutations.test.ts` "updateDocument com tenantId incompatível é no-op" failed (returned the mutated row instead of `null`) |
| 2 | `src/server/validation.ts:35` | `validateName` boundary: `trimmed.length > MAX_NAME_LENGTH` → `>=` (off-by-one at 120) | ✅ Killed — `validation.test.ts` "aceita exatamente 120 caracteres" failed |
| 3 | `src/server/validation.ts:64` | `validateFileSize` boundary: `size > BigInt(MAX_FILE_SIZE_BYTES)` → `>=` (off-by-one at 10MB) | ✅ Killed — `validation.test.ts` "aceita exatamente 10MB" and the bigint-boundary variant both failed |

**Sensor depth**: lightweight (standard-risk feature, 3 mutations)
**Result**: 3/3 killed — PASS ✅

---

## Manual Smoke Verification

- `npm run build` → compiled successfully, `/configuracoes` and `/documentos` listed as dynamic (`ƒ`) routes.
- `npm run start` (after killing a stray process on :3000) → `curl /configuracoes` → HTTP 200, body contains the seeded tenant name "Imobiliária Vale do Uberaba", the settings form, and "Ver todos".
- `curl /documentos` → HTTP 200, body contains "Novo documento", "Gerenciar categorias", "Tabela de Preços", "Sem categoria".
- `curl "/documentos?modalidade=novo"` → only the "novo" seed document present (DOC-01.2 behaviorally confirmed).
- `curl "/documentos?q=zzznaoexistequalquercoisa"` → "Nenhum resultado encontrado" + "Limpar filtros" (distinct from the no-documents empty state — DOC-01.5 behaviorally confirmed).
- Astryx self-check: `grep` for `<div`, `<span`, `style={{`, hardcoded hex/`[Npx]` Tailwind arbitrary values, and imported `.css`/`@apply` across all new page/component files (`configuracoes/page.tsx`, `documentos/page.tsx`, `settings-form.tsx`, all of `src/components/documents/*.tsx`, `nav-link.tsx`) — zero matches. Self-check claim holds.

---

## Investigated Concern: upload-dialog inline category resolution by name

**Question posed**: `createDocumentCategoryAction` (`src/server/actions/documents.ts:116-131`) returns only `{ ok: true }` on success (no created record/id), so `upload-dialog.tsx:93-100` resolves the just-created category by matching `category.name.toLowerCase() === pendingCategoryName.toLowerCase()` against the `categories` prop after a `router.refresh()`. Does this risk assigning the wrong category?

**Finding**: Not a wrong-category-assignment risk. Category names are unique per tenant, case-insensitively, enforced by both the DB unique index (`document_categories_tenant_id_lower_name_idx`, `src/db/schema.ts:138-144`) and `createDocumentCategory`'s translation of the constraint violation into a domain error (so a name collision within the same tenant never reaches "success" in the first place — the second `createDocumentCategoryAction` call would fail with the duplicate-name error, confirmed by `mutations.test.ts:198-221` and `actions.test.ts:284-297`). `categories` is always tenant-scoped (`getDocumentCategories(tenantId)`), so there is no cross-tenant match possible either. Given uniqueness, `.find()` can match at most one row.

**However, a real (lower-severity) race exists**: `router.refresh()` (`upload-dialog.tsx:209`) is fire-and-forget — it does not return a promise the code awaits, and the "Enviar" button is not disabled while the refresh is in flight. If the user clicks "Criar" then immediately clicks "Enviar" before the RSC refresh completes and the `categories` prop updates, `resolvedCategoryId` still evaluates to `null` (no match found yet), and the document is created with `categoryId: null` ("Sem categoria") even though the user just created and intended to use that category. This is a UX/data-completeness bug, not an isolation or wrong-assignment bug — the failure mode is "silently uncategorized," never "assigned to the wrong category." Rated **Minor** (UX gap under a narrow timing window, no data-integrity or cross-tenant consequence); listed as a gap below for completeness, not a blocker.

---

## NavLink client-wrapper fix (commit `31d1fae`)

Spot-checked `src/components/shared/nav-link.tsx`. The stated bug — passing an Astryx `Link`'s `as={NextLink}` directly from an RSC page fails in production because a function reference can't cross the server→client serialization boundary — is a real, well-known Next.js RSC constraint (functions are not serializable props). The fix correctly moves the `as={NextLink}` composition inside a `"use client"` boundary (`nav-link.tsx:1,19-21`), so by the time `as` is applied, the component is already client-side and no function crosses the RSC boundary. Confirmed via `npm run build && npm run start` smoke test above — both `/configuracoes` (uses `NavLink` at `configuracoes/page.tsx:61,69`) and `/documentos` (uses it at `documentos/page.tsx:76`) render and respond 200 in production mode. This is not a case of papering over a different bug — the root cause and fix are aligned.

---

## Code Quality

| Principle        | Status |
| ---------------- | ------ |
| Minimum code     | ✅ — no speculative abstractions (e.g. no zod added, matching design.md's explicit decision) |
| Surgical changes | ✅ — diff is scoped to the 22 files the design called for; no unrelated files touched |
| No scope creep   | ✅ |
| Matches patterns | ✅ — write layer follows the same `tenant_id`-in-`WHERE` convention as Phase 1's read layer; actions never import `src/db` directly (verified: `grep` for direct db imports in `src/server/actions/*.ts` and all new components returns nothing) |
| Spec-anchored outcome check (asserted values match spec) | ✅ — see per-AC table above |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ — DAL/actions have happy+invalid+cross-tenant+not-found cases per function |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — every test file's `it()` names cite the relevant AC/requirement or a documented edge case |
| Documented guidelines followed | `AGENTS.md`/`CLAUDE.md` (Astryx no-`<div>` rule) — confirmed via self-check; `coding-principles.md` — confirmed (no scope creep, no unused abstractions) |

**Additional finding (Test Integrity)**: `src/server/__tests__/actions.test.ts`'s `updateTenantSettingsAction` tests (lines 64-133) issue a "revert to original" cleanup call at the end of two tests but never assert its result. Combined with a pre-existing (out-of-diff, Phase 1) latent defect — `getTenants()` (`src/server/data/index.ts:30-32`) has no `ORDER BY`, and `getActiveTenantId()`'s cookie-absent fallback resolves to `tenants[0]` from a fresh call to it — this is reproducibly non-deterministic once any row has been `UPDATE`d (Postgres does not guarantee row order for an unordered scan after a tuple is rewritten). Reproduced empirically: running `npx vitest run src/server/__tests__/actions.test.ts` alone, immediately after `npm run db:seed`, left the `tenants` table permanently corrupted (both seeded tenant names replaced by leftover test values — verified via a direct DB query) even though all 15 tests in the file reported passing. See **Gap 1** below. Root cause is pre-existing Phase 1 code (`getTenants`, unchanged by this diff), so it doesn't invalidate this lote's AC coverage (all DAL-level tests use exact-tenant-id lookups, unaffected by row order) — but the new test file's unasserted cleanup is what let the corruption go unnoticed, and any manual/interactive verification run after the test suite starts from silently-wrong fixture data unless re-seeded.

---

## Edge Cases

- [x] Cookie de tenant aponta para tenant inexistente → fallback (Phase 1, preserved; not touched by this diff)
- [x] Banco indisponível → `error.tsx` do grupo `(crm)` (Phase 1, preserved; not touched by this diff)
- [x] Duas abas editando mesmas configurações → last-write-wins (assumption logged in spec.md; no dedicated test required per that assumption)
- [x] Documento excluído em uma aba, editado em outra → `updateDocumentAction`/`updateDocument` return "não encontrado", no new record created — `actions.test.ts:220-227`, `mutations.test.ts:118-124`
- [x] Seed re-executado → estado canônico — `seed.test.ts:133-138` (idempotência, IDs e contagens idênticos)

---

## Gate Check

- **Gate command**: `npm run lint && npx vitest run --no-file-parallelism && npm run build` (used `--no-file-parallelism` per the pre-existing flakiness note below; `npm run db:seed` run before each full suite run per the Full-gate instructions)
- **Result**: lint clean (0 errors/warnings), 94 passed / 0 failed / 0 skipped, build compiled successfully (all routes, including `/configuracoes` and `/documentos` as dynamic routes)
- **Test count before feature** (Phase 1 baseline): 27
- **Test count after Phase 1 of this feature (T1-T6)**: 94 (confirmed — matches implementers' claim)
- **Test count after Phase 2 (T7-T11, UI only)**: 94 (unchanged, matches the Test Coverage Matrix's documented decision to skip UI-layer tests this lote)
- **Delta**: +67 new tests, 0 removed
- **Skipped tests**: none
- **Failures**: none

**Known pre-existing flakiness (non-blocking, out of this feature's scope)**: `npx vitest run` (default, file-parallel) can intermittently throw spurious FK-violation-style errors because multiple test files hit the same live Neon Postgres DB in parallel with no `fileParallelism` guard in `vitest.config.ts`. `--no-file-parallelism` avoids this and was used for all gate runs above. This is unrelated to the tenant-ordering bug found below (that one reproduces even with `--no-file-parallelism`, i.e., fully serial execution) and unrelated to this feature's code — it's a `vitest.config.ts` gap that predates this diff.

---

## Fix Plans (if issues found)

### Fix 1 (Major): `getTenants()` has no `ORDER BY`, making cookie-absent tenant resolution non-deterministic and reproducibly corrupting shared fixture data

- **Root cause**: `getTenants()` (`src/server/data/index.ts:30-32`, pre-existing Phase 1 code, unchanged by this diff) does `db.select().from(tenants)` with no `ORDER BY`. `getActiveTenantId()` (`src/server/tenant.ts:24-37`, also Phase 1) falls back to `tenants[0]` when no cookie is present. Once any row in `tenants` has been `UPDATE`d, Postgres does not guarantee an unordered scan returns rows in the same order as before — a subsequent `getTenants()` call inside `getActiveTenantId()` can silently resolve to a *different* tenant than a test (or a real cookie-less session) believes is "active." Reproduced empirically: `npm run db:seed` → `npx vitest run src/server/__tests__/actions.test.ts --no-file-parallelism` alone → all 15 tests pass, but the `tenants` table ends up with both seeded tenant names replaced by leftover test values ("Nome Via Action" / "Tentativa Cross-Tenant"), confirmed via a direct DB query immediately after.
- **In-scope vs out-of-scope**: The `getTenants()`/`getActiveTenantId()` functions themselves predate this diff (Phase 1) and are out of this lote's authorship. What IS in scope: `src/server/__tests__/actions.test.ts` (new this lote) exercises this fallback path heavily (via a `next/headers` mock that always returns no cookie) and its cleanup calls at the end of 2 tests (lines ~81-86, ~128-132) are not asserted, so the silent misdirection goes unnoticed by the test suite itself.
- **Impact**: (a) Every full gate run leaves the seeded `tenants` fixture corrupted for any subsequent manual/interactive check unless re-seeded (confirmed — this Verifier's own smoke test initially showed the corrupted names before a deliberate re-seed). (b) In production, if a browser session never receives the `crivo_tenant` cookie (e.g., first-ever visit, cookie cleared) and any tenant row is ever updated by anyone, the "active tenant" resolved by `getActiveTenantId()` for that session could silently shift to a different tenant on a later request — a genuine (if narrow, single-piloto-scale) cross-tenant risk for the exact mechanism CONF-01/03 depend on ("valores do tenant ativo").
- **Fix task**: Add a deterministic `orderBy` to `getTenants()` (e.g. `.orderBy(tenants.createdAt)` or `.orderBy(tenants.id)`) — a one-line, low-risk change to Phase 1 code. Separately, in `actions.test.ts`, either assert the revert calls' results or restructure cleanup to `try/finally` with an assertion, so a silent revert failure fails the test loudly instead of corrupting shared fixture data unnoticed.
- **Priority**: Major (real, reproduced correctness/data-integrity bug with a production-relevant path; not a blocker for this lote's own AC coverage since all DAL-level isolation tests use exact tenant IDs, but must not be left unaddressed).

### Fix 2 (Minor): upload-dialog can silently drop the just-created category under a fast-click race

- **Root cause**: `upload-dialog.tsx:187-210` calls `router.refresh()` (fire-and-forget, not awaited) after creating a category, then relies on the next render's `categories` prop to resolve `resolvedCategoryId` by name match (`upload-dialog.tsx:93-100`). The "Enviar" button is not disabled during this window.
- **Impact**: If the user clicks "Criar" then "Enviar" faster than the RSC refresh completes, the document is created with `categoryId: null` instead of the just-created category — a silent divergence from user intent, not a cross-tenant or wrong-category assignment (category-name uniqueness per tenant rules that out).
- **Fix task**: Disable "Enviar" (or the whole form) while `pendingCategoryName` is set and no matching category has resolved yet, or have `createDocumentCategoryAction` return the created category's `id` directly (avoiding the name-matching indirection entirely).
- **Priority**: Minor.

### Fix 3 (Spec-precision gap, no fix required): CONF-01.5 and DOC-02.4 lack a dedicated assertion

- Both are structurally guaranteed by the code's shape (settings updates never touch `documents`; document insert is a single atomic statement) but have no test that would catch a future regression breaking that structural guarantee (e.g., someone later adding a "cascade" side effect to `updateTenantSettings`, or a multi-statement insert). Not a current defect — flagged for awareness only, not a blocking gap.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | ---------------- | ----------- |
| CONF-01 | Implementing | ✅ Verified |
| CONF-02 | Implementing | ✅ Verified |
| CONF-03 | Implementing | ✅ Verified (UI-reflex verified by smoke, not automated test) |
| CONF-04 | Implementing | ✅ Verified |
| DOC-01 | Implementing | ✅ Verified |
| DOC-02 | Implementing | ✅ Verified |
| DOC-03 | Implementing | ✅ Verified |
| DOC-04 | Implementing | ✅ Verified |
| DOC-05 | Implementing | ✅ Verified |
| DOC-06 | Implementing | ✅ Verified |
| DOC-07 | Implementing | ✅ Verified |

(`spec.md`'s own traceability table still reads "Implementing" — that file is not edited by this report; the table above is this validation's authoritative status update.)

---

## Summary

**Overall**: ⚠️ Issues (feature meets its ACs and passes the gate; one Major and one Minor gap found beyond the assigned scope, neither blocking this lote's specific acceptance criteria, but Fix 1 in particular should not be deferred indefinitely)

**Spec-anchored check**: 22/31 criterion rows PASS with a direct spec-matching assertion; 9 flagged (7 "verified by smoke/code-read, consistent with the matrix's documented no-UI-tests decision"; 2 genuine spec-precision gaps — CONF-01.5, DOC-02.4)
**Sensor**: 3/3 mutations killed
**Gate**: 94 passed, 0 failed, 0 skipped; lint clean; build clean; smoke 200/200 on both routes with real seeded content

**What works**: All P1/P2 stories (CONF-01..04, DOC-01..07) have grounded evidence — either a `file:line` assertion matching the spec-defined outcome, or a reproduced smoke-test observation for the UI-only behaviors this lote's Test Coverage Matrix explicitly chose not to unit-test. Astryx self-check (no raw `<div>`/`style={{}}`/hardcoded hex-px) holds across every new component. Import convention (actions/components never touch `src/db` directly) holds. The `nav-link.tsx` production fix is real and correctly targeted.

**Issues found**:
1. (Major, pre-existing/out-of-diff root cause, new-code trigger) `getTenants()` missing `ORDER BY` + unasserted test cleanup in `actions.test.ts` → reproducible corruption of the shared `tenants` fixture after every gate run, and a latent cross-tenant risk in the cookie-absent fallback path. Fix: add `orderBy` to `getTenants()`; assert cleanup results in `actions.test.ts`.
2. (Minor) Upload dialog's inline-category-creation can silently leave a document uncategorized under a fast-click race (not a wrong-category/cross-tenant issue). Fix: disable submit during the pending-category window, or have the create-category action return the new id directly.

**Next steps**: Route Fix 1 and Fix 2 as fix tasks per the skill's fix→re-verify loop (both are additive, low-risk, single-function changes — well within a 1-iteration fix). Neither blocks this lote's own AC coverage, which is otherwise fully evidenced.

---

## Re-Verification (fix→re-verify iteration 1)

**Date**: 2026-08-02
**Diff range checked**: `afda03b..HEAD` (2 commits: `ba650f4`, `2e00165`)
**Verifier**: independent sub-agent (fresh pass, author ≠ verifier)

### Scope discipline check

`git diff afda03b..HEAD --stat` shows exactly the 4 files expected and no others:

```
src/components/documents/upload-dialog.tsx  | 18 ++++++++++++++++++
src/server/__tests__/actions.test.ts        |  6 ++++--
src/server/data/__tests__/isolation.test.ts |  6 ++++++
src/server/data/index.ts                    |  4 ++--
4 files changed, 30 insertions(+), 4 deletions(-)
```

No unrelated files touched — scope matches the two Fix Plans exactly.

### Fix 1 (Major — `getTenants()` non-determinism) — CONFIRMED FIXED

**Root-cause match**: `git show ba650f4` confirms the diff matches Fix Plan 1's prescribed fix precisely:
- `src/server/data/index.ts:31` — `getTenants()` now reads `db.select().from(tenants).orderBy(asc(tenants.createdAt), asc(tenants.id))`, replacing the unordered `db.select().from(tenants)`. `asc`/`createdAt` imports added correctly (`drizzle-orm`'s `asc`, and `tenants.createdAt` exists in schema at `src/db/schema.ts:47`).
- `src/server/__tests__/actions.test.ts` — both previously-unasserted "revert to original" cleanup calls (lines ~79-86 and ~126-133 in the prior diff) now capture `revertResult` and assert `expect(revertResult.ok).toBe(true)`.
- `src/server/data/__tests__/isolation.test.ts` — new test added: "getTenants retorna sempre a mesma ordem entre chamadas sucessivas" — calls `getTenants()` twice and asserts `second.map(t => t.id)).toEqual(first.map(t => t.id))`.

This is the exact root-cause fix prescribed (deterministic `orderBy`, not a workaround) — addresses both the data-corruption symptom and the underlying non-deterministic-scan cause.

**Repro-confirmation (primary acceptance test)**:
1. `npm run db:seed` — canonical seed loaded.
2. `npx vitest run src/server/__tests__/actions.test.ts --no-file-parallelism` (the exact original repro, run alone) — **15/15 passed**.
3. Direct DB query of the `tenants` table immediately after (via a one-off `tsx` script using the app's own `db`/`schema` modules, deleted after use) returned:
   ```json
   [
     { "id": "c4252d4c-...", "name": "Imobiliária Vale do Uberaba", "createdAt": "2026-08-02T06:12:48.151Z" },
     { "id": "7c6882c6-...", "name": "Triângulo Imóveis", "createdAt": "2026-08-02T06:12:48.151Z" }
   ]
   ```
   Both names match `src/db/seed.ts:133,159` exactly (`"Imobiliária Vale do Uberaba"`, `"Triângulo Imóveis"`) — **no corruption**, unlike the prior run which left `"Nome Via Action"` / `"Tentativa Cross-Tenant"` behind. The previously-reproducible data-corruption failure mode is gone.

**Verdict**: ✅ Confirmed fixed. Deterministic ordering + asserted cleanup + new regression test together close both the symptom and the root cause.

### Fix 2 (Minor — upload-dialog category race) — CONFIRMED FIXED (by code trace)

**Root-cause match**: `git show 2e00165` confirms `src/components/documents/upload-dialog.tsx` adds:
```ts
const isPendingCategoryUnresolved =
  pendingCategoryName !== null &&
  !categories.some(
    (category) => category.name.toLowerCase() === pendingCategoryName.toLowerCase()
  );
```
wired to the "Enviar" button via `isDisabled={isPendingCategoryUnresolved}` and a `tooltip` explaining the wait, at `upload-dialog.tsx:354-359`.

**Code trace** (full file re-read, `upload-dialog.tsx:67-369`):
- `handleCreateCategory` (line 199-222): on success, sets `pendingCategoryName` to the newly created name and fires `router.refresh()` (not awaited) — unchanged from before.
- `resolvedCategoryId` (line 93-100): still resolves via name-match against `categories`; while the refresh is in flight and `categories` hasn't yet been updated with the new row, this still evaluates to `null` for the pending category — exactly the originally-identified race window.
- **New**: `isPendingCategoryUnresolved` (line 108-112) is `true` in precisely that same window (`pendingCategoryName` set, no matching entry yet in `categories`) and becomes `false` the instant `categories` (post-refresh) contains a case-insensitive name match — the same condition that flips `resolvedCategoryId` from `null` to the real id. The two derivations share the identical matching predicate, so they transition in lockstep: `isPendingCategoryUnresolved` cannot be `false` while `resolvedCategoryId` is incorrectly `null` for a pending category.
- The "Enviar" `Button` (`@astryxdesign/core/Button`) accepts `isDisabled: boolean` and `tooltip: string` as documented props (confirmed via `npx astryx component Button`), so the wiring is a supported, non-hacky use of the component API — no raw DOM/style workaround.
- Escape hatches checked: if the user instead picks a different category from the `Selector` (`onChange` at line 289-292), `setCategoryId` is set and `setPendingCategoryName(null)` clears the pending flag immediately, so `isPendingCategoryUnresolved` becomes `false` and the explicit choice is not blocked. Canceling category creation (line 318-326) never sets `pendingCategoryName`, so it never triggers the disabled state. No path was found where "Enviar" is clickable while `resolvedCategoryId` would incorrectly be `null` for a category the user just created.

**Verdict**: ✅ Confirmed fixed by logical trace — consistent with the lote's Test Coverage Matrix decision to verify UI-only behavior by code-read rather than an automated test (same standard applied to the rest of this lote's UI ACs, e.g. CONF-01.3, DOC-04.1).

### Full gate (re-run)

- **Gate command**: `npm run db:seed && npm run lint && npx vitest run --no-file-parallelism && npm run build` (each step run and confirmed individually; DB re-seeded again as the final step after all checks)
- **Lint**: clean, 0 errors/warnings
- **Tests**: **95 passed / 0 failed / 0 skipped** across 7 test files (94 prior + 1 new determinism test in `isolation.test.ts`) — matches expected count exactly
- **Build**: compiled successfully; `/configuracoes` and `/documentos` still listed as dynamic (`ƒ`) routes alongside the rest of the route table
- **DB state**: re-seeded to canonical state as the final step (both tenant names verified back to seed values)

### Regression check

`git diff afda03b..HEAD --stat` (above) confirms only the 4 files named in the fix commits changed — no incidental edits to any other file. Read both full commit diffs (`git show ba650f4`, `git show 2e00165`) line-by-line; every hunk in both commits maps directly to one of the two stated fixes, with no unrelated changes riding along.

### Updated Requirement Traceability

| Requirement | Status |
| ----------- | ------ |
| CONF-01 (incl. cookie-absent active-tenant resolution) | ✅ Verified — deterministic fallback now guaranteed by `getTenants()` ordering |
| All other requirements | ✅ Verified (unchanged from original report — no regressions found) |

### Updated Summary

**Overall**: ✅ Ready (both gaps from the prior validation pass are resolved; gate is fully green; no regressions introduced by the fixes)

**Fix 1 (Major)**: Confirmed fixed — deterministic `orderBy`, asserted test cleanup, new regression test; original repro (`npm run db:seed` → `actions.test.ts` alone) now leaves the seeded tenant names uncorrupted, confirmed via direct DB query.
**Fix 2 (Minor)**: Confirmed fixed by code trace — "Enviar" is provably disabled for the entire window in which `resolvedCategoryId` would incorrectly resolve to `null` for a just-created category.
**Gate**: 95 passed, 0 failed, 0 skipped; lint clean; build clean.
**Scope**: Diff strictly limited to the 4 files named in the two fix commits — no scope creep, no regressions.

**Next steps**: None — lote-2-configuracoes-documentos is fully verified with both fix-plan items closed. No further fix→re-verify iterations needed.
