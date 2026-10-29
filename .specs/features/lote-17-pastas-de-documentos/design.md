# Lote 17 — Pastas de documentos — Design

**Spec**: `.specs/features/lote-17-pastas-de-documentos/spec.md`
**Decisões que este design segue**: AD-002 (tenant em todo dado), AD-007 (RSC-first, DAL direta),
AD-010/AD-012 (Astryx, utilities por token), AD-011 (`lucide-react`), AD-014 (commit sem trailer),
AD-033 (`db:push:test` em todos os bancos de teste), AD-045 (lições no fechamento), AD-051 (regras de
produto das pastas). Nenhuma AD ativa é emendada.
**Lições aplicadas**: L-002, L-005, L-009, L-010, L-020, L-021, L-026, L-029, L-035, L-052, L-053,
L-068, L-070, L-072, L-073, L-081 (citadas onde pesam).

Este arquivo é o contrato da Fase 1. Os tipos, as assinaturas e as props daqui são o que A, B e C
implementam; quem precisar mudar um deles muda primeiro este arquivo, num commit `docs(specs)`, e
avisa as outras frentes.

---

## 1. Abordagem

| Abordagem | Como | Veredito |
| --- | --- | --- |
| **A. FK simples + verificação de tenant na DAL, com trava de chave** | `documents.folder_id → document_folders(id) on delete set null`; toda escrita que aponta para uma pasta lê a pasta com `tenant_id` e `for key share` na mesma transação | **Escolhida.** É o padrão de `category_id`, o Drizzle gera e confere, e a trava fecha a corrida com a exclusão |
| B. FK composta `(tenant_id, folder_id) → document_folders(tenant_id, id)` | O banco garante o tenant | Recusada: `on delete set null` numa FK composta zeraria `tenant_id` (`not null`); a forma `set null (folder_id)` do Postgres 15 não existe no Drizzle, e o `drizzle-kit push` passaria a brigar com a constraint a cada execução (L-070) |
| C. Tabela de vínculo documento↔pasta | Linha por documento em pasta | Recusada: AD-051 limita a uma pasta por documento; a coluna resolve sem join extra |

A pasta nunca entra no contexto do agente (AD-051 item 3): nenhuma consulta de
`src/server/integration/` é tocada, e mover documento não chama `reconcileTenantDocumentAdmission`
(a pasta não muda a admissão).

---

## 2. Schema

### 2.1 Drizzle (`src/db/schema.ts`)

Tabela nova, declarada logo antes de `documents` (a FK de `documents` precisa dela):

```ts
export const documentFolders = pgTable(
  "document_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Cascata: o seed do `main` apaga `tenants` sem conhecer esta tabela.
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Criar, renomear e documento entrando ou saindo da pasta (PLER-01 AC3).
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Nome único por tenant, ignorando maiúsculas (PMOD-01 AC2). O `drizzle-kit push`
    // derruba este índice a cada execução (L-070); `scripts/document-folders/schema.sql` o recria.
    uniqueIndex("document_folders_tenant_id_lower_name_idx").on(table.tenantId, sql`lower(${table.name})`),
  ]
);
```

Em `documents`, depois de `categoryId`:

```ts
folderId: uuid("folder_id").references(() => documentFolders.id, { onDelete: "set null" }),
```

e, na lista de índices de `documents`:

```ts
index("documents_tenant_folder_idx").on(table.tenantId, table.folderId),
```

Em `documentUploadIntents`, depois de `categoryId`:

```ts
folderId: uuid("folder_id").references(() => documentFolders.id, { onDelete: "set null" }),
```

### 2.2 SQL de produção e dos bancos de teste (`scripts/document-folders/schema.sql`)

É **exatamente** a mudança que o usuário aplica em produção antes do merge final de `lote-17` em
`main`, e é o mesmo arquivo que o `db:push:test` aplica e confere em cada banco de teste (PBANCO-01).
Idempotente, numa transação, nomes iguais aos que o Drizzle gera (o executor da T2 confere os nomes
de FK contra `pg_constraint` depois do push e corrige este arquivo se divergirem):

```sql
-- L17 — Pastas de documentos (AD-051). Idempotente: pode rodar mais de uma vez.
begin;

create table if not exists "document_folders" (
  "id" uuid primary key default gen_random_uuid() not null,
  "tenant_id" uuid not null,
  "name" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);

alter table "documents" add column if not exists "folder_id" uuid;
alter table "document_upload_intents" add column if not exists "folder_id" uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'document_folders_tenant_id_tenants_id_fk') then
    alter table "document_folders" add constraint "document_folders_tenant_id_tenants_id_fk"
      foreign key ("tenant_id") references "public"."tenants"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_folder_id_document_folders_id_fk') then
    alter table "documents" add constraint "documents_folder_id_document_folders_id_fk"
      foreign key ("folder_id") references "public"."document_folders"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_upload_intents_folder_id_document_folders_id_fk') then
    alter table "document_upload_intents" add constraint "document_upload_intents_folder_id_document_folders_id_fk"
      foreign key ("folder_id") references "public"."document_folders"("id") on delete set null on update no action;
  end if;
end $$;

create unique index if not exists "document_folders_tenant_id_lower_name_idx"
  on "document_folders" using btree ("tenant_id", lower("name"));
create index if not exists "documents_tenant_folder_idx"
  on "documents" using btree ("tenant_id", "folder_id");

commit;
```

**Conferência** (o que `verifyDocumentFoldersState` consulta nos testes e o que o usuário roda em
produção depois de aplicar):

```sql
select to_regclass('public.document_folders') is not null as tabela;
select table_name, column_name from information_schema.columns
 where table_schema = 'public' and column_name = 'folder_id'
   and table_name in ('documents', 'document_upload_intents');            -- 2 linhas
select conname, confdeltype from pg_constraint
 where conname in ('document_folders_tenant_id_tenants_id_fk',            -- confdeltype 'c'
                   'documents_folder_id_document_folders_id_fk',          -- 'n'
                   'document_upload_intents_folder_id_document_folders_id_fk'); -- 'n'
select indexname from pg_indexes where schemaname = 'public' and indexname in (
  'document_folders_tenant_id_lower_name_idx', 'documents_tenant_folder_idx',
  'document_categories_tenant_id_lower_name_idx');                        -- 3 linhas
```

**Reversão** (só se o usuário pedir; apaga as pastas e solta os documentos):

```sql
begin;
alter table "document_upload_intents" drop column if exists "folder_id";
alter table "documents" drop column if exists "folder_id";
drop table if exists "document_folders";
commit;
```

**Procedimento de produção** (fora da Fase 1; ação do usuário, com autorização): aplicar o SQL acima
no banco de produção, rodar a conferência, e só então fazer o merge de `lote-17` em `main`. O código
do lote lê `folder_id` em toda listagem; publicar sem a coluna derruba a página de Documentos.
Nenhum `drizzle-kit` contra produção.

### 2.3 `db:push:test` (`scripts/test-db-push.ts`)

Ordem por alvo depois do lote: derrubar `vitrine` → `drizzle-kit push` → **recriar índices cegos e
aplicar `schema.sql`** → SQL da vitrine → **conferência da vitrine + conferência das pastas**. O
`drizzle-kit push` pode abortar antes de criar a tabela (sai com 0, L-068/L-070); quem garante o
estado é o `schema.sql`, e quem decide que o alvo ficou pronto é a conferência.

Novo módulo `scripts/document-folders/apply.ts` (A):

```ts
/** Aplica `schema.sql` no banco de `url`. Idempotente. */
export async function applyDocumentFoldersSql(url: string): Promise<void>;
/** Itens ausentes (tabela, 2 colunas, 3 FKs com a regra certa, 3 índices); lista vazia = pronto. */
export async function verifyDocumentFoldersState(url: string): Promise<string[]>;
```

`realSteps()` passa a usar `restoreIndexes: (url) => restoreDrizzleBlindIndexes(url).then(() => applyDocumentFoldersSql(url))`
e `verify: async (url) => [...await verifyVitrineState(url), ...await verifyDocumentFoldersState(url)]`.
A conferência do índice de categoria entra em `verifyDocumentFoldersState` (fecha o achado do
Handoff de 2026-10-25: `verifyVitrineState` não conferia esse índice). `PushSteps` e
`pushToTargets` não mudam.

---

## 3. Contrato de tipos — `src/lib/document-folders.ts` (A, PR do contrato)

Módulo puro, sem `server-only` e sem import de `src/server/**` nem de `src/db/**` (é importado por
componentes cliente, pela página e pela DAL). Teste unitário em `src/lib/__tests__/document-folders.test.ts`.

```ts
/** Valor reservado do parâmetro `pasta`: filtro "sem pasta" na raiz. */
export const NO_FOLDER_PARAM = "sem-pasta";
/** Rótulo da raiz e de documento sem pasta (AD-051 item 2). */
export const NO_FOLDER_LABEL = "Sem pasta";
/** Teto de documentos por movimentação (PMOVER-01 AC5). */
export const MAX_DOCUMENTS_PER_MOVE = 100;
export const FOLDER_NAME_LABEL = "Nome da pasta";

/** Pasta como opção de escolha (diálogos, seletor, caminho). */
export interface DocumentFolderOption {
  id: string;
  name: string;
}

/** Linha da listagem de pastas (PLER-01 AC1). */
export interface DocumentFolderSummary extends DocumentFolderOption {
  fileCount: number;
  /** Soma de `size_bytes` dos documentos não excluídos; `number` é exato até 2^53. */
  totalSizeBytes: number;
  /** max(updated_at da pasta, uploaded_at mais recente dos documentos não excluídos). */
  lastActivityAt: Date;
}

/** Filtro de pasta da DAL de documentos (PFILT-01). Ausente = todas as pastas e sem pasta. */
export type DocumentFolderFilter =
  | { kind: "pasta"; folderId: string }
  | { kind: "sem-pasta" };

/** Leitura do parâmetro `pasta` da URL. */
export type FolderParam =
  | { kind: "todas" }                    // ausente ou vazio
  | { kind: "sem-pasta" }                // "sem-pasta"
  | { kind: "pasta"; folderId: string }  // UUID (minúsculas)
  | { kind: "invalida" };                // qualquer outro valor

export function isUuid(value: string): boolean;          // /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function parseFolderParam(raw: string | string[] | undefined): FolderParam; // array: usa o 1º
export function folderHref(folderId: string): string;    // "/documentos?pasta=<id>"

export type FolderActionErrorCode =
  | "sem-permissao"
  | "nome-invalido"
  | "nome-duplicado"
  | "pasta-nao-encontrada"
  | "documento-nao-encontrado"
  | "selecao-invalida";

export type FolderActionResult<T extends object = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; code: FolderActionErrorCode; error: string };

/** Mensagens fixas (a de `sem-permissao` e a de `nome-invalido` vêm da guarda e de `validateName`). */
export const FOLDER_ERROR_MESSAGES: Record<
  Exclude<FolderActionErrorCode, "sem-permissao" | "nome-invalido">, string
> = {
  "nome-duplicado": "Já existe uma pasta com esse nome.",
  "pasta-nao-encontrada": "Pasta não encontrada.",
  "documento-nao-encontrado": "Documento não encontrado.",
  "selecao-invalida": "Selecione de 1 a 100 documentos.",
};
```

**Quem importa**: a DAL (`DocumentFolderSummary`, `DocumentFolderFilter`, `isUuid`), as actions
(tudo de resultado e erro), a rota de upload (`isUuid`), os componentes de B (`DocumentFolderOption`,
`DocumentFolderSummary`, `FolderActionErrorCode`, `NO_FOLDER_*`, `folderHref`) e a página de C
(`parseFolderParam`, `DocumentFolderFilter`).

---

## 4. Camada de dados (A)

### 4.1 `src/server/data/document-folders.ts` (novo, `import "server-only"`)

Toda função recebe o `tenantId` já resolvido e filtra por ele no `WHERE`. Id que não é UUID nunca
vai ao banco (`isUuid`): leitura devolve `null`/vazio, escrita devolve `not_found`.

```ts
export async function listDocumentFolderSummaries(tenantId: string): Promise<DocumentFolderSummary[]>;
export async function getDocumentFolder(tenantId: string, folderId: string): Promise<DocumentFolderOption | null>;

export type CreateDocumentFolderResult =
  | { kind: "created"; folder: DocumentFolderOption }
  | { kind: "duplicate_name" };
export async function createDocumentFolder(tenantId: string, name: string, now?: Date): Promise<CreateDocumentFolderResult>;

export type RenameDocumentFolderResult =
  | { kind: "renamed"; folder: DocumentFolderOption }
  | { kind: "not_found" }
  | { kind: "duplicate_name" };
export async function renameDocumentFolder(tenantId: string, folderId: string, name: string, now?: Date): Promise<RenameDocumentFolderResult>;

export type DeleteDocumentFolderResult =
  | { kind: "deleted"; movedToRootCount: number }
  | { kind: "not_found" };
export async function deleteDocumentFolder(tenantId: string, folderId: string): Promise<DeleteDocumentFolderResult>;

export type MoveDocumentsToFolderResult =
  | { kind: "moved"; movedCount: number }
  | { kind: "invalid_selection" }
  | { kind: "folder_not_found" }
  | { kind: "document_not_found" };
export async function moveDocumentsToFolder(
  tenantId: string,
  documentIds: string[],
  folderId: string | null,
  now?: Date
): Promise<MoveDocumentsToFolderResult>;
```

Semântica (o que os testes de integração afirmam):

- **`listDocumentFolderSummaries`**: uma consulta —
  `select f.id, f.name, f.updated_at, count(d.id), coalesce(sum(d.size_bytes), 0), max(d.uploaded_at)
  from document_folders f left join documents d on d.folder_id = f.id and d.tenant_id = f.tenant_id
  and d.deleted_at is null where f.tenant_id = $1 group by f.id`. `totalSizeBytes = Number(sum)`;
  `lastActivityAt = max(updated_at, max_uploaded_at ?? updated_at)`; ordena em JS com
  `new Intl.Collator("pt-BR", { sensitivity: "base" })` e desempata por `id`.
- **`createDocumentFolder`**: `insert ... values (tenantId, name, created_at = now, updated_at = now)`;
  violação única → `duplicate_name` (inclusive na corrida, PCRIAR-01 AC4). O nome chega já validado e
  sem espaços nas pontas (quem valida é a action).
- **`renameDocumentFolder`**: `update ... set name, updated_at = now where id and tenant_id returning`;
  0 linhas → `not_found`; violação única → `duplicate_name`.
- **`deleteDocumentFolder`**: transação — `select id from document_folders where id and tenant_id for update`;
  ausente → `not_found`; `select count(*) from documents where folder_id = $id and tenant_id and deleted_at is null`;
  `delete from document_folders where id and tenant_id`. A FK zera `folder_id` em documentos e
  intenções. O `for update` faz uma movimentação concorrente (que segura `for key share`) terminar
  antes ou esperar, então a contagem é a do instante da exclusão.
- **`moveDocumentsToFolder`**: deduplica os ids; 0 ou mais de 100, ou algum não UUID →
  `invalid_selection`; `folderId` não nulo e não UUID → `folder_not_found`. Transação:
  1. se `folderId` não é nulo, `select id from document_folders where id and tenant_id for key share`
     (ausente → `folder_not_found`; a trava impede a exclusão concorrente de deixar o documento
     apontando para pasta apagada — PMOVER-01 AC8);
  2. `select id, folder_id from documents where tenant_id and id in (...) and deleted_at is null for update`;
     se vierem menos linhas que ids → `document_not_found`, sem escrever nada (tudo ou nada);
  3. os que já estão no destino não mudam; se nenhum muda → `{ moved, movedCount: 0 }` sem tocar
     `updated_at`;
  4. `update documents set folder_id = $dest where tenant_id and id in (os que mudam)`;
  5. `update document_folders set updated_at = now where tenant_id and id in (destino + origens não nulas)`.

### 4.2 `src/server/data/index.ts` (modificar)

- `DOCUMENT_LIST_COLUMNS` ganha `folderId: documents.folderId` (o tipo `DocumentListRow` já o exige
  depois do schema; sem isto o `tsc` quebra). Entra no PR do contrato, junto com o schema.
- `DocumentFilters` ganha `folder?: DocumentFolderFilter`; `getDocuments` adiciona
  `eq(documents.folderId, id)` ou `isNull(documents.folderId)`.
- `UpdateDocumentInput` ganha `folderId?: string | null` (ausente preserva, `null` tira da pasta —
  L-005). `updateDocument` passa a rodar numa transação quando `"folderId" in updates`: trava a pasta
  de destino com `for key share` filtrando por tenant, lança `DocumentFolderNotFoundError` (classe
  exportada deste módulo) se ela não existir, lê a pasta atual do documento, grava tudo num `update` e
  atualiza `updated_at` das pastas de origem e destino quando a pasta muda. Sem `folderId`, o caminho
  é o de hoje. Retorno continua `Promise<Document | null>`.
- `pgErrorCode`, `isUniqueViolation` e `isForeignKeyViolation` passam para
  `src/server/data/pg-errors.ts` (exportados) e `index.ts` os importa de lá; `document-folders.ts`
  usa o mesmo módulo.

### 4.3 Upload (`src/server/documents/repository.ts`, `uploads.ts`, `app/api/documents/upload/route.ts`)

- `CreateUploadIntentInput` ganha `folderId?: string | null`. `createUploadIntent`, dentro da
  transação que já existe e antes do insert, quando `folderId` não é nulo: `select id from
  document_folders where id and tenant_id for key share`; ausente → novo desfecho
  `{ kind: "folder_not_found" }` em `CreateUploadIntentResult`. Grava `folder_id` na intenção.
- `commitUploadIntent` passa `folderId: intent.folderId` ao insert de `documents` (se a pasta foi
  apagada depois da reserva, a FK já zerou a intenção e o documento nasce sem pasta — PUPLOAD-01 AC8).
- `listTenantDocuments` ganha `folderId` na projeção (exigência de tipo, PR do contrato).
- `CreateDocumentUploadInput` (`uploads.ts`) ganha `folderId?: string | null`; `reserve` repassa;
  `folderId` não nulo e não UUID → `{ kind: "folder_not_found" }` sem consultar;
  `ReserveDocumentUploadResult` e `BeginDocumentUploadResult` ganham `| { kind: "folder_not_found" }`.
- Rota: `parseInput` aceita `folderId` ausente, `null` ou string (outro tipo → 400
  `upload_payload_invalid`); `reserved.kind === "folder_not_found"` →
  `Response.json({ error: "upload_folder_not_found" }, { status: 404 })`.

---

## 5. Actions (A)

### 5.1 `src/server/actions/document-folders.ts` (novo, `"use server"`)

```ts
export interface CreateDocumentFolderInput { name: string }
export interface RenameDocumentFolderInput { folderId: string; name: string }
export interface DeleteDocumentFolderInput { folderId: string }
export interface MoveDocumentsToFolderInput { documentIds: string[]; folderId: string | null }

export async function createDocumentFolderAction(
  input: CreateDocumentFolderInput
): Promise<FolderActionResult<{ folder: DocumentFolderOption }>>;
// erros: sem-permissao, nome-invalido, nome-duplicado

export async function renameDocumentFolderAction(
  input: RenameDocumentFolderInput
): Promise<FolderActionResult<{ folder: DocumentFolderOption }>>;
// erros: sem-permissao, nome-invalido, nome-duplicado, pasta-nao-encontrada

export async function deleteDocumentFolderAction(
  input: DeleteDocumentFolderInput
): Promise<FolderActionResult<{ movedToRootCount: number }>>;
// erros: sem-permissao, pasta-nao-encontrada

export async function moveDocumentsToFolderAction(
  input: MoveDocumentsToFolderInput
): Promise<FolderActionResult<{ movedCount: number }>>;
// erros: sem-permissao, selecao-invalida, pasta-nao-encontrada, documento-nao-encontrado
```

Ordem fixa em toda action (molde das de categoria): `denyIfForbidden("documentos", "escrever")` →
se negada, `{ ok: false, code: "sem-permissao", error: denied.error }`; validação de entrada
(`validateName(input.name, FOLDER_NAME_LABEL)` → `nome-invalido` com a mensagem dela); tenant por
`getActiveTenantId()`; chamada da DAL; tradução do `kind` para o código com
`FOLDER_ERROR_MESSAGES`; `revalidatePath("/documentos")` só no sucesso. Nenhuma action lança para
erro de domínio.

**No PR do contrato** este arquivo existe com as assinaturas e os tipos exatos acima e corpos que
lançam `new Error("L17: implementado na T<n>")`; nenhuma tela chama as actions antes da frente C, que
só começa depois dos PRs de A. As tasks T13 e T14 trocam os corpos.

### 5.2 `src/server/actions/documents.ts` (modificar)

`UpdateDocumentInput` ganha `folderId?: string | null` (no PR do contrato, só o campo; ignorado até a
T15). Na T15, `updateDocumentAction`: `folderId` presente, não nulo e não UUID →
`{ ok: false, error: "Pasta não encontrada." }`; repassa `folderId` só quando `"folderId" in input`;
`DocumentFolderNotFoundError` → `{ ok: false, error: "Pasta não encontrada." }`. O retorno continua
`ActionResult` (`{ ok: true } | { ok: false; error }`), sem código, como as demais actions de
documento.

---

## 6. Interface (B) — componentes e props

Regras: Astryx em toda peça, sem `<div>`/`<span>` de layout, sem `style={{}}`, cor só por token,
ícones `lucide-react`. Componente cliente recebe só dados serializáveis (L-072); nenhum rótulo de
data é calculado no cliente (hidratação). Toda prop nova em componente que já existe é **opcional,
com padrão que mantém o comportamento de hoje**, para que `lote-17` compile depois de cada PR sem a
página (que é de C) ter mudado.

### 6.1 Lógica de apresentação — `src/components/documents/folder-presentation.ts` (novo, puro)

Testes em `src/components/documents/__tests__/folder-presentation.test.ts` (L-003). Fixtures de B em
`src/components/documents/__tests__/folder-fixtures.ts` (a partir de `rascunho/mock-folders.ts.txt`,
com `DocumentFolderSummary`).

```ts
export interface FolderCardItem {
  id: string;
  name: string;
  fileCountLabel: string;   // "0 arquivos" | "1 arquivo" | "N arquivos"
  sizeLabel: string;        // formatFileSize(totalSizeBytes)
  updatedLabel: string;     // formatFolderUpdatedLabel(lastActivityAt, now)
  fileCount: number;        // usado pela confirmação de exclusão
}

export function formatFileCount(count: number): string;
export function formatFolderCount(count: number): string;          // "1 pasta" | "N pastas"
/** PRAIZ-01 AC3, fuso America/Sao_Paulo; `now` explícito para teste. */
export function formatFolderUpdatedLabel(date: Date, now: Date): string;
export function toFolderCardItems(folders: DocumentFolderSummary[], now: Date): FolderCardItem[];
/** PEXC-01 AC4. */
export function deleteFolderCopy(name: string, fileCount: number): { title: string; description: string };
/** Mensagem do erro de uma action de pasta (tabela tipada pelo código, L-029). */
export function folderErrorMessage(result: { code: FolderActionErrorCode; error: string }): string;
/** Opções do seletor de pasta: "Sem pasta" primeiro, depois as pastas na ordem recebida. */
export const NO_FOLDER_OPTION_VALUE = "__sem-pasta__";
export function folderSelectorOptions(folders: DocumentFolderOption[]): { value: string; label: string }[];
export function folderIdFromSelector(value: string | null): string | null; // sentinela/null → null
```

`formatFolderUpdatedLabel`: diferença `< 1 min` ou negativa → "Atualizada agora"; `< 60 min` →
"Atualizada há N min"; mesmo dia civil em São Paulo → "Atualizada há N h" (horas inteiras);
dia anterior → "Atualizada ontem"; mesmo ano → "Atualizada em 29 de jul."; outro ano →
"Atualizada em 29 de jul. de 2025" (`Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short",
timeZone: "America/Sao_Paulo" })`, com `year` só no último caso). Teste nas fronteiras exatas
(59 min/60 min, 23:59/00:00 de São Paulo, 31/12→1/1), L-023.

### 6.2 Componentes

| Arquivo (B) | Componente | Astryx usado | Props |
| --- | --- | --- | --- |
| `folders-grid.tsx` (`"use client"`) | `FoldersGrid` | `VStack`, `HStack`, `StackItem`, `Heading` (h2 "Pastas"), `Text` (supporting, contagem), `Grid` (`columns={{ minWidth: 220, max: 4 }}`, `gap={3}`), `ClickableCard` (`href={folderHref(id)}`, `label="Pasta <nome>"`, `padding={3}`), `Card variant="muted" padding={2}` (fundo do ícone), `Icon icon="clock" size="xsm"`, `EmptyState` (`isCompact`), `LinkProvider component={NextLink}` | `{ folders: FolderCardItem[]; canWrite: boolean; createAction?: ReactNode }` |
| `folder-actions-menu.tsx` (`"use client"`) | `FolderActionsMenu` | `DropdownMenu` (botão ghost `sm` só ícone `EllipsisVerticalIcon`, `hasChevron={false}`, `menuWidth={180}`, `divider` antes de "Excluir"), `useToast` | `{ folder: { id: string; name: string; fileCount: number }; canWrite: boolean; showOpen?: boolean /* padrão true; false dentro da pasta */; afterDeleteHref?: string /* "/documentos" quando é a pasta aberta */ }` |
| `folder-name-dialog.tsx` (`"use client"`) | `CreateFolderDialog` (gatilho próprio, botão secundário "Nova pasta" com `FolderPlusIcon`) e `RenameFolderDialog` (controlado) | `Dialog`, `DialogHeader`, `Layout`/`LayoutContent`/`LayoutFooter`, `TextInput` (`label="Nome da pasta"`, `status` de erro, `maxLength` 120), `Button` | `CreateFolderDialog: {}`; `RenameFolderDialog: { folder: { id: string; name: string } \| null; onClose: () => void }` |
| `delete-folder-dialog.tsx` (`"use client"`) | `DeleteFolderDialog` | `AlertDialog` (`actionVariant="destructive"`, `actionLabel="Excluir pasta"`, `isActionLoading`) | `{ folder: { id: string; name: string; fileCount: number } \| null; onClose: () => void; afterDeleteHref?: string }` |
| `move-document-dialog.tsx` (`"use client"`) | `MoveDocumentDialog` | `Dialog`, `DialogHeader`, `Layout`, `Selector` (`label="Pasta"`, opções de `folderSelectorOptions`), `Banner` (erro), `Button` ("Mover") | `{ document: { id: string; name: string; folderId: string \| null } \| null; folders: DocumentFolderOption[]; onClose: () => void }` |
| `folder-header.tsx` (`"use client"`) | `FolderHeader` | `Breadcrumbs` (`label="Caminho"`, `variant="supporting"`) + `BreadcrumbItem` (`href="/documentos"` com `as={NextLink}`; pasta com `isCurrent`), `HStack`, `Heading` (h2, nome), `FolderActionsMenu` | `{ folder: { id: string; name: string; fileCount: number }; canWrite: boolean }` |
| `documents-browser.tsx` (modificar) | `DocumentsBrowser` | já usa `DropdownMenu`; ganha item "Mover para pasta" (`FolderInputIcon`) quando `canWrite` e o documento não está excluído, e monta `MoveDocumentDialog` | props novas, opcionais: `folders?: DocumentFolderOption[]` (padrão `[]`), `heading?: ReactNode` (padrão `<Heading level={2}>Todos os arquivos</Heading>`) |
| `documents-table.tsx` (modificar) | `DocumentsTable` | coluna nova "Pasta" (`Text` com o nome ou `NO_FOLDER_LABEL`) depois de "Categoria" | prop nova opcional `folderById?: Map<string, DocumentFolderOption>`; sem ela a coluna não aparece |
| `edit-document-dialog.tsx` (modificar) | `EditDocumentDialog` | `Selector` "Pasta" (`hasClear`, `placeholder="Sem pasta"`, `isOptional`) depois de "Categoria" | prop nova opcional `folders?: DocumentFolderOption[]`; com `folders` ausente o campo não aparece e `folderId` não é enviado (L-005); com o campo, envia `folderId: string \| null` sempre |
| `documents-toolbar.tsx` (modificar) | `DocumentsToolbar` | `DropdownMenuSubMenu` "Pasta" com `DropdownMenuRadioGroup`/`DropdownMenuRadioItem` ("Todas", "Sem pasta"); conta no `activeFilterCount` | prop nova opcional `showFolderFilter?: boolean` (padrão `false`) |

Comportamentos fixados:

- `ClickableCard` com `href` e o `FolderActionsMenu` dentro: o clique no menu não pode navegar. A
  captura da T34 confere na tela; se a lib navegar, a frente C (depois do merge de B2, sem
  paralelismo nesse ponto) troca `href` por `onClick={() => router.push(...)}` e registra no commit
  (L-009, L-010).
- `FolderActionsMenu` → "Copiar link": `navigator.clipboard.writeText(new URL(folderHref(id),
  window.location.origin).toString())`; sucesso `showToast({ body: "Link copiado" })`; erro
  `showToast({ body: "Não foi possível copiar o link.", type: "error" })`.
- Depois de criar, renomear, excluir ou mover com sucesso: `router.refresh()` (a página é RSC e
  relê); exclusão com `afterDeleteHref` → `router.replace(afterDeleteHref)`.
- Erros de action aparecem no campo do diálogo (`TextInput status`) ou num `Banner` do diálogo, com
  `folderErrorMessage`; o diálogo continua aberto (PRAIZ-01 AC10).
- `Breadcrumbs` tem rótulo padrão em inglês ("Breadcrumb"): passar `label="Caminho"` (L-010).
- `NO_FOLDER_LABEL` é o texto de "Sem pasta" em toda a interface.

---

## 7. Página (C)

### 7.1 Estado puro — `src/components/documents/documents-page-state.ts` (novo, C)

```ts
export type DocumentsPageMode =
  | { kind: "raiz"; folderFilter: DocumentFolderFilter | undefined }   // todas ou sem-pasta
  | { kind: "pasta"; folder: DocumentFolderOption }
  | { kind: "pasta-inexistente" };

/** `folder` é o resultado de `getDocumentFolder` quando o parâmetro é UUID (null se não achou). */
export function resolveDocumentsPageMode(param: FolderParam, folder: DocumentFolderOption | null): DocumentsPageMode;
/** Filtro de pasta que a página passa a `getDocuments` (PABRIR-01 AC3 — L-026). */
export function folderFilterFor(mode: DocumentsPageMode): DocumentFolderFilter | undefined;
/** "/documentos" na raiz, "/documentos?pasta=<id>" na pasta (PABRIR-01 AC4). */
export function clearFiltersHref(mode: DocumentsPageMode): string;
```

Teste unitário cobrindo os quatro `FolderParam` e as três saídas.

### 7.2 `app/(crm)/documentos/page.tsx` (C)

`searchParams` ganha `pasta?: string`. Fluxo:

1. `parseFolderParam(params.pasta)`; se `kind === "pasta"`, `getDocumentFolder(tenantId, folderId)`;
   `resolveDocumentsPageMode`.
2. Em paralelo: `getDocuments(tenantId)` (existência de documentos e polling, como hoje),
   `getDocuments(tenantId, { modality, categoryId, search, folder: folderFilterFor(mode) })` (pulado
   em `pasta-inexistente`), `getDocumentCategories`, `getTenant`, `getTenantContextLimitSummary`,
   `listDocumentFolderSummaries(tenantId)`.
3. `now = new Date()` uma vez; `toFolderCardItems(summaries, now)` no servidor.
4. Render por modo:
   - **raiz**: cabeçalho de hoje com `CreateFolderDialog` antes de `CategoryManagerDialog` e
     `UploadDialog` (sem `folder`) quando `canWrite`; `FoldersGrid`; `DocumentsToolbar
     showFolderFilter`; `DocumentsBrowser folders={opções}`; `DocumentsTable` recebe `folderById`
     pelo browser.
   - **pasta**: mesmo cabeçalho, mas `UploadDialog folder={folder}` e sem `CreateFolderDialog`;
     `FolderHeader` no lugar de `FoldersGrid`; `DocumentsToolbar` sem filtro de pasta;
     `DocumentsBrowser heading={nome}` com `EmptyState` "Esta pasta está vazia" (sem filtro) ou
     "Nenhum resultado encontrado" com `NavLink href={clearFiltersHref(mode)}`.
   - **pasta-inexistente**: cabeçalho sem ações e um `EmptyState` "Pasta não encontrada" com
     `NavLink href="/documentos"` "Voltar para Documentos"; nada mais. HTTP 200, sem `notFound()`
     (L-073).
5. A guarda `requirePermission("documentos", "ler")` continua no topo.

### 7.3 Upload na pasta (C)

- `src/components/documents/upload-client.ts`: `UploadTicketInput.folderId?: string | null`;
  `UploadFailureCode` ganha `"upload_folder_not_found"` com a mensagem de PUPLOAD-01 AC7 em
  `UPLOAD_FAILURE_MESSAGES`.
- `src/components/documents/upload-dialog.tsx`: prop nova opcional `folder?: DocumentFolderOption`;
  com ela, mostra `Text` `Será salvo na pasta "<nome>".` e envia `folderId: folder.id` no ticket;
  sem ela, envia `folderId: null`.

---

## 8. Seed (A) — `src/db/seed.ts`

`FOLDER_DEFS` com as seis pastas do rascunho (chaves `contratos`, `lancamentos`,
`documentacao-legal`, `financiamento`, `tabelas-de-preco`, `treinamento`), uma linha por tenant com
`id("folder:<tenant>:<chave>")`. Na transação: `delete(documentFolders)` logo depois de
`delete(documents)` e antes de `delete(leads)`; `insert(documentFolders)` logo depois de
`insert(documentCategories)`. `seed.test.ts` ganha a asserção de PSEED-01. Seed nunca roda contra
produção sem autorização.

---

## 9. Testes e alvos do sensor

| Camada | Arquivo de teste | Tipo |
| --- | --- | --- |
| Contrato puro | `src/lib/__tests__/document-folders.test.ts` | unit |
| SQL e push | `scripts/__tests__/test-db-push.test.ts` (ligação das etapas, L-026); `src/db/__tests__/schema-document-folders.test.ts` (banco: cascata, set null, índice único, idempotência do SQL, conferência com item faltando) | unit + integration |
| DAL de pastas | `src/server/data/__tests__/document-folders.test.ts` | integration (com tenant estrangeiro, L-035) |
| DAL de documentos | `src/server/data/__tests__/documents.test.ts` e `isolation.test.ts` | integration |
| Upload | `src/server/documents/__tests__/repository.test.ts`, `uploads.test.ts`, `upload-route.test.ts` | integration + unit |
| Actions | `src/server/__tests__/document-folders-actions.test.ts` (sessão simulada como `actions.test.ts`), `src/server/__tests__/actions.test.ts` (edição) | integration |
| Contexto do agente | `src/server/integration/__tests__/document-context.integration.test.ts` | integration |
| Seed | `src/db/__tests__/seed.test.ts` | integration |
| Apresentação | `src/components/documents/__tests__/folder-presentation.test.ts`, `documents-page-state.test.ts`, `upload-client.test.ts` | unit |
| Componentes e página | — | build + captura real (L-009) |

**Alvos obrigatórios do sensor de discriminação** (o Verifier injeta e todos precisam morrer):

1. Tirar `tenant_id` do `WHERE` de `listDocumentFolderSummaries`.
2. Tirar `deleted_at is null` do join da contagem.
3. Trocar `greatest(updated_at, max(uploaded_at))` por só `updated_at`.
4. Tirar a verificação de tenant da pasta de destino em `moveDocumentsToFolder`.
5. Trocar "tudo ou nada" por mover só os encontrados.
6. Tirar `denyIfForbidden` de qualquer uma das quatro actions de pasta.
7. Não repassar `intent.folderId` no `commitUploadIntent`.
8. Passar `folder` ausente a `getDocuments` na página (por `folderFilterFor` devolvendo `undefined`).
9. `onDelete: "set null"` virando `cascade` em `documents.folder_id` (o SQL e o teste de schema
   precisam pegar).
10. `formatFolderUpdatedLabel` com o fuso do servidor em vez de `America/Sao_Paulo`.

---

## 10. Frentes, arquivos e PRs

**Dono de cada arquivo** (A e B nunca editam o mesmo arquivo; o que é compartilhado é de C):

| Frente | Arquivos |
| --- | --- |
| A — dados | `src/lib/document-folders.ts`, `scripts/document-folders/schema.sql`, `scripts/document-folders/apply.ts`, `scripts/test-db-push.ts`, `src/db/schema.ts`, `src/server/data/pg-errors.ts`, `src/server/data/index.ts`, `src/server/data/document-folders.ts`, `src/server/documents/repository.ts`, `src/server/documents/uploads.ts`, `app/api/documents/upload/route.ts`, `src/server/actions/document-folders.ts`, `src/server/actions/documents.ts`, `src/db/seed.ts` e os testes deles |
| B — interface | `src/components/documents/folder-presentation.ts`, `folders-grid.tsx`, `folder-actions-menu.tsx`, `folder-name-dialog.tsx`, `delete-folder-dialog.tsx`, `move-document-dialog.tsx`, `folder-header.tsx`, `documents-browser.tsx`, `documents-table.tsx`, `edit-document-dialog.tsx`, `documents-toolbar.tsx`, `__tests__/folder-presentation.test.ts`, `__tests__/folder-fixtures.ts` |
| C — integração | `src/components/documents/documents-page-state.ts`, `upload-client.ts`, `upload-dialog.tsx`, `app/(crm)/documentos/page.tsx`, os testes deles, capturas em `.specs/features/lote-17-pastas-de-documentos/capturas/` |

**PR do contrato (A1)** — tudo que B precisa para compilar sem banco:

1. `src/lib/document-folders.ts` com testes.
2. `scripts/document-folders/schema.sql`, `apply.ts` e a ligação em `test-db-push.ts`.
3. Schema Drizzle, `folderId` nas duas projeções de listagem e `npm run db:push:test` conferido.
4. `src/server/actions/document-folders.ts` com assinaturas e corpos que lançam, e
   `UpdateDocumentInput.folderId` em `src/server/actions/documents.ts` (só o campo).

Depois do merge de A1 em `lote-17`, B começa (sem banco) e A segue com A2 e A3. C começa quando A3 e
B2 estiverem em `lote-17`. Detalhe e dependências em `tasks.md`.

---

## 11. Riscos e cuidados

| Risco | Mitigação |
| --- | --- |
| `drizzle-kit push` aborta com saída 0 antes de criar a tabela ou derruba o índice de expressão (L-068, L-070) | `schema.sql` idempotente roda depois do push em todo alvo, e a conferência falha o comando se faltar qualquer item |
| Banco de teste compartilhado entre worktrees (AD-033, L-033) | Só a frente A roda testes de banco; B só roda testes puros (`npx vitest run` de arquivos sem banco); C roda `npm test` uma vez no fim, e o orquestrador garante que nenhuma outra sessão está rodando suíte nesse momento |
| Publicar o código sem a coluna em produção derruba Documentos | Merge em `main` só depois de o usuário aplicar e conferir o SQL (§ 2.2) |
| Cast de UUID inválido vira 500 (achado do L14) | `isUuid` antes de qualquer consulta por id de pasta e na lista de documentos movidos |
| `updateDocument` sem verificação de tenant da categoria (dívida existente: `categoryId` de outro tenant é aceito) | Fora do escopo; a pasta não repete o erro (trava com tenant). Registrar em `context.md`/Handoff no fechamento como dívida |
| Hidratação do rótulo de data | Rótulo calculado no servidor (§ 7.2 item 3) |
| `ClickableCard` com menu dentro navegando ao abrir o menu | Conferência na captura da T34 e plano B descrito em § 6.2 |
| Componente da lib com texto em inglês (L-010) | `Breadcrumbs label="Caminho"`; conferir na captura os textos de `Selector` (`placeholder`) e `DropdownMenu` |
| Prop obrigatória nova quebrando `page.tsx` antes da frente C | Toda prop nova de B é opcional (§ 6) |
| `tsc`/`eslint` | Ao fim de cada PR: `npx tsc --noEmit -p .` com 0 erros e `npx eslint .` com 0 erros e no máximo 9 avisos (hoje 7) |
| Duas sessões com o CRM local na mesma porta | `PORT=<3001+n> npm run dev:test`, porta própria por worktree |
