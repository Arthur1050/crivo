# Lote 17 — Validação independente de pastas de documentos

## Validation: FAIL

**Data:** 2026-10-29. **Tarefa:** T36, primeira verificação independente (ciclo 1 de até 3).
**Verificador:** sessão independente; não escreveu implementação nem testes do lote.
**Spec:** `.specs/features/lote-17-pastas-de-documentos/spec.md`.
**Faixa:** `origin/main...origin/lote-17`, fixada em `9d24d51a59985af96a1b02d62f81511347fdc71b...54599b5f7b7872f33e234e4cf0fa76b5954e338a`.
**Branch do relatório:** `ao/verificar-pastas/t36`, criada diretamente de `origin/lote-17` atualizado.

O lote ainda não está pronto para fechar: há uma lacuna de discriminação do schema (G1), uma divergência do controle de limpar filtros (G2) e a prova visual/autenticada T34 continua aberta. Nenhuma correção de código ou teste foi feita.

- **96 ACs:** 63 PASS, 2 FAIL, 31 **pendente de captura (T34)**. FAIL significa requisito sem prova suficiente ou comportamento divergente, conforme a linha; não significa que a FK atualmente instalada está errada.
- **9 Edge Cases:** 7 PASS, 0 FAIL, 2 **pendente de captura (T34)**.
- **Sensor obrigatório:** 10 mutantes, 9 mortos, 1 sobrevivente (M9). Prova complementar M9b morta; total ampliado 11 injeções, 10 mortas, 1 sobrevivente. A prova complementar não apaga o sobrevivente obrigatório.
- **Testes do recorte:** 19 arquivos / 419 testes PASS, sem skips. Vitrine após instalação: 2 arquivos / 16 testes PASS. Restauração final do schema: 1 arquivo / 5 testes PASS.
- **Gates finais:** `npx tsc --noEmit -p .` saída 0; `npx eslint .` saída 0, 0 erros e 7 avisos.
- **Full:** não repetida. As sete falhas de reengajamento de T35 foram reproduzidas em `origin/main`; os dois arquivos da vitrine passaram após `npm ci` em `vitrine/`.

## Tarefas e limites

| Tarefas | Estado conferido |
| --- | --- |
| T1–T31 | Implementadas e marcadas no registro; provas de dados/lógica verificadas abaixo. Composição visual continua dependendo de T34. |
| T32 | Integração implementada; abertura autenticada/console na raiz ainda sem prova. |
| T33 | Integração implementada; HTTP 200 autenticado para inválida/inexistente/estrangeira ainda sem prova. |
| T34 | Aberta. Nenhuma captura criada, inventada ou reaproveitada; nenhum outro navegador utilizado. |
| T35 | Full executada por C1 em a431948, com falhas; classificação independente detalhada abaixo. Não convertida em PASS. |
| T36 | Relatório entregue com FAIL; critérios de conclusão de `tasks.md` permanecem abertos. |
| T37/T38 | Fechamento e decisão sobre lições ficam com o orquestrador, após correções/reverificação e prova visual. |

Asserções foram comparadas aos valores exigidos na spec, incluindo mensagens e códigos exatos, linhas intocadas em recusas, conjunção dos quatro filtros, omissão versus `null`, datas com partida diferente do resultado esperado e contexto idêntico após mover. Não foi encontrada lacuna de precisão adicional bloqueante na spec; G2 tem URL final explicitamente definida. A matriz separa lógica automatizada de renderização: evidência de código não substitui captura. A rastreabilidade da spec não foi promovida a Verified (T37).

## Faixa de diff, superfície e integridade

`git diff --name-only origin/main...origin/lote-17`: 55 arquivos. `git diff --exit-code origin/main...origin/lote-17 -- src/server/integration/context.ts app/api/v1 openapi.yaml n8n vitrine`: saída 0 e diff vazio. Nenhum arquivo de produção protegido foi alterado; o teste de contexto em `src/server/integration/__tests__/document-context.integration.test.ts:67` foi acrescentado e é permitido.

`git log origin/main..origin/lote-17 --format=%B`: 47 commits auditados, sem trailer de coautoria, frase de geração nem marca de atribuição a ferramenta/agente (AD-014). Conferência das mensagens completas, além de busca por formas usuais de atribuição. `git diff --check`: saída 0.

No recorte, 19 arquivos de teste têm diff. Nenhum arquivo de teste foi apagado ou marcado para pular. As únicas duas asserções removidas são as identidades de wrappers de T2, substituídas por comportamento autorizado. As outras linhas removidas em testes são imports ampliados. Não houve enfraquecimento para passar no gate. A contagem de 4012 testes da Full é o registro de C1; não se inventou uma contagem Full da base. O recorte independente de 419 é uma rodada parcial, não substitui essa contagem nem uma Full verde.

## Gates executados e falhas alheias

| Verificação | Resultado observado |
| --- | --- |
| 19 arquivos relevantes, comando abaixo | 19 PASS, 419 PASS, 0 falhas, 0 skips; 451,52 s. |
| `npm ci` em `vitrine/` | Saída 0; 384 pacotes instalados; `package.json` e lockfile intactos. |
| `npx vitest run vitrine/src/tema/__tests__/tema-da-loja.test.ts vitrine/src/i18n/__tests__/mensagens.test.ts` | Saída 0; 2 arquivos / 16 testes PASS; 562 ms. Resolveu o ENOENT do ambiente de C1 sem editar teste/código/dependência declarada. |
| `scripts/__tests__/reengagement-proof.test.ts` sozinho em worktree temporário de `origin/main` | Saída 1; 1 arquivo, 5 PASS / 7 FAIL, 0 skips; 67,02 s. Seis erros `proof-scheduler-link-missing` em `scripts/reengagement-proof.ts:41`; uma leitura de `.main` em conexão ausente em `scripts/__tests__/reengagement-proof.test.ts:147`. Mesmas falhas relatadas por C1. |
| `npx tsc --noEmit -p .` ao final | Saída 0, 0 erros. |
| `npx eslint .` | Saída 0, 0 erros / 7 avisos da base. |
| Schema após restauração da prova M9b | Saída 0, 5/5 PASS, incluindo `verifyDocumentFoldersState(url) = []` e regras c/n/n. |

Comando do recorte, rodado em série no banco de teste (arquivo a arquivo, sem outra suíte de banco):

```text
npx vitest run src/lib/__tests__/document-folders.test.ts scripts/__tests__/document-folders-apply.test.ts scripts/__tests__/test-db-push-steps.test.ts scripts/__tests__/test-db-push.test.ts src/db/__tests__/schema-document-folders.test.ts src/server/data/__tests__/document-folders.test.ts src/server/data/__tests__/documents.test.ts src/server/data/__tests__/isolation.test.ts src/server/data/__tests__/pg-errors.test.ts src/server/__tests__/document-folders-actions.test.ts src/server/__tests__/actions.test.ts src/server/documents/__tests__/repository.test.ts src/server/documents/__tests__/uploads.test.ts src/server/documents/__tests__/upload-route.test.ts src/server/integration/__tests__/document-context.integration.test.ts src/db/__tests__/seed.test.ts src/components/documents/__tests__/folder-presentation.test.ts src/components/documents/__tests__/documents-page-state.test.ts src/components/documents/__tests__/upload-client.test.ts
```

**T35 histórica (C1, não reexecutada):** 249 arquivos, 246 aprovados / 3 falhos; 4012 testes, 4004 aprovados / 8 falhos. A suíte de mensagens nem carregou por ENOENT; a outra falha da vitrine foi `vitrine/src/tema/__tests__/tema-da-loja.test.ts:115`. Ambas passaram aqui com as dependências locais instaladas.

**Checagem (a) com ressalva explícita:** o diff não toca os arquivos de falha, `scripts/reengagement-proof.ts`, `scripts/reengagement-publication-check.ts`, `src/server/reengagement/`, `n8n/`, `vitrine/`, `package.json` ou lockfile da raiz. Porém não é correto dizer que nenhuma dependência transitiva mudou: o teste de reengajamento importa `src/db/schema.ts` e `src/server/data/index.ts`, que ganharam pastas; a leitura de mensagens pode alcançá-los. Os hunks desses módulos são os de pastas e a extração dos helpers de erro, sem mudança do agendador/reengajamento. A reprodução independente em main, sem o lote, é a evidência de que as sete falhas já existiam.

**Instalação e TypeScript:** uma execução de `tsc` concorrente com `npm ci` da vitrine acusou TS2345 em `vitrine/src/db/conexao.ts:13`, durante a instalação incompleta. Após o término do `npm ci`, repetição com as dependências estáveis: 0 erros, tanto no lote quanto na cópia de main, inclusive com incremental desabilitado. O comando exato exigido também foi repetido e saiu 0. Não se trata de falha final nem foi feita correção para ocultá-la.

## Critérios de aceitação ancorados na spec

As referências abaixo são caminhos reais relativos ao repositório, com linha de teste/implementação. Quando uma célula agrupa várias asserções do mesmo caso, a primeira linha citada localiza o caso e os números seguintes detalham suas asserções. Os 31 resultados pendentes têm evidência estática ou de lógica, mas não aprovação de tela.

### PMOD-01 — Modelo de pastas

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | persistir pastas na tabela `document_folders` com `id` (UUID), `tenant_id`, `name`, `created_at` e `updated_at`, e `tenant_id` referenciando `tenants` com exclusão em cascata. | `src/db/__tests__/schema-document-folders.test.ts:43` — tenant/nome; id UUID; createdAt/updatedAt Date (45–47). `src/db/schema.ts:644` — tabela e FK. | PASS |
| AC2 | recusar no banco uma segunda pasta do mesmo tenant cujo nome seja igual ao de outra ignorando maiúsculas e minúsculas, pelo índice único `document_folders_tenant_id_lower_name_idx` em `(tenant_id, lower(name))`. | `src/db/__tests__/schema-document-folders.test.ts:42` — code toBe("23505"). `src/db/schema.ts:660`; `scripts/document-folders/schema.sql:33` — índice (tenant, lower(name)). | PASS |
| AC3 | aceitar o mesmo nome de pasta em tenants diferentes. | `src/db/__tests__/schema-document-folders.test.ts:44` — other toMatchObject({tenantId:tenantB,name:"CONTRATOS"}). `src/db/schema.ts:660`. | PASS |
| AC4 | guardar a pasta do documento em `documents.folder_id`, anulável, referenciando `document_folders(id)` com `on delete set null`. | `src/db/__tests__/schema-document-folders.test.ts:65` — afterDoc toEqual({...doc,folderId:null}). `src/db/schema.ts:678` — FK anulável. | PASS |
| AC5 | guardar a pasta escolhida no envio em `document_upload_intents.folder_id`, anulável, referenciando `document_folders(id)` com `on delete set null`. | `src/db/__tests__/schema-document-folders.test.ts:66` — afterIntent toEqual({...intent,folderId:null}). `src/db/schema.ts:744`. | PASS |
| AC6 | WHEN uma pasta é apagada no banco THEN o sistema SHALL deixar `folder_id` nulo nos documentos e nas intenções de upload que a referenciavam, sem apagar nenhum deles. | `src/db/__tests__/schema-document-folders.test.ts:65` e `src/db/__tests__/schema-document-folders.test.ts:66` — ambas as linhas inteiras preservadas, só folderId nulo. `scripts/document-folders/schema.sql:24` e `scripts/document-folders/schema.sql:28`. | PASS |
| AC7 | WHEN um tenant é apagado THEN o sistema SHALL apagar as pastas dele em cascata. | `src/db/__tests__/schema-document-folders.test.ts:75` — pastas toEqual([]) após excluir tenant. `src/db/schema.ts:651`; `scripts/document-folders/schema.sql:20`. | PASS |

### PBANCO-01 — Schema nos bancos de teste e pronto para produção

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | ter em `scripts/document-folders/schema.sql` toda a mudança de schema do lote, idempotente e numa transação, com nomes de tabela, coluna, índice e FK iguais aos que o Drizzle gera a partir de `src/db/schema.ts`. | `src/db/__tests__/schema-document-folders.test.ts:81` e `src/db/__tests__/schema-document-folders.test.ts:85` — estado instalado e regras n/c corretos; `scripts/__tests__/document-folders-apply.test.ts:55` — begin/commit. `scripts/document-folders/schema.sql:1`; `src/db/schema.ts:678`. M9 sobrevive: não prova paridade do SQL/schema entregue em banco já preparado (G1). | FAIL |
| AC2 | WHEN `npm run db:push:test` roda THEN o sistema SHALL aplicar `schema.sql` em cada alvo depois do `drizzle-kit push` e antes da conferência final. | `scripts/__tests__/test-db-push-steps.test.ts:18` — realSteps().restoreIndexes(url); `scripts/__tests__/test-db-push-steps.test.ts:20`/24 — antes/depois da restauração, apply exatamente uma vez com url. `scripts/test-db-push.ts:96` — composição real; `scripts/__tests__/test-db-push.test.ts:40` — ordem por alvo. | PASS |
| AC3 | IF depois da aplicação algum alvo não tiver a tabela `document_folders`, as colunas `documents.folder_id` e `document_upload_intents.folder_id`, as três FKs com a regra de exclusão desta spec, o índice `document_folders_tenant_id_lower_name_idx` ou o índice `document_categories_tenant_id_lower_name_idx` THEN o `db:push:test` SHALL listar cada item ausente e sair com código diferente de 0, sem tocar nos alvos seguintes. | `scripts/__tests__/document-folders-apply.test.ts:37` — lista exata de itens ausentes; `scripts/__tests__/document-folders-apply.test.ts:48` — FK errada; `scripts/__tests__/test-db-push.test.ts:70`/71 — código não zero e alvo seguinte intocado. `scripts/__tests__/test-db-push-steps.test.ts:49` — concatenação exata; `scripts/document-folders/apply.ts:34`; `scripts/test-db-push.ts:75`. | PASS |
| AC4 | WHEN `schema.sql` é aplicado duas vezes seguidas no mesmo banco THEN o sistema SHALL terminar sem erro e com o mesmo estado. | `src/db/__tests__/schema-document-folders.test.ts:79` e `src/db/__tests__/schema-document-folders.test.ts:80` — mesmo SQL aplicado duas vezes; `src/db/__tests__/schema-document-folders.test.ts:81` — problemas toEqual([]). `scripts/document-folders/schema.sql:2`; `scripts/document-folders/apply.ts:17`. | PASS |

### PLER-01 — Leitura das pastas

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN as pastas de um tenant são listadas THEN o sistema SHALL devolver só as pastas desse tenant, cada uma com `id`, `name`, `fileCount`, `totalSizeBytes` e `lastActivityAt`. | `src/server/data/__tests__/document-folders.test.ts:109` — objeto completo {id,name,fileCount:2,totalSizeBytes:3000000019,lastActivityAt:UPLOADED}; `src/server/data/__tests__/document-folders.test.ts:112` — pasta estrangeira ausente. `src/server/data/document-folders.ts:9`. | PASS |
| AC2 | contar em `fileCount` e somar em `totalSizeBytes` só os documentos da pasta, do mesmo tenant, com `deleted_at` nulo. | `src/server/data/__tests__/document-folders.test.ts:104` — dois ativos; `src/server/data/__tests__/document-folders.test.ts:106` — excluído; `src/server/data/__tests__/document-folders.test.ts:107` — estrangeiro; `src/server/data/__tests__/document-folders.test.ts:110` — count 2/soma exata. `src/server/data/document-folders.ts:15`. | PASS |
| AC3 | calcular `lastActivityAt` como o maior valor entre `document_folders.updated_at` e o `uploaded_at` mais recente dos documentos não excluídos da pasta. | `src/server/data/__tests__/document-folders.test.ts:110` — UPLOADED > OLD; `src/server/data/__tests__/document-folders.test.ts:120` — NOW > UPLOADED. `src/server/data/document-folders.ts:20` — Math.max. | PASS |
| AC4 | WHEN uma pasta não tem documento não excluído THEN o sistema SHALL devolvê-la com `fileCount` 0, `totalSizeBytes` 0 e `lastActivityAt` igual ao `updated_at` dela. | `src/server/data/__tests__/document-folders.test.ts:121` — {fileCount:0,totalSizeBytes:0,lastActivityAt:NOW}. `src/server/data/document-folders.ts:12`; `src/server/data/document-folders.ts:20`. | PASS |
| AC5 | ordenar as pastas por nome com `Intl.Collator("pt-BR", { sensitivity: "base" })`, com empate decidido pelo `id` em ordem crescente. | `src/server/data/__tests__/document-folders.test.ts:133` — ids acentuados empatados ordenados por id, depois banco/Zeta. `src/server/data/document-folders.ts:17`; `src/server/data/document-folders.ts:21`. | PASS |
| AC6 | WHEN uma pasta é pedida por id com o tenant dono THEN o sistema SHALL devolver `{ id, name }`. | `src/server/data/__tests__/document-folders.test.ts:138` — toEqual({id:row.id,name:"Busca"}). `src/server/data/document-folders.ts:24`. | PASS |
| AC7 | IF a pasta pedida por id não existir ou for de outro tenant THEN o sistema SHALL devolver `null`, sem lançar erro. | `src/server/data/__tests__/document-folders.test.ts:139` e `src/server/data/__tests__/document-folders.test.ts:140` — toBeNull() estrangeira/inexistente. `src/server/data/document-folders.ts:27`. | PASS |
| AC8 | IF o id pedido não for um UUID THEN o sistema SHALL devolver `null` sem consultar o banco. | `src/server/data/__tests__/document-folders.test.ts:143` — null; `src/server/data/__tests__/document-folders.test.ts:144` — select não chamado. `src/server/data/document-folders.ts:25`. | PASS |

### PFILT-01 — Filtro de documentos por pasta

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN documentos são listados com o filtro `{ kind: "pasta", folderId }` THEN o sistema SHALL devolver só os documentos não excluídos do tenant com `folder_id` igual a `folderId`. | `src/server/data/__tests__/documents.test.ts:213` — length 4; `src/server/data/__tests__/documents.test.ts:214` — every folderId=first e deletedAt=null. `src/server/data/index.ts:621`. | PASS |
| AC2 | WHEN documentos são listados com o filtro `{ kind: "sem-pasta" }` THEN o sistema SHALL devolver só os documentos não excluídos do tenant com `folder_id` nulo. | `src/server/data/__tests__/documents.test.ts:215` — ids toEqual([rootId]). `src/server/data/index.ts:624`. | PASS |
| AC3 | WHEN documentos são listados sem filtro de pasta THEN o sistema SHALL devolver os documentos não excluídos do tenant de todas as pastas e os sem pasta. | `src/server/data/__tests__/documents.test.ts:217` — length 6; `src/server/data/__tests__/documents.test.ts:218`/219 — raiz e outra pasta incluídas. `src/server/data/index.ts:613`. | PASS |
| AC4 | WHEN o filtro de pasta vem junto com modalidade, categoria e busca por nome THEN o sistema SHALL aplicar os quatro ao mesmo tempo. | `src/server/data/__tests__/documents.test.ts:225` — quatro filtros simultâneos, ids toEqual([expectedId]). `src/server/data/index.ts:623`. | PASS |
| AC5 | IF o filtro aponta para uma pasta de outro tenant THEN o sistema SHALL devolver lista vazia. | `src/server/data/__tests__/isolation.test.ts:286` — tenantA com pastaB toEqual([]); `src/server/data/__tests__/isolation.test.ts:287` — tenantB lê documentoB. `src/server/data/index.ts:622`. | PASS |
| AC6 | incluir `folderId` em cada documento da listagem do CRM. | `src/server/data/__tests__/documents.test.ts:214`/218/219 — valores folderId exatos; `src/server/documents/repository.ts:184` e `src/server/data/index.ts:589` — projeções. | PASS |

### PCRIAR-01 — Criar pasta

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN um usuário com `documentos: escrever` cria uma pasta com nome válido THEN o sistema SHALL gravá-la no tenant ativo da sessão com o nome sem espaços nas pontas e devolver `{ ok: true, folder: { id, name } }`. | `src/server/__tests__/document-folders-actions.test.ts:87`/90 — nome Contratos e tenantA persistidos; `src/server/actions/document-folders.ts:22` — trim/tenant e resultado; `src/server/data/__tests__/document-folders.test.ts:44` — linha completa. | PASS |
| AC2 | IF o nome, sem espaços nas pontas, for vazio ou tiver mais de 120 caracteres THEN o sistema SHALL devolver `{ ok: false, code: "nome-invalido" }` com a mensagem de `validateName(nome, "Nome da pasta")`, sem gravar. | `src/server/__tests__/document-folders-actions.test.ts:98` — vazio/espaços/121; `src/server/__tests__/document-folders-actions.test.ts:102` — code e mensagem exatos; `src/server/__tests__/document-folders-actions.test.ts:104` — linhas inalteradas. `src/server/actions/document-folders.ts:20`. | PASS |
| AC3 | IF já existir no tenant uma pasta com o mesmo nome ignorando maiúsculas e minúsculas THEN o sistema SHALL devolver `{ ok: false, code: "nome-duplicado", error: "Já existe uma pasta com esse nome." }`, sem gravar. | `src/server/__tests__/document-folders-actions.test.ts:121`/122 — objeto exato nome-duplicado; `src/server/__tests__/document-folders-actions.test.ts:124` — linhas intactas. `src/server/actions/document-folders.ts:23`. | PASS |
| AC4 | WHEN duas criações com o mesmo nome no mesmo tenant chegam ao mesmo tempo THEN o sistema SHALL gravar uma e devolver `nome-duplicado` para a outra, sem lançar erro. | `src/server/data/__tests__/document-folders.test.ts:46`/47 — Promise.all, kinds [created,duplicate_name]. `src/server/data/document-folders.ts:36` — insert/catch unique; `src/server/actions/document-folders.ts:23` — tradução. | PASS |

### PREN-01 — Renomear pasta

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN um usuário com `documentos: escrever` renomeia uma pasta do tenant ativo com nome válido THEN o sistema SHALL gravar o nome sem espaços nas pontas, atualizar `updated_at` e devolver `{ ok: true, folder: { id, name } }`. | `src/server/__tests__/document-folders-actions.test.ts:93`/94 — nome sem espaços e retorno exato; `src/server/data/__tests__/document-folders.test.ts:54` — updatedAt NOW. `src/server/actions/document-folders.ts:35`; `src/server/data/document-folders.ts:55`. | PASS |
| AC2 | WHEN o nome novo difere do atual só em maiúsculas e minúsculas THEN o sistema SHALL aceitar a troca. | `src/server/__tests__/document-folders-actions.test.ts:113` — uppercase aceito com id/nome exatos. `src/server/data/document-folders.ts:55`. | PASS |
| AC3 | IF o nome novo já pertencer a outra pasta do tenant ignorando maiúsculas e minúsculas THEN o sistema SHALL devolver `{ ok: false, code: "nome-duplicado" }` sem alterar nenhuma pasta. | `src/server/__tests__/document-folders-actions.test.ts:123`/124 — nome-duplicado e linhas intactas. `src/server/actions/document-folders.ts:37`. | PASS |
| AC4 | IF o nome novo for inválido THEN o sistema SHALL devolver `{ ok: false, code: "nome-invalido" }` sem alterar nenhuma pasta. | `src/server/__tests__/document-folders-actions.test.ts:103`/104 — nome-invalido e linhas intactas. `src/server/actions/document-folders.ts:33`. | PASS |
| AC5 | IF a pasta não existir, for de outro tenant ou o id não for UUID THEN o sistema SHALL devolver `{ ok: false, code: "pasta-nao-encontrada", error: "Pasta não encontrada." }` sem alterar nenhuma pasta. | `src/server/__tests__/document-folders-actions.test.ts:131`/132/135 — estrangeiro/UUID ausente/abc, erro completo e linha intacta. `src/server/actions/document-folders.ts:36`; `src/server/data/document-folders.ts:52`. | PASS |
| AC6 | manter na pasta renomeada todos os documentos que estavam nela. | `src/server/data/__tests__/document-folders.test.ts:61` — documento inteiro toEqual(doc) após renomear. `src/server/data/document-folders.ts:55`. | PASS |

### PEXC-01 — Excluir pasta

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN um usuário com `documentos: escrever` exclui uma pasta do tenant ativo THEN o sistema SHALL apagar a pasta, deixar sem pasta os documentos e as intenções de upload que estavam nela e devolver `{ ok: true, movedToRootCount }` com a quantidade de documentos não excluídos que estavam na pasta. | `src/server/__tests__/document-folders-actions.test.ts:155` — {ok:true,movedToRootCount:1}; `src/server/data/__tests__/document-folders.test.ts:82`/85/87 — count ativo e documentos/intenção nulos. `src/server/data/document-folders.ts:74`; `src/server/actions/document-folders.ts:48`. | PASS |
| AC2 | manter todos os outros campos dos documentos movidos para a raiz, inclusive `status`, categoria e `deleted_at`. | `src/server/data/__tests__/document-folders.test.ts:85` — toEqual({...doc,folderId:null}) para ativo e excluído com categoria. `src/server/data/document-folders.ts:76`; `src/db/schema.ts:678`. | PASS |
| AC3 | IF a pasta não existir, for de outro tenant ou o id não for UUID THEN o sistema SHALL devolver `{ ok: false, code: "pasta-nao-encontrada" }` sem alterar nenhuma linha. | `src/server/__tests__/document-folders-actions.test.ts:131`/133/135 — mesmo erro e pasta estrangeira intocada; `src/server/data/__tests__/document-folders.test.ts:68`. `src/server/actions/document-folders.ts:47`; `src/server/data/document-folders.ts:73`. | PASS |
| AC4 | WHEN o usuário pede a exclusão na interface THEN o sistema SHALL abrir uma confirmação com o título `Excluir a pasta "<nome>"?` e a descrição "Os N arquivos dela voltam para Sem pasta." (N > 1), "O arquivo dela volta para Sem pasta." (N = 1) ou "A pasta está vazia." (N = 0), com N igual ao `fileCount` exibido. | `src/components/documents/__tests__/folder-presentation.test.ts:96` — título e descrição exatos para 0/1/3; `src/components/documents/folder-presentation.ts:58` — cópia; `src/components/documents/delete-folder-dialog.tsx:69`/70 — propriedades do AlertDialog. Falta conferir confirmação renderizada e N exibido. | pendente de captura (T34) |
| AC5 | WHEN o usuário cancela a confirmação THEN o sistema SHALL manter a pasta e os documentos. | `src/components/documents/delete-folder-dialog.tsx:75`/76 — só onAction confirma; fechar chama onClose. Sem teste de interação/captura de cancelar. | pendente de captura (T34) |
| AC6 | WHEN a pasta excluída é a que está aberta na página THEN o sistema SHALL levar o usuário para `/documentos`. | `src/components/documents/folder-header.tsx:21` — afterDeleteHref=/documentos; `src/components/documents/delete-folder-dialog.tsx:58` — router.replace no sucesso. Sem captura do redirecionamento. | pendente de captura (T34) |

### PMOVER-01 — Mover documentos

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN um usuário com `documentos: escrever` move de 1 a 100 documentos do tenant ativo para uma pasta do tenant THEN o sistema SHALL gravar a pasta em todos eles e devolver `{ ok: true, movedCount }` com a quantidade de documentos cuja pasta mudou. | `src/server/__tests__/document-folders-actions.test.ts:49`/52 — movedCount 1/0; `src/server/data/__tests__/document-folders.test.ts:156`/158 — 2 documentos persistidos; `src/server/data/document-folders.ts:90` — limite e transação. | PASS |
| AC2 | WHEN o destino da movimentação é `null` THEN o sistema SHALL deixar os documentos sem pasta. | `src/server/__tests__/document-folders-actions.test.ts:53`/54 e `src/server/data/__tests__/document-folders.test.ts:171`/172 — null e documento inteiro igual à raiz. `src/server/data/document-folders.ts:106`. | PASS |
| AC3 | WHEN a pasta de pelo menos um documento muda THEN o sistema SHALL gravar o instante da operação em `updated_at` da pasta de destino e de cada pasta de origem. | `src/server/data/__tests__/document-folders.test.ts:161` — destino/duas origens updatedAt NOW. `src/server/data/document-folders.ts:110`. | PASS |
| AC4 | tratar ids repetidos na lista como um só. | `src/server/data/__tests__/document-folders.test.ts:168` — ids repetidos, movedCount 1. `src/server/data/document-folders.ts:90` — Set. | PASS |
| AC5 | IF a lista vier vazia, tiver mais de 100 ids distintos ou algum id que não é UUID THEN o sistema SHALL devolver `{ ok: false, code: "selecao-invalida", error: "Selecione de 1 a 100 documentos." }` sem alterar nenhuma linha. | `src/server/data/__tests__/document-folders.test.ts:180`/181 — vazio/101/abc, invalid_selection; `src/server/data/__tests__/document-folders.test.ts:186` — documento intacto; `src/server/__tests__/document-folders-actions.test.ts:60` — mensagem exata. `src/server/data/document-folders.ts:91`; `src/server/actions/document-folders.ts:61`. | PASS |
| AC6 | IF a pasta de destino não existir, for de outro tenant ou o id não for UUID THEN o sistema SHALL devolver `{ ok: false, code: "pasta-nao-encontrada" }` sem alterar nenhum documento. | `src/server/data/__tests__/document-folders.test.ts:183`/184 — foreign/ausente/abc → folder_not_found, `src/server/data/__tests__/document-folders.test.ts:186`/188 intactos; `src/server/__tests__/document-folders-actions.test.ts:61` — mensagem. `src/server/data/document-folders.ts:94`/110. | PASS |
| AC7 | IF algum documento da lista não existir, estiver excluído ou for de outro tenant THEN o sistema SHALL devolver `{ ok: false, code: "documento-nao-encontrado", error: "Documento não encontrado." }` e nenhum documento da lista SHALL mudar. | `src/server/data/__tests__/document-folders.test.ts:197`/198/199 — foreign/excluído/ausente → document_not_found e válido intacto; `src/server/__tests__/document-folders-actions.test.ts:62` — mensagem. `src/server/data/document-folders.ts:103`. | PASS |
| AC8 | IF a pasta de destino for excluída ao mesmo tempo que a movimentação THEN o sistema SHALL terminar com um destes dois desfechos: a movimentação conclui antes e a exclusão leva os documentos para a raiz, ou a movimentação devolve `pasta-nao-encontrada`; nunca erro lançado. | `src/server/data/__tests__/document-folders.test.ts:224` — espera de trava real; `src/server/data/__tests__/document-folders.test.ts:227` — folder_not_found; `src/server/data/__tests__/document-folders.test.ts:228` — doc intacto. `src/server/data/document-folders.ts:98` — for key share. | PASS |
| AC9 | manter `status`, texto extraído e elegibilidade de contexto do documento movido, sem reprocessá-lo. | `src/server/data/__tests__/document-folders.test.ts:158` — linha completa preservada salvo folderId; `src/server/integration/__tests__/document-context.integration.test.ts:78` — contexto idêntico. `src/server/data/document-folders.ts:106` — só folderId, sem reconciliar. | PASS |
| AC10 | WHEN o usuário com `documentos: escrever` escolhe "Mover para pasta" no menu de um documento THEN o sistema SHALL abrir um diálogo com a opção "Sem pasta" e as pastas do tenant, com a pasta atual do documento selecionada, e mover o documento ao confirmar. | `src/components/documents/move-document-dialog.tsx:39` — seleção atual; `src/components/documents/move-document-dialog.tsx:47` — payload [id],folderId; `src/components/documents/__tests__/folder-presentation.test.ts:111`/116 — Sem pasta primeiro/null; `src/components/documents/documents-browser.tsx:164` — menu. Falta interação/captura. | pendente de captura (T34) |

### PEDIT-01 — Pasta na edição do documento

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN o diálogo "Editar documento" abre THEN o sistema SHALL mostrar o campo "Pasta" com a pasta atual do documento selecionada, ou vazio com o texto "Sem pasta" quando ele não tem pasta. | `src/components/documents/edit-document-dialog.tsx:86` — estado da pasta atual; `src/components/documents/edit-document-dialog.tsx:200` — campo opcional; `src/components/documents/edit-document-dialog.tsx:203` — Sem pasta. Sem captura do seletor. | pendente de captura (T34) |
| AC2 | WHEN a edição é salva com outra pasta THEN o sistema SHALL gravar a pasta junto com os demais campos na mesma transação e atualizar `updated_at` das pastas de origem e de destino. | `src/server/data/__tests__/documents.test.ts:231` — metadados e pasta na mesma linha; `src/server/data/__tests__/documents.test.ts:234`/235 — datas origem/destino; `src/server/data/index.ts:2597` — transação; `src/server/__tests__/actions.test.ts:1095`/1096 — action persiste. | PASS |
| AC3 | WHEN `updateDocumentAction` recebe `folderId: null` THEN o sistema SHALL deixar o documento sem pasta. | `src/server/__tests__/actions.test.ts:1099`/1100 — null e folderId:null persistido. `src/server/actions/documents.ts:128`; `src/server/data/index.ts:2595`. | PASS |
| AC4 | WHEN `updateDocumentAction` é chamada sem o campo `folderId` THEN o sistema SHALL manter a pasta atual do documento. | `src/server/__tests__/actions.test.ts:1097`/1098 — omissão mantém pasta já preenchida; `src/server/data/__tests__/documents.test.ts:236`. `src/server/actions/documents.ts:128`; `src/server/data/index.ts:2594`. | PASS |
| AC5 | IF `updateDocumentAction` recebe `folderId` de pasta inexistente, de outro tenant ou que não é UUID THEN o sistema SHALL devolver `{ ok: false, error: "Pasta não encontrada." }` sem gravar nenhum campo. | `src/server/__tests__/actions.test.ts:1111`/1112/1113 — abc/foreign/ausente, erro exato e linha intacta; `src/server/data/__tests__/documents.test.ts:245`/246 — transação. `src/server/actions/documents.ts:116`; `src/server/data/index.ts:2600`. | PASS |

### PPERM-01 — Permissões

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | exigir `documentos: escrever` em criar, renomear e excluir pasta e em mover documento, revalidando permissão e tenant ativo dentro de cada action. | `src/server/__tests__/document-folders-actions.test.ts:72` e `src/server/__tests__/document-folders-actions.test.ts:145` — recusa real corretor nas quatro actions; `src/server/__tests__/document-folders-actions.test.ts:90` — tenant ativo. `src/server/actions/document-folders.ts:18`/31/45/56 — guardas; `src/server/actions/document-folders.ts:22`/35/47/58 — tenant. | PASS |
| AC2 | IF um usuário só com `documentos: ler` chama uma dessas actions THEN o sistema SHALL devolver `{ ok: false, code: "sem-permissao" }` com a mensagem da guarda de permissão, sem alterar nenhuma linha. | `src/server/__tests__/document-folders-actions.test.ts:72`/73/74 e `src/server/__tests__/document-folders-actions.test.ts:145`/147/148 — código/mensagem exatos, linhas e revalidação intactas. `src/server/actions/document-folders.ts:19`. | PASS |
| AC3 | exigir `documentos: ler` para listar pastas e abrir uma pasta, pela mesma guarda que a página já usa. | `app/(crm)/documentos/page.tsx:62` — requirePermission(documentos,ler) antes das consultas de pasta. Sem acesso autenticado/captura para confirmar na página (T32/T33). | pendente de captura (T34) |
| AC4 | WHILE o usuário não tem `documentos: escrever` esconder "Nova pasta", "Renomear", "Excluir" e "Mover para pasta". | `app/(crm)/documentos/page.tsx:126`/128; `src/components/documents/folder-actions-menu.tsx:37`; `src/components/documents/documents-browser.tsx:164` — escritas condicionadas a canWrite. Falta captura como corretor. | pendente de captura (T34) |
| AC5 | WHILE o usuário não tem `documentos: escrever` oferecer "Abrir pasta" e "Copiar link" no menu da pasta. | `src/components/documents/folder-actions-menu.tsx:35`/36 — Abrir pasta/Copiar link fora da condição canWrite. Falta captura como corretor. | pendente de captura (T34) |
| AC6 | resolver o tenant de toda leitura e escrita de pasta pela sessão, nunca por campo da entrada. | `src/server/__tests__/document-folders-actions.test.ts:90` — tenantA persistido; `src/server/__tests__/document-folders-actions.test.ts:61`/64/135 — estrangeira protegida. `app/(crm)/documentos/page.tsx:58`/70/84 e `src/server/actions/document-folders.ts:22`/35/47/58 — sessão, sem tenant de entrada. | PASS |

### PAGENTE-01 — O agente não enxerga a pasta

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | manter sem mudança neste lote `src/server/integration/context.ts`, as rotas de `app/api/v1/`, `openapi.yaml` e tudo em `n8n/`. | git diff --exit-code origin/main...origin/lote-17 -- src/server/integration/context.ts app/api/v1 openapi.yaml n8n → 0, saída vazia. `src/server/integration/__tests__/document-context.integration.test.ts:67` é teste novo, contexto de produção intacto. | PASS |
| AC2 | WHEN um documento elegível é movido para uma pasta, entre pastas ou para a raiz THEN o sistema SHALL devolver em `getDirectDocumentContext` para o tenant o mesmo resultado de antes da movimentação. | `src/server/integration/__tests__/document-context.integration.test.ts:76`/77/78 — mover raiz→A→B→null; getDirectDocumentContext toEqual(before). `src/server/data/document-folders.ts:106` — só pasta muda. | PASS |

### PRAIZ-01 — Raiz de Documentos

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHILE nenhuma pasta está aberta mostrar a seção "Pastas", com a quantidade de pastas ("1 pasta" ou "N pastas") e um cartão por pasta do tenant, antes da seção "Todos os arquivos". | `app/(crm)/documentos/page.tsx:147`/160 — grade antes dos arquivos; `src/components/documents/folders-grid.tsx:27`/28/40 — seção/contagem/cartão; `src/components/documents/__tests__/folder-presentation.test.ts:69` — 1/N pastas. Falta captura da raiz. | pendente de captura (T34) |
| AC2 | mostrar em cada cartão o nome, a quantidade ("1 arquivo" ou "N arquivos", inclusive "0 arquivos"), o rótulo de última atualização e o tamanho total por `formatFileSize`. | `src/components/documents/folders-grid.tsx:46`/47/54/55 — nome, contagem, data, tamanho; `src/components/documents/__tests__/folder-presentation.test.ts:121` — rótulos completos. Falta captura do cartão. | pendente de captura (T34) |
| AC3 | montar o rótulo de última atualização no servidor, no fuso `America/Sao_Paulo`: "Atualizada agora" (menos de 1 min, ou data futura), "Atualizada há N min" (de 1 a 59 min), "Atualizada há N h" (60 min ou mais, no mesmo dia), "Atualizada ontem" (dia anterior), "Atualizada em D de mmm." (antes de ontem, mesmo ano) e "Atualizada em D de mmm. de AAAA" (outro ano). | `src/components/documents/__tests__/folder-presentation.test.ts:81`/89 — agora, 1/59 min, 60 min, futuro, ontem, mesmo/outro ano e viradas civis; `src/components/documents/folder-presentation.ts:24`/37; `app/(crm)/documentos/page.tsx:86`/87 — now único no servidor. | PASS |
| AC4 | WHEN o usuário clica num cartão de pasta THEN o sistema SHALL navegar para `/documentos?pasta=<id>`. | `src/components/documents/folders-grid.tsx:40` — href folderHref(id); src/lib/__tests__/document-folders.test.ts:65 — helper de URL. Falta clique/captura real. | pendente de captura (T34) |
| AC5 | oferecer em cada cartão um menu com "Abrir pasta" e "Copiar link" e, para quem tem `documentos: escrever`, "Renomear" e "Excluir". | `src/components/documents/folder-actions-menu.tsx:35`/36/37 — opções e canWrite; `src/components/documents/folders-grid.tsx:50` — menu dentro de ClickableCard. Falta captura e conferir clique sem navegar. | pendente de captura (T34) |
| AC6 | WHILE nenhuma pasta está aberta listar em "Todos os arquivos" os documentos de todas as pastas e os sem pasta. | `app/(crm)/documentos/page.tsx:80` — folderFilterFor(raiz); `src/components/documents/__tests__/documents-page-state.test.ts:23` — undefined; `src/server/data/__tests__/documents.test.ts:217` — todos os 6; `src/server/data/index.ts:613`. Falta raiz autenticada (T32). | pendente de captura (T34) |
| AC7 | mostrar na visão em lista a coluna "Pasta" com o nome da pasta do documento ou "Sem pasta". | `src/components/documents/documents-table.tsx:85`/87/91 — coluna e fallback Sem pasta; `src/components/documents/documents-browser.tsx:234` — passa mapa. Falta captura em lista. | pendente de captura (T34) |
| AC8 | WHILE nenhuma pasta está aberta oferecer em "Filtrar e ordenar" o submenu "Pasta" com "Todas" e "Sem pasta", em que "Sem pasta" grava `pasta=sem-pasta` na URL e lista só documentos sem pasta. | `src/components/documents/documents-toolbar.tsx:143`/148/151 — submenu e URLSearchParams.set; `src/components/documents/__tests__/documents-page-state.test.ts:22` — filtro; `src/server/data/__tests__/documents.test.ts:215` — só rootId. Falta interação/captura. | pendente de captura (T34) |
| AC9 | WHEN um usuário com `documentos: escrever` confirma "Nova pasta" com um nome válido THEN o sistema SHALL criar a pasta e mostrar o cartão dela na grade sem recarga manual da página. | `src/components/documents/folder-name-dialog.tsx:59`/66/67 — action, refresh, fechar; `src/server/__tests__/document-folders-actions.test.ts:91` — revalidatePath. Falta captura da criação refletida na grade. | pendente de captura (T34) |
| AC10 | IF criar ou renomear devolver erro THEN o diálogo SHALL mostrar a mensagem do erro no campo "Nome da pasta" e continuar aberto. | `src/components/documents/folder-name-dialog.tsx:62`/63/64/85 — erro no TextInput e retorno sem fechar; `src/components/documents/__tests__/folder-presentation.test.ts:60` — preserva erro do servidor. Falta captura do diálogo com erro. | pendente de captura (T34) |

### PABRIR-01 — Pasta aberta

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN a URL tem `pasta=<id>` de uma pasta do tenant THEN o sistema SHALL mostrar o caminho "Documentos / <nome da pasta>", com "Documentos" levando a `/documentos`, e listar só os documentos dessa pasta. | `app/(crm)/documentos/page.tsx:69`/80/150 — resolução e filtro; `src/components/documents/folder-header.tsx:15`/16/17 — caminho; `src/components/documents/__tests__/documents-page-state.test.ts:16`/21 — modo/filtro exatos; `src/server/data/__tests__/documents.test.ts:214` — só pasta. Falta página autenticada. | pendente de captura (T34) |
| AC2 | WHILE uma pasta está aberta esconder a seção "Pastas" e o submenu "Pasta" de "Filtrar e ordenar". | `app/(crm)/documentos/page.tsx:147`/157 — grade só raiz; filtro só raiz; `src/components/documents/documents-toolbar.tsx:143` — condicional. Falta captura de pasta aberta. | pendente de captura (T34) |
| AC3 | WHILE uma pasta está aberta aplicar busca, modalidade, categoria, ordem e visão só aos documentos dela, mantendo `pasta` na URL a cada mudança. | `app/(crm)/documentos/page.tsx:80` — conjunção de filtros; `src/server/data/__tests__/documents.test.ts:225` — resultado exato; `src/components/documents/documents-toolbar.tsx:70`/73 e `src/components/documents/documents-browser.tsx:87` — parâmetros preservados. Falta interação/captura de busca/ordem/visão. | pendente de captura (T34) |
| AC4 | WHILE uma pasta está aberta levar "Limpar filtros" para `/documentos?pasta=<id>`. | `src/components/documents/documents-toolbar.tsx:173` — Limpar filtros remove só modalidade/categoria na pasta, preserva q/ordem/visao. `src/components/documents/__tests__/documents-page-state.test.ts:28` cobre apenas helper; `app/(crm)/documentos/page.tsx:183` usa helper no estado vazio. Menu viola a URL exata exigida (G2). | FAIL |
| AC5 | WHILE uma pasta está aberta usar o nome da pasta como título da seção de arquivos, com o menu da pasta ("Copiar link" e, para quem escreve, "Renomear" e "Excluir") ao lado. | `app/(crm)/documentos/page.tsx:165` — heading; `src/components/documents/folder-header.tsx:20`/21 — título/menu sem abrir; `src/components/documents/folder-actions-menu.tsx:35`/37 — opções. Falta captura. | pendente de captura (T34) |

### PUPLOAD-01 — Envio dentro da pasta

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHILE uma pasta está aberta, WHEN o usuário envia um arquivo pelo botão de envio da página THEN o sistema SHALL gravar o documento nessa pasta. | `app/(crm)/documentos/page.tsx:130` — prop folder; `src/components/documents/upload-dialog.tsx:216` — ticket; `src/server/documents/__tests__/repository.test.ts:121`/122 — pasta no commit. Falta envio autenticado pela página/captura. | pendente de captura (T34) |
| AC2 | WHILE uma pasta está aberta mostrar no diálogo de envio o texto `Será salvo na pasta "<nome>".` | `src/components/documents/upload-dialog.tsx:310`/311 — texto literal Será salvo na pasta. Sem captura. | pendente de captura (T34) |
| AC3 | WHEN o envio é feito na raiz THEN o sistema SHALL gravar o documento sem pasta. | `src/server/documents/__tests__/repository.test.ts:125`/129/134 — null/omissão persistem null; `src/components/documents/upload-dialog.tsx:216` — raiz envia null; `app/(crm)/documentos/page.tsx:130` — sem pasta na raiz. | PASS |
| AC4 | aceitar no payload do envio o campo opcional `folderId` (string ou `null`), guardá-lo na intenção de upload e levá-lo ao documento quando o envio é confirmado, pelo callback do provedor ou pela finalização do navegador. | `src/components/documents/__tests__/upload-client.test.ts:38` — clientPayload.folderId exato; `src/server/documents/__tests__/upload-route.test.ts:97` — payload ao reserve; `src/server/documents/__tests__/uploads.test.ts:123` — repasse/null; `src/server/documents/__tests__/repository.test.ts:116`/121/122 — intenção/documento. `src/server/documents/repository.ts:349`; `src/server/documents/uploads.ts:352` — commit comum aos finalizadores. | PASS |
| AC5 | IF o `folderId` do payload não for string nem `null` THEN a rota de envio SHALL responder 400 com `{ "error": "upload_payload_invalid" }`. | `src/server/documents/__tests__/upload-route.test.ts:100`/103/104/105 — número/objeto/boolean/array, status400, corpo upload_payload_invalid, sem reserva. `app/api/documents/upload/route.ts:77`. | PASS |
| AC6 | IF o `folderId` do payload apontar para pasta inexistente, de outro tenant ou não for UUID THEN a rota de envio SHALL responder 404 com `{ "error": "upload_folder_not_found" }`, sem criar intenção de upload. | `src/server/documents/__tests__/upload-route.test.ts:112`/113 — 404 e corpo exato; `src/server/documents/__tests__/repository.test.ts:140`/141/143 — foreign/ausente/abc sem intenção; `src/server/documents/__tests__/uploads.test.ts:131` — UUID inválido sem consulta. `app/api/documents/upload/route.ts:132`; `src/server/documents/repository.ts:215`/219. | PASS |
| AC7 | WHEN a rota responde `upload_folder_not_found` THEN o diálogo de envio SHALL mostrar "A pasta escolhida não existe mais. Recarregue a página e envie de novo." | `src/components/documents/__tests__/upload-client.test.ts:42` — erro/code/mensagem exatos; `src/components/documents/upload-client.ts:39` — tradução; `src/components/documents/upload-dialog.tsx:222` — usa erro do ticket. Falta captura do diálogo exibindo a mensagem. | pendente de captura (T34) |
| AC8 | IF a pasta for excluída depois da reserva e antes da confirmação do envio THEN o sistema SHALL gravar o documento sem pasta. | `src/server/documents/__tests__/repository.test.ts:151`/156 — pasta excluída após reserva, commit null. `src/server/documents/repository.ts:349`; `src/db/schema.ts:744` — SET NULL na intenção. | PASS |

### PLINK-01 — Copiar link da pasta

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN o usuário escolhe "Copiar link" THEN o sistema SHALL copiar `<origem da página>/documentos?pasta=<id>` para a área de transferência e mostrar o aviso "Link copiado". | `src/components/documents/folder-actions-menu.tsx:27`/28 — origem+folderHref, clipboard e toast Link copiado. Sem teste de interação/captura. | pendente de captura (T34) |
| AC2 | IF a cópia para a área de transferência falhar THEN o sistema SHALL mostrar o aviso de erro "Não foi possível copiar o link." | `src/components/documents/folder-actions-menu.tsx:29`/30 — catch, toast Não foi possível copiar o link. Sem teste de interação/captura. | pendente de captura (T34) |

### PVAZIO-01 — Estados vazios

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHILE o tenant não tem pastas mostrar na seção "Pastas" o estado "Nenhuma pasta ainda" com a descrição "Crie uma pasta para organizar os arquivos." para quem tem `documentos: escrever` e "As pastas criadas pela equipe aparecem aqui." para quem só lê. | `src/components/documents/folders-grid.tsx:30`/33/34/35 — título e descrição por permissão. Falta captura sem pastas, escrever/ler. | pendente de captura (T34) |
| AC2 | WHEN a pasta aberta não tem documentos e nenhum filtro nem busca está ativo THEN o sistema SHALL mostrar "Esta pasta está vazia" com "Envie um arquivo ou mova documentos para cá." para quem escreve e "Nenhum arquivo nesta pasta." para quem só lê. | `app/(crm)/documentos/page.tsx:167`/169/170 — vazio sem filtros e descrição por permissão. Falta captura de pasta vazia. | pendente de captura (T34) |
| AC3 | WHEN a pasta aberta tem documentos e o filtro ou a busca não encontra nenhum THEN o sistema SHALL mostrar "Nenhum resultado encontrado" com o link "Limpar filtros". | `app/(crm)/documentos/page.tsx:178`/179/183 — Nenhum resultado/limpar; `src/components/documents/__tests__/documents-page-state.test.ts:28` — mantém pasta. Falta captura de busca sem resultado. | pendente de captura (T34) |
| AC4 | IF `pasta` não for UUID nem `sem-pasta`, ou apontar para pasta inexistente ou de outro tenant, THEN o sistema SHALL responder com HTTP 200 e o estado "Pasta não encontrada", com a descrição "Esta pasta não existe ou foi excluída." e o link "Voltar para Documentos", sem lista de documentos, sem busca e sem botões de envio e de nova pasta. | `src/components/documents/__tests__/documents-page-state.test.ts:11`/17 — modo inexistente; `app/(crm)/documentos/page.tsx:107`/112/113/114 — retorno sem busca/lista/ações, sem notFound(). HTTP200 autenticado sem prova: pendente T33/T34. | pendente de captura (T34) |
| AC5 | mostrar o mesmo estado e o mesmo texto para pasta inexistente e para pasta de outro tenant. | `src/server/data/__tests__/document-folders.test.ts:139`/140 — ambos null; `src/components/documents/__tests__/documents-page-state.test.ts:17` — mesmo modo; `app/(crm)/documentos/page.tsx:107` — único ramo/texto. Falta comparação autenticada/captura. | pendente de captura (T34) |

### PSEED-01 — Seed de pastas

| AC | Desfecho exigido pela spec | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| AC1 | WHEN `runSeed` roda THEN o sistema SHALL apagar todas as linhas de `document_folders` e inserir, para cada tenant do seed, as pastas "Contratos", "Lançamentos", "Documentação legal", "Financiamento", "Tabelas de preço" e "Treinamento da equipe", com id determinístico `id("folder:<tenant>:<chave>")`. | `src/db/__tests__/seed.test.ts:113`/115/119 — nomes/ids literais, extra removida no reseed; `src/db/__tests__/seed.test.ts:122` — documentos vazios. `src/db/seed.ts:741`/847/1053/1083 — seis definições, ids, limpeza/inserção. | PASS |
| AC2 | WHEN `runSeed` roda duas vezes seguidas THEN o sistema SHALL terminar com as mesmas pastas e os mesmos ids. | `src/db/__tests__/seed.test.ts:118`/120 — dois runSeed; `src/db/__tests__/seed.test.ts:119`/121 — toEqual(expected), mesmos ids e sem extras. `src/db/seed.ts:847`. | PASS |

## Edge Cases

| # | Desfecho exigido | Evidência de teste e implementação | Resultado |
| --- | --- | --- | --- |
| 1 | Só espaços → nome-invalido | `src/server/__tests__/document-folders-actions.test.ts:98` e `:102` — erro exato/linhas intactas; `src/server/actions/document-folders.ts:20`. | PASS |
| 2 | 120 após trim aceita; 121 recusa | `src/server/__tests__/document-folders-actions.test.ts:108`; `src/components/documents/__tests__/folder-presentation.test.ts:42` e `:49` — 120 com/sem espaços, 121 sem chamar action; `src/components/documents/folder-name-dialog.tsx:21`. | PASS |
| 3 | Renomear para o próprio nome → ok:true | `src/server/__tests__/document-folders-actions.test.ts:114` — resultado exato; `src/server/data/document-folders.ts:55`. | PASS |
| 4 | Excluído fora das contagens | `src/server/data/__tests__/document-folders.test.ts:110` — count 2; `:82` — movedToRootCount 1; `src/server/data/document-folders.ts:15` e `:80`. | PASS |
| 5 | Soma >2 GiB exata como number | `src/server/data/__tests__/document-folders.test.ts:110` — totalSizeBytes:3000000019; `src/server/data/document-folders.ts:19`. | PASS |
| 6 | Filtro substitui pasta, sem duplicar parâmetro | `src/components/documents/documents-toolbar.tsx:73` — URLSearchParams.set; `:148` — handler do submenu. Sem interação/captura. | pendente de captura (T34) |
| 7 | Mesmo id repetido move/conta uma vez | `src/server/data/__tests__/document-folders.test.ts:168` — movedCount:1; `src/server/data/document-folders.ts:90`. | PASS |
| 8 | Todos já no destino → count0 e datas intactas | `src/server/data/__tests__/document-folders.test.ts:169` e `:170` — movedCount:0, updatedAt anterior; `src/server/data/document-folders.ts:105`. | PASS |
| 9 | Excluir a pasta aberta volta à raiz | `src/components/documents/folder-header.tsx:21`; `src/components/documents/delete-folder-dialog.tsx:58` — replace no sucesso; sem captura. | pendente de captura (T34) |

## Sensor de discriminação

Cópia isolada `krivo-t36-sensor` no diretório temporário do sistema, detached em `54599b5`; reprodução da base em outra cópia `krivo-t36-main`, detached em `9d24d51`. Nenhum `git stash`. Dependências locais acessadas por junctions, sem copiar o ambiente local; o carregador normal fornece o ambiente aos processos de teste sem imprimi-lo. Baseline do worktree real antes/depois do sensor: `git status --porcelain` vazio. Cada mutação foi aplicada e restaurada só na cópia; os dois worktrees foram descartados ao terminar.

Os comandos abaixo são `vitest run <arquivo> -t <filtro>` dentro da cópia. Os skips informados são exclusivamente casos fora do filtro, não testes editados/desabilitados. Todos os casos relevantes passaram na rodada sem mutações. Mortos por asserção, não por erro de compilação, timeout ou importação.

| Alvo | Mutação na cópia / evidência | Arquivo e filtro | Resultado observado |
| --- | --- | --- | --- |
| M1 | `src/server/data/document-folders.ts:16`: retirar WHERE de tenant do resumo; `src/server/data/__tests__/document-folders.test.ts:112` recebeu true em vez de false para pasta estrangeira. | `src/server/data/__tests__/document-folders.test.ts -t "conta só documentos ativos"` | **Morto**, saída 1, 1 FAIL / 12 fora do filtro. |
| M2 | `src/server/data/document-folders.ts:15`: retirar isNull(deletedAt) do join; resumo divergiu da igualdade de `src/server/data/__tests__/document-folders.test.ts:109`. | Mesmo arquivo/filtro de M1. | **Morto**, saída 1, 1 FAIL / 12 fora do filtro. |
| M3 | `src/server/data/document-folders.ts:20`: usar só row.updatedAt; data diferiu de UPLOADED em `src/server/data/__tests__/document-folders.test.ts:110`. | Mesmo arquivo/filtro de M1. | **Morto**, saída 1, 1 FAIL / 12 fora do filtro. |
| M4 | `src/server/data/document-folders.ts:98`: tirar tenant da busca de destino; recebeu moved/count1 em vez de folder_not_found em `src/server/data/__tests__/document-folders.test.ts:184`. | `src/server/data/__tests__/document-folders.test.ts -t "recusa selecoes invalidas"` | **Morto**, saída 1, 1 FAIL / 12 fora do filtro. |
| M5 | `src/server/data/document-folders.ts:103`: remover recusa quando faltam ids; recebeu moved/count1 em vez de document_not_found em `src/server/data/__tests__/document-folders.test.ts:198`. | `src/server/data/__tests__/document-folders.test.ts -t "um documento ausente"` | **Morto**, saída 1, 1 FAIL / 12 fora do filtro. |
| M6 | `src/server/actions/document-folders.ts:18`: substituir a primeira guarda (criar) por null; corretor criou pasta em `src/server/__tests__/document-folders-actions.test.ts:145`. | `src/server/__tests__/document-folders-actions.test.ts -t "corretor é recusado nas três"` | **Morto**, saída 1, 1 FAIL / 11 fora do filtro. |
| M7 | `src/server/documents/repository.ts:349`: folderId:null no commit; recebeu null em vez do UUID em `src/server/documents/__tests__/repository.test.ts:121`. | `src/server/documents/__tests__/repository.test.ts -t "T10: reserva e confirmação preservam"` | **Morto**, saída 1, 1 FAIL / 28 fora do filtro. |
| M8 | `src/components/documents/documents-page-state.ts:30`: pasta aberta devolve undefined; igualdade do filtro em `src/components/documents/__tests__/documents-page-state.test.ts:21` falhou. | `src/components/documents/__tests__/documents-page-state.test.ts` | **Morto**, saída 1, 1 FAIL / 4 PASS. |
| M9 | `src/db/schema.ts:678` SET NULL→CASCADE e `scripts/document-folders/schema.sql:24` SET NULL→CASCADE, simultaneamente; FK preexistente no banco permaneceu n. | `src/db/__tests__/schema-document-folders.test.ts` (arquivo completo) | **Sobrevivente**, saída 0, 5 PASS. **G1**: teste lê o estado antigo, sem instalar a FK mutada nem verificar paridade de Drizzle/SQL. |
| M10 | `src/components/documents/folder-presentation.ts:24`: fuso UTC no lugar de São Paulo, processo TZ=UTC; `src/components/documents/__tests__/folder-presentation.test.ts:89` recebeu Atualizada há 2 h em vez de Atualizada ontem. | `src/components/documents/__tests__/folder-presentation.test.ts` | **Morto**, saída 1, 1 FAIL / 38 PASS. |
| M9b, complementar | FK instalada de documents.folder_id temporariamente alterada para CASCADE **somente no banco de teste**, antes da mesma prova de exclusão; `src/db/__tests__/schema-document-folders.test.ts:65` recebeu undefined, documento apagado. | `src/db/__tests__/schema-document-folders.test.ts -t "apagar pasta zera"` | **Morto**, saída 1, 1 FAIL / 4 fora do filtro. FK restaurada em finally para SET NULL; consulta confirmou confdeltype=n; rodada final 5/5 PASS e verify=[]. |

**Resultado obrigatório: FAIL, 9/10 mortos.** M9b demonstra que a asserção percebe a exclusão indevida quando a FK é realmente instalada; M9 demonstra que o teste não percebe a regressão nos artefatos entregues. Não se declarou que um arquivo de configuração mutado mudou automaticamente o banco. Não se rodou drizzle-kit ou seed por CLI.

## Capturas e critérios autenticados pendentes (T34)

Todos os cenários seguem sem captura. Lista de T34 preservada, incluindo variações:

1. Raiz com pastas em grade.
2. Raiz em lista, com coluna Pasta.
3. Pasta aberta com arquivos e caminho.
4. Busca dentro da pasta, com resultado e nenhum resultado.
5. Nova pasta com erro de nome duplicado e cartão atualizado após sucesso.
6. Renomear, com nome atual/erro.
7. Exclusão com 1 e N arquivos, cancelamento e retorno à raiz ao excluir a aberta; cópia de pasta vazia também sem confirmação visual.
8. Mover para pasta, pasta atual/“Sem pasta” e confirmação.
9. Edição com campo Pasta.
10. Envio dentro da pasta e mensagens de erro.
11. Aviso Link copiado (e recusa da área de transferência).
12. Raiz sem pastas para quem escreve e para quem lê.
13. Pasta vazia para quem escreve e para quem lê.
14. Pasta não encontrada para inválida, inexistente e estrangeira; HTTP200 autenticado, mesmo texto, sem lista/busca/ações (T33).
15. Menu como corretor; escrituras ocultas, abrir/copiar disponíveis.
16. Raiz e pasta aberta em 375px, sem rolagem horizontal.

Também falta conferir que abrir o menu do cartão não navega, os textos da lib em português e o console do servidor na raiz autenticada (T32). Não houve tentativa de substituir a extensão do Chrome por outro navegador.

## Desvios aprovados e sua cobertura

| Desvio | Registro conferido | Cobertura / situação |
| --- | --- | --- |
| T2: identidade de realSteps → comportamento | [PR #9 A1](https://github.com/Arthur1050/crivo/pull/9), seção final; diff remove só duas identidades. `.specs/features/lote-17-pastas-de-documentos/tasks.md:180` descreve comportamento mas ainda diz “testes existentes intactos”, uma imprecisão textual. | `scripts/__tests__/test-db-push-steps.test.ts:15`, `:27`, `:35`, `:43`: ordem, mesma URL, ambas as falhas propagadas e quatro combinações de conferências; identidades restantes em `scripts/__tests__/test-db-push.test.ts:207`. Passaram no recorte. |
| T10–T12: redistribuição de commits | [PR #11 A2](https://github.com/Arthur1050/crivo/pull/11); `.specs/features/lote-17-pastas-de-documentos/tasks.md:354`, `:377`, `:400`; commits 2b8cefa/fbd1b4e/0bc8e3a. | Testes T10 de intenção/commit, T11 de repasse/validação e T12 de parsing/400/404 passaram. Contrato final mantido. |
| T19: validateName no envio em vez de maxLength | [PR #10 B1](https://github.com/Arthur1050/crivo/pull/10), interpretações autorizadas; `.specs/features/lote-17-pastas-de-documentos/design.md:463` ainda cita maxLength. | `src/components/documents/folder-name-dialog.tsx:21`; `src/components/documents/__tests__/folder-presentation.test.ts:42`, `:49`, `:57`: 120 após trim, 121 sem action e erro do servidor. PASS lógico, captura pendente. |
| T20: erro ao fim da descrição do AlertDialog | Mesmo PR #10; slot textual da lib documentado. | `src/components/documents/delete-folder-dialog.tsx:25`; `src/components/documents/__tests__/folder-presentation.test.ts:19`: consequência 0/1/3 preservada, erro anexado e uma tentativa; sucesso em `:33`. PASS lógico, captura pendente. |
| DeleteFolderConfirmation sem mensagem para exceção de rede | Limitação explicitamente informada na atribuição de T36; não consta do corpo do PR #10 nem do design/tasks. Este relatório a registra. | `src/components/documents/delete-folder-dialog.tsx:52` só tem try/finally (`:61`), sem catch para rejeição da action. Loading é liberado, mas não há mensagem controlada. Sem teste da rejeição. A spec não define desfecho para exceção de transporte; observação conhecida, não convertida em AC inventado ou PASS de erro de rede. |

As emendas documentais de T19/T20 e a frase de T2 ficam para o fechamento; não alterei o contrato para esconder desvios já autorizados.

## Gaps para tasks de correção (sem implementação nesta T36)

### G1 — Alta: sensor do schema não detecta CASCADE nos artefatos entregues

- **Requisito:** PBANCO-01 AC1; alvo obrigatório 9 do design §9; protege PMOD-01 AC4/AC6.
- **Onde:** `src/db/__tests__/schema-document-folders.test.ts:50` e `:78`; `scripts/document-folders/schema.sql:22`; `src/db/schema.ts:678`.
- **Falta:** prova que o SQL realmente cria a FK com SET NULL quando ela não existe e prova de paridade com o schema Drizzle. O SQL atual é correto na leitura, e o banco atual também; o problema demonstrado é cobertura insuficiente. `IF NOT EXISTS` mantém a FK antiga, e os testes consultam esse estado em vez da configuração mutada.
- **Task proposta:** exercitar criação da FK a partir do SQL entregue em estado controlado de teste, conferir a configuração Drizzle e as regras de exclusão; restaurar todo estado em finally. Não enfraquecer as asserções existentes. A forma concreta de isolamento fica com o worker de correção.
- **Gate de reverificação:** testes originais verdes; mutante simultâneo de SQL/Drizzle para CASCADE deve falhar por asserção. M9b sozinho não satisfaz esse gate.

### G2 — Média: Limpar filtros do menu não produz a URL de PABRIR-01 AC4

- **Requisito:** PABRIR-01 AC4.
- **Onde:** `src/components/documents/documents-toolbar.tsx:69` e `:173`; `src/components/documents/__tests__/documents-page-state.test.ts:27` cobre somente o helper; `app/(crm)/documentos/page.tsx:183` usa o helper somente no estado vazio.
- **Prova:** aplicar literalmente o handler da pasta aberta sobre `pasta=<id>&q=contrato&categoria=exemplo&modalidade=novo&ordem=nome&visao=lista` resulta em `/documentos?pasta=<id>&q=contrato&ordem=nome&visao=lista`; a spec exige `/documentos?pasta=<id>`. Não é relato de captura: é reprodução da transformação de URL do código.
- **Task proposta:** alinhar o controle do menu à URL final exigida e testar o caminho real da barra com parâmetros simultâneos; se o produto quiser preservar parâmetros, o orquestrador deve emendar a spec explicitamente, sem PASS retroativo.
- **Gate de reverificação:** menu e link de estado vazio levam à URL exata; busca/filtros/ordenação/visão continuam escopados à pasta ao mudar individualmente. Conferência visual na T34.

### G3 — Pendente de captura: T32/T33/T34

31 ACs e 2 Edge Cases aguardam as telas listadas acima. Não são 33 bugs de implementação inferidos; são evidências ausentes. Não iniciar T37 como fechamento PASS antes de capturar e avaliar esses cenários. Não houve correção visual nesta sessão.

## Qualidade e conclusão

Superfície de produção limitada às pastas, projeções, upload e página; extrações de helpers exigidas pelo compartilhamento/mocks. Nenhuma mudança de API v1, contexto ou n8n. Componentes novos seguem Astryx, sem introduzir wrapper de layout em div/span, CSS próprio ou style inline. Propriedades novas dos componentes existentes são opcionais; data é preparada no servidor. A cobertura de composição e interação continua aberta; a cobertura de schema tem G1; a de limpar filtros tem G2. Nenhum código/teste foi corrigido pelo Verifier.

**Veredito final: FAIL.** Dados e regras centrais passaram no recorte; os gates estáticos finais passaram; as falhas conhecidas de T35 foram classificadas com reprodução independente. Isso não satisfaz o sensor obrigatório nem a exigência de captura. Encaminhar G1/G2 a outro worker e retornar para reverificação, no máximo três ciclos. Produção não foi tocada e nenhum merge em main foi feito.

## Lições candidatas (AD-045 / T38)

Registradas apenas como candidatas pelo `lessons.py`, sem promoção, descarte ou alteração de recorrência de lições existentes. O script atualizou `.specs/lessons.json` e renderizou `.specs/LESSONS.md`; esses registros acompanham a documentação da T36 para a revisão posterior de T38.

| ID | Sinal / fonte | Texto |
| --- | --- | --- |
| L-092 | surviving_mutant; M9 / PBANCO-01 AC1 / `src/db/__tests__/schema-document-folders.test.ts:78` | Nos testes de schema, prove a regra de exclusão a partir do SQL e do Drizzle entregues, além de conferir a FK já instalada. |
| L-093 | ac_gap; PABRIR-01 AC4 / `src/components/documents/documents-toolbar.tsx:173` | Exercite cada controle de limpar filtros com busca e ordenação ativas, conferindo a URL final completa. |

Os desvios autorizados não geraram novas lições por si: T19/T20 têm adequação à API da lib documentada e testes; T2/T10–T12 preservam comportamento. A captura ausente reforça L-009, já confirmada; não se criou duplicata nem se inflou recurrence. A falha de reengajamento foi reproduzida fora deste lote e não gerou candidata sobre código de pastas.

## Gate determinístico de fechamento

Comando executado: `python .agents/skills/tlc-spec-driven/scripts/validate_state.py lote-17-pastas-de-documentos`.

**Código de saída: 1.** Saída literal:

```text
ERROR lote-17-pastas-de-documentos: validation.md verdict is FAIL - route the ranked gaps to fix tasks, then re-verify (feature is not done)

validate_state: 1 error(s) across [lote-17-pastas-de-documentos]
```

O gate recusou o fechamento corretamente. O arquivo tem evidência e veredito preenchido; o lote continua reprovado pelos gaps e pelas pendências, sem mudar o veredito para obter saída 0.

## Liberação

Todas as execuções de banco terminaram. A FK foi restaurada para SET NULL e a conferência final de schema passou. Os worktrees temporários foram descartados, e o porcelain real permaneceu idêntico ao baseline vazio antes da redação deste relatório. **banco liberado**.
