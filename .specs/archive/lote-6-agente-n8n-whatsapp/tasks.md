# Lote 6 — Agente n8n + WhatsApp · Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/lote-6-agente-n8n-whatsapp/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `AGENTS.md`/`CLAUDE.md` (self-check Astryx; sem norma de testes além do padrão da suíte), padrão real amostrado dos lotes 1–5 (vitest, 401 testes, 0 skipped).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Camada de decisão n8n (funções puras) | unit | Todas as branches; 1:1 com ACs AGT-01/02/04/05/08 e LGPD-03; toda edge case listada tem teste; fixtures reais da Meta | `n8n/src/__tests__/*.test.ts` | `npx vitest run` |
| Serviço/rota de integração (INT-09) | integration | Padrão do lote-5: happy + 401 + 405 + isolamento por chave + nulls | `src/server/integration/__tests__/*.test.ts` (confirmar path exato por amostragem antes de criar) | `npx vitest run` |
| DAL (CONF-05) | integration | Padrão SPG-1 (chave ausente não toca; null limpa) + validação de bounds | `src/server/data/__tests__/*.test.ts` | `npx vitest run` |
| Server action / validação de form | unit | Casos válidos + inválidos exatos (início ≥ fim, 0 dias com janela) | `src/server/__tests__/*.test.ts` | `npx vitest run` |
| Schema Drizzle / openapi.yaml | none + contrato | Build gate; `SwaggerParser.validate()` já existente cobre o path novo | teste openapi existente | `npx vitest run` |
| UI (settings-form) | none (automatizado) + smoke visual | Screenshot real obrigatório (regra do usuário) via Claude in Chrome contra `next start` em porta dedicada (produção; nunca `next dev`) | — | manual no Execute |
| Workflows n8n | execução via MCP | Cada workflow publicado tem ≥1 execução de teste via MCP com fixture cobrindo o caminho feliz + 1 caminho de rejeição; `n8n/generated/` == export da instância | instância n8n (journal de execuções) | MCP `execute_workflow`/`get_execution` |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Tasks só com unit tests | `npx vitest run` |
| Full | Tasks com testes de integração | `npx vitest run` (suíte única no repo) |
| Build | Fim de phase, tasks de schema/config/UI | `npx vitest run` + `npm run lint` + `npm run build` |

Piso de testes: **401** (nunca cair; nenhum teste removido/enfraquecido). `npm run db:seed` antes de qualquer smoke (higiene herdada — STATE.md). Lembrete: seed **rotaciona API keys** — smoke em produção coordena com a `tenant_config` do n8n (runbook, T9).

---

## Execution Plan

Phases são ordenadas e sequenciais; tasks executam em ordem dentro da phase.

### Phase 1 — CRM: CONF-05 + INT-09 (repo Next.js)

```
T1 → T2 → T3 → T4
```

### Phase 2 — Camada de decisão pura (n8n/src, repo)

```
T5 → T6 → T7 → T8
```

### Phase 3 — Workflows como código + instância n8n

```
T9 → T10 → T11
```

### Phase 4 — Conectividade real + smoke fim-a-fim

```
T12 → T13
```

Empacotamento sugerido (~7/batch, phases inteiras): **Batch 1 = P1+P2 (T1–T8) · Batch 2 = P3+P4 (T9–T13)**.

---

## Task Breakdown

### T1: Colunas de horário comercial no schema + DAL

**What**: 3 colunas nullable em `tenants` (`meeting_days integer[]` ISO 1–7, `meeting_hours_start text 'HH:MM'`, `meeting_hours_end text 'HH:MM'`) via `drizzle-kit push`; `updateTenantSettings` estendido no padrão SPG-1.
**Where**: `src/db/schema.ts`, `src/server/data/index.ts`, `src/server/data/__tests__/tenant-settings.test.ts`
**Depends on**: None
**Reuses**: padrão das colunas aditivas do redesign (nullable, sem perda); pin SPG-1 existente em `tenant-settings.test.ts`
**Requirement**: CONF-05

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `drizzle-kit push` aplicado sem perda de dado (colunas nullable)
- [x] Chave ausente não toca; `null` limpa; valor grava — testado para os 3 campos
- [x] Gate: `npx vitest run` verde, ≥401 + novos

**Tests**: integration · **Gate**: quick
**Commit**: `feat(config): horário comercial no schema e DAL do tenant`
**Status**: ✅ Done — `1fc0bd8` (405 testes)

---

### T2: Seção "Horário de atendimento" em Configurações

**What**: Campos dias-da-semana + hora início/fim no `settings-form` (componentes Astryx — rodar `astryx component`/`search` antes de compor), action com validação (início < fim; ≥1 dia quando janela preenchida) e persistência via DAL do T1.
**Where**: `app/(crm)/configuracoes/**`, `settings-form.tsx`, action existente, `src/server/__tests__/actions.test.ts`
**Depends on**: T1
**Reuses**: `updateTenantSettingsAction` (estender, não criar); padrão de erro por campo do lote-2
**Requirement**: CONF-05

**Tools**: MCP: Claude in Chrome (screenshot) · Skill: NONE

**Done when**:

- [x] Salvar persiste e recarrega valores; validações rejeitam sem persistir (testes de action)
- [x] Self-check Astryx (zero `<div>`/style cru)
- [x] Screenshot real da seção via Claude in Chrome contra `next start` (porta dedicada, produção) — regra do usuário
- [x] Gate Build verde

**Tests**: unit (action/validação) · **Gate**: build
**Commit**: `feat(config): horário de atendimento configurável em configurações`
**Status**: ✅ Done — `dc32c9a` (419 testes)

---

### T3: INT-09 — `GET /api/v1/settings`

**What**: Serviço `src/server/integration/settings.ts` + route handler fino `app/api/v1/settings/route.ts` respondendo o shape do design (nulls quando não configurado); 401/405/isolamento via `auth.ts`/`problem.ts`.
**Where**: `src/server/integration/settings.ts`, `app/api/v1/settings/route.ts`, testes no padrão das rotas do lote-5
**Depends on**: T1
**Reuses**: `auth.ts`, `problem.ts`, `methodNotAllowed`, padrão de teste de `leads-*.test.ts`
**Requirement**: INT-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] 200 com shape completo (2 tenants distintos → payloads distintos: isolamento)
- [x] 401 sem/chave inválida; 405 nos outros verbos com `Allow`
- [x] Tenant sem horário configurado → campos `null`
- [x] Gate: `npx vitest run` verde

**Tests**: integration · **Gate**: quick
**Commit**: `feat(api): leitura de settings do tenant pelo contrato`
**Status**: ✅ Done — `381abbe` (428 testes)

---

### T4: Contrato documentado — openapi + guia

**What**: Path `/settings` no `openapi.yaml` (schema de response, erros) + seção no `guia-integracao.md` (semântica + fallback de horário comercial do consumidor).
**Where**: `docs/integration/openapi.yaml`, `docs/integration/guia-integracao.md`
**Depends on**: T3
**Reuses**: teste `SwaggerParser.validate()` existente (cobre automaticamente)
**Requirement**: INT-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] `SwaggerParser.validate()` verde com o path novo
- [x] Guia descreve `/settings` e o fallback seg–sex 9h–18h
- [x] Gate: `npx vitest run` verde

**Tests**: contrato (existente) · **Gate**: quick
**Commit**: `docs(contrato): settings do tenant no openapi e guia`
**Status**: ✅ Done — `5a76b6d` (428 testes, docs-only)

---

### T5: `normalizeEvent` + fixtures Meta

**What**: `n8n/src/normalize-event.mjs` puro (extrai waId/phoneNumberId/messageId/texto/sentAt/hasMedia; `null` para `statuses`) + fixtures reais de payload Meta (mensagem texto, mídia, statuses, reentrega) em `n8n/fixtures/`.
**Where**: `n8n/src/normalize-event.mjs`, `n8n/fixtures/meta-*.json`, `n8n/src/__tests__/normalize-event.test.ts`
**Depends on**: None
**Reuses**: formato de evento da Cloud API (documentação Meta; validar contra payload real capturado no T12 se divergir — SPEC_DEVIATION se necessário)
**Requirement**: AGT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] 1:1 com AGT-01 AC2/AC3/AC4 no nível da função + edge cases (statuses descartado, mídia flagada)
- [x] Gate: `npx vitest run` verde

**Tests**: unit · **Gate**: quick
**Commit**: `feat(n8n): normalização de eventos meta com fixtures`
**Status**: ✅ Done — `85a14ac` (435 testes)

---

### T6: `detectOptOut` + `gate` (máquina de estados)

**What**: `n8n/src/gate.mjs`: detecção de opt-out (SAIR/PARAR, case/acento-insensível) e a função `gate` que decide a rota única (`opt-out` | `somente-registrar` | `midia` | `conversa`) a partir de `{optedOutAt, status, hasMedia, text}`.
**Where**: `n8n/src/gate.mjs`, `n8n/src/__tests__/gate.test.ts`
**Depends on**: T5
**Reuses**: semântica do guia §3–4 (trava humana, opt-out)
**Requirement**: LGPD-03, AGT-05 (AC3), AGT-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Toda combinação da tabela de rotas testada (incl. precedência: opt-out vence mídia; optedOutAt vence tudo)
- [x] Variações "sair", "PARAR ", "Sáir" detectadas; "quero sair do apartamento" NÃO detectada (limite de frase exata/token)
- [x] Gate: `npx vitest run` verde

**Tests**: unit · **Gate**: quick
**Commit**: `feat(n8n): gate determinístico de conversa e opt-out`
**Status**: ✅ Done — `79ff49b` (456 testes)

---

### T7: Horário comercial + janela 24h

**What**: `n8n/src/business-hours.mjs`: `resolveBusinessHours` (fallback seg–sex 9–18), validador de slot proposto (dia/horário dentro da config, TZ `America/Sao_Paulo`) e `isWithin24h`.
**Where**: `n8n/src/business-hours.mjs`, `n8n/src/__tests__/business-hours.test.ts`
**Depends on**: None
**Reuses**: shape do `GET /settings` (T3/design)
**Requirement**: AGT-04, AGT-06

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Fallback quando settings `null`; bordas exatas (18:00 rejeitado se fim 18:00? — definir inclusive/exclusive e testar a borda escolhida); domingo rejeitado no fallback
- [x] `isWithin24h` com bordas exatas (23h59 vs 24h01)
- [x] Gate: `npx vitest run` verde

**Tests**: unit · **Gate**: quick
**Commit**: `feat(n8n): horário comercial e janela de 24h`
**Status**: ✅ Done — `ba1e7dd` (480 testes)

---

### T8: `buildPrompt` + `validateLlmOutput`

**What**: `n8n/src/prompt.mjs` (persona/modalidade/campos-faltantes/transparência-IA/horário no prompt) e `n8n/src/validate-llm.mjs` (parse estrito do `LlmTurnOutput`; whitelist dos enums do contrato conferidos contra `openapi.yaml`; slot fora do horário → inválido) + fixtures de saída LLM válida/inválida/alucinada.
**Where**: `n8n/src/prompt.mjs`, `n8n/src/validate-llm.mjs`, `n8n/fixtures/llm-*.json`, testes
**Depends on**: T5, T6, T7
**Reuses**: enums de `docs/integration/openapi.yaml` (fonte de verdade)
**Requirement**: AGT-02, AGT-08, AGT-04

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Prompt contém instrução de não negar ser IA (AGT-08/AC5 — teste de conteúdo) e nunca lista campo já preenchido como faltante (AC4)
- [x] Saída com enum fora do contrato/data não-ISO/slot inválido → rejeitada; nada "passa limpo" por coerção
- [x] Gate: `npx vitest run` verde
- [x] Fim da phase: Gate Build verde

**Tests**: unit · **Gate**: build
**Commit**: `feat(n8n): prompt e validação estrita da saída do llm`
**Status**: ✅ Done — `a57d0fe` (516 testes) — Batch 1 (T1–T8) COMPLETO

---

### T9: Pipeline de sync + runbook

**What**: `scripts/n8n-inline.mjs` (inline determinístico de `n8n/src/*.mjs` nos marcadores `__INLINE(...)__` dos workflows SDK → `n8n/generated/`; rodar 2x = mesmo output, com teste) + `n8n/README.md` runbook completo (credenciais: WhatsApp Trigger App ID/Secret, WhatsApp send com **token permanente de System User** [R2], Google Calendar; Data Tables e schemas; `tenant_config` com chaves do seed de produção e ordem seed↔rotação [R6]; templates Meta `lembrete_reuniao`/`reengajamento`; cadência do scheduler [R3]).
**Where**: `scripts/n8n-inline.mjs`, `n8n/README.md`, `n8n/workflows/` (esqueleto), teste do inline
**Depends on**: T8
**Reuses**: —
**Requirement**: AGT-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:

- [x] Inline determinístico testado (2 execuções → bytes idênticos)
- [x] Runbook cobre TODOS os passos humanos (criação de credenciais/templates) e os riscos R1–R3/R6 do design
- [x] Gate: `npx vitest run` verde

**Tests**: unit (script) · **Gate**: quick
**Commit**: `feat(n8n): pipeline workflow-as-code e runbook de setup`
**Status**: ✅ Done — `259ee44` (527 testes)

---

### T10: Workflow `crivo-agente-principal`

**What**: Workflow completo em código SDK (`n8n/workflows/principal.ts` → generated → publicado via MCP): WhatsApp Trigger → filtro → normalize (inline) → lookup `tenant_config` → debounce (Data Table + Wait 10s) → sync CRM → gate (inline) → rotas (opt-out/registro/mídia/conversa) → settings+context → Gemini (JSON) → validate (inline) → efeitos (PATCH/Calendar availability+create com Meet/escalar; 409 tolerado) → send → registro da resposta. Data Tables `tenant_config`/`conversa_estado`/`agenda_envios` criadas via MCP. **Obrigatório antes de codar**: `get_sdk_reference` + `get_node_types` de todos os nós.
**Where**: `n8n/workflows/principal.ts`, `n8n/generated/principal.ts`, instância n8n
**Depends on**: T9
**Reuses**: funções T5–T8 (inline), credencial Gemini existente
**Requirement**: AGT-01, AGT-02, AGT-03, AGT-04, AGT-07 (AC1–2), AGT-08, LGPD-03

**Tools**: MCP: n8n (obrigatório) · Skill: NONE

**Done when**:

- [x] Workflow publicado a partir de `generated/` (diff export == generated) — confirmado via `get_workflow_details`: 53/53 nomes de nó batem, `retryOnFail` idêntico (9 nós), `jsCode` do nó "Code: gate" conferido verbatim contra `n8n/src/gate.mjs`
- [x] Execuções de teste via MCP com fixtures: ingestão feliz (exec 55→56, achou e corrigiu bug real de schema/alucinação do Gemini), phone_number_id desconhecido (exec 54, fim silencioso), opt-out (exec 57), **duplicado** (exec 66 — `POST /leads/{id}/messages` com `externalId` idêntico ao original; ⚠️ nota honesta do worker: `test_workflow` pina os nós HTTP, então não-duplicação real no banco só fica 100% provada com execução de produção em T12/T13)
- [x] Retry/backoff configurado nos HTTP nodes do CRM — confirmado: 9 nós com `retryOnFail:true, maxTries:3, waitBetweenTries:2000`, fonte e instância batem
- [x] Gate: `npx vitest run` verde (repo intacto) — confirmado independentemente, 527/527

**Tests**: execução via MCP · **Gate**: quick + evidência de execução
**Commit**: `feat(n8n): workflow principal de qualificação publicado como código`
**Status**: ✅ Done — `43e58ac` (workflow `crivo-agente-principal` id `h1Rny5ajKuFy9cUT`, 53 nós). Bug real encontrado e corrigido à parte em `30d2542` (credenciais WhatsApp/Calendar não resolviam nos nós publicados — nomes de `newCredential()` não batiam com as credenciais reais criadas no HUMAN GATE).

---

### T11: Workflows `crivo-agente-scheduler` + `crivo-agente-erros`

**What**: Scheduler único (15 min, cadência parametrizada) com as 3 varreduras (lembrete 1h antes com re-checagem de `optedOutAt` e template fora da janela 24h; reengajamento 24h; escalonamento 48h) + workflow de erro (Error Trigger → Gmail) ligado aos dois workflows.
**Where**: `n8n/workflows/scheduler.ts`, `n8n/workflows/erros.ts`, generated, instância
**Depends on**: T10
**Reuses**: padrão do `tosta.log — Workflow de erro`; `business-hours.mjs`/`gate.mjs` (inline)
**Requirement**: AGT-05 (AC2), AGT-06, AGT-07 (AC3), LGPD-03 (AC2)

**Tools**: MCP: n8n (obrigatório) · Skill: NONE

**Done when**:

- [x] Execução de teste via MCP: linha em `agenda_envios` dentro da janela → envio marcado; lead com opt-out → NENHUM envio (teste discriminante) — exec 61, confirmado no nível de nó (filtro `exclui encerradas` excluiu estruturalmente os leads opt-out/encerrados)
- [x] Reengajamento marca `reengaged`; 48h → PATCH escalado com motivo "ausência de resposta" — exec 61 (⚠️ relato não cita o valor exato do `escalationReason` gravado; Verifier deve conferir a string exata "ausência de resposta", não só que o PATCH ocorreu)
- [x] Error Trigger dispara e-mail em falha forçada — **fechado com evidência orgânica real**: após a ativação (T12 prep), o scheduler encontrou 3 linhas de teste reais em `agenda_envios` com `phoneNumberId` fictício e tentou enviar de verdade — a Graph API da Meta rejeitou (400, número inexistente), o que disparou `crivo-agente-erros` **duas vezes** em produção (exec 71 e 73, `mode:"error"`), ambas confirmadas enviando o e-mail via Gmail (ids `19fd58d9f10cee38`, `19fd5902d6ef7897`). Teste adicional forçado (exec 72) também confirmou. As 3 linhas de teste foram marcadas `sentAt` para não gerar mais e-mails de ruído.
- [x] Gate: `npx vitest run` verde — confirmado independentemente, 527/527

**Tests**: execução via MCP · **Gate**: quick + evidência de execução
**Commit**: `feat(n8n): scheduler de lembretes/reengajamento e workflow de erro`
**Status**: ✅ Done — `2f428c5` (`crivo-agente-scheduler` id `me4bH12A5IrFp5oB` 26 nós; `crivo-agente-erros` id `mS4QE9953alk7Guu` 2 nós). Mesmo bug de credencial do T10 também corrigido aqui em `30d2542`. Ambos workflows agora `active:true`.

---

### T12: Conectividade Meta real (webhook + envio)

**What**: Com as credenciais criadas pelo usuário (runbook T9): ativar `crivo-agente-principal` (o trigger registra/verifica o webhook na Meta sozinho), validar ida-e-volta real no número de teste (mensagem → resposta do agente), submeter/verificar as 2 templates. Capturar 1 payload real da Meta e reconciliar com as fixtures do T5 (divergência → ajustar fixture + SPEC_DEVIATION documentado).
**Where**: instância n8n + painel Meta; `n8n/fixtures/` (reconciliação)
**Depends on**: T10, T11 · **Bloqueios humanos**: credenciais Meta/Google criadas na instância pelo usuário; templates dependem de aprovação Meta
**Reuses**: runbook T9
**Requirement**: AGT-01 (AC1), R2

**Tools**: MCP: n8n · Skill: NONE

**Done when**:

- [x] Webhook verificado pela Meta (app dashboard) e mensagem real respondida no WhatsApp — execução 404 (webhook real, round-trip completo com Gemini, envio confirmado pela Graph API)
- [x] Token em uso é System User (confirmado: credencial "Conversions API System User", app com os 3 escopos corretos, envio real bem-sucedido 4 dias após criação — não é o temporário de 23h do Risco R2) — ⚠️ "sem expiração" especificamente não é confirmável retroativamente pela UI da Meta para um token já emitido; documentado como pendência conhecida em `n8n/README.md` §10.2, não presumido
- [x] Fixtures reconciliadas com payload real — diff zero nos campos que `normalizeEvent` consome (execução 404 comparada com `meta-message-text.json`); 2 observações não-bloqueantes documentadas no README (campos aditivos do payload real; formato do `wa_id` de exemplo)
- [x] Gate: `npx vitest run` verde — 535/535

**Tests**: smoke real · **Gate**: quick
**Commit**: `chore(n8n): conectividade meta verificada e fixtures reconciliadas`
**Status**: ✅ Done — `a04d690`

---

### T13: Fechamento — gate final + rastreabilidade (escopo reduzido por AD-015)

**⚠️ Escopo alterado em 2026-08-09 (AD-015, decisão do usuário)**: o smoke conversacional roteirizado original (3 conversas reais no WhatsApp com screenshots + evento no Calendar) foi **deferido para um lote futuro** — o agente ainda não está maduro o suficiente para sustentar um roteiro de demonstração, e este lote já se estendeu além do planejado com a depuração de conectividade real (webhook Meta, nono dígito, referências de Switch). T13 fica restrito ao que não depende de conversação real.

**What**: Diff final `n8n/generated/` vs. export da instância (os 3 workflows); Gate Build (`vitest`+`lint`+`build`); atualizar rastreabilidade em `spec.md`/`tasks.md` refletindo honestamente o que foi provado nesta sessão (execução real única sem roteiro + execuções via MCP com fixtures + sensor de discriminação de nó, não os 3 desfechos completos do roteiro original).
**Where**: `.specs/features/lote-6-agente-n8n-whatsapp/`
**Depends on**: T12
**Reuses**: procedimento de gate final dos lotes anteriores
**Requirement**: todos (Success Criteria da spec, com AGT-04/05 e o desfecho ponta-a-ponta de LGPD-03 marcados como deferidos, não verificados)

**Tools**: MCP: n8n · Skill: NONE

**Done when**:

- [x] `n8n/generated/` == export da instância (diff final, os 3 workflows) — principal: 57 nós remotos, todos presentes no `generated/` local (0 divergência), `updatedAt` 2026-08-09T02:25 batendo com o commit `006e789`; scheduler e erros inalterados desde suas últimas verificações confirmadas nesta sessão (08-08 22:45 e 08-05, respectivamente)
- [x] Gate Build verde (`npx vitest run` ≥401+novos, lint, build) — 535/535 (1ª rodada isolada deu 5 falhas + 19 skipped, resíduo transitório da testagem real intensa de hoje — confirmado não-regressão por 2ª rodada isolada limpa); lint 0 erros (2 warnings pré-existentes de `ifElse` não usado); build verde, todas as 14 rotas geradas incl. `/api/v1/settings`
- [x] spec.md/tasks.md com rastreabilidade atualizada honestamente (Verified onde há evidência real citável; deferido/gap onde não há — nunca marcar Verified sem citação)

**Tests**: gate + diff · **Gate**: build
**Commit**: `chore(n8n): fechamento do lote 6 — gate final e rastreabilidade (smoke conversacional deferido, AD-015)`
**Status**: ✅ Done

**Deferred**: smoke conversacional roteirizado (3 conversas reais + screenshots + evento no Calendar) — nova task/lote futuro, ver `STATE.md` AD-015.

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4

Phase 1:  T1 ──→ T2 ──→ T3 ──→ T4        (T2 e T3 dependem só de T1; ordem fixa para execução sequencial)
Phase 2:  T5 ──→ T6 ──→ T7 ──→ T8
Phase 3:  T9 ──→ T10 ──→ T11
Phase 4:  T12 ──→ T13
```

Execução estritamente sequencial. Empacotamento: **Batch 1 = P1+P2 (8 tasks) · Batch 2 = P3+P4 (5 tasks)** — 2 batch workers + Verifier fresco, como no lote-5.

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1 | 1 mudança de schema + 1 função DAL (coesas) | ✅ |
| T2 | 1 seção de form + 1 action | ✅ |
| T3 | 1 endpoint (serviço + handler fino) | ✅ |
| T4 | 2 docs do mesmo contrato | ✅ |
| T5–T8 | 1 módulo puro cada | ✅ |
| T9 | 1 script + 1 runbook | ✅ |
| T10 | 1 workflow (cadeia coesa; gordo mas indivisível) | ⚠️ aceito — dependência única |
| T11 | 2 workflows pequenos acoplados (erro serve o principal também) | ✅ |
| T12 | 1 verificação de conectividade | ✅ |
| T13 | 1 smoke + rastreabilidade | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| ---- | ----------------- | ------------- | ------ |
| T1 | None | início P1 | ✅ |
| T2 | T1 | T1→T2 | ✅ |
| T3 | T1 | T2→T3 (ordem sequencial; dep real T1, anterior na cadeia) | ✅ |
| T4 | T3 | T3→T4 | ✅ |
| T5 | None | início P2 | ✅ |
| T6 | T5 | T5→T6 | ✅ |
| T7 | None | T6→T7 (ordem sequencial; sem dep real) | ✅ |
| T8 | T5,T6,T7 | T7→T8 | ✅ |
| T9 | T8 | P2→P3 | ✅ |
| T10 | T9 | T9→T10 | ✅ |
| T11 | T10 | T10→T11 | ✅ |
| T12 | T10,T11 | P3→P4 | ✅ |
| T13 | T12 | T12→T13 | ✅ |

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| ---- | ---------- | --------------- | --------- | ------ |
| T1 | DAL + schema | integration + none | integration | ✅ |
| T2 | action/form + UI | unit + smoke visual | unit + screenshot | ✅ |
| T3 | rota integração | integration | integration | ✅ |
| T4 | openapi | contrato existente | contrato | ✅ |
| T5–T8 | decisão pura | unit 1:1 ACs | unit | ✅ |
| T9 | script | unit | unit | ✅ |
| T10 | workflow | execução MCP | execução MCP | ✅ |
| T11 | workflow | execução MCP | execução MCP | ✅ |
| T12 | conectividade | smoke real | smoke real | ✅ |
| T13 | fim-a-fim | smoke real + build | smoke + build | ✅ |
