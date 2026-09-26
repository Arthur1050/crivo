# Lote 12 — Conteúdo de documentos chega ao agente — Validação (ciclo 2)

**Data**: 2026-09-26
**Spec**: `.specs/features/lote-12-conteudo-de-documentos/spec.md`
**Diff range**: lote inteiro `085221b..b6d9287`; correções deste ciclo `c9c55b0..b6d9287` (8 commits, T38–T45, `main`, já publicada)
**Verificador**: subagente independente (autor ≠ verificador); evidência re-derivada, nada aceito por narrativa.
**Ciclo**: 2 de no máximo 3 (correção → reverificação).

---

## Veredito

**Result**: FAIL ❌

**FAIL ❌**, por margem estreita. As seis frentes do ciclo 1 foram corrigidas e cinco delas estão fechadas com teste discriminante. O gate Build passa (116 arquivos, 1.871 testes; Workflow 20; lint 0 erros; build verde). Das 16 mutações do sensor, 14 morreram. As **duas sobreviventes** caem em costuras que o próprio ciclo 1 mandou cobrir:

1. **MA2: a ligação do workflow com o abandono terminal não tem teste** (DOCTXT-01 AC4, o bloqueador do ciclo 1). Trocar `processDocumentWorkflow` para voltar a `return processDocumentStep(input)` (`workflows/process-document.ts:53`) deixa os 20 testes do Workflow verdes. Os testes cobrem só o helper `processWithTerminalFailure` com dependências injetadas. Hoje o código está correto, mas uma regressão de uma linha traria de volta o `processando` eterno sem nenhum teste falhar. A nota da T38 reconhece a lacuna ("não tem teste de harness").
2. **M22: a reconciliação na mudança de modalidade não tem teste** (DOCLIM-01 AC8). Remover `reconcileTenantDocumentAdmission` de `updateDocumentAction` (`src/server/actions/documents.ts:126`) deixa os 80 testes de `actions.test.ts` verdes, e esse é o único arquivo que exercita a action. O Fix 3 do ciclo 1 pedia o teste da exclusão **e** o da mudança de modalidade; a T40 só entregou o da exclusão.

Ambas são lacunas de teste; o comportamento atual está correto. Cada correção cabe num teste só.

---

## Ciclo 1 (resumo) e o que mudou

O ciclo 1 (commit `c9c55b0`, diff `085221b..c52c3b4`, relatório completo no histórico do git) deu FAIL com 5 ACs ❌ e 4 mutantes sobreviventes (M3, M5, M6, M9) em 12. As correções vieram nas tasks T38–T45 (Phase 7 de tasks.md):

| Gap do ciclo 1 | Correção | Estado no ciclo 2 |
| --- | --- | --- |
| 1. Retries esgotados deixavam `processando` para sempre (DOCTXT-01 AC4) | T38: `processWithTerminalFailure` + `abandonDocumentStep` → `service.abandon` (CAS no mesmo attempt); T43 eliminou `dispatch_failed` (outro `processando` órfão) | ⚠️ **Comportamento fechado, costura aberta**: MA, M21 morrem, mas MA2 sobrevive |
| 2. Filtro de tenant de preview/download sem teste (DOCVIEW-01 AC5; M5/M6) | T39: `access-finders.integration.test.ts` no banco | ✅ Fechado (M5, M6 mortas) |
| 3. Expiração não reconciliava; fiação da exclusão sem teste (DOCLIM-01 AC8; M9) | T40: `expireDocuments` reconcilia por tenant; testes de expiração e exclusão | ⚠️ **Expiração e exclusão fechadas** (M13, M9 mortas); **mudança de modalidade aberta** (M22 sobrevive) |
| 4. Margem de produção do teto sem teste (DOCLIM-01 AC2; M3) | T41: teste fixa `DEFAULT_CEILING_POLICY` | ✅ Fechado (M3 morta) |
| 5. Recusa de duplicata não identificava o existente (DOCBIN-01 AC4) | T42: `existingName` no preflight/409, `documentName` no commit concorrente, mensagem única | ✅ Fechado (M19, M20 mortas) |
| 6a. Reprocesso concorrente com duas execuções (DOCTXT-01 AC7) | T43: ramo `active` não chama `start()` | ✅ Fechado (M14 morta) |
| 6b. Gatilho mensurável de RAG (DOCLIM-01 AC12) | T44: `findCorpusOverflow` + evento `document_corpus_over_ceiling` | ✅ Fechado (M15, M16 mortas) |
| 6c. Log estruturado de processamento (DOCTXT-01 AC10) | T45: linha `document_processing` com etapa, duração, IDs e código | ✅ Fechado (M17, M18 mortas) |

---

## Task Completion

| Task | Status | Notas |
| --- | --- | --- |
| T1–T22, T28–T36 | ✅ Done | Como no ciclo 1. O gate confirma que nada regrediu. |
| T23–T27 | ⚠️ Pendência operacional | Faltam as capturas do papel **corretor** na UI, que dependem de um segundo login do usuário. Não é falha de código. |
| T37 | ✅ Done | Verifier do ciclo 1 executado. |
| T38 | ⚠️ Parcial | Helper e serviço testados. A ligação `processDocumentWorkflow → processWithTerminalFailure` não tem teste (MA2). |
| T39, T41–T45 | ✅ Done | Evidência abaixo. |
| T40 | ⚠️ Parcial | Expiração e exclusão testadas. Mudança de modalidade sem teste (M22). |

---

## Spec-Anchored Acceptance Criteria — ACs reavaliados

Só entram os ACs que estavam ❌ ou ⚠️ no ciclo 1 e foram tocados pelas correções. Os ACs ✅ do ciclo 1 continuam cobertos: o gate está verde e nenhum teste foi removido.

| AC | Resultado definido pela spec | Evidência (`arquivo:linha` — asserção) | Ciclo 1 → Ciclo 2 |
| --- | --- | --- | --- |
| DOCBIN-01 AC4 | No máximo um aceito **e** a outra resposta identifica o documento existente | Preflight de hash confirmado: `src/server/documents/__tests__/uploads.test.ts:421` — `toEqual({ kind: "duplicate_upload", existingName: "politica-confirmada.txt" })`. Envio em curso: `uploads.test.ts:187` — `existingName: "contrato-em-envio.txt"`. Commit concorrente: `uploads.test.ts:449-453` — `{ kind: "duplicate_content", documentId: winner.id, documentName: winnerName }`. Rota: `upload-route.test.ts:212` — `toEqual({ error: "duplicate_upload", existingName: "politica.pdf" })`. Mensagem ao usuário: `upload-client.test.ts:83-89` — `"…cadastrado nesta imobiliária como “politica-de-locacao.pdf”…"`. O nome é lido com `eq(tenantId)` (`repository.ts:226-251`); AC5 (outro tenant `ready`) segue verde | ❌ → ✅ |
| DOCTXT-01 AC4 | Erro, timeout ou indisponibilidade → `falha`, original preservado, mensagem segura | Serviço: `processing.test.ts:229-237` — `abandon` → `{ kind: "failed", code: "processamento_indisponivel" }`, `complete` com `processingAttempt: 4, status: "falha", failureMessage: "Não foi possível processar agora. Tente novamente."`; `:239` — attempt substituído fica `stale`. Orquestrador: `workflows/__tests__/process-document.test.ts:20-25` — `processWithTerminalFailure(JOB, throws, abandon)` → `toEqual({ kind: "failed", … })` e `abandon toHaveBeenCalledWith(JOB)`. Despacho do retry: `processing.integration.test.ts:93` — `status: "falha"` após 3 `start` falhos, nunca `processando` órfão. **Costura sem teste**: `workflows/process-document.ts:53` (MA2 sobrevive) | ❌ → ⚠️ (comportamento correto, regressão não guardada) |
| DOCTXT-01 AC7 | No máximo uma execução; mesmo estado observável nas duas respostas | Banco: `processing.integration.test.ts:90` — `kinds.sort() toEqual(["active","scheduled"])`, attempts `[2, 2]`, `start toHaveBeenCalledTimes(1)`. Unidade: `processing.test.ts:116-126` — `start` 1×. Estado observável da action: `actions.test.ts:1345-1349` — `toEqual([{ ok: true }, { ok: true }])` e `processingAttempt: 2` | ⚠️ → ✅ |
| DOCTXT-01 AC10 | Etapa, duração, IDs e erro sanitizado; nunca binário nem texto | `processing.test.ts:183-191` — `toHaveBeenCalledWith({ event: "document_processing", tenantId, documentId, attempt: 1, stage: "concluir", outcome: "completed", code: null, durationMs: expect.any(Number) })`; etapa de parada (`extrair`, `abrir_original`); `:210-217` — `code: "erro_inesperado"` e `not.toContain("secreto")`; `:219-226` — `not.toContain("conteúdo canônico")` e `not.toContain("documents/v1/object-1")` | ⚠️ → ✅ |
| DOCLIM-01 AC2 | Reservas e margem documentadas e aplicadas | `context-ceiling.test.ts:128-142` — `DEFAULT_CEILING_POLICY toEqual({ …, safetyFactor: 0.8, … })` | ⚠️ → ✅ |
| DOCLIM-01 AC8 | Exclusão, **expiração ou mudança de modalidade** → reavalia e promove o que couber | Expiração: `maintenance.integration.test.ts:359-374` — vencido `toBeUndefined()`, `fora_do_agente` → `toMatchObject({ status: "pronto" })`. Exclusão: `actions.test.ts:1309-1336` — `deFora` → `status: "pronto"`. **Mudança de modalidade**: `actions/documents.ts:126` chama a reconciliação, mas nenhum teste falha sem ela (M22) | ❌ → ⚠️ (2 de 3 gatilhos guardados) |
| DOCLIM-01 AC12 | Corpus acima do teto → registrar gatilho mensurável, sem RAG | Puro: `context-budget.test.ts:30-39` — `toEqual([{ modality: "novo", corpusBytes, ceilingBytes: 200, excludedDocuments: 1 }, { modality: "ambos", … }])`; `:41`, `:46` (teto zero não conta); `:52-57` (sem nome/conteúdo). Emissão: `repository.test.ts:311-323` — `toContainEqual(objectContaining({ event: "document_corpus_over_ceiling", tenantId: TENANT_C, modality: "ambos", ceilingBytes: 300, excludedDocuments: 1 }))` | ❌ → ✅ |
| DOCVIEW-01 AC3 | `processando`/`falha` sem preview | `access-finders.integration.test.ts:74-81` — preview `toBeNull()` para `processando` e `falha`, `toEqual({ status: "fora_do_agente", … })` para fora. O teste de rota tautológico (`preview-route.test.ts:43`, aviso de lint) continua lá, mas o predicado agora tem guarda no banco | ⚠️ → ✅ |
| DOCVIEW-01 AC5 | Outro tenant → inexistente, sem metadado | `access-finders.integration.test.ts:50-54` — `findDocumentForDownload(TENANT_B, doc.id) resolves.toBeNull()` e o mesmo para `findDocumentTextPreview` | ❌ → ✅ |
| DOCVIEW-01 AC7 | Expirado/excluído → recusa | `access-finders.integration.test.ts:56-66` — excluído e `expiresAt == NOW` → `toBeNull()` nos dois finders; `:68-72` validade futura entrega | ⚠️ → ✅ |
| DOCLIFE-01 AC3 | Bloqueio no instante de `expiresAt` em contexto, preview e download | Contexto (ciclo 1) + rotas via finders: `access-finders.integration.test.ts:62-66` | ⚠️ → ✅ |

**ACs ⚠️ do ciclo 1 que não foram alvo desta rodada** (continuam como estavam, sem reclassificação): DOCBIN-01 AC1 (limites 1 byte e exatamente 10 MB), AC2 (10 MB vs 10 MiB), AC6 (mesmo nome sem asserção direta), AC9 (download em `processando` não discrimina estado); DOCLIM-01 AC1 (benchmark operacional); DOCVIEW-01 AC9 (inércia operacional); DOCPROVA-01 AC4 (parcial operacional). Nenhum deles bloqueia.

**Contagem (71 ACs)**: ✅ 62 · ⚠️ 9 (7 herdados não bloqueantes + DOCTXT-01 AC4 e DOCLIM-01 AC8, ambos com mutante sobrevivente) · ❌ 0.

---

## Discrimination Sensor

Profundidade **P0** (integridade de estado e isolamento entre tenants): 16 mutações comportamentais num `git worktree` descartável de `b6d9287` (scratchpad da sessão), com junction para `node_modules`. O vitest rodou do diretório do repositório com `--root <worktree>`, sem ler nem copiar `.env`. Tudo em série: o `npm test` terminou antes do sensor e nada rodou em paralelo. Cada mutante foi desfeito com `git checkout` no scratch antes do próximo.

| # | Arquivo:linha | Mutação | Testes rodados | Resultado |
| --- | --- | --- | --- | --- |
| MA | `workflows/process-document.ts:45` | abandono vira `throw` (o mutante do `processando` eterno) | config Workflow (20) | ✅ Morto (1 falha) |
| MA2 | `workflows/process-document.ts:53` | workflow volta a `return processDocumentStep(input)`, sem `processWithTerminalFailure` | config Workflow (20) | ❌ **Sobreviveu** |
| M21 | `src/server/documents/processing.ts` (`abandon`) | abandono grava `attempt + 1` (quebra o CAS no mesmo attempt) | `processing.test.ts` | ✅ Morto |
| M3 | `src/server/documents/context-ceiling.ts:70` | `safetyFactor: 0.8` → `1` | `context-ceiling.test.ts` | ✅ Morto |
| M5 | `src/server/documents/repository.ts:32` | `findDocumentForDownload` sem `eq(tenantId)` | `access-finders.integration.test.ts` | ✅ Morto |
| M6 | `src/server/documents/repository.ts:44-45` | `findDocumentTextPreview` sem `eq(tenantId)` | `access-finders.integration.test.ts` | ✅ Morto |
| M9 | `src/server/actions/documents.ts:148` | exclusão sem `reconcileTenantDocumentAdmission` | `actions.test.ts` | ✅ Morto |
| M22 | `src/server/actions/documents.ts:126` | edição/mudança de modalidade sem `reconcileTenantDocumentAdmission` | `actions.test.ts` (único que usa `updateDocumentAction`) | ❌ **Sobreviveu** |
| M13 | `src/server/integration/lgpd.ts:90` | expiração sem reconciliar | `maintenance.integration.test.ts` | ✅ Morto |
| M14 | `src/server/documents/processing.ts:234` | remove o ramo `active` (o concorrente volta a despachar) | `processing.test.ts`, `processing.integration.test.ts` | ✅ Morto (3 falhas) |
| M15 | `src/server/documents/repository.ts:507` | remove a emissão de `document_corpus_over_ceiling` | `repository.test.ts` | ✅ Morto |
| M16 | `src/server/documents/context-budget.ts:78` | remove a exceção do teto zero | `context-budget.test.ts` | ✅ Morto |
| M17 | `src/server/documents/processing.ts:199` | remove a emissão do log de processamento | `processing.test.ts` | ✅ Morto (3 falhas) |
| M18 | `src/server/documents/processing.ts:203` | log do erro inesperado carrega `error.message` | `processing.test.ts` | ✅ Morto |
| M19 | `src/server/documents/repository.ts:236` | preflight de documento confirmado devolve `existingName: null` | `uploads.test.ts` | ✅ Morto |
| M20 | `src/server/documents/repository.ts:251` | preflight de envio em curso devolve `existingName: null` | `uploads.test.ts` | ✅ Morto |

**Resultado**: 16 injetadas, 14 mortas, 2 sobreviventes (MA2, M22) → **FAIL ❌**.
**Isolamento**: `git status --porcelain` da árvore real antes e depois: idêntico (` M .env.example`, alteração prévia do usuário). A junction foi desfeita antes de `git worktree remove --force`; `node_modules` real intacto; `git worktree list` só mostra a árvore principal.

---

## Gate Check

- **Comandos** (tasks.md → Build), cada um sozinho: `npm test`, `npx vitest run -c vitest.workflow.config.ts`, `npm run lint`, `npm run build`.
- **`npm test`**: 116 arquivos, **1.871 passaram**, 0 falhas, 0 skips (948 s). Bate com a referência do orquestrador.
- **Workflow**: 1 arquivo, **20 passaram** (eram 17 no ciclo 1; +3 da T38).
- **`npm run lint`**: exit 0; 0 erros, 7 avisos (os mesmos do ciclo 1, incluindo `preview-route.test.ts:43`).
- **`npm run build`**: exit 0; `workflows build complete (6 steps, 1 workflow)`, com o novo `abandonDocumentStep`; "Compiled successfully". Os avisos de `BETTER_AUTH_SECRET` padrão são do ambiente local.
- **Integridade**: ciclo 1 com 115/1.848, ciclo 2 com 116/1.871: **+1 arquivo, +23 testes**. Os testes alterados (`processing*.test.ts`, `uploads.test.ts`, `upload-route.test.ts`) ficaram mais estritos, não mais fracos. Os casos `dispatch_failed` foram reescritos porque o estado deixou de existir por decisão da T43, e a nova asserção exige `falha` em vez de `processando`.
- **`tsc --noEmit`**: dívida conhecida e aceita (59 erros só em testes). Não foi re-litigada.

---

## Code Quality

| Princípio | Status | Nota |
| --- | --- | --- |
| Código mínimo / cirúrgico | ✅ | 23 arquivos, correções localizadas; `dispatchReserved` reaproveita o despacho inicial em vez de duplicar. |
| Sem scope creep | ✅ | Nenhuma busca vetorial; o gatilho de RAG só registra o fato. |
| Segue padrões | ✅ | Logger injetável e eventos JSON em uma linha, como no resto do código. |
| Asserção casa com a spec | ✅ | Valores exatos (código, mensagem, `existingName`, contagem de `start`). |
| Cobertura por camada | ❌ | Duas costuras sem teste (MA2, M22). |
| Todo teste mapeia um AC | ✅ | Os nomes citam T/AC. |
| Diretrizes | ✅ | `coding-principles.md`. Sem UI nova além da mensagem, que vem de `src/lib/duplicate-document.ts`. |

Riscos observados, sem AC violado:
- **R1 (herdado)**: `completeDocumentProcessing` grava `pronto` antes de reconciliar. Continua valendo.
- **R3 (novo, menor)**: `processWithTerminalFailure` captura qualquer erro, inclusive `FatalError` do step, e grava `falha` segura. É coerente com AC4. Registro para ciência.
- **R4 (novo, menor)**: se quem reserva o retry esgota as três tentativas de despacho, o pedido concorrente (`active`) já respondeu `{ ok: true }` e o documento termina em `falha`. A página atualiza e mostra o estado real. Aceitável.

---

## Fix Plans

### Fix 7 — Testar a costura workflow → abandono terminal (Major; fecha MA2, DOCTXT-01 AC4)
- **Causa**: os testes chamam `processWithTerminalFailure` diretamente; nada exercita `processDocumentWorkflow` numa falha final do step.
- **Tarefa**: um teste de harness em `workflows/__tests__/process-document.test.ts` que faça `start(processDocumentWorkflow, [input])` para um documento `processando` real cujo step falhe até esgotar os retries. Por exemplo, storage que o adapter classifica como transitório, ou um `storageKey` que provoque erro. O teste assere o resultado `{ kind: "failed", code: "processamento_indisponivel" }` e o documento em `falha` no banco. Se o harness não permitir forçar a falha, a alternativa mínima é um teste que prove que `processDocumentWorkflow` delega a `processWithTerminalFailure`, com mock do módulo ou asserção estrutural do fonte. Nesse caso, registrar por que não há teste de ponta a ponta.
- **Verificar**: MA2 morre.

### Fix 8 — Testar a reconciliação na mudança de modalidade (Minor; fecha M22, DOCLIM-01 AC8)
- **Tarefa**: em `actions.test.ts`, espelhar o teste da exclusão (`:1309`). Com tetos folgados, `updateDocumentAction` troca a modalidade de um documento e um `fora_do_agente` do mesmo tenant vira `pronto`. Restaurar tetos e estados ao final, como o teste existente faz.
- **Verificar**: M22 morre.

---

## Requirement Traceability Update (sugerido; não aplicado)

| Requirement | Status atual | Novo status sugerido |
| --- | --- | --- |
| DOCBIN-01 | Implementing | ✅ Verified (AC4 fechado; ⚠️ herdados não bloqueantes) |
| DOCTXT-01 | Implementing | ❌ Needs Fix (AC4: costura do workflow, MA2) |
| DOCCTX-01 | Implementing | ✅ Verified |
| DOCLIM-01 | Implementing | ❌ Needs Fix (AC8: gatilho de mudança de modalidade, M22) |
| DOCVIEW-01 | Implementing | ✅ Verified |
| DOCLIFE-01 | Implementing | ✅ Verified |
| DOCPROVA-01 | Implementing | ✅ Verified (evidência operacional; ressalva T35 aceita) |

---

## Summary

**Overall**: ❌ Not Ready. Faltam dois testes de costura; nenhum defeito de comportamento foi encontrado.

**Spec-anchored check**: 62/71 ✅, 9 ⚠️, 0 ❌.
**Sensor**: 14/16 mortas (sobreviventes: MA2, M22).
**Gate**: 1.871 passaram (116 arquivos), Workflow 20, lint 0 erros, build verde.
**validate_state.py**: exit 1, "validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify" (esperado para FAIL).

**O que foi fechado neste ciclo**: `falha` terminal após retries e após despacho esgotado; isolamento de tenant e de estado dos finders provado no banco; expiração e exclusão reconciliam a admissão; margem de produção fixada; duplicata identificada pelo nome do mesmo tenant até a mensagem ao usuário; execução única no reprocesso concorrente; gatilho de RAG e log de processamento sem conteúdo.

**Pendências aceitas, não re-litigadas**: oferta de corretor repetida (T35); provas em produção (SPEC_DEVIATION); `tsc` com 59 erros só em testes; plano Vercel Hobby. As capturas do papel corretor (T23–T27) são pendência operacional, porque dependem de um segundo login do usuário.

**Próximo passo**: Fixes 7 e 8 (um teste cada) e o ciclo 3 de reverificação, o último antes de escalar ao usuário.

**Lições candidatas registradas neste ciclo**: L-040 (MA2: um helper testável não guarda o entrypoint que deveria chamá-lo). M22 repete a candidata L-036 do ciclo 1, na mesma feature. Por isso não gerou lição nova, e a recorrência não conta para promoção. Nenhuma lição foi promovida, penalizada ou apagada (AD-028).
