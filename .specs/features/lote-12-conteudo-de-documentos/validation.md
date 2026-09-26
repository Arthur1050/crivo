# Lote 12 — Conteúdo de documentos chega ao agente — Validação

**Data**: 2026-09-25
**Spec**: `.specs/features/lote-12-conteudo-de-documentos/spec.md`
**Diff range**: `085221b..c52c3b4` (76 commits, `main`, já publicada)
**Verificador**: subagente independente (autor ≠ verificador); evidência re-derivada, nada aceito por narrativa.
**Relatório anterior**: cobria só a Phase 2 (T7–T12, `16e4685..d4fe4d8`, PASS); preservado no histórico do git (`d5a4981`) e substituído por este.

---

## Veredito

**Result**: FAIL ❌

**FAIL ❌**. O gate Build passa (115 arquivos, 1.848 testes; lint 0 erros; build verde) e a prova conectada em produção é sólida. O veredito cai por três lacunas de comportamento e de teste, uma delas de integridade de estado:

1. **Documento pode ficar em `processando` para sempre** (DOCTXT-01 AC4 e edge case de indisponibilidade). Erro transitório, timeout ou extrator/storage indisponível viram `RetryableError`; esgotados os retries do Workflow, nenhum código grava `falha`. O retry da UI só existe em `falha`, então o usuário não tem saída.
2. **Isolamento cross-tenant de preview e download não tem guarda automatizada** (DOCVIEW-01 AC5). Remover o predicado de tenant de `findDocumentForDownload` e `findDocumentTextPreview` sobreviveu à suíte completa. O código atual está correto e a produção provou 404 em T32, mas nada impede a regressão.
3. **Expiração não reavalia `fora_do_agente`** (DOCLIM-01 AC8). Exclusão e mudança de modalidade chamam a reconciliação; a expiração não. E a chamada da exclusão pode ser removida sem nenhum teste falhar.

---

## Task Completion

| Task | Status | Notas |
| --- | --- | --- |
| T1–T22 | ✅ Done | Evidência por tarefa em tasks.md; gates reproduzidos abaixo. |
| T23–T27 | ⚠️ Parcial | Implementação e testes puros ok. As caixas de cenários de navegador seguem desmarcadas ("adiado para T32"). T32 cobriu fluxo de gestor; cenários do papel **corretor** na UI não têm captura (tasks.md, nota de T24). |
| T28–T32 | ✅ Done | T30/T31/T32 com SPEC_DEVIATION registrada (produção em vez de preview; `DATABASE_URL` único). |
| T33 | ⚠️ Parcial | "Execução sintética POST" desmarcada (bloqueada por corpus vazio); suprida na prática pela prova de T35 (`POST /api/v1/context 200`). Retenção de erro de 24 h é configuração de instância, não aplicada. |
| T34 | ✅ Done | Re-benchmark de 2026-09-25 registrado. |
| T35 | ✅ Done com ressalva | Aceito pelo usuário: oferta de corretor repetida uma vez após recusa; barreira determinística em "Ideias adiadas" de context.md. |
| T36 | ✅ Done | GET 405 com `Allow: POST`. |
| T37 | ⚠️ Aberto | Último item ("Verifier independente") é este relatório. |

---

## Spec-Anchored Acceptance Criteria

Legenda: ✅ asserção casa com o resultado da spec · ❌ GAP · ⚠️ spec-precision gap ou cobertura só operacional · 🔌 evidência operacional registrada em tasks.md (não é teste).

### DOCBIN-01 — Armazenar o arquivo real

| AC | Resultado definido pela spec | Evidência (`arquivo:linha` — asserção) | Resultado |
| --- | --- | --- | --- |
| 1 | Formato válido → original privado no tenant + exatamente 1 registro `processando` | `src/server/documents/__tests__/uploads.test.ts:200-217` — `expect(document).toMatchObject({ tenantId: TENANT_A, status: "processando", contentSha256: sha256(bytes), mimeType })` para PDF/DOCX/TXT/MD/CSV; `vercel-blob-storage.test.ts:86-94` — `access: "private"`, `allowOverwrite: false`; `storage.test.ts:15` — chave `documents/v1/${TENANT_ID}/…` | ✅ (⚠️ limites "1 byte" e "exatamente 10 MB" não são asseridos no próprio limite; só `+1`) |
| 2 | Zero bytes, >10 MB, formato não aceito ou tipo contraditório → recusa sem registro nem objeto | `uploads.test.ts:165-177` — `toEqual({ kind: "invalid", code: "upload_input_invalid" })` + `authorizeClientUpload` não chamado; `uploads.test.ts:354-365` (MIME divergente: `storage.delete` 1× e contagem igual); `uploads.test.ts:367-376` (assinatura PDF inválida) | ✅ (⚠️ spec diz "10 MB", código usa 10 MiB) |
| 3 | Sem `documentos:escrever` → recusa sem ler/armazenar | `uploads.test.ts:153-163` — `rejects.toMatchObject({ name: "PermissionDeniedError" })`, `authorizeClientUpload` não chamado; `upload-route.test.ts:179` | ✅ |
| 4 | Concorrência no mesmo tenant → aceita no máximo um **e identifica o documento existente na outra resposta** | "no máximo um": `uploads.test.ts:233-253` — `new Set(committedIds).size === 1`, `rows.toHaveLength(1)`. Identificação: `uploads.test.ts:423-451` devolve `documentId: winner.id` no serviço, mas `src/server/actions/documents.ts:186-191` descarta o id e o preflight (`src/server/documents/uploads.ts:252`) devolve só `duplicate_upload`; mensagem genérica em `upload-client.ts:33`. Contraria `design.md:437` e `context.md:83` | ❌ GAP (metade "identificar") |
| 5 | Mesmo binário só em outro tenant → permitido sem revelar nada | `uploads.test.ts:189-198` — ambos `ready`, `intentId` distintos; `repository.test.ts:116` | ✅ |
| 6 | Mesmo nome, conteúdo diferente → dois registros | Nenhum teste com nome fixo repetido; `inputFor` gera nome aleatório (`uploads.test.ts:84-95`). Garantia apenas estrutural: unicidade é `tenant+sha256` (`repository.test.ts:110`) | ⚠️ sem asserção direta |
| 7 | Storage falha antes do registro → erro e zero registro | `uploads.test.ts:400-409` — objeto ausente: `rejected` e `toHaveLength(0)` | ✅ |
| 8 | Registro falha após storage → remove objeto ou agenda compensação | `uploads.test.ts:454-472` (`storage.delete` 1×, intent `failed`); `uploads.test.ts:474-491` (`compensation_pending`, `storageKey` preservado); `maintenance.integration.test.ts:267` (órfão removido pela rotina) | ✅ |
| 9 | Download disponível já em `processando` | `download-route.test.ts:12` — bytes iguais (mas ver DOCVIEW AC5: o estado não influencia o mock); 🔌 T37 smoke | ⚠️ teste não discrimina estado |
| 10 | Identidade de duplicata = tenant + digest dos bytes | `uploads.test.ts:378-387` (hash recalculado divergente → `rejected`); `uploads.test.ts:411-421` (preflight por hash confirmado) | ✅ |

### DOCTXT-01 — Extrair e reprocessar

| AC | Resultado definido | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Texto válido → persiste e `pronto`/`fora_do_agente` | `processing.integration.test.ts:74` — `toMatchObject({ status: "pronto", extractedText: "texto integral" })`; `:75-81` — `status: "fora_do_agente"` com texto íntegro | ✅ |
| 2 | Unicode legível sem alterar palavras/números/sinais | `text.test.ts:49-51` — `toBe("A, 1.000,00!  mantém?")`; `extraction.test.ts:49-53,72`; 🔌 T32 (5 formatos, SHA-256 conferido) | ✅ |
| 3 | PDF só imagem / vazio → `falha` + `nenhum texto extraível` | `extraction.test.ts:54` — `toEqual({ ok: false, code: "nenhum_texto_extraivel" })`; `processing.integration.test.ts:86` — `status: "falha", failureCode: "nenhum_texto_extraivel"` | ✅ |
| 4 | Erro, **timeout ou indisponibilidade** do extrator → `falha`, original preservado, mensagem segura | Erro permanente: `extraction.test.ts:60`, `processing.test.ts:69-74` ✅. Timeout/indisponível: `extraction.test.ts:59` classifica como transitório; `processing.integration.test.ts:87` assere que **fica `processando`**; `workflows/process-document.ts:22` lança `RetryableError`; nada converte retries esgotados em `falha` (`design.md:101` previa "retries esgotados → falha") | ❌ GAP |
| 5 | `processando`/`falha` fora do contexto | `document-context.integration.test.ts:123-133` — `toHaveLength(0)` | ✅ |
| 6 | Retry de `falha` reutiliza original, `processando`, uma nova execução | `processing.integration.test.ts:89` — `{ kind: "scheduled", attempt: 2 }`, `status: "processando"`; `actions.test.ts:1305-1310` — `storageKey` preservado | ✅ |
| 7 | Retries concorrentes → **no máximo uma execução**, mesmo estado nas duas respostas | Estado: `processing.integration.test.ts:90` — attempts `[2, 2]`. Execução: sonda do verificador no scratch (mesmo arquivo, `start` mock) registrou `PROBE_START_CALLS=2`. `design.md:119` redefine "execução" como tentativa lógica; nenhum teste assere contagem de `start` | ⚠️ spec-precision gap (divergência não registrada como SPEC_DEVIATION) |
| 8 | Corretor não reprocessa | `actions.test.ts:1326-1332` — `ok: false`, `status: "falha", processingAttempt: 1` | ✅ |
| 9 | Retry com sucesso limpa erro e libera preview | `processing.integration.test.ts:88` — `failureCode: null, failureMessage: null` | ✅ |
| 10 | Registrar etapa, duração, IDs e erro sanitizado sem conteúdo | Sanitização: `processing.integration.test.ts:95` — `toBe("Não foi possível processar agora. Tente novamente.")`. Registro: só colunas `processingStartedAt`/`processedAt`/`failureCode` e o event log do Workflow (🔌 T30: run `wrun_01M3791NRDK3XQN5WDWRQMZC1R`, input só IDs). Os eventos estruturados de `design.md:452-463` não existem no código | ⚠️ parcial |

### DOCCTX-01 — Corpus elegível ao agente

| AC | Resultado definido | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Conteúdo integral de todo `pronto` elegível | `document-context.integration.test.ts:119-120` — `content toBe(conteudo)`, `contentMode toBe("full")`; `context-post.test.ts:185-188` | ✅ |
| 2 | `novo` → novo+ambos | `document-context.integration.test.ts:75`; `context-post.test.ts:188` — `toEqual([docNovoAId, docAmbosAId])` | ✅ |
| 3 | `usado` → usado+ambos | `document-context.integration.test.ts:86`; `context-post.test.ts:194` | ✅ |
| 4 | `ambos` → três, sem duplicar | `document-context.integration.test.ts:97,106-107`; `context-post.test.ts:200` | ✅ |
| 5 | `processando`/`falha`/`fora_do_agente` excluídos | `document-context.integration.test.ts:123-133` (`it.each`) — `toHaveLength(0)` | ✅ |
| 6 | `expiresAt` atingido → fora do contexto no instante | `document-context.integration.test.ts:161,172` (boundary `== now`) — `toHaveLength(0)`; mutante M10 morto | ✅ |
| 7 | Sem elegível → coleção vazia, sem erro, sem outro tenant | `document-context.integration.test.ts:191` — `toEqual({ retrievalMode: "direct", documents: [] })`; `:200-201` | ✅ |
| 8 | Perguntas diferentes → mesmo conjunto ordenado | `document-context.integration.test.ts:226` — JSON byte a byte; `context-post.test.ts:217` | ✅ |
| 9 | `question` ausente/vazia após trim → erro de validação | `context-post.test.ts:109-112` (`detail toBe("Campo 'question' é obrigatório.")`), `:117-119` (`"… não pode ser vazio."`) | ✅ |
| 10 | id + nome por documento | `document-context.integration.test.ts:235` — `toMatchObject({ id, name: "Política de comissão.pdf" })` | ✅ |
| 11 | Ordem por upload, desempate por id | `document-context.integration.test.ts:246,258` | ✅ |
| 12 | Auth/tenant inválido → recusa sem metadado/contagem | `context-post.test.ts:77-80,85-86` — 401 e `not.toContain("documents")`; `:89-96` tenant vem da credencial | ✅ |
| 13 | Workflow envia pergunta real e usa o conteúdo | `principal-consultar-documentos.test.ts:62,81-82,98,115,150` (POST, sem `$fromAI`, modalidade e buffer do lead); 🔌 T35 rodadas 1–5 (`POST /api/v1/context 200`) | ✅ |

### DOCLIM-01 — Teto sem truncamento silencioso

| AC | Resultado definido | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Benchmark registra modelo, workflow, data, tamanhos, tokens, latência, custo | 🔌 `benchmark-contexto-2026-09-23.json`, `benchmark-contexto-2026-09-25.json`; tasks.md T34 (tokens = estimativa do n8n, ressalva registrada) | ⚠️ operacional |
| 2 | Reserva prompt/histórico/pergunta/tools; fórmula e margem documentadas | `context-ceiling.test.ts:45-62` — `toBe(Math.floor(256_000 * 0.8))`, custo fixo + folga das tools. Mas o teste usa sua própria cópia da política; a margem de produção (`context-ceiling.ts:70`, `safetyFactor: 0.8`) não é asserida (mutante M3 sobreviveu) | ⚠️ |
| 3 | Tetos persistidos por tenant × modalidade | `repository.test.ts:242` — upsert por tenant/modalidade sem afetar outro | ✅ |
| 4 | `pronto` só se couber em todos os corpora aplicáveis | `context-budget.test.ts:17` — `ambos` exige caber em novo, usado e ambos | ✅ |
| 5 | Novo texto que estoura → só ele `fora_do_agente`, incumbentes mantidos | `context-budget.test.ts:15`; `processing.integration.test.ts:75-81` | ✅ (ver risco R1) |
| 6 | Documento sozinho acima do teto → `fora_do_agente` sem truncar | `context-budget.test.ts:16` | ✅ |
| 7 | `fora_do_agente` mostra razão, preview e download | `preview-route.test.ts:37-41` — `warning: "Este documento está fora do contexto…"`; `document-row-state.test.ts:98-113` | ✅ |
| 8 | Exclusão, **expiração** ou mudança de modalidade → reavalia do mais antigo ao mais recente | Algoritmo: `context-budget.test.ts:18,21`. Fiação: `actions/documents.ts:125,147` chamam `reconcileTenantDocumentAdmission`, sem teste (mutante M9 sobreviveu). Expiração: `src/server/integration/lgpd.ts:72-93` e `repository.ts:627` não reconciliam | ❌ GAP |
| 9 | Mais antigo não cabe e posterior cabe → mantém antigo fora, avalia posteriores | `context-budget.test.ts:18` | ✅ |
| 10 | Nunca corta texto nem subconjunto não sinalizado | `context-budget.test.ts:22`; `document-context.integration.test.ts:281-282` (serialização servida = medida) | ✅ |
| 11 | Mudança de modelo/workflow/prompt → benchmark desatualizado | `context-ceiling.test.ts:125-140` (`diffBenchmarkIdentity`, cada campo); `benchmark-identity.test.ts:48-68`; `repository.test.ts:296` (stale segue limitando) | ✅ |
| 12 | Corpus real acima do teto → registrar gatilho mensurável para RAG | Nenhum código ou teste registra o fato; `design.md:427` prevê "métrica explícita". Só inferível pela contagem de `fora_do_agente` | ❌ GAP (menor) |

### DOCVIEW-01 — Visualizar e baixar com isolamento

| AC | Resultado definido | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | `pronto` → texto integral no CRM | `preview-route.test.ts:29-35` — `toEqual({ status: "pronto", text: "<script>inert</script> texto integral" })`; `preview-client.test.ts:85` (500 mil caracteres) | ✅ |
| 2 | `fora_do_agente` → texto + aviso | `preview-route.test.ts:37-41` | ✅ |
| 3 | `processando`/`falha` → sem ação de preview, explica estado | `document-row-state.test.ts:93-97`. `preview-route.test.ts:43` é tautológico: o parâmetro `status` nem é usado (o lint acusa) e `find` é mockado para `null` | ✅ na UI / ⚠️ rota |
| 4 | Mesmos bytes, nome seguro, attachment | `download-route.test.ts:13` (SHA-256 igual), `:14` (`attachment`, `nosniff`); `storage.test.ts:38-59` (nome sanitizado); 🔌 T32/T37 SHA-256 em produção | ✅ |
| 5 | Outro tenant → inexistente, sem metadado | `preview-route.test.ts:50-55` e `download-route.test.ts:15` mockam `find → null`: não testam o predicado. `preview-route.test.ts:66-70` só prova que o tenant da sessão é repassado. Mutantes M5/M6 (tenant removido dos finders, `repository.ts:32,45`) sobreviveram à suíte completa. 🔌 T32: 404 idêntico a UUID inexistente | ❌ GAP de teste (comportamento atual correto) |
| 6 | Sem `documentos:ler` → recusa, sem URL/token | `preview-route.test.ts:57-64` (403, `find` não chamado); `download-route.test.ts:16` (`open` não chamado) | ✅ |
| 7 | Expirado/excluído/sem objeto → recusa segura sem parcial | Sem objeto: `download-route.test.ts:17` ✅. Expirado/excluído: mesmo padrão `find → null` (não discrimina); predicado `expiresAt > now` dos finders sem teste de banco; 🔌 T32 (404 a partir de 15:34:01) | ⚠️ |
| 8 | URL temporária ≤ 5 min | Não há URL temporária de leitura: download é stream autenticado (`app/api/documents/[id]/download/route.ts`); token de upload limitado (`vercel-blob-storage.test.ts:98-106`) | ✅ (N/A por construção) |
| 9 | Preview inerte | `preview-client.test.ts:76-83` (texto intacto) + render via `CodeBlock language="plaintext"`; 🔌 T32: DOM do dialog com 0 `<script>` e 0 `<a>` | ⚠️ operacional |

### DOCLIFE-01 — Linha, texto e arquivo como unidade

| AC | Resultado definido | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Data futura ou "sem validade" | `actions.test.ts:1219-1226` (futura), `:1238-1243` (`expiresAt toBeNull()`) | ✅ |
| 2 | Inválida ou passada → recusa preservando tudo | `actions.test.ts:1246-1252` (`expiresAt: future, extractedText: "não tocar"`), `:1255-1258` | ✅ |
| 3 | `expiresAt` → bloqueia contexto, preview e download no mesmo instante | Contexto: `document-context.integration.test.ts:172`. UI: `document-row-state.test.ts:39-45,116-120`. Rotas: sem teste de banco do predicado; 🔌 T32 | ⚠️ |
| 4 | Rotina remove registro, texto e original em ≤ 24 h (`<= now`) | `maintenance.integration.test.ts:133-150`; mutante M12 morto | ✅ |
| 5 | Falha do original na expiração → pendência e retry, inacessível | `maintenance.integration.test.ts:161-175` | ✅ |
| 6 | Exclusão manual → inacessível na hora e remoção concluída/enfileirada | `actions.test.ts:1285-1297` (tombstone limpa texto; some da listagem); `lifecycle.integration.test.ts:79` | ✅ |
| 7 | Corretor não exclui | `actions.test.ts:1277-1283` — `deletedAt toBeNull()` | ✅ |
| 8 | Exclusões concorrentes → mesmo estado ausente | `actions.test.ts:1299-1303`; `lifecycle.integration.test.ts:88` | ✅ |
| 9 | Processamento tardio não recria/reativa | `lifecycle.integration.test.ts:89`; `processing.integration.test.ts:83-84` | ✅ |
| 10 | Pendência concluída é apagada, log sanitizado | `maintenance.integration.test.ts:321-331`; `lifecycle.integration.test.ts:82` (código sanitizado) | ✅ |
| 11 | Sem efeito em outro tenant | `maintenance.integration.test.ts:343`; `lifecycle.integration.test.ts:87` | ✅ |

### DOCPROVA-01 — Prova real

| AC | Resultado definido | Evidência (🔌 operacional, tasks.md T35/T37) | Resultado |
| --- | --- | --- | --- |
| 1 | Fato exclusivo chega pelo contrato ao workflow publicado | T35 rodadas 1–5 (`POST /api/v1/context 200`, `dpl_BmjHAzRxAaFeFivvFex1V4CjwGPM`, `dpl_JJBctaCzUyJ9CD2Ac4T6RE5EYGmw`); T37 smoke (`dpl_B6bijbPPoydCnkWaTcoxjHAL6WWD`) | ✅ 🔌 |
| 2 | Resposta compatível, sem valor contraditório | T35: R$ 385,00, 4%/10 dias, 15 kg, R$ 212,40; T37: valor exato | ✅ 🔌 |
| 3 | Outro tenant não influencia | T35 rodada 1: R$ 999 (Crivo Demo) não apareceu | ✅ 🔌 |
| 4 | Estados inelegíveis não influenciam | T35 rodada 3: R$ 275 (`fora_do_agente`), 22h45 (expirado) não vazaram. `processando`/`falha` só como controles de corpus (2 em `falha`), sem pergunta dedicada registrada | ⚠️ 🔌 parcial |
| 5 | IDs verificáveis, sem credencial/corpus | Leads `5efda2b7…`, `f883cb92…`, `2be12518…`, `8d7c49c9…`, `44b62e30…`; execs 2484, 2506, 2536, 2575, 2604, 2633 | ✅ 🔌 |

**Contagem**: 71 ACs. ✅ 53 · ⚠️ 13 (inclui operacionais e spec-precision) · ❌ 5 (DOCBIN-01 AC4, DOCTXT-01 AC4, DOCLIM-01 AC8, DOCLIM-01 AC12, DOCVIEW-01 AC5).

---

## Discrimination Sensor

Profundidade **P0** (integridade de dados e isolamento entre tenants): 12 mutações comportamentais, todas num `git worktree` descartável de `c52c3b4`, com junction para `node_modules`. Os testes rodaram com `vitest run --root <worktree>` a partir do diretório do repositório (o dotenv lê o `.env` pelo cwd, sem citá-lo). Nenhuma execução em paralelo com outra.

| # | Arquivo:linha | Mutação | Testes rodados | Resultado |
| --- | --- | --- | --- | --- |
| M1 | `src/server/documents/vercel-blob-storage.ts:85` | `strongEtag` devolve o ETag fraco sem normalizar | `vercel-blob-storage.test.ts`, `uploads.test.ts` | ✅ Morto (2 falhas) |
| M2 | `src/server/documents/context-ceiling.ts:95` | faixa reprovada `break` → `continue` (teto não contíguo) | `context-ceiling.test.ts` | ✅ Morto |
| M3 | `src/server/documents/context-ceiling.ts:70` | `safetyFactor: 0.8` → `1` (teto 25% maior) | `context-ceiling.test.ts` | ❌ **Sobreviveu** |
| M4 | `src/server/documents/repository.ts:458` | teto ausente vale `Infinity` (admissão fail-open) | `repository.test.ts` | ✅ Morto |
| M5 | `src/server/documents/repository.ts:32` | `findDocumentForDownload` sem `eq(tenantId)` | **suíte completa** (115/1.848) | ❌ **Sobreviveu** |
| M6 | `src/server/documents/repository.ts:45` | `findDocumentTextPreview` sem `eq(tenantId)` | **suíte completa** (junto de M5) | ❌ **Sobreviveu** |
| M7 | `app/api/v1/context/route.ts:57` | `GET` volta a servir o handler do POST | `context-get-removed.test.ts` | ✅ Morto (3 falhas) |
| M8 | `n8n/src/system-message.mjs:364` | remove `MISSING_KNOWLEDGE_INSTRUCTION` do system message | `system-message.test.ts` | ✅ Morto (14 falhas) |
| M9 | `src/server/actions/documents.ts:147` | exclusão sem `reconcileTenantDocumentAdmission` | `actions.test.ts`, `repository.test.ts` (únicos que usam as actions) | ❌ **Sobreviveu** |
| M10 | `src/server/integration/context.ts:55` | `gt(expiresAt, now)` → `gte` | `document-context.integration.test.ts` | ✅ Morto |
| M11 | `src/server/documents/lifecycle.ts:39` | hard delete mesmo com `head` ainda achando o objeto | `lifecycle.integration.test.ts` | ✅ Morto |
| M12 | `src/server/documents/repository.ts:627` | expiração `lte` → `<` (fronteira do cron) | `maintenance.integration.test.ts` | ✅ Morto (1ª tentativa com `lt` não importado foi descartada como mutante inválido) |

**Sonda (não mutação)**: teste temporário no scratch provou que dois `retry` concorrentes chamam `start()` duas vezes (`PROBE_START_CALLS=2`), base do ⚠️ em DOCTXT-01 AC7.

**Resultado**: 12 injetadas, 8 mortas, 4 sobreviventes → **FAIL ❌**.
**Isolamento**: `git status --porcelain` da árvore real antes e depois do sensor: idêntico (` M .env.example`, alteração prévia do usuário). Worktrees removidos após desfazer as junctions; `node_modules` real intacto.

---

## Gate Check

- **Comandos** (tasks.md → Build): `npm test`, `npm run lint`, `npm run build`, cada um sozinho.
- **`npm test`**: 115 arquivos, **1.848 passaram**, 0 falhas, 0 skips (938 s, execução isolada).
- **`npm run lint`**: exit 0; 0 erros, 7 avisos (um deles, `preview-route.test.ts:43` `status` sem uso, denuncia o teste tautológico acima).
- **`npm run build`**: exit 0; `workflows build complete (5 steps, 1 workflow)`; "Compiled successfully". O build local imprime avisos de `BETTER_AUTH_SECRET` padrão na geração estática: ambiente local, não do lote.
- **Workflow (fora do `npm test`)**: `vitest run --config vitest.workflow.config.ts` — 1 arquivo, 17 testes passaram.
- **Contagem antes do lote**: 91 arquivos, 1.357 testes (`vitest list` em `085221b`, igual ao registro de T2). O "1.207" de `8ae64ec` era uma execução interrompida.
- **Contagem depois**: 115 arquivos, 1.848 testes (`vitest list` em `c52c3b4`). **Delta: +24 arquivos, +491 testes.**
- **Testes removidos/renomeados (12), todos justificados**: `routes/context-get.test.ts` (5) e `integration/__tests__/context.test.ts` (4) saíram com o contrato GET (T21/T36), substituídos por `context-post.test.ts` e `context-get-removed.test.ts`; `seed.test.ts` (3) afirmavam documentos fictícios no seed, removidos por T5 e substituídos pela asserção de coleção vazia.
- **`tsc --noEmit`**: 59 erros confirmados, todos em arquivos de teste (53 × TS2554 "Expected 2 arguments", handlers chamados sem `context`). Classificação: dívida de higiene **não bloqueante**; vitest e `next build` (que checa o código de produção) passam. Recomendo item de backlog para tipar os helpers de teste de rota.

---

## Code Quality

Diretriz: `.claude/skills/tlc-spec-driven/references/coding-principles.md`; `AGENTS.md` (Astryx) para UI.

| Princípio | Status | Nota |
| --- | --- | --- |
| Código mínimo | ✅ | `context-budget.ts` e `context-ceiling.ts` são puros e pequenos; `lifecycle.ts` tem 61 linhas. |
| Mudanças cirúrgicas | ✅ | Diff concentrado em `src/server/documents`, rotas e UI de documentos. |
| Sem scope creep | ✅ | Nada de RAG/OCR (`package.json`). |
| Segue padrões | ✅ | Handlers com dependências injetáveis como nas rotas existentes. |
| Asserção casa com a spec | ❌ | Rotas de preview/download testam o mock, não o predicado (`preview-route.test.ts:43-55`, `download-route.test.ts:12,15`). |
| Cobertura por camada (rotas: feliz + borda + erro) | ❌ | Os finders de rota não têm teste de banco; a margem de produção não é asserida. |
| Todo teste mapeia um AC | ✅ | Nomes citam T/AC. |
| Diretrizes documentadas | ⚠️ | `createDocumentAction` (metadata-only) segue exportado sem consumidor (tasks.md T23; L-021). |

Riscos observados, sem AC violado diretamente:

- **R1**: `completeDocumentProcessing` grava `pronto` antes de `reconcileTenantDocumentAdmission` (`processing.ts:129-139`). Entre os dois, um texto acima do teto é servido ao agente. Se a reconciliação lançar, o retry do step encontra o documento fora de `processando` e ela nunca reexecuta. Sugestão: admitir dentro da mesma transação da conclusão.
- **R2**: o documento preso em `processando` mantém o refresh de 3 s da página ativo indefinidamente (`processing-refresh-policy.ts`).

---

## Edge Cases

- [x] Reenvio após perder a resposta converge pelo hash: `uploads.test.ts:220-231,411-421`.
- [x] Nome com caminho/controle vira nome seguro: `storage.test.ts:38-59`; bytes intactos em `download-route.test.ts:13`.
- [x] Extração só com espaços/controles → `nenhum_texto_extraivel`: `text.test.ts:65-75`, `extraction.test.ts:52`.
- [x] Mudança de modalidade recalcula conjuntos: `actions/documents.ts:125` + `context-budget.test.ts:19-20` (fiação sem teste, ver M9).
- [ ] **Storage/extrator indisponível temporariamente → falha observável e retomada: NÃO atendido** (gap 1).
- [x] URL temporária expirada negada: não há URL de leitura; download sempre autenticado.
- [x] Cron exatamente em `expiresAt`: `maintenance.integration.test.ts:133`, M12 morto.
- [~] Documento vencido aguardando remoção inacessível em todos os caminhos: contexto e UI testados; rotas só 🔌 T32.

---

## Fix Plans

### Fix 1 — Estado terminal para retries esgotados (Blocker)
- **Causa**: `workflows/process-document.ts:22` transforma todo transitório em `RetryableError`; `processDocumentWorkflow` não trata a falha final.
- **Tarefa**: envolver o step no workflow com `try/catch` e, esgotado o `maxRetries`, gravar `falha`/`processamento_indisponivel` por CAS no mesmo attempt. Alternativa: grupo da manutenção diária que leva `processando` antigo a `falha`.
- **Verificar**: teste de workflow (harness `@workflow/vitest`) com extrator sempre transitório termina em `falha`; teste de integração da CAS.

### Fix 2 — Testes de banco para os finders de preview/download (Major)
- **Tarefa**: testes de integração de `findDocumentForDownload` e `findDocumentTextPreview` com documento de outro tenant, `deletedAt`, `expiresAt == now`, `processando` e `falha`. Trocar os `it.each` tautológicos por casos que exercitem o predicado real.
- **Verificar**: M5 e M6 passam a morrer; M10-análogo nos finders também.

### Fix 3 — Reconciliar na expiração e testar a fiação (Major)
- **Tarefa**: chamar `reconcileTenantDocumentAdmission` por tenant afetado em `expireDocuments` (`lgpd.ts:72`). Teste de action: excluir ou mudar modalidade promove um `fora_do_agente` que passa a caber; o mesmo para a rotina de expiração.
- **Verificar**: M9 morre; novo teste de expiração → promoção passa.

### Fix 4 — Asserir a política de produção do teto (Minor)
- **Tarefa**: teste que fixa `DEFAULT_CEILING_POLICY` (margem 0,8, TPM, turnos, janela). **Verificar**: M3 morre.

### Fix 5 — Identificar o documento duplicado (Minor)
- **Tarefa**: devolver nome/id do documento existente no 409 do preflight e em `duplicate_content`, e exibir "Este arquivo já está cadastrado como …" (`design.md:437`). Só dentro do mesmo tenant.

### Fix 6 — Decisões de spec pendentes (Minor, decisão do usuário)
- DOCTXT-01 AC7: aceitar "tentativa lógica" como SPEC_DEVIATION ou impedir o segundo `start()` no ramo `active` de `processing.ts:162-167`.
- DOCLIM-01 AC12 e DOCTXT-01 AC10: registrar métrica de corpus acima do teto e os eventos estruturados de `design.md:452-463`, ou emendar a spec.
- DOCBIN-01: "10 MB" vs 10 MiB; asserir 1 byte e exatamente 10 MiB aceitos.
- T23–T27: cenários visuais do papel corretor.

---

## Requirement Traceability Update (sugerido; não aplicado)

| Requirement | Status atual | Novo status sugerido |
| --- | --- | --- |
| DOCBIN-01 | Implementing | ❌ Needs Fix (AC4; AC6 sem asserção) |
| DOCTXT-01 | Implementing | ❌ Needs Fix (AC4; AC7 a decidir) |
| DOCCTX-01 | Implementing | ✅ Verified |
| DOCLIM-01 | Implementing | ❌ Needs Fix (AC8, AC12; M3) |
| DOCVIEW-01 | Implementing | ❌ Needs Fix (AC5 sem guarda; M5/M6) |
| DOCLIFE-01 | Implementing | ✅ Verified (AC3 nas rotas depende do Fix 2) |
| DOCPROVA-01 | Implementing | ✅ Verified (evidência operacional; ressalva T35 aceita) |

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 53/71 ✅, 13 ⚠️, 5 ❌.
**Sensor**: 8/12 mortas (4 sobreviventes: M3, M5, M6, M9).
**Gate**: 1.848 passaram, 0 falhas; lint 0 erros; build verde.
**validate_state.py**: exit 1 — "validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify" (esperado para FAIL).

**O que funciona**: upload privado e idempotente por hash no tenant; extração nativa dos cinco formatos com limites estruturais; contrato POST de contexto completo, ordenado e isolado, com GET removido; admissão fail-closed sem teto; exclusão por tombstone e remoção física com retry; prova conversacional real com fatos exclusivos e controles cross-tenant, expirado e fora do agente.

**Achados aceitos, não bloqueantes**: oferta de corretor repetida (T35, "Ideias adiadas"); provas conectadas em produção (SPEC_DEVIATION T30–T32); `tsc` com 59 erros só em testes; plano Vercel Hobby como gate comercial.

**Próximo passo**: rotear os Fixes 1–3 para um implementador e reverificar (máximo de 3 ciclos).

**Lições candidatas registradas** (`lessons.py add`, sem promoção nem exclusão, AD-028): L-034 (retries esgotados sem estado terminal), L-035 (finder mockado não prova isolamento), L-036 (testar cada gatilho de recomputação), L-037 (asserir default de política de produção), L-038 (design que estreita termo da spec), L-039 (recusa que deve identificar o recurso). O gap 1 repete o padrão da lição confirmada L-013 (degradação silenciosa após retries esgotados); a penalização fica a critério do usuário.
