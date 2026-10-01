# Lote 14 — Humano no laço — Tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implemente estas tarefas com a skill `tlc-spec-driven`: **ative-a pelo nome e siga integralmente seu fluxo Execute e suas Critical Rules**. Não procure a skill por caminho de filesystem. A skill é a fonte de verdade para ciclo por tarefa, commits atômicos, delegação, Verifier independente, sensor de discriminação e fechamento.

**Se a skill não puder ser ativada, PARE e informe ao usuário — não prossiga sem ela.**

---

**Design:** `.specs/features/lote-14-humano-no-laco/design.md`
**Status:** Aprovado (2026-10-01) — pronto para Execute em outra janela (`EXECUTE-PROMPT.md`)
**Total:** 40 tarefas em 7 fases sequenciais

---

## Preconditions for Execute

- Confirmar `git status`, branch e baseline de testes antes da T1; preservar mudanças alheias.
- `npm test` roda a suíte completa em paralelo nas branches de worker do Neon (AD-033); nunca duas suítes completas ao mesmo tempo (L-033). Testes pontuais (`npx vitest run <arquivo>`) usam a branch base e podem rodar enquanto a suíte roda. **Depois da T2 (schema), `npm run db:push:test` antes de qualquer teste.** Confirmar que `TEST_DATABASE_URL` é descartável.
- `npm test` regrava `n8n/generated/` com diferença só de fim de linha: `git checkout -- n8n/generated` quando a tarefa não mexe em workflow.
- Toda alteração em `n8n/workflows/*.ts` termina com `node scripts/n8n-inline.mjs` e com o `n8n/generated/` correspondente no mesmo commit.
- **Efeitos externos exigem autorização específica do usuário imediatamente antes**: T1 (workflow de rascunho no n8n), T38 (variável na Vercel, `drizzle-kit push` em produção, `git push`/deploy), T39 (coluna na Data Table e publicação de três workflows) e T40 (conversa real no WhatsApp). Aprovar este `tasks.md` não autoriza nenhuma delas.
- **Credenciais**: o token `WHATSAPP_ACCESS_TOKEN` é criado e colado na Vercel **pelo usuário**. Nenhum agente digita, lê, copia ou registra token, chave ou senha.
- Evidência nunca contém texto de mensagem de lead real, telefone completo, token ou chave. Ids de execução só entram depois de conferidos por `get_execution` (L-011); a evidência de um rascunho é registrada **antes** de arquivá-lo (L-016).
- Toda publicação no n8n confere `versionId == activeVersionId` depois do `publish_workflow` (L-032).
- Trabalho de UI exige captura de tela real pela extensão Claude in Chrome (`mcp__claude-in-chrome__*`), com o dev server confirmado na porta certa servindo o código atual. Sem captura, a tarefa de UI não termina (L-009).

## Proposed Tool Profiles

| Perfil | Ferramentas propostas |
| --- | --- |
| Local Core | shell local, Edit/Write, Vitest, ESLint, Next build, `npm run db:push:test`, `node scripts/n8n-inline.mjs`, skill `tlc-spec-driven` |
| n8n leitura | Local Core + MCP n8n: `get_sdk_reference`, `get_node_types`, `validate_workflow`, `search_executions`, `get_execution`, `get_workflow_details`, `list_credentials`, `search_data_tables` |
| n8n escrita | n8n leitura + `create_workflow_from_code`, `update_workflow`, `publish_workflow`, `execute_workflow`, `archive_workflow`, `add_data_table_column`, **cada escrita com autorização específica** |
| Tela | Local Core + `npm run dev:test` + extensão Claude in Chrome (`list_connected_browsers`, `tabs_context_mcp`, `navigate`, `computer` screenshot, `read_network_requests`) + CLI `npx astryx component <Nome>` |
| Implantação | Local Core + MCP Vercel somente leitura (`list_deployments`, `get_deployment`, `get_runtime_logs`) + `git push` e `drizzle-kit push` **com autorização específica** |
| Conectado | n8n escrita + Tela + conversa real conduzida pelo usuário no WhatsApp |

Os perfis são uma proposta. O usuário pode trocar ou restringir ferramentas antes do Execute.

---

## Test Coverage Matrix

> Gerada a partir do código, das diretrizes do projeto e da spec — confirmar antes do Execute. Diretrizes encontradas: `AGENTS.md`, `CLAUDE.md`, `vitest.config.ts`, `package.json`, `n8n/README.md` (AD-014), `.specs/STATE.md` (AD-007, AD-013, AD-018, AD-019, AD-023, AD-027, AD-033, AD-034, AD-035) e as lições confirmadas que tocam este lote (L-001, L-002, L-003, L-005, L-009, L-010, L-011, L-015, L-016, L-021, L-023, L-026, L-029, L-030, L-032, L-033, L-035, L-037, L-041, L-044, L-047, L-049). Amostras: `src/server/__tests__/properties-actions.test.ts` (action com sessão simulada), `src/server/data/__tests__/lead-messages.test.ts`, `src/server/integration/__tests__/routes/leads-patch.test.ts`, `src/server/integration/__tests__/openapi.test.ts`, `src/lib/__tests__/chat-thread.test.ts`, `n8n/src/__tests__/gate.test.ts`, `n8n/workflows/__tests__/principal-opt-out-natural.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Módulos puros do n8n (`n8n/src/*.mjs`) | unit | Todas as branches; 1:1 com os ACs; fronteiras exatas (L-023); precedência testada com a entrada que satisfaz as duas regras (L-041) | `n8n/src/__tests__/*.test.ts` | `npx vitest run n8n/src/__tests__` |
| Módulos puros do CRM (`src/lib/*.ts`) | unit | Todas as branches; fronteira de 24h e de minutos exata (L-023); constantes de produção afirmadas (L-037); lógica de apresentação testada fora do componente (L-003) | `src/lib/__tests__/*.test.ts` | `npx vitest run src/lib/__tests__/<arquivo>` |
| Esquema (`src/db/schema.ts`) | integration | Restrições com comportamento: CHECK de autoria, unicidade por tenant, FK `set null`; o resto só pelo build | `src/db/__tests__/*.test.ts` | `npm run db:push:test` e `npx vitest run src/db/__tests__/<arquivo>` |
| DAL (`src/server/data/index.ts`) | integration (Neon de teste) | Caminhos-chave 1:1 com os ACs; escopo de corretor e linha de outro tenant (L-035); antes/depois dos campos que não podem mudar (L-001); falha forçada no meio da transação (L-002) | `src/server/data/__tests__/*.test.ts` | `npx vitest run src/server/data/__tests__/<arquivo>` |
| Serviços do CRM (`src/server/chats/*`, `src/server/whatsapp/*`) | integration/unit | 1:1 com os ACs de envio e opt-out; Meta sempre por `fetch` injetado, nunca rede real; cada recusa afirma zero chamadas à Meta; texto de erro tipado pelo union (L-029); falha fechada sem token (L-030) | `src/server/chats/__tests__/*.test.ts`, `src/server/whatsapp/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Server actions (`src/server/actions/chats.ts`) | integration (sessão simulada) | Recusa de permissão por action; teste de ligação que falha se a action deixar de chamar o serviço (L-026); `revalidatePath("/chats")` | `src/server/__tests__/chats-actions.test.ts` | `npx vitest run src/server/__tests__/chats-actions.test.ts` |
| Rotas `/api/v1` | integration (handler chamado direto) | Feliz + borda + erro; 401, 404 de outro tenant, 405; `INSTRUMENTED` (teste de varredura existente); recusa registrada em `integration_refusals` | `src/server/integration/__tests__/routes/*.test.ts` | `npx vitest run <arquivo>` |
| Contrato (`docs/integration/openapi.yaml`) | unit | `SwaggerParser.validate` + paridade exata de enums com o código | `src/server/integration/__tests__/openapi.test.ts` | `npx vitest run src/server/integration/__tests__/openapi.test.ts` |
| Workflows n8n como código | unit/structural | Grafo por `toJSON()`: nós, arestas por índice de saída (L-044), parâmetros, nenhum id vindo de `$fromAI`; cada ligação nova com teste que falha se a aresta sumir (L-026) | `n8n/workflows/__tests__/*.test.ts` | `npx vitest run n8n/workflows/__tests__` |
| Componentes de UI (`src/components/chats/*`, `app/(crm)/chats/page.tsx`) | none automatizado (o projeto não tem camada de teste de UI) + **captura obrigatória** | Captura real de cada estado pela extensão do Chrome (L-009); nenhum texto em inglês visível (L-010); a lógica vive em `src/lib` com teste unitário | evidência na seção Evidence da tarefa | gate Build + capturas |
| Documentação (`README.md`, `guia-integracao.md`, `roteiro.md`) | none | — (revisão + grep dos Independent Tests) | — | gate Build |
| Ambiente conectado (Vercel, banco de produção, n8n, WhatsApp) | connected e2e/manual | Execução real com id conferido, estado final no CRM (AD-027), evidência sem PII | `n8n/smoke/evidencia.md`, Evidence das tarefas | procedimento da tarefa + gate Build |

## Gate Check Commands

> Gerados do repositório — confirmar antes do Execute. Comandos de uma mesma célula são executados separadamente, na ordem indicada.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tarefa com testes unitários ou de integração isolados | `npx vitest run <arquivo-ou-diretório-da-tarefa>` |
| Full | Tarefa que muda workflow publicável, esquema ou contrato | `npm run db:push:test` (se o esquema mudou)<br>`node scripts/n8n-inline.mjs` (se workflow mudou)<br>`npm test` |
| Build | Fechamento de fase, UI, documentação e tarefas conectadas | `npm test`<br>`npm run lint`<br>`npm run build` |

Em todo gate, registrar total de arquivos e de testes antes e depois, e provar que nenhum teste foi removido em silêncio. Referência do fechamento do lote-13: 2.116 testes, com 2 falhas conhecidas de `DOCLIM-01 AC8` por timeout na suíte completa (passam isoladas; aceitas pelo usuário). O baseline real é medido no início do Execute.

---

## Execution Plan

As fases e tarefas são estritamente sequenciais.

### Phase 1: Espinha — confirmar o que o design não pôde confirmar

```text
T1
```

### Phase 2: Fundação de dados e regras puras

```text
T2 -> T3 -> T4 -> T5 -> T6 -> T7
```

### Phase 3: Contrato `/api/v1`

```text
T8 -> T9 -> T10 -> T11 -> T12 -> T13 -> T14
```

### Phase 4: Envio humano, opt-out e actions

```text
T15 -> T16 -> T17 -> T18 -> T19 -> T20
```

### Phase 5: n8n — módulos e workflows

```text
T21 -> T22 -> T23 -> T24 -> T25 -> T26 -> T27
```

### Phase 6: Tela de Chats

```text
T28 -> T29 -> T30 -> T31 -> T32 -> T33 -> T34
```

### Phase 7: Documentação, implantação e prova

```text
T35 -> T36 -> T37 -> T38 -> T39 -> T40
```

---

## Task Breakdown

### Phase 1: Espinha — confirmar o que o design não pôde confirmar

#### T1: Confirmar a nota `system` na memória e a purga por `session_id`

**What:** Num workflow de rascunho, confirmar que o `memoryManager` insere uma mensagem do tipo `system` no meio da sessão, que o AI Agent com o modelo da AD-026 roda com essa memória e usa o fato da nota, e que `DELETE FROM n8n_chat_histories WHERE session_id = $1` esvazia a sessão; registrar o resultado no design.
**Where:** `.specs/features/lote-14-humano-no-laco/design.md`
**Depends on:** None
**Reuses:** `get_node_types` (`memoryManager`, `memoryPostgresChat`, `postgres`), `list_credentials` (credencial "Postgres n8n local"), padrão do rascunho da T2 do lote-13
**Requirement:** DEVOLVER-01, OPTHUM-01
**Tools:** n8n escrita — **autorização específica antes de criar o rascunho**

**Done when:**

- [x] `get_node_types` confirma os tipos aceitos por `memoryManager` em `insert` e o `tableName` padrão do `memoryPostgresChat`; o resultado está na Evidence.
- [x] Rascunho `crivo-rascunho-l14-memoria` executado numa sessão sintética (`rascunho-l14:<timestamp>`): insere `user` ("quantas vagas tem?"), `system` ("Mensagem enviada ao lead por Ana, da equipe da imobiliária: o apartamento tem 3 vagas") e roda o AI Agent (`gpt-5.4-nano-2026-03-17`, mesma memória) com a pergunta do lead; a execução termina `success` e a resposta cita 3 vagas.
- [x] Um nó Postgres lê `information_schema.columns` de `n8n_chat_histories` e confirma a coluna `session_id`; outro executa o `DELETE` parametrizado; um `load` seguinte devolve `messagesCount: 0`.
- [x] Ids das execuções conferidos por `get_execution` e registrados **antes** de arquivar o rascunho (L-011, L-016); nenhum dado real.
- [x] `design.md` (Tech Decisions e Risks & Concerns) registra a confirmação ou a troca: se `system` falhar, a semeadura usa `ai` com o mesmo texto de atribuição, e a T22 segue essa escolha; se a coluna for outra, C10 é corrigido. Qualquer desvio que mude o comportamento prometido por um AC para o lote e vai ao usuário antes da T2.
- [x] Rascunho arquivado; gate Build passa sem mudança na contagem de testes. *(Arquivado por `archive_workflow` depois da Evidence. Suíte: 126 arquivos / 2.107 testes, igual ao baseline, só as 2 falhas conhecidas de `DOCLIM-01 AC8`; lint sem erros; build ok.)*

**Evidence** (registrada antes de arquivar o rascunho, L-016):

- `get_node_types`: `memoryManager` v1.1 `insert` aceita `ai | system | user`; `memoryPostgresChat` v1.4 tem `tableName` padrão `n8n_chat_histories`.
- Rascunho `crivo-rascunho-l14-memoria`, id `5f6NETNOgpkXEjgq`, projeto pessoal, criado por `create_workflow_from_code` com autorização do usuário. Execução manual `2802`, `success`, conferida por `get_execution` (L-011). Sessão sintética `rascunho-l14:1790853712528`.
- Memória carregada pelo agente: `HumanMessage` "quantas vagas tem?" seguida de `SystemMessage` com a nota da Ana. O modelo recebeu a nota como `System:` no meio do histórico e respondeu "São 3 vagas no apartamento." à pergunta "quantas vagas tem mesmo?".
- `information_schema.columns`: `id` integer, `session_id` character varying, `message` jsonb. Contagem antes da purga 4; `DELETE ... WHERE session_id = $1` com `queryReplacement`; `load` seguinte `messagesCount: 0`; contagem depois 0.
- Resultado: `system` confirmado para a T22 e `session_id` confirmado para a T27. `design.md` § Confirmações da T1, Tech Decisions e Risks & Concerns atualizados. Nenhum desvio de AC.

**Tests:** none
**Gate:** Build
**Commit:** `docs(specs): confirm system memory note and session purge for lote 14`

### Phase 2: Fundação de dados e regras puras

#### T2: Ampliar o esquema para condução humana, autoria e reserva de envio

**What:** Adicionar em `leads` `human_takeover_at`, `human_takeover_by` (FK `users`, `set null`), `memory_reset_requested_at` e `whatsapp_phone_number_id`; `humano` no enum `sender`; em `messages` `author_user_id` (FK `set null`), `author_name` e CHECK (`sender = 'humano'` ⇒ `author_name` não nulo); enum `human_send_state` e tabela `human_message_sends` com índice único `(tenant_id, request_id)`; índice `messages(conversation_id, sent_at)`.
**Where:** `src/db/schema.ts`
**Depends on:** T1
**Reuses:** convenções de colunas aditivas e índices parciais de `schema.ts`
**Requirement:** ASSUMIR-01, ENVIO-01, THREAD-01, DEVOLVER-01
**Tools:** Local Core

**Done when:**

- [x] `npm run db:push:test` aplica o esquema na base e nas branches de worker sem erro. *(5 bancos de teste: base + 4 workers.)*
- [x] Teste novo `src/db/__tests__/schema-humano.test.ts`: mensagem `humano` sem `author_name` é recusada pelo banco; com `author_name`, é aceita. *(`23514` em `:113`; aceita em `:132-133`.)*
- [x] Mesmo `request_id` duas vezes no mesmo tenant viola o índice único; o mesmo `request_id` em tenants diferentes é aceito. *(`23505` em `:153`; dois tenants em `:174`.)*
- [x] Excluir o usuário autor deixa `author_user_id` nulo e preserva `author_name` (THREAD-01 AC7, lado do dado). *(`:195-196`.)*
- [x] Gate Full passa; nenhum teste existente quebra. *(`npm test`: 127 arquivos / 2.112 testes, antes 126 / 2.107; só as 2 falhas conhecidas de `DOCLIM-01 AC8`.)*

**Tests:** integration
**Gate:** Full
**Commit:** `feat(db): add human conduction, authorship and send reservation schema`

#### T3: Criar a regra única de condução

**What:** Criar `n8n/src/conduction.mjs` com `isHumanConducted`, `canAgentSendInTurn`, `canAgentContactProactively` e `memoryResetDue`, conforme o design (C2).
**Where:** `n8n/src/conduction.mjs`
**Depends on:** T2
**Reuses:** convenção dos módulos puros de `n8n/src/` (sem import)
**Requirement:** ASSUMIR-01, SILENCIO-01, DEVOLVER-01
**Tools:** Local Core

**Done when:**

- [x] `isHumanConducted`: só marca → `true`; só `escalado_humano` → `true`; os dois → `true`; nenhum → `false`. *(`n8n/src/__tests__/conduction.test.ts`, 4 testes.)*
- [x] `canAgentSendInTurn`: `escalado_humano` sem marca → `true` (mensagem de passagem); marca → `false`; opt-out → `false`; lead limpo → `true`. *(4 testes; a função não lê `status`.)*
- [x] `canAgentContactProactively`: `escalado_humano` → `false`; marca → `false`; opt-out → `false`; lead limpo → `true`. *(4 testes.)*
- [x] `memoryResetDue`: pedido nulo → `false`; pedido com atendido nulo → `true`; pedido mais novo → `true`; **pedido igual ao atendido → `false`** (fronteira, L-023); pedido mais velho → `false`; data inválida → `false`. *(8 testes; atendido `""` conta como nunca atendido, como em `isSessionExpired`; data inválida em qualquer dos dois lados → `false`.)*
- [x] Gate Quick passa (`npx vitest run n8n/src/__tests__/conduction.test.ts`); contagem registrada. *(1 arquivo / 20 testes; suíte acumulada 128 / 2.132.)*

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(n8n): add single conversation conduction rule`

#### T4: Criar o controle da conversa no CRM

**What:** Criar `src/lib/conversation-control.ts` com `whatsappWindow`, `formatWindowRemaining`, `conversationControls`, `shouldPollConversation` e `CHAT_REFRESH_INTERVAL_MS`, importando `isHumanConducted` de `n8n/src/conduction.mjs`.
**Where:** `src/lib/conversation-control.ts`
**Depends on:** T3
**Reuses:** `src/components/documents/processing-refresh-policy.ts` (forma da política de visibilidade)
**Requirement:** JANELA-01, THREAD-01, ASSUMIR-01, DEVOLVER-01, OPTHUM-01
**Tools:** Local Core

**Done when:**

- [x] `whatsappWindow`: última mensagem do lead há **exatamente 24 h → fechada**; há 23 h 59 min → aberta com `remainingMinutes = 1`; sem mensagem do lead → fechada; `closesAt` = última + 24 h (JANELA-01 AC1, L-023). *(`src/lib/__tests__/conversation-control.test.ts:32-50`.)*
- [x] `formatWindowRemaining`: 200 → `"3 h 20 min"`; 1 → `"0 h 1 min"`; menos de 1 min com janela aberta → `"menos de 1 min"`. *(`:56-67`.)*
- [x] `conversationControls`, com uma asserção por linha da tabela: agente conduz → `canAssume`, composer `oculto`; marca → `canReturn`, composer `ativo` com a janela aberta e `bloqueado` com ela fechada; `escalado_humano` sem marca → conductor `escalado`, `canReturn`; opt-out → nada habilitado, composer `oculto`; sem `chats:escrever` → nenhum controle (ASSUMIR-01 AC8, DEVOLVER-01 AC9, OPTHUM-01 AC7). *(`:80-167`.)*
- [x] Teste de ligação: com só a marca, o conductor é `humano`, provando o uso de `isHumanConducted` (L-026). *(`:179`, lead em `qualificado_agendado` com marca.)*
- [x] `CHAT_REFRESH_INTERVAL_MS` afirmado igual a 5.000 e ≤ 10.000 (THREAD-01 AC2, L-037); `shouldPollConversation` falso com aba oculta ou sem conversa aberta (AC3). *(`:186-193`.)*
- [x] Gate Quick passa; contagem registrada. *(1 arquivo / 16 testes.)*

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(chats): add conversation control and whatsapp window rules`

#### T5: Escrever assumir, devolver e opt-out humano na DAL

**What:** Adicionar `takeOverConversation`, `returnConversationToAgent` e `optOutLeadByHuman` à DAL, com escopo de sessão e uma única `UPDATE` cada (C1).
**Where:** `src/server/data/index.ts`
**Depends on:** T4
**Reuses:** `assignedTo(scope)`, `updateLeadStatus` (`:1265`), regra `COALESCE` de `optOutLead` (`lgpd.ts:27`)
**Requirement:** ASSUMIR-01, DEVOLVER-01, OPTHUM-01
**Tools:** Local Core

**Done when:**

- [x] Teste novo `src/server/data/__tests__/conversation-conduction.test.ts`. Assumir grava marca com usuário e instante (ASSUMIR-01 AC1) e mantém `status`, `statusChangedBy` e `assignedUserId` iguais aos de antes, com asserção de antes/depois (AC2, L-001). *(`:93-117`.)*
- [x] Assumir recusa e não grava: lead de outra carteira para corretor puro; lead de outro tenant (L-035); lead com opt-out (AC3, AC5). Lead já marcado preserva usuário e instante originais (AC6); lead em `escalado_humano` devolve `ja-humano` sem gravar marca (AC7). *(`:120-163`.)*
- [x] Devolver limpa a marca (DEVOLVER-01 AC1); `escalado_humano` vira `em_qualificacao` (AC2); `em_qualificacao` e `qualificado_agendado` mantêm o status (AC3, um teste cada); `statusChangedBy` fica nulo (AC4); `memory_reset_requested_at` é gravado; opt-out e fora de escopo recusam sem mudar nada (AC8). *(`:178-234`. Lacuna de precisão da spec: devolver lead conduzido pelo agente não está especificado; a DAL recusa com `ja-agente` sem gravar, porque zerar `statusChangedBy` apagaria a trava humana do Kanban — `:237-243`.)*
- [x] `optOutLeadByHuman` grava `opted_out_at` e o pedido de reset; uma segunda chamada preserva o instante original; fora de escopo recusa e mantém nulo (OPTHUM-01 AC1, AC8). *(`:248-284`; devolve `newlyOptedOut` para a T17.)*
- [x] Gate Quick passa; contagem registrada. *(1 arquivo / 19 testes.)*

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(data): add take over, return and human opt-out writes`

#### T6: Escrever a reserva e o registro do envio humano na DAL

**What:** Adicionar `getLastLeadMessageAt`, `reserveHumanSend`, `failHumanSend` e `recordHumanMessage` (transação: garante a conversa, insere a mensagem `humano` com autor e `wamid`, fecha a reserva como `enviada`).
**Where:** `src/server/data/index.ts`
**Depends on:** T5
**Reuses:** transação de `ingestAgentMessage` (`:1843`)
**Requirement:** ENVIO-01, JANELA-01
**Tools:** Local Core

**Done when:**

- [x] Teste novo `src/server/data/__tests__/human-send.test.ts`. `getLastLeadMessageAt` ignora mensagens `agente` e `humano` e devolve `null` sem mensagem do lead. *(`:118-150`, com linha de outro tenant, L-035.)*
- [x] `reserveHumanSend`: chave nova → reserva `enviando`; chave `enviada` → devolve a mensagem existente; `enviando` com 1 min 59 s → `envio-em-andamento`; **`enviando` com exatamente 2 min → retomada** (fronteira, L-023); `falhou` → retomada por compare-and-set. *(`:154-243`; `HUMAN_SEND_STALE_MS = 120000` afirmado; dois retomadores concorrentes: só um reserva. Mutante `<` → `<=` na fronteira pego pelo teste `:201`.)*
- [x] `recordHumanMessage` grava `sender = humano`, `author_user_id`, `author_name`, `externalId = wamid` e fecha a reserva com `message_id` (ENVIO-01 AC2). *(`:246-268`.)*
- [x] Falha forçada no insert da mensagem (fault injection): nenhuma mensagem fica gravada e a reserva não fica `enviada` (L-002). *(`:271-296`: violação do CHECK de autoria; a conversa criada na mesma transação também some.)*
- [x] Gate Quick passa; contagem registrada. *(1 arquivo / 13 testes.)*

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(data): add human send reservation and recording`

#### T7: Expor autoria e condução nas leituras da DAL

**What:** `getMessages` e `getLeadMessages` passam a devolver `authorName`; `getConversationSummaries` passa a usar `DISTINCT ON (conversation_id)` para a última mensagem e devolve `humanConducted`.
**Where:** `src/server/data/index.ts`
**Depends on:** T6
**Reuses:** `getConversationSummaries` (`:455`), `isHumanConducted` (T3)
**Requirement:** THREAD-01
**Tools:** Local Core

**Done when:**

- [x] Os testes existentes de ordenação e escopo de `getConversationSummaries` e de `getLeadMessages` passam sem alteração. *(`reads.test.ts`, `isolation.test.ts`, `lead-messages.test.ts` intocados e verdes.)*
- [x] Testes novos: `humanConducted` é `true` com marca, `true` em `escalado_humano` e `false` sem nenhum dos dois (THREAD-01 AC5); a última mensagem continua correta com várias mensagens por conversa; um corretor puro continua vendo só a própria carteira. *(`src/server/data/__tests__/conversation-reads.test.ts:115-190`; desempate por `id` com `sentAt` igual preservado em `:150`.)*
- [x] `authorName` vem preenchido em mensagem `humano` e nulo nas demais (THREAD-01 AC1, AC7). *(`:193-223`, por `getMessages` e `getLeadMessages`.)*
- [x] Gate Full passa (fim da Phase 2); contagem registrada. *(`npm test`: 132 arquivos / 2.189 testes, antes do lote 126 / 2.107; só as 2 falhas conhecidas de `DOCLIM-01 AC8`. Atenção para os gates Build seguintes: desde a T2, `src/components/chats/message-thread.tsx:48` não compila com `sender = humano` até a T28 ampliar `ChatSender`.)*

**Tests:** integration
**Gate:** Full
**Commit:** `feat(data): expose message authorship and human conduction in reads`

### Phase 3: Contrato `/api/v1`

#### T8: Aprender o número do canal no `POST /leads` e expor a condução no lead

**What:** `parseLeadCreate` aceita `whatsappPhoneNumberId` opcional (só dígitos, 1–32); `deliverLead` grava o valor por `setLeadChannel` só quando ele muda; `SerializedLead` ganha `humanTakeoverAt` e `memoryResetRequestedAt`.
**Where:** `src/server/integration/leads.ts`
**Depends on:** T7
**Reuses:** `parseLeadCreate` (`parsers.ts:91`), `createAgentLead`, `serializeLead`
**Requirement:** ENVIO-01, ASSUMIR-01, DEVOLVER-01, CONTRATO-01
**Tools:** Local Core

**Done when:**

- [x] Testes em `src/server/integration/__tests__/routes/leads-post.test.ts`: valor válido é gravado no lead novo; segunda entrega com outro valor atualiza; entrega **sem o campo** preserva o valor existente; string vazia, só espaços, não numérico ou com mais de 32 dígitos → `400 payload-invalido` sem gravar (L-005). *(leads-post.test.ts: 10 → 19 testes; também cobre fronteiras de 1 e 32 dígitos e reentrega inválida preservando o valor.)*
- [x] A resposta do `POST /leads` traz `humanTakeoverAt` e `memoryResetRequestedAt` em ISO-8601 quando preenchidos e `null` quando não.
- [x] Gate Quick passa; contagem registrada. *(`src/server/integration`: 27 arquivos / 321 testes, todos passando.)*

**Nota de escopo:** `setLeadChannel` (design C1) não existia na DAL (T5–T7 não o entregaram); foi criado aqui em `src/server/data/index.ts`, junto com o parser em `parsers.ts`, por ser dependência direta do `deliverLead`.

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(integration): learn channel number and expose conduction on leads`

#### T9: Criar `GET /api/v1/leads/{id}`

**What:** Trocar o `GET` 405 por um handler `withIntegrationRoute` que devolve `SerializedLead` do tenant da credencial.
**Where:** `app/api/v1/leads/[id]/route.ts`
**Depends on:** T8
**Reuses:** `withIntegrationRoute`, `getLead(serviceScope(...))`, `serializeLead`
**Requirement:** SILENCIO-01, CONTRATO-01
**Tools:** Local Core

**Done when:**

- [x] Teste novo `src/server/integration/__tests__/routes/leads-get.test.ts`: 200 com o lead e os campos de condução; 404 para lead de outro tenant (L-035) e para id inexistente; 401 sem credencial. *(leads-get.test.ts: 6 testes novos; inclui a recusa em `integration_refusals`.)*
- [x] Em `leads-patch.test.ts:247`, o `GET` sai da lista de verbos 405 (substituído pelos testes acima, porque a spec passou a exigir a rota — emenda D4); `POST`, `PUT` e `DELETE` continuam 405. *(Única troca de teste existente: título e lista de verbos; `GET` removido do import.)*
- [x] O teste de varredura de instrumentação (`route-instrumentation.test.ts`) passa com o export novo marcado `INSTRUMENTED`.
- [x] Gate Quick passa; contagem registrada. *(leads-get + leads-patch + route-instrumentation: 3 arquivos / 16 testes; e2e-smoke e leads-patch-atribuicao passam.)*

**Nota de escopo:** o handler chama `findLead` (novo, em `src/server/integration/leads.ts`, sobre `getLead(serviceScope(...))`) para manter o padrão handler → serviço → DAL.

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(integration): add lead read route for conduction checks`

#### T10: Recusar status e reunião de lead conduzido por humano

**What:** Adicionar `lead-conduzido-por-humano` a `ProblemCode` e recusar com 409, em `patchLead`, um patch com `status` ou `meetingAt` para lead com a marca, depois da checagem de transição e antes da trava humana.
**Where:** `src/server/integration/leads.ts`
**Depends on:** T9
**Reuses:** ordem de validação de `patchLead` (`leads.ts:131-160`), `problem.ts`
**Requirement:** SILENCIO-01
**Tools:** Local Core

**Done when:**

- [x] Testes em `leads-patch.test.ts` (ou arquivo novo `leads-patch-conducao.test.ts`): marca + `status` → `409 lead-conduzido-por-humano`; marca + `meetingAt` sem status → 409; marca + patch só de qualificação → 200 e gravado (SILENCIO-01 AC9). *(leads-patch-conducao.test.ts: 7 testes; marca+status, marca+meetingAt e qualificação 200)*
- [x] No 409, nenhum campo do patch é gravado, com asserção de antes/depois (L-001), e a recusa aparece em `integration_refusals` (AD-023). *(antes/depois da linha inteira com toEqual; integration_refusals com o código novo)*
- [x] Entrada que satisfaz marca **e** trava humana (`statusChangedBy = humano`) responde `lead-conduzido-por-humano` (L-041); transição inválida com marca continua `transicao-invalida`. *(marca + statusChangedBy humano responde o código da condução; transicao-invalida preservada)*
- [x] Gate Quick passa; contagem registrada. *(leads-patch-conducao + leads-patch + leads + problem: 4 arquivos / 39 testes)*

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(integration): refuse status changes on human-conducted leads`

#### T11: Recusar autoria humana no contrato e expor `authorName`

**What:** `parseMessageCreate` passa a aceitar só `AGENT_WRITABLE_SENDERS = ["agente", "lead"]`; `SerializedMessage` ganha `authorName`.
**Where:** `src/server/integration/parsers.ts`
**Depends on:** T10
**Reuses:** `enumValue` de `parsers.ts`, `serializeMessage` (`messages.ts`)
**Requirement:** CONTRATO-01, DEVOLVER-01
**Tools:** Local Core

**Done when:**

- [x] `POST /leads/{id}/messages` com `sender: humano` → `400 payload-invalido`, e a contagem de mensagens do lead fica igual (CONTRATO-01 AC5). *(leads-messages-post.test.ts: 400 payload-invalido com detail 'agente, lead' e contagem do lead antes/depois igual)*
- [x] `agente` e `lead` continuam aceitos (testes existentes passam). *(teste novo com sender agente (201, authorName null) + testes existentes com lead passam)*
- [x] `GET /leads/{id}/messages` devolve a mensagem `humano` com `authorName` e as demais com `authorName: null`. *(leads-messages-get.test.ts: [lead,null],[humano,'Maria Souza'],[agente,null])*
- [x] Gate Quick passa; contagem registrada. *(messages-get + messages-post + parsers + messages: 4 arquivos / 77 testes)*

**Tests:** integration
**Gate:** Quick
**Commit:** `fix(integration): keep human authorship out of the service contract`

#### T12: Criar `GET /api/v1/memory-resets`

**What:** Nova rota que devolve `{ resets: [{ leadId, waId, requestedAt }] }` do tenant com `memory_reset_requested_at >= since`, sobre `listMemoryResets` na DAL.
**Where:** `app/api/v1/memory-resets/route.ts`
**Depends on:** T11
**Reuses:** `withIntegrationRoute`, `problem()`, padrão de query de `parseMessagesQuery`
**Requirement:** DEVOLVER-01, OPTHUM-01, CONTRATO-01
**Tools:** Local Core

**Done when:**

- [x] Teste novo `routes/memory-resets-get.test.ts`: devolve o pedido com `requestedAt` **igual** a `since` (fronteira, L-023) e os mais novos; exclui os mais velhos; exclui lead de outro tenant (L-035); exclui lead sem `externalId`. *(memory-resets-get.test.ts: fronteira igual a since incluída (mutação gte->gt faz falhar), mais novo incluído, mais velho excluído, outro tenant/sem externalId/sem pedido excluídos)*
- [x] `since` ausente ou inválido → `400 payload-invalido`; sem credencial → 401; `POST`/`PUT`/`PATCH`/`DELETE` → 405. *(since ausente, vazio, não ISO ou só data -> 400; sem credencial 401; POST/PUT/PATCH/DELETE 405 com Allow GET)*
- [x] Export marcado `INSTRUMENTED`; o teste de varredura passa. *(route-instrumentation passa com o export novo)*
- [x] Gate Quick passa; contagem registrada. *(memory-resets-get + route-instrumentation + parsers: 3 arquivos / 57 testes)*

**Nota de escopo:** `listMemoryResets` (design C1) não existia na DAL; foi criado aqui, com `parseMemoryResetsQuery` (parsers.ts) e o serviço `src/server/integration/memory-resets.ts`.

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(integration): add memory reset requests route`

#### T13: Atualizar o `openapi.yaml` com travas de paridade

**What:** Documentar `assignedBroker`, os códigos do lote-8 e o novo 409, `humano` em `Sender` (só leitura), `authorName`, `humanTakeoverAt`, `memoryResetRequestedAt`, `whatsappPhoneNumberId`, `GET /leads/{id}` e `GET /memory-resets`, e criar os testes de paridade.
**Where:** `docs/integration/openapi.yaml`
**Depends on:** T12
**Reuses:** `src/server/integration/__tests__/openapi.test.ts`
**Requirement:** CONTRATO-01
**Tools:** Local Core

**Done when:**

- [x] `SwaggerParser.validate` passa (teste existente). *(SwaggerParser.validate passa (openapi.test.ts: 11 -> 18 testes))*
- [x] Teste de paridade: o enum `ProblemCode` do YAML é **igual** ao conjunto de chaves de `TITLES` em `problem.ts` (AC2); o enum `Sender` é igual a `senderEnum.enumValues` (AC3). *(paridade ProblemCode x chaves de TITLES (openapi.test.ts) e Sender x senderEnum.enumValues, ambas por conjunto ordenado)*
- [x] Asserções de presença: `assignedBroker` na resposta do `PATCH` (AC1); campos de condução no `Lead` (AC4); descrição de `humano` como só leitura (AC6); as duas rotas novas e `whatsappPhoneNumberId` (AC7). *(presença: assignedBroker (allOf), humanTakeoverAt/memoryResetRequestedAt requeridos, Sender com descrição só leitura + AgentWritableSender sem humano, GET /leads/{id}, GET /memory-resets com since obrigatório, whatsappPhoneNumberId opcional)*
- [x] Discriminação conferida na própria tarefa: remover `conflito-de-agenda` do YAML faz o teste falhar, e restaurar faz passar (Independent Test). *(removendo conflito-de-agenda do YAML, o teste de ProblemCode falhou (1 falha); restaurado (cmp idêntico) e 18/18 passam)*
- [x] Gate Quick passa; contagem registrada. *(openapi.test.ts: 1 arquivo / 18 testes)*

**Nota de escopo:** `TITLES` passou a ser exportada em `problem.ts` (só `export`, para o teste de paridade); o `Sender` do YAML virou o enum completo (`agente, lead, humano`) e o corpo do POST usa o novo `AgentWritableSender`; `openapi.test.ts` ganhou `import "dotenv/config"` porque importar `problem.ts` carrega a DAL.

**Tests:** unit
**Gate:** Quick
**Commit:** `docs(integration): sync openapi with the contract and lock enum parity`

#### T14: Cobrir o 413 e o JSON inválido de `POST /api/v1/leads` (L5 Fix 1)

**What:** Dois testes dedicados em `leads-post.test.ts`, no molde de `leads-patch.test.ts:222-233` e `leads-messages-post.test.ts:186-199`.
**Where:** `src/server/integration/__tests__/routes/leads-post.test.ts`
**Depends on:** T13
**Reuses:** os dois testes irmãos citados
**Requirement:** CONTRATO-02
**Tools:** Local Core

**Done when:**

- [x] Corpo maior que `MAX_BODY_BYTES` → `413` com `code: corpo-grande-demais` (AC1). *(leads-post.test.ts: 413 com corpo-grande-demais e zero linhas gravadas)*
- [x] Corpo que não é JSON → `400` com `code: payload-invalido` (AC2). *(JSON inválido -> 400 payload-invalido com detail exato)*
- [x] Discriminação conferida: remover cada checagem da rota faz o teste correspondente falhar. *(mutação 1: checagem de tamanho trocada por false faz o teste do 413 falhar; mutação 2: JSON.parse removido faz o teste do JSON inválido falhar; rota restaurada (cmp idêntico, git diff vazio em app/))*
- [x] Gate Full passa (fim da Phase 3); contagem registrada. *(Gate Full: npm test 135 arquivos / 2.233 testes, 2.231 passando e 2 falhas conhecidas (DOCLIM-01 AC8, timeout); lint 0 erros (7 avisos preexistentes); build verde. Antes da fase: ~133 / 2.193)*

**Tests:** integration
**Gate:** Full
**Commit:** `test(integration): cover body limit and invalid json on lead delivery`

### Phase 4: Envio humano, opt-out e actions

#### T15: Criar o cliente da Cloud API

**What:** Criar `sendWhatsAppText` com `fetch` injetável, Graph API v25.0, timeout de 15 s e mapeamento de erros (C4).
**Where:** `src/server/whatsapp/cloud-api.ts`
**Depends on:** T14
**Reuses:** —
**Requirement:** ENVIO-01, JANELA-01
**Tools:** Local Core

**Done when:**

- [x] Teste novo `src/server/whatsapp/__tests__/cloud-api.test.ts`: sucesso devolve `messages[0].id`; URL `https://graph.facebook.com/v25.0/{phoneNumberId}/messages`, header `Bearer` e corpo exato (`messaging_product`, `recipient_type: individual`, `to`, `type: text`, `text.preview_url: false`, `text.body`). *(cloud-api.test.ts: wamid devolvido; URL v25.0, Bearer e corpo afirmados por toEqual)*
- [x] Mapeamento, uma asserção por código: 131047 → `janela-fechada`; 131030 e 131026 → `destinatario-invalido`; 190, HTTP 401 e 403 → `credencial-invalida`; outro código → `falha-meta` com `metaCode`; erro de rede → `falha-meta`. *(uma asserção toEqual por código: 131047, 131030, 131026, 190, 401, 403, 131056 com metaCode e TypeError de rede)*
- [x] Timeout aborta e devolve `tempo-esgotado`; o default de 15.000 ms e a versão `v25.0` são afirmados (L-037). *(fetch que só termina no abort, timeoutMs 20: tempo-esgotado e abort observado; CLOUD_API_TIMEOUT_MS 15000, GRAPH_API_VERSION v25.0 e spy em AbortSignal.timeout(15000))*
- [x] Token ausente → `nao-configurado`, **sem chamar o `fetch`** (falha fechada, L-030). *(env vazio: nao-configurado e fetch com 0 chamadas; nao-configurado entrou no union com SPEC_DEVIATION em cloud-api.ts)*
- [x] Gate Quick passa; contagem registrada. *(Gate Quick: 1 arquivo / 12 testes passando; eslint limpo)*

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(whatsapp): add cloud api text sender`

#### T16: Criar o serviço de envio humano

**What:** Criar `sendHumanMessage`, `deliverHumanText` e `HUMAN_SEND_MESSAGES` (`Record<HumanSendFailure, string>`), na ordem da sequência do design, com o destinatário por `toWhatsAppMsisdn` (`n8n/src/phone.mjs`).
**Where:** `src/server/chats/human-send.ts`
**Depends on:** T15
**Reuses:** DAL da T6, `conversationControls`/`whatsappWindow` (T4), `sendWhatsAppText` (T15), `toWhatsAppMsisdn`
**Requirement:** ENVIO-01, JANELA-01
**Tools:** Local Core

**Done when:**

- [x] Teste novo `src/server/chats/__tests__/human-send.test.ts` (banco de teste, `fetch` falso). Recusas **sem nenhuma chamada à Meta**, uma por teste: texto vazio ou só espaços; 4.097 caracteres (4.096 aceito, fronteira); lead conduzido pelo agente; opt-out; fora do escopo; número do canal desconhecido; janela fechada com exatamente 24 h; token ausente (ENVIO-01 AC4–AC8, AC13; JANELA-01 AC4). *(human-send.test.ts: 12 recusas, cada uma com toEqual do código e do texto, fetch com 0 chamadas e nenhuma mensagem humano gravada; 4.096 aceito com corpo de 4.096; escopo de corretor e outro tenant com linha real; 24 h exatas e sem mensagem do lead fecham a janela)*
- [x] Sucesso: o corpo enviado ao `fetch` falso tem o texto sem espaços nas pontas e sem prefixo (AC3), o destinatário é o `externalId` legado convertido para 13 dígitos (ligação com `phone.mjs`, L-026) e a mensagem fica gravada como `humano` com autor e `wamid` (AC1, AC2). Lead em `escalado_humano` sem marca também envia. *(corpo com texto aparado e formatação intacta; to = 5534998880000 a partir do wa_id 553498880000 (mutação sem toWhatsAppMsisdn faz o teste falhar); mensagem humano com authorUserId, authorName, externalId wamid e sentAt; reserva enviada; escalado_humano sem marca envia)*
- [x] Meta recusa → nada gravado, reserva `falhou`, motivo devolvido (AC9); 131047 → texto de janela fechada (JANELA-01 AC6). *(131056: nada gravado, reserva falhou com failure falha-meta, motivo e metaCode devolvidos, log envio-humano-falhou sem o texto; timeout: tempo-esgotado sem gravar; 131047 devolve o mesmo texto de janela-fechada da recusa do CRM)*
- [x] Meta aceita e o registro falha (falha forçada): o log `envio-humano-sem-registro` tem tenant, lead e `wamid` e não tem o conteúdo, e o resultado é `entregue-sem-registro` (AC10, L-002). *(falha forçada no CHECK de autor dentro da transação: fetch 1 vez, entregue-sem-registro, nenhuma mensagem com o wamid, reserva não enviada, log com tenantId, leadId e wamid e sem o conteúdo)*
- [x] Mesmo `requestId` duas vezes → uma chamada à Meta e uma mensagem (AC11); segunda chamada com a primeira em voo → `envio-em-andamento`. *(duas chamadas sequenciais: fetch 1 vez, 1 mensagem, os dois resultados com a mesma mensagem; primeira presa no fetch: a segunda devolve envio-em-andamento com 0 chamadas e fica 1 mensagem)*
- [x] `HUMAN_SEND_MESSAGES` é tipado pelo union, e um código novo sem texto quebra a compilação (L-029). *(HUMAN_SEND_MESSAGES anotado como Record<HumanSendFailure, string>; o teste confere as 13 chaves do design e os textos pt-BR do Error Handling)*
- [x] Gate Quick passa; contagem registrada. *(Gate Quick: 1 arquivo / 21 testes passando; eslint limpo; tsc sem erro nos arquivos novos)*

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(chats): add human message send service`

#### T17: Criar o serviço de opt-out pelo humano

**What:** Criar `registerHumanOptOut`: grava o opt-out com pedido de reset e, com a janela aberta e o número conhecido, envia `OPT_OUT_CONFIRMATION` (importado de `n8n/src/opt-out-intent.mjs`) por `deliverHumanText`.
**Where:** `src/server/chats/human-opt-out.ts`
**Depends on:** T16
**Reuses:** `optOutLeadByHuman` (T5), `deliverHumanText` (T16), `OPT_OUT_CONFIRMATION`
**Requirement:** OPTHUM-01
**Tools:** Local Core

**Done when:**

- [x] Teste novo `src/server/chats/__tests__/human-opt-out.test.ts`: grava `optedOutAt` e `memory_reset_requested_at` (AC1, AC6 lado do CRM). *(human-opt-out.test.ts: resultado ok com optedOutAt NOW e newlyOptedOut true; optedOutAt e memoryResetRequestedAt iguais a NOW no banco)*
- [x] Janela aberta → exatamente uma chamada à Meta, com o texto **byte a byte igual** a `OPT_OUT_CONFIRMATION`, gravado como `humano` com autor (AC3). *(fetch 1 vez; Buffer do corpo enviado igual ao de OPT_OUT_CONFIRMATION; 1 mensagem humano com o mesmo texto, authorUserId e authorName)*
- [x] Janela fechada → zero chamadas, opt-out gravado (AC4). *(janela com 24 h exatas: fetch 0 vez, confirmationDelivered false, optedOutAt NOW e nenhuma mensagem)*
- [x] Meta recusa → opt-out mantido e `confirmationDelivered: false` (AC5). *(Meta devolve 131056: optedOutAt mantido, confirmationDelivered false e aviso 'Opt-out registrado. A confirmação não foi entregue ao lead.')*
- [x] Lead já com opt-out → nenhuma escrita nem envio; fora do escopo → recusa e `optedOutAt` nulo (AC8); lead conduzido pelo agente → permitido. *(já com opt-out: optedOutAt original, memoryResetRequestedAt nulo, updatedAt igual, 0 reserva e 0 envio; outra carteira e outro tenant com linha real: fora-do-escopo, fetch 0 vez e optedOutAt nulo; lead do agente: opt-out e confirmação enviada)*
- [x] `n8n/src/opt-out-intent.mjs` não foi alterado (a identidade do classificador da AD-032 continua valendo). *(git diff vazio e nenhum commit do lote em n8n/src/opt-out-intent.mjs; o serviço só importa a constante)*
- [x] Gate Quick passa; contagem registrada. *(Gate Quick: 1 arquivo / 8 testes passando; eslint limpo; tsc sem erro nos arquivos novos)*

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(chats): add human opt-out registration`

#### T18: Criar as server actions de Chats

**What:** Criar `assumeConversationAction`, `returnConversationToAgentAction`, `sendHumanMessageAction` e `registerOptOutAction`, com `denyIfForbidden("chats","escrever")`, escopo e usuário da sessão e `revalidatePath("/chats")`.
**Where:** `src/server/actions/chats.ts`
**Depends on:** T17
**Reuses:** `src/server/actions/pipeline.ts`, `denyIfForbidden`, serviços T5/T16/T17
**Requirement:** ASSUMIR-01, ENVIO-01, DEVOLVER-01, OPTHUM-01
**Tools:** Local Core

**Done when:**

- [x] Teste novo `src/server/__tests__/chats-actions.test.ts` com sessão simulada (padrão de `properties-actions.test.ts`): sessão sem papel recebe a recusa de permissão nas quatro actions e nada é gravado (ASSUMIR-01 AC4, ENVIO-01 AC7, OPTHUM-01 AC8). *(chats-actions.test.ts: com roles [] as quatro actions devolvem 'Sem permissão para escrever chats.'; marca, devolução, mensagem e optedOutAt sem mudança, fetch 0 vez e revalidatePath não chamado)*
- [x] Teste de ligação por action, que falha se a action deixar de chamar o serviço (L-026): assumir grava a marca com o id do usuário da sessão; devolver limpa; enviar grava a mensagem com o nome do usuário da sessão como autor; opt-out grava `optedOutAt`. *(assumir grava humanTakeoverBy = usuário da sessão; corretor não assume lead de outra carteira (escopo da sessão); devolver zera a marca; enviar grava conteúdo aparado com authorName e authorUserId da sessão; recusa do serviço devolve failure e texto; opt-out grava optedOutAt)*
- [x] `revalidatePath("/chats")` é chamado em cada sucesso. *(toHaveBeenCalledWith('/chats') nos quatro sucessos)*
- [x] Nota para o Verifier: os consumidores de produção nascem nas T32 e T33 (L-021); esta tarefa não fecha a feature sozinha. *(Nota para o Verifier: as actions ainda não têm consumidor de produção; o cabeçalho (T32) e o composer (T33) as ligam, então ASSUMIR-01, ENVIO-01, DEVOLVER-01 e OPTHUM-01 não fecham com esta tarefa (L-021))*
- [x] Gate Quick passa; contagem registrada. *(Gate Quick: 1 arquivo / 10 testes passando; eslint limpo; tsc sem erro nos arquivos novos)*

**Tests:** integration
**Gate:** Quick
**Commit:** `feat(chats): add conversation server actions`

#### T19: Limpar as reservas no reset do smoke

**What:** `resetSmokeLead` apaga as linhas de `human_message_sends` do lead antes de apagar mensagens, conversas e o lead.
**Where:** `src/db/smoke-reset.ts`
**Depends on:** T18
**Reuses:** a transação existente (`smoke-reset.ts:74-101`)
**Requirement:** HUMPROVA-01
**Tools:** Local Core

**Done when:**

- [x] Teste (existente estendido ou novo em `src/db/__tests__/`): um lead de smoke com reserva e mensagem `humano` é apagado sem violar FK, e as reservas somem junto. *(smoke-reset.test.ts estendido: lead com mensagem humano e duas reservas (enviada com message_id e falhou) é apagado com outcome apagado, deletedMessages 2, zero reservas e zero lead; antes da correção o mesmo teste falhava com violação de human_message_sends_message_id_messages_id_fk)*
- [x] Gate Quick passa; contagem registrada. *(Gate Quick: 1 arquivo / 5 testes passando (antes 4); eslint limpo)*

**Tests:** integration
**Gate:** Quick
**Commit:** `fix(db): clear human send reservations on smoke reset`

#### T20: Reter as reservas por 30 dias na rotina diária

**What:** A rotina diária de manutenção (a mesma que purga `integration_refusals`) apaga as reservas `human_message_sends` com mais de 30 dias.
**Where:** `src/server/integration/lgpd.ts`
**Depends on:** T19
**Reuses:** `purgeIntegrationRefusals` e sua chamada na rotina de `/api/cron/expire-documents`
**Requirement:** ENVIO-01
**Tools:** Local Core

**Done when:**

- [x] Teste: reserva com **exatamente 30 dias** é apagada (fronteira, L-023), com 29 dias e 23 h permanece, e a de outro tenant segue a mesma regra. *(human-send-retention.test.ts: nos dois tenants, a reserva com createdAt exatamente 30 dias antes some e a de 29 dias e 23 h fica; trocar lte por < faz o teste falhar)*
- [x] Teste de ligação: a rotina do cron chama a purga nova (L-026). *(cron-expire-documents.test.ts: POST da rota apaga a reserva de 2020, mantém a recente e devolve reservationsDeleted >= 1 e reservationsPurgeFailed false; sem o grupo novo em runDailyMaintenance o teste falhava)*
- [x] Gate Full passa (fim da Phase 4); contagem registrada. *(Gate Full: npm test 140 arquivos / 2.287 testes, 2.285 passando e só as 2 falhas conhecidas (DOCLIM-01 AC8, timeout); lint 0 erros (7 avisos preexistentes); build verde. Antes da fase: 135 / 2.233)*

**Tests:** integration
**Gate:** Full
**Commit:** `feat(maintenance): retain human send reservations for 30 days`

### Phase 5: n8n — módulos e workflows

#### T21: Calar o agente no gate quando há marca

**What:** `gate()` recebe `humanTakeoverAt` e encaminha para `somente-registrar` logo depois da palavra exata de opt-out, no mesmo nível de `escalado_humano`.
**Where:** `n8n/src/gate.mjs`
**Depends on:** T20
**Reuses:** `gate.mjs:67-73`
**Requirement:** SILENCIO-01
**Tools:** Local Core

**Done when:**

- [ ] Arquivo de teste novo `n8n/src/__tests__/gate-conducao-humana.test.ts`: marca + texto → `somente-registrar` (AC1, AC2); marca + mídia sem texto → `somente-registrar` (Edge Cases); marca + `sair` → `opt-out` (AC3, entrada que satisfaz as duas regras, L-041); marca + `optedOutAt` → `somente-registrar`.
- [ ] `gate.test.ts` existente passa **sem alteração** (sem a marca, as rotas não mudam).
- [ ] Gate Quick passa; contagem registrada.

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(n8n): route human-conducted leads to record-only`

#### T22: Mapear a fala humana na semeadura da memória

**What:** Adicionar `toSeedMemoryItem(message)` a `session.mjs`: `agente` → `ai`; `lead` → `user`; `humano` → tipo confirmado na T1 (`system` por padrão) com o texto `"Mensagem enviada ao lead por <authorName>, da equipe da imobiliária: <conteúdo>"`; `authorName` nulo → `"alguém da equipe"`; remetente desconhecido → descartado.
**Where:** `n8n/src/session.mjs`
**Depends on:** T21
**Reuses:** `session.mjs` (tipo `HistoryMessage`)
**Requirement:** DEVOLVER-01
**Tools:** Local Core

**Done when:**

- [ ] Testes em `n8n/src/__tests__/session.test.ts`, um por remetente; o texto de atribuição é afirmado byte a byte (DEVOLVER-01 AC6).
- [ ] Nenhum caminho devolve `user` para uma mensagem `humano` (asserção dedicada).
- [ ] O tipo usado para `humano` é o registrado na T1.
- [ ] Gate Quick passa; contagem registrada.

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(n8n): attribute human messages when seeding memory`

#### T23: Ligar a condução no fluxo principal

**What:** Em `principal.ts`: o corpo do `POST /leads` ganha `whatsappPhoneNumberId`; `Code: gate` passa `humanTakeoverAt`; o ramo de contingência ganha `HTTP: GET /leads/{id} (antes do envio)` → `Code: pode enviar no turno?` (`canAgentSendInTurn` inline) → IF, com o ramo falso e a saída de erro indo ao fechamento sem envio.
**Where:** `n8n/workflows/principal.ts`
**Depends on:** T22
**Reuses:** `principal.ts:414-440` (POST), `:500-523` (gate), `:1660-1705` (contingência), convenção `__INLINE`
**Requirement:** SILENCIO-01, ENVIO-01
**Tools:** n8n leitura (`get_node_types`, `validate_workflow`)

**Done when:**

- [ ] Arquivo de teste novo `n8n/workflows/__tests__/principal-conducao-humana.test.ts`: o `jsonBody` do POST contém `whatsappPhoneNumberId` vindo de `Code: combinar evento e tenant`; o código do gate passa `humanTakeoverAt`.
- [ ] O envio de contingência só é alcançável pela saída verdadeira do novo IF; a saída falsa e a saída de erro do HTTP (índice real no `toJSON()`, L-044) chegam ao fechamento sem envio; testes que falham se qualquer aresta sumir (SILENCIO-01 AC4, AC5; L-026).
- [ ] O `Code: pode enviar no turno?` inlina `conduction.mjs`; `leadId`/`tenantSlug` vêm de expressão do fluxo, nunca de `$fromAI`.
- [ ] `node scripts/n8n-inline.mjs` roda; `validate_workflow` do gerado sem erro; gerado no mesmo commit.
- [ ] Gate Full passa; contagem registrada.

**Tests:** unit
**Gate:** Full
**Commit:** `feat(n8n): wire human conduction into the main flow`

#### T24: Reconstruir a memória quando o CRM pede

**What:** Em `principal.ts`: `Code: sessão expirada?` devolve `expired || resetDue` (`memoryResetDue` com `memoryResetRequestedAt` do lead e `memoryResetAt` de `conversa_estado`); o upsert `purgar qualificação e persona (sessão expirada)` grava `memoryResetAt`; `Code: selecionar mensagens de semeadura` usa `toSeedMemoryItem` no lugar do ternário de `:929`.
**Where:** `n8n/workflows/principal.ts`
**Depends on:** T23
**Reuses:** `principal.ts:745-830` (purga por expiração), `:899-940` (semeadura)
**Requirement:** DEVOLVER-01
**Tools:** n8n leitura

**Done when:**

- [ ] Testes estruturais (no arquivo da T23 ou em `principal-reset-memoria.test.ts`): o código de `sessão expirada?` inlina `conduction.mjs` e chama `memoryResetDue`; o IF segue a saída combinada; o upsert tem `memoryResetAt` no `schema` e no `value`; o ternário `m.sender === 'agente' ? 'ai' : 'user'` não existe mais e `toSeedMemoryItem` é chamado.
- [ ] Teste de ligação: a saída verdadeira do IF continua chegando à purga da memória **e** à purga de `conversa_estado` (L-026).
- [ ] Grep de `conversa_estado` em todos os workflows (`L-015`) registrado na Evidence: nenhum leitor quebra com a coluna nova.
- [ ] `node scripts/n8n-inline.mjs` roda; `validate_workflow` sem erro; gerado no mesmo commit.
- [ ] Gate Full passa; contagem registrada.

**Tests:** unit
**Gate:** Full
**Commit:** `feat(n8n): rebuild agent memory on crm reset requests`

#### T25: Reler o lead antes de cada envio de `responder_lead`

**What:** Entre `Aceito pelas barreiras de persona?` e `Code: normalizar destinatario do envio`, inserir `HTTP: GET /leads/{id} (antes do envio)` (`onError: continueErrorOutput`) → `Code: pode enviar no turno?` → IF; o falso vai à recusa com `reason: "conversa-com-humano"` e o erro com `reason: "conducao-indisponivel"`.
**Where:** `n8n/workflows/tool-responder-lead.ts`
**Depends on:** T24
**Reuses:** `tool-responder-lead.ts:183-280`, credencial "Crivo - chave de servico"
**Requirement:** SILENCIO-01
**Tools:** n8n leitura

**Done when:**

- [ ] Arquivo de teste novo `n8n/workflows/__tests__/tool-responder-lead.test.ts`: `WhatsApp: enviar resposta do agente` só é alcançável pela saída verdadeira do IF novo; saída falsa e erro do HTTP chegam à recusa sem envio e sem `persistAbertura` (AC4, AC5; L-026, L-044).
- [ ] O `leadId` e o `tenantSlug` do GET vêm do `Execute Workflow Trigger`, nunca do modelo.
- [ ] `node scripts/n8n-inline.mjs` roda; `validate_workflow` sem erro; gerado no mesmo commit.
- [ ] Gate Full passa; contagem registrada.

**Tests:** unit
**Gate:** Full
**Commit:** `feat(n8n): check conduction before each agent reply`

#### T26: Conferir a condução ao vivo no reengajamento e no escalonamento

**What:** Nas varreduras B e C do scheduler, depois do filtro de `fase`, inserir `HTTP: GET /leads/{id}` e um filtro por `canAgentContactProactively`; a varredura A (lembretes) não muda.
**Where:** `n8n/workflows/scheduler.ts`
**Depends on:** T25
**Reuses:** `scheduler.ts:344-540` (B), `:540-660` (C), `postLeadForReminder` como precedente de leitura ao vivo
**Requirement:** SILENCIO-01
**Tools:** n8n leitura

**Done when:**

- [ ] Arquivo de teste novo `n8n/workflows/__tests__/scheduler-conducao.test.ts`: `WhatsApp: reengajamento (template)` e `HTTP: PATCH /leads/{id} (silencio 48h)` só são alcançáveis depois do filtro novo (AC6, AC7; L-026).
- [ ] A cadeia de lembretes tem o mesmo conjunto de nós de antes, e nenhum deles consulta a condução (AC8).
- [ ] Falha do GET não envia nem escala (erro sem ligação de saída, ou ligado a um fim sem efeito).
- [ ] `node scripts/n8n-inline.mjs` roda; `validate_workflow` sem erro; gerado no mesmo commit.
- [ ] Gate Full passa; contagem registrada.

**Tests:** unit
**Gate:** Full
**Commit:** `feat(n8n): skip proactive contact for human-conducted leads`

#### T27: Criar a varredura D de purga pedida pelo CRM

**What:** Quarta cadeia no mesmo trigger de 15 min: `tenant_config` → `HTTP: GET /memory-resets?since=now-24h` → `Split` → `Data Table: conversa_estado` → `Code: reset devido?` → IF → `Postgres: apagar sessão` (DELETE parametrizado, coluna confirmada na T1) → `Data Table: purgar qualificação e persona + memoryResetAt`.
**Where:** `n8n/workflows/scheduler.ts`
**Depends on:** T26
**Reuses:** fan-out existente (`scheduler.ts:718-721`), upsert de purga do `principal.ts`
**Requirement:** OPTHUM-01, DEVOLVER-01
**Tools:** n8n leitura (`get_node_types` do nó Postgres)

**Done when:**

- [ ] Testes estruturais em `scheduler-conducao.test.ts`: a cadeia D sai do mesmo trigger (continua um trigger só, R3); o `DELETE` usa parâmetro (`queryReplacement`/`$1`), nunca concatenação; a chave montada é idêntica à `sessionKey` do `memoryPostgresChat` do principal (teste de paridade de string); a purga de `conversa_estado` grava `memoryResetAt`.
- [ ] O HTTP tem `onError: continueRegularOutput`, e a ausência de pedidos termina a cadeia sem erro.
- [ ] `node scripts/n8n-inline.mjs` roda; `validate_workflow` sem erro; gerado no mesmo commit.
- [ ] Gate Build passa (fim da Phase 5); contagem registrada.

**Tests:** unit
**Gate:** Build
**Commit:** `feat(n8n): purge agent memory on crm reset requests`

### Phase 6: Tela de Chats

#### T28: Agrupar a thread com o remetente humano

**What:** `ChatSender` ganha `humano`; `buildChatThread` carrega `authorName` e quebra o grupo quando o autor humano muda.
**Where:** `src/lib/chat-thread.ts`
**Depends on:** T27
**Reuses:** `chat-thread.ts`
**Requirement:** THREAD-01
**Tools:** Local Core

**Done when:**

- [x] Testes em `src/lib/__tests__/chat-thread.test.ts`: duas mensagens seguidas do mesmo humano formam um grupo; de humanos diferentes formam dois grupos; humano seguido de agente forma dois grupos; o grupo humano carrega `authorName`.
- [x] Os testes existentes passam sem alteração.
- [x] Gate Quick passa; contagem registrada. *(chat-thread.test.ts: 9 → 13 testes, todos passando. `next build` volta a passar.)*

**Nota de ordem (decisão do usuário, 2026-10-01):** executada antes da Phase 3, logo depois da T7. O enum `sender` ganhou `humano` na T2 e `ChatSender` não, então o `next build` falhava desde a T2 (`message-thread.tsx:48`). A T28 é um módulo puro sem dependência das Phases 3–5; antecipá-la devolve o build verde aos gates seguintes. A renderização continua na T29.

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(chats): group human authored messages in threads`

#### T29: Renderizar a mensagem humana na thread

**What:** `MessageThread` mostra o remetente `humano` à direita, com bolha `filled`, `Avatar` com as iniciais do autor e o nome na primeira bolha do grupo; o agente continua sem avatar e sem nome.
**Where:** `src/components/chats/message-thread.tsx`
**Depends on:** T28
**Reuses:** `message-thread.tsx`, família Chat da Astryx (`npx astryx component ChatMessage`)
**Requirement:** THREAD-01
**Tools:** Tela

**Done when:**

- [ ] Captura real (extensão do Chrome, `npm run dev:test`) de uma thread com lead, agente e dois humanos diferentes, mostrando a distinção (AC1).
- [ ] Self-check da Astryx: nenhum `<div>`, `style={{}}` ou valor arbitrário.
- [ ] Gate Build passa; contagem registrada.

**Tests:** none
**Gate:** Build
**Commit:** `feat(chats): render human authored messages`

#### T30: Marcar na lista as conversas conduzidas por humano

**What:** `ConversationList` mostra um `Token` "Humano" nas conversas com `humanConducted`, junto do horário.
**Where:** `src/components/chats/conversation-list.tsx`
**Depends on:** T29
**Reuses:** `conversation-list.tsx`, `Token`/`Stack` da Astryx
**Requirement:** THREAD-01
**Tools:** Tela

**Done when:**

- [ ] Captura real da lista com uma conversa do agente, uma com marca e uma em `escalado_humano` (AC5).
- [ ] Self-check da Astryx; gate Build passa; contagem registrada.

**Tests:** none
**Gate:** Build
**Commit:** `feat(chats): flag human-conducted conversations in the list`

#### T31: Atualizar a conversa aberta a cada 5 s

**What:** Criar `ChatRefresh`, ilha cliente sem UI que chama `router.refresh()` a cada `CHAT_REFRESH_INTERVAL_MS` enquanto `shouldPollConversation` for verdadeiro, com um único intervalo e pausa com a aba oculta.
**Where:** `src/components/chats/chat-refresh.tsx`
**Depends on:** T30
**Reuses:** `src/components/documents/document-processing-refresh.tsx`, regras da T4
**Requirement:** THREAD-01, JANELA-01
**Tools:** Tela

**Done when:**

- [ ] Evidência por `read_network_requests` (extensão do Chrome): requisições de RSC a cada ~5 s com a conversa aberta e a aba visível, e nenhuma com a aba oculta (AC2, AC3).
- [ ] Uma mensagem de lead inserida no banco de teste aparece na tela em até 10 s sem recarregar, com captura antes e depois (AC2; JANELA-01 AC5 quando a janela estava fechada).
- [ ] Gate Build passa; contagem registrada.

**Tests:** none
**Gate:** Build
**Commit:** `feat(chats): refresh the open conversation while visible`

#### T32: Criar o cabeçalho com condução e controles

**What:** Criar `ConversationHeader` (client): nome, telefone, indicador de condução (`StatusDot` + texto: agente pelo nome, usuário que assumiu ou "Escalado para humano"), botões "Assumir conversa" e "Devolver ao agente", e "Registrar opt-out" com `AlertDialog` (texto do OPTHUM-01 AC2), chamando as actions da T18.
**Where:** `src/components/chats/conversation-header.tsx`
**Depends on:** T31
**Reuses:** `conversationControls` (T4), actions (T18), `AlertDialog`/`Button`/`StatusDot` da Astryx
**Requirement:** ASSUMIR-01, DEVOLVER-01, OPTHUM-01, THREAD-01
**Tools:** Tela

**Done when:**

- [ ] Capturas dos quatro estados: agente conduzindo ("Assumir" visível), humano conduzindo ("Devolver" visível), escalado, e a caixa de confirmação de opt-out aberta (THREAD-01 AC4; ASSUMIR-01 AC8; DEVOLVER-01 AC9; OPTHUM-01 AC2).
- [ ] Clique real em "Assumir" e em "Devolver" no `dev:test`, com o estado do lead conferido no banco de teste depois de cada um.
- [ ] Grep comprova que `assumeConversationAction`, `returnConversationToAgentAction` e `registerOptOutAction` têm consumidor de produção (L-021).
- [ ] Nenhum texto em inglês visível (L-010); self-check da Astryx; gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `feat(chats): add conversation header with conduction controls`

#### T33: Criar o composer humano

**What:** Criar `HumanComposer` (client) sobre `ChatComposer`: `placeholder` em pt-BR, `headerContext` com "Janela do WhatsApp fecha em …", `status` com o aviso de janela fechada ou o erro de `HUMAN_SEND_MESSAGES`, desabilitado com a janela fechada ou durante o envio, botão de envio próprio rotulado "Enviar" (`useChatComposerContext`), `requestId` renovado só depois de sucesso.
**Where:** `src/components/chats/human-composer.tsx`
**Depends on:** T32
**Reuses:** `ChatComposer`, `useChatComposerContext`, `IconButton` da Astryx; `sendHumanMessageAction` (T18)
**Requirement:** ENVIO-01, JANELA-01
**Tools:** Tela

**Done when:**

- [ ] Capturas: janela aberta com o tempo restante (JANELA-01 AC2); janela fechada com o campo desabilitado, o aviso e o instante de fechamento (AC3); erro de envio com o texto preservado no campo (ENVIO-01 AC9).
- [ ] No `dev:test`, com o envio à Meta apontado para um `fetch` falso ou sem token, o erro aparece em pt-BR e o texto fica no campo; a captura prova.
- [ ] Inspeção do DOM confirma o rótulo acessível "Enviar" e nenhum "Send"/"Type a message" (L-010).
- [ ] Grep comprova que `sendHumanMessageAction` tem consumidor de produção (L-021); self-check da Astryx; gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `feat(chats): add human composer with whatsapp window`

#### T34: Compor a tela de Chats

**What:** `page.tsx` calcula no servidor `whatsappWindow` e `conversationControls`, carrega a última mensagem do lead e a permissão, monta cabeçalho, thread, composer, `ChatRefresh` e o banner de opt-out somente leitura, e troca o subtítulo para "N conversas no WhatsApp".
**Where:** `app/(crm)/chats/page.tsx`
**Depends on:** T33
**Reuses:** `page.tsx` atual, componentes T29–T33
**Requirement:** THREAD-01, JANELA-01, OPTHUM-01, ENVIO-01
**Tools:** Tela

**Done when:**

- [ ] Capturas de página inteira: conversa do agente; conversa assumida com a janela aberta; conversa assumida com a janela fechada (lead do seed com a última mensagem há mais de 24 h); conversa com opt-out somente leitura com a data (OPTHUM-01 AC7); visão de corretor puro (só a própria carteira); largura de celular.
- [ ] O subtítulo não diz mais "conduzidas pelo agente" (THREAD-01 AC6).
- [ ] O texto da janela vem pronto do servidor (nenhum `Timestamp` da Astryx no tempo restante).
- [ ] Self-check da Astryx no arquivo inteiro; gate Build passa (fim da Phase 6); contagem registrada.

**Tests:** none
**Gate:** Build
**Commit:** `feat(chats): compose human in the loop chats page`

### Phase 7: Documentação, implantação e prova

#### T35: Documentar o n8n

**What:** `n8n/README.md` ganha: a marca no gate, a releitura antes do envio (`responder_lead` e contingência), o reset de memória (marcador + `memoryResetAt`), a varredura D, a coluna nova de `conversa_estado` e o runbook de rotação do token nos dois cofres (Vercel e n8n).
**Where:** `n8n/README.md`
**Depends on:** T34
**Reuses:** seções §3, §10.2, §12
**Requirement:** HUMDOC-01
**Tools:** Local Core

**Done when:**

- [ ] Cada item acima tem seção ou parágrafo citável (HUMDOC-01 AC4).
- [ ] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(n8n): document human conduction and memory reset`

#### T36: Documentar o contrato para integradores

**What:** `docs/integration/guia-integracao.md` ganha a autoria `humano` (só leitura), `authorName`, os campos de condução, `whatsappPhoneNumberId`, `GET /leads/{id}`, `GET /memory-resets` e o 409 `lead-conduzido-por-humano`.
**Where:** `docs/integration/guia-integracao.md`
**Depends on:** T35
**Reuses:** estrutura atual do guia
**Requirement:** CONTRATO-01
**Tools:** Local Core

**Done when:**

- [ ] Cada item citado aparece no guia, coerente com o `openapi.yaml` da T13.
- [ ] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(integration): document human authorship and conduction`

#### T37: Escrever os cenários da prova no roteiro

**What:** `n8n/smoke/roteiro.md` ganha os cenários (a) assumir, responder e receber sem recarregar; (b) devolver e o agente usar um fato que só o corretor disse; (c) opt-out pelo CRM; (d) `sair` durante a condução humana — no formato da AD-027, com a limpeza entre cenários (`smoke:reset` agora inclui as reservas; `crivo-smoke-reset` no n8n).
**Where:** `n8n/smoke/roteiro.md`
**Depends on:** T36
**Reuses:** formato dos cenários do lote-10 e do lote-13
**Requirement:** HUMPROVA-01
**Tools:** Local Core

**Done when:**

- [ ] Os quatro cenários têm intenção de turno, estado final exigido no CRM e no WhatsApp, e barra por desfecho, com observações de fala em seção separada (HUMPROVA-01 AC1, AC5).
- [ ] O cenário (a) exige zero mensagem do agente depois da marca (AC3); o (b) fixa o fato do corretor ("o apartamento da Rua X tem 3 vagas"); o (c) exige a sessão vazia em até 20 min.
- [ ] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(n8n): add human in the loop smoke scenarios`

#### T38: Implantar o CRM

**What:** Com autorização específica a cada passo: o usuário cria `WHATSAPP_ACCESS_TOKEN` (produção) na Vercel; `drizzle-kit push` no banco de produção; auditoria de trailer em `origin/main` inteiro e no range local (AD-014); `git push` para o deploy; conferência do deploy.
**Where:** `.specs/features/lote-14-humano-no-laco/tasks.md`
**Depends on:** T37
**Reuses:** MCP Vercel somente leitura
**Requirement:** ENVIO-01, HUMPROVA-01
**Tools:** Implantação

**Done when:**

- [ ] O usuário confirma a variável criada (o agente nunca vê o valor).
- [ ] `drizzle-kit push` em produção aplicado com autorização; colunas e tabela novas conferidas por consulta de esquema.
- [ ] Auditoria de trailer limpa antes do push; push autorizado; deploy `READY` conferido por `get_deployment`.
- [ ] `GET /api/v1/leads/{id}` sem credencial responde 401 (não 405) em produção, e `GET /api/v1/memory-resets` sem credencial responde 401.
- [ ] Evidence registrada nesta tarefa, sem segredo; gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(specs): record lote 14 crm rollout`

#### T39: Publicar o n8n

**What:** Com autorização específica: `add_data_table_column` `memoryResetAt` em `conversa_estado`; `update_workflow` + `publish_workflow` de `crivo-tool-responder-lead`, `crivo-agente-scheduler` e `crivo-agente-principal`, nessa ordem.
**Where:** `.specs/features/lote-14-humano-no-laco/tasks.md`
**Depends on:** T38
**Reuses:** pipeline de publicação do `n8n/README.md`
**Requirement:** SILENCIO-01, DEVOLVER-01, OPTHUM-01
**Tools:** n8n escrita

**Done when:**

- [ ] Coluna criada e conferida por `search_data_tables`.
- [ ] Cada workflow publicado com `versionId == activeVersionId` (L-032), e `get_workflow_details` igual ao `n8n/generated/` correspondente.
- [ ] Uma execução real de cada workflow depois da publicação, conferida por `get_execution`, sem erro (o scheduler no próximo tick; o principal e a tool na prova da T40, se não houver tráfego antes).
- [ ] Evidence registrada; gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(specs): record lote 14 n8n publication`

#### T40: Provar por conversa real

**What:** Rodar os cenários (a)–(d) do roteiro com o usuário enviando pelo WhatsApp, com capturas do CRM pela extensão do Chrome, ids conferidos e limpeza entre cenários; registrar a captura da janela fechada.
**Where:** `n8n/smoke/evidencia.md`
**Depends on:** T39
**Reuses:** protocolo da AD-027, `smoke:reset`, `crivo-smoke-reset`
**Requirement:** HUMPROVA-01, ASSUMIR-01, SILENCIO-01, ENVIO-01, THREAD-01, DEVOLVER-01, OPTHUM-01
**Tools:** Conectado — **autorização específica**

**Done when:**

- [ ] Cenário (a) aprovado: mensagem humana entregue no WhatsApp e gravada como `humano` com autor; resposta do lead na tela em até 10 s sem recarregar; zero mensagem do agente depois da marca, conferida na thread e nas execuções `somente-registrar` (HUMPROVA-01 AC3).
- [ ] Cenário (b) aprovado: depois da devolução, o agente responde usando o fato que só o corretor escreveu, sem atribuí-lo ao lead.
- [ ] Cenário (c) aprovado: `optedOutAt` gravado, uma confirmação entregue, sessão vazia em `n8n_chat_histories` em até 20 min (execução da varredura D conferida) e silêncio na mensagem seguinte.
- [ ] Cenário (d) aprovado: `sair` com a marca grava `optedOutAt` e envia a confirmação única.
- [ ] Captura do campo bloqueado para um lead com a última mensagem há 24 h ou mais (AC4).
- [ ] Evidência em `n8n/smoke/evidencia.md` § Lote 14 com ids conferidos por `get_execution` (L-011), sem PII; estado de teste limpo no fim; gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(n8n): record human in the loop smoke evidence`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

Phase 1:  T1                                   (inline, autorização)
Phase 2:  T2 → T3 → T4 → T5 → T6 → T7          (worker A)
Phase 3:  T8 → T9 → T10 → T11 → T12 → T13 → T14 (worker B)
Phase 4:  T15 → T16 → T17 → T18 → T19 → T20    (worker C)
Phase 5:  T21 → T22 → T23 → T24 → T25 → T26 → T27 (worker D)
Phase 6:  T28 → T29 → T30 → T31 → T32 → T33 → T34 (inline: capturas pela extensão do Chrome)
Phase 7:  T35 → T36 → T37 → T38 → T39 → T40    (inline: autorizações e conversa real)
```

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 rascunho de confirmação + registro no design | ✅ |
| T2 | 1 arquivo de esquema (colunas e tabela de um mesmo recorte) | ⚠️ coeso: uma migração aplicada por `db:push` |
| T3, T4 | 1 módulo puro cada | ✅ |
| T5, T6, T7 | 1 grupo de funções da DAL cada (escrita de condução / envio / leitura) | ✅ |
| T8 | 1 endpoint (`POST /leads`) com parser e serialização | ⚠️ coeso: toca `parsers.ts` e DAL só para esse endpoint |
| T9, T12 | 1 endpoint cada | ✅ |
| T10, T11 | 1 regra de contrato cada | ✅ |
| T13 | 1 documento + testes de paridade | ✅ |
| T14 | 2 testes num arquivo | ✅ |
| T15, T16, T17 | 1 serviço cada | ✅ |
| T18 | 1 arquivo de actions | ✅ |
| T19, T20 | 1 função cada | ✅ |
| T21, T22 | 1 função pura cada | ✅ |
| T23, T24 | 1 recorte coeso do mesmo workflow cada (condução / memória) | ✅ |
| T25, T26, T27 | 1 mudança de workflow cada | ✅ |
| T28–T34 | 1 componente ou página cada | ✅ |
| T35–T37 | 1 documento cada | ✅ |
| T38, T39, T40 | 1 procedimento conectado cada | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | início | ✅ Match |
| T2 | T1 | T1 → T2 (fronteira de fase) | ✅ Match |
| T3–T7 | anterior | cadeia da Phase 2 | ✅ Match |
| T8 | T7 | fronteira de fase | ✅ Match |
| T9–T14 | anterior | cadeia da Phase 3 | ✅ Match |
| T15 | T14 | fronteira de fase | ✅ Match |
| T16–T20 | anterior | cadeia da Phase 4 | ✅ Match |
| T21 | T20 | fronteira de fase | ✅ Match |
| T22–T27 | anterior | cadeia da Phase 5 | ✅ Match |
| T28 | T27 | fronteira de fase | ✅ Match |
| T29–T34 | anterior | cadeia da Phase 6 | ✅ Match |
| T35 | T34 | fronteira de fase | ✅ Match |
| T36–T40 | anterior | cadeia da Phase 7 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | rascunho conectado + design | connected/manual (sem código do repo) | none | ✅ OK |
| T2 | Esquema | integration | integration | ✅ OK |
| T3 | Módulo puro n8n | unit | unit | ✅ OK |
| T4 | Módulo puro CRM | unit | unit | ✅ OK |
| T5, T6, T7 | DAL | integration | integration | ✅ OK |
| T8–T12, T14 | Rotas `/api/v1` | integration | integration | ✅ OK |
| T13 | Contrato | unit | unit | ✅ OK |
| T15 | Serviço CRM | integration/unit | unit | ✅ OK |
| T16, T17 | Serviço CRM | integration/unit | integration | ✅ OK |
| T18 | Server actions | integration | integration | ✅ OK |
| T19, T20 | DAL/manutenção | integration | integration | ✅ OK |
| T21, T22 | Módulo puro n8n | unit | unit | ✅ OK |
| T23–T27 | Workflows n8n | unit/structural | unit | ✅ OK |
| T28 | Módulo puro CRM | unit | unit | ✅ OK |
| T29–T34 | Componentes de UI | none + captura | none (+ captura no Done when) | ✅ OK |
| T35–T37 | Documentação | none | none | ✅ OK |
| T38–T40 | Ambiente conectado | connected/manual | none (procedimento + evidência) | ✅ OK |
