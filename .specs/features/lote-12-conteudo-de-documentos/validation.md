# Lote 12 — Conteúdo de documentos chega ao agente — Validação (ciclo 3, final)

**Data**: 2026-09-26
**Spec**: `.specs/features/lote-12-conteudo-de-documentos/spec.md`
**Diff range**: lote inteiro `085221b..8421412`; correções deste ciclo `356c954..8421412` (2 commits: `52bb14a` T46, `8421412` T47)
**Verificador**: subagente independente (autor ≠ verificador). A evidência foi re-derivada e nada foi aceito só pela narrativa das tasks.
**Ciclo**: 3 de 3 (último do laço correção → reverificação).

---

## Veredito

**Result**: PASS ✅

**PASS ✅, com uma ressalva registrada.** Os dois mutantes que sobreviveram no ciclo 2 agora morrem, cada um pelo teste escrito para ele:

- **MA2** (`workflows/process-document.ts:53`, o workflow volta a chamar `processDocumentStep` direto) derruba `workflows/__tests__/process-document.test.ts:33`.
- **M22** (`src/server/actions/documents.ts:126`, a edição deixa de reconciliar) derruba `src/server/__tests__/actions.test.ts:1349`.

Os 5 mutantes do ciclo 2 que refiz como regressão também morreram. O gate Build passou inteiro: 116 arquivos e 1.872 testes, 21 do Workflow, lint com 0 erros e build verde.

**Ressalva (não bloqueante)**: a evidência de DOCTXT-01 AC4 na costura é **estrutural**. O teste lê o texto do fonte e não executa o workflow. Ela mata a regressão de uma linha que o ciclo 2 apontou. Uma sonda exploratória mostra o limite: um desvio de duas linhas inserido **antes** da linha fixada sobrevive (detalhe no Sensor). Aceito a evidência porque o próprio Fix 7 do ciclo 2 a previa como "alternativa mínima", desde que a ausência do teste de ponta a ponta viesse justificada, e a justificativa veio. O que falta para a prova completa está em "Avaliação de T46".

---

## Ciclos anteriores (resumo)

| Ciclo | Commit do relatório | Diff | Veredito | Sobreviventes |
| --- | --- | --- | --- | --- |
| 1 | `c9c55b0` | `085221b..c52c3b4` | FAIL: 5 ACs ❌, 4 de 12 mutantes vivos (M3, M5, M6, M9) | Correções T38–T45 |
| 2 | `356c954` | `c9c55b0..b6d9287` | FAIL: 0 ❌, 14 de 16 mortos; vivos MA2 (costura workflow → abandono) e M22 (reconciliação na mudança de modalidade) | Correções T46–T47 |
| 3 | este | `356c954..8421412` | **PASS** | nenhum no conjunto contado |

Os relatórios completos dos ciclos 1 e 2 ficam no histórico do git (`git show c9c55b0:…/validation.md`, `git show 356c954:…/validation.md`).

---

## Gaps do ciclo 2: estado

| Gap | Correção | Evidência | Estado |
| --- | --- | --- | --- |
| MA2 — DOCTXT-01 AC4, costura `processDocumentWorkflow → processWithTerminalFailure` | T46 (`52bb14a`) | `workflows/__tests__/process-document.test.ts:38` — `expect(workflowBody).toContain("return processWithTerminalFailure(input, processDocumentStep, abandonDocumentStep);")`; `:39` — `not.toMatch(/return processDocumentStep\(/)`. Mutante MA2 morto por esse teste | ✅ Fechado (evidência estrutural, ver ressalva) |
| M22 — DOCLIM-01 AC8, gatilho "mudança de modalidade" | T47 (`8421412`) | `src/server/__tests__/actions.test.ts:1349-1356` — `updateDocumentAction({ …, modality: "ambos" })` `resolves.toEqual({ ok: true })` e `lifecycleRow(deFora.id)` `resolves.toMatchObject({ modality: "ambos", status: "pronto" })`, dentro de `withGenerousCeiling` (`:1309`), que restaura tetos e estados. Mutante M22 morto por esse teste | ✅ Fechado |

A refatoração para `withGenerousCeiling` manteve o teste da exclusão (`actions.test.ts:1337`) com a mesma asserção. M9 continua morto por ele.

---

## Avaliação de T46 como evidência de DOCTXT-01 AC4

**Conclusão: aceitável, com ressalva.** Os três elos de AC4 ("erro, timeout ou indisponibilidade → `falha`, original preservado, mensagem segura") ficam guardados assim:

1. **Serviço**: `abandon` grava `falha`/`processamento_indisponivel` com mensagem segura no mesmo attempt (`processing.test.ts:229-239`, ciclo 2). Os mutantes M21 e MA morrem.
2. **Orquestrador**: `processWithTerminalFailure` converte a exceção final em abandono (`process-document.test.ts:21-26`). O mutante MA morreu de novo neste ciclo.
3. **Costura**: o corpo do workflow chama o orquestrador com os dois steps (`:33-40`). O mutante MA2 morre.
4. **Semântica do SDK**: a premissa de que a exaustão de retries de um step chega ao corpo do workflow como exceção capturável está documentada em `node_modules/workflow/docs/foundations/errors-and-retries.mdx`: `maxRetries` padrão 3, e `try/catch` em volta da chamada do step observa a falha, como no padrão de rollback. A premissa não tem teste próprio, e é a mesma que o código assume.

**Sobre a justificativa**: ela está correta no essencial. Um erro desconhecido do storage vira `storage_invalido`, falha permanente e não retry (`processing.ts:160-162`). Só `DocumentStorageError("transient")` vira retry, e o adapter só o produz a partir de `BlobServiceNotAvailable`, `BlobServiceRateLimited` e `BlobRequestAbortedError` (`vercel-blob-storage.ts:37-47`). A justificativa, porém, está **incompleta**. A exaustão também vem de `extracao_transitoria`/`timeout` do extrator e de qualquer exceção inesperada, que `process` relança (`processing.ts:201-204`, T45). Nenhum desses caminhos, porém, é mais fácil de forçar no harness sem injeção: pede um extrator que estoure o timeout ou um banco que falhe no meio do step. A imprecisão não muda a conclusão.

**Limite observado**: o teste é textual. Ele falha em refatorações equivalentes (falso alarme, que é seguro) e deixa passar um desvio acrescentado antes da linha fixada (sonda P1 abaixo, sobreviveu).

**O que faltaria para a prova completa** (não exigido neste lote): um teste de harness com `start(processDocumentWorkflow, [input])` para um documento `processando` real, com o step forçado a lançar até esgotar `maxRetries`. O teste asseriria `run.returnValue` igual a `{ kind: "failed", code: "processamento_indisponivel" }` e a linha em `falha`. O caminho mais barato é tornar o serviço do step injetável no ambiente de teste, por exemplo com um storage de teste selecionado por variável de ambiente só no `vitest.workflow.config.ts`, que lance `DocumentStorageError("transient")`. Fica como item de backlog, não como gap deste lote.

---

## Spec-Anchored Acceptance Criteria — ACs reavaliados neste ciclo

| AC | Resultado definido pela spec | Evidência (`arquivo:linha` — asserção) | Ciclo 2 → Ciclo 3 |
| --- | --- | --- | --- |
| DOCTXT-01 AC4 | Erro, timeout ou indisponibilidade → `falha`, original preservado, mensagem segura | Serviço `processing.test.ts:229-239`; orquestrador `workflows/__tests__/process-document.test.ts:21-26` — `toEqual({ kind: "failed", code: "processamento_indisponivel" })` e `abandon toHaveBeenCalledWith(JOB)`; costura `:38-39`; despacho `processing.integration.test.ts:93` — `status: "falha"` | ⚠️ → ✅ (costura por evidência estrutural) |
| DOCLIM-01 AC8 | Exclusão, expiração **ou mudança de modalidade** → reavalia e promove o que couber | Exclusão `actions.test.ts:1337-1347`; expiração `maintenance.integration.test.ts:359-374`; mudança de modalidade `actions.test.ts:1349-1356` — `toMatchObject({ modality: "ambos", status: "pronto" })` | ⚠️ → ✅ (3 de 3 gatilhos guardados) |

Os demais ACs seguem como no ciclo 2. O gate está verde e nenhum teste foi removido: de 1.871 para 1.872 testes, de 20 para 21 no Workflow.

**Contagem (71 ACs)**: ✅ 64 · ⚠️ 7 · ❌ 0. Os 7 ⚠️ são os herdados e não bloqueantes, sem reclassificação:
- DOCBIN-01 AC1 (limites 1 byte e exatamente 10 MB);
- DOCBIN-01 AC2 (10 MB vs 10 MiB);
- DOCBIN-01 AC6 (mesmo nome sem asserção direta);
- DOCBIN-01 AC9 (download em `processando` não discrimina estado);
- DOCLIM-01 AC1 (benchmark operacional);
- DOCVIEW-01 AC9 (inércia operacional);
- DOCPROVA-01 AC4 (parcial operacional).

---

## Discrimination Sensor

Profundidade **P0** (integridade de estado e isolamento entre tenants). O scratch foi um `git worktree` descartável de `8421412` no scratchpad da sessão, com junction para o `node_modules` real. O vitest rodou do diretório do repositório com `--root <worktree>`, sem ler nem copiar `.env`. Tudo rodou em série, depois do gate: nenhum vitest em paralelo. Cada mutante foi desfeito com `git checkout -- .` no scratch antes do próximo, e conferi em cada um que o teste que falhou era o esperado.

| # | Arquivo:linha | Mutação | Testes | Teste que falhou | Resultado |
| --- | --- | --- | --- | --- | --- |
| MA2 | `workflows/process-document.ts:53` | `return processDocumentStep(input);` no lugar do orquestrador | Workflow (21) | "o workflow durável delega ao orquestrador…" | ✅ Morto (1/21) |
| M22 | `src/server/actions/documents.ts:126` | edição sem `reconcileTenantDocumentAdmission` | `actions.test.ts` (81) | "mudança de modalidade reconcilia a admissão do tenant" | ✅ Morto (1/81) |
| MA | `workflows/process-document.ts:45` | abandono vira `throw` | Workflow (21) | "falha final do step vira falha terminal no mesmo attempt" | ✅ Morto (regressão) |
| M9 | `src/server/actions/documents.ts:148` | exclusão sem reconciliar | `actions.test.ts` | "exclusão reconcilia a admissão do tenant" | ✅ Morto (regressão) |
| M5 | `src/server/documents/repository.ts:32` | `findDocumentForDownload` sem `eq(tenantId)` | `access-finders.integration.test.ts` | "documento de outro tenant é inexistente…" | ✅ Morto (regressão) |
| M14 | `src/server/documents/processing.ts:234` | remove o ramo `active` do retry | `processing.test.ts`, `processing.integration.test.ts` | 3 testes, incluindo "no máximo uma execução (DOCTXT-01 AC7)" | ✅ Morto (regressão) |
| M15 | `src/server/documents/repository.ts:507` | remove a emissão de `document_corpus_over_ceiling` | `repository.test.ts` | "corpus acima do teto emite o gatilho de RAG…" | ✅ Morto (regressão) |

**Resultado**: 7 injetadas, **7 mortas**, 0 sobreviventes → PASS ✅.

**Sonda exploratória (fora da contagem)**:

| # | Arquivo:linha | Mutação | Resultado |
| --- | --- | --- | --- |
| P1 | `workflows/process-document.ts:53` (inserção antes) | `if (input.attempt > 1) return await processDocumentStep(input);` antes da linha fixada | ⚠️ Sobreviveu (21/21 verdes) |

Deixei P1 fora da contagem porque não é a regressão de uma linha que o laço mandou guardar. É um desvio deliberado em duas linhas, e mostra o teto de uma asserção textual. Fica registrada como a ressalva do veredito e como item de backlog, sem virar tarefa de correção.

**Isolamento**: comparei `git status --porcelain` da árvore real antes e depois, e as duas saídas são idênticas: ` M .env.example`, uma alteração do usuário que já existia. Desfiz a junction com `rmdir` antes de `git worktree remove --force`. O `node_modules` real ficou intacto, e `git worktree list` mostra só a árvore principal.

---

## Gate Check

- **Comandos** (tasks.md → Build, mais a config do Workflow), cada um rodado sozinho: `npm test`, `npx vitest run -c vitest.workflow.config.ts`, `npm run lint`, `npm run build`.
- **`npm test`**: exit 0. 116 arquivos, **1.872 passaram**, 0 falhas, 0 skips, em 941 s. Bate com a referência do orquestrador.
- **Workflow**: 1 arquivo, **21 passaram** (+1 da T46).
- **`npm run lint`**: exit 0, com 0 erros e os mesmos 7 avisos do ciclo 2.
- **`npm run build`**: exit 0, com `workflows build complete (6 steps, 1 workflow)` e "Compiled successfully". Os avisos de `BETTER_AUTH_SECRET` padrão vêm do ambiente local.
- **Integridade**: o ciclo 2 tinha 116 arquivos e 1.871 testes (Workflow 20); o ciclo 3 tem 116 e 1.872 (Workflow 21). São **+1 teste em cada suíte** (T47 e T46). O teste de exclusão foi refatorado para o helper e manteve a mesma asserção. Nenhum teste foi removido ou enfraquecido.
- **`tsc --noEmit`**: dívida conhecida e aceita (59 erros, todos em testes). Não re-litigada.

---

## Code Quality (diff do ciclo)

| Princípio | Status | Nota |
| --- | --- | --- |
| Código mínimo / cirúrgico | ✅ | Só dois arquivos de teste e tasks.md; nenhum código de produção mudou. |
| Sem scope creep | ✅ | — |
| Segue padrões | ✅ | `withGenerousCeiling` remove a duplicação entre os dois testes de AC8. |
| Asserção casa com a spec | ✅ | AC8: `status: "pronto"` e a nova modalidade gravada. |
| Cobertura por camada | ✅ com ressalva | A costura do workflow é coberta por asserção estrutural, não por execução. |
| Todo teste mapeia um AC | ✅ | Os nomes citam DOCTXT-01 AC4 e DOCLIM-01 AC8. |
| Diretrizes | ✅ | `coding-principles.md`. |

Riscos herdados, sem AC violado: R1 (`completeDocumentProcessing` grava `pronto` antes de reconciliar), R3 (o orquestrador captura também `FatalError` do step e grava `falha` segura) e R4 (um retry concorrente responde `ok` e o documento pode terminar em `falha`).

---

## Backlog sugerido (não bloqueante)

- **B1**: teste de harness de exaustão real do step no workflow, com storage transitório injetável só no ambiente de teste. Fecharia a sonda P1 e a premissa 4 da avaliação de T46.
- **B2**: corrigir o comentário do teste T46 (`process-document.test.ts:28-32`), que deveria citar também o extrator transitório e o erro inesperado como fontes de exaustão.

---

## Requirement Traceability Update (sugerido; não aplicado)

| Requirement | Status atual | Novo status sugerido |
| --- | --- | --- |
| DOCBIN-01 | Implementing | ✅ Verified (⚠️ herdados não bloqueantes: AC1, AC2, AC6, AC9) |
| DOCTXT-01 | Implementing | ✅ Verified (AC4 com costura por evidência estrutural; B1 no backlog) |
| DOCCTX-01 | Implementing | ✅ Verified |
| DOCLIM-01 | Implementing | ✅ Verified (AC8 com os 3 gatilhos; AC1 operacional) |
| DOCVIEW-01 | Implementing | ✅ Verified (AC9 operacional) |
| DOCLIFE-01 | Implementing | ✅ Verified |
| DOCPROVA-01 | Implementing | ✅ Verified (evidência operacional; ressalva T35 aceita) |

---

## Summary

**Overall**: ✅ Ready, com a ressalva sobre a costura de AC4.

**Spec-anchored check**: 64/71 ✅, 7 ⚠️ herdados, 0 ❌.
**Sensor**: 7/7 mortos, mais 1 sonda exploratória que sobreviveu (P1, fora da contagem).
**Gate**: 1.872 passaram em 116 arquivos; Workflow 21; lint com 0 erros; build verde.
**validate_state.py**: exit 0 ("0 error(s) across [lote-12-conteudo-de-documentos]").

**Pendências aceitas pelo usuário, não re-litigadas**: oferta de corretor repetida (T35, adiada); provas em produção (SPEC_DEVIATION); `tsc` com 59 erros só em testes; plano Vercel Hobby. As capturas visuais do papel corretor (T23–T27) são pendência operacional, porque dependem de login do usuário. Não são falha de código.

**Lições**: nenhuma candidata nova. A única falha observada neste ciclo foi P1, que é o mesmo padrão já registrado em L-040 (o entrypoint precisa ser guardado pela execução, não só pelo helper). Não houve promoção, penalização nem exclusão (AD-028).
