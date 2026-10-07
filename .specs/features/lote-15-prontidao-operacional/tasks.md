# Lote 15 — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/lote-15-prontidao-operacional/spec.md`
**Design**: `.specs/features/lote-15-prontidao-operacional/design.md`
**Status**: Approved (usuário, 2026-10-07)

**Regras deste lote (auditoria do L14b, `.specs/audits/2026-10-l14b.md` § 7; AD-014, AD-033):**

- Execução em linha, uma task por vez; só o Verifier final é sub-agente.
- `tasks.md` recebe só status e hash de cada task. Evidência vai no commit e no `validation.md`; nada de tabela file:line por asserção.
- Mudança de schema → `npm run db:push:test` (base e branches de worker, AD-033). Testes pontuais com `npx vitest run <arquivos>`; Full (`npm test`) uma vez, no fechamento.
- Nenhum commit com `Co-Authored-By`, "Generated with" ou marca de atribuição.
- Phase 3 inteira é ação externa: cada task pede autorização explícita do usuário no momento, com rollback e registro. Nenhuma task das Phases 1–2 toca produção.

---

## Test Coverage Matrix

> Guidelines found: `AGENTS.md`/`CLAUDE.md` (sem limiar de cobertura), `vitest.config.ts` (Neon real, AD-033); amostras em `src/lib/__tests__/format.test.ts`, `src/server/data/__tests__/integration-refusals.test.ts`, `src/server/integration/__tests__/maintenance.integration.test.ts`, `src/server/auth/__tests__/email.test.ts`, `src/db/__tests__/create-admin.test.ts`, `src/db/__tests__/schema-humano.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Lib pura (`src/lib/*.ts`) | unit | 1:1 com os ACs de plano e formato; todos os ramos; edge cases da spec | `src/lib/__tests__/*.test.ts` | `npx vitest run src/lib/__tests__/<arquivo>` |
| Schema (`src/db/schema.ts`) | integration | Colunas, nulidade e check constraint no banco real | `src/db/__tests__/schema-*.test.ts` | `npx vitest run src/db/__tests__/<arquivo>` |
| DAL (`src/server/data/*.ts`) | integration | Consultas e CAS no banco real; tenant estrangeiro intocado (L-035); limites exatos (L-023) | `src/server/data/__tests__/*.test.ts` | `npx vitest run src/server/data/__tests__/<arquivo>` |
| Orquestração, manutenção e rota (`src/server/integration`, `app/api/cron`) | integration | Todos os ACs de ALERTA-01/03 ponta a ponta com fixtures e envio falso; falha isolada por injeção (L-002); ligação da rota (L-026) | `src/server/integration/__tests__/*.test.ts` | `npx vitest run src/server/integration/__tests__/<arquivo>` |
| Adaptador de e-mail (`src/server/auth/email.ts`) | unit | Resend mockado; remetente, destinatário, retorno sem lançar | `src/server/auth/__tests__/email.test.ts` | `npx vitest run src/server/auth/__tests__/email.test.ts` |
| CLIs (`src/db/*.ts`, `scripts/*.ts`) | integration (banco) / unit (envio) | Todos os ACs de REVOGA-01; saída e código de saída | `src/db/__tests__/*.test.ts`, `scripts/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Docs (`.specs`, README) e ações externas | none | registro em `validation.md` / commit | - | - |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Task com testes | `npx vitest run <arquivos da task>` |
| Full | Fechamento do lote | `npm test` |
| Build | Tasks de código antes do commit e fechamento | `npm run lint` + `npx tsc --noEmit -p .` (sem erro novo além dos 50 já existentes) |
| Registro | Ações externas e docs | Resultado registrado em `validation.md` (ou no próprio doc) e commitado |

---

## Execution Plan

### Phase 0: Gate de viabilidade

```
T0
```

### Phase 1: Alerta (local)

```
T0 → T1 → T3 → T5 → T6
T0 → T2
T0 → T4
T2 → T5
T4 → T5
T2 → T7
T4 → T7
```

### Phase 2: Revogação de chave

```
T0 → T8 → T9
```

### Phase 3: Produção (cada task com autorização explícita)

```
T7 → T10 → T13
T6 → T11 → T13
T0 → T12 → T13 → T14
T0 → T15
```

### Phase 4: Documentação

```
T14 → T16
```

---

## Task Breakdown

### T0: Gate de viabilidade (fatos operacionais)

**What**: Comprovar F2–F4 do design (cron de manutenção rodando em produção, domínio do `RESEND_FROM` verificado no Resend, `RESEND_FROM` presente no Production) e registrar F1 com a fonte já consultada.
**Where**: `.specs/features/lote-15-prontidao-operacional/validation.md`
**Depends on**: None
**Reuses**: design.md § Fatos operacionais
**Requirement**: ALERTA-04
**Status**: Done 352e8cd (F2 parcial: Phase 3 bloqueada)

**Tools**:

- MCP: Vercel (leitura de logs, com autorização) ou conferência pelo usuário; Resend `list-domains` (leitura, com autorização) ou conferência pelo usuário
- Skill: NONE

**Done when**:

- [ ] F1–F4 registrados com fonte e data em `validation.md` § Gate
- [ ] IF F2, F3 ou F4 não se confirma THEN Phase 3 bloqueada e usuário avisado (Phases 1–2 podem seguir)
- [ ] Nenhum valor de variável, token ou chave lido ou registrado

**Tests**: none
**Gate**: registro

**Commit**: `docs(l15): registrar o gate de viabilidade`

---

### T1: Colunas de estado de saúde em `tenants`

**What**: `integration_health_state` (text, nullable, check `in ('saudavel','problema')`) e `integration_health_changed_at` (timestamptz, nullable).
**Where**: `src/db/schema.ts`
**Depends on**: T0
**Reuses**: padrão de colunas aditivas de `tenants` (AD-004)
**Requirement**: ALERTA-01
**Status**: Done 83418d7

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `npm run db:push:test` aplicado (base + workers)
- [ ] Teste novo `src/db/__tests__/schema-integration-health.test.ts`: as duas colunas nascem nulas num tenant novo; `problema` e `saudavel` aceitos; valor fora do check recusado pelo banco
- [ ] Quick gate verde; build gate sem erro novo

**Tests**: integration
**Gate**: quick

**Commit**: `feat(db): guardar o último estado de saúde da integração por imobiliária`

---

### T2: Plano e formato do alerta (lib pura)

**What**: `planIntegrationAlerts` e `formatIntegrationAlertEmail` conforme o design.
**Where**: `src/lib/integration-alert.ts`
**Depends on**: T0
**Reuses**: `resolveIntegrationHealth` (`src/lib/pilot-metrics.ts`)
**Requirement**: ALERTA-01, ALERTA-02
**Status**: Done 5624094

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `src/lib/__tests__/integration-alert.test.ts` cobre: gravado nulo → `initialize` com o estado avaliado e fora de `alert` (AC3); `saudavel` + avaliado `problema` → `alert` (AC2); `problema` + avaliado `saudavel` → `recover` sem `alert` (AC4); estado igual → nenhuma lista (AC5); recusa com mensagem recente → `problema`; última mensagem exatamente a 24h → `saudavel` e a 24h + 1 ms → `problema` (L-023)
- [ ] Formato: assunto `[crivo] Integração com problema em N imobiliária(s)` com N exato para 1 e 3 tenants; corpo com nome, slug, contagem por `(code, rota)`, ISO 8601 UTC ou `nunca` (ALERTA-02 AC2/AC3); `{ test: true }` prefixa `[teste] `
- [ ] Teste afirma que o corpo não contém nenhum campo além dos do snapshot (ALERTA-02 AC4)
- [ ] Módulo sem import de I/O (mesma regra de pureza de `pilot-metrics.ts`); quick gate verde

**Tests**: unit
**Gate**: quick

**Commit**: `feat(alerta): decidir e formatar o alerta de queda da integração`

---

### T3: DAL de saúde em lote e compare-and-set

**What**: `getTenantHealthSnapshots`, `recordTenantHealthStates`, `claimIntegrationProblems`, `releaseIntegrationProblems`.
**Where**: `src/server/data/integration-health.ts`
**Depends on**: T1
**Reuses**: filtros de `getLastAgentMessageAt` e `getIntegrationRefusalsSince`
**Requirement**: ALERTA-01
**Status**: Done e49b3b1

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `src/server/data/__tests__/integration-health.test.ts` (banco real): snapshot traz a última mensagem `agente` (ignora `lead`/`humano`) e as recusas do tenant **mais** as sem tenant; recusa em exatamente `since` conta e 1 ms antes não (L-023); recusa de outro tenant não aparece (L-035)
- [ ] Snapshot de N tenants faz número constante de consultas (3), afirmado por espião no driver ou por contagem
- [ ] `claimIntegrationProblems`: devolve o tenant na primeira chamada e nada na segunda (ALERTA-01 AC7); não reivindica tenant gravado `problema` nem nulo
- [ ] `releaseIntegrationProblems` restaura `saudavel` e o `changed_at` anterior, partindo de um `changed_at` fixo diferente do instante da reivindicação (L-053)
- [ ] `recordTenantHealthStates` não altera tenant fora da lista (contagem antes/depois, L-001)
- [ ] Quick gate verde

**Tests**: integration
**Gate**: quick

**Commit**: `feat(data): ler a saúde de todas as imobiliárias e reivindicar quedas`

---

### T4: E-mail de alerta no adaptador Resend

**What**: `sendIntegrationAlertEmail({ to, subject, text })` reaproveitando `send` e `RESEND_FROM`.
**Where**: `src/server/auth/email.ts`
**Depends on**: T0
**Reuses**: `send`, `EmailResult`
**Requirement**: ALERTA-02
**Status**: Done 7fe4a74

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `email.test.ts` (Resend mockado): envia ao `to` recebido com `from` = `RESEND_FROM` quando definido e o padrão quando ausente (ALERTA-02 AC1); erro do SDK vira `ok: false` sem lançar
- [ ] Asserções existentes de `email.test.ts` sem alteração; quick gate verde

**Tests**: unit
**Gate**: quick

**Commit**: `feat(email): enviar o alerta de integração pelo adaptador existente`

---

### T5: Orquestração do alerta

**What**: `runIntegrationAlert(now, deps)` com a ordem e as regras de falha do design.
**Where**: `src/server/integration/integration-alert.ts`
**Depends on**: T2, T3, T4
**Reuses**: T2, T3, T4
**Requirement**: ALERTA-01, ALERTA-02, ALERTA-03
**Status**: Done 1a8f6eb

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `src/server/integration/__tests__/integration-alert.integration.test.ts` com fixtures próprias e envio falso, afirmando só sobre os tenants da fixture:
  - tenant `saudavel` sem mensagem há 25h → 1 envio, estado `problema`; segunda execução → 0 envios (AC2, AC6)
  - dois tenants em queda → 1 envio listando os dois (ALERTA-02 AC1)
  - tenant novo → estado gravado, 0 envios (AC3); recuperação → `saudavel`, 0 envios (AC4)
  - destinatário `undefined` e `""` → 0 envios, tenant continua `saudavel`, `skipped: "destinatario-ausente"` (ALERTA-03 AC1, L-030)
  - envio `ok: false` → tenant volta a `saudavel`, `sendFailed: true`; execução seguinte com envio ok → 1 envio (AC2)
  - reivindicação concorrente simulada (tenant reivindicado entre o plano e o CAS) → 0 envios (ALERTA-01 AC7)
  - `evaluated` igual ao total de tenants e `sent` igual aos tenants do e-mail com `ok: true` (AC4)
- [ ] Quick gate verde

**Tests**: integration
**Gate**: quick

**Commit**: `feat(alerta): avisar o operador quando a integração cai`

---

### T6: Alerta na manutenção diária e na rota do cron

**What**: Grupo `integrationAlert` em `runDailyMaintenance`, dependência real montada na rota, `console.info` do resumo e `CRIVO_OPERATOR_ALERT_EMAIL: ""` no `test.env` do Vitest.
**Where**: `src/server/integration/lgpd.ts`
**Depends on**: T5
**Reuses**: `runGroup`, `createExpireDocumentsHandler`
**Requirement**: ALERTA-03
**Status**: Done d030e4b

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste novo `src/server/integration/__tests__/maintenance-alert.integration.test.ts`: com o alerta lançando (injeção, L-002) → `integrationAlertFailed: true` e os demais campos iguais aos de uma execução com o alerta ok sobre os mesmos dados (AC3); sem a dependência → `integrationAlertSkipped: "sem-dependencia"` e nenhuma escrita em `tenants`
- [ ] Teste da rota: `createExpireDocumentsHandler` sem override monta a dependência com o destinatário do ambiente e a resposta traz os cinco campos `integrationAlert*` (L-026); o `console.info` recebe os campos sem nome de tenant
- [ ] Teste afirma `process.env.CRIVO_OPERATOR_ALERT_EMAIL === ""` sob Vitest mesmo com `dotenv/config` (L-037)
- [ ] `maintenance.integration.test.ts` verde sem alteração de asserção; quick gate verde; build gate sem erro novo

**Tests**: integration
**Gate**: quick

**Commit**: `feat(cron): rodar o alerta de integração na manutenção diária`

---

### T7: Comando de envio de teste

**What**: `npm run alert:send-test` (`tsx --conditions=react-server`) envia um alerta de exemplo `[teste]` a `CRIVO_OPERATOR_ALERT_EMAIL`.
**Where**: `scripts/send-test-integration-alert.ts`
**Depends on**: T2, T4
**Reuses**: `formatIntegrationAlertEmail`, `sendIntegrationAlertEmail`
**Requirement**: ALERTA-04
**Status**: Done 1c97d36

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `scripts/__tests__/send-test-integration-alert.test.ts` (envio falso): assunto começa com `[teste] [crivo]`; destinatário é o do ambiente; sem destinatário sai com 1 sem enviar; `ok: false` sai com 1 e imprime o erro do adaptador
- [ ] Nenhum dado real de tenant no exemplo; quick gate verde

**Tests**: unit
**Gate**: quick

**Commit**: `feat(alerta): comando para enviar um alerta de teste ao operador`

---

### T8: Revogação de chave de serviço por rótulo

**What**: `revokeServiceKeysByLabel(label, executor)` e `npm run db:revoke-service-key`.
**Where**: `src/db/revoke-service-key.ts`
**Depends on**: T0
**Reuses**: `src/db/mint-service-key.ts` (formato do CLI)
**Requirement**: REVOGA-01
**Status**: Done de3f618

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `src/db/__tests__/revoke-service-key.test.ts`, cada caso dentro de transação revertida (tabela inteira sob controle do teste): "A" ×2 ativas + "B" ativa + "A" revogada em data fixa → revogar "A" devolve 2, `revoked_at` da antiga preservado (AC1, AC4, L-053); depois revogar "B" → código 1, nada muda, mensagem cita §12.3 (AC3); rótulo inexistente → 1 sem mudança (AC2); rótulo vazio/`"  "` → 1 com uso (AC5)
- [ ] Saída do CLI sem `key_hash` (AC6); quick gate verde

**Tests**: integration
**Gate**: quick

**Commit**: `feat(db): revogar chave de serviço por rótulo sem deixar o agente sem chave`

---

### T9: Procedimento de rotação no README do n8n

**What**: §12.3: passo 1 com `npm run db:mint-service-key`, passo 4 com `npm run db:revoke-service-key`, sem o `UPDATE` manual.
**Where**: `n8n/README.md`
**Depends on**: T8
**Reuses**: —
**Requirement**: DOC-01
**Status**: Done 14c9970

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `git grep -n "UPDATE service_api_keys"` sem ocorrência em docs ativas (L-063)
- [ ] Ordem obrigatória (confirmar antes de revogar) preservada no texto

**Tests**: none
**Gate**: registro

**Commit**: `docs(n8n): rotação com os comandos de emitir e revogar chave`

---

### T10: Envio de teste ao operador (ação externa)

**What**: Com autorização, o usuário põe `CRIVO_OPERATOR_ALERT_EMAIL` no `.env` local e o executor roda `npm run alert:send-test`; o usuário confirma recebimento e o domínio do remetente.
**Where**: `.specs/features/lote-15-prontidao-operacional/validation.md`
**Depends on**: T7
**Reuses**: T7
**Requirement**: ALERTA-04
**Status**: Done 1ccdada

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Autorização registrada; saída do comando registrada (sem endereço completo)
- [ ] Usuário confirmou recebimento e remetente no domínio verificado (T0 F3)
- [ ] IF não chegou THEN Phase 3 parada e causa registrada

**Tests**: none
**Gate**: registro

**Commit**: `docs(l15): registrar o envio de teste do alerta`

---

### T11: Schema em produção (ação externa)

**What**: Com autorização, `drizzle-kit push` em produção aplicando só as duas colunas de T1.
**Where**: `.specs/features/lote-15-prontidao-operacional/validation.md`
**Depends on**: T6
**Reuses**: procedimento do L14 (T38)
**Requirement**: ALERTA-04
**Status**: Done 54329a1

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Antes de aplicar: plano do `drizzle-kit` mostra só as 2 colunas e o check; IF mostra outra mudança THEN parar e reportar
- [ ] Autorização, saída e rollback (`ALTER TABLE tenants DROP COLUMN ...`) registrados

**Tests**: none
**Gate**: registro

**Commit**: `docs(l15): registrar o schema do alerta em produção`

---

### T12: Variável do operador no Production (ação do usuário)

**What**: O usuário cria `CRIVO_OPERATOR_ALERT_EMAIL` no ambiente Production da Vercel e confirma.
**Where**: `.specs/features/lote-15-prontidao-operacional/validation.md`
**Depends on**: T0
**Reuses**: —
**Requirement**: ALERTA-04
**Status**: Done a55bb39

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Confirmação do usuário registrada com data, sem o valor (ALERTA-04 AC5)

**Tests**: none
**Gate**: registro

**Commit**: `docs(l15): registrar a variável do operador em produção`

---

### T13: Auditoria e push do `main` = deploy (ação externa)

**What**: Auditar `origin/main..HEAD` e `origin/main` inteiro por trailer (AD-014) e, com autorização, `git push origin main`.
**Where**: `.specs/features/lote-15-prontidao-operacional/validation.md`
**Depends on**: T10, T11, T12
**Reuses**: —
**Requirement**: ALERTA-04
**Status**: Done 5f942b3

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `git log --format=%B origin/main` e `origin/main..HEAD` sem `Co-Authored-By`/"Generated with"
- [ ] Build gate verde antes do push; autorização e hash enviado registrados
- [ ] Rollback registrado: redeploy do deployment anterior pela Vercel

**Tests**: none
**Gate**: registro

**Commit**: `docs(l15): registrar o deploy do alerta`

---

### T14: Primeira manutenção de produção (leitura autorizada)

**What**: Depois da próxima execução do cron, ler o log `[manutencao] alerta` e registrar o resultado.
**Where**: `.specs/features/lote-15-prontidao-operacional/validation.md`
**Depends on**: T13
**Reuses**: log da T6
**Requirement**: ALERTA-04
**Status**: Pending

**Tools**:

- MCP: Vercel (leitura de logs, com autorização) ou o usuário copia a linha do painel
- Skill: NONE

**Done when**:

- [ ] `integrationAlertFailed: false` e `integrationAlertEvaluated` igual ao número de tenants registrados (ALERTA-04 AC6)
- [ ] IF a execução não aconteceu até o fechamento THEN registrado como pendente no Handoff

**Tests**: none
**Gate**: registro

**Commit**: `docs(l15): registrar a primeira manutenção com o alerta`

---

### T15: Linhas inertes de `conversa_estado` (ação do usuário)

**What**: O usuário apaga pela interface do n8n as linhas `test-tenant-lote6c` e `test-tenant-lote6c-turnlimit`.
**Where**: `.specs/features/lote-15-prontidao-operacional/validation.md`
**Depends on**: T0
**Reuses**: —
**Requirement**: LIMPA-01
**Status**: Done 64213d0

**Tools**:

- MCP: NONE (o MCP do n8n não remove linhas)
- Skill: NONE

**Done when**:

- [ ] Confirmação e data registradas (AC1) OU item pendente no Handoff sem bloquear o fechamento (AC2)

**Tests**: none
**Gate**: registro

**Commit**: `docs(l15): registrar a limpeza de conversa_estado`

---

### T16: Roadmap e índice

**What**: `ROADMAP-POS-PILOTO.md` (L15 executado; item 1 → L14c; item 3 deferido com gatilho; item 7 em `f7e512f`; item 8 aceito sem artefato) e linha do lote 15 em `features/INDEX.md`.
**Where**: `.specs/ROADMAP-POS-PILOTO.md`
**Depends on**: T14
**Reuses**: —
**Requirement**: DOC-01
**Status**: Done

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] DOC-01 AC1 e AC4 atendidos; AD-039 já presente em `STATE.md` (AC3, gravada no planejamento, só conferir)
- [ ] Linha do L14c no roadmap inclui a verificação Meta

**Tests**: none
**Gate**: registro

**Commit**: `docs(l15): atualizar roadmap e índice`

---

## Fix tasks do Verifier (iteração 1)

Verifier Opus devolveu FAIL em 2026-10-07: gaps de teste, sem defeito de produto bloqueante.

### F1: Janela de 24h, reivindicação parcial, guarda da liberação e soma por (code, rota)

**What**: Fechar as lacunas 1, 2, 4 e 5 do relatório: teste ponta a ponta da janela `agora − 24h`
(recusa exatamente no limite entra, 1 ms antes não), teste de reivindicação parcial (e-mail e `sent` só
com os reivindicados), teste da guarda de estado da liberação e soma das recusas com e sem tenant de
mesma `(code, rota)` no snapshot.
**Requirement**: ALERTA-01 AC1/AC7, ALERTA-02 AC3, ALERTA-03 AC4
**Status**: Done
**Gate**: quick (`integration-health.test.ts` e `integration-alert.integration.test.ts`, 35/35); os 4 mutantes sobreviventes (janela 23h, e-mail com `plan.alert`, `sent = plan.alert.length`, liberação sem guarda de estado) agora morrem

### F2: Emendas de documento

**What**: AD-039 registra o modo de perda do at-most-once (queda presa em `problema`) como trade-off
aceito; spec.md ganha emendas para ALERTA-02 AC3 (soma por chave), ALERTA-04 AC2 e LIMPA-01 AC1.
**Requirement**: DOC-01 AC3
**Status**: Pending
**Gate**: registro

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T0 | None | início da Phase 0 | ✅ |
| T1 | T0 | T0 → T1 | ✅ |
| T2 | T0 | T0 → T2 | ✅ |
| T3 | T1 | T1 → T3 | ✅ |
| T4 | T0 | T0 → T4 | ✅ |
| T5 | T2, T3, T4 | T3 → T5, T2 → T5, T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | T2, T4 | T2 → T7, T4 → T7 | ✅ |
| T8 | T0 | T0 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |
| T10 | T7 | T7 → T10 | ✅ |
| T11 | T6 | T6 → T11 | ✅ |
| T12 | T0 | T0 → T12 | ✅ |
| T13 | T10, T11, T12 | T10 → T13, T11 → T13, T12 → T13 | ✅ |
| T14 | T13 | T13 → T14 | ✅ |
| T15 | T0 | T0 → T15 | ✅ |
| T16 | T14 | T14 → T16 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T0 | registro externo | none | none | ✅ |
| T1 | Schema | integration | integration | ✅ |
| T2 | Lib pura | unit | unit | ✅ |
| T3 | DAL | integration | integration | ✅ |
| T4 | Adaptador de e-mail | unit | unit | ✅ |
| T5 | Orquestração | integration | integration | ✅ |
| T6 | Manutenção e rota | integration | integration | ✅ |
| T7 | CLI de envio | unit | unit | ✅ |
| T8 | CLI de banco | integration | integration | ✅ |
| T9 | Docs | none | none | ✅ |
| T10–T15 | ações externas | none | none | ✅ |
| T16 | Docs | none | none | ✅ |
