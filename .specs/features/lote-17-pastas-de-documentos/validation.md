# Lote 17 — Validação independente de pastas de documentos

## Validation: FAIL

**Data:** 2026-11-02. **Tarefa:** T36, ciclo 3 de 3, o último antes de escalar ao usuário.
**Verificador:** sessão independente; não escreveu implementação, testes nem relatórios anteriores do lote. Os registros de `tasks.md` e o relatório do ciclo 2 foram lidos como hipóteses.
**Spec:** `.specs/features/lote-17-pastas-de-documentos/spec.md` (97 ACs e 9 Edge Cases; PABRIR-01 AC4 emendado em 2026-10-30; PAGENTE-01 AC3 acrescentado em 2026-11-02).
**Faixa:** `origin/main...HEAD`, com HEAD `1c22119` em `lote-17`. Base comum `2406f5f`; `origin/main` local em `9d24d51`, dois commits à frente dela. São 65 commits e 108 arquivos. Correções desde o ciclo 2: `95c2bc2..1c22119`.

Os cinco gaps do ciclo 2 estão fechados, e os dez alvos obrigatórios do sensor morrem por asserção. O lote não fecha por uma razão só: três mutantes sobrevivem, todos em testes que faltam, nenhum em comportamento errado. Dois são da condição nova de `updateDocumentAction` (validade e categoria, G1 e G2) e um é o segundo formatador de fuso do rótulo com data (G3). Nesses três casos, uma prova descartável confirmou que o código atual se comporta como devia e que o caso de teste que falta mata o mutante. Nenhum código, teste ou spec foi alterado.

- **97 ACs:** 96 PASS, 1 FAIL por falta de evidência versionada (PRAIZ-01 AC3, só o fuso do rótulo com data; G3), 0 pendentes.
- **9 Edge Cases:** 9 PASS.
- **Sensor:** 50 injeções. 46 mortas por asserção, 1 morta por guarda de domínio (R1), 3 sobreviventes (D3, D4, T2). Os 10 alvos de `design.md` § 9 morreram (13 de 13 injeções).
- **Recorte de testes em HEAD, no checkout real:** 22 arquivos, 474 testes, 0 falhas, 0 skips, 614 s, saída 0.
- **Gates:** `npx tsc --noEmit -p .` saída 0. `npx eslint .` saída 0, 0 erros e 9 avisos (limite 9), nenhum em arquivo do lote.
- **Full:** não executada por mim. Registro do executor em `tasks.md`: `npm test` saída 0, 250 arquivos, 4038 testes, 1196,41 s, em `f5b0b5d`, na 3ª rodada; as duas anteriores falharam por rede e pelo teste instável. `git diff f5b0b5d..HEAD` só toca `src/server/reengagement/__tests__/agent-state.test.ts` e `tasks.md`, e esse teste está no meu recorte. É hipótese compatível com o recorte, não execução minha.

## Histórico dos ciclos anteriores

**Ciclo 1 (2026-10-29), FAIL com 63 PASS, 2 FAIL e 31 pendentes em `54599b5`.**

| Gap | Como foi fechado | Conferência deste ciclo |
| --- | --- | --- |
| M9 sobrevivia, o teste de schema só lia a FK instalada | `563ae3f`: configuração Drizzle e FKs criadas pelo SQL entregue | M9, M9s, M9d e M9i morrem em `src/db/__tests__/schema-document-folders.test.ts:105` e `:141` |
| "Limpar filtros" do menu não ia à URL exata | Emenda do AC por decisão do usuário; `563ae3f` testa o `onClick` real | N6, N7, N8 e N9 morrem |
| T32, T33 e T34 sem captura | T34 feita, com 37 capturas | Sobrou o G3 do ciclo 2 |

**Ciclo 2 (2026-11-02), FAIL com 93 PASS, 2 pendentes e 1 lacuna em 96 ACs, em `285ee0b`.**

| Gap | Como foi fechado | Conferência deste ciclo |
| --- | --- | --- |
| G1: N3, N4 e N5, campo de busca sem guarda | `618498b` | Fechado. N3, N4, N4b, N4c e N5 morrem em `src/components/documents/__tests__/documents-toolbar.test.ts:129` a `:131` e `:159` |
| G2: N10, submenu Pasta e Edge Case 6 | `618498b` | Fechado. N10a, N10b e N10c morrem em `src/components/documents/__tests__/documents-toolbar.test.ts:112` |
| G3: capturas de dois ACs e do aviso em modo claro | `f5b0b5d`, capturas 38 a 41 | Fechado. As quatro abertas e citadas abaixo |
| G4: edição reconciliava o tenant ao mudar só a pasta | `04de389`, com PAGENTE-01 AC3 | Fechado para a pasta (D5 morto). A condição nova abriu G1 e G2 deste ciclo |
| G5: alvo 10 dependia do fuso da máquina | `31cb3e3`, `TZ=UTC` em `vi.hoisted` | Fechado para `civilFormatter` (T1 e M10 morrem sem variável externa). O outro formatador abriu G3 deste ciclo |

## Tarefas e limites

| Tarefas | Estado conferido |
| --- | --- |
| T1–T34 | Marcadas e sustentadas pelas evidências abaixo. O HTTP 200 da T33 é registro do executor; a evidência própria é a ausência de `notFound()` em `app/(crm)/documentos/page.tsx:107` a `:117` e a captura 28. |
| T35 | Registro em `f5b0b5d`, ver acima. |
| T36 | Este relatório, com FAIL. Os critérios de conclusão continuam abertos. |
| T37/T38 | Dependem de PASS. |

**Interrupção:** esta verificação foi interrompida por limite de uso depois do último mutante. Na retomada conferi HEAD `1c22119`, `git status --porcelain` vazio, nenhum processo do vitest e o worktree temporário sem mutante aplicado.

## Faixa de diff, superfície e integridade

- **Superfície protegida:** `git diff --exit-code --name-only origin/main...HEAD -- src/server/integration/context.ts app/api/v1 openapi.yaml n8n vitrine` saiu 0, sem nome listado.
- **Fora de pastas:** `.ao/launch.json`, `package.json`, `scripts/preview-test.mjs`, `scripts/preview-test-users.ts`, a seção de capturas de `AGENTS.md` (infraestrutura de captura), `scripts/reengagement-proof.ts` (string de dados, R1 morre) e `src/server/reengagement/__tests__/agent-state.test.ts` (abaixo).
- **Trailers (AD-014):** nos 65 commits, `git log origin/main..HEAD --format=%B` não tem `Co-Authored-By`, "Generated with" nem `Signed-off-by`, e `%(trailers:only)` não devolve nada.
- **L-055:** nos testes do diff, as linhas removidas são: duas identidades de `scripts/__tests__/test-db-push.test.ts` (desvio T2, trocadas por comportamento em `scripts/__tests__/test-db-push-steps.test.ts:15` a `:54`); imports ampliados em `src/server/__tests__/actions.test.ts` e `src/server/integration/__tests__/document-context.integration.test.ts`; e as quatro consultas de `agent-state.test.ts`, reescritas com `orderBy`. Nenhum arquivo de teste apagado; nenhum `.skip`, `.only` ou `todo` novo.
- **`79f995e`:** as duas comparações mantêm `toEqual` sobre as linhas inteiras e ganham a mesma ordem nos dois lados, então só sai a dependência da ordem física. Continua igualmente forte: alterar uma mensagem (AS1) falha em `src/server/reengagement/__tests__/agent-state.test.ts:54`, e apagar uma mensagem (AS2) falha em `:116`.
- **`04de389` contra DOCLIM-01 AC8 do L12:** não contraria. O AC exige reavaliar quando exclusão, expiração ou mudança de modalidade libera capacidade. A exclusão segue reconciliando sempre (`src/server/actions/documents.ts:167`, teste `src/server/__tests__/actions.test.ts:1383`). A modalidade segue reconciliando (`src/server/data/index.ts:2594`, teste `src/server/__tests__/actions.test.ts:1394`, D2 morto). Os dois testes antigos não mudaram: o commit só acrescenta o teste novo.
- **`git diff --check origin/main...HEAD`:** sem saída.

## Critérios de aceitação ancorados na spec

Caminhos relativos ao repositório. "Captura NN" é o arquivo de `capturas/` com esse prefixo. A coluna de desfecho resume o valor exigido pela spec; a redação integral está em `spec.md`. Reli no HEAD cada teste citado.

### PMOD-01 — Modelo de pastas

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Tabela com id UUID, tenant, nome, datas; cascata do tenant | `src/db/__tests__/schema-document-folders.test.ts:47` a `:50`, `:105` (regra `cascade`). `src/db/schema.ts:644` | PASS |
| AC2 | Índice único recusa nome igual sem diferenciar caixa | `src/db/__tests__/schema-document-folders.test.ts:45` — `toBe("23505")`, `:156`. `src/db/schema.ts:660` | PASS |
| AC3 | Mesmo nome em tenants diferentes | `src/db/__tests__/schema-document-folders.test.ts:47` — `toMatchObject({ tenantId: tenantB, name: "CONTRATOS" })` | PASS |
| AC4 | `documents.folder_id` anulável, `set null` | `src/db/__tests__/schema-document-folders.test.ts:68`, `:105`, `:141`. `src/db/schema.ts:678`. M9, M9d, M9s mortos | PASS |
| AC5 | `document_upload_intents.folder_id` anulável, `set null` | `src/db/__tests__/schema-document-folders.test.ts:69`, `:105`, `:141`. `src/db/schema.ts:744`. M9i morto | PASS |
| AC6 | Apagar pasta zera `folder_id` sem apagar linhas | `src/db/__tests__/schema-document-folders.test.ts:68`, `:69` — linha inteira igual, só `folderId: null` | PASS |
| AC7 | Apagar tenant apaga pastas | `src/db/__tests__/schema-document-folders.test.ts:78` — `toEqual([])` | PASS |

### PBANCO-01 — Schema nos bancos de teste e pronto para produção

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | SQL idempotente, em transação, nomes iguais aos do Drizzle | `src/db/__tests__/schema-document-folders.test.ts:104`, `:105`, `:114` (envelope `begin`/`commit`), `:141`, `:143`, `:146`. `scripts/__tests__/document-folders-apply.test.ts:55`, `:57`. `scripts/document-folders/schema.sql:2`, `:36` | PASS |
| AC2 | Aplica depois do push e antes da conferência | `scripts/__tests__/test-db-push-steps.test.ts:20` a `:24`; `scripts/__tests__/test-db-push.test.ts:40`. `scripts/test-db-push.ts:96` | PASS |
| AC3 | Lista cada item ausente, sai diferente de 0, não toca os seguintes | `scripts/__tests__/document-folders-apply.test.ts:37`, `:48`; `scripts/__tests__/test-db-push.test.ts:70`, `:71`; `scripts/__tests__/test-db-push-steps.test.ts:51` | PASS |
| AC4 | Duas aplicações sem erro, mesmo estado | `src/db/__tests__/schema-document-folders.test.ts:82` a `:84`, `:143` | PASS |

### PLER-01 — Leitura das pastas

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Só pastas do tenant, com os cinco campos | `src/server/data/__tests__/document-folders.test.ts:109`, `:112`. M1 morto | PASS |
| AC2 | Conta e soma só ativos do mesmo tenant | `src/server/data/__tests__/document-folders.test.ts:104` a `:110` — `fileCount: 2`, `totalSizeBytes: 3_000_000_019`. M2 morto | PASS |
| AC3 | Maior entre `updated_at` e `uploaded_at` mais recente | `src/server/data/__tests__/document-folders.test.ts:110`, `:120`. M3 morto | PASS |
| AC4 | Pasta vazia: 0, 0, `updated_at` | `src/server/data/__tests__/document-folders.test.ts:121` | PASS |
| AC5 | Collator pt-BR, empate por id | `src/server/data/__tests__/document-folders.test.ts:133`. `src/server/data/document-folders.ts:17`, `:21` | PASS |
| AC6 | Por id com o dono: `{ id, name }` | `src/server/data/__tests__/document-folders.test.ts:138` | PASS |
| AC7 | Inexistente ou de outro tenant: `null` | `src/server/data/__tests__/document-folders.test.ts:139`, `:140`. E1 morto | PASS |
| AC8 | Não UUID: `null` sem consultar | `src/server/data/__tests__/document-folders.test.ts:143`, `:144` | PASS |

### PFILT-01 — Filtro de documentos por pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Filtro `pasta`: só dela, não excluídos | `src/server/data/__tests__/documents.test.ts:213`, `:214`. E9 morto | PASS |
| AC2 | Filtro `sem-pasta`: só nulos | `src/server/data/__tests__/documents.test.ts:215` — `toEqual([rootId])`. E8 morto | PASS |
| AC3 | Sem filtro: todas e sem pasta | `src/server/data/__tests__/documents.test.ts:217` a `:219` | PASS |
| AC4 | Pasta, modalidade, categoria e busca juntas | `src/server/data/__tests__/documents.test.ts:225` — `toEqual([expectedId])`, com fixtures fora por critério | PASS |
| AC5 | Pasta de outro tenant: vazia | `src/server/data/__tests__/isolation.test.ts:286`, `:287` | PASS |
| AC6 | `folderId` na listagem | `src/server/data/__tests__/documents.test.ts:214`, `:218`, `:219`. `src/server/data/index.ts:589` | PASS |

### PCRIAR-01 — Criar pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Grava no tenant da sessão, sem espaços nas pontas | `src/server/__tests__/document-folders-actions.test.ts:87`, `:90`; `src/server/data/__tests__/document-folders.test.ts:44` | PASS |
| AC2 | `nome-invalido` com a mensagem de `validateName`, sem gravar | `src/server/__tests__/document-folders-actions.test.ts:101`, `:102`, `:104` | PASS |
| AC3 | `nome-duplicado` com a mensagem exata, sem gravar | `src/server/__tests__/document-folders-actions.test.ts:121`, `:122`, `:124` | PASS |
| AC4 | Corrida: um grava, outro `nome-duplicado` | `src/server/data/__tests__/document-folders.test.ts:46`, `:47` | PASS |

### PREN-01 — Renomear pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Grava sem espaços, atualiza data, devolve `{ id, name }` | `src/server/__tests__/document-folders-actions.test.ts:93`, `:94`; `src/server/data/__tests__/document-folders.test.ts:53`, `:54` | PASS |
| AC2 | Troca só de caixa aceita | `src/server/__tests__/document-folders-actions.test.ts:113`; `src/server/data/__tests__/document-folders.test.ts:55` | PASS |
| AC3 | Nome de outra pasta: `nome-duplicado` sem alterar | `src/server/__tests__/document-folders-actions.test.ts:123`, `:124`; `src/server/data/__tests__/document-folders.test.ts:59`, `:60` | PASS |
| AC4 | Inválido: `nome-invalido` sem alterar | `src/server/__tests__/document-folders-actions.test.ts:103`, `:104` | PASS |
| AC5 | Ausente, estrangeira ou não UUID: erro exato sem alterar | `src/server/__tests__/document-folders-actions.test.ts:130` a `:135`. E2 morto | PASS |
| AC6 | Documentos continuam na pasta | `src/server/data/__tests__/document-folders.test.ts:61` | PASS |

### PEXC-01 — Excluir pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Apaga, zera documentos e intenções, devolve contagem de ativos | `src/server/__tests__/document-folders-actions.test.ts:155` a `:157`; `src/server/data/__tests__/document-folders.test.ts:82`, `:85`, `:87` | PASS |
| AC2 | Demais campos preservados | `src/server/data/__tests__/document-folders.test.ts:85` — ativo e excluído inteiros, só `folderId: null` | PASS |
| AC3 | Ausente, estrangeira ou não UUID: erro sem alterar | `src/server/__tests__/document-folders-actions.test.ts:133`, `:135`; `src/server/data/__tests__/document-folders.test.ts:68`, `:70`. E3 morto | PASS |
| AC4 | Título e descrição para N > 1, 1 e 0, com N do cartão | Capturas 11 ("Os 3 arquivos dela voltam para Sem pasta.", cartão com 3), 13 ("O arquivo dela volta…", Financiamento com 1), 17 ("A pasta está vazia."). `src/components/documents/__tests__/folder-presentation.test.ts:95` a `:103` | PASS |
| AC5 | Cancelar mantém pasta e documentos | Captura 12: 7 pastas e Contratos com 3 arquivos. `src/components/documents/delete-folder-dialog.tsx:76` | PASS |
| AC6 | Excluir a aberta leva a `/documentos` | Captura 18: raiz, com 6 pastas. `src/components/documents/folder-header.tsx:26`, `src/components/documents/delete-folder-dialog.tsx:58` | PASS |

### PMOVER-01 — Mover documentos

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Grava em todos e devolve `movedCount` dos que mudaram | `src/server/data/__tests__/document-folders.test.ts:156`, `:158`; `src/server/__tests__/document-folders-actions.test.ts:49`, `:50`, `:52` | PASS |
| AC2 | Destino `null` deixa sem pasta | `src/server/data/__tests__/document-folders.test.ts:171`, `:172`; `src/server/__tests__/document-folders-actions.test.ts:53`, `:54` | PASS |
| AC3 | Atualiza destino e cada origem | `src/server/data/__tests__/document-folders.test.ts:161`, `:173`. E4 morto | PASS |
| AC4 | Ids repetidos valem um | `src/server/data/__tests__/document-folders.test.ts:168` | PASS |
| AC5 | Vazia, mais de 100 ou não UUID: erro exato sem alterar | `src/server/data/__tests__/document-folders.test.ts:180`, `:181`, `:186`; `src/server/__tests__/document-folders-actions.test.ts:60` | PASS |
| AC6 | Destino ausente, estrangeiro ou não UUID: erro sem alterar | `src/server/data/__tests__/document-folders.test.ts:183`, `:184`, `:186`; `src/server/__tests__/document-folders-actions.test.ts:61`. M4 morto | PASS |
| AC7 | Documento ausente, excluído ou estrangeiro: nenhum muda | `src/server/data/__tests__/document-folders.test.ts:197` a `:203`; `src/server/__tests__/document-folders-actions.test.ts:62`. M5 morto | PASS |
| AC8 | Exclusão simultânea: nunca erro lançado | `src/server/data/__tests__/document-folders.test.ts:224`, `:227`, `:228` — trava real observada. O outro desfecho decorre da FK de PMOD-01 AC6 | PASS |
| AC9 | Status, texto e elegibilidade mantidos, sem reprocessar | `src/server/data/__tests__/document-folders.test.ts:158`, com `extractedText` e `processingAttempt` na fixture (`:26`); `src/server/__tests__/document-folders-actions.test.ts:50`. Captura 23: "Pronto" depois de mover. `src/server/actions/document-folders.ts:53` a `:69` não reconcilia | PASS |
| AC10 | Diálogo com "Sem pasta", pastas e a atual selecionada; move ao confirmar | Capturas 21 (Contratos selecionada), 22 (opções, "Sem pasta" primeiro), 23 (Distrato em Sem pasta, Contratos com 2) | PASS |

### PEDIT-01 — Pasta na edição do documento

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Campo com a pasta atual selecionada, ou vazio com "Sem pasta" | Captura 39 (documento em pasta: campo "Contratos"); captura 24 (sem pasta: "Sem pasta"). `src/components/documents/edit-document-dialog.tsx:86`, `:203` a `:206` | PASS |
| AC2 | Grava junto, na mesma transação, e atualiza origem e destino | `src/server/data/__tests__/documents.test.ts:231`, `:234`, `:235`; `src/server/__tests__/actions.test.ts:1095`, `:1096`; rejeição sem gravar em `src/server/data/__tests__/documents.test.ts:245`, `:246`. Captura 25. E6 morto | PASS |
| AC3 | `folderId: null` tira da pasta | `src/server/__tests__/actions.test.ts:1099`, `:1100` | PASS |
| AC4 | Omissão mantém | `src/server/__tests__/actions.test.ts:1097`, `:1098` | PASS |
| AC5 | Pasta inválida: erro exato, sem gravar | `src/server/__tests__/actions.test.ts:1112`, `:1113`, `:1115`. E5 morto | PASS |

### PPERM-01 — Permissões

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | `documentos: escrever` nas quatro actions | `src/server/__tests__/document-folders-actions.test.ts:72`, `:145`. M6a, M6b, M6c, M6d mortos | PASS |
| AC2 | `sem-permissao` com a mensagem da guarda, sem alterar | `src/server/__tests__/document-folders-actions.test.ts:72` a `:74`, `:145` a `:148` | PASS |
| AC3 | `documentos: ler` para listar e abrir | `app/(crm)/documentos/page.tsx:62`, antes das consultas de pasta (`:70`, `:84`). Capturas 33 e 34: corretor lê e abre. Os três papéis têm leitura (`src/lib/permissions.ts:50`, `:62`, `:72`), então a recusa não tem caso alcançável por papel | PASS |
| AC4 | Esconde as escritas sem `escrever` | Capturas 32 e 34 (sem "Nova pasta", "Novo documento"), 33 (sem Renomear e Excluir), 35 (menu do documento só com "Visualizar texto" e "Baixar original") | PASS |
| AC5 | Oferece "Abrir pasta" e "Copiar link" | Captura 33 | PASS |
| AC6 | Tenant sempre pela sessão | `src/server/__tests__/document-folders-actions.test.ts:90`. `src/server/actions/document-folders.ts:22`, `:35`, `:47`, `:58`; nenhuma entrada traz tenant | PASS |

### PAGENTE-01 — O agente não enxerga a pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Superfície do agente sem mudança | Comando de diff acima, saída 0 e lista vazia | PASS |
| AC2 | Documento elegível movido: mesmo `getDirectDocumentContext` | `src/server/integration/__tests__/document-context.integration.test.ts:77`, `:78` — A, B, raiz, `toEqual(baseline)`. O caminho da edição, lacuna do ciclo 2, agora é AC3 | PASS |
| AC3 | Mudar só a pasta pela edição mantém `status` de todos, sem reconciliar | `src/server/__tests__/actions.test.ts:1405`, `:1406` — `folderId: pasta.id, status: "fora_do_agente"`, com teto folgado, em que a reconciliação promoveria. `src/server/actions/documents.ts:143`. D5 morto. A captura 25 é anterior à correção e mostra o comportamento antigo; a prova é o teste | PASS |

### PRAIZ-01 — Raiz de Documentos

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Seção "Pastas", contagem, cartões antes de "Todos os arquivos" | Capturas 01 ("6 pastas"), 08 ("7 pastas"). `src/components/documents/__tests__/folder-presentation.test.ts:72`, `:73` | PASS |
| AC2 | Nome, contagem, rótulo e tamanho no cartão | Captura 01: "3 arquivos", "1 arquivo", "0 arquivos", "900.8 KB", "0 B". `src/components/documents/__tests__/folder-presentation.test.ts:70`, `:125` | PASS |
| AC3 | Rótulos no servidor, em São Paulo | Valores: `src/components/documents/__tests__/folder-presentation.test.ts:75` a `:85`. Fuso do dia civil: `:88` a `:93`, com `TZ=UTC` em `:12`, T1 e M10 mortos. `app/(crm)/documentos/page.tsx:86`, `:87`. **Falta:** nenhum caso prova o fuso do texto "em D de mmm." (`src/components/documents/folder-presentation.ts:45`); T2 sobrevive. Ver G3 | **FAIL** (sem evidência versionada, G3) |
| AC4 | Clique no cartão abre `/documentos?pasta=<id>` | `src/lib/__tests__/document-folders.test.ts:66`; `src/components/documents/folders-grid.tsx:40`. Captura 04 mostra o destino | PASS |
| AC5 | Menu do cartão por permissão, sem navegar | Capturas 03 (escrita, continua na raiz) e 33 (leitura) | PASS |
| AC6 | Todos os documentos na raiz | Capturas 01 e 02: em pastas e sem pasta. `src/server/data/__tests__/documents.test.ts:217` | PASS |
| AC7 | Coluna "Pasta" na lista | Captura 02: nomes e "Sem pasta" | PASS |
| AC8 | Submenu "Pasta" com "Todas" e "Sem pasta"; filtra | Capturas 26 e 27. `src/components/documents/__tests__/documents-toolbar.test.ts:106` a `:108`, `:112`; `src/components/documents/__tests__/documents-page-state.test.ts:10`, `:22`; `src/server/data/__tests__/documents.test.ts:215`. N10a, N10b, N10c mortos | PASS |
| AC9 | Criar mostra o cartão sem recarga manual | Captura 08: "Pasta de teste", "Atualizada agora", "7 pastas". `src/server/__tests__/document-folders-actions.test.ts:91` | PASS |
| AC10 | Erro no campo, diálogo aberto | Capturas 07 (criar) e 10 (renomear): "Já existe uma pasta com esse nome." | PASS |

### PABRIR-01 — Pasta aberta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Caminho e só os documentos dela | Captura 04: "Documentos / Contratos" e os 3 da pasta. `src/components/documents/folder-header.tsx:12`; `src/components/documents/__tests__/documents-page-state.test.ts:16`, `:21`. M8 morto | PASS |
| AC2 | Esconde "Pastas" e o submenu | Capturas 04 e 30 (menu sem "Pasta") | PASS |
| AC3 | Busca, modalidade, categoria, ordem e visão dentro da pasta, mantendo `pasta` | Busca: capturas 05, 06. Modalidade, categoria, ordem: `src/components/documents/__tests__/documents-toolbar.test.ts:83` a `:85`, `:91`. Visão: captura 38 (caminho, título "Contratos" e os 3 documentos em "Lista"); `src/components/documents/documents-browser.tsx:86` a `:95` | PASS |
| AC4 (emendado) | Menu tira só modalidade e categoria; link do vazio vai a `/documentos?pasta=<id>` | `src/components/documents/__tests__/documents-toolbar.test.ts:60`, `:72`, `:97`, `:98`. Captura 30. N6, N7, N8, N9 mortos | PASS |
| AC5 | Nome como título, menu ao lado | Capturas 04 (um só título), 16 (Copiar link, Renomear, Excluir), 34 (leitura, com o menu). `src/components/documents/folder-actions-menu.tsx:35` a `:41` | PASS |

### PUPLOAD-01 — Envio dentro da pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Envio na pasta grava nela | `src/server/documents/__tests__/repository.test.ts:121`, `:122`; `src/components/documents/upload-dialog.tsx:216`; `app/(crm)/documentos/page.tsx:130`. Captura 29 prova que o id chega à rota. M7 morto. Não há captura de envio concluído, que depende do armazenamento | PASS |
| AC2 | Texto `Será salvo na pasta "<nome>".` | Captura 15 | PASS |
| AC3 | Na raiz, sem pasta | `src/server/documents/__tests__/repository.test.ts:129`, `:134`; `src/components/documents/upload-dialog.tsx:216` | PASS |
| AC4 | `folderId` opcional no payload, na intenção e no documento | `src/components/documents/__tests__/upload-client.test.ts:38`; `src/server/documents/__tests__/upload-route.test.ts:97`; `src/server/documents/__tests__/uploads.test.ts:123`; `src/server/documents/__tests__/repository.test.ts:116`, `:121`. `src/server/documents/uploads.ts:352` | PASS |
| AC5 | Tipo inválido: 400 `upload_payload_invalid` | `src/server/documents/__tests__/upload-route.test.ts:103` a `:105` | PASS |
| AC6 | Pasta inválida: 404 `upload_folder_not_found`, sem intenção | `src/server/documents/__tests__/upload-route.test.ts:112` a `:114`; `src/server/documents/__tests__/repository.test.ts:141`, `:143`; `src/server/documents/__tests__/uploads.test.ts:131`. E7 morto | PASS |
| AC7 | Mensagem exata no diálogo | Captura 29. `src/components/documents/__tests__/upload-client.test.ts:45` | PASS |
| AC8 | Pasta excluída depois da reserva: documento sem pasta | `src/server/documents/__tests__/repository.test.ts:156` | PASS |

### PLINK-01 — Copiar link da pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Copia `<origem>/documentos?pasta=<id>`, aviso "Link copiado" | Capturas 19 (escuro) e 40 (claro). `src/components/documents/folder-actions-menu.tsx:27`, `:28`; `src/lib/__tests__/document-folders.test.ts:66`. O texto copiado não tem asserção versionada, como a camada de componente em `design.md` § 9 aceita, e a captura não o mostra; uma prova descartável própria afirmou a URL absoluta exata. Ver ressalvas | PASS |
| AC2 | Falha mostra "Não foi possível copiar o link." | Capturas 20 e 41. `src/components/documents/folder-actions-menu.tsx:29`, `:30`. Mesma prova descartável | PASS |

### PVAZIO-01 — Estados vazios

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | "Nenhuma pasta ainda", descrição por permissão | Capturas 31 e 32. `src/components/documents/folders-grid.tsx:33`, `:34` | PASS |
| AC2 | "Esta pasta está vazia", descrição por permissão | Capturas 14 e 34. `app/(crm)/documentos/page.tsx:171`, `:172` | PASS |
| AC3 | "Nenhum resultado encontrado" com "Limpar filtros" | Captura 06. `app/(crm)/documentos/page.tsx:181` a `:186` | PASS |
| AC4 | 200, "Pasta não encontrada", sem lista, busca nem botões | Captura 28. `app/(crm)/documentos/page.tsx:107` a `:117`, sem `notFound()`; `src/components/documents/__tests__/documents-page-state.test.ts:11`, `:17`; `src/lib/__tests__/document-folders.test.ts:41` a `:43` | PASS |
| AC5 | Mesmo estado para inexistente e de outro tenant | `src/server/data/__tests__/document-folders.test.ts:139`, `:140`; `src/components/documents/__tests__/documents-page-state.test.ts:17`; ramo único em `app/(crm)/documentos/page.tsx:107`. Captura 28 mostra um dos casos, sem dizer qual | PASS |

### PSEED-01 — Seed de pastas

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Apaga e insere as seis, com id determinístico | `src/db/__tests__/seed.test.ts:111`, `:113` a `:115`. `src/db/seed.ts:741`, `:848`, `:1053`, `:1083` | PASS |
| AC2 | Duas rodadas, mesmas pastas e ids | `src/db/__tests__/seed.test.ts:115`, `:117` | PASS |

## Edge Cases

| # | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Só espaços: `nome-invalido` | `src/server/__tests__/document-folders-actions.test.ts:98`, `:102` | PASS |
| 2 | 120 aceita, 121 recusa | `src/server/__tests__/document-folders-actions.test.ts:108`, `:111`, `:102`; `src/components/documents/__tests__/folder-presentation.test.ts:46`, `:53` | PASS |
| 3 | Renomear para o próprio nome: `ok: true` | `src/server/__tests__/document-folders-actions.test.ts:114` | PASS |
| 4 | Excluído fora das contagens | `src/server/data/__tests__/document-folders.test.ts:110`, `:82` | PASS |
| 5 | Mais de 2 GiB exato | `src/server/data/__tests__/document-folders.test.ts:110` | PASS |
| 6 | Um só valor de `pasta` na URL | `src/components/documents/__tests__/documents-toolbar.test.ts:107`, `:108`, `:112`. N10a, N10b, N10c mortos | PASS |
| 7 | Repetido move e conta uma vez | `src/server/data/__tests__/document-folders.test.ts:168` | PASS |
| 8 | Já no destino: `movedCount: 0`, datas intactas | `src/server/data/__tests__/document-folders.test.ts:169`, `:170` | PASS |
| 9 | Excluir a aberta volta à raiz | Captura 18. `src/components/documents/delete-folder-dialog.tsx:58` | PASS |

## Check ancorado na spec

Conferi o valor afirmado de cada teste citado contra a spec: códigos e mensagens exatos, linhas inteiras comparadas depois de recusas, conjunção com documentos fora por critério, omissão diferente de `null`, datas de partida diferentes do resultado, FK conferida por regra e definição. Nenhum teste citado espelha a implementação.

- **Testes novos da barra:** a simulação de `useState` em `src/components/documents/__tests__/documents-toolbar.test.ts:16` a `:20` semeia estado e devolve setters, mas os handlers e a transformação de URL são os reais. Os valores afirmados são URLs completas que derivam da spec. A exceção de forma do ciclo 2 deixou de valer: os ramos executam, e N3, N4 e N5 morrem.
- **AC3 de PAGENTE-01:** o valor `fora_do_agente` em `src/server/__tests__/actions.test.ts:1406` é o desfecho que a spec exige. O teto folgado garante que uma reconciliação indevida mudaria o status. A asserção cobre o documento que seria promovido, e D5 prova que ela discrimina.
- **`TZ=UTC`:** `src/components/documents/__tests__/folder-presentation.test.ts:12` vale para o arquivo inteiro, antes do import do formatador. T1 morre sem variável externa, nesta máquina em `America/Sao_Paulo`.

## Sensor de discriminação

**Isolamento:** worktree temporário destacado em `1c22119`, no diretório de rascunho da sessão, com `node_modules` por junção. A junção foi removida antes do worktree, e `node_modules` real continua íntegro. Nenhum `git stash`. `git status --porcelain` do checkout real ficou vazio antes, durante e depois.

**Ambiente:** cada rodada foi `npx vitest run --root <cópia> <arquivos>`, em série, a partir do checkout real, para o carregador do projeto ler o ambiente local. Nenhum valor foi lido ou impresso. O roteiro de shell só aplicou a mutação, chamou o vitest e reverteu; não carregou ambiente. `src/db/index.ts:15` a `:21` usa só a URL de teste quando o vitest está ativo. Depois do sensor, `src/db/__tests__/schema-document-folders.test.ts` passou 7 de 7 no checkout real.

**Ajuste de harness:** `--root` não muda a pasta corrente, e `src/db/__tests__/schema-document-folders.test.ts:113` lê o SQL por `process.cwd()`. Em M9 e M9s, só na cópia, esse caminho foi apontado para o SQL da própria cópia, senão o mutante do SQL não seria lido.

**Critério:** morto significa saída 1 com falha de asserção. A coluna cita a primeira asserção que falhou. As rodadas sobreviventes (saída 0) servem de base sem mutação para os mesmos arquivos, e o recorte no checkout real passou.

### Alvos obrigatórios de `design.md` § 9

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| M1 | Sem tenant no `WHERE` de `listDocumentFolderSummaries` | `src/server/data/__tests__/document-folders.test.ts:112` — expected true to be false | Morto |
| M2 | Sem `deleted_at is null` no join | `src/server/data/__tests__/document-folders.test.ts:109` | Morto |
| M3 | `lastActivityAt` só com `updated_at` | `src/server/data/__tests__/document-folders.test.ts:109` | Morto |
| M4 | Sem tenant na pasta de destino | `src/server/data/__tests__/document-folders.test.ts:184` e `src/server/__tests__/document-folders-actions.test.ts:61` | Morto |
| M5 | Mover só os encontrados | `src/server/data/__tests__/document-folders.test.ts:198` e `src/server/__tests__/document-folders-actions.test.ts:62` | Morto |
| M6a–d | Sem guarda em criar, renomear, excluir, mover | `src/server/__tests__/document-folders-actions.test.ts:145` (três) e `:72` (mover) | 4 mortos |
| M7 | `folderId: null` no commit | `src/server/documents/__tests__/repository.test.ts:121` | Morto |
| M8 | `folderFilterFor` devolve `undefined` | `src/components/documents/__tests__/documents-page-state.test.ts:21` | Morto |
| M9 | CASCADE em `documents.folder_id` no Drizzle e no SQL | `src/db/__tests__/schema-document-folders.test.ts:105` e `:141` | Morto |
| M10 | Sem `timeZone` nos dois formatadores, no fuso da máquina | `src/components/documents/__tests__/folder-presentation.test.ts:93` — "há 2 h" em vez de "ontem" | Morto |

### Mutantes pedidos para o que mudou

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| N3 | Sem `setSearch(searchAfterUrlChange(...))`, `src/components/documents/documents-toolbar.tsx:61` | `src/components/documents/__tests__/documents-toolbar.test.ts:129` | Morto |
| N5 | Sem `setWrittenSearch(nextSearch)`, `:96` | `src/components/documents/__tests__/documents-toolbar.test.ts:159` | Morto |
| N10a | Submenu Pasta chama `updateParams({})`, `:159` | `src/components/documents/__tests__/documents-toolbar.test.ts:112` | Morto |
| N10b | Grava `pasta=todas` | `src/components/documents/__tests__/documents-toolbar.test.ts:112` | Morto |
| N10c | Grava sempre `pasta: null` | `src/components/documents/__tests__/documents-toolbar.test.ts:112` | Morto |
| T1 | Sem `timeZone` em `civilFormatter`, `src/components/documents/folder-presentation.ts:26`, fuso da máquina | `src/components/documents/__tests__/folder-presentation.test.ts:93` | Morto |
| D1 | Comparador sem `name`, `src/server/data/index.ts:2593` | `src/server/__tests__/actions.test.ts:1409` | Morto |
| D2 | Comparador sem `modality`, `:2594` | `src/server/__tests__/actions.test.ts:1394` | Morto |
| D3 | Comparador sem `categoryId`, `:2595` | Nenhuma, 126 de 126 passam | **Sobrevivente**, G2 |
| D4 | Comparador sem `expiresAt`, `:2596` | Nenhuma, 126 de 126 passam | **Sobrevivente**, G1 |
| D5 | Condição `true` em `src/server/actions/documents.ts:143` | `src/server/__tests__/actions.test.ts:1406` | Morto |

### Ampliação proporcional

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| T2 | Sem `timeZone` no formatador do texto com data, `src/components/documents/folder-presentation.ts:45`, processo em UTC pelo teste | Nenhuma, 39 de 39 passam | **Sobrevivente**, G3 |
| D6 | Condição `false` em `src/server/actions/documents.ts:143` | `src/server/__tests__/actions.test.ts:1394` | Morto |
| N1 | `searchAfterUrlChange` nunca adota a URL | `src/components/documents/__tests__/documents-page-state.test.ts:41` | Morto |
| N2 | `searchAfterUrlChange` sempre adota a URL | `src/components/documents/__tests__/documents-page-state.test.ts:37` | Morto |
| N4 | Ramo de mudança de URL nunca entra | `src/components/documents/__tests__/documents-toolbar.test.ts:129` | Morto |
| N4b | Sem `setWrittenSearch(urlSearch)` | `src/components/documents/__tests__/documents-toolbar.test.ts:131` | Morto |
| N4c | Sem `setPreviousUrlSearch(urlSearch)` | `src/components/documents/__tests__/documents-toolbar.test.ts:130` | Morto |
| N6 | Menu tira a pasta aberta | `src/components/documents/__tests__/documents-toolbar.test.ts:72` | Morto |
| N7 | Menu não tira categoria | `src/components/documents/__tests__/documents-toolbar.test.ts:72` | Morto |
| N8 | Menu tira também `q` | `src/components/documents/__tests__/documents-toolbar.test.ts:72` | Morto |
| N9 | `clearFiltersHref` volta à raiz | `src/components/documents/__tests__/documents-page-state.test.ts:28` | Morto |
| M9s | CASCADE só no SQL entregue | `src/db/__tests__/schema-document-folders.test.ts:141` | Morto |
| M9d | CASCADE só no Drizzle | `src/db/__tests__/schema-document-folders.test.ts:105` | Morto |
| M9i | CASCADE em `document_upload_intents.folder_id` | `src/db/__tests__/schema-document-folders.test.ts:105` | Morto |
| E1 | `getDocumentFolder` sem tenant | `src/server/data/__tests__/document-folders.test.ts:139` | Morto |
| E2 | Renomear sem tenant | `src/server/data/__tests__/document-folders.test.ts:67` | Morto |
| E3 | Excluir sem tenant | `src/server/data/__tests__/document-folders.test.ts:68` | Morto |
| E4 | Mover não atualiza a origem | `src/server/data/__tests__/document-folders.test.ts:161` | Morto |
| E5 | Edição aceita pasta de outro tenant | `src/server/__tests__/actions.test.ts:1112` | Morto |
| E6 | Edição não atualiza a origem | `src/server/data/__tests__/documents.test.ts:234` | Morto |
| E7 | Reserva aceita pasta de outro tenant | `src/server/documents/__tests__/repository.test.ts:141` | Morto |
| E8 | `getDocuments` ignora `sem-pasta` | `src/server/data/__tests__/documents.test.ts:215` | Morto |
| E9 | `getDocuments` ignora o filtro `pasta` | `src/server/data/__tests__/documents.test.ts:213` | Morto |
| AS1 | Publicar altera uma mensagem (só no teste da cópia) | `src/server/reengagement/__tests__/agent-state.test.ts:54` | Morto |
| AS2 | Uma mensagem some antes da comparação (só no teste da cópia) | `src/server/reengagement/__tests__/agent-state.test.ts:116` | Morto |
| R1 | `PROOF_LINKS` volta a "A cada 15min" | 7 testes de `scripts/__tests__/reengagement-proof.test.ts` com `proof-scheduler-link-missing`, erro de `scripts/reengagement-proof.ts:41` | Morto por guarda de domínio, não por `expect` |

**Resultado:** 50 injeções, 47 mortas (46 por asserção, 1 por guarda de domínio), 3 sobreviventes. Alvos obrigatórios de § 9: 10 de 10. **FAIL.**

### Provas descartáveis deste ciclo

Só na cópia isolada, apagadas com ela. Não valem como evidência versionada.

- **G3:** o caso `["2026-07-30T15:00:00Z", "2026-07-28T01:00:00Z", "Atualizada em 27 de jul."]`, em `it.each` de `folder-presentation.test.ts:87`, passa no código atual e, com T2, falha: `expected 'Atualizada em 28 de jul.' to be 'Atualizada em 27 de jul.'`.
- **G1 e G2:** dois testes no molde de `actions.test.ts:1399`, com `withGenerousCeiling` e `waitingOutsider`, passam no código atual. Mudar só a categoria falha com D3; mudar só a validade (`expiresAt` futuro) falha com D4. Os dois casos foram rodados com `-t` no arquivo.
- **PLINK-01:** chamando o `onClick` real de "Copiar link", com `navigator.clipboard.writeText` e `useToast` simulados e origem `https://crm.example.test`, o texto copiado é `https://crm.example.test/documentos?pasta=<id>`, o aviso é `{ body: "Link copiado" }` e, com a escrita rejeitada, `{ body: "Não foi possível copiar o link.", type: "error" }`.

## Capturas

As 41 foram abertas. Sustentam os ACs citados acima, com estas observações:

- **Novas:** 38 (pasta aberta em lista, com caminho e título), 39 (edição com o campo "Pasta" em "Contratos"), 40 e 41 (avisos em modo claro: texto branco sobre fundo escuro e sobre vermelho, legíveis, o que sustenta `app/globals.css:25` a `:35` nos dois modos).
- **Anteriores à correção de `04de389`:** a 25 e as 26, 27, 30 a 35 e 37 mostram "Fora do agente", efeito da reconciliação que a correção tirou de quem muda só a pasta. Valem para os ACs em que são citadas, nenhum deles sobre esse estado. Não devem ser lidas como comportamento atual.
- **375 px (36, 37):** sem corte horizontal visível. O registro diz que foi um quadro de 375 px na mesma origem, porque a janela não redimensionou.
- **Selo "1 Issue":** aparece com documentos na tela e some em telas sem eles carregadas do zero (28, 34). A captura 14, de pasta vazia, ainda o mostra; não apurei por quê, e o selo não é critério de nenhum AC.
- **Nome longo no cartão:** "Treinamento da equi…" sai truncado por `maxLines` em `src/components/documents/folders-grid.tsx:46`. Nenhum AC exige o nome inteiro; o menu "Mover" (captura 22) mostra o nome completo.

## Ressalvas classificadas

Nenhuma bloqueia. Critério: bloqueia o que contraria AC ou decisão registrada, ou o que é regressão de comportamento correto.

| Ressalva | Classificação | Fundamento |
| --- | --- | --- |
| "Required" e "Optional" em inglês | Dívida de i18n, para decidir no fechamento | A spec não fala desses textos. `node_modules/@astryxdesign/core/dist/Field/FieldLabel.js:90` crava o texto, sem prop. `design.md:469` pede `isOptional` no campo Pasta, então "Pasta · Optional" é string nova, por decisão do design, consistente com "Categoria · Optional". Não é só herança antiga: é escolha a revisar, tirando `isOptional` dos dois ou aceitando |
| Hidratação do `Timestamp` e locale do navegador | Anterior ao lote | `src/components/documents/documents-grid.tsx:88` fora do diff; o diff de `documents-table.tsx` não toca as linhas de `Timestamp`. O rótulo de pasta, que é deste lote, é calculado no servidor (`app/(crm)/documentos/page.tsx:86`, `:87`), como a spec pede. "Nov 2, 2026" na captura 38 é o mesmo problema |
| Tabela rola na própria área em 1280 px | Cosmético, novo deste lote | Capturas 38, 40, 41: a coluna Pasta empurra "Tamanho" e o menu de ações para fora sem rolagem; a página não rola. Nenhum AC é violado. Com a pasta aberta a coluna é redundante, todas as linhas têm o mesmo valor. Sugestão: não passar `folderById` quando a pasta está aberta, em `src/components/documents/documents-browser.tsx:84` |
| Diálogos de pasta sem `catch`; foco no título | Observação de robustez e acessibilidade | `src/components/documents/delete-folder-dialog.tsx:52`, `folder-name-dialog.tsx:58`, `move-document-dialog.tsx:46`: com `finally`, o botão destrava, mas exceção de rede não dá aviso. A spec não define o desfecho, e não invento AC. `folder-name-dialog.tsx:82` pede `hasAutoFocus`, e o registro diz que a lib foca o título |
| Capturas 40 e 41 em resolução menor | Aceitas | Arquivo de 800x500, com o texto legível. O stub do executor é hipótese, e o conteúdo copiado foi confirmado pela prova descartável acima. Fica sem asserção versionada, o que `design.md` § 9 aceita para componente; o teste cabe em poucas linhas, se quiserem aproveitar a rodada de correção |
| `before` lido fora da transação, em `src/server/actions/documents.ts:123` | Observação própria | Numa edição concorrente, a comparação pode usar valor antigo. O efeito é reconciliar ou deixar de reconciliar uma vez, até a edição seguinte. Sem AC |

## Desvios aprovados

| Desvio | Situação |
| --- | --- |
| T2: identidade de `realSteps` trocada por comportamento | Coberto por `scripts/__tests__/test-db-push-steps.test.ts:15` a `:54`. |
| T10–T12: redistribuição de commits | Contrato final mantido. |
| T19: `validateName` em vez de `maxLength` | `src/components/documents/__tests__/folder-presentation.test.ts:46`, `:53`, `:61`. `design.md:463` ainda cita `maxLength`: corrigir no fechamento. |
| T20: erro ao fim da descrição do `AlertDialog` | `src/components/documents/__tests__/folder-presentation.test.ts:23` a `:35`. |
| T34: `FolderHeader` dividido em `FolderPath` e `FolderHeading` | Emendado em `design.md` § 6.2. |
| PABRIR-01 AC4 e PAGENTE-01 AC3 | Emendas registradas na spec. |

## Gaps para tarefas de correção

Os três são só de teste; nenhum exige mudança de comportamento, salvo a alternativa de G2. Este é o último ciclo: a decisão de corrigir e reverificar, ou de aceitar, é do usuário.

### G1 — Média: mudar a validade reconcilia, sem asserção

- **Sinal:** D4 sobrevive.
- **Onde:** `src/server/data/index.ts:2596`; `src/server/actions/documents.ts:143`.
- **Risco:** a validade entra na admissão (`src/server/documents/repository.ts:496`). Tirar a validade de um documento vencido o devolve aos candidatos, e sem reconciliar o tenant pode ficar fora de equilíbrio. A interface de edição não envia `expiresAt` (`src/components/documents/edit-document-dialog.tsx:109` a `:115`), então hoje só a action alcança esse caminho.
- **Correção:** em `src/server/__tests__/actions.test.ts`, depois de `:1415`, um teste com `withGenerousCeiling` e `waitingOutsider` que muda só `expiresAt` e afirma `status: "pronto"`.
- **Reverificação:** D4 morre por asserção.

### G2 — Baixa: mudar a categoria reconcilia, sem asserção

- **Sinal:** D3 sobrevive.
- **Onde:** `src/server/data/index.ts:2595`.
- **Achado:** a reconciliação não lê categoria (`src/server/documents/repository.ts:491`), então esse campo só dispara uma reconciliação que a categoria em si não pede.
- **Correção:** escolher uma. Teste igual ao de G1, mudando só `categoryId`; ou tirar `categoryId` do comparador e de `getDocumentContextFields`, com o teste afirmando que mudar só a categoria não reconcilia, o que também alinha com o espírito de PAGENTE-01 AC3. A segunda muda comportamento e precisa de aval.
- **Reverificação:** D3 morre por asserção, ou o mutante deixa de existir.

### G3 — Baixa: o fuso do rótulo com data não é discriminado (PRAIZ-01 AC3)

- **Sinal:** T2 sobrevive. Os casos com data caem no mesmo dia em UTC e em São Paulo.
- **Onde:** `src/components/documents/folder-presentation.ts:45`; `src/components/documents/__tests__/folder-presentation.test.ts:87` a `:93`.
- **Risco:** na Vercel, em UTC, perder esse `timeZone` mostraria o dia seguinte para o que foi atualizado depois das 21 h em São Paulo.
- **Correção:** o caso da prova descartável acima, em `:87`.
- **Reverificação:** T2 morre; PRAIZ-01 AC3 passa a PASS.

## Qualidade

| Princípio | Status |
| --- | --- |
| Código mínimo, mudanças cirúrgicas, sem escopo a mais | PASS. Infraestrutura de captura, `b74e255` e `79f995e` fora de pastas, registradas acima |
| Padrões da casa e Astryx, sem `div`, `style` ou CSS novo nos componentes | PASS. As regras novas de `app/globals.css` são de token, com motivo no comentário |
| Asserções alinhadas à spec | PASS |
| Cobertura por camada de `design.md` § 9 | PASS em dados, upload e barra; lacunas G1, G2 e G3 em action e apresentação |
| Testes mapeados a ACs, Edge Cases ou Done when | PASS |
| Diretrizes seguidas: `AGENTS.md`, `design.md` § 9 e § 11 | PASS |

## Rastreabilidade

Nenhum requisito promovido a Verified: a promoção é da T37, depois de um PASS.

## Lições candidatas (AD-045 / T38)

Registradas pelo `lessons.py` como candidatas, sem promoção nem descarte. L-092 a L-098 não foram duplicadas. O script atualizou `.specs/lessons.json` e `.specs/LESSONS.md`.

| ID | Sinal | Fonte | Texto |
| --- | --- | --- | --- |
| L-099 | surviving_mutant | D4 | Ao condicionar um efeito à mudança de vários campos, teste cada campo sozinho disparando o efeito, não só o campo que motivou a condição. |
| L-100 | surviving_mutant | T2 | Com mais de um formatador de data no mesmo fluxo, cubra cada um com um instante em que os fusos caem em dias diferentes. |

## Gate determinístico de fechamento

Comando: `python .claude/skills/tlc-spec-driven/scripts/validate_spec.py lote-17-pastas-de-documentos`.

**Código de saída: 0.** Saída literal:

```text
validate_spec: 0 error(s), 0 warning(s) in .\.specs\features\lote-17-pastas-de-documentos\spec.md
```

Comando: `python .claude/skills/tlc-spec-driven/scripts/validate_state.py lote-17-pastas-de-documentos`.

**Código de saída: 1.** Saída literal:

```text
  ERROR lote-17-pastas-de-documentos: validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify (feature is not done)

validate_state: 1 error(s) across [lote-17-pastas-de-documentos]
```

## Conclusão

**Veredito: FAIL, com escalada ao usuário, porque este é o último dos 3 ciclos.** Todo AC tem comportamento conferido, e o único sem prova versionada é o fuso de um rótulo. G1 e G3 se corrigem com dois casos de teste, e G2 pede uma decisão pequena. Produção não foi tocada; nenhum commit, push ou merge foi feito. O recorte rodou `seed.test.ts`, então o banco de teste não tem mais os documentos da fixture de captura nem os usuários de verificação: `npm run preview:test` recria os usuários, e uma nova captura com documentos precisa repovoar a fixture. Banco de teste liberado.
