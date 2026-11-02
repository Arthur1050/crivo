# Lote 17 — Validação independente de pastas de documentos

## Validation: PASS

**Data:** 2026-11-02. **Tarefa:** T36, ciclo 4.
**Autorização do ciclo:** o processo limita a verificação a 3 ciclos. O ciclo 3 reprovou, e o usuário autorizou este 4º ciclo no chat, em 2026-11-02 ("Sim, rode o 4º ciclo").
**Verificador:** sessão independente; não escreveu implementação, testes nem relatórios anteriores do lote. Os registros de `tasks.md` (arquivado depois em `.specs/archive/lote-17-pastas-de-documentos/`, AD-029) e o relatório do ciclo 3 foram lidos como hipóteses.
**Spec:** `.specs/features/lote-17-pastas-de-documentos/spec.md` (97 ACs e 9 Edge Cases; PABRIR-01 AC4 emendado em 2026-10-30; PAGENTE-01 AC3 acrescentado em 2026-11-02).
**Faixa:** `origin/main...HEAD`, com HEAD `5d7d98f` em `lote-17`. Base comum `2406f5f`; `origin/main` local em `9d24d51`. São 69 commits e 108 arquivos. Desde o ciclo 3 (`1c22119..HEAD`) só mudaram `src/components/documents/__tests__/folder-presentation.test.ts`, `src/server/__tests__/actions.test.ts`, `tasks.md`, este relatório e os dois arquivos de lições. Nenhum arquivo de produção mudou, então a verificação não foi ampliada a código.

Os três gaps do ciclo 3 estão fechados: D3, D4 e T2 morrem por asserção, cada um derrubando só o caso novo que lhe corresponde. A suíte completa passou na primeira rodada. O veredito é PASS com um achado novo que precisa de decisão no fechamento, classificado em Ressalvas: **no estado em que encontrei a branch base de teste, `actions.test.ts` estava vermelho.** Cinco testes de reconciliação estouraram o timeout de 30 s, inclusive dois anteriores ao lote. A causa é o volume de linhas que rodadas anteriores deixaram na branch, não o código nem as asserções: depois de limpar com `seed.test.ts`, o arquivo passa 86 de 86 em 129 s. Nenhum teste foi alterado para isso. O recorte abaixo partiu desse estado limpo.

- **97 ACs:** 97 PASS.
- **9 Edge Cases:** 9 PASS.
- **Sensor próprio:** 21 injeções, 21 mortas por asserção, 0 sobreviventes, 0 por timeout. Os 10 alvos de `design.md` § 9 foram reaplicados e morreram (13 de 13 injeções). Duas rodadas no estado acumulado foram descartadas, e estão registradas.
- **Recorte em HEAD, no checkout real:** 22 arquivos, 477 testes, 0 falhas, 0 skips, 632,69 s, saída 0.
- **Full em HEAD, no checkout real:** `npm test` saída 0, 250 arquivos, 4041 testes, 0 falhas, 0 skips, 1198,89 s, na 1ª rodada, sem repetição por rede. Execução minha. Comparada à última registrada (4038 em `f5b0b5d`), a diferença de 3 são os três casos novos.
- **Gates:** `npx tsc --noEmit -p .` saída 0. `npx eslint .` saída 0, 0 erros e 9 avisos (limite 9), nenhum em arquivo do lote.
- **Amostra própria:** 17 ACs, um de cada requisito, com código e teste reabertos. Lista em "Check ancorado na spec".

## Histórico dos ciclos anteriores

**Ciclo 3 (2026-11-02), FAIL com 96 PASS e 1 FAIL em 97 ACs, em `1c22119`.** Sensor com 50 injeções: 46 mortas por asserção, 1 por guarda de domínio (R1) e 3 sobreviventes (D3, D4, T2). Recorte de 22 arquivos, 474 testes, 614 s, saída 0. A verificação foi interrompida por limite de uso depois do último mutante e retomada sem resíduo.

| Gap | Como foi fechado | Conferência deste ciclo |
| --- | --- | --- |
| G1: mudar a validade reconcilia, sem asserção (D4 vivo) | `03bfafd` e `f17c72c` | Fechado. D4 morre em `src/server/__tests__/actions.test.ts:1423`, e só esse caso falha (1 de 86) |
| G2: mudar a categoria reconcilia, sem asserção (D3 vivo) | `03bfafd` e `f17c72c`, pelo caminho do teste, sem mudar comportamento | Fechado. D3 morre em `src/server/__tests__/actions.test.ts:1436`, e só esse caso falha (1 de 86). Ressalva sobre a origem do valor, abaixo |
| G3: fuso do rótulo com data sem discriminação (T2 vivo, PRAIZ-01 AC3) | `03bfafd` | Fechado. T2 morre em `src/components/documents/__tests__/folder-presentation.test.ts:94` no caso da linha `:92` |


**Ciclo 1 (2026-10-29), FAIL com 63 PASS, 2 FAIL e 31 pendentes em `54599b5`.**

| Gap | Como foi fechado | Conferência do ciclo 3 |
| --- | --- | --- |
| M9 sobrevivia, o teste de schema só lia a FK instalada | `563ae3f`: configuração Drizzle e FKs criadas pelo SQL entregue | M9, M9s, M9d e M9i morrem em `src/db/__tests__/schema-document-folders.test.ts:105` e `:141` |
| "Limpar filtros" do menu não ia à URL exata | Emenda do AC por decisão do usuário; `563ae3f` testa o `onClick` real | N6, N7, N8 e N9 morrem |
| T32, T33 e T34 sem captura | T34 feita, com 37 capturas | Sobrou o G3 do ciclo 2 |

**Ciclo 2 (2026-11-02), FAIL com 93 PASS, 2 pendentes e 1 lacuna em 96 ACs, em `285ee0b`.**

| Gap | Como foi fechado | Conferência do ciclo 3 |
| --- | --- | --- |
| G1: N3, N4 e N5, campo de busca sem guarda | `618498b` | Fechado. N3, N4, N4b, N4c e N5 morrem em `src/components/documents/__tests__/documents-toolbar.test.ts:129` a `:131` e `:159` |
| G2: N10, submenu Pasta e Edge Case 6 | `618498b` | Fechado. N10a, N10b e N10c morrem em `src/components/documents/__tests__/documents-toolbar.test.ts:112` |
| G3: capturas de dois ACs e do aviso em modo claro | `f5b0b5d`, capturas 38 a 41 | Fechado. As quatro abertas e citadas abaixo |
| G4: edição reconciliava o tenant ao mudar só a pasta | `04de389`, com PAGENTE-01 AC3 | Fechado para a pasta (D5 morto). A condição nova abriu G1 e G2 do ciclo 3 |
| G5: alvo 10 dependia do fuso da máquina | `31cb3e3`, `TZ=UTC` em `vi.hoisted` | Fechado para `civilFormatter` (T1 e M10 morrem sem variável externa). O outro formatador abriu G3 do ciclo 3 |

## Tarefas e limites

| Tarefas | Estado conferido |
| --- | --- |
| T1–T34 | Marcadas e sustentadas pelas evidências abaixo. O HTTP 200 da T33 é registro do executor; a evidência própria é a ausência de `notFound()` em `app/(crm)/documentos/page.tsx:107` a `:117` e a captura 28. |
| T35 | Registro em `f5b0b5d`. Refeita por mim em `5d7d98f`: ver a suíte completa acima. |
| T36 | Este relatório, com PASS. As caixas de `tasks.md` são do fechamento. |
| T37/T38 | Liberadas por este PASS. |

## Faixa de diff, superfície e integridade

- **Delimitação:** `git diff --stat 1c22119..HEAD` lista seis arquivos: dois de teste (`folder-presentation.test.ts`, +1; `actions.test.ts`, +28 e -1) e quatro de documentação. A única linha removida de teste é o import ampliado de `src/server/__tests__/actions.test.ts:6`.
- **Superfície protegida:** `git diff --exit-code --name-only origin/main...HEAD -- src/server/integration/context.ts app/api/v1 openapi.yaml n8n vitrine` saiu 0, sem nome listado.
- **Fora de pastas:** `.ao/launch.json`, `package.json`, `scripts/preview-test.mjs`, `scripts/preview-test-users.ts`, a seção de capturas de `AGENTS.md` (infraestrutura de captura), `scripts/reengagement-proof.ts` (string de dados, R1 morre) e `src/server/reengagement/__tests__/agent-state.test.ts` (abaixo).
- **Trailers (AD-014):** nos 69 commits, `git log origin/main..HEAD --format=%B` não tem `Co-Authored-By`, "Generated with" nem `Signed-off-by`, e `%(trailers:only)` não devolve nada.
- **L-055:** nos testes do diff, as linhas removidas são: duas identidades de `scripts/__tests__/test-db-push.test.ts` (desvio T2, trocadas por comportamento em `scripts/__tests__/test-db-push-steps.test.ts:15` a `:54`); imports ampliados em `src/server/__tests__/actions.test.ts` e `src/server/integration/__tests__/document-context.integration.test.ts`; e as quatro consultas de `agent-state.test.ts`, reescritas com `orderBy`. Nenhum arquivo de teste apagado; nenhum `.skip`, `.only` ou `todo` novo em `origin/main...HEAD`. `vitest.config.ts` fora do diff, com `testTimeout: 30000` em `vitest.config.ts:27`, e os casos novos não passam timeout próprio. `f17c72c` só separa um caso em dois, com as mesmas asserções.
- **`79f995e`:** as duas comparações mantêm `toEqual` sobre as linhas inteiras e ganham a mesma ordem nos dois lados, então só sai a dependência da ordem física. Continua igualmente forte: alterar uma mensagem (AS1) falha em `src/server/reengagement/__tests__/agent-state.test.ts:54`, e apagar uma mensagem (AS2) falha em `:116`.
- **`04de389` contra DOCLIM-01 AC8 do L12:** não contraria. O AC exige reavaliar quando exclusão, expiração ou mudança de modalidade libera capacidade. A exclusão segue reconciliando sempre (`src/server/actions/documents.ts:167`, teste `src/server/__tests__/actions.test.ts:1383`). A modalidade segue reconciliando (`src/server/data/index.ts:2594`, teste `src/server/__tests__/actions.test.ts:1394`, D2 morto). A mudança de validade agora também tem prova (`src/server/data/index.ts:2596`, teste `src/server/__tests__/actions.test.ts:1423`, D4 morto). Os dois testes antigos continuam iguais nesta faixa.
- **`git diff --check origin/main...HEAD`:** sem saída.

## Critérios de aceitação ancorados na spec

Caminhos relativos ao repositório. "Captura NN" é o arquivo de `capturas/` com esse prefixo. A coluna de desfecho resume o valor exigido pela spec; a redação integral está em `spec.md`.

**O que é herdado e o que é meu:** estas tabelas vêm do ciclo 3. Neste ciclo, conferi PRAIZ-01 AC3 e PAGENTE-01 AC3 contra a spec, reabri o código e o teste de uma amostra de 17 ACs (um por requisito) e conferi por roteiro que toda citação `arquivo:linha` aponta para linha existente no HEAD. Corrigi as citações que os testes novos deslocaram: só as de `folder-presentation.test.ts` a partir da linha 92. Em `actions.test.ts` a inserção veio depois da linha 1415, a última citada antes dela. Os demais testes e todo o código de produção não mudaram desde `1c22119`, por isso os ACs fora da amostra seguem com a conferência do ciclo 3, sustentada pela suíte e pelo sensor deste ciclo.

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
| AC4 | Título e descrição para N > 1, 1 e 0, com N do cartão | Capturas 11 ("Os 3 arquivos dela voltam para Sem pasta.", cartão com 3), 13 ("O arquivo dela volta…", Financiamento com 1), 17 ("A pasta está vazia."). `src/components/documents/__tests__/folder-presentation.test.ts:96` a `:104` | PASS |
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
| AC2 | Nome, contagem, rótulo e tamanho no cartão | Captura 01: "3 arquivos", "1 arquivo", "0 arquivos", "900.8 KB", "0 B". `src/components/documents/__tests__/folder-presentation.test.ts:70`, `:126` | PASS |
| AC3 | Rótulos no servidor, em São Paulo | Valores: `src/components/documents/__tests__/folder-presentation.test.ts:75` a `:85`. Fuso do dia civil: `:88` a `:91`, afirmado em `:94`, com `TZ=UTC` em `:12`. Fuso do texto "em D de mmm.": `:92`, afirmado em `:94` — 28/07 às 01:00 UTC é 27/07 às 22:00 em São Paulo, antes de ontem no mesmo ano, então "Atualizada em 27 de jul.". T1, T2 e M10 mortos. Cálculo no servidor: `app/(crm)/documentos/page.tsx:86`, `:87` | PASS |
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
| AC1 | Copia `<origem>/documentos?pasta=<id>`, aviso "Link copiado" | Capturas 19 (escuro) e 40 (claro). `src/components/documents/folder-actions-menu.tsx:27`, `:28`; `src/lib/__tests__/document-folders.test.ts:66`. O texto copiado não tem asserção versionada, como a camada de componente em `design.md` § 9 aceita, e a captura não o mostra; a prova descartável do ciclo 3 afirmou a URL absoluta exata, e neste ciclo reli o código e reabri a captura 19. Ver ressalvas | PASS |
| AC2 | Falha mostra "Não foi possível copiar o link." | Capturas 20 e 41. `src/components/documents/folder-actions-menu.tsx:29`, `:30`. Mesma prova descartável do ciclo 3 | PASS |

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
- **`TZ=UTC`:** `src/components/documents/__tests__/folder-presentation.test.ts:12` vale para o arquivo inteiro, antes do import do formatador. T1 e T2 morrem sem variável externa, nesta máquina em `America/Sao_Paulo`.

### Testes novos deste ciclo, julgados contra a spec

| Caso | Só um campo muda? | De onde vem o valor afirmado | Julgamento |
| --- | --- | --- | --- |
| `src/components/documents/__tests__/folder-presentation.test.ts:92` — "Atualizada em 27 de jul." | Sim, um par de instantes | PRAIZ-01 AC3: em São Paulo, 30/07 12:00 contra 27/07 22:00 é "antes de ontem, mesmo ano". Em UTC seria 28 | Deriva da spec. Fecha G3 |
| `src/server/__tests__/actions.test.ts:1423` — só `expiresAt`; `status: "pronto"` | Sim. Nome, modalidade e categoria repetem os valores lidos, e `folderId` é omitido. D4 derruba só este caso | A promoção vem de DOCLIM-01 AC8. O gatilho é mais largo que a letra do AC, que fala em expiração que libera capacidade; aqui a validade entra no futuro. Coerente com `src/server/documents/repository.ts:496`, em que a validade decide a candidatura | Aceito. Fecha G1. O título cita PAGENTE-01 AC3, que só prescreve o caso negativo: é o complemento dele, não a letra |
| `src/server/__tests__/actions.test.ts:1436` — só `categoryId`; `status: "pronto"` | Sim. `expiresAt` e `folderId` omitidos. D3 derruba só este caso | **Nenhum AC prescreve reconciliar ao mudar a categoria.** O valor preserva o comportamento anterior a `04de389`. A categoria entra no contexto entregue (`src/server/integration/context.ts:49`, `:71`), mas a reconciliação não a lê (`src/server/documents/repository.ts:491`) | Aceito com ressalva. É o caminho que G2 oferecia sem precisar de aval, e não contraria a spec. Trava uma decisão de implementação, não um desfecho da spec |

Os testes antigos do bloco (`src/server/__tests__/actions.test.ts:1383`, `:1394`, `:1406`, `:1409`) estão intactos. D1, D2, D5 e D6 continuam morrendo neles.

### Amostra própria

Reabri código e teste de um AC por requisito, conferindo se a linha citada afirma o que a tabela diz: PMOD-01 AC2, PBANCO-01 AC3, PLER-01 AC3, PFILT-01 AC4, PCRIAR-01 AC4, PREN-01 AC5, PEXC-01 AC1, PMOVER-01 AC7, PEDIT-01 AC5, PPERM-01 AC2, PAGENTE-01 AC2, PRAIZ-01 AC3, PABRIR-01 AC4, PUPLOAD-01 AC6, PLINK-01 AC1, PVAZIO-01 AC4 e PSEED-01 AC1. As 17 conferem. Nas visuais, reabri as capturas 19, 28 e 33, que mostram o aviso "Link copiado", o estado "Pasta não encontrada" sem lista nem botões, e o menu do corretor só com "Abrir pasta" e "Copiar link". Nenhuma citação errada encontrada.

## Sensor de discriminação

**Isolamento:** worktree temporário destacado em `5d7d98f`, no diretório de rascunho da sessão, com `node_modules` por junção. A junção foi removida antes do worktree, `git worktree list` não o mostra mais, e `node_modules` real continua íntegro (746 entradas antes e depois). Nenhum `git stash`. `git status --porcelain` do checkout real ficou vazio antes, durante e depois.

**Ambiente:** cada rodada foi `npx vitest run --root <cópia> <arquivos>`, em série, a partir do checkout real. Nenhum valor do ambiente foi lido ou impresso, e meus roteiros não o carregam. `src/db/index.ts:15` a `:22` usa só a URL de teste quando o vitest está ativo.

**Ajuste de harness:** `--root` não muda a pasta corrente, e `src/db/__tests__/schema-document-folders.test.ts:113` lê o SQL por `process.cwd()`. Em M9, só na cópia, esse caminho foi apontado para o SQL da própria cópia, senão o mutante do SQL não seria lido.

**Critério:** morto significa saída 1 com falha de asserção; timeout não vale. A coluna cita a primeira asserção que falhou, e, em `actions.test.ts`, quantos testes falharam dos 86.

**Rodadas sem mutante:** `folder-presentation.test.ts`, 40 de 40. `actions.test.ts` depois da limpeza, 86 de 86, antes (129,03 s) e depois dos mutantes. Os cinco arquivos dos alvos M1 a M9, 69 de 69.

**Rodadas descartadas:** o primeiro `actions.test.ts`, no estado acumulado, deu saída 1 com 81 passando e 5 timeouts, em 307,95 s. D3 nesse mesmo estado deu 4 timeouts e a asserção de `:1436`. Parei o roteiro, e cada rodada de D1 a D6 passou a começar por `src/db/__tests__/seed.test.ts`, 36 de 36. Ver Ressalvas.

**Reaplicados neste ciclo:** T1, T2, M10, D1 a D6 e M1 a M9, com a saída de cada um conferida no log. **Não reaplicados:** N1 a N10, E1 a E9, M9s, M9d, M9i, AS1, AS2 e R1 são do ciclo 3, em `1c22119`. Nem o código nem os testes que os matam mudaram desde lá.

### Alvos obrigatórios de `design.md` § 9 (reaplicados neste ciclo)

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| M1 | Sem tenant no `WHERE` de `listDocumentFolderSummaries` | `src/server/data/__tests__/document-folders.test.ts:112` — expected true to be false | Morto |
| M2 | Sem `deleted_at is null` no join | `src/server/data/__tests__/document-folders.test.ts:109` | Morto |
| M3 | `lastActivityAt` só com `updated_at` | `src/server/data/__tests__/document-folders.test.ts:109` | Morto |
| M4 | Sem tenant na pasta de destino | `src/server/__tests__/document-folders-actions.test.ts:61` e `src/server/data/__tests__/document-folders.test.ts:184` | Morto |
| M5 | Mover só os encontrados | `src/server/__tests__/document-folders-actions.test.ts:62` e `src/server/data/__tests__/document-folders.test.ts:198` | Morto |
| M6a–d | Sem guarda em criar, renomear, excluir, mover | `src/server/__tests__/document-folders-actions.test.ts:145` (três) e `:72` (mover) | 4 mortos |
| M7 | `folderId: null` no commit | `src/server/documents/__tests__/repository.test.ts:121` | Morto |
| M8 | `folderFilterFor` devolve `undefined` | `src/components/documents/__tests__/documents-page-state.test.ts:21` | Morto |
| M9 | CASCADE em `documents.folder_id` no Drizzle e no SQL | `src/db/__tests__/schema-document-folders.test.ts:105` e `:141` | Morto |
| M10 | Sem `timeZone` nos dois formatadores, processo em UTC pelo teste | `src/components/documents/__tests__/folder-presentation.test.ts:94` — "há 2 h" em vez de "ontem", e "28 de jul." em vez de "27 de jul." | Morto, 2 de 40 |

### Mutantes reaplicados pelo que mudou

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| T1 | Sem `timeZone` em `civilFormatter`, `src/components/documents/folder-presentation.ts:26`, processo em UTC pelo teste | `src/components/documents/__tests__/folder-presentation.test.ts:94` — "há 2 h" em vez de "ontem" | Morto, 1 de 40 |
| T2 | Sem `timeZone` no formatador do texto com data, `src/components/documents/folder-presentation.ts:45`, processo em UTC pelo teste | `src/components/documents/__tests__/folder-presentation.test.ts:94` — "28 de jul." em vez de "27 de jul." | Morto, 1 de 40. Era sobrevivente, G3 |
| D1 | Comparador sem `name`, `src/server/data/index.ts:2593` | `src/server/__tests__/actions.test.ts:1409` | Morto, 1 de 86 |
| D2 | Comparador sem `modality`, `:2594` | `src/server/__tests__/actions.test.ts:1394` | Morto, 1 de 86 |
| D3 | Comparador sem `categoryId`, `:2595` | `src/server/__tests__/actions.test.ts:1436` | Morto, 1 de 86. Era sobrevivente, G2 |
| D4 | Comparador sem `expiresAt`, `:2596` | `src/server/__tests__/actions.test.ts:1423` | Morto, 1 de 86. Era sobrevivente, G1 |
| D5 | Condição `true` em `src/server/actions/documents.ts:143` | `src/server/__tests__/actions.test.ts:1406` | Morto, 1 de 86 |
| D6 | Condição `false` em `src/server/actions/documents.ts:143` | `src/server/__tests__/actions.test.ts:1394`, depois `:1409`, `:1423` e `:1436` | Morto, 4 de 86 |

### Do ciclo 3, não reaplicados

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| N3 | Sem `setSearch(searchAfterUrlChange(...))`, `src/components/documents/documents-toolbar.tsx:61` | `src/components/documents/__tests__/documents-toolbar.test.ts:129` | Morto |
| N5 | Sem `setWrittenSearch(nextSearch)`, `:96` | `src/components/documents/__tests__/documents-toolbar.test.ts:159` | Morto |
| N10a | Submenu Pasta chama `updateParams({})`, `:159` | `src/components/documents/__tests__/documents-toolbar.test.ts:112` | Morto |
| N10b | Grava `pasta=todas` | `src/components/documents/__tests__/documents-toolbar.test.ts:112` | Morto |
| N10c | Grava sempre `pasta: null` | `src/components/documents/__tests__/documents-toolbar.test.ts:112` | Morto |
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

**Saldo deste ciclo:** 21 injeções reaplicadas, 21 mortas por asserção, 0 sobreviventes, 0 por timeout. Alvos obrigatórios de § 9: 10 de 10. Somadas às injeções do ciclo 3 não reaplicadas, são 50 no total, sem sobrevivente; R1 segue morta por guarda de domínio, e não por `expect`.

### Sondas descartáveis deste ciclo

Só na cópia isolada, apagadas com ela. Não valem como evidência versionada.

- **Causa dos timeouts:** um teste só de leitura, rodado pelo vitest contra o banco de teste, contou os documentos por tenant e mediu um `select 1`. Ver a ressalva correspondente.

### Prova descartável do ciclo 3 ainda citada

- **PLINK-01:** chamando o `onClick` real de "Copiar link", com `navigator.clipboard.writeText` e `useToast` simulados e origem `https://crm.example.test`, o texto copiado é `https://crm.example.test/documentos?pasta=<id>`, o aviso é `{ body: "Link copiado" }` e, com a escrita rejeitada, `{ body: "Não foi possível copiar o link.", type: "error" }`. Não a refiz: é registro do ciclo 3, compatível com `src/components/documents/folder-actions-menu.tsx:27` a `:30`, que reli.

## Capturas

Nenhum código visual mudou desde o ciclo 3, então não foram refeitas. As 41 foram abertas naquele ciclo; neste, reabri a 19, a 28 e a 33. Sustentam os ACs citados acima, com estas observações:

- **Novas:** 38 (pasta aberta em lista, com caminho e título), 39 (edição com o campo "Pasta" em "Contratos"), 40 e 41 (avisos em modo claro: texto branco sobre fundo escuro e sobre vermelho, legíveis, o que sustenta `app/globals.css:25` a `:35` nos dois modos).
- **Anteriores à correção de `04de389`:** a 25 e as 26, 27, 30 a 35 e 37 mostram "Fora do agente", efeito da reconciliação que a correção tirou de quem muda só a pasta. Valem para os ACs em que são citadas, nenhum deles sobre esse estado. Não devem ser lidas como comportamento atual.
- **375 px (36, 37):** sem corte horizontal visível. O registro diz que foi um quadro de 375 px na mesma origem, porque a janela não redimensionou.
- **Selo "1 Issue":** aparece com documentos na tela e some em telas sem eles carregadas do zero (28, 34). A captura 14, de pasta vazia, ainda o mostra; não apurei por quê, e o selo não é critério de nenhum AC.
- **Nome longo no cartão:** "Treinamento da equi…" sai truncado por `maxLines` em `src/components/documents/folders-grid.tsx:46`. Nenhum AC exige o nome inteiro; o menu "Mover" (captura 22) mostra o nome completo.

## Ressalvas classificadas

Nenhuma bloqueia. Critério: bloqueia o que contraria AC ou decisão registrada, ou o que é regressão de comportamento correto.

| Ressalva | Classificação | Fundamento |
| --- | --- | --- |
| **Novo: `actions.test.ts` fica vermelho por timeout conforme a branch base de teste acumula documentos** | Dívida de teste, anterior ao lote, para decidir no fechamento. Não é flakiness de rede nem comportamento errado | **Observado:** no estado encontrado, 5 timeouts de 30 s, nos testes de `src/server/__tests__/actions.test.ts:1376`, `:1388`, `:1399`, `:1417` e `:1430`. A sonda mostrou 147 documentos ativos em `tenants[0]` (95 `falha`, 32 `fora_do_agente`, 20 `processando`) e `select 1` em 139 ms. Depois do seed, com 12 ativos ao fim do arquivo, passa 86 de 86, com 7,5 a 9,3 s em cada um desses testes no recorte. **Causa:** `withGenerousCeiling` restaura o status documento a documento (`src/server/__tests__/actions.test.ts:1364`, `:1365`), e a reconciliação atualiza um por um (`src/server/documents/repository.ts:512`, `:513`), então o tempo cresce com as linhas. Cada rodada do arquivo deixa 12 ativos a mais, o que dá cerca de 12 rodadas sem seed até o estado encontrado. **Origem:** o auxiliar é de `8421412` (L12). O lote somou três testes que passam por ele, sem mudar a causa. **Efeito:** o recorte e a suíte passaram, mas o recorte partiu do banco limpo por mim, porque `actions.test.ts` rodou antes de `seed.test.ts`; a partir do estado encontrado, esse arquivo falharia. A suíte usa outras branches e passou sem limpeza minha. **`f17c72c`:** atribui o timeout a duas reconciliações no mesmo caso. Com o banco limpo, um caso gasta menos de 10 s, então o estado acumulado é a explicação mais provável; não reproduzi o estado daquele commit. Separar os casos foi inofensivo, mas não remove a causa. **Sugestão:** restaurar com um único `update`, ou limpar o que os testes criam. Enquanto isso, rodar `seed.test.ts` antes de `actions.test.ts` se os timeouts voltarem |
| **Novo: o caso da categoria afirma comportamento sem AC** | Precisão de spec. Registrada, sem contrariar AC | `src/server/__tests__/actions.test.ts:1436`, tabela em "Testes novos deste ciclo". Se a decisão de reconciliar ao mudar a categoria for para valer, cabe registrá-la no fechamento; o título "(PAGENTE-01 AC3)" dos dois casos novos sugere uma exigência que o AC não faz |
| "Required" e "Optional" em inglês | Dívida de i18n, para decidir no fechamento | A spec não fala desses textos. `node_modules/@astryxdesign/core/dist/Field/FieldLabel.js:90` crava o texto, sem prop. `design.md:469` pede `isOptional` no campo Pasta, então "Pasta · Optional" é string nova, por decisão do design, consistente com "Categoria · Optional". Não é só herança antiga: é escolha a revisar, tirando `isOptional` dos dois ou aceitando |
| Hidratação do `Timestamp` e locale do navegador | Anterior ao lote | `src/components/documents/documents-grid.tsx:88` fora do diff; o diff de `documents-table.tsx` não toca as linhas de `Timestamp`. O rótulo de pasta, que é deste lote, é calculado no servidor (`app/(crm)/documentos/page.tsx:86`, `:87`), como a spec pede. "Nov 2, 2026" na captura 38 é o mesmo problema |
| Tabela rola na própria área em 1280 px | Cosmético, novo deste lote | Capturas 38, 40, 41: a coluna Pasta empurra "Tamanho" e o menu de ações para fora sem rolagem; a página não rola. Nenhum AC é violado. Com a pasta aberta a coluna é redundante, todas as linhas têm o mesmo valor. Sugestão: não passar `folderById` quando a pasta está aberta, em `src/components/documents/documents-browser.tsx:84` |
| Diálogos de pasta sem `catch`; foco no título | Observação de robustez e acessibilidade | `src/components/documents/delete-folder-dialog.tsx:52`, `folder-name-dialog.tsx:58`, `move-document-dialog.tsx:46`: com `finally`, o botão destrava, mas exceção de rede não dá aviso. A spec não define o desfecho, e não invento AC. `folder-name-dialog.tsx:82` pede `hasAutoFocus`, e o registro diz que a lib foca o título |
| Capturas 40 e 41 em resolução menor | Aceitas | Arquivo de 800x500, com o texto legível. O stub do executor é hipótese, e o conteúdo copiado foi confirmado pela prova descartável do ciclo 3. Fica sem asserção versionada, o que `design.md` § 9 aceita para componente |
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

Nenhum gap bloqueante. G1, G2 e G3 do ciclo 3 estão fechados, conforme o histórico. A interface de edição continua sem enviar `expiresAt` (`src/components/documents/edit-document-dialog.tsx:109` a `:115`), então o caminho da validade hoje só é alcançado pela action.

Duas decisões ficam para o fechamento, sem impedir o PASS, em ordem de prioridade:

1. **Timeouts por estado acumulado na branch base:** aceitar como dívida registrada ou abrir tarefa. Primeira linha das ressalvas.
2. **Categoria:** registrar como decisão a reconciliação ao mudar só a categoria. Segunda linha das ressalvas.

## Qualidade

| Princípio | Status |
| --- | --- |
| Código mínimo, mudanças cirúrgicas, sem escopo a mais | PASS. Infraestrutura de captura, `b74e255` e `79f995e` fora de pastas, registradas acima |
| Padrões da casa e Astryx, sem `div`, `style` ou CSS novo nos componentes | PASS. As regras novas de `app/globals.css` são de token, com motivo no comentário |
| Asserções alinhadas à spec | PASS, com a ressalva do caso da categoria |
| Cobertura por camada de `design.md` § 9 | PASS. As lacunas de action e apresentação do ciclo 3 fecharam |
| Testes mapeados a ACs, Edge Cases ou Done when | PASS. O caso da categoria mapeia à correção G2 do ciclo 3, não a um AC |
| Diretrizes seguidas: `AGENTS.md`, `design.md` § 9 e § 11 | PASS |

## Gate de testes

| Rodada | Comando | Arquivos | Testes | Falhas / skips | Duração | Saída |
| --- | --- | --- | --- | --- | --- | --- |
| Recorte, checkout real, a partir do banco limpo | `npx vitest run <22 arquivos>`: os 21 arquivos de teste do diff mais `scripts/__tests__/reengagement-proof.test.ts` | 22 | 477 | 0 / 0 | 632,69 s | 0 |
| Suíte completa, checkout real | `npm test` | 250 | 4041 | 0 / 0 | 1198,89 s | 0 |

Sem repetição por `ETIMEDOUT` ou `ECONNRESET`. Antes do lote a contagem é a de `origin/main`, não medida por mim; desde a última rodada registrada, são 3 testes a mais, os três casos novos. Nenhum teste foi removido ou enfraquecido.

**Estado do banco de teste ao fim:** o `seed.test.ts` rodou várias vezes na branch base, então ela não tem a fixture de captura nem os usuários de verificação. `npm run preview:test` recria os usuários, e uma nova captura com documentos precisa repovoar a fixture.

## Rastreabilidade

Nenhum requisito promovido a Verified nesta tarefa: a promoção é da T37, agora liberada por este PASS.

## Lições candidatas (AD-045 / T38)

Registradas pelo `lessons.py` como candidatas, sem promoção nem descarte. L-092 a L-100 não foram duplicadas. O script atualizou `.specs/lessons.json` e `.specs/LESSONS.md`.

| ID | Sinal | Fonte | Texto |
| --- | --- | --- | --- |
| L-099 | surviving_mutant | D4 (ciclo 3) | Ao condicionar um efeito à mudança de vários campos, teste cada campo sozinho disparando o efeito, não só o campo que motivou a condição. |
| L-100 | surviving_mutant | T2 (ciclo 3) | Com mais de um formatador de data no mesmo fluxo, cubra cada um com um instante em que os fusos caem em dias diferentes. |
| L-101 | gate_fail | `src/server/__tests__/actions.test.ts:1364` | Em teste sobre banco compartilhado, não deixe o tempo crescer com as linhas de rodadas anteriores: limpe o que criou e restaure em lote, não linha a linha. |
| L-102 | spec_precision_gap | `src/server/__tests__/actions.test.ts:1436` | Quando um AC proíbe um efeito para um caso, diga também quais casos continuam disparando o efeito, para o teste positivo ter desfecho definido pela spec. |

## Gate determinístico de fechamento

Comando: `python .claude/skills/tlc-spec-driven/scripts/validate_spec.py lote-17-pastas-de-documentos`.

**Código de saída: 0.** Saída literal:

```text
validate_spec: 0 error(s), 0 warning(s) in .\.specs\features\lote-17-pastas-de-documentos\spec.md
```

Comando: `python .claude/skills/tlc-spec-driven/scripts/validate_state.py lote-17-pastas-de-documentos`.

**Código de saída: 0.** Saída literal:

```text
validate_state: 0 error(s) across [lote-17-pastas-de-documentos]
```

Os dois comandos rodaram depois de o veredito estar gravado. A conferência por roteiro das citações `arquivo:linha` achou 424 citações; 5 têm caminho abreviado (`design.md`, `folder-name-dialog.tsx`, `move-document-dialog.tsx`), que conferi à mão, e nenhuma aponta para além do fim do arquivo.

## Conclusão

**Veredito: PASS, no 4º ciclo autorizado pelo usuário.** Os 97 ACs e os 9 Edge Cases têm evidência, os 21 mutantes reaplicados morrem por asserção e a suíte completa passa. O PASS não esconde o achado dos timeouts por estado acumulado: ele não contraria AC nem comportamento e é anterior ao lote, mas quem rodar `actions.test.ts` repetidas vezes na branch base vai encontrá-lo. Produção não foi tocada; nenhum commit, push ou merge foi feito. Banco de teste liberado.
