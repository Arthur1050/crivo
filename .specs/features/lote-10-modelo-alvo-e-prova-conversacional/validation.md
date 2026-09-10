# Lote 10 — Modelo alvo e prova conversacional: Validation

**Date**: 2026-09-09
**Spec**: `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/spec.md`
**Diff range**: `a019bad~1..HEAD` (37 commits, `a019bad`..`0dd1d7b`)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | Baseline: 1015/81 measured, generated/ diff zero (`evidencia.md` §T1) |
| T2 | ✅ Done | Found and resolved a logical divergence (§2.5) before proceeding — batch stopped, orchestrator decided, publish-and-reconcile |
| T3 | ✅ Done | `0f514dd` — model swapped, graph suite added |
| T4 | ✅ Done | `d43c904` — generated diff confined to `agentModel` block |
| T5 | ✅ Done | `b74f24c` — published, version `8f9f8418-…` |
| T6 | ✅ Done | `f9fb5c8` — bateria procedure |
| T7 | ✅ Done (3 attempts) | Two false starts (OpenAI quota exhausted, then dirty state + stale Calendar credential) correctly excluded from the 2-round budget per `bateria.md` §6.2; the valid round landed in `4928dce` |
| T8 | ✅ Done | `13ff745` — enum-refusal behavior observed 5×, agent corrected and continued |
| T9 | ✅ Done | Ambiguous first (`9951cec`), then final APROVADO (`ea6ae4f`) after a user-authorized, explicitly logged `SPEC_DEVIATION` (bateria ran on the smoke's real `waId` to remove an environment confound) |
| T10 | ✅ Done | `0975e16` — three scenarios, turns as intent, approval bar by outcome |
| T11 | ✅ Done | `13df19b` — three-target cleanup checklist |
| T12 | ✅ Done | `50b2fca` — preconditions confirmed, vitest freeze declared |
| T13 | ✅ Done (4 rounds) | Three false starts (dirty lead, scheduled-before-acceptance, wrong meeting-channel claim) all found and fixed in-phase; 4th round APROVADO — `4ec5ab3`, `b469316`, `f378d47`, `32236b5` |
| T14 | ✅ Done (3 rounds) | Two false starts (wrong broker name announced, repeated after a prompt-only fix) drove the boundary-level fix; 3rd round APROVADO — `15f8697`, `143f5d1` |
| T15 | ✅ Done (2 rounds) | 1st round exposed a real compliance hole (natural-language stop request not honored); fixed via `f80fa82` (SPEC_DEVIATION, gate.mjs untouched); 2nd round APROVADO |
| T16 | ✅ Done | `384dd09` — consolidated verdict, no fix task needed, vitest freeze lifted, 1076/82 measured |
| T17 | ✅ Done | `f3b1804` — confirmed already-satisfied by a pre-existing commit (`5a43b5b`), reconfirmed line-by-line |
| T18 | ✅ Done | `ecc5a6e` — lote-6c `validation.md` Finding 1 closed by documented resolution note |
| T19 | ✅ Done | `cebe22c` — README §4 corrected, incident preserved as history |
| T20 | ✅ Done | `4247ddc` — AD-026, AD-027 recorded; AD-015 `superseded by AD-027` |
| T21 | ✅ Done | `31a3ce3` — spec.md traceability closed for all 12 IDs |
| T22 | ✅ Done | `0391c85` — AGT-04/05/LGPD-03 updated in lote-6 spec.md |
| T23 | ✅ Done | `a39a422` — STATE.md Handoff updated |
| T24 | ✅ Done | `09935bf` — INDEX.md entry added (see Code Quality note below — status text not revisited after T25) |
| T25 | ✅ Done | `0dd1d7b` — MTN-01 registered as a named, permanent pendency (no path available; user confirmed `vale-uberaba` is fictitious) |

All 25 tasks complete. Two `SPEC_DEVIATION` markers were added during Execute (bateria target swap in T9/§12.1, opt-out natural-language guidance in T15/§16.4) — both explicitly logged, both user-authorized, neither touches `gate.mjs`.

---

## Spec-Anchored Acceptance Criteria

### P1: Modelo alvo em produção (MOD-01, MOD-02, MOD-03)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MOD-01 AC1: nó de modelo é `lmChatOpenAi` → `gpt-5.4-nano-2026-03-17`, cred `OpenAI account`, nenhum `lmChatGoogleGemini` | Exact type/version/model id/credential; zero Gemini nodes | `n8n/workflows/principal.ts:1273-1312` (source, confirmed by direct read); `n8n/workflows/__tests__/principal-modelo.test.ts:69-77` — `expect(modelo.type).toBe("@n8n/n8n-nodes-langchain.lmChatOpenAi")`, `expect(modelo.typeVersion).toBe(1.3)`, `expect(workflow.nodes.filter(n => n.type.includes("lmChatGoogleGemini"))).toEqual([])`; published-instance confirmation `n8n/smoke/evidencia.md:230-241` (§5.2, `get_workflow_details` after publish) | ✅ PASS |
| MOD-01 AC2: swap confined to one node — 5 tools, `gate.mjs`, memory unchanged | 5 named tools present; memory node type + `sessionKey` unchanged; total node/connection count unchanged from the pre-swap baseline (61/75) | `principal-modelo.test.ts:111-132` — tool-name loop, `memoria.parameters.sessionKey` exact-string match, `expect(workflow.nodes).toHaveLength(61)` / `expect(contarConexoes()).toBe(75)`; `gate.mjs` absent from `git diff --stat a019bad~1..HEAD` (confirmed directly — zero touches) | ✅ PASS |
| MOD-01 AC3/4 (bateria: 5 tools + enum-400 non-blocking) | Each tool ≥1 successful call with execution id; agent proceeds past `400 payload-invalido` | `evidencia.md:1059-1067` (§12.4, R1=false, execs `1960`/`1966`/`1970`/`1952`/`1956`); `evidencia.md:1076-1150` (§12.5, R2=false, 3 refusals observed with `code: payload-invalido`, agent corrected/continued in all cases) | ✅ PASS |
| MOD-01 AC5 (rollback on bateria failure) | If bateria fails, model reverts to Gemini before any smoke scenario | Not triggered — `evidencia.md:1150` §12.6 `R1=falso, R2=falso → APROVADO`; `principal.ts`/`generated/principal.ts` confirmed untouched by T7-T9 (`evidencia.md:1201-1210` §12.9) | ✅ PASS (N/A path correctly not taken) |
| MOD-01 AC6 (paridade publicado × generated antes da troca) | Node-by-node parity confirmed or divergence logged before any new publish | `evidencia.md:74-185` (§2.2-§2.7) — 61/61 nodes, 75/75 connections; one logical divergence found (§2.5, missing `retryOnFail`/`onError` on 3 nodes) and explicitly escalated to the orchestrator before proceeding, not silently published over | ✅ PASS |

### P1: Prova conversacional dos três desfechos (SMK-01..06)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| SMK-01: roteiro versionado, 3 cenários + turnos + estado final | `n8n/smoke/roteiro.md` exists, versioned | `n8n/smoke/roteiro.md:78,124,161` (§3/§4/§5 — one section per scenario, "turnos" as intent, estado final exigido) | ✅ PASS |
| SMK-02: qualificar→agendar → `status` no CRM + evento Meet | `status = qualificado_agendado` (roteiro corrects the draft-name `reuniao_agendada` from spec.md, per T10 note); Calendar event with Meet entry link | `evidencia.md:1290-1336` (§T13/§14.3) — lead `d0aee73c-…`, execs `2123,2128,2135,2142,2143`, `meetLink: https://meet.google.com/bsy-htxg-evt` (hangoutLink, entry link, not the event page) | ✅ PASS |
| SMK-03: escalar → `status = escalado_humano` + responsável, next message unanswered | Terminal status + assigned broker; following message logged with **no** agent response | `evidencia.md:1382-1417` (§T14/§15.3) — lead `3c9ce0fe-…`, execs `2190,2195,2200,2206`; exec `2206` shows `route: "somente-registrar"`, no `response_ai_agent` in metadata | ✅ PASS |
| SMK-04: opt-out → `optedOutAt` filled, session purged, silence after | Filled `optedOutAt`; `n8n_chat_histories` purged; no further message sent | `evidencia.md:1483-1512` (§T15/§16.3) — lead `81509a2c-…`, `optedOutAt: 2026-09-09T12:46:14.541Z`, purge node fired with `{success:true}` in exec `2239` (route `opt-out`), exec `2243` shows `somente-registrar`, silence | ✅ PASS |
| SMK-05: execution id + CRM screenshot per scenario, + Meet link for scenario 1 | Evidence trail per scenario | `evidencia.md` §14.3/§14.6, §15.3/§15.7, §16.3/§16.7 — screenshot descriptions + execution ids + cleanup checklist confirmations cited per scenario | ✅ PASS |
| SMK-06: evaluated by outcome, never style; style observed separately | Approval bar is final CRM state only | `evidencia.md:1573-1578` (§T16 header) explicit; style findings isolated in §14.5/§15.6/§16.6/§17.4, none affecting the verdict | ✅ PASS |
| SMK-06 (AC8, fix task on failure) | If a scenario's final state isn't reached, it's logged failed + a fix task opens before Verified | `evidencia.md:1588-1601` (§17.2) lists 6 failed rounds nominally, none reaching "Verified" prematurely; §17.5 confirms no scenario failed on the final round, so no fix task was required by construction — correctly not fabricated | ✅ PASS |

### P2: Rastreabilidade honesta (DOC-01, DOC-02)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DOC-01: VOZ-03 AC4 + Edge Cases declare silence as accepted behavior; Finding 1 closed | Text states silence explicitly, no fallback send built | `.specs/features/lote-6c-agente-ai-agent-memoria-tools/spec.md` VOZ-03 AC4 text confirmed (T17 note, already satisfied pre-lote-10 via `5a43b5b`); `.../validation.md:97` — Finding 1 "Resolution (2026-09-09, lote-10 T17/T18)" note appended, original text preserved, option (b) explicitly recorded as not chosen | ✅ PASS |
| DOC-01 AC2: no fallback send introduced | No code change | Confirmed by diff scope: `n8n/src/system-message.mjs` and `n8n/src/agendamento.mjs` diffs (read in full) contain only the Fase-5 persona/link fixes, no new send path added | ✅ PASS |
| DOC-02: README §4 documents the `VITEST`→`TEST_DATABASE_URL` guard | Guard documented, incident preserved as history, `db:seed` direct-run caveat kept | `n8n/README.md:133-148` — guard explained, "O que continua verdadeiro" section keeps the `db:seed` rotation caveat, original incident marked historical | ✅ PASS |

### P3: Multi-tenancy real (MTN-01)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MTN-01 AC3 (IF unavailable, named pendency, does not block AGT-04/05/LGPD-03) | Registered as a named, non-blocking pendency; AGT-04/05/LGPD-03 close regardless | `evidencia.md:1659-1698` (§T25/§18) — user directly stated (2026-09-09) no path exists to homologate the second number; `spec.md:177` traceability row states `❌ Not verified — sem caminho disponível` (not silently upgraded, not silently dropped); `.specs/features/lote-6-agente-n8n-whatsapp/spec.md:209-217` confirms AGT-04/AGT-05/LGPD-03 all `✅ Verified` independent of `vale-uberaba` | ✅ PASS (correct outcome for the IF-unavailable branch) |

**Status**: ✅ All 12 requirement IDs' acceptance criteria covered with `file:line` evidence. No spec-precision gaps found — every AC in this spec defines a precise, checkable outcome, and every one was checked against it.

---

## Discrimination Sensor

**Isolation**: temporary `git worktree add <scratch> HEAD` at a scratchpad path (never `git stash`); `node_modules` attached via a Windows directory junction, removed with `cmd /c rmdir` (junction-safe, does not recurse into target) before `git worktree remove --force`. Baseline `git status --porcelain` on the real tree recorded before any sensor work (`M n8n/generated/principal.ts`, `M n8n/workflows/principal.ts` — a pre-existing, unrelated uncommitted edit from another session, see Code Quality note) and re-confirmed byte-identical after teardown.

### Track A — `n8n/workflows/principal.ts` (graph, via `principal-modelo.test.ts`)

All 5 mutations named in the task brief were run — not capped at 3, since this is the headline discriminant for MOD-01.

| # | Mutation | Target | Killed? |
| - | -------- | ------ | ------- |
| 1 | `model.value` changed from `gpt-5.4-nano-2026-03-17` to `gpt-4o-mini` (line 1305), `cachedResultName` left unchanged | MOD-01 AC1 (exact model id) + `cachedResultName === value` invariant | ✅ Killed — 2 tests failed (`o modelo é o snapshot datado…`, `o rótulo exibido…`) |
| 2 | Reintroduced `lmChatGoogleGemini` as the model node's `type` (line 1274) | MOD-01 AC1 (no Gemini node survives) | ✅ Killed — `é lmChatOpenAi v1.3, e não sobrou nenhum nó Gemini no grafo` failed on the type assertion |
| 3 | Renamed the `agendar_reuniao` tool node to `agendar_reuniao_v2` (line 1232) | MOD-01 AC2 (5 tools present by name) | ✅ Killed — `as 5 tools do agente continuam presentes, pelo nome` failed |
| 4 | Memory `sessionKey` expression changed `tenantSlug` → `tenantId` (line 679) | MOD-01 AC2 (unchanged `sessionKey`) | ✅ Killed — `a memória continua memoryPostgresChat com a mesma sessionKey composta` failed |
| 5 | Removed `agendarReuniaoTool` from the `tools:` array wired into the AI Agent (line 1333) | MOD-01 AC2 (node/connection counts: 61/75) | ✅ Killed — both the tool-presence test and the `61 nós e 75 conexões` test failed (node count dropped to 60 — the SDK drops unreferenced nodes from `toJSON()`) |

### Track B — `n8n/src/agendamento.mjs` and `n8n/src/system-message.mjs` (the only automated net for the 11 real defects found in Fase 5)

Per the task's tiering guidance (standard feature, 1-3 mutations per file), 2 mutations run.

| # | File:line | Mutation | Targets | Killed? |
| - | --------- | -------- | ------- | ------- |
| 6 | `n8n/src/agendamento.mjs:139` | Reverted the fix: `meetLink: meetLink !== "" ? meetLink : null` → `meetLink: eventoCriado ? link : null` (regresses to serving the Calendar event-page link instead of the Meet entry link) | The `32236b5` `meetLink` fix (defect #5 in `evidencia.md` §17.3) | ✅ Killed — 3 tests failed in `agendamento.test.ts`: `not.toContain("calendar.google.com")`, and the `eventoCriado` without a `hangoutLink` case (`meetLink` expected `null`, got the page URL) |
| 7 | `n8n/src/system-message.mjs:283` | `firstTurn ? FIRST_TURN_INSTRUCTION : null` → `null` (drops the greeting instruction unconditionally) | The `4ec5ab3` first-turn greeting fix (defect #1 in `evidencia.md` §17.3) | ✅ Killed — 3 tests failed in `system-message.test.ts`, including `primeiro turno: proíbe abrir pedindo dado de cadastro` and the first-turn-with-`agentPresentationMessage` case |

**Sensor depth**: lightweight (7 total mutations: 5 required + 2 tiered), all behavior-level, targeting the highest-risk new/changed code.
**Result**: 7/7 killed — **PASS ✅**. No decorative test found in either the graph suite or the two `.mjs` test suites.

---

## Code Quality

| Principle | Status | Note |
| --- | --- | --- |
| Minimum code | ✅ | Model swap is exactly the `agentModel` block; the 11 Fase-5 fixes are each a narrowly-scoped prompt/tool-response edit tied to one observed defect, no speculative generalization |
| Surgical changes | ✅ | `git diff --stat` confirms the touched-file set matches the task brief exactly: `principal.ts`/`generated/principal.ts`, `tool-agendar-reuniao.ts`/generated, `system-message.mjs`, `agendamento.mjs`, their test files, plus documentation |
| No scope creep | ✅ | No new tool exposed, `gate.mjs` untouched (confirmed absent from the diff — zero touches across 37 commits), opt-out remains keyword-only at the gate level despite the natural-language guidance added in T15 |
| Matches patterns | ✅ | New test file follows the `tool-agendar-reuniao.test.ts` graph-testing precedent the task named; prompt instructions follow the existing `*_INSTRUCTION` constant + inline "ACHADO REAL" comment pattern already used elsewhere in the file |
| Spec-anchored outcome check (asserted values match spec) | ✅ | See Spec-Anchored ACs table above — every assertion checked targets the exact spec-defined value (model id, session key, CRM status enum, execution ids), not a loose existence check |
| Per-layer Coverage Expectation met | ✅ | Domain logic (`principal-modelo.test.ts`) has the required 1:1 invariant mapping (model identity + "nothing else changed"); the `n8n/src` layer test suites for the two files that changed real code cover the Fase-5 defects directly |
| Every test maps to a spec AC or a Done-when criterion | ✅ | `principal-modelo.test.ts`'s `escalar_para_humano` block maps to the `143f5d1` fix and is exercised as MOD-01 AC2 infrastructure (the tool's shape didn't change count-wise, but its response-shaping is fixed by this suite); the two `.mjs` suites map 1:1 to the 11 named defects in `evidencia.md` §17.3 |
| Documented project quality/testing guidelines followed | ✅ | `tasks.md`'s Test Coverage Matrix (graph testing via `toJSON()`, no test for the generated artifact, no test for real WhatsApp conversations) followed exactly — no attempt to fake-test the untestable layers |

**Foreign uncommitted edit (out of scope, left untouched)**: `git status --porcelain` on the real tree shows `M n8n/generated/principal.ts` and `M n8n/workflows/principal.ts` — a `retryOnFail`/`maxTries` indentation fix moving those fields from inside `parameters` to the node `config` level on `consultar_documentos`. This is **not** part of this feature's commits; `evidencia.md:1204-1206` (§T9, closing note) explicitly documents it as belonging to another session and states it deliberately does not enter T9's commit. It is in fact the exact fix for the bug this feature's own T5 discovered and deliberately deferred to backlog (§5.3). Confirmed via `git diff` before any sensor work, left byte-identical throughout verification, and not evaluated as part of this feature's scope.

**Minor finding (non-blocking)**: `.specs/features/INDEX.md:48` and `.specs/ROADMAP-POS-PILOTO.md:19-24` were written by T24, which runs *before* T25 in the phase order. Both still read "MTN-01 pendente de T25 condicional" / "⏳ Pending (após T25)" — phrasing that presumed T25 might still resolve MTN-01 conditionally. T25 has since concluded with a **permanent, structural** non-availability (not a still-open conditional), and no task in the plan revisits these two summary files after T25 to reflect that. The authoritative source — `spec.md`'s own traceability table (`MTN-01 | ❌ Not verified — sem caminho disponível`) — is correctly finalized and does not have this staleness; only the two roll-up documents lag. This does not affect any of the 12 requirement IDs' status and is not a spec AC. Recommend a trivial follow-up: update `INDEX.md`'s lote-10 row and the ROADMAP-POS-PILOTO.md L10 status line to state the T25 outcome definitively.

---

## Edge Cases

- [x] Bateria stops before publishing on credential/quota failure — not literally exercised (credential worked throughout), but the two blocked-bateria attempts (§T7 first two rounds) demonstrate the "stop, don't guess" discipline the edge case requires
- [x] `lmChatOpenAi` unsupported-parameter edge case — Design's knowledge-verification chain confirmed the real node schema via MCP before writing any parameter; no invented field shipped (`temperature` deliberately omitted)
- [x] Partial cleanup between scenarios blocks the next scenario — demonstrated for real, not hypothetically: T13's first round (`evidencia.md` §14.1) hit exactly this failure mode (dirty lead) and correctly did not proceed until a clean round was achieved
- [x] `maxIterations` overrun ends in silence, does not fail a scenario by itself — the bateria rounds that died in `Max iterations (8)` (§8, §9) were correctly read as environment artifacts, not model failures, consistent with DOC-01
- [x] `vitest run` freeze during Fase 5 — declared in `evidencia.md` §13.5, honored (no `vitest` gate between T12 and T16 per the task table), and the resumption at T16 measured the final 1076/82 cleanly

---

## Gate Check

- **Gate command**: `npx vitest run && npm run lint && npm run build`
- **Result**: `npx vitest run` → **1076 passed (1076), 82 test files passed (82), 0 failed**, exit 0. `npm run lint` → **0 errors, 3 warnings** (all 3 pre-existing: 2× unused `ifElse` in `scheduler.ts`/generated, 1× unused eslint-disable directive in an unrelated route-instrumentation test — none introduced by this feature). `npm run build` → completed (`next build` reached "Finalizing page optimization", full route table emitted, 21 routes, no build-blocking error; the `BetterAuthError`/base-URL warnings are expected local-env noise, not build failures).
- **Test count before feature**: 1015 passed, 81 files (T1 baseline, `evidencia.md` §1.1, freshly measured, not copied from docs)
- **Test count after feature**: 1076 passed, 82 files (this Verifier's own independent run, matching the author's T16 measurement in `evidencia.md:1649`)
- **Delta**: +61 tests, +1 file — monotonic, no silent deletions. Consistent with `tasks.md`'s Test Coverage Matrix: the bulk of this feature is evidence (real executions, real conversations) that cannot be unit-tested by construction; the +61 come from `principal-modelo.test.ts` (T3, 7 initial tests + 5 later `escalar_para_humano` tests) and the Fase-5 fix suites in `n8n/src/__tests__/system-message.test.ts` and `agendamento.test.ts`.
- **Skipped tests**: none
- **Failures**: none

---

## Requirement Traceability Update

The author already updated `spec.md`'s traceability table in T21 (`31a3ce3`) and this Verifier's independent re-derivation (Spec-Anchored ACs table above) confirms it — no status changes needed from this pass.

| Requirement | Author's status (T21) | Verifier's independent check |
| --- | --- | --- |
| MOD-01 | ✅ Verified | ✅ Confirmed — graph test + published-instance evidence |
| MOD-02 | ✅ Verified | ✅ Confirmed — R1/R2 both false, on real executions |
| MOD-03 | ✅ Verified | ✅ Confirmed — parity check + logged, escalated divergence |
| SMK-01 | ✅ Verified | ✅ Confirmed — roteiro.md structure matches requirement |
| SMK-02 | ✅ Verified | ✅ Confirmed — exec ids + CRM state + Meet link |
| SMK-03 | ✅ Verified | ✅ Confirmed — exec ids + no-response proof |
| SMK-04 | ✅ Verified | ✅ Confirmed — exec ids + fluxo-driven purge |
| SMK-05 | ✅ Verified | ✅ Confirmed — evidence trail present per scenario |
| SMK-06 | ✅ Verified | ✅ Confirmed — outcome-only bar, style isolated |
| DOC-01 | ✅ Verified | ✅ Confirmed — spec text + Finding 1 resolution note |
| DOC-02 | ✅ Verified | ✅ Confirmed — README §4 text |
| MTN-01 | ❌ Not verified (no path) | ✅ Confirmed correct — honestly represented, non-blocking |

**Coverage**: 12/12 mapped, 11 Verified + 1 honestly Not-verified-by-design. No status disagreement between author and Verifier.

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 12/12 requirement IDs matched their spec-defined outcome with `file:line` evidence. 0 spec-precision gaps.
**Sensor**: 7/7 mutations killed (5 required graph mutations + 2 tiered `.mjs` mutations). No decorative tests found.
**Gate**: 1076 passed, 0 failed, 82 files; lint 0 errors; build green.

**What works**: The model swap is exactly what MOD-01/02/03 required — one node, reversible, gated by a real (if messier-than-planned) bateria that correctly refused to reprove the model for two environment-caused false starts (OpenAI quota, stale Calendar OAuth token, a Meta allowlist confound) before landing a clean, unambiguous APROVADO. The conversational proof (SMK-02/03/04) is real: three WhatsApp conversations, real Calendar event, real CRM states, with execution ids for every turn — and it surfaced 11 real defects across Fase 5 that no unit test could have found (greeting missing, scheduling before acceptance, wrong meeting channel, wrong broker name leaking from a raw CRM payload, a real LGPD compliance hole in natural-language opt-out requests), every one fixed and re-verified in a subsequent clean round before the scenario was marked approved. `gate.mjs` and the AD-018 invariants were never touched, even when the opt-out fix was pulled forward from L13 — confirmed independently via a zero-hit diff scan, not just trusted from the author's claim. The two documentation-only P2 stories (DOC-01, DOC-02) closed cleanly with no code touched. MTN-01's non-verification is the textbook-correct outcome for its `IF` branch, not a swept-under-the-rug gap, and does not block AGT-04/AGT-05/LGPD-03.

**Issues found**: One non-blocking staleness — `INDEX.md`/`ROADMAP-POS-PILOTO.md` still phrase MTN-01 as pending T25's conditional outcome, written before T25 concluded with a permanent non-availability. Not a requirement-ID failure; a one-line follow-up doc fix would close it.

**Next steps**: None blocking. Optional: a small follow-up commit updating the two roll-up documents' MTN-01 phrasing to match `spec.md`'s finalized, permanent "Not verified — sem caminho disponível."
