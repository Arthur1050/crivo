# Validation: lote-13b-opt-out-por-palavra — PASS

**Veredito**: PASS com ressalvas (nenhuma AC sem evidência; 4 mutantes sobreviventes, todos em código herdado fora da superfície do diff e cobertos pela prova real em produção; gaps ranqueados abaixo, nenhum bloqueante).
**Data**: 2026-10-07
**Spec**: `.specs/features/lote-13b-opt-out-por-palavra/spec.md`
**Diff range**: `850817a~1..c5eac28` (main, 12 commits) + hotfix `0688deb..fea3306` (branch `hotfix/opt-out-so-sair`)
**Verifier**: sub-agente independente (autor ≠ verificador), checklist de `references/validate.md`

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1 | ✅ Done | 850817a; `evidence/paridade-e3e25681.md` |
| T2 | ✅ Done | f3859b5; desvio aceito (asserções de "parar" invertidas, registrado em `tasks.md:14`) |
| T3 | ✅ Done | abe244a (+ 7d9da63, correção da auditoria) |
| T4 | ✅ Done | b9282aa |
| T5 | ✅ Done | 204ea94; os 9 arquivos listados não existem mais no main |
| T6 | ✅ Done | b8a2cc0; AD-038 em `.specs/STATE.md:339-345` |
| T7 | ✅ Done | fea3306 no branch de hotfix |
| T8 | ✅ Done | 395cbfd; produção conferida por mim (abaixo) |
| T9 | ⚠️ Done, registro incompleto | `tasks.md:296` ainda diz `HASH_T9` (placeholder); o commit é c5eac28 |

---

## Spec-Anchored Acceptance Criteria

### SAIR-01 — Turno sem classificador

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
| --- | --- | --- | --- |
| AC1 sem `textClassifier`, um único modelo de chat | 0 nós `textClassifier`; só `OpenAI Chat Model`, ligado ao `AI Agent` | `n8n/workflows/__tests__/principal-sem-classificador.test.ts:56` `expect(...filter(textClassifier)).toEqual([])`; `:61` `expect(models.map(n=>n.name)).toEqual(["OpenAI Chat Model"])`; `:62` aresta `ai_languageModel` → `AI Agent`. Produção: `0B1nqjODu7xuYYKF` 65 nós, um `lmChatOpenAi`, 0 `textClassifier` (lido pelo MCP) | ✅ PASS |
| AC2 turno chama só o modelo do agente | Nenhuma chamada a modelo além do agente | Só produção prova. Execuções 3479 e 3491 (lidas por `get_execution`): `executionData.metadata` só tem `OpenAI Chat Model` (2 sub-runs do próprio agente) e `Postgres Chat Memory`; nenhum nó de classificador. Estrutural: `principal-sem-classificador.test.ts:83` `mainTargets(MEMORY_READY,0)` = só o system message; `:87` predecessor único | ✅ PASS (produção) |
| AC3 linguagem natural → agente, sem CRM | Rota `conversa`; nenhum `POST /opt-out` | `n8n/src/__tests__/gate.test.ts:36` `detectOptOut("quero sair do apartamento")` → `false`; `:129-130` texto comum → `"conversa"`; `principal-sem-classificador.test.ts:105` `predecessors(POST_OPT_OUT)` = `[SWITCH]` (nenhum caminho natural). Produção: exec 3491 sem nó de POST de opt-out, `optedOutAt` nulo (`evidence/prova-real.md:9`) | ✅ PASS · ⚠️ spec-precision: a frase-exemplo da spec ("não quero mais receber mensagens") não aparece em nenhum teste unitário |
| AC4 descadastrado e condução humana com o mesmo roteamento | `somente-registrar` | `gate.test.ts:63` (optedOutAt + "sair") `toBe("somente-registrar")`; `:72`, `:82`; `gate.test.ts:106`, `:116` escalado; `n8n/src/__tests__/gate-conducao-humana.test.ts:20`, `:30`, `:51-52`; nó real: `n8n/workflows/__tests__/principal-conducao-humana.test.ts:117-118` `runCode(GATE)` → `route` `"somente-registrar"`. Produção: exec 3509 `somente-registrar` | ✅ PASS (ver mutantes M11h3/M13b sobreviventes) |

### SAIR-02 — Opt-out pela palavra exata "sair"

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
| --- | --- | --- | --- |
| AC1 "sair" normalizado → POST + confirmação única | rota `opt-out`; `POST /api/v1/leads/{id}/opt-out`; 1 mensagem | `gate.test.ts:6`, `:10`, `:14`, `:18-19` (`"Saír"`, `" SAIR "`) `toBe(true)`; `gate.test.ts:89` `toBe("opt-out")`; `principal-sem-classificador.test.ts:93` caso 0 → POST; `:97-101` POST → finalizar → purgas → envio fixo; `:119-121` método `POST`, URL `/leads/{{ $('Code: gate')...id }}/opt-out`; `n8n/workflows/__tests__/principal-outgoing-channel.test.ts:22` `expect(finalized.mensagens).toEqual([<confirmação>])` (array de 1). Produção: exec 3504 rota `opt-out`, POST com `optedOutAt` gravado, `mensagens` com 1 item | ✅ PASS |
| AC2 "parar" → agente, sem opt-out | `detectOptOut` false; rota `conversa` | `gate.test.ts:23-24` `toBe(false)`; `gate.test.ts:99` `toBe("conversa")`; `gate-opt-out-escalado.test.ts:18` e `gate-conducao-humana.test.ts:42` `toBe("somente-registrar")` (com trava). Produção: exec 3479 `text:"parar"` → `route:"conversa"` | ✅ PASS |
| AC3 "sair" dentro de frase → agente | `false` / `conversa` | `gate.test.ts:36` `toBe(false)`; `gate-conducao-humana.test.ts:46` ("quero sair do aluguel", exemplo literal da spec) `toBe("somente-registrar")`; `gate-opt-out-escalado.test.ts:26` | ✅ PASS |
| AC4 texto de `OPT_OUT_CONFIRMATION` igual ao publicado, também no CRM | string exata | `n8n/src/__tests__/opt-out-intent.test.ts:6-8` `toBe("Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!")`; `src/server/chats/__tests__/human-opt-out.test.ts:172` igualdade byte a byte com `OPT_OUT_CONFIRMATION`; `:176`. Produção exec 3504: mesmo texto em `Code: finalizar opt-out` | ✅ PASS |

### SAIR-03 — Orientação do agente preservada

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
| --- | --- | --- | --- |
| AC1 orientação idêntica à de `e3e25681` | sha256 `57229cd4…605b3` | `principal-sem-classificador.test.ts:130-132` `toBe("57229cd48902f46bb66b66a48d9479ddf3ac7f47ff275beb36de5d084bf605b3")`; `:137` nó inlina `system-message.mjs`; `n8n/src/__tests__/system-message-opt-out.test.ts:35` saída byte a byte do baseline. Recalculado por mim: mesmo hash em 0688deb, HEAD, fea3306 **e** no `jsCode` publicado em `ddb63ae8` | ✅ PASS |
| AC2 pedido natural → agente orienta "sair" sem dizer que parou | resposta do agente orientando `sair` | Só produção prova. Exec 3491 (`get_execution`): `response_ai_agent` orienta responder com a palavra sair, sozinha, sem afirmar que parou; nenhum POST. `evidence/prova-real.md:9` | ✅ PASS (produção) |

### SAIR-04 — Medição e lock removidos

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
| --- | --- | --- | --- |
| AC1 sem workflow/script/corpus/placar/testes/lock | arquivos ausentes, sem referência ativa | Os 9 arquivos de `tasks.md:196` não existem (`test -e`); `git grep` de `medicao-opt-out|opt-out-score|opt-out-corpus|opt-out-measurement|buildClassifierInput|refineOptOutCategory|assertApprovedIdentity|classifierIdentity` em `n8n/ scripts/ src/ package.json` só acha a lista de nomes removidos em `principal-sem-classificador.test.ts:68-77` | ✅ PASS (resíduos só em comentários, ver gaps 4-5) |
| AC2 `crivo-medicao-opt-out` arquivado | arquivado | MCP `get_workflow_details n5iAMCl5nSM6jA6U` → "is archived and cannot be accessed"; `search_workflows "medicao"` → 0 | ✅ PASS (produção) |
| AC3 AD que supersede AD-032 e restaura AD-018/AD-026 | AD registrada e status emendados | `.specs/STATE.md:340` (AD-038 Decision: "Supersede a AD-032, restaura a exclusividade do gate da AD-018 e o escopo de modelo único da AD-026"); `.specs/STATE.md:296` AD-032 `superseded by AD-038`; `:182` AD-018 `amended by AD-038`; `:246` AD-026 `amended by AD-038` | ✅ PASS · ⚠️ ver gap 6 (D11) |

### SAIR-05 — Hotfix em produção com prova real

| Criterion | Spec-defined outcome | `file:line` + asserção | Result |
| --- | --- | --- | --- |
| AC1 paridade `e3e25681` ≡ gerado de `0688deb` antes de publicar | equivalente, ou parar | `evidence/paridade-e3e25681.md:3` "EQUIVALENTE" com método e hashes; `rollback-e3e25681.json` salvo | ✅ PASS (evidência; não refeito contra `e3e25681`) |
| AC2 única diferença = classificador + "parar"; `versionId` = `activeVersionId` | `ddb63ae8` = `ddb63ae8` | MCP: `versionId` = `activeVersionId` = `ddb63ae8-f02f-4e6a-a1b6-3cb05d4b229b`, ativo, 65 nós, `activeVersion.nodes` = rascunho. Paridade refeita por mim (gerado de fea3306 carregado com `toJSON()` × publicado, publicado ⊆ gerado módulo defaults do n8n): 65 = 65, conexões iguais (ordem normalizada), única diferença de texto o escape `̀-ͯ` em `Code: finalizar opt-out` (já existente em e3e25681). `git diff 0688deb fea3306` toca só `gate.mjs`, `principal.ts` (fonte e gerado) e testes; os hunks de `n8n/workflows/principal.ts` são os mesmos do main, exceto a linha de `agent-state` que só existe no L14b | ✅ PASS |
| AC3 prova real dos três casos | 5a sem opt-out; 5b orientação "sair"; 5c opt-out com uma confirmação | `evidence/prova-real.md:7-10`; conferi 3479 (`parar` → `conversa`, agente respondeu), 3491 (orientação "sair", sem POST), 3504 (`sair` → `opt-out`, POST com `optedOutAt`, 1 confirmação) | ✅ PASS (ressalva: purga de `n8n_chat_histories` não lida diretamente, `prova-real.md:20`) |
| AC4 mesma mudança no main | main sem classificador | `principal-sem-classificador.test.ts:56`, `:61`, `:83` no main; `n8n/workflows/__tests__/principal-modelo.test.ts:61-62` (91 nós / 114 conexões) | ✅ PASS |

**Status**: ✅ 17/17 ACs com evidência `file:line` ou produção conferida; 2 ⚠️ spec-precision (SAIR-01 AC3 exemplo não testado; SAIR-04 AC3/D11 ambíguo).

---

## Edge Cases

- [x] CRM recusa o `POST /opt-out` → tratamento atual: `principal-sem-classificador.test.ts:108-114` (`retryOnFail` true, `maxTries` 3, `waitBetweenTries` 2000, `onError` undefined, saída única para `Code: finalizar opt-out`). Mutantes M9f1/f2/f3 mortos.
- [x] Lead já descadastrado envia "sair" → `gate.test.ts:57-63` `somente-registrar`; `gate-opt-out-escalado.test.ts:30`; `gate-conducao-humana.test.ts:51`. Produção: exec 3509.
- [x] "Sair" com acento/espaços → `gate.test.ts:17-20`, `:31-32`. Mutantes M3b/M4b mortos.

---

## Discrimination Sensor

Cópia isolada: `git worktree add --detach <scratchpad>/wt HEAD` + junction de `node_modules`; testes com `npx vitest run <arquivos>` no worktree; junction removida com `rmdir` antes de `git worktree remove --force`. Baseline de testes no scratch: 9 arquivos / 104 testes verdes.

| # | File (alvo) | Mutação | Killed? | Teste que matou |
| --- | --- | --- | --- | --- |
| M1a | `n8n/src/gate.mjs:11` | recoloca `"parar"` em `OPT_OUT_KEYWORDS` | ✅ (4) | `gate.test.ts:23`, `:99`; `gate-opt-out-escalado.test.ts:18`; `gate-conducao-humana.test.ts:42` |
| M2b | `gate.mjs:37` | igualdade → `includes` | ✅ (4) | `gate.test.ts:28`, `:36`; `gate-conducao-humana.test.ts:46`; `gate-opt-out-escalado.test.ts:26` |
| M3b | `gate.mjs:21` | remove `.trim()` | ✅ (4) | `gate.test.ts:19`, `:32`; `gate-conducao-humana.test.ts:38`; `gate-opt-out-escalado.test.ts:22` |
| M4b | `gate.mjs:21` | remove a remoção de acento | ✅ (2) | `gate.test.ts:14`, `:18` |
| M4c | `gate.mjs:37` | ignora pontuação final | ✅ (1) | `gate.test.ts:28` |
| M5 | `gate.mjs:71-72` | opt-out antes de `optedOutAt` (2ª confirmação) | ✅ (3) | `gate.test.ts:63`; `gate-conducao-humana.test.ts:51`; `gate-opt-out-escalado.test.ts:30` |
| M6c1 | `n8n/workflows/principal.ts:2202` | checkpoint → `aiAgentTurnWired` (pula system message) | ✅ (5) | `principal-sem-classificador.test.ts:83`, `:87`; `principal-modelo.test.ts`; `principal-outgoing-channel.test.ts` |
| M6c2 | `principal.ts:2202` | checkpoint → outro nó antes do system message | ✅ (4) | `principal-sem-classificador.test.ts:83`, `:87` |
| M7d1 | `principal.ts:2202` | reintroduz `textClassifier` + 2º `lmChatOpenAi` | ✅ (7) | `principal-sem-classificador.test.ts:56`, `:61`, `:79`, `:83` |
| M7d2 | `principal.ts` | 2º `lmChatOpenAi` num agente extra | ✅ (3) | `principal-sem-classificador.test.ts:61`; `principal-modelo.test.ts` |
| M8e | `n8n/src/opt-out-intent.mjs:10` | "Até mais!" → "Até mais." | ✅ (2) | `opt-out-intent.test.ts:6`; `principal-outgoing-channel.test.ts` (paridade fonte/gerado) |
| M9f1 | `principal.ts:691` | `maxTries` 3 → 2 | ✅ (1) | `principal-sem-classificador.test.ts:111` |
| M9f2 | `principal.ts:692` | `waitBetweenTries` 2000 → 1000 | ✅ (1) | `principal-sem-classificador.test.ts:112` |
| M9f3 | `principal.ts:689` | `onError: "continueRegularOutput"` | ✅ (1) | `principal-sem-classificador.test.ts:113` |
| M10g | `n8n/src/system-message.mjs:103` | "sozinha" → "sozinho" | ✅ (8) | `principal-sem-classificador.test.ts:130`; `system-message-opt-out.test.ts:35` |
| M11h1 | `principal.ts:2215-2216` | troca `onCase(0)`/`onCase(1)` | ✅ (2) | `principal-sem-classificador.test.ts:93`; `principal-outgoing-channel.test.ts` |
| M12 | `principal.ts:723` | confirmação enviada 2 vezes | ✅ (1) | `principal-outgoing-channel.test.ts` (paridade); `:22` cobre o gerado |
| M11h2 | `principal.ts:664` | regra 0 do Switch `"opt-out"` → `"optout"` ("sair" cai no fallback e é descartado) | ❌ Sobreviveu (780+13 testes de `n8n/` e `n8n-inline`) | nenhum — código herdado |
| M11h3 | `principal.ts:665` | regra 1 `"somente-registrar"` → `"conversa"` | ❌ Sobreviveu | nenhum — código herdado |
| M13b | `principal.ts:649` | `Code: gate` passa `optedOutAt: null` | ❌ Sobreviveu | nenhum — código herdado |
| M13c | `principal.ts:649` | `Code: gate` trunca `text` | ❌ Sobreviveu | nenhum — código herdado |
| M13 | `principal.ts:649` | `text` = junção do buffer | equivalente para mensagem única; descartado | — |

**Sensor depth**: expandido (≥5; opt-out é caminho LGPD).
**Resultado**: 17/17 mortos no código novo do lote. Sondagem extra no código herdado do caminho: 4 sobreviventes, porque nenhum teste avalia as regras do `Switch: rota (gate)` nem roda `Code: gate` com `text`/`optedOutAt` (a superfície do diff não mexe nessas linhas; a prova real 3479/3504/3509 cobre o comportamento publicado).
**Isolamento**: `git status --porcelain` da árvore real idêntico ao baseline (3 arquivos `M` em `n8n/generated/` pré-existentes); worktree de scratch removido; worktree do hotfix sem alteração. Observação: `scripts/__tests__/n8n-inline.test.ts` regravou `n8n/generated/principal.ts` no scratch durante o sensor, o que pode explicar os `M` pré-existentes em `n8n/generated/` na árvore real.

---

## Conferências extras

- Hash da orientação (CRLF→LF): `57229cd4…605b3` em 0688deb, HEAD, fea3306 e no `jsCode` publicado.
- Produção: `0B1nqjODu7xuYYKF` ativo, `versionId` = `activeVersionId` = `ddb63ae8-f02f-4e6a-a1b6-3cb05d4b229b`, 65 nós, `OPT_OUT_KEYWORDS = new Set(["sair"])`, sem referência a `opt-out (natural)`; `n5iAMCl5nSM6jA6U` arquivado.
- Atribuição: 0 ocorrências de `Co-Authored-By`/"Generated with" em `origin/main..HEAD` (13 commits, autor único) e em `0688deb..origin/hotfix/opt-out-so-sair`. `HEAD` não está em `origin/main` (main não enviado); `origin/hotfix/opt-out-so-sair` = fea3306.
- Evidências: sem segredo, token ou credencial; o único telefone é o número de teste do roteiro (em comentário de código dentro de `rollback-e3e25681.json`); nenhum texto de lead real. `.env` não foi lido.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code / surgical changes | ✅ (gate: 1 linha; principal: remoção + 1 aresta) |
| No scope creep | ✅ |
| Matches patterns | ✅ |
| Spec-anchored outcome check | ✅ com 2 ⚠️ |
| Per-layer Coverage Expectation (módulo 1:1, grafo por AC) | ⚠️ grafo não cobre as regras do Switch nem a chamada de `gate()` no `Code: gate` (gaps 1-2) |
| Every test maps to a requirement | ✅ |
| Documented guidelines followed: `AGENTS.md`, `CLAUDE.md`, `vitest.config.ts` | ✅ |

---

## Gate Check

- **Full** (`npm test`, rodado pelo orquestrador, não repetido): 200 arquivos / 3412 testes, exit 0.
- **Quick no scratch**: 9 arquivos / 104 testes verdes antes das mutações; 793 testes verdes na varredura larga.
- **Contagem**: caiu por decisão da spec (`spec.md:39`): removidos `principal-classificador`, `principal-opt-out-natural`, `medicao-opt-out`, `opt-out-score`, `opt-out-corpus`, `opt-out-measurement` e a maior parte de `opt-out-intent.test.ts`. Asserções de "parar" foram invertidas, não enfraquecidas (desvio aceito, `tasks.md:14`).
- **Skipped**: nenhum conhecido.

---

## Gaps ranqueados (nenhum bloqueante)

1. **Médio — regras do `Switch: rota (gate)` sem teste** (M11h2, M11h3 sobreviventes). SAIR-02 AC1 / SAIR-01 AC4. `n8n/workflows/principal.ts:664-667`. Fix: asserir em `principal-sem-classificador.test.ts` que `rules.values[i].conditions.conditions[0].rightValue` é `["opt-out","somente-registrar","midia","conversa"]` na ordem dos `onCase`, ou avaliar a regra com `route` de exemplo.
2. **Médio — `Code: gate` não é executado com `text`/`optedOutAt`** (M13b, M13c sobreviventes). Spec SAIR-01 "Independent Test: Code nodes do gate roteando os casos acima". `principal.ts:649`. Fix: em `principal-conducao-humana.test.ts` (que já tem `runCode(GATE)`), rodar o nó com `text:"sair"` → `opt-out`, `text:"parar"` → `conversa`, `text:"não quero mais receber mensagens"` → `conversa`, `optedOutAt` preenchido + `"sair"` → `somente-registrar`.
3. **Baixo — doc ativa contradiz AD-038**: `n8n/README.md:464` ainda diz "A palavra exata `sair`/`parar` continua vencendo a marca".
4. **Baixo — comentários ativos citam o classificador como vigente**: `n8n/src/system-message.mjs:106-112` ("Só o pedido explícito descadastra (pelo classificador, antes do agente)") e `src/server/documents/benchmark-identity.ts:33`. Comentários fora da constante hasheada; trocá-los não mexe no texto publicado.
5. **Baixo — `tasks.md:296` com `HASH_T9`** em vez de c5eac28.
6. **Baixo (spec-precision) — D11**: `.specs/STATE.md:296` diz que "a emenda D11 sai", enquanto `spec.md:23` e a própria AD-038 (`STATE.md:340`) mantêm o texto do system message que é produto da D11. Fix: reescrever o status da AD-032 para dizer que sai a parte de roteamento da D11 e o texto do system message fica.
7. **Baixo (spec-precision) — SAIR-01 AC3**: a frase-exemplo da spec não tem teste unitário; coberta por propriedade (igualdade exata) e pela exec 3491. Entra no fix do gap 2.
8. **Informativo — hotfix**: o teste do branch de hotfix (`fea3306`) não tem as asserções do POST acrescentadas depois em 7d9da63; o publicado foi conferido diretamente (retry 3 / 2000 / sem `onError`).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| SAIR-01 | Implemented (T3) | ✅ Verified (gap 2 recomendado) |
| SAIR-02 | Implemented (T2, T4) | ✅ Verified (gap 1 recomendado) |
| SAIR-03 | Implemented (T3); AC2 na T9 | ✅ Verified |
| SAIR-04 | Implemented (T5, T6, T8) | ✅ Verified (gaps 3, 4, 6 de documentação) |
| SAIR-05 | Implemented (T7, T8, T9) | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready, com ressalvas.
**Spec-anchored check**: 17/17 ACs com evidência; 2 spec-precision gaps.
**Sensor**: 17/17 mortos no código do lote; 4 sobreviventes no código herdado do mesmo caminho (gaps 1-2).
**Gate**: 3412 passaram (Full do orquestrador).

**Next steps**: fix tasks opcionais para os gaps 1-2 (testes de grafo) e 3-6 (documentação) antes do principal do L14b ser publicado.
