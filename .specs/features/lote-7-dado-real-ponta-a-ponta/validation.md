# Lote 7 — Dado real ponta a ponta (Fase 9) Validation

**Date**: 2026-08-22 (rodada 1) · 2026-08-23 (rodada 2 — re-verificação do Fix 1)
**Spec**: `.specs/features/lote-7-dado-real-ponta-a-ponta/spec.md`
**Diff range**: `be70f06..76e2d6d` (25 commits)
**Verifier**: um sub-agente independente por rodada (author ≠ verifier; o verificador da rodada 2 não escreveu o fix que checou). Nenhuma nota de `tasks.md` — nem o relato do orquestrador sobre o próprio fix — foi aceita como fato: toda citação de execução n8n, id de lead, workflow publicado e artefato externo foi reconsultada na fonte primária, em cada rodada.

## Validation: lote-7-dado-real-ponta-a-ponta - PASS

**Veredicto: ✅ PASS** — 40 de 40 ACs provadas, sensor 5/5, gate verde. O único bloqueador da rodada 1 (**SEC-01 AC2** — `crivo-agente-scheduler` sem autenticação no CRM) foi corrigido em `76e2d6d` e re-verificado de forma independente na rodada 2: fonte, arquivo gerado e workflow publicado na instância, os três sem nenhum vestígio de `apiKey`/`Authorization`, com os 5 call sites no mesmo padrão de credencial de serviço já provado em produção por `principal.ts`.

**Rodada 2 — o que foi re-derivado do zero** (nada herdado do relato do orquestrador): o range de commits e o `--stat`; a leitura integral do diff de `n8n/workflows/scheduler.ts`; a comparação linha a linha com o padrão de `principal.ts`; o workflow ao vivo `gmIWxiRrHGIdtPub` por `get_workflow_details` **e** por `get_workflow_version` da versão publicada; o histórico de versões; a execução **897** com dados de nó; a existência da credencial `YhGcdfGtdEBBU9YP`; o arquivamento do workflow scratch; o gate completo; e a integridade de `.specs/STATE.md` e `spec.md`. Uma limitação de evidência ficou registrada — ver **Fix 1 (resolvido)** e a Lacuna 6.

---

## Task Completion

| Task | Status | Notes |
| ---- | ------ | ----- |
| T1–T5 | ✅ Done | Schema, seed, política pura de atribuição, atribuição na criação, `first_response_at`. Todas com teste próprio e citação verificada. |
| T6 | ✅ Done | Sem commit (nenhuma linha de código mudou). Estados vazios provados por captura real — atestado, não re-verificável por mim. |
| T7–T11 | ✅ Done | DAL, actions, controles, painel, sidebar. |
| T12–T16 | ✅ Done | Tabela de chaves de serviço, DAL, seed, `authenticate()` de dois modos, contrato documentado. |
| T17 | ✅ Done (regressão corrigida na rodada 2) | A troca em `principal.ts` + 2 sub-workflows está correta e provada. A remoção da coluna `apiKey` quebrou `n8n/workflows/scheduler.ts`, que não foi migrado nem mencionado — achado da rodada 1, corrigido por `76e2d6d` e re-verificado na rodada 2. Ver Fix 1 (resolvido). |
| T18 | ✅ Done | `n8n/README.md` §12 documenta a rotação; R1 marcado resolvido. |
| T19–T21 | ✅ Done | As 3 conversas reais confirmadas por consulta à instância. Ver Prova por conversa real. |
| T22 | ✅ Done | Rota de expiração, AD-020, rastreabilidade, gate final. Contagem reproduzida por mim. |
| Fix 1 (rodada 2) | ✅ Done | `76e2d6d` — único commit acima de `7680752`; `git diff 7680752..76e2d6d --stat` toca **apenas** `n8n/workflows/scheduler.ts` e `n8n/generated/scheduler.ts` (+60/−32). Nenhum outro arquivo do lote foi mexido. |

---

## Spec-Anchored Acceptance Criteria

### REAL-01 — Dado de demonstração sai dos tenants-piloto

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 seed cria 3 tenants, pilotos sem lead | exatamente 3 tenants; piloto com 0 lead/conversa/mensagem | `src/db/__tests__/seed.test.ts:85` `expect(allTenants).toHaveLength(3)`; `:88` `expect(slugs).toEqual(["crivo-demo","triangulo","vale-uberaba"])`; `:118` `expect(pilotLeads).toHaveLength(0)` | ✅ PASS |
| AC2 config completa nos pilotos | corretores/categorias/documentos/chave > 0 | `src/db/__tests__/seed.test.ts:145-147` `expect(pilotBrokers.length).toBeGreaterThan(0)` etc.; `:191` `expect(rows[0].keyHash).toBe(expectedHash)` | ✅ PASS |
| AC3 baselines nulos nos pilotos | os 3 campos `null` no piloto, não-nulos no Demo | `src/db/__tests__/seed.test.ts:155-157` `expect(pilot.baselineLeadsPerMonth).toBeNull()`; `:161-163` `.not.toBeNull()` | ✅ PASS |
| AC4 KPIs sem `NaN` em tenant vazio | zero ou traço, nunca `NaN` | captura real T6 (5 tiles em `—`/`0`) | ⚠️ Manual — atestado |
| AC5 Pipeline/Chats estado vazio | 3 colunas + lista vazias | captura real T6 | ⚠️ Manual — atestado |
| AC6 seletor lista os 3 tenants | `Crivo Demo` entre eles | `seed.test.ts:88`; confirmado por mim em produção: 3 tenants com slug | ✅ PASS |

**Re-verificação independente**: consulta direta ao Postgres de produção devolveu exatamente 3 tenants — `vale-uberaba`, `crivo-demo`, `triangulo`.

### KPI-01 — Primeira resposta do agente marca o relógio

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 1ª mensagem do agente grava `first_response_at` | igual ao `sentAt` daquela mensagem | `src/server/data/__tests__/first-response.test.ts:77` `expect(lead!.firstResponseAt).toEqual(sentAt)` | ✅ PASS |
| AC2 2ª mensagem preserva o valor | valor da primeira | `first-response.test.ts:102` `expect(lead!.firstResponseAt).toEqual(firstSentAt)` | ✅ PASS |
| AC3 mensagem do lead não altera | permanece nulo | `first-response.test.ts:118` `expect(lead!.firstResponseAt).toBeNull()` | ✅ PASS |
| AC4 reentrega idempotente não altera | valor original, com `sentAt` diferente na 2ª | `first-response.test.ts:143` `expect(second!.created).toBe(false)`; `:146` `expect(lead!.firstResponseAt).toEqual(originalSentAt)` | ✅ PASS |
| KPI derivado não-nulo | `avgFirstResponseMinutes` com valor exato | `first-response.test.ts:168` `expect(kpis.avgFirstResponseMinutes).toBe(12)` | ✅ PASS |

**Prova em produção (re-verificada por mim)**: lead `55861ddd-6d38-4eb7-aac6-05fafa3acb8e` — `firstContactAt: 2026-08-22T22:30:33.000Z`, `firstResponseAt: 2026-08-22T22:30:50.972Z`. ~18s. O KPI-carro-chefe do PRD tem valor real.

### ATRIB-01 — Lead real nasce com corretor responsável

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 menor carga ativa | id exato do corretor de menor carga | `src/server/data/__tests__/broker-assignment.test.ts:115`; `src/lib/__tests__/broker-assignment.test.ts:24` `expect(assignBroker(candidates)).toBe("light-older")` | ✅ PASS |
| AC2 desempate `createdAt` asc, depois `id` asc | id exato, independente da ordem de entrada | `src/lib/__tests__/broker-assignment.test.ts:38-39` — mesmo resultado com entrada invertida | ✅ PASS |
| AC3 tenant sem corretor | lead criado, `brokerId` nulo, sem erro | `src/server/data/__tests__/broker-assignment.test.ts:147` | ✅ PASS |
| AC4 reentrega não reatribui | corretor da 1ª entrega preservado, com carga trocada entre as chamadas | `src/server/data/__tests__/broker-assignment.test.ts:162` | ✅ PASS |
| AC5 decisão numa função pura sem I/O | módulo sem import/`Date.now()` | `src/lib/__tests__/broker-assignment.test.ts:49-50` `expect(source).not.toMatch(/\bimport\b/)` | ✅ PASS |

**Prova em produção (re-verificada por mim)**: lead `1ed76ddb-5b89-43fc-a30e-d1e216cd4a67` → corretor Juliana Pereira Dias; lead `55861ddd-…` → André Luiz Martins. Ambos atribuídos na criação pelo contrato.

### ATRIB-02 — Gestor troca o corretor pelo CRM

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 seletor com corretores do tenant e atual selecionado | — | `src/components/pipeline/lead-controls.tsx` (`Selector`); captura real T10 | ⚠️ Manual — atestado |
| AC2 persiste e reflete no card sem recarregar | `brokerId` persistido | `src/server/data/__tests__/lead-controls.test.ts:113` `expect(updated!.brokerId).toBe(brokerBId)`; `:116` re-leitura; `src/server/__tests__/actions.test.ts:615` revalida `/pipeline` | ✅ PASS |
| AC3 corretor de outro tenant recusado, `brokerId` inalterado | `null` e linha intocada | `lead-controls.test.ts:128` `expect(result).toBeNull()`; `:131` `expect(reread!.brokerId).toBe(brokerAId)`; action: `actions.test.ts:627` campo `error` | ✅ PASS |
| AC4 tenant sem corretor → campo indisponível | `Selector isDisabled` | `lead-controls.tsx` (`disabledMessage`) | ⚠️ Manual — atestado |

### KPI-02 — Comparecimento à reunião registrado no CRM

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 controle de 3 estados quando `meetingAt` passado | pendente/compareceu/não compareceu | `src/lib/__tests__/meeting-attendance.test.ts:16` (passada → editável) | ✅ PASS |
| AC2 persiste `null`/`true`/`false` escopado ao tenant | os três valores | `lead-controls.test.ts:157/161/165` `toBe(true)`/`toBe(false)`/`toBeNull()`; `actions.test.ts:657,669` | ✅ PASS |
| AC3 sem reunião ou futura → somente leitura | não editável | `meeting-attendance.test.ts:7` (nulo), `:11` (futura), `:21` (limite exato `meetingAt === now` → não editável) | ✅ PASS |
| AC4 entra no denominador da taxa | taxa deixa de ser vazia | captura real T10 (`—` → `100% · de 1 reunião confirmada`) | ⚠️ Manual — atestado |
| Escopo por tenant no negativo | `null` sem escrever | `lead-controls.test.ts:176` `expect(result).toBeNull()`; `:179` re-leitura inalterada | ✅ PASS |

### SEC-01 — Chave de API do tenant sai do texto claro

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 nenhuma chave em coluna de Data Table | coluna ausente | **Re-verificado por mim via MCP**: `tenant_config` (`xRHckWWd6fxGeNta`) tem só `phoneNumberId`, `tenantSlug`, `calendarId` | ✅ PASS |
| AC2 fluxo do agente continua autenticando e resolvendo o tenant certo, sem alteração observável | toda chamada `/api/v1/*` do agente segue autenticada | `principal.ts` + 2 tools: ✅ (execuções 1020/1072/1627/1631, rodada 1). `scheduler.ts`: **corrigido em `76e2d6d`** e re-verificado na rodada 2 — `n8n/workflows/scheduler.ts:156-157` (`authentication: "genericCredentialType"` / `genericAuthType: "httpHeaderAuth"`), `:160` (header `X-Crivo-Tenant` ← `tenantSlug`), `:175` (`credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") }`); idem `:303-304/:306/:314`, `:440-441/:443/:445`, `:494-495/:497/:505`, `:635-636/:638/:646`. `grep -ci "apikey"` e `grep -ci "authorization"` = **0** em `n8n/workflows/scheduler.ts` **e** em `n8n/generated/scheduler.ts`; 5 `httpRequest` / 5 `genericCredentialType` / 5 `X-Crivo-Tenant` / 5 `newCredential("Crivo - chave de servico")` nos dois arquivos. Padrão idêntico ao de `n8n/workflows/principal.ts:1107-1121` (tool `escalar_para_humano`), que a rodada 1 já provou em produção pela execução **1072**. Ao vivo: `get_workflow_version(gmIWxiRrHGIdtPub, 06add4c3-…)` devolve os 5 nós com exatamente essa forma, `active: true`, `versionId == activeVersionId` | ✅ PASS |
| AC3 falha de auth responde `401` problem+json com `code` | `tenant-nao-identificado` | `src/server/integration/__tests__/auth.test.ts:184` `expect(body.code).toBe("tenant-nao-identificado")`; `:204` (slug desconhecido, nunca cai em default); `routes/leads-post.test.ts:265` | ✅ PASS |
| AC4 rotação documentada no `n8n/README.md` | procedimento humano | `n8n/README.md` §12 (ordem que evita apagão); R1 §3 resolvido | ✅ PASS |
| Precedência: chave de tenant ignora `X-Crivo-Tenant` | chave de A + header de B resolve A | `auth.test.ts:225-227` `expect(result.tenantId).toBe(tenantA.id)` e `.not.toBe(tenantB.id)` | ✅ PASS |
| Chave revogada não resolve | `null` | `src/server/data/__tests__/service-auth.test.ts:48` | ✅ PASS |
| Chave em claro nunca persistida | só hash sha256 | `src/db/__tests__/seed.test.ts:471` | ✅ PASS |

### PRIV-01 — LGPD verificável com dado real

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 `opted_out_at` gravado + indicador na tela | instante gravado | **Re-verificado**: execução **1627** e consulta ao banco — `optedOutAt: 2026-08-22T22:32:50.256Z` no lead `55861ddd-…`. Indicador: captura real | ✅ PASS |
| AC2 agente não envia mais nada, mesmo se o lead escrever | silêncio total | **Re-verificado**: execução **1631** — `route: "somente-registrar"`, `Switch` saída 1 → `Code: finalizar somente-registrar (sem envio)`; **nenhum nó de envio executou**; mensagem do lead registrada (`dfbd5e42-…`, `sender: lead`) | ✅ PASS |
| AC3 memória purgada, zero linhas na sessão | 0 linhas | Nós de purga presentes e executados em 1627 (`Data Table: purgar qualificação e persona (opt-out)`); contagem zero atestada pelo autor por consulta ao Postgres da instância | ⚠️ Manual — atestado, corroborado estruturalmente |
| AC4 rota de expiração em produção, contagem por tenant | contagem reportada | `POST /api/cron/expire-documents` → `200 {"deletedByTenant":{},"total":0}`; `src/server/__tests__/.../cron-expire-documents.test.ts` | ✅ PASS |
| AC5 contexto não inclui documento expirado | nenhum expirado na resposta | `src/server/integration/context.ts:53` `or(isNull(documents.expiresAt), gt(documents.expiresAt, new Date()))` — filtro na própria query de leitura, independente do cron. **Re-verificado por mim em produção**: `EXPIRED_NOW_COUNT: 0`; só 3 documentos com `expiresAt`, todos `2027-01-01` | ✅ PASS (ver Lacunas aceitas) |

### SMOKE-01 — Os três desfechos provados por conversa real

| Criterion | Spec-defined outcome | Evidência re-consultada por mim | Result |
| --------- | -------------------- | ------------------------------- | ------ |
| AC1 qualificar → agendar | `qualificado_agendado`, resumo, corretor, evento no Calendar | Execução **1020** (workflow `0B1nqjODu7xuYYKF`, `mode: webhook`, trigger `WhatsApp Trigger`, success). Sub-execução **1022** (`2qCs6rPzmeOqan65`, `parentExecutionId: 1020`): evento `bkn78fvpbjesfa2d4ip3rttip8`, "Reunião com Arthur T.", 18/08 14:00–14:30 `America/Sao_Paulo`, Meet `yym-dqem-dwy`; resposta do CRM de produção `status: qualificado_agendado`, `region: centro`, `propertyType: casa`, `purchaseHorizon: "nada urgente"`, `meetingAt: 2026-08-18T17:00:00.000Z`, resumo preenchido; `crmAtualizado: true`; lembrete `agenda_envios` id 9. Execução **1026** (encerramento). | ✅ PASS |
| AC2 escalonamento, sem mais mensagens | `escalado_humano` com motivo | Execução **1072** confirmada: tool `escalar_para_humano` chamada com `motivo: "Lead solicitou atendimento humano expressamente."`; resposta do CRM `status: "escalado_humano"`, `escalationReason` idêntico; lead `cce3da4d-…`. Silêncio pós-escalonamento: rota `somente-registrar` (mesmo mecanismo provado em 1631) | ✅ PASS |
| AC3 opt-out registrado e agente silenciado | `opted_out_at` + silêncio | Execuções **1627** (envio com `wamid.HBgMNTUzNDk5NTMyNDQ0…`) e **1631** (silêncio) | ✅ PASS |
| AC4 evidência de três origens independentes | screenshot + id confirmado + artefato externo | Ids confirmados por `get_execution` (por mim, não pelo autor); artefato do Calendar re-lido do log de execução; screenshots atestados | ✅ PASS |
| AC5 id citado só depois de confirmado | nunca de memória | **Todos os ids citados existem e batem**. Exceções esperadas: **664/665** não existem no workflow principal — são do workflow scratch do T17, exatamente como a nota declara | ✅ PASS |

### SHELL-01 — Sidebar mostra atividade real do agente

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --------- | -------------------- | ----------------------- | ------ |
| AC1 instante relativo em português | texto relativo | `src/lib/__tests__/agent-activity.test.ts:13` | ✅ PASS |
| AC2 estado ocioso sem inventar atividade | subtítulo ocioso | `agent-activity.test.ts:7` (`"Nenhuma mensagem enviada ainda"`) | ✅ PASS |
| AC3 derivado só do CRM, sem chamar n8n | nenhuma chamada à instância | `src/server/data/index.ts:827` `getLastAgentMessageAt` (query local); `src/lib/agent-activity.ts` importa só `formatRelativeTimePtBR` | ✅ PASS |
| Máximo entre mensagens do agente, ignorando lead e outro tenant | `sentAt` máximo | `lead-controls.test.ts:195`, `:214`, `:224` | ✅ PASS |

**Status**: ✅ 40/40 ACs provadas; **0 GAP** (SEC-01 AC2 fechada na rodada 2). 7 ACs de UI/manual atestadas por captura real, não re-verificáveis pelo Verifier (limitação esperada e prevista pela matriz de cobertura do `design.md`).

---

## Discrimination Sensor

Tier **P0/critical-path** (auth, integridade de dado). Scratch por cópia de arquivo (fallback previsto em `validate.md`); `git stash` nunca usado. Baseline por sha256 antes e depois de cada rodada.

| # | File:line | Mutação | Teste que deveria pegar | Killed? |
| - | --------- | ------- | ----------------------- | ------- |
| 1 | `src/lib/broker-assignment.ts:46` | Desempate `createdAt` invertido: `aTime < bTime` → `aTime > bTime` | `src/lib/__tests__/broker-assignment.test.ts:18` | ✅ Killed |
| 2 | `src/server/data/index.ts:793` | Guarda de tenant removida em `updateLeadBroker`: `and(eq(brokers.id,…), eq(brokers.tenantId,…))` → `eq(brokers.id,…)` | `lead-controls.test.ts:119` ("corretor de outro tenant") | ✅ Killed |
| 3 | `src/server/data/index.ts:1081` | Guarda de escrita única removida: `sender === "agente" && firstResponseAt === null` → `sender === "agente"` | `first-response.test.ts:80` ("segunda mensagem preserva") | ✅ Killed |
| 4 | `src/server/integration/auth.ts:76` | Caminho por chave de tenant passa a obedecer `X-Crivo-Tenant` | `auth.test.ts:209` (teste discriminante de precedência) | ✅ Killed |
| 5 | `src/server/data/index.ts:97` | `resolveServiceApiKeyHash` aceita chave revogada: `isNull(revokedAt)` removido | `service-auth.test.ts:48` ("chave revogada devolve null") | ✅ Killed |

**Sensor depth**: P0-full (5 mutações, mínimo exigido).
**Result**: **5/5 mutantes mortos ✅** — nenhum sobreviveu.
**Isolamento verificado**: sha256 dos 3 arquivos idêntico ao baseline após cada restauração (`aeaeb3a9…`, `71f6e8bc…`, `ee3e1893…`); `git status --porcelain` limpo no fim.

---

## Code Quality

| Principle | Status |
| --------- | ------ |
| Minimum code | ✅ `assignBroker` isolada e mínima; `getBrokerLoads` é uma query agregada só (LEFT JOIN, sem N+1); `first_response_at` reusa a transação existente, sem round-trip novo |
| Surgical changes | ✅ Nenhum refactor oportunista. `authenticate()` acrescenta o modo de serviço antes do caminho original, deixando-o literalmente inalterado |
| No scope creep | ✅ Itens do Out of Scope respeitados (sem usuários/papéis, sem atribuição por agenda, sem autoria em `meeting_attended`) |
| Matches patterns | ✅ `updateLeadBroker`/`setMeetingAttendance` copiam o molde tenant-scoped de `updateLeadStatus`; actions copiam `updateLeadStatusAction` |
| Spec-anchored outcome check | ✅ Asserções miram valores exatos (id do corretor, `toEqual(sentAt)`, `code` do problem+json), não "não-nulo" |
| Per-layer Coverage Expectation | ✅ Funções puras 1:1 com ACs; DAL com negativo de tenant explícito; rota nos dois modos |
| Sem testes órfãos | ✅ Todo teste novo mapeia a uma AC ou a um Done-when |
| Guidelines do projeto seguidas | ✅ `AGENTS.md`/`CLAUDE.md`: `lead-controls.tsx` usa `Selector`/`SegmentedControl`/`Banner` da Astryx, sem `<div>` de layout, sem valor cru |
| Convenção de commit AD-014 | ✅ Conferido nos 24 commits: nenhum trailer `Co-Authored-By`, nenhuma marca de autoria de IA |
| Documentação honesta | ✅ As notas de `tasks.md` declaram limitações em vez de escondê-las (T17 ressalva do `whatsAppTrigger`, T18 ausência de helper de revogação, T22 substituição de evidência). Todas conferidas e verdadeiras |

**Uma exceção (rodada 1, já fechada)**: o T17 removeu um recurso compartilhado (`tenant_config.apiKey`) sem inventariar quem mais o consumia. Ver Fix 1 (resolvido). A correção `76e2d6d` não abriu exceção nova: é cirúrgica (2 arquivos, o gerado sendo derivado do outro), copia o padrão vizinho em vez de inventar um, remove `apiKey` também dos 3 Code nodes e das `output` de exemplo — ou seja, não deixou o campo morto rodando junto — e não tocou em nenhum arquivo de produto, teste ou spec.

---

## Edge Cases

- [x] Reseed contra produção por engano → suíte exige `TEST_DATABASE_URL` (`src/db/index.ts:10-21`); confirmado.
- [x] Tenant sem corretor → lead criado com `brokerId` nulo (`broker-assignment.test.ts:147`).
- [x] Seletor com id inexistente/de outro tenant → recusa sem erro não tratado (`lead-controls.test.ts:119`, `actions.test.ts:627`).
- [x] Reunião reagendada para o futuro depois do comparecimento marcado → `setMeetingAttendance` só escreve `meetingAttended`; `canEditMeetingAttendance` decide edição, nunca apaga valor.
- [x] Limite exato `meetingAt === now` → não editável (`meeting-attendance.test.ts:21`).
- [x] Instância n8n fora do ar durante o smoke → registrar como não provado. Honrado: a rodada 1 do opt-out (execução **1118**, `status: error`) foi registrada como falha, não maquiada.
- [x] `Crivo Demo` tratado como qualquer tenant → nenhum caminho especial no código.

---

## Gate Check

- **Gate command**: `npx vitest run && npm run lint && npm run build` (tier Build)
- **Result**: **693 passed, 0 failed, 0 skipped — 55 arquivos**. Lint: **0 erros** (2 warnings conhecidos de `ifElse` em `n8n/scheduler.ts`/`n8n/generated/scheduler.ts`, pré-existentes e aceitos). Build de produção verde, 14 rotas compiladas.
- **Test count antes do lote**: 622 (piso real confirmado na abertura)
- **Test count depois**: 693
- **Delta**: **+71**, batendo com a soma dos deltas task a task
- **Skipped**: nenhum
- **Failures**: nenhuma

**Nota de ambiente (artefato meu, não do lote)**: a primeira execução deu 1386 testes / 110 arquivos com 10 falhas. Causa: o worktree isolado do Verifier fica **dentro** do repositório (`.claude/worktrees/…`) e o `vitest.config.ts` não tem `exclude` para ele, então cada arquivo de teste foi descoberto duas vezes e as duas cópias correram contra o mesmo banco de teste. Com `--exclude "**/.claude/**"` o número correto (693/55) reproduziu exatamente. Contaminação do verificador; nenhuma ação para o lote.

**Gate da rodada 2 (re-executado por mim, depois de `76e2d6d`)**: `npx vitest run --exclude "**/.claude/**"` → **693 passed / 55 arquivos / 0 failed / 0 skipped**, exit 0 — idêntico à rodada 1, nenhuma regressão. `npm run lint` → **0 erros**; os únicos warnings são os 2 conhecidos de `'ifElse' is defined but never used` em `n8n/scheduler.ts` e `n8n/generated/scheduler.ts` (o relatório mostra 4 porque o worktree do Verifier duplica os mesmos 2 arquivos — mesma contaminação de ambiente descrita acima, não um warning novo). `npm run build` → **verde**, todas as rotas compiladas. O fix não mexeu em nenhum arquivo coberto por teste automatizado (`n8n/workflows/` e `n8n/generated/` não têm suíte própria), então a estabilidade do número era o esperado — e é o que se confirmou.

**Integridade**: nenhum teste removido ou enfraquecido. As asserções novas são mais específicas, não menos.

---

## Prova por conversa real — os 6 defeitos + 1 regressão da Phase 4

Material obrigatório: é o argumento empírico de por que o smoke roteirizado (dívida da AD-015, paga por T19–T21) valeu a pena. **Nenhum destes seria pego por teste automatizado** — todos dependem da Cloud API da Meta e do modelo real. Commits conferidos por mim no range.

| # | Defeito | Commit | Causa raiz | Correção |
| - | ------- | ------ | ---------- | -------- |
| 1 | Memória nunca salva | `853013c` | O AI Agent encerra via tool `responder_lead`; o salvamento automático do n8n/LangChain só dispara em resposta final de texto. `ai.agent.memory.saves` = 0 sempre — o agente esquecia tudo dentro da própria conversa | Salvamento explícito por turno |
| 2 | Data sem âncora | `aad5161` | Sem "hoje é X" no prompt, o modelo resolveu "terça-feira" para duas datas diferentes em turnos consecutivos e colidiu com o próprio agendamento | Âncora de data no prompt |
| 3 | Promessa de e-mail | `aad5161` | O agente prometeu mandar link por e-mail — capacidade inexistente que nenhuma instrução proibia | Instrução explícita de reação a falha de tool |
| 4 | Reagendamento em loop | `e945b42` | Com reunião já confirmada, a instrução de fase continuava mandando agendar todo turno; o lead disse "obrigado" e o agente reagendou em cima do próprio horário. Parecia alucinação, era o prompt | Para de reagendar reunião confirmada |
| 5 | Turno mudo | `dbb521b` | O agente escreveu a resposta como texto final em vez de chamar a tool; o texto era descartado e o lead ficava sem nada | Envio de contingência |
| 6 | Confirmação de opt-out não entregue | `36c9a8a` | Os 2 nós de Data Table de purga substituem `$json`; `Code: destinatário do envio fixo` lia `$input.first()` cego e recebia a linha de `conversa_estado`, sem `phoneNumberId` nem `mensagens` (Meta 400). O lead era descadastrado mas **nunca avisado** — a única obrigação da LGPD-03 AC1. Única rota que não seguia a convenção de convergência | Checkpoint `Code: restaurar payload do opt-out` |

**Regressão introduzida e corrigida no mesmo dia** (`81face0`): ao excluir o turno atual da semeadura, uma conversa nova passou a ter zero mensagens anteriores e o Code node devolvia `[]` — no n8n, um nó que devolve 0 itens faz todos os seguintes serem pulados. O agente não rodava e o lead ficava sem resposta (execução 931). Corrigido com item sentinela + IF.

**Re-verificação independente do defeito 6** — o mais grave, porque é obrigação legal. Execução **1627** (`get_execution`, dados de nó):
- `Code: restaurar payload do opt-out` executa **depois** de `Data Table: purgar qualificação e persona (opt-out)` e entrega o payload completo: `phoneNumberId: "1321478747709350"`, `mensagens: [...]`, `waId`, `leadId: 55861ddd-…`, `fase: encerrada`.
- `WhatsApp: enviar mensagem fixa` retorna `wamid.HBgMNTUzNDk5NTMyNDQ0FQIAERgSOTY0QURCNTJGOUNGQzE0NkU2AA==` — id real da Meta, **byte-idêntico** ao citado na nota do T21. A confirmação foi de fato entregue.
- A rodada 1 (execução **1118**) consta na instância com `status: error`, como a nota declara. Falha registrada, não escondida.

---

## Fix Plans

### Fix 1 — ✅ **RESOLVIDO na rodada 2** (`76e2d6d`) — `crivo-agente-scheduler` perdeu a autenticação no CRM (SEC-01 AC2)

> **Status: resolvido.** Commit `fix(agente): migra scheduler para credencial de servico` (`76e2d6d`), único commit acima de `7680752`. Re-verificação independente da rodada 2 abaixo, no bloco **Verificação do fix**. O diagnóstico original fica registrado como está, porque é o argumento de por que a correção era necessária.

- **Severidade**: **Blocker** para o piloto. Major para o produto.
- **Root cause**: o T17 migrou `principal.ts` e os 2 sub-workflows para a credencial de serviço + `X-Crivo-Tenant` e **removeu a coluna `apiKey` da Data Table `tenant_config`**. O workflow `crivo-agente-scheduler` (`gmIWxiRrHGIdtPub`, **ativo**, Schedule Trigger a cada 15min) nunca foi migrado: ele ainda lê `tenant.apiKey` daquela Data Table e monta `Authorization: Bearer {{ …apiKey }}` por expressão. Com a coluna removida, o valor é `undefined` e o header sai vazio.
- **Evidência dura (produção)**: execução **897** (2026-08-16T16:45Z, `status: error`):
  - `Data Table: tenant do lembrete` devolveu a linha `triangulo` **sem campo `apiKey`**;
  - `Code: combinar lembrete e tenant` propagou o objeto **sem `apiKey`**;
  - `HTTP: POST /leads (reconsulta lembrete)` recebeu **`401`** `{"type":"urn:crivo:problem:nao-autenticado","code":"nao-autenticado","detail":"Formato do header Authorization inválido. Use 'Bearer <chave>'."}`.
  - **Não é falha pré-existente**: nas execuções de 2026-08-14 (antes do T17) o nó `HTTP: GET /settings (reengajamento)` respondeu com dados reais. Os erros daquela data têm outra causa (template `reengajamento` sem `template.language.code` — Meta 400), fora do escopo deste lote.
- **Call sites afetados** (`n8n/workflows/scheduler.ts`, idem `n8n/generated/scheduler.ts`):
  - `:155` `POST /leads` (reconsulta do lembrete) — header em `:158`
  - `:299` `POST /leads/{id}/messages` (mensagem do lembrete) — header em `:301`
  - `:433` `GET /settings` (reengajamento) — header em `:435`
  - `:484` `POST /leads/{id}/messages` (reengajamento) — header em `:486`
  - `:623` `PATCH /leads/{id}` (encerramento da conversa) — header em `:625`
- **Impacto funcional**: lembrete de reunião, reengajamento de 24h e encerramento de conversa de 48h param de escrever no CRM. Num piloto cujo KPI de vitrine é taxa de comparecimento, o lembrete de reunião morrer em silêncio é material.
- **Por que está latente agora**: as únicas linhas devidas em `agenda_envios` são as 2 linhas inertes de `test-tenant-lote6c`, cujo `tenantSlug` não existe em `tenant_config` — o lookup devolve vazio e a cadeia morre **antes** do nó HTTP. Por isso as execuções recentes aparecem como `success` em ~200ms. Na primeira reunião real de `triangulo` que vencer, volta a dar 401.
- **Fix task**:
  - **What**: migrar os 5 call sites de `scheduler.ts` para `authentication: "genericCredentialType"` + `genericAuthType: "httpHeaderAuth"` com a credencial `Crivo - chave de servico` (`YhGcdfGtdEBBU9YP`), acrescentando `X-Crivo-Tenant` com o `tenantSlug` — exatamente o padrão já aplicado em `principal.ts:1105-1121`. Remover `apiKey` dos 3 Code nodes que o propagam (`:114`, `:416`, `:603`) e das saídas de exemplo (`:97`, `:117`, `:203`, `:399`, `:419`, `:588`, `:606`).
  - **Where**: `n8n/workflows/scheduler.ts`; regenerar `n8n/generated/scheduler.ts` por `node scripts/n8n-inline.mjs`; publicar por MCP.
  - **Verify**: disparar o scheduler com uma linha de `agenda_envios` real de `triangulo` vencida e confirmar por `get_execution` que o nó HTTP responde 2xx; conferir por `get_workflow_details` que nenhum `headerParameters` com `Authorization` sobrou.
  - **Done when**: `grep -rn "Authorization" n8n/workflows/` não devolve nenhum `headerParameters`; nenhuma referência a `apiKey` em `n8n/workflows/scheduler.ts`; execução real confirmada; `n8n/generated/` byte-idêntico ao publicado.
- **Lição de processo**: remover uma coluna compartilhada exige inventariar todos os consumidores. O Done-when do T17 dizia "nenhum `Authorization` sobra **em `principal.ts` nem nos 2 sub-workflows**" — o escopo da checagem foi menor que o raio de alcance da mudança. Registrada como **L-015** na rodada 1.

#### Verificação do fix (rodada 2 — verificador independente, não o autor da correção)

Cada item abaixo foi re-derivado da fonte primária; nenhum aceito por relato.

| Done-when do Fix 1 | Como foi checado nesta rodada | Resultado |
| ------------------ | ----------------------------- | --------- |
| Nenhum `Authorization` em `headerParameters` sob `n8n/workflows/` | `grep -rn "Authorization" n8n/workflows/` | Único hit é um **comentário** em `principal.ts:1094`; nenhum `headerParameters`. ✅ |
| Nenhuma referência a `apiKey` em `n8n/workflows/scheduler.ts` | `grep -ci "apikey"` (case-insensitive) | **0** — e **0** também em `n8n/generated/scheduler.ts`. ✅ |
| 5 call sites migrados | leitura do arquivo + contagem | 5 nós `n8n-nodes-base.httpRequest`, 5 `genericCredentialType`, 5 `genericAuthType: "httpHeaderAuth"`, 5 `X-Crivo-Tenant`, 5 `credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") }`. ✅ |
| `n8n/generated/` coerente com a fonte | mesmas contagens no arquivo gerado (5/5/5) e `--stat` mostrando os dois arquivos no mesmo commit | ✅ |
| Header do tenant vem do `tenantSlug` já existente em cada nó | leitura de cada expressão | `$('Code: combinar lembrete e tenant').item.json.tenantSlug`, `$('Code: canal do lembrete').first().json.tenantSlug` (o `...ctx` do Code node propaga `tenantSlug`), `$json.tenantSlug` (reengajamento), `$('Code: combinar reengajamento e tenant').first().json.tenantSlug`, `$json.tenantSlug` (escalonamento). Todas resolvem contra um objeto que comprovadamente carrega `tenantSlug`. ✅ |
| `apiKey` removido dos 3 Code nodes que o propagavam | leitura do `jsCode` de `Code: combinar lembrete e tenant`, `Code: combinar reengajamento e tenant`, `Code: combinar escalonamento e tenant`, na fonte **e** na versão publicada | Nenhum dos três monta `apiKey`; `Code: combinar escalonamento e tenant` deixou de ler `$json` do tenant por completo. Varredura de todos os Code nodes do workflow publicado: **0** com `apiKey`. ✅ |
| Publicado e ativo na instância | `get_workflow_details(gmIWxiRrHGIdtPub)` | `active: true`, `isArchived: false`, `versionId = 06add4c3-4e73-4a93-939b-dc976374b208` **igual** a `activeVersionId`, `updatedAt: 2026-08-23T02:30:12.678Z`. Varredura do JSON inteiro: **0** ocorrências de `apiKey`, **0** de `Authorization`. ✅ |
| Versão publicada não é autosave do editor | `get_workflow_history(gmIWxiRrHGIdtPub)` | Versão mais recente `06add4c3-…`, `autosaved: false`, autoria "Arthur Tosta (via MCP)". A armadilha conhecida (autosave do editor sobrescrevendo publicação por MCP) **não ocorreu**. ✅ |
| Conteúdo da versão publicada == fonte | `get_workflow_version(gmIWxiRrHGIdtPub, 06add4c3-…)` | Os 5 nós HTTP publicados trazem `authentication: "genericCredentialType"`, `genericAuthType: "httpHeaderAuth"` e um único header `X-Crivo-Tenant`, com as mesmas expressões da fonte. ✅ |
| Execução **897** realmente mostra o 401 do esquema antigo | `get_execution(gmIWxiRrHGIdtPub, 897, includeData: true)`, chamada por mim | `status: error`. `Data Table: tenant do lembrete` devolveu a linha real de `triangulo` (`phoneNumberId: 1321478747709350`, `calendarId`) **sem campo `apiKey`**; `Code: combinar lembrete e tenant` propagou o contexto do lead `9ed1e79b-…` **sem `apiKey`**; o nó HTTP tinha `authentication: "none"` + `Authorization: =Bearer {{ ….apiKey }}` e recebeu **`401`** com `code: "nao-autenticado"` do deploy de produção. A citação da rodada 1 confere byte a byte. ✅ |
| Credencial de serviço existe e é do tipo certo | `list_credentials(query: "Crivo")` | `YhGcdfGtdEBBU9YP` · `Crivo - chave de servico` · tipo `httpHeaderAuth`. ✅ |
| Workflow scratch não ficou vivo | `get_workflow_details(MuJojnEv7X0emzPT)` | A API recusa: *"Workflow 'MuJojnEv7X0emzPT' is archived and cannot be accessed"* — arquivamento confirmado pelo próprio comportamento da instância, mais forte que ler uma flag. ✅ |

**Limitação de evidência declarada (não é lacuna de correção, é lacuna de observabilidade)** — dois pontos que **não** consegui re-derivar, e que registro em vez de esconder:

1. **A execução 1649 do workflow scratch não é mais consultável.** Arquivar `MuJojnEv7X0emzPT` tornou inacessíveis também as suas execuções: tanto `get_execution` quanto `search_executions` recusam com o mesmo erro de workflow arquivado. Ou seja, o artefato que o orquestrador escolheu como prova ao vivo do fix **destruiu a si mesmo** ao ser limpo. Não afirmo tê-lo visto.
2. **O vínculo da credencial nos 5 nós ao vivo não é legível.** Esta instância **redige o campo `credentials` de todo nó** nas respostas de leitura — confirmado por mim de forma independente: os 3 nós `n8n-nodes-base.whatsApp` deste mesmo workflow, que comprovadamente têm credencial vinculada (enviaram mensagem real, `wamid` da execução 1627), também aparecem **sem** chave `credentials`. A ausência, portanto, não discrimina nada e não é achado.

**Julgamento próprio sobre marcar AC2 como PASS apesar disso**: a AC exige que toda chamada `/api/v1/*` do agente siga autenticada. O que é observável está provado — os 5 nós, na fonte e na versão publicada e ativa, usam a **mesma** configuração de autenticação que a rodada 1 já provou funcionando em produção contra o **mesmo** deploy e os **mesmos** endpoints (execuções 1020/1072/1627/1631), e o esquema quebrado sumiu de todos os lugares. O único elo não observável é indistinguível entre nós sabidamente bons e ruins nesta instância, e forçar uma prova ao vivo agora exigiria disparar o scheduler com uma linha real vencida — o que dispara envio de WhatsApp a um lead de verdade, fora do alcance de um verificador read-only. Registro ainda que **nenhuma execução de produção pós-fix chegou a um nó HTTP**: a última é a **1648**, de `2026-08-23T02:30:00Z`, ~12s **antes** da publicação, e as execuções recentes morrem em ~160ms por não haver linha devida — exatamente o estado latente que a rodada 1 descreveu. A confirmação definitiva virá na primeira reunião real que vencer; recomendo ao orquestrador conferir a execução correspondente quando ela existir.

---

## Lacunas conhecidas e aceitas (confirmadas, não são achados novos)

1. **PRIV-01 AC5 provada por leitura de código + consulta ao banco, não por chamada HTTP autenticada ao vivo.** Re-verifiquei os dois lados de forma independente: `src/server/integration/context.ts:53` aplica `or(isNull(expiresAt), gt(expiresAt, now()))` **na própria query de leitura**, então a exclusão não depende do cron ter rodado; e minha consulta a produção devolveu `EXPIRED_NOW_COUNT: 0`, com exatamente 3 documentos com `expiresAt`, todos `2027-01-01`, um por tenant. **Julgamento próprio: substituição de evidência aceitável, não lacuna de cobertura.** Uma chamada HTTP ao vivo hoje seria vacuamente verdadeira (não há documento expirado para excluir), e obter uma chave em claro exigiria reseed — rotacionando credencial real de produção. O enquadramento do autor é honesto e correto.
2. **Itens do `Out of Scope` do `spec.md`** (usuários/papéis, atribuição por agenda, 2º número de teste, respostas humanas pelo Chats, `baseline_*` de piloto) — deferidos pela AD-020 e pela própria spec. Não são lacunas deste lote.
3. **Dívida herdada, fora de escopo**: L4 Fix 2 (DASH-06 AC2 sem artefato) e L5 Fix 1 (413/JSON inválido sem teste dedicado em `POST /api/v1/leads`). Sem relação com este lote.
4. **Evidência de screenshot** (T6, T10, T11, T19–T21) foi fornecida ao vivo pelo usuário e **não é re-verificável por mim** — não são arquivos que eu possa reabrir. Limitação aceita e prevista: a matriz de cobertura do `design.md` classifica essa AC como "manual, orquestrador". Não afirmo tê-las visto.
5. **(rodada 2) A prova ao vivo do Fix 1 se apagou junto com o workflow scratch.** A execução **1649** de `MuJojnEv7X0emzPT` não é consultável porque o workflow foi arquivado, e a instância bloqueia leitura de execuções de workflow arquivado. É o mesmo padrão da observação 6 abaixo, numa segunda encarnação: **a evidência de smoke foi destruída pela limpeza do próprio artefato de smoke**. Higiene recomendada para o futuro: exportar/transcrever o resultado da execução de verificação **antes** de arquivar o workflow scratch, ou deixá-lo desativado em vez de arquivado até o Verifier fechar. Não invalida a AC2 — ver o julgamento no bloco *Verificação do fix* —, mas significa que a rodada 2 provou a configuração, não a execução.
6. **Estado final de 2 dos 5 leads citados não é mais consultável no banco.** `91f0d096-…` (T19), `cce3da4d-…` (T20) e `c85e0692-…` (T21 rodada 1) foram apagados por um reseed posterior de produção. **Isso não invalida as ACs**: reconstruí o estado final dos dois primeiros a partir do log de execução do n8n, que é imutável e guarda a **resposta do próprio CRM de produção** no momento (execução 1022 para T19, execução 1072 para T20). Registro como observação de higiene: reseed de produção destrói evidência de smoke; conversas de prova deveriam rodar no tenant de demonstração ou ter o estado exportado na hora.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| ----------- | --------------- | ---------- |
| REAL-01 | Implementing | ✅ Verified |
| KPI-01 | Implementing | ✅ Verified |
| ATRIB-01 | Implementing | ✅ Verified |
| ATRIB-02 | Implementing | ✅ Verified |
| KPI-02 | Implementing | ✅ Verified |
| SEC-01 | Implementing (rodada 1: ❌ Needs Fix — AC2) | ✅ Verified (rodada 2, após `76e2d6d`) |
| PRIV-01 | Implementing | ✅ Verified |
| SMOKE-01 | Implementing | ✅ Verified |
| SHELL-01 | Implementing | ✅ Verified |

**Checagem estrutural do `spec.md`** (re-conferida na rodada 2): os 9 requirement IDs seguem em `spec.md:230-238`, cada um com referências de task e status `Implementing`, **intocados** por esta rodada — o `git diff 7680752..76e2d6d --stat` não inclui `spec.md`. O salto para `Verified` cabe ao orquestrador depois deste relatório; agora **os 9**, SEC-01 incluído, estão liberados para subir.

**Checagem estrutural da AD-020 (`.specs/STATE.md`)** — re-conferida na rodada 2, e igualmente **não tocada** pelo commit do fix:
- ✅ AD-020 aparece **depois** de AD-019 (linha 165; AD-019 termina em 163), sem sobrescrever nada.
- ✅ AD-006 (linha 51) lê `**Status**: amended by AD-020`.
- ✅ A seção `## Handoff` (linha 173+) **não foi tocada** por essa edição — segue descrevendo "T1–T21 Done, T22 Pending, Verifier NÃO rodou". Regra de escrita por seção respeitada. O conteúdo está desatualizado por consequência esperada; atualizar o Handoff é ação de fechamento do orquestrador.

---

## Summary

**Overall**: ✅ Pronto — o único bloqueador foi corrigido e re-verificado; nada mais em aberto.

**Spec-anchored check**: **40/40** ACs com resultado igual ao definido na spec; **0 GAP**; 0 spec-precision gaps. 7 ACs de UI/manual atestadas por captura real, fora do alcance de re-verificação do Verifier por desenho.
**Sensor**: 5/5 mutações mortas (tier P0), da rodada 1. Não re-executado na rodada 2 por decisão consciente: o fix não toca nenhum dos 4 arquivos mutados (`src/lib/broker-assignment.ts`, `src/server/data/index.ts`, `src/server/integration/auth.ts`, e as suítes correspondentes) nem qualquer arquivo com cobertura automatizada, e o `--stat` do commit confirma isso.
**Gate (re-executado na rodada 2)**: 693 passed, 0 failed, 0 skipped, 55 arquivos; lint 0 erros; build verde.

**O que funciona**: a Fase 9 entrega o que prometeu no núcleo. Os tenants-piloto operam só com dado real; todo lead do contrato nasce com corretor (provado em produção em 2 leads distintos); `first_response_at` é gravado uma única vez e o KPI-carro-chefe do PRD tem valor real pela primeira vez (~18s num lead real); comparecimento ganhou caminho de escrita com três estados e limite correto; a chave de tenant saiu do texto claro e o `authenticate()` de dois modos tem precedência provada por teste discriminante; e os três desfechos da conversa estão provados por execução real, com todos os ids e o evento do Calendar reconferidos por mim na instância. O smoke da Phase 4 se pagou: achou 6 defeitos reais que nenhum teste automatizado alcançaria, incluindo uma violação de LGPD (confirmação de opt-out nunca entregue) que agora está corrigida e verificada por `wamid` real.

**Issues found**: nenhum em aberto. O único achado do lote — **SEC-01 AC2**, `crivo-agente-scheduler` sem autenticação no CRM depois que o T17 removeu `tenant_config.apiKey` e migrou só os 3 workflows que revisou — foi corrigido em `76e2d6d` e re-verificado por um segundo verificador independente: os 5 call sites migraram para a credencial de serviço + `X-Crivo-Tenant`, `apiKey`/`Authorization` sumiram da fonte, do arquivo gerado e do workflow publicado, e a versão ativa na instância (`06add4c3-…`, `autosaved: false`) é a nova. A execução **897** foi reconsultada e confirma o 401 original nos próprios dados de nó. Fica registrada uma limitação de evidência, não um defeito: a execução ao vivo que o orquestrador usou para provar o fix (**1649**) deixou de ser consultável quando o workflow scratch foi arquivado, e o vínculo de credencial não é legível para nenhum nó nesta instância — a rodada 2 provou a configuração publicada, não uma execução pós-fix. Ver *Verificação do fix* e a Lacuna 5.

**Recomendação de fechamento**: subir os 9 requirements de `Implementing` para `Verified` no `spec.md`, atualizar a seção `## Handoff` do `.specs/STATE.md` (segue descrevendo "T22 Pending, Verifier NÃO rodou") e, na primeira reunião real de `triangulo` que vencer, conferir a execução do scheduler correspondente para ter também a prova de execução do Fix 1.

**Next steps**: nenhum bloqueador restante — o lote pode fechar. (Histórico: a rodada 1 pediu rotear o Fix 1 a um implementador e re-verificar; feito em `76e2d6d` e nesta rodada 2.)
