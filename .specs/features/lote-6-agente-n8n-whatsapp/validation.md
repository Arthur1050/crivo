# Lote 6 — Agente n8n + WhatsApp · Validation

**Date**: 2026-08-09
**Spec**: `.specs/features/lote-6-agente-n8n-whatsapp/spec.md`
**Diff range**: `09d3a10..d15cdd3` (19 commits, HEAD = `d15cdd3`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Preamble — AD-015 read and applied

AD-015 (`.specs/STATE.md`) records the user's 2026-08-09 decision to defer the full scripted
conversational smoke (3 real WhatsApp conversations with screenshots + Calendar event) to a
future lot. This is treated throughout this report as **deliberately reduced scope**, not a
quality failure — it does not by itself lower the verdict. AGT-04, AGT-05, and the end-to-end
outcome of LGPD-03 are expected to be Gap/deferred, and this report checks only that `spec.md`
describes that honestly (neither inflated nor hidden) — see "Requirement Traceability
Cross-Check" below.

---

## Task Completion

All 13 tasks (T1–T13) marked ✅ Done in `tasks.md`. Spot-checked against `git log`: all 19
commits in the diff range exist and match the task/commit-message table, including the 6
post-close fix commits (`30d2542`…`006e789`) folded into T13's honest closure. No task marked
partial or blocked.

---

## Spec-Anchored Acceptance Criteria

Only the P1/P2 criteria with citable evidence are tabulated per-AC below; criteria already
marked Gap-deferred by AD-015 are listed with the confirmation that no evidence exists for them
(as expected), not re-litigated as failures.

| Criterion (WHEN X THEN Y) | Spec-defined outcome | Evidence | Result |
| --- | --- | --- | --- |
| AGT-01 AC1: webhook verify (`hub.challenge`) | Meta marks webhook verified | `n8n/README.md` §2 (WhatsApp Trigger self-verifies) + real webhook active (`crivo-agente-principal.active=true`, confirmed via `get_workflow_details`) | ✅ PASS |
| AGT-01 AC2: `messages` event → lead+message via contract | `POST /leads` (`externalId=wa_id`) then `POST /leads/{id}/messages` (`externalId=messageId`, `sender=lead`) | exec 404 (`get_execution`, `includeData:true`) — `HTTP: POST /leads/{id}/messages (lead)` returns `{externalId:"wamid...", sender:"lead", content:"Não tenho", sentAt:"2026-08-09T02:50:46.000Z"}`; real webhook execution, not a fixture | ✅ PASS |
| AGT-01 AC3: reentrega idempotente, 200 sem duplicar | Retry ends without error, no duplicate | `n8n/src/__tests__/normalize-event.test.ts` (unit) + idempotency contract proven exhaustively at the CRM layer in lote-5 (INT-01); exec 66 (MCP) shows the gate/routing layer processing a repeated buffer without erroring — task's own caveat that DB-level non-duplication needs a production run is accurate, not overclaimed | ✅ PASS (layered) |
| AGT-01 AC4: `phone_number_id` desconhecido → descarte silencioso | No CRM call, no error | exec 54 confirmed via `get_execution(includeData:true)`: `Data Table: lookup tenant_config` returns `[[]]` (empty), `lastNodeExecuted` stops there — **no HTTP node appears in `runData`**, confirming the CRM was never called | ✅ PASS |
| AGT-01 AC5: resposta do agente registrada (`sender=agente`) | Agent reply also posted to `/messages` | exec 404: `HTTP: POST /leads/{id}/messages (agente)` returns `{sender:"agente", content:"Oi! Sou o Lucas, assistente virtual da Triângulo Imóveis...", externalId:"wamid...", sentAt:...}` — real, not pinned | ✅ PASS — **but see Finding F1**: the citation `exec 379` used in `spec.md`'s traceability row for this AC does not exist in the instance (checked across all 5 workflows). The AC itself is still proven by exec 404, independently confirmed by this Verifier. |
| AGT-02 AC2–4: modalidade/PATCH parcial/nunca repergunta | Upsert só chaves recebidas; próxima pergunta só mira faltantes | `n8n/src/__tests__/prompt.test.ts` (missing-field logic, 7/7 pass incl. `chainedOperation=false` edge case) + `n8n/src/__tests__/validate-llm.test.ts` (partial `campos` upsert) | ✅ PASS (unit-level, as `spec.md` itself flags — no live multi-turn) |
| AGT-02 AC5 / AGT-08 AC5: nunca nega ser IA | Fixed transparency instruction present | `n8n/src/__tests__/prompt.test.ts:14-19` content assertion on exact substring; exec 404 shows real persona reply ("Sou o Lucas, assistente virtual...") consistent with the instruction | ✅ PASS |
| AGT-02 AC6: debounce agrupa mensagens em rajada | Single response per burst | exec 404 shows `Aguardar 10s (debounce)` + `Sou a execução mais recente?` nodes in the real pipeline; behavior pinned/tested in workflow structure | ✅ PASS (structural) |
| AGT-04 (Calendar+Meet), AGT-05 (escalonamento) | Real event/outcome in Calendar/Kanban | No execution — real or simulated — of the complete `agendar`/`escalar` routes exists in this session's evidence. `spec.md` marks both **❌ Gap — deferido (AD-015)** | ✅ Matches AD-015 — correctly NOT marked Verified |
| P1 Agendamento AC2 payload | Single PATCH with `meetingAt`+`executiveSummary`+`status=qualificado_agendado` | `n8n/generated/principal.ts:1181-1186` (`patchScheduled` node) — `jsonBody` literally contains all 3 keys in one request | ✅ PASS (payload/conjunction rule — structural, no live execution) |
| P1 Escalonamento AC1 payload | Single PATCH with `status=escalado_humano`+`escalationReason`+`executiveSummary` | `n8n/generated/principal.ts:1312-1314` — `jsonBody: {status:'escalado_humano', escalationReason: $json.motivoEscalonamento, executiveSummary: ...}` | ✅ PASS (payload/conjunction rule — structural) |
| AGT-05 AC2: 48h → escalar motivo "ausência de resposta" | Exact string persisted | `n8n/generated/scheduler.ts:630` — `escalationReason: 'ausência de resposta'` literal; exec 61 confirms the PATCH executes with `status:"escalado_humano"` for the qualifying row (pinned test data, request body confirmed from source, not echoed by the mock response) | ✅ PASS — resolves the `⚠️` the author's own T11 note flagged for this Verifier to check |
| AGT-06: lembrete respeita janela 24h + opt-out excluído | Reminder sent in-window; opted-out never sent | exec 61: `WhatsApp: lembrete (texto livre)` sent for the qualifying row; `Filter: exclui encerradas` structurally removes `fase:"encerrada"` rows from both the reengagement and escalation scans before any send node is reached | ✅ PASS (structural discriminator, real execution) |
| AGT-07 AC1: 409 em PATCH não derruba execução | Conversation continues | `onError: "continueRegularOutput"` present on all 3 status-changing PATCH nodes (`patchFields`, `patchScheduled`, `escalar` — confirmed via grep, 3/3) | ✅ PASS (structural — no real 409 exercised this session, `spec.md` says so honestly) |
| AGT-07 AC2: retry ≥2 com backoff | `retryOnFail`, `maxTries≥2` | `grep -c "retryOnFail: true" n8n/generated/principal.ts` → 9 nodes, all `maxTries:3, waitBetweenTries:2000` | ✅ PASS |
| AGT-07 AC3: Error Trigger → e-mail | Notifies with execution id | exec 71 + exec 73: real organic Meta Graph API 400 (`phoneNumberId` inválido) triggered `crivo-agente-erros` in production; `Avisar erro por e-mail` node succeeded, Gmail message id `19fd58d9f10cee38` — **exact match to `spec.md`'s citation, independently confirmed** | ✅ PASS |
| AGT-09: workflow-as-code, generated==instância | 3 workflows in repo == published | `get_workflow_details` × 3: `crivo-agente-principal` 57 nodes/`updatedAt` 2026-08-09T02:25 (matches `006e789`'s timestamp), `crivo-agente-scheduler` 26 nodes, `crivo-agente-erros` 2 nodes — node counts and checkpoint node names (`Code: dados validados (agendar/escalar/atualizar_campos)`) match `n8n/generated/*.ts` verbatim | ✅ PASS |
| INT-09: `GET /api/v1/settings` shape+auth+isolamento | 200 shape, 401, 405, null fallback | `src/server/integration/__tests__/settings.test.ts`, `src/server/integration/__tests__/routes/settings-get.test.ts` (9 tests, mutation-confirmed below) + `SwaggerParser.validate()` (part of the 535-test gate) + exec 404 shows `HTTP: GET /settings` called for real in production | ✅ PASS |
| CONF-05: horário comercial configurável, chave ausente não toca | Persist+validate+null-fallback | `src/server/data/__tests__/tenant-settings.test.ts` (12 tests, mutation-confirmed below) | ✅ PASS |
| LGPD-03 AC1: SAIR → opt-out+confirmação única | `POST /opt-out`, 1 confirmation | exec 57: gate routes to `opt-out`, `HTTP: POST /leads/{id}/opt-out` succeeds (`optedOutAt` set), `Code: finalizar opt-out` produces the single-confirmation text — **but the final `WhatsApp: enviar resposta` node itself errored** ("Node does not have any credentials set" — this was a pre-T12 manual test, before WhatsApp send credentials existed). `spec.md`'s own characterization ("evidência em camadas... sem um SAIR real enviado") is accurate to what this Verifier found, not inflated | ⚠️ PASS as characterized — `spec.md` correctly does NOT claim more than this |
| LGPD-03 AC2/AC3: opt-out bloqueia envio proativo/retomada | Never sent, never resumed | `n8n/src/__tests__/gate.test.ts` precedence tests (`optedOutAt` beats everything, 3/3) + exec 61 structural exclusion filter | ✅ PASS |

**Status**: ✅ All in-scope ACs covered with real evidence (unit + confirmed MCP executions).
1 genuine evidence-citation problem found (Finding F1, below) — does not invalidate the
underlying AC, which is independently proven by other evidence this Verifier gathered directly.

---

## Finding F1 — non-existent execution citation (real, not a project decision)

`spec.md`'s Requirement Traceability row for **AGT-01** cites: *"AC5 (registro da resposta)
corrigido e validado (exec 379)"*.

**Checked**: `get_execution` for id `379` against all 5 workflows visible in the n8n instance
(`crivo-agente-principal`, `crivo-agente-scheduler`, `crivo-agente-erros`, and the two unrelated
`tosta.log` workflows) — all return `"Execution '379' not found"`. A `search_executions` sweep
of the full time window surrounding the neighboring IDs (367→408) shows id 379 was never
allocated to any workflow in this instance; it does not appear to have existed and been pruned
— the surrounding sequence is dense and continuous.

**Assessment**: this is a genuine citation error, not a fabricated *outcome* — the claim itself
("AC5 corrigido e validado") is true and independently reproducible: this Verifier confirmed it
directly via **exec 404** (`HTTP: POST /leads/{id}/messages (agente)` succeeding with correct
`content`/`sender`/`externalId` in a real webhook execution, consistent with the fix in commit
`7041a78`). The likely explanation is a transcription slip during the live debugging session
(AD-015 documents this session ran long, with multiple credential/webhook fire-fights) — not
evidence tampering; the fix itself is real and well-documented in the commit message with the
correct execution (364, for the *before* state) cited accurately.

**Does not change the verdict**: AGT-01 remains ✅ Verified because exec 404 substantiates AC5
independently. Recorded as a lesson (below) so future sessions verify execution IDs before
citing them, not after.

---

## n8n Execution Evidence — Confirmed vs. Claimed

| Execution cited | Workflow | Confirmed exists? | What it actually shows |
| --- | --- | --- | --- |
| exec 404 | `crivo-agente-principal` | ✅ Yes (`mode:webhook`, real) | Full real round-trip: lead message received → gate routed `conversa` → Gemini → agent reply sent via WhatsApp → registered in CRM with correct content/sender. Persona "Lucas, assistente virtual da Triângulo Imóveis" confirmed live. |
| exec 66 | `crivo-agente-principal` | ✅ Yes (`mode:manual`) | Buffer/gate processed a repeated message id without erroring; routed `somente-registrar` (this particular run landed on `escalado_humano` status from prior test state, not a fresh opt-out check) — confirms gate-layer tolerance of a repeat id, not DB-level dedup (task's own caveat is accurate) |
| exec 54 | `crivo-agente-principal` | ✅ Yes (`mode:manual`) | `phone_number_id` unmapped → `tenant_config` lookup returns empty → execution stops there, zero CRM calls in `runData`. Confirms AGT-01 AC4 exactly. |
| exec 57 | `crivo-agente-principal` | ✅ Yes (`mode:manual`, `status:error`) | Opt-out CRM-side logic (gate routing, `POST /opt-out`, confirmation text) all succeeded; **final WhatsApp send node errored** on missing credentials (pre-dates T12 credential setup). `spec.md`'s layered/non-full-success characterization matches exactly — not overclaimed. |
| exec 379 | — | ❌ **Not found in any of the 5 workflows in this instance** | See Finding F1. |
| exec 61 | `crivo-agente-scheduler` | ✅ Yes (`mode:manual`) | 3 scans in one run: reminder sent for a due, non-opted-out lead (`route:"texto-livre"`); reengagement marked `reengaged:true` for one qualifying lead while the `fase:"encerrada"` lead was excluded by `Filter: exclui encerradas` in both the reengagement and escalation scans; 48h-silent lead PATCHed to `escalado_humano`. Exact `escalationReason` string confirmed from source (`n8n/generated/scheduler.ts:630`), not from the (pinned) response echo. |
| exec 71 | `crivo-agente-erros` | ✅ Yes (`mode:error`, real) | Organic Meta Graph API 400 (`phoneNumberId` "109876543210001" invalid) during a real scheduler run (parent exec 70) → error workflow fired → Gmail send succeeded, message id `19fd58d9f10cee38` — **matches `spec.md`'s citation exactly**. |
| exec 73 | `crivo-agente-erros` | ✅ Yes (`mode:error`, real) | Second organic error/e-mail from the same test-row cleanup window (not independently re-fetched in full detail; exec 71's confirmation is representative of the same mechanism and `spec.md` only claims the mechanism fired twice, which `search_executions` confirms by count). |

---

## Discrimination Sensor

Method: direct edits to the real files in `n8n/src/` and `src/server/`, targeted `vitest run` on
the affected test file, then reverted and `diff`-confirmed byte-identical to the pre-mutation
original before moving to the next mutation. No `git stash`/worktree was needed since each
mutation was single-file and reverted immediately; working tree confirmed clean (`git status
--short`) before and after the whole sensor pass.

**Tier: P0/critical (LGPD compliance + deterministic side-effect gating, AD-014)** — `n8n/src/gate.mjs` and `n8n/src/validate-llm.mjs`, 5 mutations each:

| # | File:line | Mutation | Killed? |
| - | --- | --- | --- |
| 1 | `gate.mjs:68` | `if (optedOutAt)` → `if (!optedOutAt)` | ✅ Killed (8 tests failed) |
| 2 | `gate.mjs:69` | opt-out route → `"conversa"` | ✅ Killed (2 tests failed) |
| 3 | `gate.mjs:70` | `status === "escalado_humano"` → `!==` | ✅ Killed (6 tests failed) |
| 4 | `gate.mjs:71` | `hasMedia && !text` → `hasMedia || !text` | ✅ Killed (1 test failed) |
| 5 | `gate.mjs:37` | `OPT_OUT_KEYWORDS.has(normalized)` → substring match (`.includes`) | ✅ Killed (1 test failed — "quero sair do apartamento" false positive) |
| 6 | `validate-llm.mjs:162` | Removed `ACAO_VALUES.has(raw.acao)` whitelist check | ✅ Killed (1 test failed) |
| 7 | `validate-llm.mjs:175` | Removed `CAMPOS_ALLOWED_KEYS.has(key)` whitelist check | ✅ Killed (1 test failed — wrong rejection reason, still rejected by the field validator's default case, but assertion caught the exact-reason mismatch) |
| 8 | `validate-llm.mjs:113` | Removed `isSlotWithinBusinessHours` check on `meetingAtProposto` | ✅ Killed (2 tests failed) |
| 9 | `validate-llm.mjs:181` | `raw.acao === "escalar"` gated with `false &&` (bypassed required-motivo check) | ✅ Killed (2 tests failed) |
| 10 | `validate-llm.mjs:94` | Removed `Number.isInteger(value) && value >= 0` on `budgetCents` | ✅ Killed (2 tests failed) |

**P0 result: 10/10 killed, 0 survived.**

**Tier: standard (1–3 mutations)** — remaining `n8n/src/` modules + CRM code touched by this feature:

| # | File:line | Mutation | Killed? |
| - | --- | --- | --- |
| 11 | `normalize-event.mjs:53` | `hasMedia = message.type !== "text"` → `=== "text"` | ✅ Killed (2 tests failed) |
| 12 | `normalize-event.mjs:33` | statuses-event guard returns `{}` instead of `null` | ✅ Killed (1 test failed) |
| 13 | `business-hours.mjs:107` | End-of-window `time < end` → `time <= end` (breaks documented exclusive-end boundary) | ✅ Killed (2 tests failed) |
| 14 | `business-hours.mjs:133` | `isWithin24h` boundary `diffMs < 24h` → `<=` | ✅ Killed (1 test failed) |
| 15 | `phone.mjs:77` | Mobile-prefix discriminator inverted (`!test` → `test`) | ✅ Killed (5 tests failed) |
| 16 | `prompt.mjs:42` | `isFieldFilled` truthiness rewrite (breaks `chainedOperation=false` "filled" case) | ✅ Killed (2 tests failed) |
| 17 | `src/server/integration/settings.ts:36` | `supportedModality: tenant.supportedModality` hardcoded to `"ambos"` | ✅ Killed (2 tests failed — breaks isolation assertion between the 2 tenant fixtures) |
| 18 | `src/server/data/index.ts:635-637` (CONF-05 DAL) | Unconditional write of `updates.meetingDays` (guard removed) | ⚠️ **Equivalent mutant** — 12/12 tests still passed. Root cause: Drizzle's `.set()` silently omits keys whose value is `undefined`, so removing the `!== undefined` guard has no observable effect when the key is simply absent from the input (the common case exercised by the test). Re-mutated to force an actually-different value (`null` instead of omission) on the same line — this **was** killed (1 test failed, `meetingDays` unexpectedly cleared to `null`). Not counted as a survived mutant: the first attempt didn't change behavior, so it isn't evidence of a weak test — the second, behavior-changing version confirms the guard's real effect (the write) IS covered. |

**Standard-tier result: 7/7 behavior-changing mutations killed** (18 total mutations killed
across both tiers; 1 no-op/equivalent mutant identified and replaced with a discriminating one,
which was also killed).

**Sensor depth**: P0-full (gate.mjs, validate-llm.mjs) + standard (5 other modules).
**Result**: 18/18 real mutations killed — **PASS ✅**

---

## Payload/Conjunction Rule

Applied to the two most sensitive side-effect payloads named in the brief:

- **`PATCH /leads/{id}` (agendamento)** — `n8n/generated/principal.ts:1181-1186`: single request
  body `{status:'qualificado_agendado', meetingAt: <meetingAtProposto>, executiveSummary: 'Reunião agendada via WhatsApp: ' + <resposta>}`. All 3 fields confirmed present in the same
  `jsonBody` expression — matches spec P1-Agendamento AC2 exactly (not just "a PATCH occurs").
- **`PATCH /leads/{id}` (escalonamento)** — `n8n/generated/principal.ts:1312-1314`: single
  request body `{status:'escalado_humano', escalationReason: $json.motivoEscalonamento,
  executiveSummary: 'Escalonado via WhatsApp: ' + $json.motivoEscalonamento}`. Matches spec
  P1-Escalonamento AC1 exactly.
- **`POST /leads/{id}/opt-out`** — `n8n/generated/principal.ts:527-539`, confirmed reachable
  only via the `opt-out` gate route, with no body beyond auth (contract requires none); exec 57
  confirms a real call succeeded and set `optedOutAt`.

No payload in either sensitive route was found to send fewer/extra fields than the spec
requires.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ — the 6-node `.first()`/checkpoint fix (`006e789`) adds exactly 3 checkpoint nodes, one per affected route, no broader refactor |
| Surgical changes | ✅ — `47458ab` (phone.mjs) is a new, isolated pure module; only the WhatsApp-send node's recipient expression was touched to use it |
| No scope creep | ✅ — spot-checked `006e789`, `7041a78`, `47458ab` diffs; each stays within its stated bug |
| Matches patterns | ✅ — checkpoint-node convention documented and reused identically across all 3 routes (`atualizar_campos`/`agendar`/`escalar`) |
| Would a senior engineer approve? | ✅ — the code comments in `006e789`/`7041a78`/`47458ab` cite the exact execution that proved the bug (364, 354) rather than asserting from theory; this is unusually well-evidenced n8n code |
| Tests map to ACs, non-shallow | ✅ — spot-checked `gate.test.ts`/`validate-llm.test.ts` line-by-line; every branch has a dedicated case, not a single smoke assertion |
| Spec-anchored outcome check | ✅ — see AC table above; assertions target exact strings/values (e.g. `escalationReason` literal, `content` field, `status` enum), not existence checks |
| Per-layer coverage (domain 1:1 ACs; routes happy+edge+error) | ✅ — `settings-get.test.ts` covers 200/401/405/isolation/null-fallback (5 of 5 states) |
| No unclaimed tests | ✅ — every test file read maps to an AGT-*/INT-09/CONF-05 requirement in its own header comment |
| Documented guidelines followed | `n8n/README.md` (runbook), `docs/integration/guia-integracao.md` — both followed; no CLAUDE.md/AGENTS.md test convention beyond "match the existing vitest suite" |

---

## Edge Cases (spec.md)

- [x] Eventos fora de ordem → `sentAt` do timestamp Meta: `normalize-event.mjs` extracts `sentAt` from the Meta timestamp, not arrival order — unit-tested
- [x] Mídia sem persistir, sem falhar: `gate.mjs` routes to `"midia"` (fixed reply, no LLM) — unit-tested; `normalizeEvent` always sets `hasMedia`/`text:""` for non-text messages
- [x] `statuses` descartado sem erro: `normalize-event.mjs` returns `null` — unit-tested and mutation-confirmed
- [x] Mesmo lead, 2 tenants → leads distintos: structural (API-key-scoped `externalId`), inherited from lote-5's exhaustively-tested multi-tenant isolation
- [x] Opt-out vence agendamento em andamento: `gate.mjs` precedence 1 (`optedOutAt`/opt-out text beats everything) — unit-tested
- [x] Cold start reconstrói via `POST /leads` idempotente: design-level, same contract path proven in lote-5 (INT-01)
- [ ] LLM output não-parseável → pergunta de esclarecimento, nada gravado: **not directly re-verified this session** — covered by `validate-llm.mjs`'s exhaustive rejection-path tests (any invalid `raw` returns `{ok:false}`, never partial data), but the *retry-once-then-clarify* orchestration is a workflow-level behavior not exercised by a real/MCP execution in evidence gathered here. Minor spec-precision note, not a blocker (structural code confirms fail-closed).

---

## Gate Check

- **Gate command**: `npx vitest run` + `npm run lint` + `npm run build`
- **Result**: vitest 535/535 passed, 0 failed, 0 skipped (43 test files); lint 0 errors, 2
  pre-existing warnings (`ifElse` unused in `n8n/generated/scheduler.ts` and
  `n8n/workflows/scheduler.ts` — matches T13's own note); build succeeded, 14 routes generated
  including `/api/v1/settings`
- **Test count before feature**: 401 (per `STATE.md`, confirmed at lote-5 close)
- **Test count after feature**: 535
- **Delta**: +134 net (matches the claimed 401→535, 0 removed/weakened — confirmed by reading
  every touched test file, no `.skip`/`.todo` found)
- **Skipped tests**: none
- **Failures**: none (single clean run this session; did not need the "run twice" contingency
  mentioned in the brief since no transient failures occurred)

---

## Fix Plans

No blocking issues found. One informational finding (F1, above) — no code/spec fix required
beyond noting it; the underlying claim is independently true.

---

## Requirement Traceability Cross-Check (spec.md vs. this Verifier's independent findings)

`spec.md`'s existing table (9 Verified, 1 Verified-partial-layer AGT-02, 1 Partial AGT-07, 2
Gap-deferred AGT-04/AGT-05, LGPD-03 layered/deferred-endpoint) was re-derived from scratch by
this Verifier, evidence-or-zero, without reading the author's conclusions first. **Independent
result matches exactly**, with one addition:

| Requirement | spec.md status | This Verifier's independent status | Agreement |
| --- | --- | --- | --- |
| AGT-01 | ✅ Verified | ✅ Verified (AC5 re-proven via exec 404, not exec 379 — F1) | ✅ Same conclusion, evidence chain corrected |
| AGT-02 | ⚠️ Verified-parcial | ⚠️ Same | ✅ |
| AGT-03 | ✅ Verified | ✅ Same | ✅ |
| AGT-04 | ❌ Gap-deferido | ❌ Same — no execution found anywhere | ✅ |
| AGT-05 | ❌ Gap-deferido | ❌ Same — no execution found anywhere | ✅ |
| AGT-06 | ✅ Verified (MCP) | ✅ Same | ✅ |
| AGT-07 | ⚠️ Parcial | ⚠️ Same, plus `escalationReason` exact-string check now closed out | ✅ (strengthened) |
| AGT-08 | ✅ Verified | ✅ Same | ✅ |
| AGT-09 | ✅ Verified | ✅ Same — node counts/timestamps cross-checked via MCP | ✅ |
| INT-09 | ✅ Verified | ✅ Same | ✅ |
| CONF-05 | ✅ Verified | ✅ Same | ✅ |
| LGPD-03 | ⚠️ layered/deferred | ⚠️ Same — exec 57's WhatsApp-send error confirmed as pre-credential, not a hidden failure | ✅ |

**No inflation found.** `spec.md`'s honesty claim holds: nothing is marked Verified beyond what
evidence supports, and the deferred items are exactly the ones AD-015 says should be deferred.

---

## Summary

**Overall**: ✅ **PASS**

**Spec-anchored check**: 21/21 in-scope criteria matched their spec-defined outcome with real
evidence (1 citation-accuracy finding, F1, not an outcome failure).
**Sensor**: 18/18 real mutations killed (10/10 P0, 7/7 standard, 1 equivalent mutant correctly
excluded and replaced).
**Gate**: 535 passed, 0 failed, 0 skipped; lint clean; build clean.

**What works**: Ingestion, gate/opt-out state machine, LLM-output validation (whitelist/enum/
business-hours), business-hours resolution, phone MSISDN normalization, INT-09/CONF-05 contract
extension, workflow-as-code sync (repo == instance), retry/backoff + 409 tolerance on CRM writes,
Error Trigger → Gmail (proven organically, twice), scheduler's structural opt-out exclusion. One
real production round-trip (exec 404) proves the full happy-path pipeline end-to-end for a single
turn, including the two same-session bug fixes (`.first()`/Switch reference bug, agent-message
registration bug).

**Issues found**:
1. **F1 (informational, not blocking)** — `spec.md`'s AGT-01 traceability row cites a
   non-existent `exec 379`. The claimed outcome is true and independently reproduced via exec
   404 in this report. Recommended fix (mechanical, not urgent): update the citation in
   `spec.md`'s Requirement Traceability row for AGT-01 from `exec 379` to `exec 404`.
2. Minor edge-case gap: the LLM-invalid-output retry-then-clarify *orchestration* (as opposed to
   the pure validation function, which is fully tested) has no execution-level evidence this
   session. Not blocking; `validate-llm.mjs`'s fail-closed behavior is exhaustively unit-tested.

**Next steps**: Optionally correct the `exec 379`→`exec 404` citation in `spec.md` (cosmetic,
no re-verification needed since the underlying claim already holds). No fix tasks required to
close this lot. The deferred conversational smoke (AGT-04/AGT-05/LGPD-03 end-to-end) remains
correctly scoped to a future lot per AD-015.
