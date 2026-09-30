> **Fechamento (2026-09-30).** A T18 foi executada e APROVADA contra o agente `3be9cfed`, depois da
> decisão D11 (remoção da pergunta ao lead ambíguo, T20): 5a (2705/2711/2716), 5b novo (2765/2771),
> 5c (2777/2783) e cenário 3 (2790/2796/2800). Evidência em `n8n/smoke/evidencia.md` § Lote 13 — T18.
> OPTPROVA-01 passa a Verificado e OPTAMB-01 fica superseded pela emenda D11. Não houve novo ciclo
> do Verifier: a T20 removeu uma rota e uma instrução, e foi coberta por testes de aresta, baseline
> do system message e suíte completa (126 arquivos / 2.107 testes, só as 2 falhas conhecidas).

**Veredito: PASS** ✅ — ciclo 2. Todos os 33 ACs automatizáveis têm evidência que bate com o outcome da spec, e os 13 mutantes morreram. **Pendência aberta explícita:** OPTPROVA-01 / T18 (prova por conversa real) segue pendente de execução humana (decisão D8, precedente AD-015/AD-027). O lote só fecha em definitivo com a evidência da T18.

# Lote 13 — Opt-out por linguagem natural — Validação (ciclo 2)

**Data**: 2026-09-30
**Spec**: `.specs/features/lote-13-opt-out-linguagem-natural/spec.md` (com a emenda D9 em OPTSEG-01 AC2)
**Intervalo da feature**: `baf2594..HEAD` (`d057871` … `02cae57`, 29 commits)
**Delta desde o ciclo 1**: `a6896ca..HEAD`, com `e604576` (teste novo de OPTKEY-01 AC3) e `02cae57` (emenda D9, reparo do `tasks.md`, T19, título do teste de contagens)
**Verifier**: sub-agente independente (autor ≠ verifier). Não escreveu nada deste lote e não herdou o contexto do Execute.

---

## Task Completion

| Task | Status | Notas |
| --- | --- | --- |
| T1–T11 | ✅ | — |
| T12, T12a–T12c | ✅ | Três medições REPROVADAS (2685, 2686, 2687), commitadas. Nada foi publicado no agente enquanto a medição estava reprovada |
| T12d–T12e | ✅ | Trava determinística. Medição APROVADA na execução 2688 (v4, `classifierHash` `1547f0ae…`) |
| T13 | ✅ | Agora com Status, Evidence e os 4 checkboxes marcados (`tasks.md:500-525`). O commit `cdef838` e o teste `principal-classificador.test.ts:209` existem |
| T14–T17 | ✅ | — |
| T18 | ⏸️ Pendente de execução humana (D8) | `search_executions` do `crivo-agente-principal` (`0B1nqjODu7xuYYKF`) desde 2026-09-29T23:52Z devolve **0 execuções**. O workflow foi atualizado pela última vez às 23:58:06Z, dentro da janela da T16, sem mudança depois disso |
| T19 | ✅ | Ciclo de correção 1. Conferido abaixo |

A duplicação do `tasks.md` (T1–T12e em dobro) sumiu: o arquivo tem 815 linhas e um único `#### T1:`.

---

## Gate

- `npm test`, rodado **uma vez** com a suíte completa: **126 arquivos / 2.116 testes. 2.114 passaram e 2 falharam** (271,9 s). É exatamente a referência (125/2.111 do ciclo 1, mais o arquivo novo com 5 testes).
- As 2 falhas são as já conhecidas e aceitas pelo usuário: `src/server/__tests__/actions.test.ts` › `DOCLIM-01 AC8` ("exclusão reconcilia…" e "mudança de modalidade reconcilia…"), por timeout de 30 s na suíte paralela. Elas passam isoladas. Ficam registradas aqui e **não contam contra o lote**.
- Contagem: antes do lote eram 117 arquivos / 1.878 testes. Agora são **+9 arquivos e +238 testes**, sem nenhum teste removido. O único teste alterado neste ciclo foi o título em `principal-modelo.test.ts:149`, e a asserção 71/91 continua a mesma.
- Depois do `npm test`, 7 arquivos de `n8n/generated/` ficaram modificados só por fim de linha (`git diff --ignore-cr-at-eol` vazio). Restaurei com `git checkout -- n8n/generated`, e o `git status --porcelain` voltou a ficar vazio.
- `npm run lint`: 0 erros, 7 avisos preexistentes.
- `npm run build`: não rodado (fora do pedido deste ciclo). O ciclo não mudou código de produção, só um teste novo e docs.

---

## Spec-Anchored Acceptance Criteria

Refiz a verificação de todos os ACs contra o HEAD `02cae57`. Os arquivos de teste citados só mudaram no ciclo 2 em `gate-opt-out-escalado.test.ts` (novo) e no título de `principal-modelo.test.ts`. Mesmo assim, reli cada citação neste ciclo.

### OPTMED-01 — Medir o falso positivo antes de publicar

| AC | Outcome da spec | Evidência (`file:line` — asserção) | Resultado |
| --- | --- | --- | --- |
| 1 | Pelo menos 20 explícitas, 15 ambíguas e 20 fora | `n8n/src/__tests__/opt-out-corpus.test.ts:43-53`: `expect(porFaixa("explicita").length).toBeGreaterThanOrEqual(20)` (idem para 15 e 20) | ✅ |
| 2 | As três frases reais estão na faixa explícita | `opt-out-corpus.test.ts:57-67`: `expect(comTexto("não me mande mais mensagens").map((item) => item.faixa)).toEqual(["explicita"])`, uma asserção por frase | ✅ |
| 3 | "pode parar de mandar foto" está na faixa fora | `opt-out-corpus.test.ts:69-71`: `.toEqual(["fora"])` | ✅ |
| 4 | Só o classificador roda, com o mesmo snapshot, categorias, descrições, prompt e entrada do publicado, sem chamar o CRM | `n8n/workflows/__tests__/principal-classificador.test.ts:56-60`: `expect(doAgente).toBe(daMedicao)`. `:62-67`: snapshot `gpt-5.4-nano-2026-03-17` igual ao do agente. `:73-86`: trava idêntica nos dois workflows. `n8n/workflows/__tests__/medicao-opt-out.test.ts:53-63`: nenhum nó HTTP, WhatsApp ou memória (`toEqual([])`) | ✅ |
| 5 | 3 execuções por frase, com a última mensagem do item (abertura por padrão), contagem por frase e por faixa | `medicao-opt-out.test.ts:245-255` (3 por item), `:269-274` (abertura), `:276-281` (`ultimaMensagem`), `:292-296` (`toHaveLength(real.itens.length * 3)`). `n8n/src/__tests__/opt-out-score.test.ts:41-58`: `report.porFrase` / `report.porFaixa` com `toEqual` exato | ✅ |
| 6 | APROVA só com 0 FP em ambígua+fora **e** pelo menos 90% nas explícitas | `opt-out-score.test.ts:73-78`: fronteira 0,9 → `APROVADO`. `:80-85`: 53/60 → `REPROVADO`. `:87-96`: 1 FP de ambígua → `REPROVADO`. `:98-107`: 1 FP de fora → `REPROVADO`. `:137-138`: default 0,9 | ✅ |
| 7 | Se reprovada, o classificador fica fora do agente publicado e a orientação `sair` continua | Conectado (ciclo 1, conferido por `get_workflow_history`): a primeira versão do lote-13 no agente é de 23:52Z, depois da aprovação 2688. `n8n/src/__tests__/system-message-opt-out-ambiguo.test.ts:62-68`: `toMatch(GUIDANCE)` nos dois turnos | ✅ |
| 8 | Configuração diferente da última medição aprovada → a suíte falha | `principal-classificador.test.ts:209-214`: `assertApprovedIdentity(current)`, `expect(approved.veredito).toBe("APROVADO")`, `expect(approved.classifierHash).toBe(current)`. `scripts/__tests__/opt-out-measurement.test.ts:137-185`: o hash muda com categoria, ordem, descrição, template, `inputText`, fallback, `multiClass`, auto-fix, `onError`, modelo, options e fonte. `:220-237`: sem relatório, só REPROVADO ou hash diferente → erro | ✅ |

### OPTREG-01 — Registrar o pedido explícito

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | `explicita` grava `optedOutAt` no mesmo turno via `POST /leads/{id}/opt-out` | `principal-opt-out-natural.test.ts:94-112`: saída 2 → trava → IF verdadeiro → HTTP natural, que tem o IF como único predecessor. `:128-142`: URL exata com `$('Code: gate').first().json.id` e parâmetros iguais aos do HTTP da palavra-chave | ✅ estrutural (a prova real é a T18) |
| 2 | O classificador recebe só a mensagem e a última fala; lead e tenant vêm do fluxo | `principal-classificador.test.ts:165-182` (entrada = `buildClassifierInput`), `:191-193` (`inputText` = `={{ $json.classifierInput }}`), `:195-205` (sem `fromAI`, `tenantSlug`, `waId` ou `.json.id` nos nós novos). `principal-opt-out-natural.test.ts:267-272` | ✅ |
| 3 | Uma única mensagem depois do pedido, com o texto de OPTMSG-01 | `principal-opt-out-natural.test.ts:114-116`: sucesso → finalizar. `:173-186`: `runCode(FINALIZE)` `toEqual([{ json: { mensagens: [CONFIRMATION], … } }])` | ✅ |
| 4 | Sessão vazia em `n8n_chat_histories` | `principal-opt-out-natural.test.ts:219-221`: finalizar → `Chat Memory Manager: purgar memória (opt-out)` | ✅ estrutural (a prova real é a T18) |
| 5 | `conversa_estado` purgado igual ao caminho da palavra-chave | `principal-opt-out-natural.test.ts:223-237`: purgar memória → purgar qualificação e persona → restaurar payload → envio | ✅ estrutural |
| 6 | Mensagem seguinte é gravada, sem resposta | `n8n/src/__tests__/gate.test.ts:51-57`: `optedOutAt` preenchido + "sair" → `toBe("somente-registrar")` | ✅ |
| 7 | Falha do registro → `optedOutAt` nulo e uma mensagem orientando `sair` | `principal-opt-out-natural.test.ts:118-124` (erro → orientar sair → envio fixo), `:144-150` (retry 3×, `continueErrorOutput`), `:152-165` (`mensagens: [REGISTRATION_FAILED]`) | ✅ |
| 8 | Erro, timeout ou categoria não reconhecida → segue como `fora` | `principal-classificador.test.ts:112-118`: saídas 3 e 4 → `Code: rota fora`. `:134-136`: `optOutAmbiguo: false` | ✅ |
| 9 | Mensagem mista → registra e envia só a confirmação | `n8n/src/__tests__/opt-out-intent.test.ts:218-222`: mista continua `explicita`. O ramo explícito não alcança o agente (`principal-opt-out-natural.test.ts:102-116`) | ✅ |
| 10 | Nunca afirmar que parou sem `optedOutAt` gravado | `opt-out-intent.test.ts:47-51`: `not.toMatch(/não vai mais receber/i)`, `/registramos/i`, `/(parou|paramos|encerrad[oa])/i`. `principal-opt-out-natural.test.ts:188-191`: só finalizar usa a confirmação | ✅ |

### OPTAMB-01 — Perguntar quando ambíguo

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Frase ambígua → resposta que pergunta se o lead quer parar | `principal-classificador.test.ts:108-110` (saída 1 → rota ambígua), `:130-132` (`optOutAmbiguo: true`), `:138-140` (system message recebe o flag). `system-message-opt-out-ambiguo.test.ts:21-31` (instrução só com `true`), `:71-91` (subcláusulas) | ✅ estrutural; ⚠️ a fala do modelo só se prova na T18 |
| 2 | `optedOutAt` nulo nesse turno | `principal-classificador.test.ts:124-126`: a rota ambígua só alcança o system message. `principal-opt-out-natural.test.ts:106-108` | ✅ |
| 3 | "sim" à pergunta na mesma sessão → registra com os efeitos de OPTREG AC1–AC6 | `opt-out-intent.test.ts:54-92` (`lastAgentMessage` devolve a pergunta), `principal-classificador.test.ts:165-170`. Conectado: `exp-22`–`exp-24` com 3/3 `explicita` na v4 | ✅ (a prova real é a T18) |
| 4 | "não" ou mudança de assunto → nulo, e a conversa segue | `principal-classificador.test.ts:104-106` (saída 0 → rota fora). Conectado: `fora-19`, `fora-20`, `fora-31`, `fora-32` com 3/3 `fora` na v4 | ✅ |

### OPTSEG-01 — Não descadastrar o que não é opt-out

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Frase fora → `optedOutAt` nulo | `principal-classificador.test.ts:104-106`, `:120-122`. Trava: `opt-out-intent.test.ts:194-215` (as near-misses de conteúdo do corpus viram `ambigua`, as explícitas ficam intactas). Conectado: v4 fora 96/96 | ✅ |
| 2 *(emenda D9)* | Fluxo normal, **ou** a pergunta de OPTAMB-01 AC1 quando a trava rebaixa um `explicita` de "parar de mandar <conteúdo>". Nunca registra | Fluxo normal: `principal-classificador.test.ts:120-122` e `:134-136` (rota fora → system message com `optOutAmbiguo: false`). Rebaixamento vira pergunta: `principal-opt-out-natural.test.ts:253-257` (buffer só de conteúdo → `optOutExplicito: false`), `:106-108` (IF falso → `Code: rota ambígua`), `principal-classificador.test.ts:130-132` (a rota ambígua liga a pergunta). Nunca registra: `principal-opt-out-natural.test.ts:110-112` (`predecessors(HTTP_NATURAL)` `toEqual([CONFIRM_IF])`) | ✅ (o gap de precisão do ciclo 1 foi fechado pela emenda) |

### OPTKEY-01 — Palavra exata determinística

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | `sair`/`parar` → `opt-out` no gate, sem modelo | `gate.test.ts:5-26`, `:81-89`: `toBe("opt-out")`. `principal-opt-out-natural.test.ts:201-208`: Switch saída 0 → HTTP da palavra-chave → finalizar | ✅ |
| 2 | `gate.mjs` e `gate.test.ts` inalterados | `git diff --stat baf2594..HEAD -- n8n/src/gate.mjs n8n/src/__tests__/gate.test.ts` → vazio (conferido neste ciclo) | ✅ |
| 3 | Com o lead em `escalado_humano`, `sair`/`parar` → registra | **Novo:** `n8n/src/__tests__/gate-opt-out-escalado.test.ts:13-15`: `expect(gate({ ...ESCALADO, text: "sair" })).toBe("opt-out")`. `:17-19`: `"parar"`. `:21-23`: `"  SAIR  "`. Contrapontos: `:25-27` (frase não exata → `somente-registrar`), `:29-31` (já descadastrado → `somente-registrar`). Mata o M8 | ✅ (era ❌ no ciclo 1) |
| 4 | A palavra exata envia o mesmo texto de OPTMSG-01 | `principal-opt-out-natural.test.ts:169-171`: predecessores de finalizar = `[HTTP_KEYWORD, HTTP_NATURAL]`. `:173-186`: texto exato | ✅ |

### OPTMSG-01 — Confirmar só o que o sistema cumpre

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Um único texto, idêntico nos dois caminhos | `principal-opt-out-natural.test.ts:169-171`, `:188-191` (`expect(users).toEqual([FINALIZE])`), `:193-197` (o texto antigo não aparece em nenhum nó) | ✅ |
| 2 | Exatamente "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!" | `opt-out-intent.test.ts:24-28`: `expect(OPT_OUT_CONFIRMATION).toBe("Pronto, registramos seu pedido. …")`. `principal-opt-out-natural.test.ts:40-41`, `:173-186` | ✅ |

### OPTDOC-01 — Decisão e documentação

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | AD nova que emenda AD-018 e AD-026, e as duas apontam para ela | `.specs/STATE.md:182` (AD-018 `amended by AD-032`), `:246` (AD-026 `amended by AD-032`), `:288` (AD-032) | ✅ |
| 2 | Instrução de pergunta só no turno ambíguo, com `OPT_OUT_GUIDANCE_INSTRUCTION` mantida | `n8n/src/system-message.mjs:111`, `:377-378`. `system-message-opt-out-ambiguo.test.ts:21-31`, `:52-58` (baseline byte a byte), `:62-68` | ✅ |
| 3 | README e roteiro descrevem os dois caminhos, sem "opt-out natural fora do escopo" | `n8n/README.md:358` (§14), `n8n/smoke/roteiro.md:241` (§6.1), `:195` (cenário 3 com o texto novo). `grep -rn "Opt-out por linguagem natural é L13" n8n/ .specs/STATE.md` sem ocorrência | ✅ |

### OPTPROVA-01 — Provar por conversa real: **pendência aberta, execução humana (T18, D8)**

| AC | Situação | O que falta |
| --- | --- | --- |
| 1 | ✅ O documento está pronto: `n8n/smoke/roteiro.md:241-282` (casos 5a, 5b e 5c em leads distintos, com reset entre eles) | — |
| 2 | ⏸️ Pendente | Rodar 5a, 5b e 5c no WhatsApp e registrar o `optedOutAt` final no CRM: preenchido em 5a e 5b, nulo em 5c |
| 3 | ⏸️ Pendente | Registrar a sessão de memória vazia em 5a e 5b **antes** da limpeza manual |
| 4 | ⏸️ Pendente | Reexecutar o cenário 3 (`sair`) e registrar a confirmação com o texto de OPTMSG-01 |
| 5 | ⏸️ Pendente | Citar só ids conferidos por `get_execution`. Hoje não existe nenhuma execução do agente depois da publicação (0 desde 23:52Z) |

Não inventei nenhuma evidência. OPTPROVA-01 não reprova o lote sozinho (precedente AD-015/AD-027), mas é **condição de fechamento definitivo**. A T18 fecha com a evidência em `n8n/smoke/evidencia.md` e o commit `docs(n8n): record natural language opt-out smoke evidence`. As partes marcadas como "estrutural" em OPTREG-01, OPTAMB-01 e OPTSEG-01 só ganham prova de desfecho nessa conversa.

### Edge cases

- [x] Buffer com várias mensagens: `opt-out-intent.test.ts:157-161` e `principal-classificador.test.ts:165-170`. Um único registro, porque o ramo é linear (`principal-opt-out-natural.test.ts:110-116`).
- [x] Pedido na primeira mensagem de lead novo: o lead vem de `$('Code: gate')` (`principal-opt-out-natural.test.ts:128-138`). Ainda sem prova real.
- [x] "sim" depois do corte de 12h: `opt-out-intent.test.ts:120-135` (sessão vazia → `null` → "(nenhuma)").
- [x] `sair` depois do opt-out natural: `gate.test.ts:51-57` e `gate-opt-out-escalado.test.ts:29-31`.
- [x] Modelo fora do ar: a palavra exata é tratada no gate, antes do modelo (`gate.test.ts:81-84`).

---

## Discrimination Sensor

Usei uma worktree descartável em `scratchpad/wt13c2` (`git worktree add … HEAD`), com junction de `node_modules` e `npx vitest run --root <worktree>` a partir do repositório. Cada mutante rodou contra `n8n/src/__tests__`, `n8n/workflows/__tests__`, `scripts/__tests__` e `src/server/documents/__tests__/benchmark-identity.test.ts`: **26 arquivos / 651 testes, linha de base verde**. Apliquei cada mutante sozinho por script (padrão exigido com exatamente 1 ocorrência) e reverti com `git -C <worktree> checkout -- .`. O `git status --porcelain` da árvore real estava vazio antes e continuou vazio depois. Removi a junction (`rmdir`) antes do `git worktree remove --force`, e o `node_modules` real está intacto.

| # | Arquivo | Mutação | Resultado | Teste que matou |
| --- | --- | --- | --- | --- |
| M8 | `n8n/src/gate.mjs:69-70` | Ordem invertida: `escalado_humano` antes de `detectOptOut` | ✅ Morto (3) | `gate-opt-out-escalado.test.ts:13`, `:17`, `:21` |
| M1 | `n8n/workflows/principal.ts:2143` | Saída 2 (`explicita`) → `Code: rota fora` | ✅ Morto (20) | `principal-opt-out-natural.test.ts:94`, `:98`, `:102`, `:106`, `:169`; `principal-classificador.test.ts:73` |
| M2a | `principal.ts:591` | Confirmação antiga de volta em `Code: finalizar opt-out` | ✅ Morto (3) | `principal-opt-out-natural.test.ts:173`, `:188`, `:193` |
| M2b | `n8n/src/opt-out-intent.mjs:12` | Confirmação antiga em `OPT_OUT_CONFIRMATION` | ✅ Morto (3) | `opt-out-intent.test.ts:24`, `:30`; `principal-opt-out-natural.test.ts:173` |
| M3a | `principal.ts:1169` | `Code: rota ambígua` emite `optOutAmbiguo: false` | ✅ Morto (1) | `principal-classificador.test.ts:130` |
| M3b | `principal.ts:1230` | System message com `optOutAmbiguo: false` fixo | ✅ Morto (1) | `principal-classificador.test.ts:138` |
| M4 | `n8n/src/opt-out-score.mjs:66` | `>=` → `>` na barra de 90% | ✅ Morto (1) | `opt-out-score.test.ts:73` (fronteira 0,9) |
| M5a | `opt-out-score.mjs:64` | FP de ambígua ignorado (só conta `fora`) | ✅ Morto (1) | `opt-out-score.test.ts:87` |
| M5b | `opt-out-score.mjs:64` | FP de fora ignorado (só conta `ambigua`) | ✅ Morto (1) | `opt-out-score.test.ts:98` |
| M5c | `opt-out-score.mjs:64` | Falsos positivos sempre 0 | ✅ Morto (2) | `opt-out-score.test.ts:87`, `:98` |
| M6 | `opt-out-intent.mjs:134` | Trava desligada (`refineOptOutCategory` devolve sempre a categoria recebida) | ✅ Morto (15) | `opt-out-intent.test.ts:205` (13 casos do corpus e da regra), `medicao-opt-out.test.ts:219`, `principal-opt-out-natural.test.ts:253` |

**Profundidade**: P0 (caminho LGPD). Repeti obrigatoriamente o M8, os cinco mínimos do ciclo 1 (M1, M2, M3, M4, M5) e a trava desligada (M6), com variantes: 11 ids e 13 mutações contando as variantes a/b/c.
**Resultado**: 13/13 mortos — **PASS**.

---

## Spec-precision gaps restantes (não bloqueiam)

1. **OPTAMB-01 AC1, OPTREG-01 AC4 e AC5**: o outcome é uma fala do modelo ou um estado de banco. Os testes provam a estrutura (instrução incluída, arestas de purga), não o desfecho. O desfecho depende da T18.
2. **OPTMED-01 AC4/AC8 × workflow publicado**: a identidade é calculada sobre `principal.ts`, não sobre o workflow publicado. Pela decisão D6, 4 nós publicados têm U+0300–U+036F literais no regex no lugar do escape. É semanticamente igual, mas não é byte a byte. Nenhum teste compara o publicado; a paridade foi conferida à mão na T16. Neste ciclo confirmei que o agente não mudou depois da T16 (`updatedAt` 2026-09-29T23:58:06Z).
3. ~~OPTSEG-01 AC2 × trava~~: **fechado** pela emenda D9 (`spec.md`, OPTSEG-01 AC2), com a evidência acima.

## Achados de documentação

- ✅ Resolvidos: a duplicação do `tasks.md`, o Status/Evidence da T13 e o título de `principal-modelo.test.ts:149` (agora 71/91). A rastreabilidade da spec foi atualizada (OPTKEY-01 Verified, OPTSEG-01 com emenda D9).
- Fora do escopo deste ciclo (combinado): o Handoff do `.specs/STATE.md:306-310` ainda diz "parado na parada obrigatória". O orquestrador atualiza no fechamento.
- Observação: a linha de rastreabilidade de OPTMED-01 na spec cita "T13 trava", o que está correto.

---

## Code Quality

| Princípio | Status |
| --- | --- |
| Código mínimo e mudanças cirúrgicas (gate sem diff; o teste novo foi para arquivo separado, respeitando OPTKEY-01 AC2) | ✅ |
| Sem scope creep (o ciclo 2 não tocou código de produção) | ✅ |
| Segue os padrões (módulos puros, inliner, teste de aresta por `toJSON()`) | ✅ |
| As asserções batem com o outcome da spec | ✅ |
| Uma aresta, um teste (L-026) | ✅ |
| Todo teste mapeia para um AC, edge case ou Done-when (o arquivo novo mapeia para OPTKEY-01 AC3 e o edge case "sair depois do opt-out") | ✅ |

---

## Requirement Traceability

| Requisito | Status |
| --- | --- |
| OPTMED-01 | ✅ Verificado |
| OPTREG-01 | ✅ Verificado (estrutural; desfecho real na T18) |
| OPTAMB-01 | ✅ Verificado (estrutural; desfecho real na T18) |
| OPTSEG-01 | ✅ Verificado (com emenda D9) |
| OPTKEY-01 | ✅ Verificado (AC3 coberto neste ciclo) |
| OPTMSG-01 | ✅ Verificado |
| OPTPROVA-01 | ⏸️ Pendente de execução humana (T18); AC1 documental cumprido |
| OPTDOC-01 | ✅ Verificado |

---

## Summary

**Overall**: ✅ PASS do Verifier, com uma pendência aberta: T18 / OPTPROVA-01.

**Spec-anchored**: 33/33 ACs de OPTMED, OPTREG, OPTAMB, OPTSEG, OPTKEY, OPTMSG e OPTDOC com evidência que bate com o outcome. 2 gaps de precisão remanescentes, sem bloqueio. OPTPROVA-01 (5 ACs, 1 documental cumprido) está pendente de execução humana.
**Sensor**: 13/13 mortos (o M8 agora morre).
**Gate**: 126 arquivos / 2.116 testes, só as 2 falhas conhecidas e aceitas (`DOCLIM-01 AC8`). Lint com 0 erros.

**Próximo passo**: a T18 por conversa real (casos 5a, 5b, 5c e cenário 3), com ids conferidos por `get_execution`. É a condição de fechamento definitivo do lote.
