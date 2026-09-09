# Lote 6c — AI Agent, memória persistente e tools determinísticas · Validation

**Date**: 2026-08-15
**Spec**: `.specs/features/lote-6c-agente-ai-agent-memoria-tools/spec.md`
**Diff range**: `a3cc1ea..f349d7f` (17 feature commits + `a640caf`, an orchestrator-authored infra fix to `scripts/n8n-inline.mjs`, load-bearing for T1/T2's `export const` modules)
**Verifier**: independent sub-agent (author ≠ verifier), fresh session, no inherited context from Execute

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T4 | ✅ Done | `phase.mjs`, `voice.mjs`, `session.mjs`, `system-message.mjs` — all present, tested, inlined verbatim into the live `principal` workflow (byte-for-byte match confirmed via `get_workflow_details`) |
| T5–T6 | ✅ Done | Postgres credential (`yyiKyt0KY8Q7TwND`, `db:"n8n"`) confirmed live; `conversa_estado` has `perguntadosJson`/`aberturasJson` (confirmed via live node schemas in T7/T10 output) |
| T7–T8 | ✅ Done | `crivo-tool-responder-lead` (`Li2hgCX943zKmDXf`) and `crivo-tool-agendar-reuniao` (`2qCs6rPzmeOqan65`) published, active, `errorWorkflow` linked to `73Yx70RMJrpLiYQn` |
| T9–T11 | ✅ Done | Old miolo fully removed (no LLM Chain node anywhere in the 52-node `principal` workflow); memory block + AI Agent with 5 tools live and wired |
| T12 | ✅ Done | `workflowInputs.schema` fix confirmed present on both `toolWorkflow` nodes in the **live** workflow; `n8n/generated/` regenerates byte-identical to disk |
| T13–T15 | ✅ Done | `validate-llm.mjs`(+39 tests)/`prompt.mjs`(+20)/`history.mjs`(+10) removed — exact match confirmed by counting `it(` in each file at the pre-removal commit |
| T16 | ✅ Done | Model is `models/gemini-3.5-flash` per SPEC_DEVIATION (judged justified — see below) |
| T17 | ✅ Done | AD-018/AD-019 recorded in STATE.md; spec.md/tasks.md traceability closed |

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero. Pure-JS layer cites `file:line`; workflow layer cites the **live, currently-published** node (re-fetched via `get_workflow_details` this session, not read from repo source) plus the MCP execution IDs the author recorded in `tasks.md`/`n8n/README.md`.

### AGN-01/02/03/04/05 — Miolo no AI Agent

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | --------------------- | -------- | ------ |
| AGN-01 (P1.1): turno roda em `agent`, sem LLM Chain | Nenhum nó Basic LLM Chain no caminho | Live `crivo-agente-principal` (`0B1nqjODu7xuYYKF`, 52 nodes): node `AI Agent` type `@n8n/n8n-nodes-langchain.agent`, `hasOutputParser:false`. Grep of the full node type list found zero `lmChatOpenAi`/`chainLlm`/`chainRetrievalQa` nodes. Executions `462`/`496` cited in tasks.md T12/T16 | ✅ PASS |
| AGN-02 (P1.2): exatamente 5 tools | `registrar_qualificacao`, `agendar_reuniao`, `escalar_para_humano`, `consultar_documentos`, `responder_lead` — nenhuma outra | Live `connections` block: exactly 5 `ai_tool` edges into `AI Agent`, matching those 5 names, no 6th. Also `n8n/src/__tests__/system-message.test.ts:144-156` asserts all 5 tool names appear in the catalog instruction | ✅ PASS |
| AGN-03 (P1.3): tool recusa sem efeito, devolve motivo nomeado | Recusa nomeada, sem side-effect | Live: `registrar_qualificacao`/`escalar_para_humano` have `options.response.response.neverError:true` (so CRM's `problem+json` `code` reaches the agent verbatim instead of a generic n8n error — confirmed by the author's live test in T11, corpo `{"region":"Uberaba"}`). `tool-responder-lead`'s `Code: aplicar barreiras de persona` (live, byte-identical to `voice.mjs`) returns `{accepted:false, reason:...}` **before** the WhatsApp send node — confirmed via the live connections graph (`Aceito pelas barreiras de persona?` gates the send branch) | ✅ PASS |
| AGN-04 (P1.4): 4ª chamada de `responder_lead` recusada | Recusa sem enviar | Live `tool-responder-lead` code: `turnCount = aberturas.filter(sentAt > lastInboundAt).length; if (turnCount >= 3) rejection = 'limite-mensagens-turno'` — 3 accepted (0,1,2) then the 4th call (turnCount=3) is rejected. Execution `407` (Batch 2, tasks.md T7) | ✅ PASS |
| AGN-05 (P1.7/8): opt-out fora do LLM; turno sem `responder_lead` não erra | Nenhuma tool de opt-out; silêncio aceito, sem erro | Live: the 5 `ai_tool` list has no opt-out tool. `Code: gate` (live, byte-identical to `gate.mjs`, 0 diff across the whole feature range) routes `optedOutAt`/`escalado_humano` to `somente-registrar` **before** reaching the AI Agent branch. `Code: finalizar turno do agente` (live) computes `turnoSemResposta = !calledResponder` from `intermediateSteps` and proceeds to `Data Table: limpar buffer` without throwing | ✅ PASS |

### MEM-01/02/03/04 — Memória persistente

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | --------------------- | -------- | ------ |
| MEM-01 (AC1/2/8): Postgres local, `customKey`, isolamento | `sessionKey = tenantSlug:waId`, banco local, nunca o do CRM | Live node `Postgres Chat Memory`: `sessionIdType:"customKey"`, `sessionKey:"={{ ...tenantSlug }}:{{ ...waId }}"`, `contextWindowLength:50`. Credential confirmed `current_database()="n8n"` (execution `396`, `n8n/README.md` §2.4) | ✅ PASS |
| MEM-02 (AC3/4): purga em gap>12h; sem teto de 20 | `isSessionExpired` gate>12h dispara delete; janela sem teto de 20 | `n8n/src/__tests__/session.test.ts:30-33` — exact-12h boundary discriminant (`false`); `:25-28` (>12h → `true`). Live: `Code: sessão expirada?` inlines `isSessionExpired` verbatim; `Sessão expirada (gap > 12h)?` IF routes to `Chat Memory Manager: purgar sessão expirada` (mode `delete`) | ✅ PASS |
| MEM-03 (AC5/6): semeadura em cold start pelo contrato | Memória vazia + histórico no CRM → `GET /leads/{id}/messages` semeia; falha segue vazio | `n8n/src/__tests__/session.test.ts:63-74` — 30-message discriminant (AD-019, proves no 20-cap survives). Live: `Memória da sessão está vazia?` (messagesCount===0) → `HTTP: GET /leads/{id}/messages (semeadura)` → `Code: selecionar mensagens de semeadura` (inlines `selectSeedMessages` verbatim) → `Loop` → `Chat Memory Manager: semear memória` (mode `insert`), converging via `Code: memória pronta` regardless of 0 or N seed messages | ✅ PASS |
| MEM-04 (AC7): purga no opt-out | Memória + `conversa_estado` purgados junto do registro de opt-out no CRM | Live: `Code: finalizar opt-out` → `Chat Memory Manager: purgar memória (opt-out)` (mode `delete`) → `Data Table: purgar qualificação e persona (opt-out)` (clears `perguntadosJson`/`aberturasJson`) — atomic, same branch as the CRM opt-out POST | ✅ PASS |

### QLF-01/02/03 — Qualificação enxuta

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | --------------------- | -------- | ------ |
| QLF-01 AC1/4/5: 3 obrigatórios / 5 oportunistas, nunca perguntados | Listas exatas, sem interseção | `n8n/src/__tests__/phase.test.ts:11-28` | ✅ PASS |
| QLF-01 AC6/AC7 (o defeito-alvo do lote): vazio não bloqueia `agendando` | 3 obrigatórios perguntados, valores nulos → `agendando` | `n8n/src/__tests__/phase.test.ts:81-84` — the exact discriminant, structurally guaranteed (function signature accepts only field names, never values). **Killed by sensor M1** (see below) | ✅ PASS |
| QLF-02 AC2/3/6: perguntado é permanente, marcado independente de resposta | Campo perguntado nunca mais é reperguntado, mesmo com "não sei" | Live: `Code: montar system message e marcar campo perguntado` computes `nextFieldToAsk` and writes it into `updatedPerguntados` **before** the agent runs, via `Data Table: marcar campo perguntado`. ⚠️ See spec-precision note below — "perguntado" here means "instructed to ask this turn," not "confirmed the agent actually asked." No deterministic mechanism inspects the agent's literal output text to confirm compliance. Documented by the author in T11's own notes, not silently omitted | ⚠️ Spec-precision gap (disclosed) |
| QLF-03 AC7/8: fase transiciona, system message muda | `agendando` sem menção a campo pendente; instrui propor horário | `n8n/src/__tests__/system-message.test.ts:71-101` (both directions, both phases) + `n8n/src/__tests__/phase.test.ts:57-63`. Live: `resolveConversationPhase`/`buildSystemMessage` inlined verbatim in `Code: montar system message e marcar campo perguntado` | ✅ PASS |

### VOZ-01/02/03 — Barreiras de persona

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | --------------------- | -------- | ------ |
| VOZ-01 AC1: abertura banida rejeitada | "Show. Qual seu orçamento?" → `abertura-proibida` | `n8n/src/__tests__/voice.test.ts:46-56`. **Killed by sensor M2**. Live execution `450` | ✅ PASS |
| VOZ-01 AC2: abertura repetida na sessão rejeitada | Coincide com abertura anterior → `abertura-repetida` | `n8n/src/__tests__/voice.test.ts:58-66` | ✅ PASS |
| VOZ-02 AC3 (discrimination-critical): promessa de capacidade rejeitada, sem regex guloso | "vou puxar aqui as opções" → rejeita; "vou anotar aqui" → NÃO rejeita | `n8n/src/__tests__/voice.test.ts:85-103` — both positive and negative cases present. **Killed by sensor M3** with the exact real-conversation phrase from the Independent Test in spec.md | ✅ PASS |
| VOZ-02 AC5: não escala por pedido de opções/fotos/preço | System message instrui a não escalar | `n8n/src/__tests__/system-message.test.ts:57-69` | ✅ PASS |
| VOZ-03 AC4: regenera com motivo, máx. 2 tentativas, depois cai no fallback de esclarecimento | Rejeição → regenera; 3ª rejeição → mensagem de esclarecimento ao lead | ❌ **GAP** — see "Findings beyond disclosed gaps" below. No counter caps *rejected* attempts in `tool-responder-lead` (only *accepted* sends are counted toward the 3-message cap); the only backstop is the AI Agent's `maxIterations:8`, and exhausting it routes to `turnoSemResposta` → **silence**, not an active "fallback de esclarecimento" message |
| VOZ-03 AC6 / AD-016: sem emoji, 1-3 msgs, nunca anuncia, nunca nega | Preservado literalmente | `n8n/src/__tests__/system-message.test.ts:41-55` (literal transparency text match) | ✅ PASS |

### CTX-03 — Documentos sob demanda

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | --------------------- | -------- | ------ |
| P2.1/P2.2: só sob demanda, nunca no system message | `GET /context` só quando chamada; nunca injetada de ofício | Live `consultar_documentos`: `GET /api/v1/context?modality=...`, `neverError:true`. `n8n/src/__tests__/system-message.test.ts:134-136` asserts absence of a documents-list marker in every system message | ✅ PASS |
| P2.3: falha degrada para lista vazia | Nunca derruba a execução | `neverError:true` confirmed live — a non-2xx response reaches the agent as tool "success" with the error body, never an n8n exception | ✅ PASS |

### OBS-01 — Observabilidade

| Criterion | Spec-defined outcome | Evidence | Result |
| --------- | --------------------- | -------- | ------ |
| P3.1: nome da tool + motivo da recusa nos dados da execução | Visível na execução, sem código adicional | Live: `AI Agent.options.returnIntermediateSteps:true` captures every tool call + its output (including `reason` fields) natively; each rejection Code node (`Code: recusa`, `Code: horario ocupado`, `Code: fora do horario comercial`) returns a structured `{ok:false, reason:...}` object that is n8n execution data by construction | ✅ PASS |

**Status**: 16/18 rows PASS, 1 disclosed spec-precision gap (QLF-02), 1 undisclosed GAP (VOZ-03 AC4 / maxIterations edge case) found by this Verifier.

---

## Findings Beyond the Disclosed Gaps

### Finding 1 — VOZ-03 AC4 / Edge Cases: no active "fallback de esclarecimento" send exists

`spec.md`'s Edge Cases section states: *"IF o nó AI Agent atinge `maxIterations` sem concluir THEN o fluxo SHALL enviar o fallback de esclarecimento ao lead, nunca terminar em silêncio."* VOZ-03 AC4 makes the same promise for the narrower case of 3 consecutive tool-validation rejections.

Tracing the live workflow: `tool-responder-lead`'s turn-counter (`turnCount`) only increments on **accepted** sends (`newAberturas = rejection ? aberturas : [...aberturas, {...}]`) — it does not count rejected attempts at all. There is no separate counter capping regeneration attempts at 2. The only backstop is the AI Agent node's `maxIterations:8`. When that is exhausted without a successful `responder_lead` call, `Code: finalizar turno do agente` sets `turnoSemResposta:true` and the flow proceeds straight to `Data Table: limpar buffer` — **no message is sent to the lead**. This matches `design.md`'s Error Handling Strategy table (*"Agente termina sem chamar responder_lead → Registra na execução e encerra sem enviar — Silêncio — aceito, melhor que mensagem errada"*), but contradicts the literal text of the spec's Edge Cases bullet and VOZ-03 AC4, and — unlike T4's `lead`-parameter omission — this substitution was never flagged as a `SPEC_DEVIATION` anywhere in `tasks.md`.

**Assessment**: not blocking. The actual behavior (silence) is a defensible, safer degradation than a wrong or generic message, is internally consistent with `design.md`'s own documented reasoning, and no hard invariant is violated (no side effect, no crash). But it is a real mismatch between spec.md's literal promise and the shipped behavior that the author did not surface. Recorded as a gap here rather than silently passed.

**Recommendation** (non-blocking follow-up): either (a) reconcile spec.md's Edge Cases bullet + VOZ-03 AC4 to state the actual "silence is accepted" behavior explicitly (matching design.md), or (b) add a real regeneration counter in `tool-responder-lead`/`conversa_estado` plus a dedicated "desculpe, pode repetir?" send path if the product actually wants an active fallback message.

**Resolution (2026-09-09, lote-10 T17/T18)**: option (a) chosen, option (b) deliberately not chosen. `spec.md`'s VOZ-03 AC4 and the matching Edge Cases bullet were reconciled to state the silence behavior explicitly — this actually happened same-day as this report, in commit `5a43b5b` (2026-08-15, right after this Verifier ran), not in lote-10 itself. Lote-10's T17 re-read both passages against the live text and confirmed the reconciliation still holds, word for word: VOZ-03 AC4 now reads "silêncio é o comportamento aceito, não uma mensagem ativa de fallback", and the Edge Cases bullet reads "silêncio é o comportamento aceito, preferível a uma mensagem genérica ou incorreta", both citing `design.md`'s Error Handling Strategy as the reason, not just the fact. Option (b) — a dedicated regeneration counter plus an active "desculpe, pode repetir?" send — was considered and explicitly not built: the product's decision, standing since the reconciliation, is that silence is the safer degradation (no chance of an ill-timed or wrong clarifying message), and the existing `maxIterations` (8) ceiling on the AI Agent node already bounds the failure mode without new state. Finding 1 is closed by documentation, not by code — no line in `tool-responder-lead`, `conversa_estado`, or any `n8n/src/*.mjs` module changed.

### Finding 2 — QLF-02: "perguntado" means "instructed," not "confirmed"

Already self-disclosed by the author in T11's notes and consistent with the design's constraints (no deterministic way to inspect the agent's literal output before it acts). Confirmed live. Flagged here only as a spec-precision gap, not a functional defect — the mechanism is a reasonable, necessary interpretation given the architecture, and it is honestly documented in-code and in `tasks.md`.

---

## Discrimination Sensor

**Isolation**: temporary `git worktree` at a scratchpad path (never `git stash`), `node_modules` attached via a Windows junction (removed before `git worktree remove --force`). Baseline `git status --porcelain` on the real tree recorded before any sensor work and re-confirmed identical after teardown (only the 4 pre-existing untracked files from before this session — `public/crivo_white_symbol*.png`, `skills-lock.json` — nothing from sensor activity).

### Track A — pure JS (`n8n/src/*.mjs`)

| # | File:line (scratch) | Mutation | Targets | Killed? |
| - | -------------------- | -------- | ------- | ------- |
| M1 | `n8n/src/phase.mjs:58` | Inverted ternary: `allRequiredAsked ? "agendando" : "qualificando"` → `... ? "qualificando" : "agendando"` | QLF-01 AC6/AC7 — the exact defect class this lote exists to fix | ✅ Killed — 8/19 tests failed in `phase.test.ts`, including the AC6 discriminant (`"os 3 obrigatórios perguntados, sem NENHUM valor conhecido... -> agendando"`) |
| M2 | `n8n/src/voice.mjs:73` | Negated condition: `if (BANNED_OPENINGS.has(opening))` → `if (!BANNED_OPENINGS.has(opening))` | VOZ-01 AC1 (banned-opening detection) | ✅ Killed — 6/22 tests failed in `voice.test.ts` |
| M3 | `n8n/src/voice.mjs:92` | Removed `"puxar"` from `CAPABILITY_VERBS` whitelist | VOZ-02 AC3 discrimination — the exact real-conversation phrase ("vou puxar aqui as opções") from the Independent Test | ✅ Killed — 1/22 tests failed (`"rejeita 'vou puxar aqui as opções'..."`) |
| M4 | `n8n/src/session.mjs:39` | Boundary flip: `current - last > gapMs` → `>= gapMs` | MEM-02 AC3 — exact-12h boundary | ✅ Killed — 1/15 tests failed (`"gap exatamente 12h -> false"`) |
| M5 | `n8n/src/session.mjs:10` | Reintroduced old cap: `DEFAULT_MAX_SEED_MESSAGES = 50` → `= 20` | AD-019 / MEM-03 AC4 — the removed-20-message-cap invariant | ✅ Killed — 2/15 tests failed, including the exact AD-019 discriminant (`"30 mensagens da mesma sessão -> devolve as 30 (não corta em 20 — AD-019)"`) |

**Result**: 5/5 mutations killed, 0 survived.

### Track B — workflow layer's named mandatory risk (`leadId` never from `$fromAI`)

Design.md's Risks & Concerns table names this explicitly: *"A URL da tool é montada por expressão do fluxo, nunca por `$fromAI`. Só o corpo aceita campos do modelo. Vira teste de discriminação obrigatório no Verifier."* Inspected via `get_workflow_details` on the **currently published** `crivo-agente-principal` (`0B1nqjODu7xuYYKF`, `active:true`, `updatedAt:"2026-08-15T02:51:35.339Z"`) this session — not read from repo source.

- **`registrar_qualificacao`** (`httpRequestTool`, id `c4733b73-...`): `"url": "=https://.../api/v1/leads/{{ $('Code: gate').first().json.id }}"`. Body: `$fromAI('campo', ...)` / `$fromAI('valor', ...)` — model controls field name/value, never the URL/leadId.
- **`escalar_para_humano`** (`httpRequestTool`, id `604eca0b-...`): identical pattern — `url` bound to `{{ $('Code: gate').first().json.id }}`; body's `escalationReason` is the only `$fromAI` field.
- **`responder_lead`**/**`agendar_reuniao`** (`toolWorkflow`): `workflowInputs.value.leadId = "={{ $('Code: gate').first().json.id }}"` — a static flow expression in the `defineBelow` mapping, listed in `workflowInputs.schema` as `canBeUsedToMatch:false` but never as a `fromAi()` value. Only `mensagem` (responder_lead) and `meetingAtProposto` (agendar_reuniao) use `$fromAI`.

`Code: gate`'s `id` field traces upstream to `Code: contexto do lead` → the response of `HTTP: POST /leads (idempotente)` — the CRM's own idempotent-create response, never anything the model supplies.

**Result**: ✅ PASS. `leadId`/URL binding is structurally isolated from the model in all 4 tool nodes that touch it. Citations: node ids `c4733b73-7598-44f0-be3a-1a78b49a2a22` (`registrar_qualificacao`), `604eca0b-531a-4101-9a23-497c8b74c30d` (`escalar_para_humano`), plus the `workflowInputs.value.leadId` expression on `responder_lead`/`agendar_reuniao`, all inspected live in workflow `0B1nqjODu7xuYYKF`.

---

## Reconciliation Check (AD-014 invariant)

`node scripts/n8n-inline.mjs` re-run against the committed `n8n/workflows/*.ts` on the real tree: **zero diff** against `n8n/generated/*.ts` on disk (`git status --porcelain n8n/generated/` empty after regeneration). The `a640caf` `export const` fix is present (`EXPORT_DECLARATION_PATTERN` matches `function|const|let|class`) and confirmed effective — no stray `export const`/`export function` tokens remain in any generated Code-node payload.

Live-instance spot check: the `Code: sessão expirada?` and `Code: montar system message e marcar campo perguntado` node bodies on the **published** `crivo-agente-principal` were extracted via `get_workflow_details` and are byte-for-byte identical (including comments/JSDoc) to `n8n/src/session.mjs`, `n8n/src/phase.mjs`, and `n8n/src/system-message.mjs` on disk. Node count on the live workflow: 52 — matches T12's reconciliation claim exactly.

---

## Test-Removal Audit

| Module removed | Test file removed | Claimed Δ | Verified Δ (git show + `it(` count) | `__INLINE` markers remaining |
| --------------- | ------------------ | --------- | ------------------------------------ | ------------------------------ |
| `validate-llm.mjs` | `validate-llm.test.ts` | −39 | −39 (exact) | 0 |
| `prompt.mjs` | `prompt.test.ts` | −20 | −20 (exact) | 0 |
| `history.mjs` | `history.test.ts` | −10 | −10 (exact) | 0 |

Each of T13/T14/T15 touches exactly 2 files (module + its test), confirmed via `git show --stat` on `48932d7`/`f5deff3`/`916e064` — no partial deletions, no collateral edits to other files. `business-hours.mjs`/`gate.mjs`/`normalize-event.mjs`/`phone.mjs` confirmed **zero diff** across the entire `a3cc1ea..f349d7f` range (`git diff --stat`) — the "entorno intocado" claim in design.md holds structurally, not just by assertion. 691 → 622 fully accounted for module-by-module; no surviving test was weakened to compensate (spot-checked: `gate.test.ts` still has 21 `it()` blocks, unchanged file).

---

## Gate Check

- **Gate command**: `npx vitest run && npm run lint && npm run build`
- **Result**: 622/622 tests passed (48 files), 0 failed, 0 skipped. Lint: 0 errors, 2 pre-existing warnings (`n8n/generated/scheduler.ts`/`n8n/workflows/scheduler.ts`, unrelated to this feature — `ifElse` unused). Build: exit 0, all 14 routes compiled (Next.js 16.2.11).
- **Test count before feature** (per `tasks.md`): 612
- **Test count after feature**: 622
- **Delta**: +78 new (T1-T4) − 69 removed (T13-T15) = +9 net (612 → 691 mid-feature per the author's own real-baseline note → 622 final)
- **All three gates independently re-run in this session**, not taken on the author's word.

---

## Disclosed-Gaps Assessment

1. **AGN-05, MEM-02/03/04, VOZ-02/03, CTX-03 — unit-tested/`validate_workflow`-only, not exercised via a live end-to-end conversational turn this batch.** Confirmed accurate. `spec.md`'s own "Evidência real por camada" section correctly differentiates AGN-01/02/03/04/QLF-*/VOZ-01/MEM-01/OBS-01 (live-execution-proven) from AGN-05/MEM-02-04/VOZ-02-03/CTX-03 (unit-test-or-static-only) — no blanket "Verified" overclaim found anywhere in the traceability table.
2. **T16 SPEC_DEVIATION (`gemini-3.1-flash` → `gemini-3.5-flash`).** Documented in `tasks.md` T16 with reasoning (live `ListModels` call, same release window, non-lite, pinned version not the floating alias). Judged **justified**: this is a narrow technical substitution (the literal target didn't exist) within the same model family/generation the spec's own Assumptions table already treats as discretionary ("Modelo | Gemini, o mesmo já em uso | ... | n (discretion)"), isolated to one commit, revertible, and measured with a direct A/B comparison against the same fixture. It does not cross into the kind of model-swap decision the Assumptions table explicitly deferred as a confounding variable — the family stayed Gemini flash, non-lite, same window.
3. **T12's two production bugs (`workflowInputs.schema` missing; `errorWorkflow` unlinked on sub-workflows).** Both confirmed **fixed on the currently published instance** via live `get_workflow_details` on `responder_lead`/`agendar_reuniao` (`schema` present, all fields mapped) and on `crivo-tool-responder-lead`/`crivo-tool-agendar-reuniao` (`settings.errorWorkflow:"73Yx70RMJrpLiYQn"`) — not just claimed in the repo/README.
4. **2 inert test rows in `conversa_estado` (`test-tenant-lote6c*`).** Accepted as accurately described non-blocking cleanup debt: `conversa_estado` is only ever reached via a `tenantSlug` resolved from a `tenant_config` lookup keyed on a real `phoneNumberId`; a stray row keyed by a literal test-tenant slug that has no corresponding `tenant_config` entry is unreachable by real production traffic. Not independently queried row-by-row (no MCP data-table-row-browse tool available in this session; same limitation the author reported), but the reachability argument is structurally sound from the live workflow's lookup chain.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ — removed modules (validate-llm/prompt/history) fully retired, no dead references |
| Surgical changes | ✅ — entorno (trigger/buffer/gate/scheduler/erros) confirmed 0-diff |
| No scope creep | ✅ |
| Matches patterns | ✅ — new `.mjs` modules follow the existing pure-function/no-I/O convention of `gate.mjs`/`business-hours.mjs` |
| Spec-anchored outcome check (asserted values match spec) | ✅ for 16/18 rows; 2 flagged above |
| Per-layer Coverage Expectation met | ✅ — pure layer 1:1 with ACs incl. discriminants; workflow layer covered by `validate_workflow` + live MCP executions per the Test Coverage Matrix's own design (no vitest expected there) |
| Every test maps to a spec requirement | ✅ — no unclaimed tests found in the 4 new test files |
| Documented guidelines followed | `AGENTS.md`, `CLAUDE.md`, `n8n/README.md` (workflow-as-code golden rule, §11 bug documentation) |

---

## Edge Cases

- [x] `maxIterations` atingido → registra e não erra
- [ ] `maxIterations` atingido → **envia fallback de esclarecimento** — NOT implemented; results in silence instead (Finding 1 above)
- [x] `registrar_qualificacao` com enum inválido → recusa sem `PATCH`, campo mantém valor anterior (CRM-side, `neverError:true` surfaces the `code`)
- [x] Memória + `escalado_humano` → gate roteia `somente-registrar` antes do agente (live `gate.mjs`, unchanged)
- [x] Banco de memória indisponível → turno segue sem memória (design.md Error Handling; not independently forced/tested this session — accepted by construction, consistent with the author's own disclosed gap)
- [x] Debounce em rajada → inalterado, fora do escopo deste lote (confirmed 0-diff)
- [x] Purga de 12h antes de semeadura, nunca a ordem inversa — confirmed via live connections graph
- [x] Lead novo → memória vazia, semeadura pulada sem erro (IF branch confirmed live)

---

## Requirement Traceability (Verifier's own verdict — not the author's Handoff)

| Requirement | tasks.md Status | Verifier Verdict |
| ----------- | ---------------- | ------------------ |
| AGN-01 | Done | ✅ Verified |
| AGN-02 | Done | ✅ Verified |
| AGN-03 | Done | ✅ Verified |
| AGN-04 | Done | ✅ Verified |
| AGN-05 | Done | ✅ Verified (unit/static evidence only, honestly disclosed) |
| MEM-01 | Done | ✅ Verified |
| MEM-02 | Done | ✅ Verified (unit evidence + live purge-branch structure; no live 12h-gap exercised) |
| MEM-03 | Done | ✅ Verified (unit evidence + live seed-branch structure; no live cold-start exercised) |
| MEM-04 | Done | ✅ Verified (live purge-branch structure; no live opt-out exercised this batch) |
| QLF-01 | Done | ✅ Verified |
| QLF-02 | Done | ⚠️ Verified with disclosed spec-precision gap ("perguntado" = instructed, not confirmed) |
| QLF-03 | Done | ✅ Verified |
| VOZ-01 | Done | ✅ Verified |
| VOZ-02 | Done | ✅ Verified |
| VOZ-03 | Done | ⚠️ Verified with GAP — no active fallback send on regeneration/maxIterations exhaustion (Finding 1) |
| CTX-03 | Done | ✅ Verified |
| OBS-01 | Done | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready (PASS) with 1 non-blocking, newly-identified gap (Finding 1) recommended as a follow-up fix task — not severe enough to block this lote given it degrades to silence (safe) rather than a wrong effect, and is consistent with design.md's own documented reasoning even though spec.md's literal text wasn't reconciled to match.

**Spec-anchored check**: 16/18 evidence rows matched the spec-defined outcome exactly; 1 disclosed spec-precision gap (QLF-02); 1 undisclosed gap found and recorded (VOZ-03 AC4 / maxIterations fallback).

**Sensor**: Track A 5/5 mutations killed, 0 survived. Track B (leadId/$fromAI) — PASS, cited live.

**Gate**: 622/622 tests, lint clean, build exit 0 — all independently re-run this session.

**What works**: The architectural rewrite is real and live — no LLM Chain remains, exactly 5 tools are wired with `leadId` structurally isolated from the model, memory purge/seed ordering is correct and atomic with `conversa_estado`, the AD-019 20-cap removal and the QLF-01 AC6 "empty doesn't block" invariant both survive adversarial mutation, and the two T12 production bugs are confirmably fixed on the live, currently-published instance.

**Issues found**:
1. (Non-blocking) VOZ-03 AC4 / Edge Cases maxIterations fallback promise is unmet — implementation silently registers instead of sending a clarifying message. Fix: either reconcile spec.md's text to the documented "silence is safer" design.md rationale, or implement an actual regeneration counter + fallback send in `tool-responder-lead`.
2. (Already disclosed, no action needed) QLF-02 "perguntado" semantics — accepted as-is.

**Next steps**: Route Finding 1 to a follow-up fix task (not urgent — low-frequency edge case, safe failure mode) if the product wants the literal spec text honored; otherwise amend spec.md's Edge Cases bullet to match the shipped, reasoned behavior.
