# Lote 13b — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/lote-13b-opt-out-por-palavra/spec.md` (Design dispensado: decisões na spec)
**Status**: Approved

**Desvios aceitos (auditoria de 2026-10-07):** T2 e T3 previam testes existentes "sem alteração de asserção", o que contradiz SAIR-02 AC2. Foram invertidas as asserções de "parar" (gate, gate-opt-out-escalado, gate-conducao-humana) e atualizada a contagem de `principal-modelo.test.ts` (99/128 → 91/114; 65/81 no hotfix). `lgpd-reengagement.test.ts` deixou de listar o nó natural. Justificativa nos commits f3859b5 e abe244a.

**Regras deste lote (auditoria do L14b, `.specs/audits/2026-10-l14b.md`):**

- Execução em linha, sem sub-agentes de task; só o Verifier final é sub-agente.
- `tasks.md` recebe só status e hash de cada task. Evidência vai no commit e no `validation.md`; nada de tabela file:line por asserção.
- Mudança de schema não há. Testes pontuais com `npx vitest run <arquivos>`; Full (`npm test`) uma vez, no fim.
- Nenhum commit com `Co-Authored-By`, "Generated with" ou marca de atribuição.
- Ações externas (publicar/arquivar no n8n, push do branch de hotfix, envio de WhatsApp na prova) só com autorização explícita do usuário no momento, task a task.

---

## Test Coverage Matrix

> Guidelines found: `AGENTS.md`/`CLAUDE.md` (sem limiar de cobertura), `vitest.config.ts`, `vitest.workflow.config.ts`; amostras em `n8n/src/__tests__/gate.test.ts`, `n8n/workflows/__tests__/principal-classificador.test.ts`, `src/server/chats/__tests__/human-opt-out.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Módulos puros do n8n (`n8n/src/*.mjs`) | unit | 1:1 com os ACs; todas as edge cases da spec | `n8n/src/__tests__/*.test.ts` | `npx vitest run n8n/src/__tests__/<arquivo>` |
| Grafo dos workflows (`n8n/workflows/*.ts` + `n8n/generated`) | unit (grafo SDK) | Nós e arestas de cada AC; paridade fonte/gerado | `n8n/workflows/__tests__/*.test.ts` | `npx vitest run n8n/workflows/__tests__/<arquivo>` |
| CRM (opt-out pela tela) | integration | Regressão: confirmação idêntica | `src/server/chats/__tests__/human-opt-out.test.ts` | `npx vitest run src/server/chats/__tests__/human-opt-out.test.ts` |
| Docs/decisões (`.specs`, README) | none | build gate only | - | - |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Task com testes unitários/grafo | `npx vitest run <arquivos da task>` |
| Full | Fim do lote | `npm test` |
| Build | Tasks sem teste e fechamento | `npm run lint` + `npx tsc --noEmit -p .` (sem erro novo além dos 50 anteriores) + `node scripts/n8n-inline.mjs` sem diff pendente |

---

## Execution Plan

### Phase 1: Base do hotfix (leitura)

```
T1
```

### Phase 2: Mudança no main

```
T2 → T3 → T4 → T5 → T6
```

### Phase 3: Hotfix em produção

```
T7 → T8 → T9
```

---

## Task Breakdown

### T1: Conferir paridade do principal publicado com 0688deb

**What**: Provar que o principal ativo (`0B1nqjODu7xuYYKF`, versão `e3e25681`) equivale ao `n8n/generated/principal.ts` de `0688deb`; se divergir, parar o lote e reportar.
**Where**: `.specs/features/lote-13b-opt-out-por-palavra/evidence/paridade-e3e25681.md`
**Depends on**: None
**Reuses**: `scripts/reengagement-publication-check.ts` (comparação fonte/gerado/publicado), MCP n8n `get_workflow_version` (somente leitura)
**Requirement**: SAIR-05
**Status**: ✅ Done — 850817a (equivalente; evidência em `evidence/paridade-e3e25681.md`)

**Tools**:

- MCP: n8n (leitura)
- Skill: NONE

**Done when**:

- [ ] Nós, parâmetros e conexões do publicado comparados com o gerado de `0688deb`; resultado registrado com hash
- [ ] IF divergência THEN lote parado e usuário avisado

**Tests**: none
**Gate**: build

---

### T2: Gate aceita só "sair"

**What**: `OPT_OUT_KEYWORDS` passa a conter só `sair`; `parar` e frases seguem para o agente.
**Where**: `n8n/src/gate.mjs`
**Depends on**: None
**Reuses**: `foldAccentsAndCase`, `detectOptOut`
**Requirement**: SAIR-02
**Status**: ✅ Done — f3859b5

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `n8n/src/__tests__/gate.test.ts`: "sair", " SAIR ", "Saír" registram; "parar", "PARAR", "sair.", "quero sair do aluguel" não registram
- [ ] Regras de lead já descadastrado e de condução humana inalteradas (`gate-opt-out-escalado.test.ts`, `gate-conducao-humana.test.ts` verdes sem alteração de asserção)
- [ ] `node scripts/n8n-inline.mjs` regenerado; só arquivos que inlinam `gate.mjs` mudam
- [ ] Quick gate verde

**Tests**: unit
**Gate**: quick

**Commit**: `feat(n8n): aceitar só a palavra sair como opt-out`

---

### T3: Principal sem classificador

**What**: Remover do principal o classificador (entrada, modelo, `textClassifier`, trava, IF e rota "fora") e o ramo de opt-out em linguagem natural (POST e mensagem de falha); o checkpoint de memória liga direto ao turno do agente.
**Where**: `n8n/workflows/principal.ts`
**Depends on**: T2
**Reuses**: `memoryReadyCheckpoint`, `agentTurnWired`, ramo da palavra-chave existente
**Requirement**: SAIR-01, SAIR-03
**Status**: ✅ Done — abe244a

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Teste novo `n8n/workflows/__tests__/principal-sem-classificador.test.ts`: nenhum `textClassifier`; um único `lmChatOpenAi` (o do agente); checkpoint de memória → turno do agente; ramo da palavra-chave idêntico; `OPT_OUT_GUIDANCE_INSTRUCTION` igual ao de `0688deb`
- [ ] `principal-classificador.test.ts` e `principal-opt-out-natural.test.ts` removidos (comportamento removido, decisão do usuário)
- [ ] Demais testes de `n8n/workflows/__tests__/principal-*.test.ts` verdes sem alteração de asserção
- [ ] `n8n/generated/principal.ts` regenerado
- [ ] Quick gate verde

**Tests**: unit
**Gate**: quick

**Commit**: `feat(n8n): remover classificador de opt-out do principal`

---

### T4: Módulo de opt-out reduzido às mensagens

**What**: `opt-out-intent.mjs` mantém só `OPT_OUT_CONFIRMATION` (e o que ainda tiver uso); saem as funções do classificador.
**Where**: `n8n/src/opt-out-intent.mjs`
**Depends on**: T3
**Reuses**: importação existente em `src/server/chats/human-opt-out.ts`
**Requirement**: SAIR-02, SAIR-04
**Status**: ✅ Done — b9282aa

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `n8n/src/__tests__/opt-out-intent.test.ts` reduzido à confirmação: texto idêntico ao publicado
- [ ] `src/server/chats/__tests__/human-opt-out.test.ts` verde sem alteração de asserção
- [ ] Generated regenerado
- [ ] Quick gate verde

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(n8n): reduzir módulo de opt-out à confirmação`

---

### T5: Remover medição e lock do classificador

**What**: Apagar workflow, gerado, script, placar, corpus e testes da medição de opt-out, e a exigência de medição aprovada para publicar o principal.
**Where**: `scripts/opt-out-measurement.ts`
**Depends on**: T4
**Reuses**: NONE
**Requirement**: SAIR-04
**Status**: ✅ Done — 204ea94 (README ainda cita a medição; sai na T6)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Removidos: `n8n/workflows/medicao-opt-out.ts`, `n8n/generated/medicao-opt-out.ts`, `scripts/opt-out-measurement.ts`, `n8n/src/opt-out-score.mjs`, `n8n/fixtures/opt-out-corpus.json` e seus testes
- [ ] `rg` sem referência ativa a esses arquivos fora de `.specs/archive` e de specs encerradas
- [ ] Build gate verde

**Tests**: none
**Gate**: build

**Commit**: `chore(n8n): remover medição e lock do classificador de opt-out`

---

### T6: Registrar a decisão e a documentação

**What**: AD nova em `STATE.md` que supersede a AD-032 (restaura a exclusividade do gate da AD-018 e o modelo único da AD-026); atualizar README do n8n, INDEX e roadmap.
**Where**: `.specs/STATE.md`
**Depends on**: T5
**Reuses**: formato das ADs existentes
**Requirement**: SAIR-04
**Status**: ✅ Done — b8a2cc0 (validate_state só acusa o validation.md do Verifier, esperado)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] AD-038 registrada; AD-032 com `superseded by AD-038`; notas de status da AD-018 e da AD-026 atualizadas
- [ ] `n8n/README.md` descreve opt-out só por "sair"; INDEX com a linha do lote
- [ ] `validate_state.py` sem erro estrutural

**Tests**: none
**Gate**: build

**Commit**: `docs(specs): registrar opt-out só por sair (AD-038)`

---

### T7: Gerar o principal de hotfix sobre 0688deb

**What**: Em worktree no branch `hotfix/opt-out-so-sair` a partir de `0688deb`, aplicar só T2 e T3 (gate + remoção do classificador) e gerar o principal.
**Where**: `n8n/generated/principal.ts` (no branch de hotfix)
**Depends on**: None (fases 1 e 2 concluídas: paridade de T1 e mudança de T2/T3 no main)
**Reuses**: mudanças de T2/T3; `scripts/n8n-inline.mjs`
**Requirement**: SAIR-05
**Status**: ✅ Done — fea3306 (branch `hotfix/opt-out-so-sair`, worktree `../crivo-hotfix-l13b`; nada publicado nem enviado)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] Diff do gerado de hotfix contra o gerado de `0688deb` contém só: palavra "parar" removida do gate e nós do classificador/linguagem natural removidos
- [ ] Testes de grafo do principal e do gate do branch verdes, com os mesmos testes novos de T2/T3
- [ ] Commit no branch de hotfix; nada publicado

**Tests**: unit
**Gate**: quick

**Commit**: `fix(n8n): hotfix do principal L14 sem classificador de opt-out`

---

### T8: Publicar o hotfix e arquivar a medição

**What**: Com autorização do usuário: `update_workflow` + `publish_workflow` do principal com o gerado de T7; arquivar `crivo-medicao-opt-out`; push do branch de hotfix.
**Where**: `.specs/features/lote-13b-opt-out-por-palavra/evidence/publicacao.md`
**Depends on**: T7
**Reuses**: L-032, L-051
**Requirement**: SAIR-04, SAIR-05
**Status**: ✅ Done — 395cbfd (publicado `ddb63ae8`, medição arquivada, branch enviado)

**Tools**:

- MCP: n8n (escrita, autorizada)
- Skill: NONE

**Done when**:

- [ ] JSON da versão `e3e25681` salvo antes da publicação (rollback)
- [ ] `versionId` = `activeVersionId` do principal e publicado == gerado de T7
- [ ] `crivo-medicao-opt-out` arquivado
- [ ] Evidência registrada com IDs de versão

**Tests**: none
**Gate**: build

**Commit**: `docs(l13b): registrar publicação do hotfix de opt-out`

---

### T9: Prova real dos três casos

**What**: Com autorização do usuário, conversa real no alvo de smoke: "parar", pedido em linguagem natural e "sair", com `npm run smoke:reset` entre cenários.
**Where**: `.specs/features/lote-13b-opt-out-por-palavra/evidence/prova-real.md`
**Depends on**: T8
**Reuses**: `n8n/smoke/roteiro.md`, `src/db/smoke-reset.ts`
**Requirement**: SAIR-01, SAIR-02, SAIR-03, SAIR-05
**Status**: ✅ Done — c5eac28 (3 casos aprovados; `evidence/prova-real.md`)

**Tools**:

- MCP: n8n (leitura de execuções)
- Skill: NONE

**Done when**:

- [ ] "parar": agente responde, sem `opted_out_at`
- [ ] Linguagem natural: agente orienta responder "sair", sem `opted_out_at`
- [ ] "sair": `opted_out_at` gravado e uma única confirmação enviada
- [ ] Execuções sem nó "Classificador: opt-out"; IDs e desfechos registrados sem texto de lead real nem telefone completo (L-011)

**Tests**: none
**Gate**: build

**Commit**: `docs(l13b): registrar prova real do opt-out por sair`

---

## Fechamento

Depois da T9: `npm test` uma vez; Verifier novo e independente (spec-anchored + sensor de discriminação em cópia isolada, nunca `git stash`); `validation.md`; `validate_state.py`; revisão de lições (AD-028); sem push do main sem autorização.

## Validação pré-aprovação

| Task | Depends On (corpo) | Diagrama | Status |
| --- | --- | --- | --- |
| T1 | None | início da fase 1 | ✅ |
| T2 | None | início da fase 2 | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T3 | T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6 | T5 | T5 → T6 | ✅ |
| T7 | None (fases anteriores) | início da fase 3 | ✅ |
| T8 | T7 | T7 → T8 | ✅ |
| T9 | T8 | T8 → T9 | ✅ |

| Task | Camada | Matriz exige | Task diz | Status |
| --- | --- | --- | --- | --- |
| T1 | evidência | none | none | ✅ |
| T2 | módulo n8n | unit | unit | ✅ |
| T3 | grafo | unit | unit | ✅ |
| T4 | módulo n8n + CRM | unit (+ regressão integration) | unit | ✅ |
| T5 | remoção de arquivos | none | none | ✅ |
| T6 | docs | none | none | ✅ |
| T7 | grafo (branch) | unit | unit | ✅ |
| T8 | produção | none | none | ✅ |
| T9 | prova real | none | none | ✅ |
