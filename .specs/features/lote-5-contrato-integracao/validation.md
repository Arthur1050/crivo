# Lote 5 — Contrato de Integração CRM ↔ Agente Validation

**Date**: 2026-08-03
**Spec**: `.specs/features/lote-5-contrato-integracao/spec.md`
**Diff range**: `12501ac..692e2cb` (11 commits, T1–T11)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Commit    | Notes |
| ---- | ------- | --------- | ----- |
| T1   | ✅ Done | `31b9351` | Schema/seed verified in git log |
| T2   | ✅ Done | `f5e96b6` | |
| T3   | ✅ Done | `b9866ce` | |
| T4   | ✅ Done | `e2ca1d1` | |
| T5   | ✅ Done | `ceb6b13` | |
| T6   | ✅ Done | `d66c4eb` | |
| T7   | ✅ Done | `cbd3fab` | |
| T8   | ✅ Done | `1425da0` | |
| T9   | ✅ Done | `b5c8fa1` | SPEC_DEVIATION present and judged justified (see below) |
| T10  | ✅ Done | `1ceb615` | |
| T11  | ✅ Done | `692e2cb` | |

All 11 commit hashes confirmed to exist in `git log` (`git log -1 --oneline <hash>` for each). All tasks.md "Done when" checkboxes are marked `[x]`.

---

## Spec-Anchored Acceptance Criteria

### INT-01: Autenticação e isolamento por API key

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC1: sem header/chave inválida/revogada | `401` problem+json, sem tocar banco | `src/server/integration/__tests__/auth.test.ts:42,53,64` — `expect(result.status).toBe(401)` for each case | ✅ PASS |
| AC1 ("sem tocar o banco") | banco intocado | Not spy-asserted; structurally guaranteed — `auth.ts:24-36` returns before any `db` call when header/format invalid | ⚠️ Spec-precision gap (structural, not spy-verified) |
| AC2: chave válida resolve tenant, nunca aceita `tenant_id` de payload | `{tenantId}` correto; payload `tenant_id` ignorado | `auth.test.ts:79` — `expect(result.tenantId).toBe(tenant.id)`; `auth.test.ts:95-112` — POST body carries `tenant_id` of tenant B, asserts `result.tenantId` is tenant A's, not B's | ✅ PASS |
| AC3: recurso de outro tenant → 404, nunca 403 | `404` `recurso-nao-encontrado` | `routes/leads-patch.test.ts:179-185`, `routes/leads-opt-out.test.ts:132-140`, `routes/leads-messages-post.test.ts:163-168`, `src/server/data/__tests__/isolation.test.ts:128-130` (getLead DAL level, pre-existing) — all assert `404`/`null`, never `403` | ✅ PASS (also confirmed via mutation #1 — see Sensor) |

### INT-02: Entrega idempotente de leads

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC1: payload válido → cria lead `em_qualificacao`, 201 com id | `201`, `status: "em_qualificacao"` | `routes/leads-post.test.ts:65-79` — `expect(response.status).toBe(201)`, `expect(body.status).toBe("em_qualificacao")` | ✅ PASS |
| AC2: `externalId` repetido → 200 sem duplicar | `200`, mesmo `id`, 1 linha no banco | `routes/leads-post.test.ts:90-107` (sequential) and `:109-130` (concurrent `Promise.all`) — `expect(rows).toHaveLength(1)` | ✅ PASS |
| AC3: payload inválido → 400, nada gravado | `400` `payload-invalido` | `routes/leads-post.test.ts:132-151` — `expect(response.status).toBe(400)`; `expect(rows).toHaveLength(0)` | ✅ PASS |
| AC4: lead aparece no Kanban sem mudança de tela | visível via `getLeads` | `routes/leads-post.test.ts:81-88` — `getLeads(tenantId, {status:"em_qualificacao"})` contains new lead; `e2e-smoke.test.ts:101-105` | ✅ PASS |

### INT-03: Upsert de qualificação (campos)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC1: chave presente grava (`null` explícito limpa), ausente não toca (SPG-1) | discriminação 3-vias | `src/server/integration/__tests__/parsers.test.ts:85-113` (parser-level discriminant: ausente/`null`/valor); `routes/leads-patch.test.ts:194-209` (route-level: `null` limpa, ausente preserva) | ✅ PASS |

### INT-04: Máquina de estados + trava humana

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC2: transições permitidas aplicadas; escalar exige `escalationReason` | 200 nos 2 casos permitidos; escalar sem motivo → 409 | `leads.test.ts:64-90` (pairwise 3×3, 2 `allowed=true` cases assert `result.ok===true`); `leads.test.ts:92-102` (sem motivo → `motivo-escalonamento-obrigatorio`); `leads.test.ts:116-126` (com motivo → 200, persiste) | ✅ PASS |
| AC3: qualquer outra transição → 409 com `code` estável, nada gravado | `409` `transicao-invalida`, lead inalterado | `leads.test.ts:64-90` (7 dos 9 pares negados, cada um assertando `{ok:false, code:"transicao-invalida"}` + `unchanged!.status === from`) | ✅ PASS |
| AC4: humano já alterou status → status via API rejeitado (409); campos/mensagens continuam aceitos | `409` `lead-travado-por-humano`; PATCH só-campos → 200 | `leads.test.ts:128-141` (trava bloqueia status); `leads.test.ts:156-165` (só-campos aceito no mesmo lead travado); `routes/leads-patch.test.ts:150-175` (sequência completa do Independent Test, incl. passo 7 só-campos); `src/server/__tests__/actions.test.ts:252-269` (novo teste: Kanban grava `status_changed_by='humano'`, fundação da trava) | ✅ PASS (also confirmed via mutation #3 — see Sensor) |
| AC5: PATCH mistura válido+transição inválida → rejeita tudo, nada gravado (atomicidade) | 409, nenhum campo do payload persiste | `leads.test.ts:167-183` — `region`/`executiveSummary` enviados junto de uma transição inválida; assert `after!.region === before!.region` (nada gravado, nem os campos válidos) | ✅ PASS |

### INT-05: Ingestão de mensagens

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC1: mensagem válida → persiste (cria conversa na 1ª), 201 | `201`, conversa criada | `messages.test.ts:62-84`; `routes/leads-messages-post.test.ts:125-138` | ✅ PASS |
| AC2: `externalId` reentregue → 200 sem duplicar | `200`, mesmo `id`, 1 linha | `messages.test.ts:113-137` — `expect(second.created).toBe(false)`, `expect(rows).toHaveLength(1)`; `routes/leads-messages-post.test.ts:140-154`; concurrency: `messages.test.ts:233-254` | ✅ PASS (also confirmed via mutation #6 — see Sensor) |
| AC3: mensagens fora de ordem aceitas; thread ordenada por `sentAt` | ordem cronológica na leitura | `messages.test.ts:139-164` (later-arrives-first, thread sorted); `messages.test.ts:195-231` (Independent Test: 3 msgs, 1 dup, 1 out-of-order → thread of 2 in correct `sentAt` order) | ✅ PASS |
| AC4: mensagens aparecem em Chats sem mudança de tela | visível via `getConversations`/`getMessages` | `e2e-smoke.test.ts:160-168` (same data-access functions the RSC screens use); live-server screenshot documented in tasks.md T11 status | ✅ PASS |

### INT-06: Leitura de contexto do tenant

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC1: filtra por modalidade+`ambos`; shape completo, `content` placeholder/null | ids corretos; `content: null` | `context.test.ts:91-101` (novo→novo+ambos, usado→usado+ambos); `context.test.ts:103-113` (shape, `content` sempre null, categoria) | ✅ PASS |
| AC2: expirado excluído mesmo sem job já ter rodado | doc expirado nunca aparece | `context.test.ts:115-118` — asserted WITHOUT ever calling `expireDocuments()` in this test file, proving the read-time filter alone excludes it (LGPD-02 AC2 overlap) | ✅ PASS (also confirmed via mutation #5 on `expireDocuments`, but the read-path filter itself was not separately mutated — see Sensor notes) |
| AC3: `modality` omitida/inválida → 400 | `400` `payload-invalido` | `routes/context-get.test.ts:96-108` | ✅ PASS |

### LGPD-01: Opt-out via contrato

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC2: opt-out registra timestamp; idempotente (repetir preserva o original) | 2ª chamada devolve o MESMO timestamp, não um mais recente | `lgpd.test.ts:71-79` — `expect(second!.optedOutAt.getTime()).toBe(first!.optedOutAt.getTime())`; `routes/leads-opt-out.test.ts:105-123` (route level) | ✅ PASS — precisely targets timestamp preservation, not just "doesn't error" (confirmed via mutation #4 — see Sensor) |
| AC3: indicador visível no detalhe; campo na API | `optedOutAt` presente na serialização; UI mostra Token vermelho | `routes/leads-opt-out.test.ts:96-103` (API field); `src/components/pipeline/lead-detail-panel.tsx:102-107` (`{lead.optedOutAt && <Token label="Opt-out" color="red".../>}`) — no automated UI test (Test Coverage Matrix designates UI floor = screenshot-only, documented exception); live screenshot performed and documented in tasks.md T11 | ✅ PASS (UI evidence is code + documented screenshot, per project's own test-coverage floor for components) |
| AC4: contrato declara dever do consumidor de parar disparos | texto explícito no guia | `docs/integration/guia-integracao.md:64` — "É dever do consumidor... interromper todo disparo subsequente a um lead com opt-out registrado." | ✅ PASS |

### LGPD-02: TTL de documentos

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC1: job deleta `expiresAt<=now()`, conta por tenant, sem acesso cruzado | contagem exata por tenant; não-expirados/sem-expiração preservados | `lgpd.test.ts:97-175` — 5 docs across 2 tenants incl. boundary (`expiresAt === now`), null-expiry, future; asserts `deletedByTenant[tenantA]===2`, `deletedByTenant[tenantB]===1`, remaining ids explicitly checked; `routes/cron-expire-documents.test.ts:69-96` (401 without secret, nothing deleted; 200 with secret, only expired gone) | ✅ PASS (also confirmed via mutation #5 — see Sensor) |
| AC2: leitura de contexto exclui expirados mesmo sem job ter rodado | contexto filtra independentemente do job | `context.test.ts:115-118` (see INT-06 AC2 above — same evidence, job never invoked in this test file) | ✅ PASS |

### INT-07: Contrato documentado (OpenAPI + guia)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC1: OpenAPI 3.x cobrindo tudo, validável por lint sem erros | `SwaggerParser.validate()` passa | `openapi.test.ts:18-21` — `await SwaggerParser.validate(OPENAPI_PATH)` (real structural validation, not a file-exists check); `:23-32` (securityScheme bearer, global `security`); `:34-53` (all 5 paths + verbs present) | ✅ PASS |
| AC2: guia cobre auth, idempotência, transições+códigos, opt-out/TTL, procedimento de substituição | todos os blocos presentes | `docs/integration/guia-integracao.md` — read in full: §1 Auth/revogação, §2 Idempotência, §3 Máquina de estados+trava, §4 Opt-out, §5 TTL, §6 Limites, §7 Procedimento de substituição (all 7 sections present and substantive) | ✅ PASS |

### INT-08: Arquitetura desacoplada (handlers finos + camada de serviço)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | --------------------- | ------------------------ | ------ |
| AC3: route handlers são adaptadores finos; regras/persistência na camada de serviço | inspeção estrutural | Spot-checked `app/api/v1/leads/route.ts` (25-line handler: auth→body-size→parse→delegate→serialize, zero business rules), `app/api/v1/leads/[id]/route.ts` (34-line handler + 2 pure HTTP-status-mapping helpers, all state-machine/lock/atomicity logic lives in `src/server/integration/leads.ts::patchLead`), `app/api/v1/context/route.ts` (15-line handler) | ✅ PASS |

**Status**: ✅ 26/26 numbered ACs across all 10 requirement IDs matched their spec-defined outcome with direct evidence. 1 spec-precision note (INT-01 AC1's "sem tocar o banco" is structurally guaranteed, not spy-asserted — informational, not a functional gap).

---

## Discrimination Sensor

**Tier**: P0 / critical-path (auth + multi-tenant isolation + LGPD) → ≥5 mutations required per validate.md tiering table.

All mutations applied directly to the real tracked files in-place, run against the **full** `npx vitest run` suite (per tasks.md Gate Check Commands), then reverted via `git checkout -- <file>` before the next mutation. Final `git diff HEAD` = empty, confirmed after each mutation and again at the end.

| # | File:line | Description | Result |
| - | --------- | ------------ | ------ |
| 1 | `src/server/data/index.ts:154` (`getLead`) | Removed `eq(leads.tenantId, tenantId)` from the WHERE clause (cross-tenant read bypass) | ✅ Killed — `src/server/data/__tests__/isolation.test.ts:129` (`expect(result).toBeNull()`) fails immediately. (Note: my first pass ran only 3 targeted files and the mutant *appeared* to survive there, due to defense-in-depth in `updateLeadFromAgent`'s own tenant-scoped WHERE; re-running the full suite per the Gate Check Commands found the direct DAL-level kill in `isolation.test.ts`, a pre-existing test.) |
| 2 | `src/server/integration/leads.ts:115` (`patchLead`) | Changed `if (!allowedTargets.includes(dto.status))` to `if (false)` — disables all transition-table enforcement | ✅ Killed — 10 tests failed across `leads.test.ts` (pairwise transition table) and `routes/leads-patch.test.ts` (Independent Test sequence) |
| 3 | `src/server/integration/leads.ts:123` (`patchLead`) | Changed `if (lead.statusChangedBy === "humano")` to `if (false)` — disables human-lock | ✅ Killed — 2 tests failed: `leads.test.ts:137` and `routes/leads-patch.test.ts:166` (both assert `409 lead-travado-por-humano`) |
| 4 | `src/server/integration/lgpd.ts:24` (`optOutLead`) | Changed `sql\`coalesce(${leads.optedOutAt}, now())\`` to `sql\`now()\`` — breaks idempotency | ✅ Killed — 2 tests failed: `lgpd.test.ts:78` and `routes/leads-opt-out.test.ts:122`, both asserting the SECOND call's timestamp equals the FIRST's (precise value comparison, not just "no error") |
| 5 | `src/server/integration/lgpd.ts:49` (`expireDocuments`) | Changed `lte(documents.expiresAt, now)` to `gte(documents.expiresAt, now)` — deletes future docs, spares expired ones | ✅ Killed — 3 tests failed across `lgpd.test.ts` and `routes/cron-expire-documents.test.ts`, including the GET-verb SPEC_DEVIATION test |
| 6 | `src/server/data/index.ts:847` (`ingestAgentMessage`) | Removed `.onConflictDoNothing({...})` from the message insert | ✅ Killed — 4 tests failed; the underlying Postgres unique index (`messages_tenant_id_external_id_idx`) rejected the duplicate insert with a `23505` constraint violation (confirms unicity is genuinely DB-enforced, not just app-level), while the graceful-idempotent-200 behavior broke as expected |

**Sensor depth**: P0-full (6 mutations, exceeds the ≥5 minimum for this tier)
**Result**: 6/6 killed — PASS ✅ — no surviving mutants, no fix tasks required from the sensor.

**Real tree integrity**: confirmed clean after every mutation and at the end — `git status` shows only the pre-existing untracked `skills-lock.json`; `git diff HEAD` is empty; `git log -1 --oneline` = `692e2cb` on `main`.

**Operational note (disclosed for transparency)**: during baseline-count verification (not fault injection), an earlier attempt used a temporary `git worktree` with a Windows directory junction pointing at the real `node_modules`, to avoid a slow reinstall. A failed `git worktree remove --force` (path-length error) recursively deleted through that junction and removed `node_modules/.bin` and one package's `lib/` directory (`@apidevtools/swagger-parser`) from the **real** `node_modules` — a side effect of a Windows junction-following deletion, not of any fault injected into tracked/spec-relevant code. No tracked file was touched (confirmed via `git status`/`git diff` throughout). It was fully repaired via `npm install` (0 changes to `package.json`/`package-lock.json`) plus a targeted reinstall of the one incompletely-extracted package; the full gate (401 tests, lint, build) was re-verified clean afterward, and this method was not repeated (baseline verification was redone safely via a plain in-place `git checkout <old-commit>` / `git checkout main`, which never touches `node_modules` since it isn't git-tracked).

---

## Code Quality

| Principle        | Status | Notes |
| ----------------- | ------ | ----- |
| Minimum code     | ✅ | Handlers are thin adapters; business rules centralized once per concern (`TRANSITIONS`, `optOutLead`, `expireDocuments`) |
| Surgical changes | ✅ | `git diff --stat` shows only files anticipated by design.md/tasks.md; `updateLeadStatus` extended with a defaulted `actor` param, zero call-site breakage |
| No scope creep   | ✅ | Exactly 1 new devDependency (`@apidevtools/swagger-parser`), matching design.md's stated single new dep |
| Matches patterns | ✅ | New DAL functions follow existing tenant-scoped-WHERE convention; parsers follow `ValidationResult`-style pattern from `src/server/validation.ts`; tests follow existing "own tenant/data per file" isolation convention |
| Spec-anchored outcome check (asserted values match spec) | ✅ | See AC table above — assertions target exact status codes/codes/timestamps/ordering, not just "no error" |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ | Confirmed for all layers except 2 minor edge-case instances (see Edge Cases section) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ | Every test file's `it()` titles cite the requirement ID/AC or an Edge Case |
| Documented guidelines followed: [file(s) or "none — strong defaults applied"] | ✅ | `AGENTS.md`/`CLAUDE.md` (Astryx) — spot-checked `lead-detail-panel.tsx`: no raw `<div>`, uses `Token`/`Timestamp`/`HStack`/`VStack` components, `color="red"` via Astryx token, no `style={{}}` |

---

## Edge Cases

- [x] 404/405 on unknown routes/methods — tested across all 5 `/api/v1` route files + catch-all (`routes/leads-post.test.ts:165,175`, `leads-patch.test.ts:241`, `leads-opt-out.test.ts:147`, `context-get.test.ts:115`, `leads-messages-post.test.ts:218`)
- [x] 400 on invalid JSON body — tested for PATCH (`leads-patch.test.ts` via parser rejection path) and messages (`leads-messages-post.test.ts:186`); ⚠️ **not directly tested for `POST /api/v1/leads`** — see Fix Plan below (code path is identical/shared, verified correct by inspection)
- [x] 400 on negative budgetCents/non-ISO dates/bad enums — `parsers.test.ts` (budgetCents :157,183; dates :65,75,188; enums :127,134,254)
- [x] 413/400 oversized payload — tested for PATCH (`leads-patch.test.ts:222`) and messages (`leads-messages-post.test.ts:201`); ⚠️ **not directly tested for `POST /api/v1/leads`** — see Fix Plan below (identical `MAX_BODY_BYTES` check present in `app/api/v1/leads/route.ts:19-25`, verified correct by inspection)
- [x] concurrent duplicate `externalId` → exactly 1 row, DB-enforced — `routes/leads-post.test.ts:109-130` (leads), `messages.test.ts:233-254` (messages); confirmed genuinely DB-enforced (not just app-level) via mutation #6, which surfaced a real Postgres `23505` unique-violation when the app-level guard was removed
- [x] cron without correct secret → 401, nothing deleted — `routes/cron-expire-documents.test.ts:69-83`

---

## Gate Check

- **Gate command**: `npx vitest run` && `npm run lint` && `npm run build` (Build gate, per tasks.md Gate Check Commands)
- **Result**: 401 passed, 0 failed, 0 skipped; lint clean (no output); build succeeded, all 6 new routes listed in the route manifest (`/api/cron/expire-documents`, `/api/v1/[...unmatched]`, `/api/v1/context`, `/api/v1/leads`, `/api/v1/leads/[id]`, `/api/v1/leads/[id]/messages`, `/api/v1/leads/[id]/opt-out`)
- **Test count before feature**: 268 (verified by checking out `12501ac` in place and running `npx vitest run` — summary line read `251 passed | 17 skipped (268)`; the 1 failing/skipped-cascade file was `seed.test.ts`, an expected artifact of running pre-L5 seed code against the already-forward-migrated dev DB schema, not a real regression — confirmed by immediately checking back out to `main` and re-running the full suite clean)
- **Test count after feature**: 401
- **Delta**: +133 new tests, 0 removed, 0 weakened
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans (minor, non-blocking)

### Fix 1: Missing 413/invalid-JSON edge-case tests for `POST /api/v1/leads`

- **Root cause**: Test coverage gap, not a functional defect. `app/api/v1/leads/route.ts:18-32` implements the identical `MAX_BODY_BYTES` size check and `try/catch JSON.parse` pattern already proven correct and tested in `app/api/v1/leads/[id]/route.ts` (PATCH) and `app/api/v1/leads/[id]/messages/route.ts` (messages) — but `leads-post.test.ts` never exercises these two paths directly.
- **Fix task**: Add 2 tests to `src/server/integration/__tests__/routes/leads-post.test.ts`: (a) a body exceeding `MAX_BODY_BYTES` → expect `413 corpo-grande-demais`; (b) a malformed JSON body (raw non-JSON string) → expect `400 payload-invalido`. Mirror the existing patterns at `leads-patch.test.ts:222-233` and `leads-messages-post.test.ts:186-199`.
- **Priority**: Minor (code is verified correct by direct reading; this closes an evidence-or-zero gap, not a behavioral one).

---

## Requirement Traceability Update

Proposed update to `spec.md`'s Requirement Traceability table (orchestrator to apply):

| Requirement ID | Previous Status | New Status |
| --------------- | ---------------- | ----------- |
| INT-01 | Implementing (T1, T2, T4, T6) | ✅ Verified |
| INT-02 | Implementing (T1, T3, T4) | ✅ Verified |
| INT-03 | Implementing (T3, T5, T6) | ✅ Verified |
| INT-04 | Implementing (T5, T6) | ✅ Verified |
| INT-05 | Implementing (T1, T3, T7) | ✅ Verified |
| INT-06 | Implementing (T8) | ✅ Verified |
| INT-07 | Implementing (T10) | ✅ Verified |
| INT-08 | Implementing (T10; estrutural em T2–T9) | ✅ Verified |
| LGPD-01 | Implementing (T1, T9) | ✅ Verified |
| LGPD-02 | Implementing (T1, T8, T9) | ✅ Verified |

---

## SPEC_DEVIATION Verdict (independent judgment)

**Location**: `app/api/cron/expire-documents/route.ts:10-17` — marker present, well-documented.

**Claim**: design.md/tasks.md specified POST-only for the cron route; the implementation accepts both GET and POST because Vercel Cron invokes scheduled jobs via GET with an auto-injected `Authorization: Bearer $CRON_SECRET` header.

**Independent verification**: This matches Vercel's own documented Cron Jobs behavior — scheduled invocations are GET requests, and when `CRON_SECRET` is configured, Vercel automatically attaches it as a Bearer token on the triggered request. A POST-only handler would never actually fire under Vercel's real invocation mechanism, defeating the entire purpose of `vercel.json`'s `crons` entry (`app/api/cron/expire-documents/route.ts` is wired there and would silently never run LGPD-02's TTL enforcement in production).

**Security impact assessed**: Both `GET` and `POST` route to the exact same `handleExpireDocuments` function (`route.ts:32-33`), which performs the identical `CRON_SECRET` Bearer-token check before doing anything (`route.ts:20-26`). There is no auth-strength asymmetry between the two verbs — confirmed by test (`routes/cron-expire-documents.test.ts:69-83` for POST-without-secret, `:98-117` for GET-with-correct-secret) and by direct code reading (single shared function, no verb-specific branch in the auth path).

**Verdict**: **Justified**. The deviation is a correction toward the platform's actual contract (Vercel Cron's real invocation semantics), not a weakening of anything — the original POST-only design would have been a functional bug (the job would never run on a schedule). Security is unaffected since auth is verb-agnostic and identically enforced. No fix task needed.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 26/26 numbered ACs across 10 requirement IDs matched their spec-defined outcome with direct `file:line` evidence; 1 informational spec-precision note (INT-01 AC1's "sem tocar o banco" — structurally guaranteed, not spy-tested)

**Sensor**: 6/6 mutations killed (P0-full tier, exceeds ≥5 minimum) — no survivors

**Gate**: 401 passed / 0 failed; lint clean; build clean; baseline confirmed 268→401 (+133, 0 removed/weakened)

**SPEC_DEVIATION**: judged justified — corrects toward Vercel's actual Cron invocation contract (GET, not POST), auth strength unaffected (same secret check, both verbs)

**What works**: Full contract surface (auth/isolation, idempotent lead delivery, qualification upsert with SPG-1 discrimination, state machine with exhaustive pairwise transition coverage, human-lock, atomicity, idempotent+order-tolerant message ingestion, context reads with independent TTL filtering, LGPD opt-out idempotency and document TTL job, OpenAPI validated by `SwaggerParser.validate()`, integration guide covering all 7 required blocks, thin route handlers over a portable service layer) — all verified with precise, spec-matching assertions and confirmed to genuinely discriminate regressions via 6/6 killed mutations across the highest-risk areas (cross-tenant isolation, state-transition integrity, human-lock, opt-out idempotency, TTL correctness, message dedup/DB-enforced uniqueness).

**Issues found**: 1 minor test-coverage gap (413/invalid-JSON edge cases untested for `POST /api/v1/leads` specifically, though the identical code pattern is tested and proven correct on 2 sibling routes) — see Fix Plan 1. Non-blocking.

**Next steps**: Optionally schedule Fix 1 (2 small test additions) as a follow-up; not required before marking the feature done given the underlying code is verified correct and no behavioral defect exists.
