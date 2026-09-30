# Lote 13 — Opt-out por linguagem natural — Tarefas

## Execution Protocol (MANDATORY -- do not skip)

Implemente estas tarefas com a skill `tlc-spec-driven`: **ative-a pelo nome e siga integralmente seu fluxo Execute e suas Critical Rules**. Não procure a skill por caminho de filesystem. A skill é a fonte de verdade para ciclo por tarefa, commits atômicos, delegação, Verifier independente, sensor de discriminação e fechamento.

**Se a skill não puder ser ativada, PARE e informe ao usuário — não prossiga sem ela.**

---

**Design:** `.specs/features/lote-13-opt-out-linguagem-natural/design.md`
**Status:** Aprovado (2026-09-27) — pronto para Execute em outra janela (`EXECUTE-PROMPT.md`)
**Total:** 18 tarefas em 5 fases sequenciais

---

## Preconditions for Execute

- Confirmar `git status`, branch e baseline de testes antes da T1; preservar mudanças alheias.
- `npm test` roda a suíte completa em paralelo nas branches de worker do Neon (AD-033); nunca duas suítes completas ao mesmo tempo (L-033). Testes pontuais de uma tarefa (`npx vitest run <arquivo>`) usam a branch base e podem rodar enquanto a suíte roda. Depois de qualquer mudança de schema, `npm run db:push:test`. Confirmar que `TEST_DATABASE_URL` é descartável.
- Toda alteração em `n8n/workflows/*.ts` termina com `node scripts/n8n-inline.mjs` e com o `n8n/generated/` correspondente no mesmo commit.
- **Efeitos externos exigem autorização específica do usuário imediatamente antes**: T2 (workflow de rascunho no n8n), T12 (publicar e executar `crivo-medicao-opt-out`), T16 (publicar `crivo-agente-principal`), T17 (benchmark conectado e `persist`) e T18 (conversa real no WhatsApp). Aprovar este `tasks.md` não autoriza nenhuma delas. T1 e as leituras de T12 são somente leitura.
- Evidência nunca contém texto de mensagem de lead real, telefone completo, token ou chave. Ids de execução só entram depois de conferidos por `get_execution` (L-011).
- Toda publicação no n8n confere `versionId == activeVersionId` depois do `publish_workflow` (L-032).
- **Parada obrigatória**: se a medição da T12 sair `REPROVADO`, o lote para. Nada da Phase 5 roda, e o usuário decide o próximo passo (AD-032).

## Proposed Tool Profiles

| Perfil | Ferramentas propostas |
| --- | --- |
| Local Core | shell local, Edit/Write, Vitest, ESLint, Next build, `node scripts/n8n-inline.mjs`, skill `tlc-spec-driven` |
| n8n leitura | Local Core + MCP n8n: `get_sdk_reference`, `get_node_types`, `validate_workflow`, `search_executions`, `get_execution`, `get_workflow_details` |
| n8n escrita | n8n leitura + `create_workflow_from_code`, `update_workflow`, `publish_workflow`, `execute_workflow`, `archive_workflow`, **cada escrita com autorização específica** |
| Conectado | n8n escrita + `scripts/document-context-benchmark.ts` contra o banco conectado; conversa real conduzida pelo usuário no WhatsApp |

Os perfis são uma proposta. O usuário pode trocar ou restringir ferramentas antes do Execute.

---

## Test Coverage Matrix

> Gerada a partir do código, das diretrizes do projeto e da spec — confirmar antes do Execute. Diretrizes encontradas: `AGENTS.md`, `vitest.config.ts`, `package.json`, `n8n/README.md` (AD-014, §13), `.specs/STATE.md` (AD-018, AD-026, AD-027, AD-031, AD-032) e as lições confirmadas (L-002, L-011, L-012, L-016, L-023, L-024, L-025, L-026, L-032, L-033 e L-037 são as que tocam este lote). Amostras: `n8n/src/__tests__/gate.test.ts`, `system-message.test.ts`, `n8n/workflows/__tests__/principal-modelo.test.ts`, `principal-consultar-documentos.test.ts`, `scripts/__tests__/n8n-inline.test.ts` e `src/server/documents/__tests__/`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Módulos puros do n8n (`n8n/src/*.mjs`) | unit | Todas as branches; 1:1 com os ACs aplicáveis; cada subcláusula com asserção própria (L-012); fronteiras exatas (L-023); valores de produção das constantes afirmados (L-037) | `n8n/src/__tests__/*.test.ts` | `npx vitest run n8n/src/__tests__` |
| Workflows n8n como código | unit/structural | Grafo por `toJSON()`: nós, arestas por saída, parâmetros e ausência de `$fromAI` de identificação; cada ligação entre peças com teste que falha se a aresta sumir (L-026); contagens medidas, não supostas | `n8n/workflows/__tests__/*.test.ts` | `npx vitest run n8n/workflows/__tests__` |
| Scripts e identidade (`scripts/`, `src/server/documents/benchmark-identity.ts`) | unit | Hash estável com CRLF/LF; muda quando cada componente muda; regressão da extração do modelo com dois nós `lmChatOpenAi` | `scripts/__tests__/*.test.ts`, `src/server/documents/__tests__/*.test.ts` | `npx vitest run <arquivo-da-tarefa>` |
| Fixtures e corpus | unit (estrutural) | Contagens mínimas por faixa, frases obrigatórias presentes, ids únicos, sem PII | `n8n/src/__tests__/opt-out-corpus.test.ts` | `npx vitest run n8n/src/__tests__/opt-out-corpus.test.ts` |
| Documentação (`roteiro.md`, `README.md`, `design.md`) | none | — (revisão + grep do Independent Test de OPTDOC-01) | — | gate Build |
| Ambiente conectado (n8n, WhatsApp, CRM, benchmark) | connected e2e/manual | Execução real com id conferido, estado final no CRM (AD-027), evidência sem PII | `n8n/smoke/evidencia.md`, relatórios em `.specs/features/lote-13-opt-out-linguagem-natural/` | procedimento da tarefa + gate Build |

## Gate Check Commands

> Gerados do repositório — confirmar antes do Execute. Comandos de uma mesma célula são executados separadamente, na ordem indicada.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Tarefa com testes unitários/estruturais isolados | `npx vitest run <arquivo-ou-diretório-da-tarefa>` |
| Full | Tarefa que muda workflow publicável ou identidade do benchmark | `node scripts/n8n-inline.mjs`<br>`npm test` |
| Build | Fechamento de fase, documentação e tarefas conectadas | `npm test`<br>`npm run lint`<br>`npm run build` |

Em todo gate, registrar total de arquivos e de testes antes e depois, e provar que nenhum teste foi removido em silêncio. Baseline de referência (AD-033, 2026-09-27): 117 arquivos / 1.878 testes.

---

## Execution Plan

As fases e tarefas são estritamente sequenciais.

### Phase 1: Espinha — confirmar o que o design não pôde confirmar

```text
T1 -> T2
```

### Phase 2: Módulos puros e identidade

```text
T3 -> T4 -> T5 -> T6 -> T7
```

### Phase 3: Workflows como código

```text
T8 -> T9 -> T10 -> T11
```

### Phase 4: Medição conectada (portão de publicação)

```text
T12 -> T13
```

### Phase 5: Documentação, publicação e prova

```text
T14 -> T15 -> T16 -> T17 -> T18
```

---

## Task Breakdown

### Phase 1: Espinha — confirmar o que o design não pôde confirmar

#### T1: Registrar o formato real da sessão carregada pela memória

**What:** Ler uma execução real recente do `crivo-agente-principal` com sessão não vazia e registrar o formato dos elementos de `messages` que `Chat Memory Manager: carregar sessão` devolve com `groupMessages: true`, gerando uma fixture sanitizada com esse formato.
**Where:** `n8n/fixtures/memory-load-sample.json`
**Depends on:** None
**Reuses:** `principal.ts:771-784` (comentário do shape conhecido), MCP `search_executions`/`get_execution`
**Requirement:** OPTREG-01, OPTAMB-01
**Tools:** n8n leitura (somente leitura; sem autorização extra)

**Done when:**

- [x] O id da execução lida foi conferido por `get_execution` e registrado na seção Evidence desta tarefa (L-011).
- [x] A fixture reproduz exatamente as chaves e a estrutura observadas (incluindo como uma mensagem de agente e uma de lead aparecem) e troca todo texto por conteúdo sintético; nenhum telefone, nome ou texto real.
- [x] A fixture também inclui um exemplo dos itens de `Code: selecionar mensagens de semeadura` (`{ type, message, nadaParaSemear }`), lido do código em `principal.ts:837-883`.
- [x] Se o formato contradisser o `design.md` (por exemplo, sem autoria distinguível), a execução para e o desvio vai ao usuário antes da T3.
- [x] Gate Build passa sem mudança na contagem de testes.

**Tests:** none
**Gate:** Build
**Commit:** `test(n8n): capture memory session load shape fixture`

**Status:** ✅ Concluída (2026-09-27)

**Evidence:**

- Execução **2598** do `crivo-agente-principal` (`0B1nqjODu7xuYYKF`), `status: success`, modo `webhook`, 2026-09-25T22:27:28Z, conferida por `get_execution` com `includeData` restrito a `Chat Memory Manager: carregar sessão`. Saída: `{ messages: [...8 elementos], messagesCount: 8 }`.
- Formato observado: cada elemento de `messages` agrupa mensagens consecutivas **por autoria**, com as chaves na ordem de inserção. `human` (string) é o lead; `ai` string é a fala do agente; `ai: []` é a mensagem do agente que só chamou tool (sem texto); `tool` é o resultado da tool serializado como string. Exemplos reais de chaves: `{human, ai: [], tool}`, `{ai: "<texto>", human}`, `{ai: [], tool}`, `{ai: "<texto>"}` (último elemento, agente por último).
- **Autoria distinguível**: sim. Não contradiz o `design.md`. `lastAgentMessage` deve percorrer os elementos do fim para o começo e devolver o primeiro `ai` que seja string não vazia, ignorando `ai: []`.
- `messagesCount` conta elementos agrupados, não mensagens individuais.
- Observação (não bloqueante): o `ai` gravado na memória é a saída final do agente; o texto efetivamente enviado ao lead sai pela tool `responder_lead`. Nesta execução a memória guarda a fala do agente como texto, que é o que o classificador vai ler.
- Fixture: `n8n/fixtures/memory-load-sample.json` (`loaded`, `loadedEmpty`, `seeded`, `seededNothing`), textos sintéticos, sem telefone, nome real ou id real (o `leadId` foi trocado por um UUID fictício). Os itens de semeadura seguem `principal.ts` (`{ type: 'user'|'ai', message, nadaParaSemear: false }` e o sentinela `{ nadaParaSemear: true }`).
- Gate Build: `npm test` 117 arquivos / 1.878 testes, 0 falhas, 0 skips (igual ao baseline); `npm run lint` 0 erros (7 avisos preexistentes); `npm run build` ok.

#### T2: Confirmar roteamento de erro e formato do Text Classifier

**What:** Criar um workflow de rascunho no n8n com `textClassifier` v1.1 (categorias `fora`, `ambigua`, `explicita`; `fallback: other`; `onError: continueErrorOutput`) e um `lmChatOpenAi` com o snapshot da AD-026, e registrar no `design.md`: por qual saída sai um item com erro, se o `systemPromptTemplate` customizado mantém as instruções de formato, e se o auto-fix dispara.
**Where:** `.specs/features/lote-13-opt-out-linguagem-natural/design.md`
**Depends on:** T1
**Reuses:** `get_sdk_reference`, `get_node_types` (já consultado no Design), credencial OpenAI existente
**Requirement:** OPTREG-01, OPTMED-01
**Tools:** n8n escrita — **autorização específica antes de criar o rascunho**

**Done when:**

- [x] Três execuções no rascunho: (a) frase explícita com template customizado; (b) a mesma frase com o template padrão; (c) falha forçada (modelo inexistente num segundo nó de modelo, ou entrada vazia, o que provocar erro). Ids conferidos por `get_execution`.
- [x] O índice de saída do item de erro e a presença ou ausência de auto-fix em (a) e (b) estão escritos na seção Evidence desta tarefa **antes** de arquivar o rascunho (L-016).
- [x] O `design.md` (Tech Decisions e Risks & Concerns) registra a escolha final do template e a confirmação (ou correção) do roteamento de erro. Se o erro não sair por uma saída própria nem pela saída 0 (`fora`), a execução para e o desvio vai ao usuário.
- [x] Rascunho arquivado com `archive_workflow` depois do registro.
- [x] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(specs): confirm text classifier routing for lote 13`

**Status:** ✅ Concluída (2026-09-27)

**Evidence** (registrada antes de arquivar o rascunho, L-016):

- Rascunho `crivo-rascunho-t2-classificador`, id `hsYF9VXAbGKLCkIc`, projeto pessoal, criado por `create_workflow_from_code` com autorização do usuário. Webhook → Switch por `body.caso` → três `textClassifier` v1.1 (categorias `fora`, `ambigua`, `explicita`; `multiClass: false`; `fallback: other`; `enableAutoFixing: true`; `onError: continueErrorOutput`) com `lmChatOpenAi` v1.3 `gpt-5.4-nano-2026-03-17`, `reasoningEffort: low`, `timeout: 20000`. Entrada sintética: `Última mensagem enviada ao lead: <abertura fixa>\nMensagem do lead: não me mande mais mensagens`. Executado em modo `manual`, sem CRM, WhatsApp ou memória.
- **(a) template customizado** — execução **2634**, conferida por `get_execution`. O classificador devolveu `main: [[],[],[item],[],[]]`: **5 saídas**, item na saída **2 (`explicita`)**. O prompt enviado ao modelo é o template customizado com `{categories}` substituído por `fora, ambigua, explicita`, **seguido das instruções de formato que o nó anexa sozinho** (JSON Schema com uma propriedade booleana por categoria mais `fallback`, e as linhas "Categories are mutually exclusive" / "If no categories apply, select the fallback option"). Resposta do modelo: `{"fora":false,"ambigua":false,"explicita":true,"fallback":false}` em bloco de código. **Uma única chamada ao modelo** (`Modelo a` runIndex 0 apenas): **sem auto-fix**. 739 tokens de entrada estimados, 24 de saída.
- **(b) template padrão** — execução **2635**, conferida por `get_execution`. Mesmo resultado: `main: [[],[],[item],[],[]]`, saída 2, uma chamada, **sem auto-fix**. 667 tokens de entrada, 24 de saída.
- **(c) falha forçada** (modelo `gpt-modelo-inexistente-lote13`) — execução **2636**, conferida por `get_execution`. O modelo falhou com `NodeApiError` ("The model ... does not exist"); o classificador terminou `success` com `main: [[],[],[],[],[item]]`: o item saiu pela **saída 4, a saída de erro própria**, com o JSON de entrada preservado e um campo `error`. Nenhum item saiu por uma categoria. Não é o desvio de parada do `EXECUTE-PROMPT.md`.
- **Mapa de saídas confirmado**: 0 `fora`, 1 `ambigua`, 2 `explicita`, 3 `other` (fallback), 4 erro.
- **Achado do SDK (corrige o design)**: `get_workflow_details` do rascunho mostra que `.onError(handler)` do `@n8n/workflow-sdk` liga o handler à **saída 1** do nó (supõe nó de duas saídas). No classificador, isso pôs o handler de erro em `ambigua` e deixou a saída 4 sem conexão, por isso a execução (c) parou no classificador. Toda ligação de erro do classificador precisa usar **`.output(4)`**, e os testes de aresta precisam afirmar a conexão no índice 4 do `toJSON()`. O `.onError()` continua correto em nós de duas saídas, como o HTTP da T11 (a confirmar pelo teste de aresta da própria T11).
- Os Code nodes marcadores do rascunho falharam com `Referenced node doesn't exist` por usarem `$node.name`; foi só no rascunho, depois do classificador, e não afeta nenhuma conclusão acima.
- **Template escolhido**: o customizado (com a regra de desempate). Ele mantém as instruções de formato e não disparou auto-fix. Custa ~72 tokens a mais por chamada.
- Rascunho arquivado com `archive_workflow` depois deste registro.
- Gate Build: `npm test` 117 arquivos / 1.878 testes, 0 falhas; `npm run lint` 0 erros; `npm run build` ok.

### Phase 2: Módulos puros e identidade

#### T3: Criar o módulo de entrada e textos do opt-out natural

**What:** Criar `n8n/src/opt-out-intent.mjs` com `OPT_OUT_CONFIRMATION`, `OPT_OUT_REGISTRATION_FAILED`, `lastAgentMessage({ loaded, seeded })` e `buildClassifierInput({ lastAgentMessage, userMessage })`, conforme o design.
**Where:** `n8n/src/opt-out-intent.mjs`
**Depends on:** T2
**Reuses:** convenção de `n8n/src/gate.mjs` e `session.mjs` (puro, sem import); fixture da T1
**Requirement:** OPTMSG-01, OPTREG-01, OPTAMB-01
**Tools:** Local Core

**Done when:**

- [x] `OPT_OUT_CONFIRMATION` é afirmado byte a byte igual a "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!" (OPTMSG-01 AC2, L-037).
- [x] Um teste afirma que a confirmação não contém "chamar novamente" nem "mudar de ideia".
- [x] `OPT_OUT_REGISTRATION_FAILED` é afirmado igual ao texto do design e contém a palavra `sair`; um teste afirma que ele não contém afirmação de que as mensagens pararam (OPTREG-01 AC10).
- [x] `lastAgentMessage` usa a fixture da T1 e cobre: sessão carregada com agente por último; lead por último depois de mensagem do agente; só semeadura; sessão vazia → `null` (edge case do "sim" pós-12h).
- [x] `buildClassifierInput` cobre: com e sem última mensagem (`(nenhuma)`), e várias mensagens do buffer unidas por quebra de linha.
- [x] Gate Quick passa; contagem registrada.

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(n8n): add natural language opt-out intent module`
**Status:** ✅ Concluída (2026-09-27)
**Gate:** Quick — `npx vitest run n8n/src/__tests__/opt-out-intent.test.ts`: 1 arquivo / 23 testes, 0 falhas (arquivo novo; nenhum teste existente tocado).

#### T4: Criar a pontuação da medição

**What:** Criar `n8n/src/opt-out-score.mjs` com `scoreMeasurement(results, { minExplicitRate = 0.9 })`.
**Where:** `n8n/src/opt-out-score.mjs`
**Depends on:** T3
**Reuses:** convenção dos módulos puros
**Requirement:** OPTMED-01
**Tools:** Local Core

**Done when:**

- [x] Contagens por frase e por faixa conferidas contra um conjunto de resultados sintéticos escrito à mão (OPTMED-01 AC5).
- [x] APROVADO com 0 falso positivo e taxa exatamente 0,9 (fronteira, L-023); REPROVADO com taxa logo abaixo de 0,9; REPROVADO com 1 falso positivo vindo de frase **ambígua**; REPROVADO com 1 falso positivo vindo de frase **fora** — cada condição com asserção própria (OPTMED-01 AC6, L-012).
- [x] `other` e `erro` contam como `fora` (nunca como explícita).
- [x] O default de `minExplicitRate` é afirmado como 0,9 (L-037).
- [x] Gate Quick passa; contagem registrada.

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(n8n): add opt-out measurement scoring`
**Status:** ✅ Concluída (2026-09-27)
**Gate:** Quick — `npx vitest run n8n/src/__tests__/opt-out-score.test.ts`: 1 arquivo / 13 testes, 0 falhas (arquivo novo; nenhum teste existente tocado).

#### T5: Instrução de pergunta para a faixa ambígua no system message

**What:** Adicionar `OPT_OUT_AMBIGUOUS_INSTRUCTION` e o parâmetro `optOutAmbiguo = false` em `buildSystemMessage`, incluindo a instrução só quando `true` e mantendo `OPT_OUT_GUIDANCE_INSTRUCTION`.
**Where:** `n8n/src/system-message.mjs`
**Depends on:** T4
**Reuses:** padrão das instruções condicionais existentes (`firstTurn`, `meetingAt`)
**Requirement:** OPTAMB-01, OPTDOC-01
**Tools:** Local Core

**Done when:**

- [x] Com `optOutAmbiguo: true`, o system message contém a instrução nova; com `false` e com o parâmetro ausente, não contém (dois testes separados; L-005).
- [x] Com o parâmetro ausente, o system message é byte a byte igual ao de antes desta tarefa, para um conjunto fixo de entradas (protege `benchmark-contexto.ts`).
- [x] `OPT_OUT_GUIDANCE_INSTRUCTION` continua presente nos dois casos (OPTDOC-01 AC2).
- [x] Cada subcláusula da instrução (uma frase, perguntar se quer parar por este número, não insistir, não prometer parar) tem asserção própria (L-012).
- [x] Gate Quick passa; os testes existentes de `system-message.test.ts` continuam passando sem alteração.

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(n8n): ask ambiguous opt-out leads before registering`
**Status:** ✅ Concluída (2026-09-27)
**Gate:** Quick — `npx vitest run n8n/src/__tests__/system-message-opt-out-ambiguo.test.ts n8n/src/__tests__/system-message.test.ts`: 2 arquivos / 199 testes (177 existentes, sem alteração, + 22 novos), 0 falhas. Baseline byte a byte em `n8n/fixtures/system-message-baseline.json`, gerado da revisão 0a5cb47 antes da edição.

#### T6: Ancorar a extração do modelo do benchmark no nó do agente

**What:** Fazer `extractModelId` localizar o nó `name: "OpenAI Chat Model"` em vez do primeiro `lmChatOpenAi` do arquivo.
**Where:** `src/server/documents/benchmark-identity.ts`
**Depends on:** T5
**Reuses:** testes existentes de `benchmark-identity`
**Requirement:** OPTDOC-01
**Tools:** Local Core

**Done when:**

- [x] Com uma fonte que tem um `lmChatOpenAi` de outro modelo **antes** do nó do agente, `extractModelId` devolve o modelo do agente (teste de regressão que falha na implementação antiga).
- [x] Sem o nó `OpenAI Chat Model`, a função lança erro.
- [x] A identidade derivada do `principal.ts` atual não muda (mesmo `modelId`).
- [x] Gate Quick passa com os testes existentes intactos.

**Tests:** unit
**Gate:** Quick
**Commit:** `fix(documents): anchor benchmark model id on the agent node`
**Status:** ✅ Concluída (2026-09-27)
**Gate:** Quick — `npx vitest run src/server/documents/__tests__/benchmark-identity.test.ts`: 1 arquivo / 10 testes (7 existentes, sem alteração, + 3 novos), 0 falhas. Os 2 testes de regressão falharam na implementação antiga antes da correção.

#### T7: Criar a identidade do classificador e o script de medição

**What:** Criar `scripts/opt-out-measurement.ts` com `classifierIdentity(workflowJson, intentSource)` e os subcomandos `identity` (imprime o hash do `principal.ts` atual) e `stamp <relatorio.json>` (grava `classifierHash`, `modelId` e a data no relatório devolvido pelo workflow).
**Where:** `scripts/opt-out-measurement.ts`
**Depends on:** T6
**Reuses:** padrão de `scripts/document-context-benchmark.ts` e `benchmark-identity.ts` (sha256, normalização de CRLF)
**Requirement:** OPTMED-01
**Tools:** Local Core

**Done when:**

- [x] O hash é o mesmo para fonte com CRLF e com LF.
- [x] O hash muda quando muda, cada um com asserção própria: uma categoria, uma descrição, o `systemPromptTemplate`, o modelo, as `options` do nó de modelo e o fonte de `opt-out-intent.mjs` (OPTMED-01 AC8).
- [x] O hash não muda com a posição do nó no canvas.
- [x] Sem nó `Classificador: opt-out` no JSON, a função lança erro.
- [x] Gate Quick passa.

**Tests:** unit
**Gate:** Quick
**Commit:** `feat(scripts): add opt-out classifier identity and measurement stamp`
**Status:** ✅ Concluída (2026-09-27)
**Gate:** Quick — `npx vitest run scripts/__tests__/opt-out-measurement.test.ts`: 1 arquivo / 21 testes, 0 falhas. `identity` sobre o `principal.ts` atual recusa com "Nó \"Classificador: opt-out\" não encontrado" (o nó entra na T10). Inclui a correção da anotação de tipo `Case` em `system-message-opt-out-ambiguo.test.ts` (T5), sem mudar asserção, para não somar erros de `tsc`.

### Phase 3: Workflows como código

#### T8: Criar o corpus da medição

**What:** Criar `n8n/fixtures/opt-out-corpus.json` com a abertura fixa e os itens `{ id, faixa, texto, ultimaMensagem? }`, com teste estrutural.
**Where:** `n8n/fixtures/opt-out-corpus.json`
**Depends on:** T7
**Reuses:** frases reais de `lote-7/context.md:79` e `n8n/smoke/evidencia.md:1494`; faixas de `context.md`
**Requirement:** OPTMED-01
**Tools:** Local Core

**Done when:**

- [x] ≥ 20 explícitas, ≥ 15 ambíguas e ≥ 20 fora, afirmadas por teste (OPTMED-01 AC1).
- [x] As três frases reais estão na faixa explícita e "pode parar de mandar foto" está na faixa fora, cada uma com asserção própria (AC2, AC3).
- [x] Pares de confirmação presentes: pergunta de confirmação + "sim" (explícita) e + "não" (fora).
- [x] Near-misses com "parar"/"sair" sobre outra coisa: pelo menos 8 na faixa fora.
- [x] Ids únicos; nenhum texto contém telefone, e-mail ou nome real.
- [x] Gate Quick passa.

**Tests:** unit
**Gate:** Quick
**Commit:** `test(n8n): add natural language opt-out measurement corpus`
**Status:** ✅ Concluída (2026-09-27)
**Gate:** Quick — `npx vitest run n8n/src/__tests__/opt-out-corpus.test.ts`: 1 arquivo / 16 testes, 0 falhas (arquivo novo). Corpus: 24 explícitas, 17 ambíguas, 21 fora (11 near-misses), abertura fixa em `abertura`.

#### T9: Criar o workflow de medição

**What:** Criar `n8n/workflows/medicao-opt-out.ts` (`crivo-medicao-opt-out`): webhook → expandir corpus × 3 com `buildClassifierInput` → classificador + modelo com os parâmetros finais da T2 → marcar categoria por saída (incluindo `other` e erro) → Merge → `scoreMeasurement` → resposta; gerar `n8n/generated/medicao-opt-out.ts`.
**Where:** `n8n/workflows/medicao-opt-out.ts`
**Depends on:** T8
**Reuses:** `n8n/workflows/benchmark-contexto.ts` (webhook, estrutura, cabeçalho de propósito), inliner
**Requirement:** OPTMED-01
**Tools:** Local Core + n8n leitura (`validate_workflow`, `get_node_types`)

**Done when:**

- [x] Teste estrutural: nenhum nó HTTP para o CRM, nenhum nó WhatsApp, nenhuma memória Postgres (OPTMED-01 AC4).
- [x] Teste estrutural: cada saída do classificador (as três categorias, `other` e erro) chega ao Merge — um teste por aresta (L-026).
- [x] Teste estrutural: o modelo do nó é `gpt-5.4-nano-2026-03-17`, com `reasoningEffort: "low"`.
- [x] `validate_workflow` do MCP sem erro sobre `n8n/generated/medicao-opt-out.ts`.
- [x] `node scripts/n8n-inline.mjs` roda e o arquivo gerado entra no mesmo commit.
- [x] Gate Full passa.

**Tests:** unit
**Gate:** Full
**Commit:** `feat(n8n): add opt-out classifier measurement workflow`
**Status:** ✅ Concluída (2026-09-28)
**Gate:** Full — `node scripts/n8n-inline.mjs` + `npm test`: 1ª rodada 123 arquivos / 2.010 testes, 1 falha (timeout conhecido de `cron-expire-documents`, verde isolado: 9/9); 2ª rodada 123 / 2.010, 0 falhas. `medicao-opt-out.test.ts`: 34 testes. `validate_workflow` do gerado: válido, 11 nós. Entrada do webhook: `{ corpus: <opt-out-corpus.json>, repeticoes?: 3 }`; resposta: relatório de `scoreMeasurement` + `repeticoes`, `execucoes`, `categorias`. `n8n/generated/principal.ts` e `benchmark-contexto.ts` regenerados (defasados desde a T5).

#### T10: Inserir o classificador na rota conversa do agente

**What:** Em `principal.ts`, adicionar `Code: entrada do classificador`, `Classificador: opt-out`, `OpenAI Chat Model (classificador)`, `Code: rota fora` e `Code: rota ambígua`, religar `Code: memória pronta` → entrada → classificador, levar `fora`/`other`/erro e `ambigua` até `Code: montar system message…` e passar `optOutAmbiguo` a `buildSystemMessage`. A saída `explicita` fica para a T11.
**Where:** `n8n/workflows/principal.ts`
**Depends on:** T9
**Reuses:** parâmetros do classificador da T9 (byte a byte), módulo da T3, T5
**Requirement:** OPTREG-01, OPTAMB-01, OPTSEG-01, OPTMED-01
**Tools:** Local Core + n8n leitura

**Done when:**

- [x] Teste de paridade: `classifierIdentity(principal)` é igual a `classifierIdentity(medicaoOptOut)` (arquivo `n8n/workflows/__tests__/principal-classificador.test.ts`).
- [x] Testes de aresta: `memória pronta → entrada → classificador`; `fora`, `other` e erro → `Code: rota fora`; `ambigua` → `Code: rota ambígua`; as duas rotas → `Code: montar system message…` — um teste por aresta (L-026).
- [x] Teste: `Code: montar system message…` passa `optOutAmbiguo: $json.optOutAmbiguo === true`, e `Code: rota ambígua` emite `true` e `Code: rota fora` emite `false`.
- [x] Teste: a entrada do classificador não contém `$fromAI`, e o lead/tenant de nenhum nó novo vem do modelo (OPTREG-01 AC2).
- [x] `principal-modelo.test.ts` atualizado com as contagens de nós e conexões **medidas** por `principal.toJSON()`, com a conta no comentário; o nó `OpenAI Chat Model` do agente continua com o mesmo modelo e parâmetros; o nó do classificador tem o mesmo modelo.
- [x] `node scripts/n8n-inline.mjs` roda e `validate_workflow` sem erro sobre o gerado.
- [x] Gate Full passa.

**Tests:** unit
**Gate:** Full
**Commit:** `feat(n8n): route conversation turns through the opt-out classifier`
**Status:** ✅ Concluída (2026-09-28)
**Gate:** Full — `node scripts/n8n-inline.mjs` + `npm test` em 3 rodadas: 124 arquivos / 2.032 testes, 2 falhas em cada, sempre só `DOCLIM-01 AC8` de `actions.test.ts` (timeout de 30 s na suíte paralela; o arquivo passa isolado, 81/81, ~15 s por teste; a T10 não toca `src/`). `principal-classificador.test.ts`: 22 testes. Contagens medidas 62/76 → 67/84. `validate_workflow` do gerado: válido, 67 nós (só os avisos `SUBNODE_NOT_CONNECTED` conhecidos dos `memoryManager`). Identidade do classificador: `07f33701ce001b073d584bdf636f910be91fc3e8119dda324542d3e2c2be5953`.

#### T11: Ligar a faixa explícita ao ramo de opt-out existente

**What:** Em `principal.ts`, adicionar `HTTP: POST /leads/{id}/opt-out (linguagem natural)` (retry 3×, `onError: continueErrorOutput`) na saída `explicita`, com sucesso → `Code: finalizar opt-out` e erro → `Code: orientar sair (falha do registro)` → `fixedReplyWired`; trocar o texto de `Code: finalizar opt-out` por `OPT_OUT_CONFIRMATION` via inline.
**Where:** `n8n/workflows/principal.ts`
**Depends on:** T10
**Reuses:** nó `HTTP: POST /leads/{id}/opt-out` (parâmetros), ramo `optOutBranch`, `fixedReplyWired`, módulo da T3
**Requirement:** OPTREG-01, OPTKEY-01, OPTMSG-01
**Tools:** Local Core + n8n leitura

**Done when:**

- [x] Testes de aresta, um por aresta (L-026): `explicita` → HTTP natural; sucesso do HTTP natural → `Code: finalizar opt-out`; erro → `Code: orientar sair` → `Code: destinatário do envio fixo`.
- [x] Teste: a URL e o `X-Crivo-Tenant` do HTTP natural vêm de `$('Code: gate')`, iguais aos do nó da palavra-chave (OPTREG-01 AC1, AC2).
- [x] Teste: `Code: finalizar opt-out` tem exatamente dois predecessores (os dois HTTP de opt-out) e só ele produz a confirmação; o texto antigo não aparece em nenhum nó (OPTMSG-01 AC1).
- [x] Teste: as arestas do caminho da palavra-chave (`Switch: rota (gate)` saída 0 → HTTP da palavra-chave → finalizar → purgas → envio fixo) continuam idênticas, e o nó HTTP da palavra-chave não ganhou `onError` (OPTKEY-01 AC1, AC4).
- [x] `git diff` não toca `n8n/src/gate.mjs` nem `n8n/src/__tests__/gate.test.ts` (OPTKEY-01 AC2).
- [x] Contagens de `principal-modelo.test.ts` atualizadas pela medida; `node scripts/n8n-inline.mjs` roda; `validate_workflow` sem erro.
- [x] Gate Full passa.

**Tests:** unit
**Gate:** Full
**Commit:** `feat(n8n): register explicit natural language opt-out requests`
**Status:** ✅ Concluída (2026-09-28)
**Gate:** Full — `node scripts/n8n-inline.mjs` + `npm test`: 125 arquivos / 2.051 testes, 0 falhas. `principal-opt-out-natural.test.ts`: 19 testes. Contagens medidas 67/84 → 69/88. `validate_workflow` do gerado: válido, 69 nós (só os avisos `SUBNODE_NOT_CONNECTED` conhecidos). `gate.mjs` e `gate.test.ts` sem diff. Identidade do classificador inalterada.

### Phase 4: Medição conectada (portão de publicação)

#### T12: Publicar e rodar a medição de falso positivo

**What:** Publicar `crivo-medicao-opt-out` a partir de `n8n/generated/medicao-opt-out.ts`, executá-lo com o corpus da T8, gravar o relatório com `scripts/opt-out-measurement.ts stamp` e decidir pela barra.
**Where:** `.specs/features/lote-13-opt-out-linguagem-natural/medicao-opt-out-<AAAA-MM-DD>.json`
**Depends on:** T11
**Reuses:** fluxo de publicação do `n8n/README.md`; T4, T7, T9
**Requirement:** OPTMED-01
**Tools:** n8n escrita — **autorização específica antes de publicar e antes de executar**

**Done when:**

- [x] `get_workflow_details` confirma que o publicado é igual ao gerado; `versionId == activeVersionId` (L-032); id do workflow registrado.
- [x] Execução conferida por `get_execution`, com id na Evidence; 3 execuções por item do corpus.
- [x] Relatório gravado com contagens por frase e por faixa, `falsosPositivos`, `taxaExplicita`, `veredito`, `classifierHash` (igual ao `identity` do `principal.ts` atual), `modelId`, `workflowVersion` e a contagem de execuções com auto-fix.
- [x] **Se `REPROVADO`**: nenhuma tarefa seguinte roda; o relatório é commitado assim mesmo e a execução para com o resultado para o usuário (OPTMED-01 AC7, AD-032).
- [x] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `test(n8n): record opt-out classifier measurement`

**Status:** ✅ Concluída (2026-09-29) — veredito **REPROVADO**. Parada obrigatória (AD-032, OPTMED-01 AC7): nada da Phase 5 roda; o lote volta ao usuário. T13 também não roda (depende de uma medição aprovada).

**Evidence:**

- Workflow `crivo-medicao-opt-out`, id **`yTgE1WKY8BPOCuDl`** (projeto pessoal), criado por `create_workflow_from_code` a partir de `n8n/generated/medicao-opt-out.ts` e publicado com autorização do usuário. `get_workflow_details`: `versionId == activeVersionId == 3630cd81-921b-4ba9-abb4-912f1c5bed3e` (L-032); 11 nós; conexões iguais às do gerado (5 saídas do classificador → 5 marcadores → Merge entradas 0–4 → `Code: pontuar`). Paridade conferida por hash: `classifierIdentity` sobre os nós publicados do classificador e do modelo = `07f33701ce001b073d584bdf636f910be91fc3e8119dda324542d3e2c2be5953`, igual ao `identity` do `principal.ts`.
- Execução **2685** (modo webhook, produção), conferida por `get_execution`: `status: success`, 2026-09-29T05:11:31Z → 05:12:31Z (60 s). Entrada: `n8n/fixtures/opt-out-corpus.json` (62 frases) com `repeticoes: 3` → **186 classificações**. O modelo do classificador rodou **186 vezes** (subRuns 0–185): **nenhum auto-fix**. Categorias brutas: `explicita` 79, `ambigua` 58, `fora` 48, `other` 1, `erro` 0. O Merge de 5 entradas disparou mesmo com a saída de erro vazia.
- Relatório: `.specs/features/lote-13-opt-out-linguagem-natural/medicao-opt-out-2026-09-29.json`, carimbado por `scripts/opt-out-measurement.ts stamp` (`classifierHash` acima, `modelId` `gpt-5.4-nano-2026-03-17`), com `workflowVersion`, `execucaoN8n` e `execucoesComAutoFix: 0`.
- **Resultado pela barra (OPTMED-01 AC6)**: `taxaExplicita` = 72/72 = **1,0** (passa); `falsosPositivos` = **7** (reprova). Os 7 vêm de três near-misses de "parar de mandar <coisa>", todos da faixa `fora`:
  - `fora-04` "pode parar de mandar áudio, prefiro texto": explícita 3/3;
  - `fora-01` "pode parar de mandar foto" (a frase que o backlog nomeou): explícita 2/3, ambígua 1/3;
  - `fora-08` "para de mandar casa, eu quero apartamento": explícita 2/3, `other` 1/3.
  Nenhuma frase ambígua virou explícita (51/51 ambíguas).
- Observação sem barra própria: `fora-19` ("não") e `fora-20` ("não, pode continuar me mandando") como resposta à pergunta de confirmação saíram `ambigua` 3/3, e não `fora`. Não descadastram, mas fariam o agente perguntar de novo.
- Gate Build: `npm test` 125 arquivos / 2.051 testes, só as 2 falhas preexistentes aceitas (`DOCLIM-01 AC8`, `actions.test.ts`); `npm run lint` 0 erros; `npm run build` ok.

#### T12a: Versão 2 do classificador depois da medição reprovada

**What:** Decisão D1 (tomada sob a delegação do usuário de 2026-09-29): em vez de parar o lote, ajustar as descrições de `fora` e `explicita` e o template para o padrão que falhou ("parar de mandar <tipo de conteúdo>" é `fora`; resposta negativa à pergunta de confirmação é `fora`), com os mesmos parâmetros nos dois workflows, e acrescentar ao corpus frases de controle que não participaram da redação.
**Where:** `n8n/workflows/principal.ts`, `n8n/workflows/medicao-opt-out.ts`, `n8n/generated/`, `n8n/fixtures/opt-out-corpus.json`, `n8n/workflows/__tests__/medicao-opt-out.test.ts`, `design.md`
**Depends on:** T12
**Requirement:** OPTMED-01

**Done when:**

- [x] Textos v2 idênticos em `principal.ts` e `medicao-opt-out.ts`; teste de paridade verde.
- [x] O teste que fixa o texto congelado (`medicao-opt-out.test.ts`) passa a fixar a v2 (mudança de spec decidida, não enfraquecimento: a asserção continua de igualdade exata).
- [x] Corpus com 10 frases novas de controle (exp-25 a exp-27, fora-22 a fora-28), outros objetos (vídeo, plantas, mensagem de voz, simulação); 72 frases no total.
- [x] `node scripts/n8n-inline.mjs`; gate Quick dos diretórios afetados.

**Commit:** `fix(n8n): keep content near-misses out of the opt-out classifier`

**Status:** ✅ Concluída (2026-09-29)

**Evidence:** `npx vitest run n8n/workflows/__tests__ n8n/src/__tests__ scripts/__tests__`: 24 arquivos / 576 testes, 0 falhas. Novo hash do classificador (`identity`): `c1faee65a297714e7f2b8e9640081c8c2924a03ea4389067a46c9591442fc4c1`.

#### T12b: Nova medição da versão 2

**What:** Atualizar e publicar `crivo-medicao-opt-out` com o gerado da v2, rodar o corpus de 72 frases × 3 e aplicar a barra.
**Depends on:** T12a
**Requirement:** OPTMED-01
**Commit:** `test(n8n): record opt-out classifier measurement v2`

**Status:** ✅ Concluída (2026-09-29) — veredito **REPROVADO** (v2).

**Evidence:** `update_workflow` + `publish_workflow` no `yTgE1WKY8BPOCuDl`; `versionId == activeVersionId == 0b0d58fd-9227-4168-9d88-82610f54cb2d`; hash dos nós publicados `c1faee65…` igual ao `identity`. Execução **2686** (conferida por `get_execution`, `success`, 100 s): 72 frases × 3 = 216 classificações, 216 chamadas ao modelo (sem auto-fix), `erro` 0, `other` 4. Explícitas 81/81; ambíguas sem falso positivo; **5 falsos positivos**: `fora-20` "não, pode continuar me mandando" (resposta à pergunta de confirmação) 3/3, regressão causada pela cláusula nova de resposta negativa; `fora-25` "para de mandar imóvel na zona norte" (controle) 2/3. Os três casos da v1 (foto, áudio, casa) saíram `fora` 3/3, e 6 das 7 frases de controle `fora` também. Relatório: `medicao-opt-out-2026-09-29-v2.json`. Decisão D2: iteração v3 (2ª de no máximo 3).

#### T12c: Versão 3 do classificador e nova medição

**What:** Decisão D2: segunda iteração (de no máximo 3). Regra de sim/não explícita no template, "filtro de busca" entre os conteúdos que não contam como opt-out, e 5 frases de controle novas (exp-28, fora-29 a fora-32), 77 no total.
**Depends on:** T12b
**Requirement:** OPTMED-01
**Commits:** `fix(n8n): make opt-out confirmation answers explicit in the classifier` e `test(n8n): record opt-out classifier measurement v3`

**Evidence (código):** `npx vitest run n8n/workflows/__tests__ n8n/src/__tests__ scripts/__tests__`: 24 arquivos / 576 testes, 0 falhas. Hash v3 (`identity`): `8be0d889c925d9fc6a301525bd8c0c1f1655692e8f221d81df572c8feb8ec822`.

**Status:** ✅ Concluída (2026-09-29) — veredito **REPROVADO** (v3).

**Evidence (medição):** `update_workflow` + `publish_workflow`; `versionId == activeVersionId == 4d11bbc3-1c37-4fcd-8be1-ea7b6fba581c`; parâmetros publicados iguais ao gerado. Execução **2687** (conferida por `get_execution`, `success`, 118 s): 77 × 3 = 231 classificações, 231 chamadas (sem auto-fix), `erro` 0, `other` 2. Explícitas 84/84; ambíguas sem falso positivo; **2 falsos positivos**, cada um 1 de 3: `fora-08` "para de mandar casa, eu quero apartamento" e `fora-25` "para de mandar imóvel na zona norte". As negativas à pergunta de confirmação (`fora-19`, `fora-20`, `fora-31`, `fora-32`) saíram `fora` 3/3. Relatório: `medicao-opt-out-2026-09-29-v3.json`. Decisão D3: trava determinística depois do classificador (T12d), em vez de uma quarta versão de prompt.

#### T12d: Trava determinística depois do classificador

**What:** Decisão D3: em vez de uma quarta versão do prompt, acrescentar depois do classificador uma trava determinística, igual no agente e na medição. `refineOptOutCategory` rebaixa `explicita` para `ambigua` quando a mensagem é "parar/para/pare/parem de [me/nos] mandar|enviar <objeto>" sem menção ao contato em si. Prompt e categorias da v3 não mudam.
**Where:** `n8n/src/opt-out-intent.mjs`, `n8n/src/__tests__/opt-out-intent.test.ts`, `n8n/workflows/principal.ts`, `n8n/workflows/medicao-opt-out.ts`, `n8n/generated/`, `n8n/workflows/__tests__/` (`principal-opt-out-natural`, `medicao-opt-out`, `principal-classificador`, `principal-modelo`), `design.md`
**Depends on:** T12c
**Requirement:** OPTREG-01, OPTMED-01

**Done when:**

- [x] `isContentOnlyStop` e `refineOptOutCategory` em `opt-out-intent.mjs`, puros; todas as `explicita` do corpus continuam `explicita`; as 11 frases `fora` de "parar de mandar <coisa>" viram `ambigua`; mista continua `explicita`; demais categorias inalteradas; string[], vazio e ausente cobertos (L-005).
- [x] Agente: saída 2 do classificador → `Code: conferir pedido explícito` → `Pedido explícito confirmado?`; verdadeiro → HTTP natural, falso → `Code: rota ambígua`. Lead e tenant seguem só de `$('Code: gate')`.
- [x] Medição: `Code: expandir corpus` leva `userMessage`; saída 2 → trava equivalente → verdadeiro `Code: marcar explicita`, falso `Code: marcar ambigua`.
- [x] Um teste por aresta nos dois workflows (L-026); arestas antigas `explicita → HTTP natural` (T11) e `explicita → marcar explicita` (T9) atualizadas para a nova cadeia, com igualdade exata; teste de paridade da trava; contagens de `principal-modelo.test.ts` 69/88 → 71/91.
- [x] `node scripts/n8n-inline.mjs`; `validate_workflow` do MCP sem erro na medição; principal validado pelo validador local do SDK (ver Evidence).

**Commit:** `feat(n8n): downgrade content-only stop requests before opt-out registration`

**Status:** ✅ Concluída (2026-09-29). Pendente fora deste worker: republicar `crivo-medicao-opt-out` e medir (a trava muda o hash).

**Evidence:** `npx vitest run n8n/workflows/__tests__ n8n/src/__tests__ scripts/__tests__`: 24 arquivos / 626 testes, 0 falhas (576 → 626). Por arquivo: `opt-out-intent.test.ts` 57, `principal-opt-out-natural.test.ts` 28, `medicao-opt-out.test.ts` 40, `principal-classificador.test.ts` 23, `principal-modelo.test.ts` 12. Contagens do agente 69/88 → 71/91; medição 11/14 → 13/17 nós/conexões. `validate_workflow` do MCP: medição válida, 13 nós. O principal gerado (190 KB, ~70 mil tokens) não foi enviado ao MCP: o arquivo inteiro não cabe num único argumento de chamada deste worker. No lugar, o mesmo parser e validador do SDK (`parseWorkflowCodeToBuilder` + `validateWorkflow` de `@n8n/workflow-sdk`) rodou localmente sobre os dois gerados: principal válido, 71 nós, 0 erros, 0 avisos; medição válida, 13 nós (mesmo resultado do MCP). Novo hash (`identity`): `1547f0ae6ee31640db62b432a36e1e5d6c77fd92467a18f9f42034ba088f6b29`. Desvio da regra literal: "mensagem de voz" (`fora-27`) é removida antes de procurar menção ao contato, senão `mensag` manteria a frase `explicita`. `npm run lint` sem erro. `gate.mjs` e `gate.test.ts` sem diff.

**Ajuste do orquestrador (depois do Worker C):** na medição, a saída falsa da trava ganhou marcador próprio (`Code: marcar ambigua (trava)`) e a entrada 5 do Merge (6 entradas), para `Code: marcar ambigua` não ter dois predecessores e o Merge não disparar duas vezes com relatório parcial. Testes de aresta novos em `medicao-opt-out.test.ts`; gate pontual 24 arquivos / 629 testes, 0 falhas. Commit `fix(n8n): give the measurement guard its own merge input`.

#### T12e: Medição da versão 3 com a trava (aprovada)

**Status:** ✅ Concluída (2026-09-29) — veredito **APROVADO**.
**Commit:** `test(n8n): record approved opt-out classifier measurement`

**Evidence:** o workflow de medição anterior (`yTgE1WKY8BPOCuDl`) foi arquivado depois de os relatórios v1–v3 estarem gravados (L-016); o novo `crivo-medicao-opt-out` (`n5iAMCl5nSM6jA6U`) foi criado de `n8n/generated/medicao-opt-out.ts` e publicado; `versionId == activeVersionId == 2b494521-0815-44b7-bd77-5d4e19da667c`, 14 nós, conexões com a trava (saída 2 → `Code: conferir pedido explícito` → IF → marcar explicita / marcar ambigua (trava) → Merge 6 entradas). Diferenças conhecidas em relação ao gerado: o `Code: pontuar` publicado não tem o bloco de comentário do módulo inlinado (a lógica é a mesma; a pontuação fica fora do hash). Execução **2688** (conferida por `get_execution`, `success`, 102 s): 77 × 3 = 231 classificações, `execucoes` 231 (Merge disparou uma vez), 231 chamadas ao modelo (sem auto-fix), `erro` 0, `other` 1. **Explícitas 84/84 (1,0); falsos positivos 0** (ambíguas 0/51, fora 0/96). A trava não precisou atuar nesta rodada (o marcador da trava não executou); a cobertura dela sobre o corpus vem de `opt-out-intent.test.ts`. Relatório: `medicao-opt-out-2026-09-29-v4.json`, `classifierHash` `1547f0ae…` igual ao `identity` do `principal.ts`.


#### T13: Travar a publicação na medição aprovada

**What:** Acrescentar a `principal-classificador.test.ts` a asserção de que a identidade do classificador em `principal.ts` é igual ao `classifierHash` do relatório aprovado mais recente em `.specs/features/lote-13-opt-out-linguagem-natural/`, e que o veredito dele é `APROVADO`.
**Where:** `n8n/workflows/__tests__/principal-classificador.test.ts`
**Depends on:** T12
**Reuses:** T7, T10
**Requirement:** OPTMED-01
**Tools:** Local Core

**Done when:**

- [x] O teste passa com o relatório da T12.
- [x] Prova de discriminação registrada: alterar uma palavra da descrição de uma categoria em `principal.ts` (numa cópia de trabalho descartada) faz o teste falhar (OPTMED-01 AC8).
- [x] Sem relatório aprovado no diretório, o teste falha com mensagem que diz para rodar a medição.
- [x] Gate Full passa.

**Tests:** unit
**Gate:** Full
**Commit:** `test(n8n): pin the published classifier to the approved measurement`

**Status:** ✅ Concluída (2026-09-29)

**Evidence:** `assertApprovedIdentity` e `latestApprovedMeasurement` em `scripts/opt-out-measurement.ts` procuram `medicao-opt-out-*.json` com `APROVADO` em `.specs/features/` **e** `.specs/archive/lote-13…` (decisão D4), para a trava sobreviver à higiene documental da AD-029. Testes: `scripts/__tests__/opt-out-measurement.test.ts` (sem relatório → erro "rode o crivo-medicao-opt-out"; só REPROVADO → mesmo erro; APROVADO com o mesmo hash → passa; hash diferente → "rode a medição de novo"; vale o APROVADO mais recente entre diretórios; diretório inexistente e arquivo estranho ignorados) e `n8n/workflows/__tests__/principal-classificador.test.ts` (a identidade do `principal.ts` é o `classifierHash` do relatório aprovado v4, `1547f0ae…`). Prova de discriminação num JSON em memória, descartado depois: trocar "imóvel específico" por "imóvel qualquer" na descrição de `fora` faz `assertApprovedIdentity` lançar "O classificador mudou desde a medição aprovada"; o original passa com `APROVADO`. Gate Full: `node scripts/n8n-inline.mjs`; `npm test` 125 arquivos / 2.111 testes, só as 2 falhas preexistentes aceitas (`DOCLIM-01 AC8`); lint 0 erros. Commit `cdef838` (o mesmo commit deixou por engano o `tasks.md` com um trecho duplicado e sem esta evidência, corrigido no ciclo de correção do Verifier).

### Phase 5: Documentação, publicação e prova

#### T14: Cenário de opt-out natural no roteiro

**What:** Acrescentar ao `n8n/smoke/roteiro.md` o cenário de opt-out em linguagem natural (três casos em sequência, com reset entre eles), atualizar o cenário 3 com o texto novo da confirmação e remover a nota "Opt-out por linguagem natural é L13, fora deste lote".
**Where:** `n8n/smoke/roteiro.md`
**Depends on:** T13
**Reuses:** estrutura dos cenários existentes (AD-027), checklist de limpeza, `npm run smoke:reset` + `crivo-smoke-reset`
**Requirement:** OPTPROVA-01, OPTDOC-01
**Tools:** Local Core

**Done when:**

- [x] Casos descritos como intenção de turno, com o estado final exigido no CRM: explícito → `optedOutAt` preenchido; ambíguo → pergunta, "sim" → preenchido; fora de escopo → nulo e resposta normal (OPTPROVA-01 AC1, AC2).
- [x] Cada caso que registra exige confirmar a sessão de memória vazia antes da limpeza manual (AC3).
- [x] O cenário 3 exige o texto de OPTMSG-01 e é marcado como regressão obrigatória deste lote (AC4).
- [x] Grep por `Opt-out por linguagem natural é L13` sem ocorrência.
- [x] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(n8n): add natural language opt-out smoke scenario`

**Status:** ✅ Concluída (2026-09-29)

**Evidence:** `n8n/smoke/roteiro.md` §6.1 "Cenário 5 — opt-out por linguagem natural" com os casos 5a (explícito), 5b (ambíguo + "sim") e 5c ("pode parar de mandar foto"), reset entre os casos, desfecho por estado final no CRM e memória vazia antes da limpeza manual; linha nova na barra de aprovação (§7); cenário 3 com o item 4 (texto de OPTMSG-01, regressão obrigatória). `grep "Opt-out por linguagem natural é L13"` sem ocorrência. Documento sem teste; gate Build rodado junto com a T15.

#### T15: Documentar os dois caminhos de opt-out no README do n8n

**What:** Atualizar `n8n/README.md` com os dois caminhos de opt-out, o workflow de medição e o gate de identidade, a conta de vazão do classificador contra a AD-031 e o lembrete de rerodar o benchmark depois de publicar.
**Where:** `n8n/README.md`
**Depends on:** T14
**Reuses:** §13 existente
**Requirement:** OPTDOC-01
**Tools:** Local Core

**Done when:**

- [x] Seção nova descreve palavra exata (gate, antes do modelo) e classificador (rota `conversa`), com a regra de quando remedir.
- [x] A conta de tokens por minuto do classificador aparece com a fonte dos números (relatório da T12).
- [x] Nenhuma afirmação de que opt-out natural está fora do escopo permanece (OPTDOC-01 AC3).
- [x] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(n8n): document natural language opt-out`

**Status:** ✅ Concluída (2026-09-29)

**Evidence:** `n8n/README.md` §14 (dois caminhos, trava, medição e trava de publicação, regra de quando remedir, histórico das medições, conta de vazão com a fonte dos números na T2, lembrete do §13). Nenhuma afirmação de opt-out natural fora do escopo (`grep` sem ocorrência no README e no roteiro).

#### T16: Publicar o agente com o classificador

**What:** Rodar `document-context-benchmark.ts check`, publicar `n8n/generated/principal.ts` no `crivo-agente-principal`, conferir paridade e ativação, e registrar a versão.
**Where:** `.specs/features/lote-13-opt-out-linguagem-natural/tasks.md`
**Depends on:** T15
**Reuses:** pipeline de publicação do `n8n/README.md`; `get_workflow_details`
**Requirement:** OPTREG-01, OPTAMB-01, OPTSEG-01, OPTKEY-01, OPTMSG-01
**Tools:** Conectado — **autorização específica antes de publicar**

**Done when:**

- [x] `principal-classificador.test.ts` verde imediatamente antes da publicação (a medição aprovada corresponde ao que vai ser publicado).
- [x] Saída do `check` antes da publicação registrada na Evidence.
- [x] `get_workflow_details` confirma nós e conexões iguais ao gerado; `versionId == activeVersionId` (L-032); novo `activeVersionId` registrado na Evidence.
- [x] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `chore(n8n): publish opt-out classifier to the agent`

**Status:** ✅ Concluída (2026-09-29)

**Evidence:**
- `principal-classificador.test.ts` verde imediatamente antes (gate da T13, trava de identidade `1547f0ae…` = medição aprovada v4).
- `check` antes da publicação (versão ativa anterior `73788130-1789-46a8-8a41-61c33860224c`): "9 teto(s) conferido(s); 9 marcado(s) como desatualizado(s)" — o system message local mudou (instrução ambígua), então os tetos ficaram `stale` e seguem limitando com o valor antigo (AD-031).
- Publicação por `update_workflow` em lotes (decisão D5): 9 nós novos (`Code: entrada do classificador`, `Classificador: opt-out`, `OpenAI Chat Model (classificador)` com a credencial `OpenAI account` `bGnmNn5iFH4sBCoo`, `Code: rota fora`, `Code: rota ambígua`, `Code: conferir pedido explícito`, `Pedido explícito confirmado?`, `HTTP: POST /leads/{id}/opt-out (linguagem natural)` com `Crivo - chave de servico` `YhGcdfGtdEBBU9YP`, retry 3×, `continueErrorOutput`, e `Code: orientar sair (falha do registro)`), `jsCode` novo em `Code: finalizar opt-out` e `Code: montar system message e marcar campo perguntado`, 1 conexão removida e 16 adicionadas; depois `publish_workflow`.
- `get_workflow_details` (saída salva em arquivo e comparada por script com `principal.toJSON()`): **`versionId == activeVersionId == 3e20756c-45d2-430d-8106-e4204abf6045`**, ativo; 71 nós; **91 conexões, 0 diferença**; 19 nós de código com `jsCode` idêntico byte a byte (inclusive o `montar system message`, 46 KB); parâmetros do classificador, do modelo, do HTTP natural (URL, autenticação, `X-Crivo-Tenant`, retry, `onError`) e do IF idênticos; o HTTP da palavra-chave segue sem `onError` e com a mesma URL.
- **Diferença conhecida (decisão D6)**: nos 4 nós que inlinam `opt-out-intent.mjs`, o regex de `normalizeUserMessage` ficou publicado com os caracteres literais U+0300 a U+036F em vez do escape de seis caracteres do fonte — o transporte do MCP converte qualquer sequência de escape unicode em caractere, com qualquer número de barras (testado três vezes em `Code: rota fora`, restaurado depois). O texto antes e depois do regex é idêntico ao gerado, e a classe de caracteres é a mesma (conferido em Node: mesma saída para texto acentuado). Dois nós que o lote não tocou (`Code: preparar clear de buffer (turno do agente)`, `Code: preparar turno para memória`) já estavam publicados sem a quebra de linha final antes deste lote.
- Avisos do `update_workflow` que restaram são os já conhecidos: `SUBNODE_NOT_CONNECTED` dos `memoryManager` (falso positivo do lote-6c) e `builtInTools` do `OpenAI Chat Model` do agente, preexistente.
- Gate Build: sem mudança de código nesta tarefa; os gates da T13 (2.111 testes) e da T15 (build ok) valem para o estado publicado.

#### T17: Rerodar o benchmark de teto depois da publicação

**What:** Rodar `check` contra a nova versão, rerodar as faixas necessárias do `crivo-benchmark-contexto` e gravar com `persist`, conforme o `n8n/README.md` §13.
**Where:** `.specs/features/lote-13-opt-out-linguagem-natural/benchmark-contexto-<AAAA-MM-DD>.json`
**Depends on:** T16
**Reuses:** `scripts/document-context-benchmark.ts`, `crivo-benchmark-contexto`
**Requirement:** OPTDOC-01
**Tools:** Conectado — **autorização específica antes de executar e antes do `persist`**

**Done when:**

- [x] `check` depois da publicação mostra o motivo do `stale` (system message e versão do workflow), registrado na Evidence.
- [x] Métricas gravadas no arquivo da tarefa, e `persist` executado; um novo `check` sai sem `stale` para os três tenants.
- [x] Os tetos novos e os anteriores (106.702 / 119.265 / 106.805 B) aparecem lado a lado na Evidence; variação maior que 5% vai ao usuário antes do `persist`.
- [x] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `chore(documents): refresh context ceiling after opt-out classifier`

**Status:** ✅ Concluída (2026-09-29)

**Evidence:**
- Motivo do `stale`: o `check` da T16 (antes da publicação) marcou os 9 tetos por mudança do system message (`system-message.mjs` com a instrução ambígua); depois da publicação a versão do workflow também mudou (`73788130` → `3e20756c`). O script só imprime contagens; o motivo gravado em cada linha é `mudou: <componentes>`.
- Decisão D7: 15 faixas repetidas no `crivo-benchmark-contexto` (`xpsD2PZQ1KoE2sA5`, versão publicada `09934c27`), execuções **2689 a 2703**, todas `success` (conferidas por `search_executions`/`get_execution`): 0 B, 64 KB ×1/×2 e 128 KB ×1/×2 para `ambos`, `novo` e `usado`. Todas as faixas com corpus aprovaram (3/3 fatos, `consultar_documentos` chamada); faixas 0 B sem fatos, como esperado. Latência de 4,0 s a 10,4 s. O workflow de benchmark não foi republicado: ele inlina o `system-message.mjs` anterior, e com `optOutAmbiguo` ausente o texto é byte a byte o mesmo (teste da T5).
- Métricas: `benchmark-contexto-2026-09-30.json` (sem corpus). Tetos calculados antes do `persist` (simulação) e depois gravados:

  | Modalidade | Anterior (2026-09-25) | Novo (2026-09-30) | Variação |
  | --- | --- | --- | --- |
  | novo | 106.702 B | 106.898 B | +0,18% |
  | usado | 119.265 B | 119.714 B | +0,38% |
  | ambos | 106.805 B | 106.720 B | −0,08% |

  Nenhuma variação passa de 5%, então o `persist` seguiu sem consulta. Todos limitados por qualidade.
- `persist` gravou para 3 tenants, com a identidade `{ modelId: gpt-5.4-nano-2026-03-17, workflowVersion: 3e20756c-45d2-430d-8106-e4204abf6045, systemMessageHash: b8fbc244…, toolsHash: d1e7aee9…, memoryWindow: 50 }`; a reconciliação reemitiu `document_corpus_over_ceiling` para o tenant de teste (corpus ~142 KB, 1 documento fora por modalidade), o mesmo estado de antes. **`check` seguinte: "9 teto(s) conferido(s); 0 marcado(s) como desatualizado(s)"**.
- Gate Build: sem mudança de código nesta tarefa; coberto pelo gate de fechamento.

#### T18: Provar o opt-out natural por conversa real

**What:** Executar o cenário novo do roteiro (três casos) e a regressão do cenário 3 no número de teste, e registrar a evidência em `n8n/smoke/evidencia.md`.
**Where:** `n8n/smoke/evidencia.md`
**Depends on:** T17
**Reuses:** `roteiro.md` (T14), checklist de limpeza, `npm run smoke:reset`, `crivo-smoke-reset`
**Requirement:** OPTPROVA-01, OPTREG-01, OPTAMB-01, OPTSEG-01, OPTKEY-01, OPTMSG-01
**Tools:** Conectado — **autorização específica; as mensagens são enviadas pelo usuário no WhatsApp**

**Done when:**

- [x] Caso explícito: `optedOutAt` preenchido, exatamente uma mensagem depois do pedido com o texto de OPTMSG-01, sessão de memória vazia antes da limpeza manual, e uma mensagem seguinte sem resposta (OPTREG-01 AC1, AC3–AC6). *(Execuções 2705, 2711, 2716.)*
- [ ] ~~Caso ambíguo: a pergunta chega, o "sim" registra~~ — provado nas execuções 2738/2744 e depois removido pela D11 (T20). Substituído por: desinteresse → conversa normal, sem pergunta e sem registro (OPTAMB-01 emendado).
- [ ] Caso fora de escopo ("pode parar de mandar foto"): `optedOutAt` nulo e resposta normal (OPTSEG-01).
- [ ] Regressão do cenário 3 (`sair`): confirmação com o texto novo (OPTKEY-01 AC4, OPTPROVA-01 AC4).
- [ ] Todo id de execução citado foi conferido por `get_execution` (OPTPROVA-01 AC5); evidência sem texto de lead real além das frases roteirizadas e sem telefone completo.
- [ ] Qualidade de fala registrada numa seção separada, que não reprova sozinha (AD-027).
- [ ] Gate Build passa.

**Tests:** none
**Gate:** Build
**Commit:** `docs(n8n): record natural language opt-out smoke evidence`

**Status:** 🔄 Em andamento (2026-09-30): caso 5a aprovado; 5b original aprovado e removido pela D11; faltam o 5b novo, o 5c e a regressão do cenário 3, contra o agente `3be9cfed`. Evidência em `n8n/smoke/evidencia.md` § Lote 13 — T18. Antes: ⏸️ Pendente de execução humana (decisão D8, 2026-09-29). A prova exige que uma pessoa mande mensagens reais no WhatsApp para o número de teste; nenhuma ferramenta desta execução consegue fazer isso sem enviar mensagens em nome do usuário, e o `crivo-agente-principal` só dispara pelo `whatsAppTrigger` (o `execute_workflow` não aceita esse gatilho e o webhook da Meta exige a assinatura do app). Tudo o que a prova depende já está publicado: agente `3e20756c-45d2-430d-8106-e4204abf6045` com classificador, trava e confirmação nova (T16), tetos de contexto atualizados (T17) e roteiro §6.1 + regressão do cenário 3 (T14). Para fechar: rodar os casos 5a, 5b e 5c e o cenário 3 conforme `n8n/smoke/roteiro.md`, registrar em `n8n/smoke/evidencia.md` com ids conferidos por `get_execution` e commitar com a mensagem desta tarefa.

---

### Correções do Verifier

#### T19: Ciclo de correção 1 (Verifier FAIL)

**What:** O Verifier (ciclo 1, `validation.md`) reprovou por OPTKEY-01 AC3 sem teste (mutante M8, ordem opt-out × `escalado_humano` invertida em `gate.mjs`, sobreviveu) e apontou imprecisões e documentação.
**Where:** `n8n/src/__tests__/gate-opt-out-escalado.test.ts` (novo), `n8n/workflows/__tests__/principal-modelo.test.ts` (só o título), `spec.md`, `tasks.md`
**Depends on:** T17
**Tests:** unit
**Gate:** Quick

**Done when:**

- [x] Teste novo afirma `gate(... status: "escalado_humano", text: "sair"|"parar"|"  SAIR  ") === "opt-out"`, frase não exata → `somente-registrar`, lead já descadastrado → `somente-registrar`; `gate.test.ts` intocado (AC2).
- [x] O teste mata o M8: com a ordem invertida numa cópia fora do repositório, 3 de 5 falham.
- [x] OPTSEG-01 AC2 emendado (decisão D9): resposta normal ou pergunta de confirmação quando a trava rebaixa; nunca registro.
- [x] `tasks.md` sem o trecho duplicado que o commit da T13 criou; evidência da T13 restaurada.
- [x] Título do teste de contagens corrigido para 71/91 (a asserção já era 71/91).
- [x] Rastreabilidade da spec atualizada.

**Commits:** `test(n8n): cover keyword opt-out while escalated to a human` e `docs(specs): amend out-of-scope reply and repair lote 13 tasks`

**Status:** ✅ Concluída (2026-09-30)

**Evidence:** `npx vitest run n8n/workflows/__tests__/principal-modelo.test.ts n8n/src/__tests__`: 16 arquivos / 448 testes, 0 falhas.

#### T20: Remover a pergunta de opt-out ambíguo (decisão D11)

**What:** Durante a T18, o usuário viu a pergunta "você quer parar de receber mensagens?" para o lead desinteressado e decidiu removê-la: soa como convite para deixar de ser lead. Só o pedido explícito descadastra.
**Where:** `n8n/src/system-message.mjs`, `n8n/workflows/principal.ts`, testes de `n8n/`, `n8n/fixtures/system-message-baseline.json`, docs
**Depends on:** T19
**Tests:** unit
**Gate:** Quick

**Done when:**

- [x] Saída 1 (`ambigua`) do classificador e o falso de `Pedido explícito confirmado?` vão para `Code: rota fora`; `Code: rota ambígua`, `OPT_OUT_AMBIGUOUS_INSTRUCTION` e o flag `optOutAmbiguo` removidos. O nó do classificador não mudou: identidade `1547f0ae…` igual à da medição v4 aprovada, sem remedição.
- [x] `OPT_OUT_GUIDANCE_INSTRUCTION` vale só para pedido explícito; desinteresse, recusa, número errado e "parar de mandar <conteúdo>" não disparam a orientação `sair`.
- [x] Baseline do system message regenerado; grafo 70 nós / 90 conexões.
- [x] Agente publicado e conferido; benchmark republicado; teto remedido e persistido; `check` sem `stale`.
- [x] Roteiro, README §14, spec (emenda D11 em OPTAMB-01 e OPTSEG-01 AC2), design e AD-032 atualizados.

**Commits:** `feat(n8n): drop the ambiguous opt-out confirmation question` e `docs(specs): record decision D11 and the refreshed context ceiling`

**Status:** ✅ Concluída (2026-09-30)

**Evidence:**
- `npx vitest run n8n/ scripts/__tests__/opt-out-measurement.test.ts src/server/documents/__tests__/benchmark-identity.test.ts`: 25 arquivos / 629 testes, 0 falhas; `opt-out-measurement.ts identity` = `1547f0ae6ee31640…`.
- `crivo-agente-principal`: 4 operações (jsCode de `Code: rota fora`, remoção de `Code: rota ambígua`, saída 1 do classificador e falso do IF → rota fora) e o jsCode de `Code: montar system message e marcar campo perguntado`. Rascunho comparado por script com `principal.toJSON()`: 70 nós, 90 conexões, 0 diferença de aresta; os dois nós alterados idênticos byte a byte; nos 4 nós que inlinam `opt-out-intent.mjs` a única diferença é a regex da D6. `versionId` conferido `3be9cfed-e56e-45d6-93a4-74a7910969ef`, publicado com `activeVersionId` igual.
- `crivo-benchmark-contexto`: `Code: gerar faixa` atualizado, 14 nós com parâmetros idênticos ao gerado, publicado em `b228c3de-5059-4c03-ad62-4b94a2d0e73d`.
- `check` antes: 9 tetos `stale`. 15 faixas nas execuções 2749–2763, todas `success`; as 10 com corpus aprovaram (3/3 fatos). Tetos iguais aos anteriores (novo 106.898, usado 119.714, ambos 106.720 B; variação 0%). `persist` com `systemMessageHash` `b71ea963…`; `check` seguinte: "9 teto(s) conferido(s); 0 marcado(s) como desatualizado(s)". Métricas em `.specs/features/lote-13-opt-out-linguagem-natural/benchmark-contexto-2026-09-30-d11.json`.

## Phase Execution Map

```text
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5

Phase 1:  T1 -> T2
Phase 2:  T3 -> T4 -> T5 -> T6 -> T7
Phase 3:  T8 -> T9 -> T10 -> T11
Phase 4:  T12 -> T13
Phase 5:  T14 -> T15 -> T16 -> T17 -> T18
Correção: T17 -> T19
D11: T19 -> T20
```

A execução é estritamente sequencial. A Phase 5 só começa com o relatório da T12 `APROVADO`.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Formato da sessão | 1 fixture + evidência | ✅ Granular |
| T2: Comportamento do classificador | 1 spike, 1 atualização do design | ✅ Granular |
| T3: Módulo de intenção | 1 módulo (2 funções + 2 constantes coesas) | ⚠️ Coeso, mesmo arquivo |
| T4: Pontuação | 1 função | ✅ Granular |
| T5: Instrução ambígua | 1 constante + 1 parâmetro | ✅ Granular |
| T6: Âncora do modelo | 1 função | ✅ Granular |
| T7: Identidade + stamp | 1 script | ⚠️ Coeso, mesmo arquivo |
| T8: Corpus | 1 fixture | ✅ Granular |
| T9: Workflow de medição | 1 workflow | ✅ Granular |
| T10: Classificador na rota | 1 trecho do workflow | ✅ Granular |
| T11: Faixa explícita | 1 trecho do workflow | ✅ Granular |
| T12: Medição conectada | 1 execução + 1 relatório | ✅ Granular |
| T13: Trava da publicação | 1 asserção | ✅ Granular |
| T14: Roteiro | 1 documento | ✅ Granular |
| T15: README | 1 documento | ✅ Granular |
| T16: Publicação | 1 publicação | ✅ Granular |
| T17: Benchmark | 1 medição | ✅ Granular |
| T18: Prova | 1 cenário + regressão | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | início da Phase 1 | ✅ Match |
| T2 | T1 | T1 -> T2 | ✅ Match |
| T3 | T2 | Phase 1 -> Phase 2 | ✅ Match |
| T4 | T3 | T3 -> T4 | ✅ Match |
| T5 | T4 | T4 -> T5 | ✅ Match |
| T6 | T5 | T5 -> T6 | ✅ Match |
| T7 | T6 | T6 -> T7 | ✅ Match |
| T8 | T7 | Phase 2 -> Phase 3 | ✅ Match |
| T9 | T8 | T8 -> T9 | ✅ Match |
| T10 | T9 | T9 -> T10 | ✅ Match |
| T11 | T10 | T10 -> T11 | ✅ Match |
| T12 | T11 | Phase 3 -> Phase 4 | ✅ Match |
| T13 | T12 | T12 -> T13 | ✅ Match |
| T14 | T13 | Phase 4 -> Phase 5 | ✅ Match |
| T15 | T14 | T14 -> T15 | ✅ Match |
| T16 | T15 | T15 -> T16 | ✅ Match |
| T17 | T16 | T16 -> T17 | ✅ Match |
| T18 | T17 | T17 -> T18 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Fixture capturada (sem lógica) | none | none | ✅ OK — a fixture é consumida pelos testes da T3 |
| T2 | Documentação (`design.md`) | none | none | ✅ OK |
| T3 | Módulo puro do n8n | unit | unit | ✅ OK |
| T4 | Módulo puro do n8n | unit | unit | ✅ OK |
| T5 | Módulo puro do n8n | unit | unit | ✅ OK |
| T6 | Identidade do benchmark | unit | unit | ✅ OK |
| T7 | Script e identidade | unit | unit | ✅ OK |
| T8 | Corpus | unit (estrutural) | unit | ✅ OK |
| T9 | Workflow n8n como código | unit/structural | unit | ✅ OK |
| T10 | Workflow n8n como código | unit/structural | unit | ✅ OK |
| T11 | Workflow n8n como código | unit/structural | unit | ✅ OK |
| T12 | Ambiente conectado | connected e2e/manual | none | ✅ OK — a execução real é o teste; o gate de código segue Build |
| T13 | Workflow n8n (teste) | unit/structural | unit | ✅ OK |
| T14 | Documentação | none | none | ✅ OK |
| T15 | Documentação | none | none | ✅ OK |
| T16 | Ambiente conectado | connected e2e/manual | none | ✅ OK — paridade conferida por `get_workflow_details` |
| T17 | Ambiente conectado | connected e2e/manual | none | ✅ OK — `check` sem `stale` é a asserção |
| T18 | Ambiente conectado | connected e2e/manual | none | ✅ OK — estado final no CRM é a asserção (AD-027) |

---

## Requirement Coverage

| Requirement | Tasks |
| --- | --- |
| OPTMED-01 | T2, T4, T7, T8, T9, T10, T12, T13 |
| OPTREG-01 | T1, T2, T3, T10, T11, T16, T18 |
| OPTAMB-01 | T1, T3, T5, T10, T16, T18 |
| OPTSEG-01 | T10, T16, T18 |
| OPTKEY-01 | T11, T16, T18 |
| OPTMSG-01 | T3, T11, T16, T18 |
| OPTPROVA-01 | T14, T18 |
| OPTDOC-01 | T5, T6, T14, T15, T17 (AC1 — AD-032 — cumprido no Design, 2026-09-27) |

**Coverage:** 8/8 requisitos mapeados; nenhuma tarefa sem requirement.

---

## Execute Packing Preview

Com 18 tarefas, o plano passa de um batch. As fases conectadas (1, 4 e 5) exigem autorizações pedidas ao usuário no momento, então ficam com o orquestrador na janela principal. As fases locais vão para workers:

1. Inline (orquestrador) — Phase 1 (T1–T2)
2. Worker A — Phase 2 (T3–T7, 5 tarefas)
3. Worker B — Phase 3 (T8–T11, 4 tarefas)
4. Inline (orquestrador) — Phase 4 (T12–T13) e Phase 5 (T14–T18)

Os batches são sequenciais; nenhum começa antes de o anterior ter gate verde e commits confirmados.
