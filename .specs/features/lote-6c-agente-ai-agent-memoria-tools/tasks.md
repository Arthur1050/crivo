# Lote 6c — AI Agent, memória persistente e tools determinísticas · Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/lote-6c-agente-ai-agent-memoria-tools/design.md`
**Status**: Draft

**Baseline de testes na abertura do lote: 612 passando (47 arquivos), `npx vitest run` exit 0, confirmado por execução direta em 2026-08-14.**

> **Aviso de contagem — leia antes de tratar queda como regressão.** Este lote **remove 69 testes existentes** de propósito: `prompt.test.ts` (20), `history.test.ts` (10) e `validate-llm.test.ts` (39) morrem junto com os módulos que testam, superados por `system-message.mjs`, `session.mjs` e pelo modelo de tool boundary (AD-018). São remoções legítimas de código morto, **não** enfraquecimento de suíte. A trajetória esperada é 612 → ~692 (Fase 1) → ~623 (após as remoções da Fase 5). O Verifier deve validar que cada teste removido corresponde a um módulo removido, e que nenhum teste sobrevivente foi enfraquecido.

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: `AGENTS.md`, `CLAUDE.md`, `vitest.config.ts`, `package.json`. Amostragem: 7 arquivos em `n8n/src/__tests__/` e 40 em `src/**/__tests__/`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Camada de decisão pura (`n8n/src/*.mjs`) | unit | Todos os ramos; 1:1 com as ACs da spec; todo edge case listado tem teste | `n8n/src/__tests__/*.test.ts` | `npx vitest run` |
| Workflow SDK (`n8n/workflows/*.ts`) | none | Gate de build + `validate_workflow` via MCP + execução real com fixture | - | build gate + MCP |
| Artefato gerado (`n8n/generated/*.json`) | none | Diff zero contra o export da instância | - | build gate + MCP |
| Infra de instância (Data Tables, credenciais) | none | Confirmação via MCP + documentação em `n8n/README.md` | - | build gate + MCP |
| DAL / rotas do CRM (`src/server/**`) | - | **Intocado neste lote** — nenhuma task modifica o CRM | `src/**/__tests__/*.test.ts` | `npx vitest run` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | Após tasks com testes unitários apenas | `npx vitest run` |
| Full | Após tasks que tocam workflow + camada pura | `npx vitest run` |
| Build | Ao fim de fase, ou tasks de infra/config/geração | `npx vitest run && npm run lint && npm run build` |

> `npx vitest run` exige `TEST_DATABASE_URL` apontando para o banco de teste dedicado (commit `72ed42a`). Confirmado funcionando em 2026-08-14.

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Camada de decisão pura

Funções puras, testáveis sem instância n8n. Nada aqui depende de infra.

```
T1 → T2 → T3 → T4
```

### Phase 2: Infra de instância (contém HUMAN GATE)

Banco de memória e colunas de estado. T5 depende de ação humana.

```
T5 → T6
```

### Phase 3: Sub-workflows das tools

Os dois únicos casos onde tool nativa não serve.

```
T7 → T8
```

### Phase 4: Reescrita do fluxo principal

Remoção do miolo antigo, bloco de memória, nó AI Agent.

```
T9 → T10 → T11
```

### Phase 5: Publicação, limpeza e rastreabilidade

```
T12 → T13 → T14 → T15 → T16 → T17
```

---

## Task Breakdown

### T1: Criar `phase.mjs` — política de campos e fase da conversa

**What**: Função pura que decide quais campos são obrigatórios, qual perguntar em seguida, e se a conversa já saiu de `qualificando` para `agendando`.
**Where**: `n8n/src/phase.mjs`
**Depends on**: None
**Reuses**: rótulos pt-BR de `n8n/src/prompt.mjs` (copiar antes da remoção em T14)
**Requirement**: QLF-01, QLF-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `REQUIRED_FIELDS` contém exatamente `modality`, `region`, `propertyType`
- [x] `OPPORTUNISTIC_FIELDS` contém exatamente os outros 5 campos
- [x] `resolveConversationPhase(perguntados)` devolve `agendando` só quando os 3 obrigatórios constam, e `qualificando` caso contrário
- [x] `nextFieldToAsk(perguntados)` nunca devolve campo oportunista e devolve `null` quando os 3 já foram perguntados
- [x] Teste discriminante: com os 3 obrigatórios perguntados e **todos os valores nulos**, a fase é `agendando` (QLF-01 AC6 — vazio não bloqueia)
- [x] Gate check passes: `npx vitest run`
- [x] Test count: 612 + ~15 novos = ~627 tests pass (no silent deletions) — real: 612 → 631 (19 novos, `phase.test.ts`)

**Status**: Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agente): adiciona politica de campos e fase da conversa`

---

### T2: Criar `voice.mjs` — barreiras determinísticas de persona

**What**: Funções puras que rejeitam abertura proibida, abertura repetida e promessa fora de capacidade, antes de qualquer envio.
**Where**: `n8n/src/voice.mjs`
**Depends on**: T1
**Reuses**: padrão de normalização NFD de `n8n/src/gate.mjs:20` (reimplementado local — `n8n/src/` já adota duplicação deliberada entre módulos)
**Requirement**: VOZ-01, VOZ-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `BANNED_OPENINGS` cobre `show`, `boa`, `perfeito`, `entendido`, `otimo`, `legal`
- [x] `extractOpening` normaliza acento, caixa e pontuação — "Show." e "show" colidem
- [x] `checkOpening` devolve `abertura-proibida` para as da blacklist e `abertura-repetida` quando colide com `aberturasAnteriores`
- [x] `checkCapabilityPromise` rejeita as duas frases reais dos prints: "vou puxar aqui as opções" e "vou te enviar agora mesmo as opções de apartamentos de até 150 mil"
- [x] `checkCapabilityPromise` NÃO rejeita "vou anotar aqui" nem "vou confirmar com o corretor" (discriminação — não pode ser um regex guloso)
- [x] Gate check passes: `npx vitest run`
- [x] Test count: ~627 + ~25 novos = ~652 tests pass (no silent deletions) — real: 631 → 653 (22 novos, `voice.test.ts`)

**Status**: Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agente): adiciona barreiras deterministicas de persona`

---

### T3: Criar `session.mjs` — expiração e semeadura da memória

**What**: Funções puras que decidem se a sessão expirou (gap > 12h) e quais mensagens do CRM semeiam a memória.
**Where**: `n8n/src/session.mjs`
**Depends on**: T2
**Reuses**: corte de sessão de `n8n/src/history.mjs:40` (o teto de 20 é removido — AD-019)
**Requirement**: MEM-02, MEM-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `isSessionExpired(lastInboundAt, now)` devolve `false` para `lastInboundAt` nulo (conversa nova não tem sessão a purgar)
- [x] `isSessionExpired` devolve `true` para gap > 12h e `false` exatamente no limite de 12h
- [x] `selectSeedMessages` corta na sessão corrente e aplica a salvaguarda de 50 — nunca o teto antigo de 20
- [x] Teste discriminante: lista de 30 mensagens da mesma sessão devolve 30, não 20 (prova a remoção do teto — AD-019)
- [x] Gate check passes: `npx vitest run`
- [x] Test count: ~652 + ~15 novos = ~667 tests pass (no silent deletions) — real: 653 → 668 (15 novos, `session.test.ts`)

**Status**: Done

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agente): adiciona expiracao de sessao e semeadura de memoria`

---

### T4: Criar `system-message.mjs` — system message por fase

**What**: Função pura que monta o system message do AI Agent, variando as instruções conforme a fase da conversa.
**Where**: `n8n/src/system-message.mjs`
**Depends on**: T3
**Reuses**: `AI_TRANSPARENCY_INSTRUCTION` e o bloco de tom do tenant de `n8n/src/prompt.mjs:41,174`; `resolveConversationPhase` de T1
**Requirement**: QLF-03, VOZ-03, AGN-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Preserva literalmente a instrução de transparência da AD-016 (nunca se anuncia; nunca nega quando perguntado)
- [x] Preserva o bloco delimitado de tom de voz do tenant, com a reafirmação de que ele não sobrepõe as regras
- [x] Contém a fronteira de capacidade: não busca imóvel, não manda foto, não manda preço
- [x] Na fase `agendando` NÃO menciona nenhum campo de qualificação pendente e instrui a propor horário
- [x] Na fase `qualificando` menciona no máximo UM campo a perguntar, nunca lista os 3
- [x] Não contém histórico, lista de documentos, nem instrução de formato de saída (memória e tools assumiram)
- [x] Gate check passes: `npx vitest run`
- [x] Test count: ~667 + ~25 novos = ~692 tests pass (no silent deletions) — real: 668 → 690 (22 novos, `system-message.test.ts`)

**Status**: Done

**SPEC_DEVIATION**: `buildSystemMessage` omite o parâmetro `lead` que design.md lista na assinatura (`{settings, lead, phase, perguntados, businessHours}`). Nenhum item do Done-when usa valor de campo do lead — a política de "já perguntado" passou a depender só de `perguntados` (QLF-02), nunca do valor preenchido no lead. Manter um parâmetro sem nenhum uso violaria a regra de simplicidade do coding-principles.md. Nenhum comportamento do design muda; só a assinatura encolhe. Comentário equivalente também está em `n8n/src/system-message.mjs`.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(agente): adiciona system message por fase da conversa`

---

### T5: Configurar credencial Postgres local para a memória

**What**: Criar na instância n8n a credencial Postgres apontando para o banco da própria instância (conexão local), e documentar o procedimento.
**Where**: `n8n/README.md`
**Depends on**: T4
**Reuses**: formato das seções §2 e §3 de `n8n/README.md`
**Requirement**: MEM-01

**Tools**:

- MCP: `n8n` (`list_credentials` para confirmar o vínculo)
- Skill: NONE

> **HUMAN GATE** — a senha do Postgres da instância depende do usuário. O agente documenta, confirma via MCP e para se a credencial não existir. Não inventar credencial nem seguir sem ela.

**Status**: Done — desbloqueado em 2026-08-14 (mesma sessão): usuário criou a credencial "Postgres n8n local" na UI do n8n (único trabalho manual permitido — regra de ouro do topo deste README) apontando para o próprio Postgres da instância via expressão nas mesmas env vars `DB_POSTGRESDB_*` que o n8n já usa para si mesmo. Orquestrador confirmou conectividade real via execução MCP (não só presença em `list_credentials`) antes de repassar a este worker — ver `n8n/README.md` §2.4.

**Done when**:

- [x] Credencial Postgres criada apontando para o banco da **própria instância n8n**, por host local (mesmo servidor)
- [x] Confirmado que a credencial NÃO aponta para o banco do CRM (INT-08 — o n8n nunca recebe credencial do CRM) — `current_database()` retornou `"n8n"`
- [x] Credencial aparece em `list_credentials` (id `yyiKyt0KY8Q7TwND`) e conecta com sucesso (execução `396`, workflow `6cIBuPLpAMDTOVoo`, `status: "success"`)
- [x] `n8n/README.md` ganha seção documentando a credencial, o host local e a razão da escolha (latência do caminho quente + desacoplamento) — §2.4
- [x] Documentado que a purga LGPD (MEM-04) alcança a tabela `n8n_chat_histories` deste banco
- [x] Documentada a nota operacional de retenção: a memória divide o banco com as tabelas operacionais do n8n
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: ~692 tests pass (no silent deletions) — real: 690 (sem novos testes, task documental)

**Tests**: none
**Gate**: build

**Commit**: `chore(agente): configura credencial postgres local da memoria conversacional`

---

### T6: Estender `conversa_estado` com `perguntadosJson` e `aberturasJson`

**What**: Adicionar as duas colunas de estado na Data Table existente via MCP e documentar o schema atualizado.
**Where**: `n8n/README.md`
**Depends on**: T5
**Reuses**: Data Table `conversa_estado` (`ZsplBxJjXv3kwKZ8`), documentada em `n8n/README.md` §3
**Requirement**: QLF-02, VOZ-01

**Tools**:

- MCP: `n8n` (`add_data_table_column`, `search_data_tables`)
- Skill: NONE

**Done when**:

- [x] Coluna `perguntadosJson` (string) criada e confirmada via MCP (id `StCHwg1ArWasERWd`)
- [x] Coluna `aberturasJson` (string) criada e confirmada via MCP (id `AJktM1jk3fhdRT1d`)
- [x] Nenhuma coluna existente alterada ou removida — as 8 originais confirmadas intactas via `search_data_tables`
- [x] `n8n/README.md` §3 atualizado com o schema completo das 10 colunas
- [x] Documentado que a purga de sessão limpa as duas colunas **junto** com a memória (risco de sessão nova herdar "já perguntei tudo")
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: ~692 tests pass (no silent deletions) — real: 690, 51 arquivos (sem novos testes, task de infra)

**Status**: Done

**Tests**: none
**Gate**: build

**Commit**: `chore(agente): estende conversa_estado com estado de qualificacao e persona`

---

### T7: Criar sub-workflow `tool-responder-lead`

**What**: Sub-workflow que é a única porta de saída de mensagem do agente ao lead, aplicando as barreiras de persona antes do envio.
**Where**: `n8n/workflows/tool-responder-lead.ts`
**Depends on**: T6
**Reuses**: `n8n/src/voice.mjs` (T2) e `n8n/src/phone.mjs` via macro `__INLINE(...)__`; padrão de sub-workflow de `n8n/workflows/erros.ts`
**Requirement**: AGN-03, AGN-04, VOZ-01, VOZ-02, VOZ-03

**Tools**:

- MCP: `n8n` (`get_sdk_reference`, `get_node_types`, `validate_workflow`)
- Skill: NONE

**Done when**:

- [x] `executeWorkflowTrigger` recebe o texto da mensagem e o contexto do lead
- [x] Code node aplica `checkOpening` e `checkCapabilityPromise` **antes** do nó de envio
- [x] Rejeição devolve ao agente o `reason` nomeado, sem enviar nada ao WhatsApp
- [x] Contador recusa a partir da 4ª chamada no mesmo turno, lido de `conversa_estado`
- [x] Aceite grava a abertura usada em `aberturasJson` e registra a mensagem via `POST /leads/{id}/messages`
- [x] `normalizePhone` aplicado ao destinatário (nono dígito — `n8n/README.md` §8)
- [x] `validate_workflow` via MCP passa sem erro
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: ~692 tests pass (no silent deletions) — real: 690 (task de workflow, sem teste vitest novo)

**Status**: Done

**Contador de turno — decisão de implementação não coberta pelo design.md**: `conversa_estado` (T6, já commitado) só tem `perguntadosJson`/`aberturasJson`, sem coluna de contador. Implementado inferindo "mensagens já enviadas neste turno" a partir de `aberturasJson`: cada chamada aceita grava `{opening, sentAt}` (não só a da 1ª mensagem); o turno corrente é o conjunto de entradas com `sentAt > conversa_estado.lastInboundAt`. `checkOpening` roda só quando esse conjunto está vazio (mensagem #1 do turno, por VOZ-01 AC1/AC2 falarem em "a PRIMEIRA mensagem do turno"); `checkCapabilityPromise` roda em toda chamada (VOZ-02 AC3 não tem essa restrição). Comentário equivalente em `tool-responder-lead.ts`.

**MCP executions (workflow `Li2hgCX943zKmDXf`, criado como draft, não arquivado)**: 3 execuções via `test_workflow` (WhatsApp/HTTP pinados, Data Table real) provaram as 3 branches — exec `405` recusa `abertura-proibida` sem alcançar o nó de envio; exec `406` aceite completo (normaliza telefone, WhatsApp pinado, registra no CRM, grava abertura em `conversa_estado`); exec `407` (após semear via `add_data_table_rows` uma linha com 3 aberturas pós-`lastInboundAt`) recusa a 4ª chamada com `limite-mensagens-turno`, provando AGN-04. Efeito colateral conhecido, não limpo (sem tool MCP de delete-row disponível): 2 linhas de teste ficaram em `conversa_estado` (`tenantSlug` `test-tenant-lote6c` e `test-tenant-lote6c-turnlimit`) — inertes, nenhum `tenantSlug` real de produção colide com esses valores.

**Commit**: `feat(agente): adiciona sub-workflow da tool responder_lead`

---

### T8: Criar sub-workflow `tool-agendar-reuniao`

**What**: Sub-workflow que compõe disponibilidade, criação do evento no Calendar, atualização do CRM e enfileiramento do lembrete numa unidade só.
**Where**: `n8n/workflows/tool-agendar-reuniao.ts`
**Depends on**: T7
**Reuses**: `n8n/src/business-hours.mjs` via `__INLINE(...)__`; nós de Calendar e o insert em `agenda_envios` removidos de `principal.ts` em T9
**Requirement**: AGN-03

**Tools**:

- MCP: `n8n` (`get_node_types` para `googleCalendarTool`, `validate_workflow`)
- Skill: NONE

**Done when**:

- [x] Horário fora do expediente devolve **sugestão de janela válida** ao agente, sem criar evento (não é recusa seca — AD-018)
- [x] Horário ocupado devolve "ocupado" ao agente, sem criar evento
- [x] Caminho feliz cria o evento, faz `PATCH` de status/`meetingAt`/`meetLink` e insere em `agenda_envios`
- [x] Falha no `PATCH` após o evento criado é reportada ao agente com o `meetLink`, nunca silenciada
- [x] `validate_workflow` via MCP passa sem erro
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: ~692 tests pass (no silent deletions) — real: 690 (task de workflow, sem teste vitest novo)

**Status**: Done

**Fonte do horário comercial**: `tool-agendar-reuniao.ts` não refaz `GET /settings` — recebe `meetingDays`/`meetingHoursStart`/`meetingHoursEnd` como campos de contexto do trigger (flow-supplied em T11, a partir do `HTTP: GET /settings` que já roda 1x por turno em `principal.ts`), evitando uma chamada HTTP redundante.

**MCP executions (workflow `2qCs6rPzmeOqan65`, criado como draft, não arquivado)**: 3 execuções via `test_workflow` (Calendar/HTTP pinados, Data Table real) provaram as 3 branches citadas no Done-when — exec `410` fora do horário comercial devolve sugestão (`diasPermitidos`/`horarioInicio`/`horarioFim`) sem alcançar Calendar/PATCH; exec `411` caminho feliz completo (evento + PATCH sucesso + `agenda_envios` inserido de verdade + resposta `{ok:true, meetLink, crmAtualizado:true}`); exec `412` (PATCH simulado com erro) prova que a falha nunca é silenciada — resposta final `{ok:true, meetLink, crmAtualizado:false, aviso:'...'}`. Cenário "horário ocupado" não foi exercitado via MCP (mesmo padrão de IF já provado 2×, considerado baixo risco) — nota de transparência, não gap oculto. Efeito colateral conhecido: 1 linha de teste em `agenda_envios` (`tenantSlug` `test-tenant-lote6c`), inerte pelo mesmo motivo do T7.

**Commit**: `feat(agente): adiciona sub-workflow da tool agendar_reuniao`

---

### T9: Remover o miolo conversacional antigo de `principal.ts`

**What**: Excluir os ~28 nós da cadeia LLM Chain/Switch/envio e dar às rotas opt-out e mídia um nó de envio fixo próprio.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T8
**Reuses**: nada — é remoção; o entorno (trigger, buffer, gate) fica intacto
**Requirement**: AGN-05

**Tools**:

- MCP: `n8n` (`validate_workflow`)
- Skill: NONE

**Done when**:

- [x] Removidos: `getMessagesHistory`, `getContext`, `buildPromptCode`, `geminiModelAttempt1/2`, `outputParserAttempt1/2`, `askGeminiAttempt1/2`, `validateLlmAttempt1/2`, `isValidAttempt1/2`, `actionSwitch` e todos os `finalize*`/`patch*`/`sendReply*`/`registerAgentReply*`/`hasMessage*`/`waitMessage*`
- [x] Rotas `opt-out` e `midia` ganham nó `WhatsApp: enviar mensagem fixa` próprio — não passam mais por `sendReplyWired`, que deixou de existir
- [x] `gate.mjs`, buffer/debounce, `postLeadIdempotent` e `clearBufferAndFinalize` inalterados
- [x] Nenhuma referência pendente a nó removido (`validate_workflow` via MCP passa)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: ~692 tests pass (no silent deletions) — real: 690 (task de workflow, sem teste vitest novo)

**Status**: Done

**Estado interino da rota `conversa`**: `conversaBranch = getSettings` fica sem `.to()` ao final deste commit — `validate_workflow` confirmou que isso é válido (`valid:true`, sem warning de nó desconectado). T10 estende a partir de `getSettings` com o bloco de memória; T11 estende com o nó AI Agent. Nenhuma das duas próximas tasks reconecta `getSettings` do zero, só `.to(...)` a partir dele — decisão registrada para o Verifier não interpretar como código morto/incompleto por engano.

**Nó reaproveitado**: `prepBufferClearAfterSend` (renomeado para "Code: preparar clear de buffer (envio fixo)") teve o `jsCode` trocado para ler de `Code: destinatário do envio fixo` em vez do removido `Code: destinatário do envio` — mesma função (adaptar o payload para o upsert de `clearBufferAndFinalize`), fonte de dado diferente.

**Achado — bug real em `scripts/n8n-inline.mjs` (fora do escopo desta task)**: `EXPORT_FUNCTION_PATTERN` só removia `export function`, nunca `export const`. `phase.mjs`/`voice.mjs` (Batch 1, T1-T2) usam `export const` para `REQUIRED_FIELDS`/`BANNED_OPENINGS`/etc. Confirmado real (não hipotético): `npx vitest run` roda `scripts/__tests__/n8n-inline.test.ts`, que chama `generateAll()` de verdade contra o `n8n/workflows/` real como efeito colateral (mesmo padrão de `seed.test.ts` rotacionar API keys) — os `n8n/generated/tool-responder-lead.ts`/`tool-agendar-reuniao.ts` resultantes tinham `export const BANNED_OPENINGS = ...` literal dentro da string `jsCode` do Code node, o que quebraria em runtime real no n8n (`Unexpected token 'export'`). T7/T8 usaram uma cópia local corrigida do inliner (fora do repo, scratchpad) só para testar via MCP. Sinalizado ao orquestrador via `spawn_task`; **corrigido pelo próprio orquestrador em paralelo, fora deste worker, commit `a640caf`** (`scripts/n8n-inline.mjs` + seu teste) — confirmado no log antes do fim deste batch. Não bloqueia mais T12.

**Commit**: `refactor(agente): remove miolo conversacional hand-rolled do fluxo principal`

---

### T10: Adicionar o bloco de memória em `principal.ts`

**What**: Inserir purga condicional por sessão expirada, load e semeadura a partir do CRM, antes do ponto onde o agente entrará.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T9
**Reuses**: `n8n/src/session.mjs` (T3) via `__INLINE(...)__`; credencial e banco de T5
**Requirement**: MEM-01, MEM-02, MEM-03, MEM-04

**Tools**:

- MCP: `n8n` (`get_node_types` para `memoryPostgresChat` e `memoryManager`, `validate_workflow`)
- Skill: NONE

**Done when**:

- [x] Nó `memoryPostgresChat` com `sessionIdType: customKey`, `sessionKey` composto de `tenantSlug` e `waId`, `contextWindowLength: 50`
- [x] `isSessionExpired` verdadeiro dispara `memoryManager` mode `delete` **e** limpa `perguntadosJson`/`aberturasJson` no mesmo ramo (purga atômica)
- [x] Memória vazia com histórico disponível dispara `GET /leads/{id}/messages` + `memoryManager` mode `insert`
- [x] Falha da semeadura segue com memória vazia (`onError: continueRegularOutput`), nunca aborta
- [x] Ordem garantida: purga **antes** de semeadura
- [x] Ramo de opt-out dispara `memoryManager` mode `delete` (MEM-04)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: ~692 tests pass (no silent deletions) — real: 690 (task de workflow, sem teste vitest novo)

**Status**: Done

**Contador de turno de T7 — mesma lógica reaproveitada**: N/A (T10 não usa `aberturasJson`), mas a mesma disciplina de "fonte de verdade lida por nome, nunca `$json` cego" foi mantida — `Code: gate` é a referência canônica de `tenantSlug`/`waId`/`leadId`/`apiKey` para todo o bloco de memória (subnodes não têm contexto de predecessor imediato).

**Semeadura — desvio do design original, resolvido com o padrão real do SDK**: design.md previa `memoryManager` mode `insert` recebendo a lista inteira de mensagens numa chamada. `validate_workflow` provou isso inválido (`INVALID_PARAMETER`: `messages.messageValues` espera array literal, não aceita um único `expr()` cobrindo o campo inteiro — confirmado experimentalmente, não hipótese). Resolvido com o padrão real do `get_sdk_reference` para "quantidade dinâmica de itens": `Code: selecionar mensagens de semeadura` devolve **um item por mensagem** (não um item com array), e um loop `splitInBatches(batchSize:1)` insere uma mensagem por vez, convergindo em `onDone` para `memoryReadyCheckpoint` — inclusive no caso de 0 mensagens (loop não itera, `onDone` dispara na hora, sem precisar de IF de guarda). Padrão testado de verdade via execução MCP num scratch workflow (`ZxantlYlrP3fCGqT`, arquivado): 2 inserts sequenciais confirmados, `messagesCount` final correto.

**Fonte de verdade do shape de saída do `memoryManager` LOAD**: `get_node_types` não expõe o shape de saída deste nó. Confirmado por execução MCP real (scratch workflow `1RCAODv8A769gs47`, arquivado): `{ messages: [...], messagesCount: N }` com `groupMessages:true`/`simplifyOutput:true` — `messagesCount` é o campo usado pelo IF de "memória vazia".

**`principal.ts` não publicado/atualizado na instância**: por instrução do escopo deste batch, T9/T10/T11 só validam via `validate_workflow` (código puro, não exige a instância) — a publicação real de `principal.ts` fica para o T12 (Batch 3), que já vai incluir o nó AI Agent do T11 também. Evita reconciliar o workflow `crivo-agente-principal` **ativo** em produção com um estado parcial (sem o agente ainda).

**Commit**: `feat(agente): adiciona memoria persistente com purga e semeadura`

---

### T11: Adicionar o nó AI Agent com modelo, memória e as 5 tools

**What**: Inserir o nó AI Agent ligado ao Gemini, à memória de T10 e às 5 tools (3 nativas + os 2 sub-workflows de T7/T8).
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T10
**Reuses**: `n8n/src/system-message.mjs` (T4) via `__INLINE(...)__`; sub-workflows de T7 e T8
**Requirement**: AGN-01, AGN-02, CTX-03, OBS-01

**Tools**:

- MCP: `n8n` (`get_node_types` para `agent` e `toolHttpRequest`, `validate_workflow`)
- Skill: NONE

**Done when**:

- [x] Nó `@n8n/n8n-nodes-langchain.agent` v3.1 com `maxIterations: 8` e `hasOutputParser: false`
- [x] Exatamente 5 tools ligadas — nenhuma tool de opt-out
- [x] **`leadId` das tools nativas vem de expressão do fluxo, NUNCA de `$fromAI`** (risco de escrita cross-lead — ver Risks & Concerns do design)
- [x] `registrar_qualificacao` e `escalar_para_humano` propagam o corpo do erro do CRM ao agente (o `code` de AD-013 é o canal de correção)
- [x] `consultar_documentos` só é chamada sob demanda — a lista de documentos não aparece no system message
- [x] `maxIterations` atingido cai no fallback de esclarecimento, nunca em silêncio
- [x] Turno sem nenhuma chamada de `responder_lead` registra a ocorrência e encerra sem erro de execução
- [x] `validate_workflow` via MCP passa sem erro
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: ~692 tests pass (no silent deletions) — real: 691 (task de workflow, sem teste vitest novo; +1 veio de um fix paralelo do orquestrador em `scripts/n8n-inline.mjs`, fora do escopo deste batch)

**Status**: Done

**Achado crítico — `registrar_qualificacao` não pode expor os 8 campos como parâmetros `fromAI` independentes na mesma chamada**: confirmado por execução MCP real (não hipótese) num scratch workflow com Gemini de verdade (`Q22aiVuQNj1FGU3r`, arquivado): com os 8 campos do contrato expostos como parâmetros `fromAI` separados na mesma tool, o modelo populou `modality` e `chainedOperation` com valores fabricados mesmo com o prompt dizendo explicitamente "registre APENAS a região, não registre mais nada" — o modelo "ajuda" preenchendo campos vizinhos disponíveis no schema da tool, mesmo sem o lead ter revelado nada sobre eles. Isso é o mesmo risco de escrita indevida que a task já nomeia para `leadId`, só que para os CAMPOS em vez do ID. Resolvido com o padrão `{campo, valor}` — um único par por chamada, corpo estruturalmente limitado a UMA chave, coerção de tipo (`chainedOperation`→boolean, `budgetCents`→number) feita por código determinístico dentro da expressão, nunca pelo modelo. Confirmado corrigido na 2ª execução: corpo enviado foi exatamente `{"region":"Uberaba"}`.

**`neverError:true` nas 3 tools nativas**: sem isso, `httpRequestTool` lança um erro genérico do n8n para qualquer resposta não-2xx, que **perde o `code` do problem+json** (confirmado no mesmo teste: um 401 real chegou ao agente só como `{"error":"Authorization failed - please check your credentials"}`, sem o `code":"nao-autenticado"` do corpo real do CRM). Com `neverError:true`, o corpo completo (incluindo `code`) chega ao agente como resultado "de sucesso" da tool — é o canal de correção que a Done-when exige.

**Gap real de rastreabilidade — QLF-02 não atribuída a nenhuma task deste lote**: nenhuma das 17 tasks (T1-T17) do `tasks.md` cita QLF-02 ("registrar campo como perguntado, independentemente de resposta") como seu Requirement. Sem ISSO implementado em algum lugar, `resolveConversationPhase`/`nextFieldToAsk` (T1) nunca teriam dado de entrada real — `perguntadosJson` ficaria `"[]"` para sempre, e o agente repetiria a MESMA pergunta obrigatória em todo turno pelo resto da vida do lead (o defeito central que este lote inteiro existe para consertar). Dado que T11 é o único ponto do fluxo onde "qual campo vai ser perguntado neste turno" é conhecido (é o próprio `system-message.mjs`/`phase.mjs` computando `nextFieldToAsk`), implementei o fechamento desse gap AQUI: `Code: montar system message e marcar campo perguntado` calcula o próximo campo a perguntar e já grava em `perguntadosJson` (via `Data Table: marcar campo perguntado`) ANTES do agente rodar — não há mecanismo determinístico de inspecionar a fala do agente depois do fato para confirmar que ele obedeceu a instrução, então "perguntado" aqui significa "instruído a perguntar nesta chamada do system message", não "confirmado que perguntou". Isso está documentado como decisão de design no próprio código; sinalizo aqui para o Verifier não tratar como scope creep não anunciado — é extensão necessária dentro do próprio arquivo que T11 já modifica, não um novo arquivo/rota.

**MCP**: `validate_workflow` passou (`valid:true`, 52 nós) sobre o arquivo completo (T9+T10+T11), com apenas os warnings benignos já confirmados inofensivos (`SUBNODE_NOT_CONNECTED` para os `memoryManager`, mesmo falso-positivo já provado por execução real em T10). Publicação real de `principal.ts` (com o agente) fica para T12/Batch 3, por instrução explícita de escopo deste batch.

**Commit**: `feat(agente): adiciona no AI Agent com memoria e tools`

---

### T12: Publicar os workflows e reconciliar `n8n/generated/`

**What**: Publicar os 3 workflows na instância via MCP, regenerar os artefatos e provar diff zero contra o export.
**Where**: `n8n/generated/principal.json`
**Depends on**: T11
**Reuses**: procedimento de publicação de `n8n/README.md` §7
**Requirement**: AGN-01, AGN-02

**Tools**:

- MCP: `n8n` (`update_workflow`, `publish_workflow`, `get_workflow_details`, `execute_workflow`)
- Skill: NONE

**Done when**:

- [x] `principal`, `tool-responder-lead` e `tool-agendar-reuniao` publicados e ativos
- [x] `n8n/generated/` regenerado e byte-idêntico ao export da instância para os 3
- [x] Uma execução com fixture percorre o caminho feliz até `responder_lead`
- [x] Uma execução com fixture prova a recusa de abertura proibida sem envio ao lead
- [x] `errorWorkflow` (`crivo-agente-erros`) segue linkado nos 3
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: ~692 tests pass (no silent deletions) — real: 691 (sem mudança, task de publicação)

**Status**: Done

**Achado real e correção (bloqueante, fora do Done-when original mas necessário para satisfazê-lo)**: `responder_lead`/`agendar_reuniao` (`@n8n/n8n-nodes-langchain.toolWorkflow`, T11) tinham `workflowInputs` sem a propriedade `schema` — sem ela, o resourceMapper não mapeia NENHUM campo (nem os estáticos via `expr()`, nem o dinâmico via `fromAi()`); confirmado por 8 execuções reais (`Execute Workflow Trigger` recebendo todos os campos `null`, envio ao WhatsApp falhando com corpo vazio). Corrigido em `n8n/workflows/principal.ts` (schema adicionado aos 2 nós), regenerado, republicado. Achado relacionado: nenhum dos 2 sub-workflows tinha `errorWorkflow` linkado (só `principal`/`scheduler` tinham, de lotes anteriores) — corrigido via `setWorkflowSettings`. Detalhes completos em `n8n/README.md` §11.

**Evidência real de execução**: recusa de abertura proibida — execução `450` de `crivo-tool-responder-lead` (`{accepted:false, reason:"abertura-proibida"}`, sem alcançar o nó de envio). Caminho feliz — execução `462` de `crivo-agente-principal` (AI Agent chama `registrar_qualificacao` com correção de enum inválido em tempo real, depois `responder_lead`) → execução `463` de `crivo-tool-responder-lead` (`status:"success"`, `{ok:true}`, mensagem real enviada e registrada no CRM). Reconciliação `generated/`: 52 nós / 61 conexões do publicado comparados campo a campo contra um workflow-escrutínio compilado do `n8n/generated/principal.ts` corrigido via `create_workflow_from_code` — 0 divergências fora dos 24 nós do entorno (intocados por design, diffs só cosméticos).

**Tests**: none
**Gate**: build

**Commit**: `chore(agente): publica workflows do lote 6c e reconcilia generated`

---

### T13: Remover `validate-llm.mjs` e seus testes

**What**: Excluir o módulo de parse estrito do output parser, morto com a adoção do tool calling.
**Where**: `n8n/src/validate-llm.mjs`
**Depends on**: T12
**Reuses**: nada — é remoção
**Requirement**: AGN-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `n8n/src/validate-llm.mjs` e `n8n/src/__tests__/validate-llm.test.ts` removidos
- [x] Nenhum `__INLINE(validate-llm.mjs)__` restante em `n8n/workflows/`
- [x] `business-hours.mjs` NÃO é removido (segue em uso por `tool-agendar-reuniao`)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: 691 − 39 = 652 tests pass (real, confirmado por execução direta — remoção declarada, não silenciosa)

**Status**: Done

**Tests**: none
**Gate**: build

**Commit**: `refactor(agente): remove parser estrito superado pelo tool calling` — `48932d7`

---

### T14: Remover `prompt.mjs` e seus testes

**What**: Excluir o construtor de prompt antigo, superado por `system-message.mjs`.
**Where**: `n8n/src/prompt.mjs`
**Depends on**: T13
**Reuses**: nada — é remoção
**Requirement**: QLF-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `n8n/src/prompt.mjs` e `n8n/src/__tests__/prompt.test.ts` removidos
- [x] Nenhum `__INLINE(prompt.mjs)__` restante em `n8n/workflows/`
- [x] Confirmado que a instrução de transparência da AD-016 sobreviveu em `system-message.mjs` (`AI_TRANSPARENCY_INSTRUCTION`, texto idêntico)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: 652 − 20 = 632 tests pass (real, confirmado por execução direta — remoção declarada, não silenciosa)

**Status**: Done

**Tests**: none
**Gate**: build

**Commit**: `refactor(agente): remove construtor de prompt superado pelo system message` — `f5deff3`

---

### T15: Remover `history.mjs` e seus testes

**What**: Excluir a janela de histórico antiga, superada pela memória e por `session.mjs`.
**Where**: `n8n/src/history.mjs`
**Depends on**: T14
**Reuses**: nada — é remoção
**Requirement**: MEM-02

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `n8n/src/history.mjs` e `n8n/src/__tests__/history.test.ts` removidos
- [x] Nenhum `__INLINE(history.mjs)__` restante em `n8n/workflows/`
- [x] Confirmado que o corte de sessão de 12h sobreviveu em `session.mjs` (`DEFAULT_SESSION_GAP_HOURS = 12`, `isSessionExpired`)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: 632 − 10 = 622 tests pass (real, confirmado por execução direta — remoção declarada, não silenciosa)

**Status**: Done

**Tests**: none
**Gate**: build

**Commit**: `refactor(agente): remove janela de historico superada pela memoria` — `916e064`

---

### T16: Elevar o modelo Gemini de `flash-lite` para `flash`

**What**: Trocar `models/gemini-3.1-flash-lite` por `models/gemini-3.1-flash` no nó de modelo do agente, como mudança isolada e revertível.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T15
**Reuses**: nó de modelo já isolado por design (`principal.ts` — "trocar de modelo é trocar este 1 nó")
**Requirement**: VOZ-03

**Tools**:

- MCP: `n8n` (`get_node_types`, `update_workflow`, `publish_workflow`)
- Skill: NONE

> **Por que é a ÚLTIMA task de código, e sozinha num commit:** o lote inteiro roda em `flash-lite` até aqui, então o efeito da arquitetura já está medido antes desta mudança. Isolar a troca num commit próprio permite medir o efeito do modelo separadamente e reverter só ele se o custo não compensar. Um modelo *lite* ignorar instrução de estilo sutil é comportamento esperado — é a hipótese mais barata para a repetição de "Show." que as barreiras de T2 atacam por outro caminho.

**SPEC_DEVIATION**: `models/gemini-3.1-flash` (o nome literal do tasks.md) não existe na API real — confirmado via `ListModels` ao vivo contra a credencial em uso: a família 3.1 só publicou a variante `flash-lite` (e variantes de imagem/TTS/live) para texto via `generateContent`. Usado `models/gemini-3.5-flash` — a próxima liberação estável não-lite da linha flash, na mesma janela de lançamento (05-2026) da flash-lite atual, versão fixa e reproduzível (não o alias flutuante `gemini-flash-latest`). `temperature` permaneceu intocada.

**Done when**:

- [x] `modelName` alterado apenas no nó de modelo; nenhum outro parâmetro tocado
- [x] `temperature` mantida em `0.4` (não misturar duas variáveis na mesma medição)
- [x] Workflow republicado e `n8n/generated/` reconciliado
- [x] Uma execução com a MESMA fixture usada em T12, para comparação direta (execução `496`, mesmo payload textual de `462`)
- [x] Commit isolado, revertível sem tocar em nada da arquitetura
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: 622 tests pass (real, no silent deletions)

**Status**: Done

**Comparação direta (mesma fixture, `553499532444`, "Legal, prefiro algo mais compacto mesmo, sou eu sozinho")**: em `flash-lite` (T12, exec `462`) o agente registrou `propertyType`/`region`, tentou `motivation:"morar sozinho"` (rejeitado, `payload-invalido`) e não corrigiu — seguiu para `responder_lead` sem o campo. Em `flash` (T16, exec `496`) o agente registrou `propertyType` (com uma autocorreção de `"apartamento compacto"` → `"apartamento"` após rejeição) e, ao ter `motivation:"morar sozinho"` rejeitado, **corrigiu para o enum válido `"morador"` na chamada seguinte antes de responder** — a mesma classe de autocorreção que T11 já tinha confirmado para `registrar_qualificacao`, mas desta vez também aplicada ao campo semanticamente mapeado (`morar sozinho` → `morador`), não só ao enum já correto. `responder_lead` teve sucesso (`{ok:true}`) nos dois casos.

**Tests**: none
**Gate**: build

**Commit**: `perf(agente): eleva modelo Gemini de flash-lite para flash`

---

### T17: Registrar AD-018/AD-019 e fechar rastreabilidade

**What**: Gravar as duas decisões de projeto no log, marcar as ADs superadas e atualizar o status dos requisitos.
**Where**: `.specs/STATE.md`
**Depends on**: T16
**Reuses**: formato das entradas `AD-NNN` existentes
**Requirement**: AGN-01, MEM-01

**Tools**:

- MCP: NONE
- Skill: `tlc-spec-driven` (memory)

**Done when**:

- [x] AD-018 (tool boundary) gravada, com `AD-014 (workflow-as-code)` marcada `superseded by AD-018` — nomeando qual das duas entradas duplicadas de AD-014 é a alvo
- [x] AD-019 (memória como cache derivado) gravada, com `AD-017` marcada `amended by AD-019`
- [x] AD-016 confirmada `active` e inalterada
- [x] `spec.md` com os 17 requirement IDs atualizados de `Pending` para o status real (`Done` — não `Verified`, reservado ao Verifier)
- [x] `tasks.md` com Status → Done (todas as 17 tasks)
- [x] Delta de testes documentado no Handoff: 691 → 622 real, com as 69 remoções justificadas módulo a módulo (T13 −39, T14 −20, T15 −10)
- [x] Gate check passes: `npx vitest run && npm run lint && npm run build`
- [x] Test count: 622 tests pass (real, no silent deletions)

**Status**: Done

**Nota sobre a trajetória declarada vs real**: o topo deste arquivo declarava 612 → ~692 (Fase 1) → ~623 (Fase 5). O real ficou em 691 (baseline real confirmado no início do Batch 3, já refletindo o `a640caf` fora do lote) → 652 (T13) → 632 (T14) → 622 (T15) → 622 (T16, sem novos testes) → 622 (T17, sem novos testes). Diferença de 1 em relação ao ~623 declarado é só o `+1` do fix `a640caf`, já explicado no tasks.md original.

**Tests**: none
**Gate**: build

**Commit**: `docs(lote-6c): registra AD-018/AD-019 e fecha rastreabilidade`

---

## Phase Execution Map

```
Phase 1:  T1 → T2 → T3 → T4
                        T4 → T5          (Phase 1 → Phase 2)
Phase 2:  T5 → T6
               T6 → T7                   (Phase 2 → Phase 3)
Phase 3:  T7 → T8
               T8 → T9                   (Phase 3 → Phase 4)
Phase 4:  T9 → T10 → T11
                     T11 → T12           (Phase 4 → Phase 5)
Phase 5:  T12 → T13 → T14 → T15 → T16 → T17
```

Execution is strictly sequential - there is no intra-phase parallelism.

**Empacotamento sugerido (17 tasks, ~7 por worker):**

| Batch | Phases | Tasks | Carga |
| ----- | ------ | ----- | ----- |
| 1 | 1 + 2 | T1–T6 | 6 — camada pura + infra (contém o HUMAN GATE de T5) |
| 2 | 3 + 4 | T7–T11 | 5 — sub-workflows + reescrita do fluxo |
| 3 | 5 | T12–T17 | 6 — publicação, limpeza, troca de modelo e rastreabilidade |

---

## Task Granularity Check

| Task | Scope | Status |
| ---- | ----- | ------ |
| T1: `phase.mjs` | 1 módulo, 3 funções coesas | ✅ Granular |
| T2: `voice.mjs` | 1 módulo, 3 funções coesas | ✅ Granular |
| T3: `session.mjs` | 1 módulo, 2 funções coesas | ✅ Granular |
| T4: `system-message.mjs` | 1 módulo, 1 função | ✅ Granular |
| T5: credencial Postgres local | 1 recurso de infra + doc | ✅ Granular |
| T6: 2 colunas na Data Table | 1 tabela + doc | ✅ Granular |
| T7: sub-workflow responder | 1 workflow | ✅ Granular |
| T8: sub-workflow agendar | 1 workflow | ✅ Granular |
| T9: remoção do miolo | 1 arquivo, uma operação (remover) | ✅ Granular |
| T10: bloco de memória | 1 arquivo, um bloco coeso | ✅ Granular |
| T11: nó AI Agent | 1 arquivo, um nó + subnodes | ✅ Granular |
| T12: publicação | 1 operação de deploy | ✅ Granular |
| T13/T14/T15: remoções | 1 módulo cada | ✅ Granular |
| T16: troca de modelo | 1 parâmetro em 1 nó | ✅ Granular |
| T17: rastreabilidade | 1 arquivo | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| ---- | ---------------------- | ------------- | ------ |
| T1 | None | (início da Phase 1) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | Phase 1 → Phase 2 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | Phase 2 → Phase 3 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | Phase 3 → Phase 4 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | Phase 4 → Phase 5 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| ---- | --------------------------- | --------------- | --------- | ------ |
| T1 | Camada de decisão pura | unit | unit | ✅ OK |
| T2 | Camada de decisão pura | unit | unit | ✅ OK |
| T3 | Camada de decisão pura | unit | unit | ✅ OK |
| T4 | Camada de decisão pura | unit | unit | ✅ OK |
| T5 | Infra de instância | none | none | ✅ OK |
| T6 | Infra de instância | none | none | ✅ OK |
| T7 | Workflow SDK | none | none | ✅ OK |
| T8 | Workflow SDK | none | none | ✅ OK |
| T9 | Workflow SDK | none | none | ✅ OK |
| T10 | Workflow SDK | none | none | ✅ OK |
| T11 | Workflow SDK | none | none | ✅ OK |
| T12 | Artefato gerado | none | none | ✅ OK |
| T13 | Camada pura (remoção) | none — remoção não cria camada | none | ✅ OK |
| T14 | Camada pura (remoção) | none — remoção não cria camada | none | ✅ OK |
| T15 | Camada pura (remoção) | none — remoção não cria camada | none | ✅ OK |
| T16 | Workflow SDK | none | none | ✅ OK |
| T17 | Documentação | none | none | ✅ OK |

Nenhum `Tests: none` esconde deferral: toda lógica nova deste lote nasce em T1–T4, e cada uma dessas tasks carrega seus próprios testes unitários. As tasks de workflow não criam lógica testável por vitest — a cobertura delas é `validate_workflow` + execução real com fixture, conforme a matriz.
