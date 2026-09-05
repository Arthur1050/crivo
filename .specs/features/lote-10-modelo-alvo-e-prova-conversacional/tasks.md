# Lote 10 — Modelo alvo e prova conversacional: Tasks

## Execution Protocol (MANDATORY — do not skip)

Implemente estas tasks com a skill `tlc-spec-driven`: **ative-a pelo nome e siga o fluxo de Execute e
as Critical Rules dela.** Não procure os arquivos da skill por caminho de filesystem. A skill é a
fonte de verdade do fluxo completo (ciclo por task, delegação a sub-agentes, revisão de adequação,
Verifier, sensor de discriminação).

**Se a skill não puder ser ativada, PARE e avise o usuário — não prossiga sem ela.**

---

**Spec**: `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/spec.md`
**Design**: `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/design.md`
**Context**: `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/context.md`
**Status**: Draft

---

## Test Coverage Matrix

> Gerada do codebase, das guidelines do projeto e da spec — confirmar antes do Execute.
> Guidelines encontradas: `AGENTS.md` / `CLAUDE.md` (convenções de UI/Astryx e disciplina de
> workflow-as-code; **nenhuma** guideline de teste), `vitest.config.ts` (`fileParallelism: false`,
> timeout 30s), `package.json` (`test: vitest run`, `lint: eslint`). Amostradas 8 suítes existentes,
> incluindo `n8n/workflows/__tests__/tool-agendar-reuniao.test.ts` — o precedente de teste de
> **grafo de workflow** via `toJSON()`, que é o que este lote usa.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Fonte de workflow SDK (`n8n/workflows/*.ts`) | unit (grafo via `toJSON()`) | Todo invariante que este lote muda **ou promete não mudar**: nó de modelo (tipo, versão, id do modelo, credencial), ausência de nó Gemini, ausência de `temperature`, e as 5 tools + memória intactas | `n8n/workflows/__tests__/*.test.ts` | `npx vitest run n8n/workflows` |
| Camada de decisão pura (`n8n/src/*.mjs`) | unit | **Não tocada por este lote** (Out of Scope: gate e persona). Os testes existentes servem de rede: qualquer alteração acidental quebra o gate `full` | `n8n/src/__tests__/*.test.ts` | `npx vitest run` |
| Artefato gerado (`n8n/generated/*.ts`) | none | Build gate. É saída determinística do inliner, já coberta por `scripts/__tests__/n8n-inline.test.ts` — testar de novo duplicaria a mesma asserção | — | build gate |
| Estado da instância n8n (publicação, execuções reais) | none | Não é código. A evidência é execução real via MCP, registrada com id em `n8n/smoke/evidencia.md` | — | evidência |
| Conversa real no WhatsApp | none | Não automatizável por construção. Evidência: id de execução + captura do CRM + link do evento | — | evidência |
| Documentação (`.specs/**`, `n8n/README.md`, `n8n/smoke/*.md`) | none | Build gate | — | build gate |
| UI (`src/app/**`, `src/components/**`) | none | Zero `.test.tsx` no repositório (precedente registrado nos lotes 8 e 9). **Não tocada por este lote** | — | — |

**Nota honesta sobre o alcance dos testes deste lote**: o único código novo é a suíte de grafo do T3.
Ela é forte no que cobre (fixa o nó trocado e prova que nada além dele mudou), e é **cega** para o que
o lote realmente quer saber — se o modelo novo chama tools bem. Isso não é testável em vitest; é o
que a bateria (Fase 3) e o smoke (Fase 5) existem para descobrir. O Verifier precisa ler o piso de
testes quase plano como consequência de desenho, não como cobertura faltante.

## Gate Check Commands

> Geradas do codebase — confirmar antes do Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Depois de task que mexe só na fonte de workflow | `npx vitest run n8n/workflows` |
| Full | Depois de task que pode ter efeito fora de `n8n/workflows` | `npx vitest run` |
| Build | Fim de fase, e tasks só de documentação | `npx vitest run && npm run lint && npm run build` |
| Evidência | Tasks cujo produto é execução real ou estado de instância — **nenhum teste roda** | Registro em `n8n/smoke/evidencia.md` com id de execução, conferido contra o Done-when da task |

**Por que existe um gate "Evidência", e por que ele proíbe rodar teste**: `src/db/__tests__/seed.test.ts`
chama `runSeed()` no `beforeAll`, e o seed **rotaciona as chaves de API a cada execução**. Rodar
`vitest` no meio de um cenário do smoke invalida a autenticação do agente e mata o cenário com `401`
sem nenhuma relação com o modelo — o incidente real do lote-6 T11, documentado em `n8n/README.md` §4.
Da T12 em diante, nenhum `vitest run` acontece até o smoke terminar.

---

## Execution Plan

Fases rodam em sequência; tasks rodam em ordem dentro da fase. Este lote é literalmente uma cadeia de
portões — não há paralelismo real a explorar.

### Phase 1: Linha de base

```
T1 → T2
```

### Phase 2: Troca do modelo

```
T3 → T4 → T5
```

### Phase 3: Bateria de tool calling (portão de rollback)

```
T6 → T7 → T8 → T9
```

### Phase 4: Roteiro do smoke

```
T10 → T11
```

### Phase 5: As três conversas reais (orquestrador + usuário — NÃO delegável)

```
T12 → T13 → T14 → T15 → T16
```

### Phase 6: Reconciliação documental

```
T17 → T18 → T19
```

### Phase 7: Fechamento e rastreabilidade

```
T20 → T21 → T22 → T23 → T24
```

### Phase 8: Multi-tenancy condicional

```
T25
```

---

## Task Breakdown

### T1: Registrar a linha de base do lote

**What**: Criar o arquivo de evidência do lote com o piso de testes real e a confirmação de que a
fonte dos workflows está sincronizada com `n8n/generated/`.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: None
**Reuses**: formato de registro de `n8n/README.md` §§10-12
**Requirement**: MOD-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `npx vitest run` rodado e o número real registrado (passed / arquivos) — **o número medido, nunca o herdado da documentação**
- [x] `node scripts/n8n-inline.mjs` rodado e `git status` confirma diff zero em `n8n/generated/`
- [x] Se houver diff, ele é registrado no arquivo antes de qualquer outra coisa (fonte e gerado estavam dessincronizados)
- [x] Gate check passa: `npx vitest run`

**Tests**: none
**Gate**: full
**Commit**: `docs(smoke): registra linha de base de testes e sincronia do inliner`

---

### T2: Confirmar paridade entre o workflow publicado e `n8n/generated/`

**What**: Comparar, nó a nó, o `crivo-agente-principal` publicado na instância contra
`n8n/generated/principal.ts`, e registrar o resultado (paridade ou divergência) antes de qualquer
publicação nova.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T1
**Reuses**: procedimento de reconciliação de `n8n/README.md` §11.2
**Requirement**: MOD-03

**Tools**:
- MCP: `n8n` (`search_workflows`, `get_workflow_details`)
- Skill: NONE

**Done when**:
- [x] `get_workflow_details` do `crivo-agente-principal` obtido e comparado com `n8n/generated/principal.ts`
- [x] Contagem de nós e conexões registrada dos dois lados (61 nós / 75 conexões dos dois lados)
- [x] O nó de modelo publicado é confirmado como `lmChatGoogleGemini` / `models/gemini-3.5-flash-lite` — o ponto de partida da troca
- [x] Divergências (se houver) listadas nominalmente, separando cosmético de lógico — **divergência lógica encontrada** (configurações de execução ausentes em 3 nós, §2.5 da evidência): batch parado, T3-T5 não executados
- [x] Nenhuma publicação feita nesta task

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): registra paridade publicado x generated antes da troca de modelo`

---

### T3: Trocar o nó de modelo para `lmChatOpenAi` / `gpt-5.4-nano-2026-03-17`

**What**: Substituir o bloco `agentModel` pela declaração do nó OpenAI, e criar a suíte de grafo que
fixa o que mudou e o que não pode ter mudado.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T2
**Reuses**: `principal.ts:211,1172` (resource locator literal); `n8n/workflows/__tests__/tool-agendar-reuniao.test.ts` (padrão de teste de grafo via `toJSON()`)
**Requirement**: MOD-01

**Tools**:
- MCP: `n8n` (`get_node_types`, se precisar reconferir o schema)
- Skill: NONE

**Done when**:
- [x] `agentModel` é `@n8n/n8n-nodes-langchain.lmChatOpenAi` v1.3, `model` como resource locator com `value` **e** `cachedResultName` iguais a `gpt-5.4-nano-2026-03-17`, credencial `newCredential("OpenAI account")`
- [x] `options` tem `reasoningEffort: "low"` e `timeout: 120000`, e **não** tem `temperature`
- [x] O comentário acima do bloco explica por que o snapshot é datado e por que `temperature` saiu — no mesmo tom do comentário que ele substitui
- [x] Suíte nova `n8n/workflows/__tests__/principal-modelo.test.ts` cobre, sobre `principal.toJSON()`: (a) tipo, versão e id do modelo; (b) `cachedResultName === value`; (c) nenhum nó `lmChatGoogleGemini` no grafo; (d) ausência de `temperature`; (e) as 5 tools presentes por nome; (f) memória segue `memoryPostgresChat` com `sessionKey` inalterada; (g) contagem total de nós e de conexões igual à registrada em T2 — o discriminante de MOD-01 AC2
- [x] Nenhum arquivo de `n8n/src/` alterado
- [x] Gate check passa: `npx vitest run n8n/workflows`
- [x] Contagem de testes: piso de T1 + os novos desta suíte, sem nenhuma deleção silenciosa

**Tests**: unit
**Gate**: quick
**Commit**: `feat(agente): troca o modelo do AI Agent para gpt-5.4-nano`

---

### T4: Regenerar `n8n/generated/principal.ts` e conferir que o diff é de um nó só

**What**: Rodar o inliner e verificar que a única mudança no artefato gerado é o nó de modelo.
**Where**: `n8n/generated/principal.ts`
**Depends on**: T3
**Reuses**: `scripts/n8n-inline.mjs`
**Requirement**: MOD-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `node scripts/n8n-inline.mjs` rodado
- [x] `git diff n8n/generated/principal.ts` confinado ao bloco do nó de modelo — qualquer linha fora dele é investigada antes de commitar
- [x] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `chore(agente): regenera principal com o no de modelo OpenAI`

---

### T5: Publicar o workflow na instância e confirmar o nó publicado

**What**: Publicar `n8n/generated/principal.ts` na instância via MCP e confirmar que o nó de modelo
publicado é o OpenAI, com o workflow ainda ativo.
**Where**: instância n8n — workflow `crivo-agente-principal`
**Depends on**: T4
**Reuses**: procedimento de publicação de `n8n/README.md` §1
**Requirement**: MOD-01

**Tools**:
- MCP: `n8n` (`update_workflow`, `publish_workflow`, `get_workflow_details`)
- Skill: NONE

**Done when**:
- [x] Workflow publicado a partir de `n8n/generated/principal.ts` (nunca editado pela UI — AD-014)
- [x] `get_workflow_details` confirma `lmChatOpenAi` com `gpt-5.4-nano-2026-03-17` e nenhum nó Gemini
- [x] Workflow continua `active: true` e com `settings.errorWorkflow` apontando para `crivo-agente-erros`
- [x] Id da versão publicada registrado em `n8n/smoke/evidencia.md`

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): registra publicacao do no de modelo OpenAI na instancia`

---

### T6: Escrever o procedimento da bateria de tool calling

**What**: Documentar como a bateria roda, sobre qual alvo, em que ordem, e qual é exatamente o
critério que aprova ou dispara o rollback.
**Where**: `n8n/smoke/bateria.md`
**Depends on**: T5
**Reuses**: `n8n/fixtures/llm-invalid-enum.json` e vizinhas
**Requirement**: MOD-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Alvo declarado: lead de descarte, `waId` fictício, tenant `triangulo` — nunca o número do smoke
- [x] As 5 tools listadas com o que conta como chamada bem-sucedida em cada uma
- [x] `escalar_para_humano` explicitamente por último, com o motivo (trava o lead de descarte, `gate.mjs:70`)
- [x] O caso do enum inválido descrito com o comportamento esperado (agente segue, não trava)
- [x] Critério de rollback escrito como condição binária, não como julgamento
- [x] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(smoke): procedimento da bateria de tool calling`

---

### T7: Executar a bateria sobre as 5 tools

**What**: Rodar a bateria via MCP e registrar o id de execução de cada tool exercitada.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T6
**Reuses**: `n8n/fixtures/*.json`; padrão de execução via MCP dos lotes 6c e 7
**Requirement**: MOD-02

**Tools**:
- MCP: `n8n` (`execute_workflow`, `test_workflow`, `get_execution`, `search_executions`)
- Skill: NONE

**Done when**:
- [x] `registrar_qualificacao`, `consultar_documentos`, `responder_lead`, `agendar_reuniao` e `escalar_para_humano` com pelo menos uma chamada bem-sucedida cada
- [x] Um id de execução por tool registrado — nunca "funcionou", sempre o id
- [x] Qualquer tool que não tenha sido chamada é registrada como não chamada, com o que o agente fez no lugar
- [x] Nenhum lead do roteiro do smoke tocado

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): evidencia da bateria de tool calling (5 tools)`

---

### T8: Exercitar a recusa por enum inválido

**What**: Provocar `400 payload-invalido` em `registrar_qualificacao` e registrar se o agente segue o
turno ou trava.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T7
**Reuses**: `n8n/fixtures/llm-invalid-enum.json`; comportamento de referência da execução 462 (lote-6c)
**Requirement**: MOD-02

**Tools**:
- MCP: `n8n` (`execute_workflow`, `get_execution`)
- Skill: NONE

**Done when**:
- [x] Recusa `400 payload-invalido` observada de verdade na execução, com o `code` do `problem+json` registrado
- [x] Comportamento do agente após a recusa descrito: seguiu, repetiu, ou travou
- [x] Id da execução registrado
- [x] Comparação explícita com o comportamento da execução 462 no Gemini

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): evidencia do enum invalido na bateria`

---

### T9: Veredito da bateria — seguir ou executar o rollback

**What**: Decidir, pelo critério binário de T6, se o modelo novo fica; se não ficar, reverter o nó
para Gemini, regenerar, republicar e atualizar a suíte de grafo.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T8
**Reuses**: o bloco `agentModel` original (recuperável de `git show` do commit anterior a T3)
**Requirement**: MOD-02

**Tools**:
- MCP: `n8n` (`update_workflow`, `publish_workflow` — só no caminho de rollback)
- Skill: NONE

**Done when**:
- [x] Veredito escrito em `n8n/smoke/evidencia.md` com a condição de T6 avaliada item a item — §12.6, `R1 = falso` e `R2 = falso` (as 3 cláusulas), sobre as execuções `1952`, `1956`, `1960`, `1966`, `1970`
- [x] **Caminho aprovado**: nenhuma mudança de código; a task registra o veredito e segue — **APROVADO**; `principal.ts`, `generated/principal.ts` e `principal-modelo.test.ts` intocados por T9
- [x] **Caminho rollback**: não aplicável — o veredito foi APROVADO, o rollback da `bateria.md` §6.1 não foi disparado
- [x] Nos dois caminhos, a Fase 4 começa com o modelo que o veredito determinou — Fase 4 e Fase 5 correm em `gpt-5.4-nano-2026-03-17`
- [x] Gate check passa: `npx vitest run`

**Tests**: unit
**Gate**: full
**Commit**: `docs(smoke): veredito da bateria de tool calling` (ou `revert(agente): volta o modelo para gemini-3.5-flash-lite` no caminho de rollback)

---

### T10: Escrever o roteiro dos três cenários

**What**: Descrever os três cenários de forma reexecutável — objetivo, turnos esperados, estado final
exigido, evidência a coletar.
**Where**: `n8n/smoke/roteiro.md`
**Depends on**: T9
**Reuses**: AD-015 (os três desfechos), AD-016 (persona), AD-022 (atribuição no escalonamento)
**Requirement**: SMK-01, SMK-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Cenário 1 (qualificar→agendar): estado final `status = reuniao_agendada` + evento com link do Meet — **correção registrada no roteiro**: o valor real do enum `lead_status` é `qualificado_agendado`, não `reuniao_agendada` (nome de rascunho que sobreviveu na spec/design/tasks); o roteiro exige o valor real
- [x] Cenário 2 (escalar): estado final `status = escalado_humano` **com responsável atribuído**, mais uma mensagem seguinte que precisa ficar sem resposta
- [x] Cenário 3 (opt-out por palavra-chave): estado final `optedOutAt` preenchido, memória purgada, silêncio depois
- [x] Turnos escritos como **intenção**, não como fala literal — o agente não é determinístico
- [x] Barra de aprovação declarada por desfecho, com uma seção separada para observações de estilo que **não** reprovam
- [x] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(smoke): roteiro dos tres cenarios da prova conversacional`

---

### T11: Adicionar o checklist de limpeza entre cenários

**What**: Acrescentar ao roteiro o checklist dos três alvos que precisam ser limpos à mão entre um
cenário e o próximo, com a chave de cada um e a ordem obrigatória.
**Where**: `n8n/smoke/roteiro.md`
**Depends on**: T10
**Reuses**: `principal.ts:679` (`sessionKey`); `schema.ts:206-232` (ordem das FKs)
**Requirement**: SMK-05

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Alvo 1 — sessão em `n8n_chat_histories`, com a chave `"<tenantSlug>:<waId>"` escrita explicitamente
- [ ] Alvo 2 — linha de `conversa_estado` (`ZsplBxJjXv3kwKZ8`), casada por `tenantSlug` + `waId`
- [ ] Alvo 3 — lead no CRM, com a ordem `messages` → `conversations` → `leads` e o motivo (FKs sem `onDelete`)
- [ ] Ordem entre sistemas escrita: n8n antes do CRM, com o motivo (mensagem no intervalo recriaria o lead com estado velho)
- [ ] O que cada alvo esquecido causa, em uma linha cada — é isso que faz o checklist ser lido
- [ ] Linha de confirmação para marcar antes do cenário seguinte começar
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(smoke): checklist de limpeza entre cenarios`

---

### T12: Confirmar as pré-condições da fase de conversas reais

**What**: Verificar, antes da primeira mensagem, que tudo que pode matar um cenário por motivo alheio
ao modelo está em ordem — e declarar o congelamento de `vitest`.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T11
**Reuses**: `n8n/README.md` §4 (ordem seed ↔ rotação de chaves)
**Requirement**: SMK-05

**Tools**:
- MCP: `n8n` (`get_workflow_details`, `search_data_tables`)
- Skill: NONE

**Done when**:
- [ ] Chave de serviço confirmada funcionando contra `/api/v1` (uma chamada real, com o resultado registrado)
- [ ] `crivo-agente-principal` ativo, com o modelo do veredito de T9
- [ ] `tenant_config` com a linha do `triangulo` presente e apontando para o `calendarId` certo
- [ ] Número de teste e destinatário confirmados na lista permitida da Meta
- [ ] **Congelamento declarado**: nenhum `npx vitest run` até T16 terminar, com o motivo escrito
- [ ] Os três alvos do checklist confirmados limpos antes do cenário 1 (estado inicial)

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): pre-condicoes confirmadas para as conversas reais`

---

### T13: Cenário 1 — qualificar → agendar (fecha AGT-04)

**What**: Conduzir a conversa real do cenário 1 e registrar a evidência do desfecho.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T12
**Reuses**: `n8n/smoke/roteiro.md` (cenário 1)
**Requirement**: SMK-02

**Tools**:
- MCP: `n8n` (`search_executions`, `get_execution`)
- Skill: NONE

**Done when**:
- [ ] Conversa conduzida no WhatsApp pelo usuário, seguindo os turnos do roteiro
- [ ] Lead termina com `status = reuniao_agendada` no CRM — confirmado na tela, não inferido
- [ ] Evento existe no Google Calendar com link do Meet, e o link é registrado
- [ ] Id da execução n8n registrado
- [ ] Captura de tela do CRM anexada ou seu caminho registrado
- [ ] Observações de estilo registradas em seção própria, sem reprovar o cenário
- [ ] Limpeza dos três alvos confirmada antes de T14

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): cenario 1 (qualificar-agendar) executado — AGT-04`

---

### T14: Cenário 2 — escalar para humano (fecha AGT-05)

**What**: Conduzir a conversa real do cenário 2 e provar que a trava humana segura o agente.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T13
**Reuses**: `n8n/smoke/roteiro.md` (cenário 2); `gate.mjs:70`
**Requirement**: SMK-03

**Tools**:
- MCP: `n8n` (`search_executions`, `get_execution`)
- Skill: NONE

**Done when**:
- [ ] Lead termina com `status = escalado_humano` no CRM
- [ ] Responsável atribuído (rede de segurança da AD-022), com o nome registrado
- [ ] Uma mensagem enviada **depois** do escalonamento aparece registrada no CRM **sem resposta do agente** — é isso que prova a trava, não o status
- [ ] Id da execução registrado, mostrando a rota `somente-registrar`
- [ ] Captura de tela do CRM registrada
- [ ] Limpeza dos três alvos confirmada antes de T15

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): cenario 2 (escalonamento) executado — AGT-05`

---

### T15: Cenário 3 — opt-out por palavra-chave (fecha LGPD-03)

**What**: Conduzir a conversa real do cenário 3 e provar o desfecho de opt-out ponta a ponta.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T14
**Reuses**: `n8n/smoke/roteiro.md` (cenário 3); `gate.mjs:68-69`
**Requirement**: SMK-04

**Tools**:
- MCP: `n8n` (`search_executions`, `get_execution`)
- Skill: NONE

**Done when**:
- [ ] Lead termina com `optedOutAt` preenchido no CRM
- [ ] Sessão em `n8n_chat_histories` confirmada purgada pelo próprio fluxo (não pela limpeza manual)
- [ ] Uma mensagem enviada depois do opt-out fica sem resposta, e nada é enviado ao lead
- [ ] Id da execução registrado
- [ ] Captura de tela do CRM registrada
- [ ] Limpeza dos três alvos confirmada ao fim

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): cenario 3 (opt-out) executado — LGPD-03`

---

### T16: Veredito do smoke

**What**: Consolidar os três cenários num veredito por desfecho e decidir se abre fix task.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T15
**Reuses**: barra de aprovação definida em T10
**Requirement**: SMK-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cada cenário marcado aprovado ou reprovado **pelo estado final**, com a evidência citada
- [ ] Observações de estilo consolidadas numa seção separada, sem influenciar o veredito
- [ ] Se algum cenário reprovou: fix task aberta com o motivo, antes de qualquer requisito subir para `Verified`
- [ ] Se o estilo ficou ruim mas os desfechos passaram: registrado como candidato a ajuste de prompt (válvula da decisão E do `context.md`), não como falha
- [ ] Gate check passa: `npx vitest run` — primeira rodada de teste desde T12, com o congelamento encerrado

**Tests**: none
**Gate**: full
**Commit**: `docs(smoke): veredito consolidado da prova conversacional`

---

### T17: Reconciliar VOZ-03 AC4 e os Edge Cases do lote-6c

**What**: Fazer a spec do lote-6c descrever o comportamento real — silêncio no estouro de
`maxIterations` — em vez de prometer um fallback que nunca existiu.
**Where**: `.specs/features/lote-6c-agente-ai-agent-memoria-tools/spec.md`
**Depends on**: T16
**Reuses**: `lote-6c/validation.md` Finding 1; `lote-6c/design.md` (Error Handling Strategy, que já dizia isso)
**Requirement**: DOC-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] VOZ-03 AC4 reescrito declarando o silêncio como comportamento aceito
- [ ] O bullet correspondente em Edge Cases reescrito no mesmo sentido
- [ ] A razão registrada (silêncio é degradação mais segura que mensagem errada), não só o fato
- [ ] Nenhuma mudança de código — a reconciliação é documental
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): reconcilia VOZ-03 AC4 com o silencio real no estouro de maxIterations`

---

### T18: Marcar o Finding 1 do lote-6c como resolvido

**What**: Registrar no relatório do Verifier do lote-6c que o Finding 1 foi fechado por reconciliação
documental, sem apagar a análise original.
**Where**: `.specs/features/lote-6c-agente-ai-agent-memoria-tools/validation.md`
**Depends on**: T17
**Reuses**: o texto do próprio Finding 1
**Requirement**: DOC-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Nota de resolução acrescentada ao Finding 1, com data e referência ao lote-10
- [ ] O texto original preservado — o histórico do achado não é reescrito
- [ ] A opção (b) do Verifier (contador de regeneração + envio dedicado) registrada como deliberadamente não escolhida
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): fecha o Finding 1 do lote-6c por reconciliacao documental`

---

### T19: Corrigir a seção 4 do `n8n/README.md`

**What**: Registrar que o guard de `src/db/index.ts` já neutraliza a rotação de chaves por
`vitest run`, sem apagar o incidente que motivou a seção.
**Where**: `n8n/README.md`
**Depends on**: T18
**Reuses**: `src/db/index.ts:9-11`; achado do lote-8 (Batch 1)
**Requirement**: DOC-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A §4 registra o guard `process.env.VITEST` → `TEST_DATABASE_URL` e o que ele neutraliza
- [ ] O relato do incidente original (execuções 56/T10 e T11) permanece, marcado como histórico
- [ ] O que **continua** verdadeiro fica separado do que ficou obsoleto: `npm run db:seed` explícito ainda rotaciona as chaves
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(n8n): corrige a secao 4 do README sobre rotacao de chaves por vitest`

---

### T20: Registrar AD-026 e AD-027 e encerrar a AD-015

**What**: Escrever as duas decisões de projeto que sobrevivem a este lote, refletindo o que de fato
aconteceu, e marcar a AD-015 como superada.
**Where**: `.specs/STATE.md`
**Depends on**: T19
**Reuses**: formato das AD-001…025
**Requirement**: MOD-01, SMK-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] AD-026 registra o modelo que **realmente ficou** após o veredito de T9 — se o rollback disparou, ela nomeia o Gemini e o motivo, nunca o alvo planejado
- [ ] AD-026 cobre: snapshot datado obrigatório (alias flutuante proibido), `reasoningEffort` no lugar de `temperature`, troca confinada a um nó
- [ ] AD-027 registra o protocolo de prova conversacional: roteiro versionado, checklist dos três alvos, barra por desfecho
- [ ] AD-015 com `Status: superseded by AD-027`
- [ ] Trade-off honesto em cada uma — inclusive o de a limpeza ser manual e não verificável
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): registra AD-026 e AD-027 e encerra a AD-015`

---

### T21: Fechar a rastreabilidade da spec do lote-10

**What**: Subir os 12 requirement IDs deste lote para o veredito real.
**Where**: `.specs/features/lote-10-modelo-alvo-e-prova-conversacional/spec.md`
**Depends on**: T20
**Reuses**: tabela de rastreabilidade da própria spec
**Requirement**: MOD-01, MOD-02, MOD-03, SMK-01, SMK-02, SMK-03, SMK-04, SMK-05, SMK-06, DOC-01, DOC-02, MTN-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Cada um dos 12 IDs com status atualizado e a evidência citada (commit, id de execução, ou arquivo)
- [ ] Qualquer ID que não chegou a `Verified` fica com o motivo escrito, não com status otimista
- [ ] Os Success Criteria da spec marcados um a um, inclusive os que não foram atingidos
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): fecha a rastreabilidade do lote-10`

---

### T22: Atualizar o veredito de AGT-04, AGT-05 e LGPD-03 no lote-6

**What**: Substituir, na rastreabilidade do lote-6, os três vereditos deferidos pela AD-015 pelo que
o smoke provou.
**Where**: `.specs/features/lote-6-agente-n8n-whatsapp/spec.md`
**Depends on**: T21
**Reuses**: evidência de T13, T14, T15
**Requirement**: SMK-02, SMK-03, SMK-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] AGT-04, AGT-05 e LGPD-03 com veredito novo, cada um citando o cenário e o id de execução que o fechou
- [ ] A menção à AD-015 preservada como histórico, com a nota de que o lote-10 a fechou
- [ ] Se algum cenário reprovou, o veredito reflete isso — a tabela não sobe para `Verified` por conveniência
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): atualiza AGT-04, AGT-05 e LGPD-03 com a prova conversacional`

---

### T23: Atualizar o Handoff do `STATE.md`

**What**: Escrever o estado real ao fim do lote — o que foi provado, o que não foi, e o que continua
em aberto.
**Where**: `.specs/STATE.md`
**Depends on**: T22
**Reuses**: formato do Handoff dos lotes 8 e 9
**Requirement**: MOD-02, SMK-06

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Piso de testes final registrado (medido, não estimado)
- [ ] Veredito da bateria e do smoke resumidos, com os ids de execução
- [ ] Dívidas herdadas que este lote **não** tocou repetidas explicitamente, para não sumirem
- [ ] Pendências novas nomeadas — inclusive MTN-01, se não tiver rodado
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): atualiza o handoff do STATE apos o lote-10`

---

### T24: Acrescentar o lote-10 ao índice de features

**What**: Registrar a linha do lote-10 no mapa de entrada dos lotes executados.
**Where**: `.specs/features/INDEX.md`
**Depends on**: T23
**Reuses**: formato da tabela existente
**Requirement**: DOC-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Linha do lote-10 com data, veredito do Verifier, requisitos, o que entregou e o que ficou aberto
- [ ] A nota do roadmap pós-piloto atualizada — L10 sai de "proposto" para "executado"
- [ ] Gate check passa: `npx vitest run && npm run lint && npm run build`

**Tests**: none
**Gate**: build
**Commit**: `docs(specs): adiciona o lote-10 ao indice de features`

---

### T25: Multi-tenancy real — condicional ao 2º número

**What**: Se o segundo número estiver homologado, mapear o Vale do Uberaba em `tenant_config` e
repetir o cenário 1 nele; se não estiver, registrar a pendência nomeada.
**Where**: `n8n/smoke/evidencia.md`
**Depends on**: T24
**Reuses**: `n8n/smoke/roteiro.md` (cenário 1); Data Table `tenant_config` (`xRHckWWd6fxGeNta`)
**Requirement**: MTN-01

**Tools**:
- MCP: `n8n` (`add_data_table_rows`, `search_executions`, `get_execution`)
- Skill: NONE

**Done when**:
- [ ] **Caminho disponível**: linha nova em `tenant_config` mapeando o `phoneNumberId` para `vale-uberaba`; cenário 1 repetido no segundo número; lead nasce sob `vale-uberaba` e nenhum lead de `triangulo` é tocado; id de execução e captura registrados
- [ ] **Caminho indisponível**: pendência registrada em `STATE.md` § Handoff nomeando o que falta e quem depende dela, e MTN-01 fica explicitamente **não verificado** na rastreabilidade — nunca marcado como aprovado por ausência
- [ ] Nos dois caminhos, AGT-04, AGT-05 e LGPD-03 permanecem fechados

**Tests**: none
**Gate**: evidência
**Commit**: `docs(smoke): multi-tenancy real no segundo numero` (ou `docs(specs): registra MTN-01 como pendencia nomeada`)

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 8

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20 → T21 → T22 → T23 → T24 → T25
```

A execução é estritamente sequencial. O lote é uma cadeia de portões: cada task só faz sentido depois
que a anterior produziu seu resultado, e duas delas (T9 e T16) são vereditos que decidem o que a
seguinte faz.

**Empacotamento em batches (~7 tasks, fases inteiras):**

| Batch | Fases | Tasks | Delegável? |
| --- | --- | --- | --- |
| 1 | 1 + 2 | T1–T5 (5) | Sim |
| 2 | 3 + 4 | T6–T11 (6) | Sim |
| 3 | 5 | T12–T16 (5) | **Não** — conversa real no WhatsApp, captura do CRM do usuário, evento no Calendar dele |
| 4 | 6 + 7 | T17–T24 (8) | Sim |
| 5 | 8 | T25 (1) | **Não** — depende de homologação no painel da Meta |

---

## Task Granularity Check

| Task | Escopo | Status |
| --- | --- | --- |
| T1, T2 | 1 arquivo de evidência, um registro cada | ✅ Granular |
| T3 | 1 bloco de nó + sua suíte co-locada | ✅ Granular (testes co-locados são a regra, não uma segunda entrega) |
| T4, T5 | 1 artefato gerado / 1 publicação | ✅ Granular |
| T6 | 1 documento de procedimento | ✅ Granular |
| T7, T8 | 1 execução de bateria cada, escopos distintos (5 tools / recusa) | ✅ Granular |
| T9 | 1 veredito com dois caminhos definidos | ✅ Granular |
| T10, T11 | 1 arquivo, 2 entregas coesas e separáveis (cenários / checklist) | ✅ Granular |
| T12–T16 | 1 cenário ou 1 portão cada | ✅ Granular |
| T17–T19 | 1 arquivo cada | ✅ Granular |
| T20–T24 | 1 arquivo cada | ✅ Granular |
| T25 | 1 caminho condicional | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (corpo) | Diagrama mostra | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T2 | T2 → T3 | ✅ Match |
| T4 | T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T16 | T16 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |
| T21 | T20 | T20 → T21 | ✅ Match |
| T22 | T21 | T21 → T22 | ✅ Match |
| T23 | T22 | T22 → T23 | ✅ Match |
| T24 | T23 | T23 → T24 | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |

Nenhuma dependência aponta para fase posterior.

---

## Test Co-location Validation

| Task | Camada criada/modificada | Matriz exige | Task diz | Status |
| --- | --- | --- | --- | --- |
| T1 | Documentação (`n8n/smoke/`) | none | none | ✅ OK |
| T2 | Estado da instância (leitura) | none | none | ✅ OK |
| T3 | **Fonte de workflow SDK** | **unit** | **unit** | ✅ OK |
| T4 | Artefato gerado | none | none | ✅ OK |
| T5 | Estado da instância | none | none | ✅ OK |
| T6 | Documentação | none | none | ✅ OK |
| T7 | Execução real | none | none | ✅ OK |
| T8 | Execução real | none | none | ✅ OK |
| T9 | Fonte de workflow SDK (só no caminho de rollback) | unit | unit | ✅ OK |
| T10 | Documentação | none | none | ✅ OK |
| T11 | Documentação | none | none | ✅ OK |
| T12 | Estado da instância (leitura) | none | none | ✅ OK |
| T13 | Conversa real | none | none | ✅ OK |
| T14 | Conversa real | none | none | ✅ OK |
| T15 | Conversa real | none | none | ✅ OK |
| T16 | Documentação | none | none | ✅ OK |
| T17 | Documentação | none | none | ✅ OK |
| T18 | Documentação | none | none | ✅ OK |
| T19 | Documentação | none | none | ✅ OK |
| T20 | Documentação | none | none | ✅ OK |
| T21 | Documentação | none | none | ✅ OK |
| T22 | Documentação | none | none | ✅ OK |
| T23 | Documentação | none | none | ✅ OK |
| T24 | Documentação | none | none | ✅ OK |
| T25 | Execução real / documentação | none | none | ✅ OK |

**Por que tantos `Tests: none` e por que isso não é deferimento de teste**: das 25 tasks, exatamente
duas tocam código (T3 e, condicionalmente, T9) — e as duas carregam a suíte de grafo junto. Todo o
resto é documentação, publicação, ou execução real contra sistemas externos. A matriz marca essas
camadas como `none` porque não existe nível de teste que as cubra: um teste não conversa pelo
WhatsApp nem confirma um evento no Calendar de alguém. A cobertura equivalente é a evidência
registrada com id de execução, que é o que o gate "Evidência" exige.
