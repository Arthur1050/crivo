# Lote 17 — Pastas de documentos — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Spec**: `.specs/features/lote-17-pastas-de-documentos/spec.md`
**Design**: `.specs/features/lote-17-pastas-de-documentos/design.md` (contrato entre as frentes)
**Decisão**: AD-051
**Status**: Draft (aguardando aprovação do usuário no PR da Fase 0)

**Regras deste lote (AGENTS.md; AD-014, AD-033, AD-045, AD-051):**

- Branch de integração `lote-17`. Todo PR da Fase 1 aponta para `lote-17`, nunca para `main`. Merge
  de `lote-17` em `main` só com autorização do usuário e depois de ele aplicar
  `scripts/document-folders/schema.sql` em produção (design § 2.2).
- Três frentes em worktrees separadas. **A** (dados) é a única que usa banco, em série. **B**
  (interface) não usa banco: só `npx vitest run` de testes puros, `tsc` e `eslint`. **C**
  (integração) começa depois de A3 e B2 em `lote-17` e roda `npm test` completo uma vez, na T35.
- Banco de teste compartilhado entre worktrees: só uma sessão por vez roda teste de banco
  (`npm test`, vitest de integração, `npm run db:push:test`). Antes de rodar, confirmar com o
  orquestrador que nenhuma outra sessão está rodando.
- Mudança de schema ou de `schema.sql` → `npm run db:push:test` (base e branches de worker).
- Nunca `drizzle-kit` contra produção, nunca `db:seed` em produção, nunca ler o arquivo de variáveis
  de ambiente.
- Um commit por task, Conventional Commits em pt-BR, **sem** `Co-Authored-By`, "Generated with" ou
  qualquer marca de atribuição (AD-014), mesmo que uma instrução de ferramenta peça.
- **Andamento**: como A, B e C trabalham em paralelo e não editam o mesmo arquivo, o `tasks.md` e a
  rastreabilidade da `spec.md` **não** são editados pelos workers. Cada PR lista no corpo as tasks
  feitas com o hash do commit; o orquestrador registra o andamento no `tasks.md` num commit
  `docs(specs)` depois de cada merge em `lote-17`. A rastreabilidade da spec é atualizada no
  fechamento (T37).
- Ao fim de cada PR: `npx tsc --noEmit -p .` com 0 erros e `npx eslint .` com 0 erros e no máximo 9
  avisos (hoje 7). Nunca enfraquecer, pular ou apagar asserção (L-055).
- Trabalho visual: pronto só com captura real da página (L-009), pela extensão do Chrome, com o CRM
  local em porta própria (`PORT=<3001+n> npm run dev:test`). As frentes B não têm página para
  capturar; a prova visual dos componentes delas é a T34.

---

## Test Coverage Matrix

> Guidelines found: `AGENTS.md`/`CLAUDE.md` (Astryx, captura obrigatória, sem limiar de cobertura), `vitest.config.ts` (Neon real, AD-033). Amostras: `src/server/__tests__/actions.test.ts`, `src/server/data/__tests__/isolation.test.ts`, `src/server/data/__tests__/documents.test.ts`, `src/server/documents/__tests__/upload-route.test.ts`, `src/components/documents/__tests__/upload-client.test.ts`, `scripts/__tests__/test-db-push.test.ts`, `src/db/__tests__/schema-vitrine.test.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Lib pura (`src/lib/document-folders.ts`) | unit | 1:1 com os ACs de parâmetro, UUID e mensagens; todos os ramos | `src/lib/__tests__/*.test.ts` | `npx vitest run src/lib/__tests__/document-folders.test.ts` |
| Schema e SQL (`src/db/schema.ts`, `scripts/document-folders/*`) | integration | Cascata, `set null` em documentos e intenções, índice único sem diferenciar maiúsculas, idempotência do SQL, conferência acusando item ausente | `src/db/__tests__/schema-document-folders.test.ts` | `npx vitest run src/db/__tests__/schema-document-folders.test.ts` |
| Script de push (`scripts/test-db-push.ts`) | unit | Ligação de cada etapa real (L-026); ordem e parada no primeiro erro | `scripts/__tests__/test-db-push.test.ts` | `npx vitest run scripts/__tests__/test-db-push.test.ts` |
| DAL (`src/server/data/*.ts`, `src/server/documents/repository.ts`) | integration | Caminhos principais e de erro; linha de outro tenant intocada (L-035); valor de partida diferente do defeito (L-053); trava provada com transação separada (L-052) | `src/server/data/__tests__/*.test.ts`, `src/server/documents/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Upload (`uploads.ts`, rota) | unit | Payload com e sem `folderId`, tipo errado, pasta não encontrada → 404 | `src/server/documents/__tests__/uploads.test.ts`, `upload-route.test.ts` | `npx vitest run <arquivo>` |
| Server actions (`src/server/actions/*.ts`) | integration | Permissão (corretor recusado sem mudar linha, L-001), validação, tenant estrangeiro, sucesso, `revalidatePath` | `src/server/__tests__/*actions*.test.ts` | `npx vitest run <arquivo>` |
| Apresentação pura (`folder-presentation.ts`, `documents-page-state.ts`, `upload-client.ts`) | unit | Todos os ramos; fronteiras exatas de data (L-023); caso vazio (L-081) | `src/components/documents/__tests__/*.test.ts` | `npx vitest run <arquivo>` |
| Componentes e página (`src/components/documents/*.tsx`, `app/(crm)/documentos/page.tsx`) | none (build) + captura real | Lógica fica nos módulos puros (L-003); composição provada por captura na T34 (L-009) | - | Build + captura |
| Docs e registro | none | registro no commit | - | - |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Task com testes | `npx vitest run <arquivos da task>` (com banco: só a frente A, na branch `test`) |
| Schema | Task que muda `schema.ts` ou `schema.sql` | `npm run db:push:test` (sai 0 e a conferência lista 0 problemas em todos os alvos) |
| Build | Toda task de código, antes do commit | `npx tsc --noEmit -p .` (0 erros) + `npx eslint .` (0 erros, ≤ 9 avisos) |
| Full | Uma vez, na T35 | `npm test` (sem outra suíte rodando, L-033) |
| Registro | Captura, gate e docs | Resultado registrado no commit ou no `validation.md` |

---

## Execution Plan

Fase 1 em seis fases de execução. As fases 2–3 (frente A) e 4–5 (frente B) correm em paralelo, em
worktrees diferentes, depois da fase 1; dentro de cada frente, uma task por vez, na ordem. A fase 6
(frente C) começa quando as fases 3 e 5 estão em `lote-17`. A fase 7 é a Fase 2 do lote
(fechamento).

### Phase 1: Contrato (frente A, PR A1)

```
T2 → T3 → T4
T1 → T4
```

### Phase 2: Camada de dados e upload (frente A, PR A2)

```
T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12
```

### Phase 3: Actions, contexto e seed (frente A, PR A3)

```
T12 → T13 → T14 → T15 → T16 → T17
```

### Phase 4: Componentes novos (frente B, PR B1)

```
T1 → T18 → T19 → T20 → T21 → T22 → T23 → T24
T4 → T19
```

### Phase 5: Componentes existentes (frente B, PR B2)

```
T24 → T25 → T26 → T27 → T28
```

### Phase 6: Integração (frente C, PR C1)

```
T17 → T29 → T30 → T31 → T32 → T33 → T34 → T35
T28 → T29
```

### Phase 7: Fechamento (Fase 2 do lote, PR de fechamento)

```
T35 → T36 → T37 → T38
```

---

## PRs da Fase 1

| PR | Frente | Tasks | Base | Depende de | Destrava |
| --- | --- | --- | --- | --- | --- |
| **A1 — contrato** | A | T1–T4 | `lote-17` | — | A2 e B1 |
| A2 — dados e upload | A | T5–T12 | `lote-17` (com A1) | A1 | A3 |
| A3 — actions, contexto e seed | A | T13–T17 | `lote-17` (com A2) | A2 | C1 |
| B1 — componentes novos | B | T18–T24 | `lote-17` (com A1) | A1 | B2 |
| B2 — componentes existentes | B | T25–T28 | `lote-17` (com B1) | B1 | C1 |
| C1 — integração | C | T29–T35 | `lote-17` (com A3 e B2) | A3, B2 | Fase 2 |
| Fechamento | orquestrador + Verifier | T36–T38 | `lote-17` (com C1) | C1 | merge em `main` (autorização do usuário, schema de produção aplicado) |

Cada PR: descrição em português, lista das tasks com hash, saída de `tsc` e `eslint`, testes rodados.

---

## Task Breakdown

### Phase 1: Contrato (frente A, PR A1)

#### T1: Contrato de tipos das pastas

**What**: Tipos, constantes e funções puras de `design.md` § 3 (`DocumentFolderOption`, `DocumentFolderSummary`, `DocumentFolderFilter`, `FolderParam`, `FolderActionErrorCode`, `FolderActionResult`, `FOLDER_ERROR_MESSAGES`, `NO_FOLDER_PARAM`, `NO_FOLDER_LABEL`, `MAX_DOCUMENTS_PER_MOVE`, `FOLDER_NAME_LABEL`, `isUuid`, `parseFolderParam`, `folderHref`).
**Where**: `src/lib/document-folders.ts`
**Depends on**: None
**Reuses**: estilo de `src/lib/permissions.ts` (puro, sem `server-only`)
**Requirement**: PLER-01, PFILT-01, PMOVER-01, PVAZIO-01
**Frente**: A · **PR**: A1

**Done when**:

- [x] `src/lib/__tests__/document-folders.test.ts`: `parseFolderParam` para ausente, `""`, `"sem-pasta"`, UUID minúsculo, UUID maiúsculo (normaliza para minúsculas), array (usa o 1º), `"abc"`, UUID com um caractere a mais → `todas`/`sem-pasta`/`pasta`/`invalida`; `isUuid` com 8-4-4-4-12 válido e inválidos; `folderHref`; as quatro mensagens fixas iguais às da spec
- [x] Teste de pureza: o módulo não importa de `src/server/` nem de `src/db/` (L-020)
- [x] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(documentos): contrato de tipos das pastas`

---

#### T2: SQL das pastas no db:push:test

**What**: `scripts/document-folders/schema.sql` exatamente como em `design.md` § 2.2; `applyDocumentFoldersSql` e `verifyDocumentFoldersState` em `scripts/document-folders/apply.ts`; ligação em `realSteps()` de `scripts/test-db-push.ts` (§ 2.3).
**Where**: `scripts/document-folders/apply.ts` (novo; também `schema.sql` novo e `scripts/test-db-push.ts` modificado)
**Depends on**: None
**Reuses**: `scripts/vitrine/apply.ts` (`withClient`, `applyVitrineSql`, `verifyVitrineState`)
**Requirement**: PBANCO-01
**Frente**: A · **PR**: A1

**Done when**:

- [x] `scripts/__tests__/test-db-push.test.ts`: `realSteps().restoreIndexes` chama `restoreDrizzleBlindIndexes` e `applyDocumentFoldersSql` e `realSteps().verify` junta os problemas das duas conferências — teste que falha se qualquer chamada for removida (L-026); testes existentes intactos
- [x] `verifyDocumentFoldersState` confere tabela, 2 colunas, 3 FKs com `confdeltype` (`c`, `n`, `n`) e 3 índices (inclusive `document_categories_tenant_id_lower_name_idx`), com uma mensagem por item ausente
- [x] Quick + Build passam (a prova contra banco é a T3)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(documentos): aplicar e conferir o schema das pastas no banco de teste`

---

#### T3: Schema Drizzle das pastas

**What**: `documentFolders`, `documents.folderId`, `documents_tenant_folder_idx` e `documentUploadIntents.folderId` (§ 2.1); `folderId` nas projeções `DOCUMENT_LIST_COLUMNS` (`src/server/data/index.ts`) e `listTenantDocuments` (`src/server/documents/repository.ts`), exigidas pelo tipo; `npm run db:push:test` em todos os alvos.
**Where**: `src/db/schema.ts` (modificar; também as duas projeções)
**Depends on**: T2
**Reuses**: `documentCategories` (`src/db/schema.ts:619`)
**Requirement**: PMOD-01, PBANCO-01, PFILT-01
**Frente**: A · **PR**: A1

**Done when**:

- [x] `npm run db:push:test` sai 0 e a conferência lista 0 problemas em todos os alvos
- [x] Nomes de FK em `pg_constraint` iguais aos de `schema.sql`; se divergirem, corrigir `schema.sql` neste commit e registrar
- [x] `src/db/__tests__/schema-document-folders.test.ts`: nome repetido com outra caixa no mesmo tenant recusado (`23505`), mesmo nome em outro tenant aceito (PMOD-01 AC2, AC3); apagar pasta zera `folder_id` de documento e de intenção, que continuam existindo (AC4–AC6); apagar tenant apaga as pastas (AC7); `schema.sql` aplicado duas vezes sem erro e `verifyDocumentFoldersState` = `[]` (PBANCO-01 AC4); com o índice de pasta derrubado dentro de `try/finally` que reaplica o SQL, a conferência acusa o índice (AC3)
- [x] Testes de documentos existentes passam com a coluna nova (`npx vitest run src/server/data/__tests__/documents.test.ts src/server/documents/__tests__/repository.test.ts`)
- [x] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): tabela de pastas e pasta do documento`

---

#### T4: Assinaturas das actions de pasta

**What**: `src/server/actions/document-folders.ts` com as quatro actions e os tipos de entrada exatos de § 5.1, corpos que lançam `new Error("L17: implementado na T13")`/`("...T14")`; `folderId?: string | null` em `UpdateDocumentInput` de `src/server/actions/documents.ts` (só o campo, ignorado até a T15).
**Where**: `src/server/actions/document-folders.ts` (novo; também o campo em `src/server/actions/documents.ts`)
**Depends on**: T1, T3
**Reuses**: `src/server/actions/documents.ts`
**Requirement**: PCRIAR-01, PREN-01, PEXC-01, PMOVER-01, PEDIT-01
**Frente**: A · **PR**: A1

**Done when**:

- [x] Assinaturas idênticas a `design.md` § 5.1 (B compila contra elas)
- [x] Nenhum consumidor ainda (os corpos são trocados nas T13–T15, os consumidores chegam em B e C)
- [x] Build passa; PR A1 aberto para `lote-17` com T1–T4

**Tests**: none (só assinatura; corpos e testes de integração entram nas T13–T15 deste mesmo arquivo)
**Gate**: build

**Commit**: `feat(documentos): assinaturas das actions de pasta`

---

### Phase 2: Camada de dados e upload (frente A, PR A2)

#### T5: Erros do Postgres em módulo próprio

**What**: Mover `pgErrorCode`, `isUniqueViolation` e `isForeignKeyViolation` para `src/server/data/pg-errors.ts` (exportados) e importá-los em `src/server/data/index.ts`, sem mudar comportamento.
**Where**: `src/server/data/pg-errors.ts` (novo; `index.ts` passa a importar)
**Depends on**: T4
**Reuses**: `src/server/data/index.ts:1155-1174`
**Requirement**: PCRIAR-01
**Frente**: A · **PR**: A2

**Done when**:

- [x] `src/server/data/__tests__/pg-errors.test.ts`: código direto, código em `.cause` (forma do `DrizzleQueryError`), sem código → `undefined`
- [x] `npx vitest run src/server/data/__tests__/documents.test.ts` passa (categoria duplicada continua recusada)
- [x] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(dados): extrair os códigos de erro do postgres`

---

#### T6: Leitura das pastas

**What**: `listDocumentFolderSummaries` e `getDocumentFolder` (§ 4.1).
**Where**: `src/server/data/document-folders.ts` (novo)
**Depends on**: T5
**Reuses**: `getDocuments` (`src/server/data/index.ts:606`)
**Requirement**: PLER-01, PPERM-01
**Frente**: A · **PR**: A2

**Done when**:

- [x] `src/server/data/__tests__/document-folders.test.ts` (fixture em dois tenants, limpa no `afterAll`): só pastas do tenant (AC1); documento excluído e documento de outro tenant apontando para a pasta fora da contagem e do tamanho (AC2, L-035); `lastActivityAt` = `uploaded_at` mais recente quando é maior que `updated_at`, e = `updated_at` quando é maior (AC3, os dois sentidos, L-053); pasta vazia com 0, 0 e `updated_at` (AC4, L-081); ordem "Ágape", "banco", "Zeta" e empate por id (AC5); `getDocumentFolder` com dono, outro tenant, inexistente e `"abc"` — este último sem consulta, provado com espião no `db` (AC6–AC8)
- [x] `totalSizeBytes` de uma pasta com documentos somando mais de 2^31 bytes exato
- [x] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): leitura das pastas com contagem e tamanho`

---

#### T7: Criar, renomear e excluir pasta na DAL

**What**: `createDocumentFolder`, `renameDocumentFolder` e `deleteDocumentFolder` (§ 4.1).
**Where**: `src/server/data/document-folders.ts` (modificar)
**Depends on**: T6
**Reuses**: `createDocumentCategory`/`deleteDocumentCategory` (`src/server/data/index.ts:2636-2720`), `pg-errors.ts`
**Requirement**: PCRIAR-01, PREN-01, PEXC-01, PMOD-01
**Frente**: A · **PR**: A2

**Done when**:

- [x] Testes em `src/server/data/__tests__/document-folders.test.ts`: criar; nome repetido com outra caixa → `duplicate_name`; duas criações simultâneas com o mesmo nome → uma `created` e uma `duplicate_name`, nenhuma lança (PCRIAR-01 AC4); renomear atualiza nome e `updated_at` (partindo de `updated_at` antigo, L-053); renomear só a caixa aceito; nome de outra pasta → `duplicate_name`; pasta de outro tenant e `"abc"` → `not_found` com a pasta estrangeira intacta (L-001)
- [x] Excluir: `movedToRootCount` conta só não excluídos (documento excluído na pasta não conta); documentos e intenções ficam com `folder_id` nulo e os demais campos iguais (`status`, `category_id`, `deleted_at`) (PEXC-01 AC1, AC2); outro tenant → `not_found` sem apagar
- [x] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): criar, renomear e excluir pasta`

---

#### T8: Mover documentos na DAL

**What**: `moveDocumentsToFolder` (§ 4.1, passos 1–5).
**Where**: `src/server/data/document-folders.ts` (modificar)
**Depends on**: T7
**Reuses**: `updateDocument` (`src/server/data/index.ts:2585`)
**Requirement**: PMOVER-01
**Frente**: A · **PR**: A2

**Done when**:

- [x] Testes: mover 2 documentos de pastas diferentes para uma terceira → `movedCount` 2 e `updated_at` do destino e das duas origens atualizados (AC1, AC3); destino `null` (AC2); id repetido conta uma vez (AC4); `[]`, 101 ids e id não UUID → `invalid_selection` (AC5); pasta de outro tenant → `folder_not_found` sem mudar nada (AC6); um id de outro tenant ou excluído na lista → `document_not_found` e nenhum documento da lista mudou (AC7, tudo ou nada); todos já no destino → `movedCount` 0 e nenhum `updated_at` mudou
- [x] Concorrência (L-052): uma transação separada segura a pasta com `for update` (como a exclusão); a movimentação espera (conferido em `pg_stat_activity`); depois da exclusão confirmada, a movimentação devolve `folder_not_found` sem lançar (AC8)
- [x] `status`, `extracted_text` e `processing_attempt` iguais antes e depois (AC9)
- [x] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): mover documentos entre pastas`

---

#### T9: Filtro de pasta e pasta na edição

**What**: `DocumentFilters.folder` em `getDocuments`; `UpdateDocumentInput.folderId` e a transação de `updateDocument` com `DocumentFolderNotFoundError` (§ 4.2).
**Where**: `src/server/data/index.ts` (modificar)
**Depends on**: T8
**Reuses**: `getDocuments`, `updateDocument`
**Requirement**: PFILT-01, PEDIT-01
**Frente**: A · **PR**: A2

**Done when**:

- [ ] `src/server/data/__tests__/documents.test.ts`: filtro de pasta, "sem pasta", sem filtro (todas) e pasta combinada com modalidade, categoria e busca (PFILT-01 AC1–AC4); cada documento traz `folderId` (AC6)
- [ ] `src/server/data/__tests__/isolation.test.ts`: filtro com pasta de outro tenant → lista vazia (PFILT-01 AC5)
- [ ] `updateDocument` com `folderId` de outra pasta grava e atualiza `updated_at` de origem e destino; `null` tira da pasta; sem a chave mantém; pasta de outro tenant → `DocumentFolderNotFoundError` e nenhum campo gravado, inclusive o nome (PEDIT-01 AC2–AC5 no nível da DAL)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): filtrar documentos e editar a pasta`

---

#### T10: Pasta na intenção de upload

**What**: `folderId` em `CreateUploadIntentInput`; verificação com trava em `createUploadIntent` e desfecho `folder_not_found`; `commitUploadIntent` levando `intent.folderId` ao documento (§ 4.3).
**Where**: `src/server/documents/repository.ts` (modificar)
**Depends on**: T9
**Reuses**: `createUploadIntent`, `commitUploadIntent`
**Requirement**: PUPLOAD-01
**Frente**: A · **PR**: A2

**Done when**:

- [ ] `src/server/documents/__tests__/repository.test.ts`: intenção com pasta do tenant → documento confirmado com a mesma pasta (AC4); sem pasta → documento sem pasta (AC3); pasta de outro tenant → `folder_not_found` e nenhuma intenção criada (AC6); pasta apagada entre reserva e confirmação → documento sem pasta (AC8)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): guardar a pasta na intenção de upload`

---

#### T11: Pasta na reserva do upload

**What**: `CreateDocumentUploadInput.folderId`; `reserve` repassa e devolve `folder_not_found` (id não UUID sem consulta); novos desfechos em `ReserveDocumentUploadResult` e `BeginDocumentUploadResult`.
**Where**: `src/server/documents/uploads.ts` (modificar)
**Depends on**: T10
**Reuses**: `createDocumentUploadIntake`
**Requirement**: PUPLOAD-01
**Frente**: A · **PR**: A2

**Done when**:

- [ ] `src/server/documents/__tests__/uploads.test.ts`: `folderId` repassado ao repositório; `null` e ausente viram `null`; `"abc"` → `folder_not_found` sem chamar o repositório; `folder_not_found` do repositório repassado
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(documentos): reservar upload numa pasta`

---

#### T12: Pasta no payload da rota de upload

**What**: `parseInput` aceita `folderId` ausente, `null` ou string; outro tipo → 400 `upload_payload_invalid`; `folder_not_found` → 404 `{ "error": "upload_folder_not_found" }`.
**Where**: `app/api/documents/upload/route.ts` (modificar)
**Depends on**: T11
**Reuses**: `createDocumentUploadPostHandler`
**Requirement**: PUPLOAD-01
**Frente**: A · **PR**: A2

**Done when**:

- [ ] `src/server/documents/__tests__/upload-route.test.ts`: `folderId` string chega ao `reserve` (AC4); número e objeto → 400 (AC5); `folder_not_found` → 404 com o corpo exato (AC6); testes existentes intactos
- [ ] Quick + Build passam; PR A2 aberto para `lote-17` com T5–T12

**Tests**: unit
**Gate**: quick

**Commit**: `feat(documentos): aceitar a pasta no upload`

---

### Phase 3: Actions, contexto e seed (frente A, PR A3)

#### T13: Actions de criar, renomear e excluir pasta

**What**: Corpos reais de `createDocumentFolderAction`, `renameDocumentFolderAction` e `deleteDocumentFolderAction` (§ 5.1).
**Where**: `src/server/actions/document-folders.ts` (modificar)
**Depends on**: T12
**Reuses**: `createDocumentCategoryAction` (`src/server/actions/documents.ts`), `denyIfForbidden`, `validateName`
**Requirement**: PCRIAR-01, PREN-01, PEXC-01, PPERM-01
**Frente**: A · **PR**: A3

**Done when**:

- [ ] `src/server/__tests__/document-folders-actions.test.ts` (sessão simulada como em `src/server/__tests__/actions.test.ts`): sucesso das três com o tenant da sessão; nome com espaços nas pontas gravado sem eles; `""`, `"   "`, 121 caracteres → `nome-invalido` com a mensagem de `validateName`; 120 aceitos; duplicado → `nome-duplicado` com a mensagem fixa; pasta de outro tenant → `pasta-nao-encontrada` com a pasta intacta
- [ ] Corretor (`documentos: ler`) recusado nas três com `sem-permissao` e contagem de pastas igual antes e depois (PPERM-01 AC2, L-001)
- [ ] `revalidatePath("/documentos")` chamado no sucesso e não na recusa (espião), com teste que falha se a chamada for removida (L-026)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): actions de criar, renomear e excluir pasta`

---

#### T14: Action de mover documentos

**What**: Corpo real de `moveDocumentsToFolderAction`.
**Where**: `src/server/actions/document-folders.ts` (modificar)
**Depends on**: T13
**Reuses**: `moveDocumentsToFolder`
**Requirement**: PMOVER-01, PPERM-01
**Frente**: A · **PR**: A3

**Done when**:

- [ ] Testes: sucesso com `movedCount`; cada `kind` da DAL traduzido para o código e a mensagem fixos; corretor recusado sem mudar `folder_id` de nenhum documento
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): action de mover documentos`

---

#### T15: Pasta na edição do documento

**What**: `updateDocumentAction` passa a usar `folderId` (§ 5.2).
**Where**: `src/server/actions/documents.ts` (modificar)
**Depends on**: T14
**Reuses**: `updateDocument` (T9)
**Requirement**: PEDIT-01
**Frente**: A · **PR**: A3

**Done when**:

- [ ] `src/server/__tests__/actions.test.ts` (bloco de documentos): `folderId` de pasta do tenant grava; `null` tira; ausente mantém (partindo de documento já em pasta, L-053); `"abc"` e pasta de outro tenant → `{ ok: false, error: "Pasta não encontrada." }` e o nome enviado no mesmo pedido não gravado
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `feat(documentos): escolher a pasta na edição`

---

#### T16: Contexto do agente indiferente à pasta

**What**: Teste que prova PAGENTE-01 AC2; nenhuma mudança em código de produção.
**Where**: `src/server/integration/__tests__/document-context.integration.test.ts` (modificar)
**Depends on**: T15
**Reuses**: fixtures do próprio arquivo
**Requirement**: PAGENTE-01
**Frente**: A · **PR**: A3

**Done when**:

- [ ] Documento elegível: `getDirectDocumentContext` igual (`toEqual`) antes e depois de movê-lo para uma pasta, entre pastas e de volta à raiz
- [ ] `git diff lote-17 -- src/server/integration/context.ts app/api/v1 openapi.yaml n8n` vazio (registrado no commit)
- [ ] Quick + Build passam

**Tests**: integration
**Gate**: quick

**Commit**: `test(documentos): contexto do agente não muda com a pasta`

---

#### T17: Pastas no seed

**What**: `FOLDER_DEFS`, limpeza e inserção de pastas (§ 8).
**Where**: `src/db/seed.ts` (modificar)
**Depends on**: T16
**Reuses**: `CATEGORY_DEFS`, `id()`
**Requirement**: PSEED-01
**Frente**: A · **PR**: A3

**Done when**:

- [ ] `src/db/__tests__/seed.test.ts`: cada tenant do seed com as seis pastas e os ids `id("folder:<tenant>:<chave>")`; duas execuções seguidas → mesmos ids e nenhuma pasta a mais (PSEED-01 AC1, AC2)
- [ ] Quick + Build passam; PR A3 aberto para `lote-17` com T13–T17

**Tests**: integration
**Gate**: quick

**Commit**: `feat(seed): pastas de exemplo nos documentos`

---

### Phase 4: Componentes novos (frente B, PR B1)

#### T18: Apresentação das pastas

**What**: `folder-presentation.ts` (§ 6.1) e as fixtures de B a partir do rascunho.
**Where**: `src/components/documents/folder-presentation.ts` (novo; fixtures em `__tests__/folder-fixtures.ts`)
**Depends on**: T1
**Reuses**: `formatFileSize` (`src/lib/format.ts`), `rascunho/mock-folders.ts.txt`
**Requirement**: PRAIZ-01, PEXC-01, PMOVER-01
**Frente**: B · **PR**: B1

**Done when**:

- [ ] `src/components/documents/__tests__/folder-presentation.test.ts`: `formatFileCount` 0/1/2; `formatFolderCount` 1/2; `formatFolderUpdatedLabel` nas fronteiras exatas — 59 s, 1 min, 59 min, 60 min, futuro, 23:59 e 00:00 de São Paulo com o servidor em UTC, ontem, 31/12 → 1/1, outro ano (PRAIZ-01 AC3, L-023); `deleteFolderCopy` para 0, 1 e 3 (PEXC-01 AC4); `folderErrorMessage` para cada código; `folderSelectorOptions` com "Sem pasta" primeiro; `folderIdFromSelector` da sentinela e de `null`
- [ ] Teste de pureza: sem import de `src/server/` (L-020)
- [ ] Quick (sem banco) + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(documentos): apresentação das pastas`

---

#### T19: Diálogos de criar e renomear pasta

**What**: `CreateFolderDialog` e `RenameFolderDialog` (§ 6.2).
**Where**: `src/components/documents/folder-name-dialog.tsx` (novo)
**Depends on**: T18, T4
**Reuses**: `category-manager-dialog.tsx`, `edit-document-dialog.tsx` (Dialog + Layout + TextInput)
**Requirement**: PCRIAR-01, PREN-01, PRAIZ-01
**Frente**: B · **PR**: B1

**Done when**:

- [ ] Erro da action no `status` do `TextInput` com o diálogo aberto (PRAIZ-01 AC10); `router.refresh()` no sucesso
- [ ] Autoverificação Astryx do AGENTS.md (sem `div`, `style`, valor cru)
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): diálogos de criar e renomear pasta`

---

#### T20: Confirmação de exclusão de pasta

**What**: `DeleteFolderDialog` com `deleteFolderCopy` e `afterDeleteHref`.
**Where**: `src/components/documents/delete-folder-dialog.tsx` (novo)
**Depends on**: T19
**Reuses**: `AlertDialog` de `documents-browser.tsx`
**Requirement**: PEXC-01
**Frente**: B · **PR**: B1

**Done when**:

- [ ] Título e descrição de `deleteFolderCopy`; cancelar não chama a action; sucesso → `router.replace(afterDeleteHref)` ou `router.refresh()`
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): confirmação de exclusão de pasta`

---

#### T21: Menu de ações da pasta

**What**: `FolderActionsMenu` com "Abrir pasta", "Copiar link", "Renomear", "Excluir" e o aviso por `useToast`.
**Where**: `src/components/documents/folder-actions-menu.tsx` (novo)
**Depends on**: T20
**Reuses**: `DropdownMenu` do rascunho `folders-grid.tsx.txt`
**Requirement**: PRAIZ-01, PLINK-01, PPERM-01
**Frente**: B · **PR**: B1

**Done when**:

- [ ] Sem `canWrite`, só "Abrir pasta" e "Copiar link" (PPERM-01 AC4, AC5); `showOpen={false}` esconde "Abrir pasta"
- [ ] "Copiar link" com `folderHref` e os dois avisos da spec (PLINK-01)
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): menu de ações da pasta`

---

#### T22: Grade de pastas

**What**: `FoldersGrid` a partir de `rascunho/folders-grid.tsx.txt`, com `FolderCardItem`, estado vazio por papel e `createAction`.
**Where**: `src/components/documents/folders-grid.tsx` (novo)
**Depends on**: T21
**Reuses**: `rascunho/folders-grid.tsx.txt`, `LinkProvider` de `src/components/chats/conversation-list.tsx`
**Requirement**: PRAIZ-01, PVAZIO-01
**Frente**: B · **PR**: B1

**Done when**:

- [ ] Cartão com `href={folderHref(id)}`, nome, contagem, rótulo e tamanho já prontos (sem cálculo de data no cliente)
- [ ] Lista vazia → `EmptyState` com o texto da spec para escrever e para ler (PVAZIO-01 AC1)
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): grade de pastas`

---

#### T23: Diálogo de mover documento

**What**: `MoveDocumentDialog` com `Selector` de pasta.
**Where**: `src/components/documents/move-document-dialog.tsx` (novo)
**Depends on**: T22
**Reuses**: `edit-document-dialog.tsx`
**Requirement**: PMOVER-01
**Frente**: B · **PR**: B1

**Done when**:

- [ ] Pasta atual pré-selecionada (sentinela quando sem pasta); confirmar chama `moveDocumentsToFolderAction({ documentIds: [id], folderId })`; erro em `Banner` com o diálogo aberto
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): diálogo de mover documento`

---

#### T24: Cabeçalho da pasta aberta

**What**: `FolderHeader` com `Breadcrumbs` "Documentos / <pasta>", título e menu.
**Where**: `src/components/documents/folder-header.tsx` (novo)
**Depends on**: T23
**Reuses**: `NavLink` (`src/components/shared/nav-link.tsx`) como modelo de `as={NextLink}`
**Requirement**: PABRIR-01
**Frente**: B · **PR**: B1

**Done when**:

- [ ] `Breadcrumbs label="Caminho"`; "Documentos" com `href="/documentos"`; pasta com `isCurrent`; `FolderActionsMenu` com `showOpen={false}` e `afterDeleteHref="/documentos"` (PEXC-01 AC6)
- [ ] Build passa; PR B1 aberto para `lote-17` com T18–T24

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): cabeçalho da pasta aberta`

---

### Phase 5: Componentes existentes (frente B, PR B2)

#### T25: Coluna Pasta na lista

**What**: Prop opcional `folderById` e coluna "Pasta" depois de "Categoria".
**Where**: `src/components/documents/documents-table.tsx` (modificar)
**Depends on**: T24
**Reuses**: coluna "Categoria" do mesmo arquivo
**Requirement**: PRAIZ-01
**Frente**: B · **PR**: B2

**Done when**:

- [ ] Sem `folderById`, a tabela é a de hoje; com ela, nome da pasta ou `NO_FOLDER_LABEL` (PRAIZ-01 AC7)
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): coluna de pasta na lista de documentos`

---

#### T26: Pasta no diálogo de edição

**What**: Prop opcional `folders` e `Selector` "Pasta" em `EditDocumentDialog`.
**Where**: `src/components/documents/edit-document-dialog.tsx` (modificar)
**Depends on**: T25
**Reuses**: `Selector` "Categoria" do mesmo arquivo
**Requirement**: PEDIT-01
**Frente**: B · **PR**: B2

**Done when**:

- [ ] Com `folders`: campo com a pasta atual e envio de `folderId` (`string | null`) sempre; sem `folders`: campo ausente e `folderId` fora do pedido (PEDIT-01 AC1, AC4)
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): escolher a pasta ao editar o documento`

---

#### T27: Mover pelo menu do documento

**What**: Props opcionais `folders` e `heading` em `DocumentsBrowser`; item "Mover para pasta" para quem escreve; `folderById` repassado à tabela e `folders` ao `EditDocumentDialog`; `MoveDocumentDialog` montado.
**Where**: `src/components/documents/documents-browser.tsx` (modificar)
**Depends on**: T26
**Reuses**: `renderActions` do mesmo arquivo
**Requirement**: PMOVER-01, PABRIR-01, PPERM-01, PEDIT-01
**Frente**: B · **PR**: B2

**Done when**:

- [ ] Sem as props novas, render igual ao de hoje (título "Todos os arquivos", sem item de mover)
- [ ] "Mover para pasta" só com `canWrite` (PPERM-01 AC4)
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): mover documento pelo menu`

---

#### T28: Filtro Sem pasta

**What**: Prop opcional `showFolderFilter` e submenu "Pasta" ("Todas", "Sem pasta") em `DocumentsToolbar`.
**Where**: `src/components/documents/documents-toolbar.tsx` (modificar)
**Depends on**: T27
**Reuses**: submenu "Categoria" do mesmo arquivo
**Requirement**: PRAIZ-01, PABRIR-01
**Frente**: B · **PR**: B2

**Done when**:

- [ ] "Sem pasta" grava `pasta=sem-pasta`, "Todas" remove `pasta`; conta como filtro ativo; outros parâmetros preservados (PRAIZ-01 AC8)
- [ ] Sem a prop, menu igual ao de hoje (PABRIR-01 AC2)
- [ ] Build passa; PR B2 aberto para `lote-17` com T25–T28

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): filtro de documentos sem pasta`

---

### Phase 6: Integração (frente C, PR C1)

#### T29: Estado da página de Documentos

**What**: `resolveDocumentsPageMode`, `folderFilterFor` e `clearFiltersHref` (§ 7.1).
**Where**: `src/components/documents/documents-page-state.ts` (novo)
**Depends on**: T17, T28
**Reuses**: `parseFolderParam` (T1)
**Requirement**: PABRIR-01, PVAZIO-01, PFILT-01
**Frente**: C · **PR**: C1

**Done when**:

- [ ] `src/components/documents/__tests__/documents-page-state.test.ts`: os quatro `FolderParam` com e sem pasta encontrada → três modos; `folderFilterFor` devolve o filtro da pasta aberta e o "sem pasta" da raiz (mata o alvo 8 do sensor); `clearFiltersHref` na raiz e na pasta (PABRIR-01 AC4)
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(documentos): estado da página com pasta aberta`

---

#### T30: Pasta no cliente de upload

**What**: `UploadTicketInput.folderId` e o código `upload_folder_not_found` com a mensagem da spec.
**Where**: `src/components/documents/upload-client.ts` (modificar)
**Depends on**: T29
**Reuses**: `UPLOAD_FAILURE_MESSAGES`
**Requirement**: PUPLOAD-01
**Frente**: C · **PR**: C1

**Done when**:

- [ ] `src/components/documents/__tests__/upload-client.test.ts`: `folderId` no `clientPayload`; resposta 404 `upload_folder_not_found` → mensagem de PUPLOAD-01 AC7
- [ ] Quick + Build passam

**Tests**: unit
**Gate**: quick

**Commit**: `feat(documentos): enviar a pasta no upload`

---

#### T31: Envio dentro da pasta

**What**: Prop opcional `folder` em `UploadDialog`, texto `Será salvo na pasta "<nome>".` e `folderId` no ticket.
**Where**: `src/components/documents/upload-dialog.tsx` (modificar)
**Depends on**: T30
**Reuses**: montagem do ticket no mesmo arquivo
**Requirement**: PUPLOAD-01
**Frente**: C · **PR**: C1

**Done when**:

- [ ] Com `folder`, texto e `folderId: folder.id`; sem `folder`, `folderId: null` (PUPLOAD-01 AC2, AC3)
- [ ] Build passa

**Tests**: none (componente; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): enviar arquivo direto na pasta`

---

#### T32: Raiz com a grade de pastas

**What**: Página no modo raiz (§ 7.2 itens 1–4, modo `raiz`): pastas carregadas, rótulos no servidor, `FoldersGrid`, `CreateFolderDialog`, `DocumentsToolbar showFolderFilter`, `DocumentsBrowser folders`.
**Where**: `app/(crm)/documentos/page.tsx` (modificar)
**Depends on**: T31
**Reuses**: estrutura atual da página
**Requirement**: PRAIZ-01, PFILT-01, PVAZIO-01, PPERM-01
**Frente**: C · **PR**: C1

**Done when**:

- [ ] `searchParams.pasta` lido; `getDocuments` recebe `folderFilterFor(mode)`; `now` único e `toFolderCardItems` no servidor
- [ ] Build passa; CRM local abre a raiz sem erro no console do servidor

**Tests**: none (página; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): grade de pastas na página`

---

#### T33: Pasta aberta e pasta inexistente

**What**: Modos `pasta` e `pasta-inexistente` (§ 7.2 item 4): `FolderHeader`, `UploadDialog folder`, título da seção, estados vazios e "Limpar filtros" com `clearFiltersHref`.
**Where**: `app/(crm)/documentos/page.tsx` (modificar)
**Depends on**: T32
**Reuses**: `EmptyState` e `NavLink` da página
**Requirement**: PABRIR-01, PUPLOAD-01, PVAZIO-01
**Frente**: C · **PR**: C1

**Done when**:

- [ ] `pasta` inexistente, de outro tenant e `abc` → 200 com o mesmo estado e o mesmo texto, sem lista, busca nem botões (PVAZIO-01 AC4, AC5), conferido com `curl -s -o /dev/null -w "%{http_code}"` no CRM local autenticado ou pela captura
- [ ] Build passa

**Tests**: none (página; captura na T34)
**Gate**: build

**Commit**: `feat(documentos): abrir pasta pela url`

---

#### T34: Capturas reais

**What**: Capturas pela extensão do Chrome, com `PORT=<3001+n> npm run dev:test` e o seed do banco de teste, salvas em `.specs/features/lote-17-pastas-de-documentos/capturas/` no momento em que são feitas (L-054): (1) raiz com pastas, grade; (2) raiz em lista com a coluna Pasta; (3) pasta aberta com arquivos e caminho; (4) busca dentro da pasta; (5) diálogo Nova pasta com erro de nome duplicado; (6) diálogo Renomear; (7) confirmação de exclusão com 1 e com N arquivos; (8) diálogo Mover para pasta; (9) edição com o campo Pasta; (10) diálogo de envio dentro da pasta; (11) aviso "Link copiado"; (12) raiz sem pastas (escrever e ler); (13) pasta vazia; (14) pasta não encontrada; (15) menu da pasta como corretor; (16) raiz e pasta aberta em 375 px.
**Where**: `.specs/features/lote-17-pastas-de-documentos/capturas/`
**Depends on**: T33
**Reuses**: procedimento de captura do L16a (`.specs/features/lote-16a-vitrine-lado-crm/capturas/`)
**Requirement**: PRAIZ-01, PABRIR-01, PUPLOAD-01, PLINK-01, PVAZIO-01, PMOVER-01, PEDIT-01, PEXC-01, PPERM-01
**Frente**: C · **PR**: C1

**Done when**:

- [ ] As 16 capturas versionadas; clique no menu do cartão não navega (design § 6.2); textos da lib em português (L-010)
- [ ] Defeito visual achado → correção num commit próprio `fix(documentos): ...` antes deste, no arquivo de quem for (B já está em `lote-17`, sem paralelismo), e captura refeita
- [ ] Se a janela não redimensionar para 375 px (já aconteceu em 2026-10-25), registrar e tentar pelo modo de dispositivo das ferramentas do desenvolvedor antes de desistir

**Tests**: none (registro)
**Gate**: registro

**Commit**: `docs(documentos): capturas das pastas de documentos`

---

#### T35: Gate final da Fase 1

**What**: `npm test` completo uma vez, `npx tsc --noEmit -p .` e `npx eslint .` no topo de `lote-17` com C1; resultado no corpo do PR C1.
**Where**: corpo do PR C1 (sem arquivo)
**Depends on**: T34
**Reuses**: `scripts/test-suite.mjs`
**Requirement**: todos (gate da Fase 1)
**Frente**: C · **PR**: C1

**Done when**:

- [ ] Orquestrador confirmou que nenhuma outra sessão está rodando suíte (L-033)
- [ ] `npm test` passa, com a contagem de arquivos e testes registrada; nenhuma asserção alterada fora das tasks (L-055)
- [ ] `tsc` 0 erros; `eslint` 0 erros e ≤ 9 avisos; PR C1 aberto para `lote-17` com T29–T35

**Tests**: full
**Gate**: full

**Commit**: nenhum (registro no PR)

---

### Phase 7: Fechamento (Fase 2 do lote, PR de fechamento)

#### T36: Verificação independente

**What**: Sub-agente Verifier que não escreveu código do lote grava `validation.md`: PASS/FAIL, evidência `arquivo:linha` ou captura por AC dos 17 requisitos e dos Edge Cases, sensor de discriminação com os 10 alvos obrigatórios de `design.md` § 9 numa cópia isolada (nunca `git stash`), faixa de diff `origin/main...lote-17`, conferência de que `context.ts`, `app/api/v1`, `openapi.yaml` e `n8n/` não mudaram, `tsc`, `eslint` e auditoria de trailer em `origin/main...lote-17` (AD-014). Gaps viram tasks de correção; até 3 ciclos.
**Where**: `.specs/features/lote-17-pastas-de-documentos/validation.md`
**Depends on**: T35
**Reuses**: `.specs/features/lote-16a-vitrine-lado-crm/validation.md` (formato)
**Requirement**: PMOD-01, PBANCO-01, PLER-01, PFILT-01, PCRIAR-01, PREN-01, PEXC-01, PMOVER-01, PEDIT-01, PPERM-01, PAGENTE-01, PRAIZ-01, PABRIR-01, PUPLOAD-01, PLINK-01, PVAZIO-01, PSEED-01
**Frente**: Fechamento

**Done when**:

- [ ] `python3 <skill-dir>/scripts/validate_state.py lote-17-pastas-de-documentos` sai 0 (PASS com evidência)
- [ ] Capturas da T34 citadas por AC visual

**Tests**: none (verificação)
**Gate**: registro

**Commit**: `docs(specs): verificar o lote 17 de pastas de documentos`

---

#### T37: Índice, roadmap, handoff e arquivamento

**What**: Linha do L17 em `.specs/features/INDEX.md`; status do L17 em `ROADMAP-POS-PILOTO.md` (executado, data); Handoff do `STATE.md` (estado, SQL de produção pendente ou aplicado, dívida do `categoryId` sem verificação de tenant); rastreabilidade da `spec.md` com "Verified"; `context.md` com ideias adiadas (seleção múltipla, arrastar e soltar, subpastas, pasta no agente); varredura do AD-029 (`tasks.md` para `.specs/archive/lote-17-pastas-de-documentos/`, `rascunho/` apagado, `ARCHIVED.md`).
**Where**: `.specs/features/INDEX.md` (e os demais documentos listados)
**Depends on**: T36
**Reuses**: linhas do L16a/L16c no `INDEX.md`
**Requirement**: todos (rastreabilidade)
**Frente**: Fechamento

**Done when**:

- [ ] Referências reconciliadas depois da movimentação; `validate_spec.py` e `validate_state.py` saem 0

**Tests**: none (docs)
**Gate**: registro

**Commit**: `docs(specs): fechar o lote 17 de pastas de documentos`

---

#### T38: Revisão de lições

**What**: AD-045: com candidatas destiladas pelo Verifier, despachar um agente Opus 5.5 dedicado (não o Verifier nem um worker) com as candidatas, os critérios da AD-028 e o `validation.md`; ele decide só por `lessons.py`, sem commit; o orquestrador confere o diff do store e commita. Sem candidata, não despacha e registra isso no Handoff.
**Where**: `.specs/lessons.json` (via `lessons.py`)
**Depends on**: T37
**Reuses**: fechamento do L16a (Handoff de 2026-10-10)
**Requirement**: — (processo)
**Frente**: Fechamento

**Done when**:

- [ ] Decisões listadas no relatório de fechamento; nenhum `prune` sem confirmação do usuário

**Tests**: none (processo)
**Gate**: registro

**Commit**: `docs(licoes): decidir as lições do lote 17`

---

## Phase Execution Map

```
Phase 1 (A1):  T1, T2 → T3 → T4
                    │
        ┌───────────┴────────────┐
Phase 2 (A2):  T5 → … → T12      Phase 4 (B1):  T18 → … → T24
Phase 3 (A3):  T13 → … → T17     Phase 5 (B2):  T25 → … → T28
        └───────────┬────────────┘
Phase 6 (C1):  T29 → … → T35
Phase 7:       T36 → T37 → T38
```

A (fases 2–3) e B (fases 4–5) correm ao mesmo tempo em worktrees diferentes; nenhuma das duas edita
arquivo da outra (design § 10). Dentro de cada frente, uma task por vez.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1 | 1 módulo puro | ✅ |
| T2 | SQL + executor + ligação no push (inseparáveis: o SQL só é testável ligado) | ⚠️ coeso |
| T3 | schema + 2 projeções exigidas pelo tipo + push | ⚠️ coeso (sem as projeções o `tsc` quebra) |
| T4 | 1 arquivo de assinaturas + 1 campo de tipo | ⚠️ coeso |
| T5–T17 | 1 função ou grupo coeso de funções num arquivo | ✅ |
| T18–T33 | 1 componente, 1 módulo ou 1 modo da página | ✅ |
| T34–T38 | registro, verificação e fechamento | ✅ |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | — | ✅ |
| T2 | None | — | ✅ |
| T3 | T2 | T2 → T3 | ✅ |
| T4 | T1, T3 | T1 → T4, T3 → T4 | ✅ |
| T5 | T4 | T4 → T5 | ✅ |
| T6–T12 | anterior | cadeia T5 → … → T12 | ✅ |
| T13 | T12 | T12 → T13 | ✅ |
| T14–T17 | anterior | cadeia T13 → … → T17 | ✅ |
| T18 | T1 | T1 → T18 | ✅ |
| T19 | T18, T4 | T18 → T19, T4 → T19 | ✅ |
| T20–T24 | anterior | cadeia T19 → … → T24 | ✅ |
| T25 | T24 | T24 → T25 | ✅ |
| T26–T28 | anterior | cadeia T25 → … → T28 | ✅ |
| T29 | T17, T28 | T17 → T29, T28 → T29 | ✅ |
| T30–T35 | anterior | cadeia T29 → … → T35 | ✅ |
| T36 | T35 | T35 → T36 | ✅ |
| T37 | T36 | T36 → T37 | ✅ |
| T38 | T37 | T37 → T38 | ✅ |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Lib pura | unit | unit | ✅ |
| T2 | Script de push | unit | unit | ✅ |
| T3 | Schema | integration | integration | ✅ |
| T4 | Server actions (só assinatura, corpo lança) | integration | none | ⚠️ aceito: não há comportamento a testar; T13–T15 trocam os corpos no mesmo arquivo com os testes de integração |
| T5 | DAL (helper) | integration | unit | ✅ (função pura de erro; o comportamento de banco segue coberto por `documents.test.ts`, rodado no Done when) |
| T6–T10 | DAL | integration | integration | ✅ |
| T11, T12 | Upload | unit | unit | ✅ |
| T13–T15 | Server actions | integration | integration | ✅ |
| T16 | Teste de contexto | integration | integration | ✅ |
| T17 | Seed | integration | integration | ✅ |
| T18 | Apresentação pura | unit | unit | ✅ |
| T19–T28 | Componentes | none (build) + captura | none | ✅ |
| T29, T30 | Apresentação pura | unit | unit | ✅ |
| T31–T33 | Componente e página | none (build) + captura | none | ✅ |
| T34 | Registro | none | none | ✅ |
| T35 | Suíte completa | full | full | ✅ |
| T36–T38 | Docs e processo | none | none | ✅ |
