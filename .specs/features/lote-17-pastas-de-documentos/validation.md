# Lote 17 — Validação independente de pastas de documentos

## Validation: FAIL

**Data:** 2026-11-02. **Tarefa:** T36, ciclo 2 de até 3.
**Verificador:** sessão independente; não escreveu implementação nem testes do lote. Os registros de `tasks.md` foram lidos como hipóteses de quem executou.
**Spec:** `.specs/features/lote-17-pastas-de-documentos/spec.md` (PABRIR-01 AC4 emendado em 2026-10-30).
**Faixa:** `origin/main...HEAD`, com HEAD `285ee0b` em `lote-17`. A base comum é `2406f5f`; `origin/main` local está em `9d24d51`, dois commits à frente dela (`dc97f33`, `9d24d51`). São 58 commits do lote, ainda não publicados além de `26412e3`.

As regras de dados, permissões e isolamento passaram, e as capturas sustentam quase toda a tela. O lote não fecha por cinco motivos, em ordem de peso: o mutante exigido na chamada de `searchAfterUrlChange` sobreviveu (G1), o submenu "Pasta" não tem asserção e o Edge Case 6 fica sem evidência versionada (G2), faltam capturas de dois ACs e do aviso em modo claro (G3), a troca de pasta por "Editar documento" pode mudar o contexto do agente e a spec não define esse caminho (G4), e o alvo 10 do sensor não discrimina no fuso desta máquina (G5). Nenhum código, teste ou spec foi alterado.

- **96 ACs:** 93 PASS, 0 FAIL, 2 pendentes de captura (PEDIT-01 AC1, PABRIR-01 AC3), 1 lacuna de precisão da spec (PAGENTE-01 AC2).
- **9 Edge Cases:** 8 PASS, 1 FAIL por falta de evidência versionada (Edge Case 6). O comportamento foi provado só em prova descartável.
- **Sensor:** 36 injeções. 30 mortas por asserção, 1 morta por guarda de domínio (R1), 5 sobreviventes (N3, N4, N5, N10, M10L). Os 10 alvos de `design.md` § 9 morreram, com M10 em `TZ=UTC`.
- **Recorte de testes em HEAD, na cópia isolada:** 21 arquivos, 445 testes, 0 falhas, 0 skips, 558 s.
- **Gates:** `npx tsc --noEmit -p .` saída 0. `npx eslint .` saída 0, 0 erros e 9 avisos (limite 9), nenhum em arquivo do lote.
- **Full:** não repetida. `git diff c43167c..HEAD` só toca `tasks.md`, então o registro do executor em `c43167c` (saída 0, 250 arquivos, 4029 testes, 1200,91 s) é reaproveitável como hipótese compatível com o recorte acima. Não executei essa rodada.

## Histórico do ciclo 1 (2026-10-29)

Reprovado com 63 PASS, 2 FAIL e 31 pendentes em `54599b5`.

| Gap do ciclo 1 | Como foi fechado | Conferência deste ciclo |
| --- | --- | --- |
| G1: M9 sobrevivia, o teste de schema só lia a FK já instalada (PBANCO-01 AC1) | `563ae3f`: teste da configuração Drizzle e criação das FKs pelo SQL entregue em transação revertida | Fechado. M9, M9s, M9d e M9i morrem por asserção em `src/db/__tests__/schema-document-folders.test.ts:105` e `:141`. |
| G2: "Limpar filtros" do menu não ia à URL exata (PABRIR-01 AC4) | Emenda do AC por decisão do usuário; `563ae3f` testa o `onClick` real | Fechado sob a emenda. N6, N7, N8 e N9 morrem. |
| G3: T32, T33 e T34 sem captura | T34 feita: 37 capturas e quatro correções | Fechado em quase tudo; sobra o G3 deste ciclo. |

## Tarefas e limites

| Tarefas | Estado conferido |
| --- | --- |
| T1–T33 | Marcadas e sustentadas pelas evidências abaixo. O HTTP 200 da T33 é registro do executor; a evidência própria é a ausência de `notFound()` em `app/(crm)/documentos/page.tsx:107` e a captura 28. |
| T34 | 37 capturas abertas uma a uma. Cobrem os 16 cenários da lista da task, com as lacunas de G3. Nenhuma mostra a barra de endereço, então o que é URL vem de teste ou do efeito na página. |
| T35 | Registro em `c43167c`, ver acima. |
| T36 | Este relatório, com FAIL. Os critérios de conclusão continuam abertos. |
| T37/T38 | Dependem de PASS. |

## Faixa de diff, superfície e integridade

- **Superfície protegida:** `git diff --exit-code origin/main...HEAD -- src/server/integration/context.ts app/api/v1 openapi.yaml n8n vitrine` saiu 0, sem nome listado.
- **Arquivos:** 103 no diff. Fora de pastas: `.ao/launch.json`, `package.json` (`preview:test`), `scripts/preview-test.mjs`, `scripts/preview-test-users.ts` e a seção de capturas de `AGENTS.md`, que são infraestrutura de captura contra o banco de teste, e `scripts/reengagement-proof.ts`.
- **`b74e255`:** muda uma string de dados em `PROOF_LINKS` (`scripts/reengagement-proof.ts:22`) para o nome real em `n8n/workflows/scheduler.ts:37`. Nenhuma asserção mudou. R1 devolve o nome antigo e 7 testes falham com `proof-scheduler-link-missing`, então a prova continua discriminando.
- **Trailers (AD-014):** `git log origin/main..HEAD --format=%B` sem `Co-Authored-By`, "Generated with", `Signed-off-by` nem menção a ferramenta ou agente em nenhum dos 58 commits.
- **L-055:** nos testes do diff, as únicas asserções removidas são as duas identidades de `scripts/__tests__/test-db-push.test.ts` (desvio T2, trocadas por comportamento em `scripts/__tests__/test-db-push-steps.test.ts:15` a `:54`). As demais linhas removidas são imports ampliados. Nenhum arquivo de teste apagado, nenhum `.skip`, `.only` ou `todo`.
- **`git diff --check`:** sem saída.

## Critérios de aceitação ancorados na spec

Caminhos relativos ao repositório. "Captura NN" é o arquivo de `capturas/` com esse prefixo. A coluna de desfecho resume o valor exigido pela spec; a redação integral está em `spec.md`.

### PMOD-01 — Modelo de pastas

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Tabela com id UUID, tenant, nome, datas; cascata do tenant | `src/db/__tests__/schema-document-folders.test.ts:47` a `:50` — tenant/nome, id UUID, datas `Date`. `src/db/schema.ts:644`, `:651` | PASS |
| AC2 | Índice único recusa nome igual sem diferenciar caixa | `src/db/__tests__/schema-document-folders.test.ts:45` — `code` toBe `"23505"`. `src/db/schema.ts:660`; `scripts/document-folders/schema.sql:31` | PASS |
| AC3 | Mesmo nome em tenants diferentes | `src/db/__tests__/schema-document-folders.test.ts:47` — `toMatchObject({ tenantId: tenantB, name: "CONTRATOS" })` | PASS |
| AC4 | `documents.folder_id` anulável, `on delete set null` | `src/db/__tests__/schema-document-folders.test.ts:68`, `:105`, `:141`. `src/db/schema.ts:678` | PASS |
| AC5 | `document_upload_intents.folder_id` anulável, `set null` | `src/db/__tests__/schema-document-folders.test.ts:69`, `:105`, `:141`. `src/db/schema.ts:744` | PASS |
| AC6 | Apagar pasta zera `folder_id` sem apagar linhas | `src/db/__tests__/schema-document-folders.test.ts:68`, `:69` — linha inteira igual, só `folderId: null` | PASS |
| AC7 | Apagar tenant apaga pastas | `src/db/__tests__/schema-document-folders.test.ts:78` — `toEqual([])` | PASS |

### PBANCO-01 — Schema nos bancos de teste e pronto para produção

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | SQL idempotente, em transação, com nomes iguais aos do Drizzle | `src/db/__tests__/schema-document-folders.test.ts:104`, `:105` (nome e regra no Drizzle), `:141` e `:143` (FKs criadas pelo SQL entregue, com definição exata), `:146` (estado restaurado). `scripts/__tests__/document-folders-apply.test.ts:55`, `:57`. M9, M9s, M9d, M9i mortos | PASS |
| AC2 | `db:push:test` aplica depois do push e antes da conferência | `scripts/__tests__/test-db-push-steps.test.ts:19` a `:24`; `scripts/__tests__/test-db-push.test.ts:40`. `scripts/test-db-push.ts:96` | PASS |
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
| AC1 | Filtro `pasta`: só dela, não excluídos | `src/server/data/__tests__/documents.test.ts:213`, `:214` | PASS |
| AC2 | Filtro `sem-pasta`: só nulos | `src/server/data/__tests__/documents.test.ts:215` — `toEqual([rootId])`. E8 morto | PASS |
| AC3 | Sem filtro: todas e sem pasta | `src/server/data/__tests__/documents.test.ts:217` a `:219` | PASS |
| AC4 | Pasta, modalidade, categoria e busca juntas | `src/server/data/__tests__/documents.test.ts:225` — `toEqual([expectedId])`, com um documento fora por critério (`:197` a `:200`) | PASS |
| AC5 | Pasta de outro tenant: vazia | `src/server/data/__tests__/isolation.test.ts:286` — `toEqual([])` para A, e `:287` o documento para B | PASS |
| AC6 | `folderId` na listagem | `src/server/data/__tests__/documents.test.ts:214`, `:218`, `:219`. `src/server/data/index.ts:589` | PASS |

### PCRIAR-01 — Criar pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Grava no tenant da sessão, sem espaços nas pontas | `src/server/__tests__/document-folders-actions.test.ts:87`, `:90`; `src/server/data/__tests__/document-folders.test.ts:44` | PASS |
| AC2 | `nome-invalido` com a mensagem de `validateName`, sem gravar | `src/server/__tests__/document-folders-actions.test.ts:101`, `:102`, `:104` | PASS |
| AC3 | `nome-duplicado` com a mensagem exata, sem gravar | `src/server/__tests__/document-folders-actions.test.ts:121`, `:122`, `:124` | PASS |
| AC4 | Corrida: um grava, outro `nome-duplicado` | `src/server/data/__tests__/document-folders.test.ts:46`, `:47` — `["created", "duplicate_name"]` | PASS |

### PREN-01 — Renomear pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Grava sem espaços, atualiza data, devolve `{ id, name }` | `src/server/__tests__/document-folders-actions.test.ts:93`, `:94`; `src/server/data/__tests__/document-folders.test.ts:54` | PASS |
| AC2 | Troca só de caixa aceita | `src/server/__tests__/document-folders-actions.test.ts:113` | PASS |
| AC3 | Nome de outra pasta: `nome-duplicado` sem alterar | `src/server/__tests__/document-folders-actions.test.ts:123`, `:124` | PASS |
| AC4 | Inválido: `nome-invalido` sem alterar | `src/server/__tests__/document-folders-actions.test.ts:103`, `:104` | PASS |
| AC5 | Ausente, estrangeira ou não UUID: erro exato sem alterar | `src/server/__tests__/document-folders-actions.test.ts:130` a `:135`. E2 morto | PASS |
| AC6 | Documentos continuam na pasta | `src/server/data/__tests__/document-folders.test.ts:61` | PASS |

### PEXC-01 — Excluir pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Apaga, zera documentos e intenções, devolve contagem de ativos | `src/server/__tests__/document-folders-actions.test.ts:155`; `src/server/data/__tests__/document-folders.test.ts:82`, `:85`, `:87` | PASS |
| AC2 | Demais campos preservados | `src/server/data/__tests__/document-folders.test.ts:85` — ativo e excluído inteiros, só `folderId: null` | PASS |
| AC3 | Ausente, estrangeira ou não UUID: erro sem alterar | `src/server/__tests__/document-folders-actions.test.ts:133`, `:135`; `src/server/data/__tests__/document-folders.test.ts:68`, `:70`. E3 morto | PASS |
| AC4 | Título e descrição para N > 1, 1 e 0, com N do cartão | Capturas 11 ("Os 3 arquivos dela voltam para Sem pasta.", cartão com 3), 13 ("O arquivo dela volta…", Financiamento com 1), 17 ("A pasta está vazia."). `src/components/documents/__tests__/folder-presentation.test.ts:91` a `:99` | PASS |
| AC5 | Cancelar mantém pasta e documentos | Captura 12: 7 pastas e Contratos com 3 arquivos depois do cancelamento. `src/components/documents/delete-folder-dialog.tsx:76` | PASS |
| AC6 | Excluir a aberta leva a `/documentos` | Captura 18: raiz, com a pasta a menos. `src/components/documents/folder-header.tsx:26`, `src/components/documents/delete-folder-dialog.tsx:58` | PASS |

### PMOVER-01 — Mover documentos

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Grava em todos e devolve `movedCount` dos que mudaram | `src/server/data/__tests__/document-folders.test.ts:156`, `:158`; `src/server/__tests__/document-folders-actions.test.ts:49`, `:52` | PASS |
| AC2 | Destino `null` deixa sem pasta | `src/server/data/__tests__/document-folders.test.ts:171`, `:172` | PASS |
| AC3 | Atualiza destino e cada origem | `src/server/data/__tests__/document-folders.test.ts:161`. E4 morto | PASS |
| AC4 | Ids repetidos valem um | `src/server/data/__tests__/document-folders.test.ts:168` | PASS |
| AC5 | Vazia, mais de 100 ou não UUID: erro exato sem alterar | `src/server/data/__tests__/document-folders.test.ts:180`, `:181`, `:186`; `src/server/__tests__/document-folders-actions.test.ts:60` | PASS |
| AC6 | Destino ausente, estrangeiro ou não UUID: erro sem alterar | `src/server/data/__tests__/document-folders.test.ts:183`, `:184`, `:186`; `src/server/__tests__/document-folders-actions.test.ts:61`. M4 morto | PASS |
| AC7 | Documento ausente, excluído ou estrangeiro: nenhum muda | `src/server/data/__tests__/document-folders.test.ts:197` a `:199`; `src/server/__tests__/document-folders-actions.test.ts:62`. M5 morto | PASS |
| AC8 | Exclusão simultânea: nunca erro lançado | `src/server/data/__tests__/document-folders.test.ts:224`, `:227`, `:228` — trava real observada. O outro desfecho decorre da FK de PMOD-01 AC6 | PASS |
| AC9 | Status, texto e elegibilidade mantidos, sem reprocessar | `src/server/data/__tests__/document-folders.test.ts:158`; `src/server/__tests__/document-folders-actions.test.ts:50`. Captura 23: "Pronto" depois de mover. `src/server/actions/document-folders.ts:53` a `:69` não reconcilia | PASS |
| AC10 | Diálogo com "Sem pasta", pastas e a atual selecionada; move ao confirmar | Capturas 21 (Contratos selecionada), 22 (opções, com "Sem pasta" primeiro), 23 (Distrato em Sem pasta, Contratos com 2) | PASS |

### PEDIT-01 — Pasta na edição do documento

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Campo com a pasta atual selecionada, ou vazio com "Sem pasta" | Captura 24 cobre só o ramo vazio. Nenhuma captura mostra a edição de um documento que está numa pasta. `src/components/documents/edit-document-dialog.tsx:86`, `:206` | pendente de captura |
| AC2 | Grava junto, na mesma transação, e atualiza origem e destino | `src/server/data/__tests__/documents.test.ts:231`, `:234`, `:235`; `src/server/__tests__/actions.test.ts:1095`, `:1096`. Captura 25. E6 morto | PASS |
| AC3 | `folderId: null` tira da pasta | `src/server/__tests__/actions.test.ts:1099`, `:1100` | PASS |
| AC4 | Omissão mantém | `src/server/__tests__/actions.test.ts:1097`, `:1098` | PASS |
| AC5 | Pasta inválida: erro exato, sem gravar | `src/server/__tests__/actions.test.ts:1111` a `:1113`; `src/server/data/__tests__/documents.test.ts:245`, `:246`. E5 morto | PASS |

### PPERM-01 — Permissões

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | `documentos: escrever` nas quatro actions | `src/server/__tests__/document-folders-actions.test.ts:72`, `:145`. M6a, M6b, M6c, M6d mortos | PASS |
| AC2 | `sem-permissao` com a mensagem da guarda, sem alterar | `src/server/__tests__/document-folders-actions.test.ts:72` a `:74`, `:145` a `:148` | PASS |
| AC3 | `documentos: ler` para listar e abrir | `app/(crm)/documentos/page.tsx:62`, antes das consultas de pasta. Capturas 33 e 34: corretor lê e abre. Os três papéis da matriz têm leitura (`src/lib/permissions.ts:50`, `:62`, `:72`), então a recusa não tem caso alcançável por papel | PASS |
| AC4 | Esconde as escritas sem `escrever` | Capturas 32 e 34 (sem "Nova pasta", "Novo documento"), 33 (sem Renomear e Excluir), 35 (menu do documento sem "Mover para pasta") | PASS |
| AC5 | Oferece "Abrir pasta" e "Copiar link" | Captura 33 | PASS |
| AC6 | Tenant sempre pela sessão | `src/server/__tests__/document-folders-actions.test.ts:90`. `src/server/actions/document-folders.ts:22`, `:35`, `:47`, `:58`; nenhuma entrada traz tenant | PASS |

### PAGENTE-01 — O agente não enxerga a pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Superfície do agente sem mudança | Comando de diff acima, saída 0 e lista vazia | PASS |
| AC2 | Documento elegível movido: mesmo `getDirectDocumentContext` | Pelo mover: `src/server/integration/__tests__/document-context.integration.test.ts:77`, `:78` — raiz, A, B, raiz, `toEqual(baseline)`. Pela edição: sem teste. Ver G4 | ⚠️ lacuna de precisão |

### PRAIZ-01 — Raiz de Documentos

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Seção "Pastas", contagem, cartões antes de "Todos os arquivos" | Capturas 01, 08 ("7 pastas"). `src/components/documents/__tests__/folder-presentation.test.ts:68` | PASS |
| AC2 | Nome, contagem, rótulo e tamanho no cartão | Captura 01: "3 arquivos", "1 arquivo", "0 arquivos", "900.8 KB", "0 B". `src/components/documents/__tests__/folder-presentation.test.ts:65`, `:120` | PASS |
| AC3 | Rótulos no servidor, em São Paulo | `src/components/documents/__tests__/folder-presentation.test.ts:71` a `:90`. Capturas 01, 08, 33. `app/(crm)/documentos/page.tsx:86`, `:87`. M10 morto em `TZ=UTC`; ver G5 | PASS |
| AC4 | Clique no cartão abre `/documentos?pasta=<id>` | `src/lib/__tests__/document-folders.test.ts:66`; `src/components/documents/folders-grid.tsx:40`. Captura 04 mostra o destino | PASS |
| AC5 | Menu do cartão por permissão, sem navegar | Capturas 03 (escrita, continua na raiz) e 33 (leitura) | PASS |
| AC6 | Todos os documentos na raiz | Capturas 01 e 02: documentos em pastas e sem pasta. `src/server/data/__tests__/documents.test.ts:217` | PASS |
| AC7 | Coluna "Pasta" na lista | Captura 02: nomes e "Sem pasta" | PASS |
| AC8 | Submenu "Pasta" com "Todas" e "Sem pasta"; filtra | Captura 26 (submenu), 27 ("Filtrar e ordenar (1)" e só os dois documentos que a captura 02 mostra sem pasta). `src/components/documents/__tests__/documents-page-state.test.ts:22`; `src/server/data/__tests__/documents.test.ts:215`. A escrita na URL não tem asserção: G2 | PASS |
| AC9 | Criar mostra o cartão sem recarga manual | Captura 08: "Pasta de teste", "Atualizada agora", "7 pastas". `src/server/__tests__/document-folders-actions.test.ts:91` | PASS |
| AC10 | Erro no campo, diálogo aberto | Capturas 07 (criar) e 10 (renomear): "Já existe uma pasta com esse nome." | PASS |

### PABRIR-01 — Pasta aberta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Caminho e só os documentos dela | Captura 04: "Documentos / Contratos" e os 3 da pasta. `src/components/documents/folder-header.tsx:12`; `src/components/documents/__tests__/documents-page-state.test.ts:16`, `:21`. M8 morto | PASS |
| AC2 | Esconde "Pastas" e o submenu | Capturas 04 e 30 (menu sem "Pasta") | PASS |
| AC3 | Busca, modalidade, categoria, ordem e visão dentro da pasta, mantendo `pasta` | Busca: capturas 05, 06. Modalidade, categoria, ordem: `src/components/documents/__tests__/documents-toolbar.test.ts:76` a `:85`. Visão: só `src/components/documents/documents-browser.tsx:86` a `:95`, sem teste nem captura com pasta aberta em lista | pendente de captura |
| AC4 (emendado) | Menu tira só modalidade e categoria; link do vazio vai a `/documentos?pasta=<id>` | `src/components/documents/__tests__/documents-toolbar.test.ts:53`, `:66`, `:91`, `:92`. Captura 30: pasta mantida e campo limpo depois do link. N6, N7, N8, N9 mortos | PASS |
| AC5 | Nome como título, menu ao lado | Capturas 04 (um só título), 16 (Copiar link, Renomear, Excluir), 34 (leitura, com o menu). `src/components/documents/folder-actions-menu.tsx:35` a `:41` | PASS |

### PUPLOAD-01 — Envio dentro da pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Envio na pasta grava nela | `src/server/documents/__tests__/repository.test.ts:121`, `:122`; `src/components/documents/upload-dialog.tsx:216`; `app/(crm)/documentos/page.tsx:130`. Captura 29 prova que o id chega à rota pela interface. M7 morto. Não há captura de um envio concluído, que depende do armazenamento | PASS |
| AC2 | Texto `Será salvo na pasta "<nome>".` | Captura 15 | PASS |
| AC3 | Na raiz, sem pasta | `src/server/documents/__tests__/repository.test.ts:129`, `:134`; `src/components/documents/upload-dialog.tsx:216` | PASS |
| AC4 | `folderId` opcional no payload, na intenção e no documento | `src/components/documents/__tests__/upload-client.test.ts:38`; `src/server/documents/__tests__/upload-route.test.ts:97`; `src/server/documents/__tests__/uploads.test.ts:123`; `src/server/documents/__tests__/repository.test.ts:116`, `:121`. `src/server/documents/uploads.ts:352`: confirmação comum aos dois caminhos | PASS |
| AC5 | Tipo inválido: 400 `upload_payload_invalid` | `src/server/documents/__tests__/upload-route.test.ts:103` a `:105` | PASS |
| AC6 | Pasta inválida: 404 `upload_folder_not_found`, sem intenção | `src/server/documents/__tests__/upload-route.test.ts:112`, `:113`; `src/server/documents/__tests__/repository.test.ts:141`, `:143`; `src/server/documents/__tests__/uploads.test.ts:131`. E7 morto | PASS |
| AC7 | Mensagem exata no diálogo | Captura 29. `src/components/documents/__tests__/upload-client.test.ts:45` | PASS |
| AC8 | Pasta excluída depois da reserva: documento sem pasta | `src/server/documents/__tests__/repository.test.ts:156` | PASS |

### PLINK-01 — Copiar link da pasta

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Copia `<origem>/documentos?pasta=<id>`, aviso "Link copiado" | Captura 19. `src/components/documents/folder-actions-menu.tsx:27`, `:28`; `src/lib/__tests__/document-folders.test.ts:66`. O texto copiado foi conferido pelo executor com stub; aqui é leitura do código. Legibilidade conferida só em modo escuro: G3 | PASS |
| AC2 | Falha mostra "Não foi possível copiar o link." | Captura 20. `src/components/documents/folder-actions-menu.tsx:29`, `:30` | PASS |

### PVAZIO-01 — Estados vazios

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | "Nenhuma pasta ainda", descrição por permissão | Capturas 31 e 32 | PASS |
| AC2 | "Esta pasta está vazia", descrição por permissão | Capturas 14 e 34 | PASS |
| AC3 | "Nenhum resultado encontrado" com "Limpar filtros" | Captura 06 | PASS |
| AC4 | 200, "Pasta não encontrada", sem lista, busca nem botões | Captura 28. `app/(crm)/documentos/page.tsx:107` a `:117`, sem `notFound()`; `src/components/documents/__tests__/documents-page-state.test.ts:11`, `:17` | PASS |
| AC5 | Mesmo estado para inexistente e de outro tenant | `src/server/data/__tests__/document-folders.test.ts:139`, `:140`; `src/components/documents/__tests__/documents-page-state.test.ts:17`; um único ramo em `app/(crm)/documentos/page.tsx:107`. Captura 28 mostra um dos casos, sem dizer qual | PASS |

### PSEED-01 — Seed de pastas

| AC | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| AC1 | Apaga e insere as seis, com id determinístico | `src/db/__tests__/seed.test.ts:111`, `:115`. `src/db/seed.ts:741`, `:848`, `:1053`, `:1083` | PASS |
| AC2 | Duas rodadas, mesmas pastas e ids | `src/db/__tests__/seed.test.ts:115`, `:117` | PASS |

## Edge Cases

| # | Desfecho exigido | Evidência | Resultado |
| --- | --- | --- | --- |
| 1 | Só espaços: `nome-invalido` | `src/server/__tests__/document-folders-actions.test.ts:98`, `:102` | PASS |
| 2 | 120 aceita, 121 recusa | `src/server/__tests__/document-folders-actions.test.ts:108`, `:111`; `src/components/documents/__tests__/folder-presentation.test.ts:42`, `:49` | PASS |
| 3 | Renomear para o próprio nome: `ok: true` | `src/server/__tests__/document-folders-actions.test.ts:114` | PASS |
| 4 | Excluído fora das contagens | `src/server/data/__tests__/document-folders.test.ts:110`, `:82` | PASS |
| 5 | Mais de 2 GiB exato | `src/server/data/__tests__/document-folders.test.ts:110` | PASS |
| 6 | Um só valor de `pasta` na URL | `src/components/documents/documents-toolbar.tsx:159`, `:82`. Nenhuma asserção versionada; N10 sobrevive e a captura 27 não mostra a URL. A prova descartável deste ciclo confirma o comportamento | FAIL (sem evidência versionada, G2) |
| 7 | Repetido move e conta uma vez | `src/server/data/__tests__/document-folders.test.ts:168` | PASS |
| 8 | Já no destino: `movedCount: 0`, datas intactas | `src/server/data/__tests__/document-folders.test.ts:169`, `:170` | PASS |
| 9 | Excluir a aberta volta à raiz | Captura 18. `src/components/documents/delete-folder-dialog.tsx:58` | PASS |

## Check ancorado na spec

Conferi o valor afirmado de cada teste citado contra a spec: códigos e mensagens exatos, linhas inteiras comparadas depois de recusas, conjunção com um documento fora por critério em PFILT-01 AC4, omissão diferente de `null`, datas de partida diferentes do resultado, e FK conferida por regra e definição. Nenhum teste citado espelha a implementação, com uma exceção de forma: `src/components/documents/__tests__/documents-toolbar.test.ts:12` a `:17` fixa todo `useState` no valor inicial. Os handlers testados são reais, mas o ramo de `src/components/documents/documents-toolbar.tsx:58` a `:62` nunca executa nesse arquivo. Daí G1.

## Sensor de discriminação

**Isolamento:** worktree temporário destacado em `285ee0b`, no diretório de rascunho da sessão, com `node_modules` por junção, descartado ao fim. A junção foi removida antes do worktree e `node_modules` real continua íntegro. Nenhum `git stash`. `git status --porcelain` do checkout real ficou vazio antes e depois do sensor.

**Base sem mutação:** 21 arquivos, 445 testes, 0 falhas.

**Ambiente:** o roteiro do sensor rodou com o processo na pasta do checkout real para o carregador normal do projeto preencher o ambiente, retirou a URL de produção do processo filho e não imprimiu nenhum valor. Depois disso, um comando de shell que citava esse carregador foi barrado pelo hook do projeto; as provas descartáveis passaram a rodar com `npx vitest run --root <cópia>`, sem roteiro próprio. Fica registrado para o orquestrador avaliar.

**Critério:** morto significa saída 1 com falha de asserção. A coluna cita a primeira asserção que falhou.

### Alvos obrigatórios de `design.md` § 9

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| M1 | Sem tenant no `WHERE` de `listDocumentFolderSummaries` | `src/server/data/__tests__/document-folders.test.ts:112` — expected true to be false | Morto |
| M2 | Sem `deleted_at is null` no join | `src/server/data/__tests__/document-folders.test.ts:109` | Morto |
| M3 | `lastActivityAt` só com `updated_at` | `src/server/data/__tests__/document-folders.test.ts:109` | Morto |
| M4 | Sem tenant na pasta de destino | `src/server/data/__tests__/document-folders.test.ts:184` — moved em vez de `folder_not_found` | Morto |
| M5 | Mover só os encontrados | `src/server/data/__tests__/document-folders.test.ts:198` — moved em vez de `document_not_found` | Morto |
| M6a–d | Sem `denyIfForbidden` em criar, renomear, excluir, mover | `src/server/__tests__/document-folders-actions.test.ts:145` (três) e `:72` (mover) | 4 mortos |
| M7 | `folderId: null` no commit | `src/server/documents/__tests__/repository.test.ts:121` | Morto |
| M8 | `folderFilterFor` devolve `undefined` | `src/components/documents/__tests__/documents-page-state.test.ts:21` | Morto |
| M9 | CASCADE em `documents.folder_id` no Drizzle e no SQL | `src/db/__tests__/schema-document-folders.test.ts:105` e `:141` | Morto |
| M10 | Fuso do servidor, processo em `TZ=UTC` | `src/components/documents/__tests__/folder-presentation.test.ts:89` — "há 2 h" em vez de "ontem" | Morto |

### Correções novas

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| N1 | `searchAfterUrlChange` nunca adota a URL | `src/components/documents/__tests__/documents-page-state.test.ts:41` | Morto |
| N2 | `searchAfterUrlChange` sempre adota a URL | `src/components/documents/__tests__/documents-page-state.test.ts:37` | Morto |
| N3 | Barra sem `setSearch(searchAfterUrlChange(...))`, `src/components/documents/documents-toolbar.tsx:61` | Nenhuma, 17 de 17 passam | **Sobrevivente** |
| N4 | Ramo `urlSearch !== previousUrlSearch` nunca entra, `:58` | Nenhuma, 17 de 17 passam | **Sobrevivente** |
| N5 | Sem `setWrittenSearch(nextSearch)`, `:96` | Nenhuma, 17 de 17 passam | **Sobrevivente** |
| N6 | Menu tira a pasta aberta | `src/components/documents/__tests__/documents-toolbar.test.ts:66` | Morto |
| N7 | Menu não tira categoria | `src/components/documents/__tests__/documents-toolbar.test.ts:66` | Morto |
| N8 | Menu tira também `q` | `src/components/documents/__tests__/documents-toolbar.test.ts:66` | Morto |
| N9 | `clearFiltersHref` volta à raiz | `src/components/documents/__tests__/documents-page-state.test.ts:28` | Morto |
| N10 | Submenu "Pasta" não grava na URL, `:159` | Nenhuma, 9 de 9 passam | **Sobrevivente** |
| M9s | CASCADE só no SQL entregue | `src/db/__tests__/schema-document-folders.test.ts:141` | Morto |
| M9d | CASCADE só no Drizzle | `src/db/__tests__/schema-document-folders.test.ts:105` | Morto |
| M9i | CASCADE em `document_upload_intents.folder_id` | `src/db/__tests__/schema-document-folders.test.ts:105` | Morto |
| R1 | `PROOF_LINKS` volta a "A cada 15min" | 7 testes de `scripts/__tests__/reengagement-proof.test.ts` com `proof-scheduler-link-missing`, erro de `scripts/reengagement-proof.ts:41` | Morto por guarda de domínio, não por `expect` |

### Isolamento e fuso, ampliação proporcional

| Alvo | Mutação | Primeira asserção que falhou | Resultado |
| --- | --- | --- | --- |
| E1 | `getDocumentFolder` sem tenant | `src/server/data/__tests__/document-folders.test.ts:139` | Morto |
| E2 | Renomear sem tenant | `src/server/data/__tests__/document-folders.test.ts:67` | Morto |
| E3 | Excluir sem tenant | `src/server/data/__tests__/document-folders.test.ts:68` | Morto |
| E4 | Mover não atualiza a origem | `src/server/data/__tests__/document-folders.test.ts:161` | Morto |
| E5 | Edição aceita pasta de outro tenant | `src/server/__tests__/actions.test.ts:1112` | Morto |
| E6 | Edição não atualiza a origem | `src/server/data/__tests__/documents.test.ts:234` | Morto |
| E7 | Reserva aceita pasta de outro tenant | `src/server/documents/__tests__/repository.test.ts:141` | Morto |
| E8 | `getDocuments` ignora `sem-pasta` | `src/server/data/__tests__/documents.test.ts:215` | Morto |
| M10L | Mutante de M10 no fuso desta máquina (`America/Sao_Paulo`) | Nenhuma, 39 de 39 passam | **Sobrevivente** (equivalente neste fuso, G5) |

**Resultado:** 36 injeções, 31 mortas, 5 sobreviventes. Alvos obrigatórios de § 9: 10 de 10. Mutantes pedidos para as correções novas: N1 morto, N3 sobrevivente. **FAIL.** Depois das provas, a conferência do schema no banco de teste passou (7 de 7), inclusive FKs e índice.

### Provas descartáveis deste ciclo

Só na cópia isolada, apagadas com ela. Não valem como evidência versionada.

- **Barra:** um teste com `useState` semeado (`search`, `previousUrlSearch` e `writtenSearch` iguais a "Memorial", URL sem `q`) passa no código atual e falha com N3 (`expected "vi.fn()" to be called with arguments: [ '' ]`). Dois casos do submenu "Pasta" passam no código atual (`/documentos?pasta=sem-pasta&q=x` a partir de `pasta=outra&q=x`; `/documentos?q=x` ao escolher "Todas") e falham com N10. A correção de G1 e G2 cabe no arquivo de teste existente.
- **Contexto na edição:** com teto medido e tenant em equilíbrio, `updateDocumentAction` só com outra pasta devolve `getDirectDocumentContext` igual. Sem teto medido, com documentos `pronto`, `moveDocumentsToFolderAction` preserva o contexto, e a edição seguinte só de pasta rebaixa os dois documentos do tenant para `fora_do_agente` e esvazia o contexto. Tenants da prova apagados, com asserção em `afterAll`.

## Capturas

As 37 foram abertas. Sustentam os ACs citados acima, com estas observações:

- **Defeitos corrigidos em T34:** título único confirmado nas capturas 04, 14, 16, 34; campo limpo pelo link na captura 30; aviso legível nas capturas 19 e 20, só em modo escuro; "Required" fora do diálogo de pasta nas capturas 07, 09, 10.
- **`FolderHeading` e estado vazio (04, 14, 34):** caminho, busca, título com menu e estado vazio aparecem na ordem certa, sem título duplicado. Para quem só lê, a captura 34 mantém o menu, sem botões de escrita.
- **375 px (36, 37):** sem corte horizontal visível. O registro diz que foi um quadro de 375 px na mesma origem, porque a janela não redimensionou.
- **Selo "1 Issue":** aparece com documentos na tela e some em telas sem eles carregadas do zero (28, 34). Bate com `src/components/documents/documents-grid.tsx:88`, `Timestamp` já existente, arquivo fora do diff.
- **Nome longo no cartão:** "Treinamento da equi…" sai truncado por `maxLines` em `src/components/documents/folders-grid.tsx:46`. Nenhum AC exige o nome inteiro, e o rascunho visual não foi tomado como requisito.

## Pontos pedidos para olhar com desconfiança

**Regras de `[data-astryx-media]` em `app/globals.css:25` a `:35`.** Não achei regressão. Na lib, `MediaTheme` só é usado por `Toast` e por `OverlayScrim`, e este só por `Overlay` e `useOverlay`; o CRM não importa nenhum dos dois, e o único `useToast` é `src/components/documents/folder-actions-menu.tsx:21`. A vitrine tem CSS próprio e não mudou. Pela leitura, em modo claro `Toast.js:124` escolhe superfície escura e o texto fica branco, o que é correto. As regras diferem dos padrões da lib (`theme/onMediaTokens.js`): não definem `color-scheme` nem `--color-accent`, o que hoje não afeta o aviso, mas afetaria um `Overlay` futuro ou um botão de ação no aviso. Não coberto: nenhuma captura em modo claro, nem do aviso normal nem do de erro. Entra em G3.

**"Required" e "Optional" em inglês.** Ressalva, não reprovação. A spec não fala desses textos. `design.md:469` pede `isOptional` no campo "Pasta" de forma explícita, e "Categoria · Optional" já existia ao lado. `FieldLabel.js:90` da lib crava o texto, sem catálogo nem prop, que é o caso de L-010. O executor está certo sobre a dívida e impreciso ao tratá-la como antiga neste ponto: a string "Pasta · Optional" é nova deste lote, por decisão do design. `design.md` § 11 mandava conferir esses textos na captura, e a conferência foi feita e registrada. Para decidir no fechamento: manter consistente com "Categoria" ou tirar `isOptional` dos dois.

**Exceção de rede.** Continua verdadeiro em `src/components/documents/delete-folder-dialog.tsx:52` a `:63`: `try/finally`, sem `catch`. O mesmo vale para `src/components/documents/folder-name-dialog.tsx:58` a `:70` e `src/components/documents/move-document-dialog.tsx:46` a `:56`. A spec não define desfecho. Observação, sem AC inventado.

**"Fora do agente" depois da edição.** A atribuição do executor está certa na causa: `src/server/actions/documents.ts:139` chama `reconcileTenantDocumentAdmission` em toda edição, e sem teto medido a modalidade vale zero (`src/server/documents/repository.ts:488`). Essa chamada já existia em `origin/main`. O alcance é maior do que o registro diz: a reconciliação vale para o tenant inteiro, então uma única edição rebaixou todos os documentos. Compare a captura 23 ("Pronto" depois de mover), a 25 (o documento editado) e a 26 (todos). O mover não reconcilia, então PMOVER-01 AC9 passa. PEDIT-01 não fala de contexto. A resposta sobre PAGENTE-01 AC2 está em G4.

## Desvios aprovados

| Desvio | Situação |
| --- | --- |
| T2: identidade de `realSteps` trocada por comportamento | Coberto por `scripts/__tests__/test-db-push-steps.test.ts:15` a `:54`. |
| T10–T12: redistribuição de commits | Contrato final mantido. |
| T19: `validateName` em vez de `maxLength` | `src/components/documents/__tests__/folder-presentation.test.ts:42`, `:49`, `:57`. `design.md:463` ainda cita `maxLength`: corrigir no fechamento. |
| T20: erro ao fim da descrição do `AlertDialog` | `src/components/documents/__tests__/folder-presentation.test.ts:19` a `:31`. |
| T34: `FolderHeader` dividido em `FolderPath` e `FolderHeading` | Emendado em `design.md` § 6.2. |
| PABRIR-01 AC4 | Emenda registrada na spec. |

## Gaps para tarefas de correção

### G1 — Alta: o campo de busca não tem guarda contra regressão

- **Sinal:** N3, N4 e N5 sobrevivem. N3 foi pedido de forma explícita.
- **Onde:** `src/components/documents/documents-toolbar.tsx:58` a `:62`, `:96`; `src/components/documents/__tests__/documents-toolbar.test.ts:12` a `:17`.
- **Falta:** só a função pura está testada. A captura 30 mostra o comportamento uma vez; nada impede a chamada de sumir depois.
- **Correção:** em `documents-toolbar.test.ts`, semear o `useState` simulado com "Memorial" nos três estados e URL sem `q`, e afirmar `setSearch("")`. Para N5, disparar `onChange` do campo com temporizador falso e afirmar `setWrittenSearch` com o valor escrito.
- **Reverificação:** N3, N4 e N5 morrem por asserção.

### G2 — Média: submenu "Pasta" sem asserção (PRAIZ-01 AC8, Edge Case 6)

- **Sinal:** N10 sobrevive.
- **Onde:** `src/components/documents/documents-toolbar.tsx:159`.
- **Correção:** no mesmo arquivo de teste, casos pelo `onChange` real: "sem-pasta" a partir de `pasta=outra&q=x` espera `/documentos?pasta=sem-pasta&q=x`; "todas" a partir de `pasta=sem-pasta&q=x` espera `/documentos?q=x`.
- **Reverificação:** N10 morre; Edge Case 6 passa a PASS.

### G3 — Média: capturas que faltam

Salvar em `capturas/`, com o banco de teste:

1. **PEDIT-01 AC1:** "Editar documento" de um documento que está numa pasta, com o campo "Pasta" mostrando essa pasta.
2. **PABRIR-01 AC3:** pasta aberta em visão "Lista", com caminho e título visíveis, para conferir que a troca de visão fica dentro da pasta.
3. **PLINK-01 AC1 e `app/globals.css`:** avisos "Link copiado" e "Não foi possível copiar o link." com o sistema em modo claro.

### G4 — Média, decisão de produto: trocar de pasta pela edição dispara reconciliação (PAGENTE-01 AC2)

- **Sinal:** lacuna de precisão. O objetivo da spec diz que o contexto "não muda quando um documento troca de pasta", mas o AC2 fala em "movido" e o único teste usa `moveDocumentsToFolder`. Não está dito se "Editar documento" conta.
- **Onde:** `src/server/actions/documents.ts:139`; `src/server/integration/__tests__/document-context.integration.test.ts:67`.
- **Achado:** em tenant em equilíbrio o contexto não muda. Fora de equilíbrio, muda: na prova, dois documentos `pronto` sem teto saíram do contexto. Não é regressão, porque toda edição já reconciliava antes do lote. Não provei se esse estado ocorre em produção; o processamento reconcilia ao concluir (`src/server/documents/processing.ts:58`), o que reduz a chance.
- **Correção recomendada:** reconciliar só quando nome, modalidade, categoria ou validade mudarem, comparando com a linha anterior, e estender o teste T16 para o caminho da edição. Alternativa: emendar a spec dizendo que a edição reconcilia e testar o equilíbrio. A escolha é do usuário.

### G5 — Baixa: alvo 10 do sensor depende do fuso da máquina

- **Sinal:** M10 morre em `TZ=UTC` e M10L sobrevive em `America/Sao_Paulo`, fuso desta máquina. Neste fuso o mutante é equivalente. O repositório não tem `.github/workflows`, então `npm test` local não pega a regressão.
- **Onde:** `src/components/documents/__tests__/folder-presentation.test.ts:83` a `:90`.
- **Correção:** fixar um fuso diferente de São Paulo para esse arquivo, por exemplo `TZ: "UTC"` no `env` de `vitest.config.ts`, conferindo o efeito nos demais testes, ou um processo próprio para o caso.
- **Reverificação:** M10L morre sem variável externa.

## Qualidade

| Princípio | Status |
| --- | --- |
| Código mínimo, mudanças cirúrgicas, sem escopo a mais | PASS. Infraestrutura de captura e `b74e255` fora de pastas, registradas acima |
| Padrões da casa e Astryx, sem `div`, `style` ou CSS novo nos componentes | PASS. As regras novas de `app/globals.css` são de token, com motivo no comentário |
| Asserções alinhadas à spec | PASS, com a exceção de forma citada no check |
| Cobertura por camada de `design.md` § 9 | PASS em dados, upload e actions; barra com G1 e G2 |
| Testes mapeados a ACs, Edge Cases ou Done when | PASS |
| Diretrizes seguidas: `AGENTS.md`, `design.md` § 9 e § 11 | PASS |

## Rastreabilidade

Nenhum requisito promovido a Verified: a promoção é da T37, depois de um PASS.

## Lições candidatas (AD-045 / T38)

Registradas pelo `lessons.py` como candidatas, sem promoção nem descarte. L-092 e L-093 não foram duplicadas. O script atualizou `.specs/lessons.json` e `.specs/LESSONS.md`.

| ID | Sinal | Fonte | Texto |
| --- | --- | --- | --- |
| L-094 | surviving_mutant | N3 | Ao simular hooks de estado num teste de componente, semeie estados que entrem em cada ramo condicional; o valor inicial fixo deixa o ramo sem execução. |
| L-095 | surviving_mutant | N10 | Cubra pelo handler real cada controle novo que grava parâmetro na URL, não só os que motivaram a correção. |
| L-096 | surviving_mutant | M10L | Teste de fuso precisa fixar um TZ de processo diferente do fuso exigido para discriminar na máquina local. |
| L-097 | spec_precision_gap | PAGENTE-01 AC2 | Quando um requisito diz que algo não muda numa operação, nomeie todos os caminhos de escrita que a realizam e teste cada um. |
| L-098 | ac_gap | PEDIT-01 AC1 | Capture cada ramo visual de um critério, inclusive o estado com valor preenchido, não só o vazio. |

## Gate determinístico de fechamento

Comando: `python .claude/skills/tlc-spec-driven/scripts/validate_state.py lote-17-pastas-de-documentos`.

**Código de saída: 1.** Saída literal:

```text
  ERROR lote-17-pastas-de-documentos: validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify (feature is not done)

validate_state: 1 error(s) across [lote-17-pastas-de-documentos]
```

## Conclusão

**Veredito: FAIL.** Encaminhar G1 a G5 a um worker, com G4 antes para decisão do usuário, e voltar para o ciclo 3, o último antes de escalar. G1, G2 e G5 são só de teste; G3 é só de captura. Produção não foi tocada; nenhum commit, push ou merge foi feito. Banco de teste liberado.
