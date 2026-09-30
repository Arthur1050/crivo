**Veredito: FAIL** ❌ — 1 AC sem evidência (OPTKEY-01 AC3) e 1 mutante sobrevivente (M8). OPTPROVA-01 segue pendente de execução humana (T18, D8).

# Lote 13 — Opt-out por linguagem natural — Validação

**Data**: 2026-09-29
**Spec**: `.specs/features/lote-13-opt-out-linguagem-natural/spec.md`
**Intervalo de commits**: `baf2594..HEAD` (`d057871` … `5e31440`, 27 commits; 33 arquivos, +6.898/−133)
**Verifier**: sub-agente independente (autor ≠ verifier), sem contexto do Execute

---

## Task Completion

| Task | Status | Notas |
| --- | --- | --- |
| T1–T11 | ✅ | Evidence com ids conferidos |
| T12, T12a–T12c | ✅ | Três medições REPROVADAS (2685, 2686, 2687), commitadas; nada publicado no agente enquanto reprovado |
| T12d–T12e | ✅ | Trava determinística; medição APROVADA (execução 2688, conferida por `get_execution`: `success`, 23:33:41Z → 23:35:23Z) |
| T13 | ⚠️ Feita no código, sem registro | Commit `cdef838` e teste `principal-classificador.test.ts:209` existem, mas a seção T13 do `tasks.md` não tem Status nem Evidence e os 4 checkboxes estão desmarcados |
| T14–T17 | ✅ | T16: histórico do agente (`get_workflow_history`) mostra todas as versões do lote-13 a partir de 23:52Z, depois da aprovação |
| T18 | ⏸️ Pendente de execução humana (D8) | `search_executions` do `crivo-agente-principal` (`0B1nqjODu7xuYYKF`): última execução em 2026-09-29T03:27Z, antes da publicação; nenhuma conversa real sobre a versão `3e20756c…` |

---

## Gate

- `npm test` (uma vez, suíte completa): **125 arquivos / 2.111 testes; 2.109 passaram, 2 falharam**. As 2 falhas são as conhecidas e aceitas pelo usuário: `src/server/__tests__/actions.test.ts` › `DOCLIM-01 AC8` (exclusão e mudança de modalidade reconciliam a admissão do tenant), timeout na suíte paralela. Não contam contra o lote. Duração 262,9 s.
- Contagem: igual à referência (125 / 2.111); baseline antes do lote 117 / 1.878 → **+8 arquivos, +233 testes**; nenhum teste removido.
- Depois do `npm test`, `n8n/generated/` ficou modificado só por fim de linha (`git diff --ignore-cr-at-eol` vazio); restaurado com `git checkout -- n8n/generated`.
- `npm run lint`: 0 erros, 7 avisos preexistentes.
- `npm run build`: não rodado nesta validação (fora do pedido); a T15 registra build ok.

---

## Spec-Anchored Acceptance Criteria

### OPTMED-01 — Medir o falso positivo antes de publicar

| AC | Outcome da spec | Evidência (`file:line` — asserção) | Resultado |
| --- | --- | --- | --- |
| 1 | ≥ 20 explícitas, ≥ 15 ambíguas, ≥ 20 fora | `n8n/src/__tests__/opt-out-corpus.test.ts:43-53` — `expect(porFaixa("explicita").length).toBeGreaterThanOrEqual(20)` (idem 15 e 20). Corpus real: 28 / 17 / 32 | ✅ |
| 2 | As três frases reais na faixa explícita | `opt-out-corpus.test.ts:57-67` — `expect(comTexto("não me mande mais mensagens").map((item) => item.faixa)).toEqual(["explicita"])` (uma asserção por frase) | ✅ |
| 3 | "pode parar de mandar foto" na faixa fora | `opt-out-corpus.test.ts:69-71` — `.toEqual(["fora"])` | ✅ |
| 4 | Só o classificador; mesmo snapshot, categorias, descrições, prompt e entrada que o publicado; sem CRM | `n8n/workflows/__tests__/principal-classificador.test.ts:56-60` — `expect(doAgente).toBe(daMedicao)` (identidade de parâmetros, modelo e `opt-out-intent.mjs`); `:73-86` trava idêntica nos dois; `n8n/workflows/__tests__/medicao-opt-out.test.ts:53-63` — `expect(workflow.nodes.filter((n) => /httpRequest/i.test(n.type))).toEqual([])` (e WhatsApp, memória) | ✅ |
| 5 | 3 execuções por frase, com a última mensagem do item (abertura por padrão), contagem por frase e por faixa | `medicao-opt-out.test.ts:245`, `:269`, `:276`, `:292-295` — `expect(out).toHaveLength(real.itens.length * 3)`; `n8n/src/__tests__/opt-out-score.test.ts:41-58` — `expect(report.porFrase).toEqual([...])`, `expect(report.porFaixa).toEqual({...})`. Conectado: relatório `medicao-opt-out-2026-09-29-v4.json` (231 = 77 × 3, execução 2688 conferida) | ✅ |
| 6 | APROVA só com 0 FP em ambígua+fora E ≥ 90% nas explícitas | `opt-out-score.test.ts:73-77` — fronteira `taxaExplicita` 0,9 → `toBe("APROVADO")`; `:80-84` 53/60 → `REPROVADO`; `:87-95` 1 FP de ambígua → `REPROVADO`; `:98-106` 1 FP de fora → `REPROVADO`; `:137-138` default 0,9 | ✅ |
| 7 | Reprovada → classificador fora do agente publicado, orientação `sair` em vigor | Conectado: medições v1–v3 REPROVADAS (2685–2687); `get_workflow_history` do agente: primeira versão do lote-13 (`ef9dcd3f…`) em 2026-09-29T23:52:19Z, depois da aprovação (2688, 23:35Z). `n8n/src/__tests__/system-message-opt-out-ambiguo.test.ts:62-68` — `toMatch(GUIDANCE)` mantém a orientação | ✅ |
| 8 | Configuração diferente da última medição aprovada → suíte falha | `principal-classificador.test.ts:209-214` — `assertApprovedIdentity(current)`, `expect(approved.classifierHash).toBe(current)`; `scripts/__tests__/opt-out-measurement.test.ts:138-182` (hash muda com categoria, ordem, descrição, template, inputText, fallback, multiClass, auto-fix, onError, modelo, options, fonte), `:220-245` (sem relatório, só REPROVADO, hash diferente → erro). Identidade atual `1547f0ae…` = `classifierHash` do único APROVADO (conferido nesta validação com `npx tsx scripts/opt-out-measurement.ts identity`) | ✅ |

### OPTREG-01 — Registrar o pedido explícito

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | `explicita` grava `optedOutAt` no mesmo turno por `POST /leads/{id}/opt-out` | `n8n/workflows/__tests__/principal-opt-out-natural.test.ts:95-111` — saída 2 → trava → IF verdadeiro → HTTP natural (`toEqual` exato); `:128-142` — `expect(params.url).toBe("=https://…/leads/{{ $('Code: gate').first().json.id }}/opt-out")`, parâmetros iguais ao HTTP da palavra-chave | ✅ estrutural (prova real: T18) |
| 2 | Classificador recebe só a mensagem e a última fala; lead/tenant do fluxo | `principal-classificador.test.ts:165-182` (entrada = `buildClassifierInput` sobre carga/semeadura e buffer), `:191-193` `inputText` = `={{ $json.classifierInput }}`, `:195-205` nenhum `fromAI`/`tenantSlug`/`waId`/`.json.id` nos nós novos; `principal-opt-out-natural.test.ts:267-272` | ✅ |
| 3 | Uma mensagem depois do pedido, com o texto de OPTMSG-01 | `principal-opt-out-natural.test.ts:114-116` sucesso → `Code: finalizar opt-out`; `:173-186` — `expect(runCode(FINALIZE)).toEqual([{ json: { mensagens: [CONFIRMATION], … } }])` | ✅ |
| 4 | Sessão vazia em `n8n_chat_histories` | `principal-opt-out-natural.test.ts:219-221` — finalizar → `Chat Memory Manager: purgar memória (opt-out)` (mesma cauda da palavra-chave, `:169-171`) | ✅ estrutural (prova real: T18) |
| 5 | `conversa_estado` purgado igual à palavra-chave | `principal-opt-out-natural.test.ts:223-233` — purgar memória → `Data Table: purgar qualificação e persona (opt-out)` → restaurar payload | ✅ estrutural |
| 6 | Mensagem seguinte gravada, sem resposta | `n8n/src/__tests__/gate.test.ts:51-57` — `optedOutAt` preenchido + "sair" → `expect(route).toBe("somente-registrar")` (gate inalterado) | ✅ |
| 7 | Falha do registro → `optedOutAt` nulo e uma mensagem orientando `sair` | `principal-opt-out-natural.test.ts:118-124` erro → `Code: orientar sair` → destinatário do envio fixo; `:144-150` retry 3×, `continueErrorOutput`; `:152-165` — `mensagens: [REGISTRATION_FAILED]` | ✅ |
| 8 | Erro, timeout ou categoria não reconhecida → agente como `fora` | `principal-classificador.test.ts:112-118` — saídas 3 e 4 → `Code: rota fora` (`toEqual` exato); `:134-136` rota fora emite `optOutAmbiguo: false` | ✅ |
| 9 | Mensagem mista → registra e envia só a confirmação | `n8n/src/__tests__/opt-out-intent.test.ts:218-222` — mista continua `explicita`; ramo explícito não alcança o agente (`principal-opt-out-natural.test.ts:102-116`, alvos exatos). Conectado: `exp-19` (pergunta + pedido) 3/3 `explicita` na v4 | ✅ |
| 10 | Nunca afirmar que parou sem `optedOutAt` gravado | `opt-out-intent.test.ts:47-51` — `not.toMatch(/não vai mais receber/i)`, `/registramos/i`, `/(parou|paramos|encerrad[oa])/i`; `principal-opt-out-natural.test.ts:188-191` só `finalizar opt-out` usa a confirmação | ✅ |

### OPTAMB-01 — Perguntar quando ambíguo

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Ambígua → resposta que pergunta se quer parar | `principal-classificador.test.ts:108-110` saída 1 → `Code: rota ambígua`; `:130-132` emite `true`; `:138-140` system message recebe `optOutAmbiguo: $json.optOutAmbiguo === true`; `system-message-opt-out-ambiguo.test.ts:21-31` instrução só com `true`; `:72-90` subcláusulas | ✅ estrutural; ⚠️ a fala do modelo só se prova na T18 |
| 2 | `optedOutAt` nulo nesse turno | Rota ambígua só alcança o system message: `principal-classificador.test.ts:124-126`; IF falso da trava → rota ambígua: `principal-opt-out-natural.test.ts:106-108` | ✅ |
| 3 | "sim" à pergunta na mesma sessão → registra com efeitos de OPTREG AC1–AC6 | `opt-out-intent.test.ts:54-92` (`lastAgentMessage` devolve a pergunta da sessão); `principal-classificador.test.ts:165-170`; conectado: `exp-22` "sim", `exp-23`, `exp-24` com a pergunta como `ultimaMensagem`, 3/3 `explicita` na v4 | ✅ (prova real: T18) |
| 4 | "não" ou mudança de assunto → nulo e segue | Conectado: `fora-19`, `fora-20`, `fora-31`, `fora-32` 3/3 `fora` na v4; saída 0 → rota fora (`principal-classificador.test.ts:104-106`) | ✅ |

### OPTSEG-01 — Não descadastrar o que não é opt-out

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Fora → `optedOutAt` nulo | `principal-classificador.test.ts:104-106`, `:120-122`; trava: `opt-out-intent.test.ts:194-215` (todas as near-misses de conteúdo do corpus rebaixadas; explícitas intactas); conectado: v4 fora 96/96 sem `explicita` | ✅ |
| 2 | Fora → fluxo normal | `principal-classificador.test.ts:134-136` (`optOutAmbiguo: false`), `:120-122` rota fora → system message | ✅ com ⚠️ gap de precisão (ver abaixo) |

### OPTKEY-01 — Palavra exata determinística

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | `sair`/`parar` → `opt-out` no gate, sem modelo | `gate.test.ts:5-22`, `:81-89` — `expect(route).toBe("opt-out")`; `principal-opt-out-natural.test.ts:201-208` Switch saída 0 → HTTP da palavra-chave → finalizar, sem saída de erro | ✅ |
| 2 | `gate.mjs` e `gate.test.ts` inalterados | `git diff baf2594..HEAD -- n8n/src/gate.mjs n8n/src/__tests__/gate.test.ts` → **0 bytes** (conferido nesta validação) | ✅ |
| 3 | `escalado_humano` + `sair`/`parar` → registra | **Nenhuma asserção no repositório.** `gate.test.ts:60-66` cobre `optedOutAt` + escalado; `:93-96` cobre escalado sem opt-out. Nenhum teste chama `gate({ status: "escalado_humano", text: "sair" })`. O comportamento existe (`n8n/src/gate.mjs:69-70`, opt-out antes de escalado), mas o mutante M8 (ordem invertida) sobreviveu a todos os 24 arquivos de `n8n/` e `scripts/` (636 testes) | ❌ GAP |
| 4 | Palavra exata envia o mesmo texto de OPTMSG-01 | `principal-opt-out-natural.test.ts:169-171` — predecessores de finalizar = `[HTTP_KEYWORD, HTTP_NATURAL]`; `:173-186` texto exato | ✅ |

### OPTMSG-01 — Confirmar só o que o sistema cumpre

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Texto único, idêntico nos dois caminhos | `principal-opt-out-natural.test.ts:169-171`, `:188-191` — `expect(users).toEqual([FINALIZE])`; `:193-197` texto antigo ausente de todos os nós | ✅ |
| 2 | Exatamente "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!" | `opt-out-intent.test.ts:24-28` — `expect(OPT_OUT_CONFIRMATION).toBe("Pronto, registramos seu pedido. …")`; `principal-opt-out-natural.test.ts:40-41`, `:173-186` | ✅ |

### OPTDOC-01 — Decisão e documentação

| AC | Outcome da spec | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | AD nova emendando AD-018 e AD-026, as duas apontando para ela | `.specs/STATE.md:182` (`amended by AD-032`, AD-018), `.specs/STATE.md:246` (`amended by AD-032`, AD-026), `.specs/STATE.md:288-292` (AD-032) | ✅ |
| 2 | Instrução ambígua só no turno ambíguo; `OPT_OUT_GUIDANCE_INSTRUCTION` mantida | `n8n/src/system-message.mjs:111`, `:377-378`; `system-message-opt-out-ambiguo.test.ts:21-31`, `:62-68`; baseline byte a byte `:42` | ✅ |
| 3 | README e roteiro descrevem os dois caminhos; sem "opt-out natural fora do escopo" | `n8n/README.md:358` (§14); `n8n/smoke/roteiro.md:241` (§6.1), `:195` (cenário 3 com o texto novo); `grep -rn "Opt-out por linguagem natural é L13" n8n/ .specs/STATE.md` sem ocorrência | ✅ |

### OPTPROVA-01 — Provar por conversa real — **pendente de execução humana (T18, D8)**

| AC | Situação | O que falta |
| --- | --- | --- |
| 1 | ✅ Documento pronto: `n8n/smoke/roteiro.md:241-282` (casos 5a, 5b, 5c em leads distintos, reset entre eles) | — |
| 2 | ⏸️ Pendente de execução humana | Rodar 5a, 5b e 5c no WhatsApp e registrar `optedOutAt` final no CRM por lead (preenchido em 5a e 5b, nulo em 5c) |
| 3 | ⏸️ Pendente de execução humana | Registrar a sessão de memória vazia nos casos 5a e 5b **antes** da limpeza manual |
| 4 | ⏸️ Pendente de execução humana | Reexecutar o cenário 3 (`sair`) e registrar a confirmação com o texto de OPTMSG-01 |
| 5 | ⏸️ Pendente de execução humana | Citar só ids de execução conferidos por `get_execution`; hoje não existe nenhuma execução do agente depois da publicação (última: 2026-09-29T03:27Z) |

Nenhuma evidência foi inventada. OPTPROVA-01 não reprova sozinho (precedente AD-015/AD-027), mas é **condição de fechamento definitivo** do lote: a T18 fecha com a evidência em `n8n/smoke/evidencia.md` e o commit `docs(n8n): record natural language opt-out smoke evidence`. As partes de OPTREG-01, OPTAMB-01 e OPTSEG-01 marcadas "estrutural" também só ganham prova de desfecho nessa conversa.

### Edge cases

- [x] Buffer com várias mensagens: `opt-out-intent.test.ts:157-162`, `principal-classificador.test.ts:165-170`; um único registro por turno (ramo linear, `principal-opt-out-natural.test.ts:110-116`).
- [x] Pedido na primeira mensagem de lead novo: lead vem de `$('Code: gate')`, que roda depois da criação (`principal-opt-out-natural.test.ts:128-138`); sem prova real.
- [x] "sim" depois do corte de 12h: `opt-out-intent.test.ts:120-135` (sessão vazia → `null` → "(nenhuma)").
- [x] `sair` depois do opt-out natural: `gate.test.ts:51-57` (`somente-registrar`, sem segunda confirmação).
- [x] Modelo do agente fora do ar: palavra exata no gate, antes de qualquer modelo (`gate.test.ts:81-84`).

---

## Discrimination Sensor

Worktree descartável em `scratchpad/wt13` (`git worktree add … HEAD`), junction de `node_modules`, vitest rodado a partir do repositório com `--root <worktree>`. Conjunto de testes por mutante: os 11 arquivos em escopo (440 testes; linha de base verde). Cada mutante aplicado sozinho e revertido com `git -C <worktree> checkout -- .`. `git status --porcelain` da árvore real: vazio antes e vazio depois; junction removida antes de `git worktree remove --force`.

| # | Arquivo:linha | Mutação | Resultado | Teste que matou |
| --- | --- | --- | --- | --- |
| M1 | `n8n/workflows/principal.ts:2143` | saída 2 (`explicita`) → `Code: rota fora` | ✅ Morto (20+ falhas) | `principal-opt-out-natural.test.ts:94` "saída 2 (explicita) do classificador → Code: conferir pedido explícito" |
| M1b | `principal.ts:2143` | saída 2 direto ao HTTP natural, pulando a trava | ✅ Morto (12) | `principal-opt-out-natural.test.ts:94`, `:98`, `:102` |
| M2a | `principal.ts:591` | confirmação antiga em `Code: finalizar opt-out` | ✅ Morto (3) | `principal-opt-out-natural.test.ts:173`, `:188`, `:193` |
| M2b | `n8n/src/opt-out-intent.mjs:11` | confirmação antiga em `OPT_OUT_CONFIRMATION` | ✅ Morto (3) | `opt-out-intent.test.ts:24`, `:30`; `principal-opt-out-natural.test.ts:173` |
| M3a | `principal.ts:1169` | `Code: rota ambígua` emite `optOutAmbiguo: false` | ✅ Morto (1) | `principal-classificador.test.ts:130` |
| M3b | `principal.ts:1230` | system message com `optOutAmbiguo: false` fixo | ✅ Morto (1) | `principal-classificador.test.ts:138` |
| M4 | `n8n/src/opt-out-score.mjs:66` | `>=` → `>` na barra de 90% | ✅ Morto (1) | `opt-out-score.test.ts:73` (fronteira 0,9) |
| M5a | `opt-out-score.mjs:64` | falsos positivos só de `fora` | ✅ Morto (1) | `opt-out-score.test.ts:87` (FP de ambígua) |
| M5b | `opt-out-score.mjs:64` | falsos positivos só de `ambigua` | ✅ Morto (1) | `opt-out-score.test.ts:98` (FP de fora) |
| M6 | `opt-out-intent.mjs:134` | trava desligada (`refineOptOutCategory` devolve sempre a categoria) | ✅ Morto (15) | `opt-out-intent.test.ts:205` (corpus), `principal-opt-out-natural.test.ts:253`, `medicao-opt-out.test.ts:219` |
| M7 | `principal.ts:2147` | erro do classificador religado por `.onError()` | ✅ Morto (2) | `principal-classificador.test.ts:108` (saída 1 ganha rota fora), `:116` (saída 4 sem conexão) |
| M8 | `n8n/src/gate.mjs:69-70` | escalado antes de opt-out (`escalado_humano` + `sair` → `somente-registrar`) | ❌ **Sobreviveu** — 11/11 arquivos em escopo e também 24/24 arquivos de `n8n/` + `scripts/` (636 testes) verdes | nenhum |
| M9 | `principal.ts:2143` | IF da trava com verdadeiro/falso trocados | ✅ Morto (2) | `principal-opt-out-natural.test.ts:102`, `:106` |
| M10 | `principal.ts:644` | falha do registro envia a confirmação (viola AC10) | ✅ Morto (2) | `principal-opt-out-natural.test.ts:152`, `:188` |
| M11 | `principal.ts:2142` | saída 1 (`ambigua`) → rota fora | ✅ Morto (1) | `principal-classificador.test.ts:108` |

**Profundidade**: P0 (caminho LGPD), 15 mutantes manuais.
**Resultado**: 14/15 mortos — **FAIL** pelo M8.

---

## Spec-precision gaps

1. **OPTSEG-01 AC2 × trava (D3)**: a spec exige "fluxo normal" para toda frase `fora`. Se o classificador errar uma near-miss de conteúdo como `explicita`, a trava a rebaixa para `ambigua` e o agente **pergunta** em vez de seguir normal. É a degradação aceita na decisão D3 (e o roteiro 5c já aceita "ou a pergunta", `n8n/smoke/roteiro.md:271`), mas a spec não foi emendada. Recomendo emendar OPTSEG-01 AC2 para admitir a pergunta quando a trava atua.
2. **OPTAMB-01 AC1, OPTREG-01 AC4 e AC6**: o outcome é comportamento do modelo ou estado de banco; os testes provam a estrutura (instrução incluída, arestas de purga, rota do gate), não o desfecho. O desfecho depende da T18.
3. **OPTMED-01 AC4/AC8 × publicado**: a identidade é calculada sobre `principal.ts`, não sobre o workflow publicado. A decisão D6 deixou os 4 nós que inlinam `opt-out-intent.mjs` publicados com U+0300–U+036F literais no regex em vez do escape `̀-ͯ`: é semanticamente o mesmo, mas o `jsCode` publicado difere byte a byte do gerado. Nenhum teste compara o publicado; a paridade foi conferida à mão na T16.

---

## Achados de documentação (não bloqueiam sozinhos)

- `tasks.md`: as linhas 105–504 estão duplicadas byte a byte nas linhas 515–914 (T1–T12e duas vezes).
- `tasks.md` T13: sem Status/Evidence, checkboxes desmarcados, embora o commit `cdef838` e o teste existam.
- `.specs/STATE.md` Handoff (linhas 306–310) ainda diz "parado na parada obrigatória, REPROVADO, classificador não publicado"; o estado real é publicado na `3e20756c…` com T18 pendente.
- `n8n/workflows/__tests__/principal-modelo.test.ts:149`: o título diz "69 nós e 88 conexões", mas a asserção é 71/91.
- Observação operacional: os testes de escape da D6 foram feitos editando `Code: rota fora` do agente de produção (versões `b4952d09`, `b26ea762`, `f55026e0` no histórico), com restauração na `3e20756c`. Não mudou o estado final, mas foi experimento em workflow de produção.

---

## Code Quality

| Princípio | Status |
| --- | --- |
| Código mínimo, mudanças cirúrgicas (gate sem diff; cauda de opt-out reutilizada) | ✅ |
| Sem scope creep | ✅ |
| Segue padrões (módulos puros, inliner, teste de aresta por `toJSON()`) | ✅ |
| Asserções batem com o outcome da spec | ✅ exceto OPTKEY-01 AC3 (ausente) |
| Uma aresta, um teste (L-026) | ✅ |
| Todo teste mapeia a AC, edge case ou Done-when | ✅ |

---

## Fix Plans

### Fix 1 — OPTKEY-01 AC3 sem teste (Major, LGPD)

- **Causa**: a precedência "opt-out vence `escalado_humano`" de `n8n/src/gate.mjs:69-70` nunca foi afirmada; o AC2 proíbe mexer em `gate.test.ts`, e ninguém criou o teste em outro arquivo.
- **Tarefa**: criar `n8n/src/__tests__/gate-opt-out-escalado.test.ts` (arquivo novo, sem tocar `gate.test.ts`) com `expect(gate({ optedOutAt: null, status: "escalado_humano", hasMedia: false, text: "sair" })).toBe("opt-out")`, o mesmo para `"parar"` e para `"SAIR"`.
- **Verificação**: o teste passa no código atual e falha com o mutante M8 (inverter as linhas 69–70 numa cópia descartada); `git diff baf2594..HEAD -- n8n/src/gate.mjs n8n/src/__tests__/gate.test.ts` continua vazio.

### Fix 2 — Documentação (Minor)

Remover a duplicação do `tasks.md`, completar Status/Evidence da T13, atualizar o Handoff do `STATE.md` e o título do teste de `principal-modelo.test.ts:149`. Emendar OPTSEG-01 AC2 (gap 1).

---

## Requirement Traceability

| Requisito | Status |
| --- | --- |
| OPTMED-01 | ✅ Verificado |
| OPTREG-01 | ✅ Verificado (estrutural; desfecho real na T18) |
| OPTAMB-01 | ✅ Verificado (estrutural; desfecho real na T18) |
| OPTSEG-01 | ✅ Verificado, com gap de precisão no AC2 |
| OPTKEY-01 | ❌ Precisa de correção (AC3) |
| OPTMSG-01 | ✅ Verificado |
| OPTPROVA-01 | ⏸️ Pendente de execução humana (T18) |
| OPTDOC-01 | ✅ Verificado |

---

## Summary

**Overall**: ❌ Not Ready — um fix pequeno (Fix 1) e a T18 separam o lote do fechamento.

**Spec-anchored**: 32/33 ACs de OPTMED/OPTREG/OPTAMB/OPTSEG/OPTKEY/OPTMSG/OPTDOC com evidência que bate com o outcome; 1 sem evidência (OPTKEY-01 AC3); 3 gaps de precisão; OPTPROVA-01 (5 ACs, 1 documental cumprido) pendente de execução humana.
**Sensor**: 14/15 mortos (M8 sobreviveu).
**Gate**: 125 arquivos / 2.111 testes, 2 falhas conhecidas e aceitas; lint 0 erros.

**Próximos passos**: Fix 1 → nova verificação; depois a T18 por conversa real, que é a condição de fechamento definitivo.
