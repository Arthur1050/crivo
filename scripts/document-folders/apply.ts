import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

async function withClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Aplica o mesmo SQL idempotente entregue para produção, sem expor a conexão. */
export async function applyDocumentFoldersSql(url: string): Promise<void> {
  const sql = readFileSync(path.resolve(process.cwd(), "scripts/document-folders/schema.sql"), "utf8");
  await withClient(url, async (client) => { await client.query(sql); });
}

const EXPECTED_FOREIGN_KEYS = [
  ["document_folders_tenant_id_tenants_id_fk", "document_folders", "c"],
  ["documents_folder_id_document_folders_id_fk", "documents", "n"],
  ["document_upload_intents_folder_id_document_folders_id_fk", "document_upload_intents", "n"],
] as const;
const EXPECTED_INDEXES = [
  "document_folders_tenant_id_lower_name_idx",
  "documents_tenant_folder_idx",
  "document_categories_tenant_id_lower_name_idx",
];

/** Lista cada item ausente ou com regra de exclusão divergente; vazio = pronto. */
export async function verifyDocumentFoldersState(url: string): Promise<string[]> {
  return withClient(url, async (client) => {
    const problems: string[] = [];
    const table = await client.query<{ present: boolean }>(
      "select to_regclass('public.document_folders') is not null as present"
    );
    if (!table.rows[0].present) problems.push("tabela document_folders ausente");

    const columns = await client.query<{ table_name: string }>(
      `select table_name from information_schema.columns where table_schema = 'public'
       and column_name = 'folder_id' and table_name in ('documents', 'document_upload_intents')`
    );
    for (const name of ["documents", "document_upload_intents"]) {
      if (!columns.rows.some((row) => row.table_name === name)) {
        problems.push(`coluna ${name}.folder_id ausente`);
      }
    }

    const foreignKeys = await client.query<{ conname: string; table_name: string; confdeltype: string }>(
      `select c.conname, t.relname as table_name, c.confdeltype from pg_constraint c
       join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and c.contype = 'f'`
    );
    for (const [name, tableName, deleteType] of EXPECTED_FOREIGN_KEYS) {
      const fk = foreignKeys.rows.find((row) => row.conname === name && row.table_name === tableName);
      if (!fk) problems.push(`FK ${name} ausente`);
      else if (fk.confdeltype !== deleteType) problems.push(`FK ${name} com confdeltype diferente de ${deleteType}`);
    }

    const indexes = await client.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public'"
    );
    for (const name of EXPECTED_INDEXES) {
      if (!indexes.rows.some((row) => row.indexname === name)) problems.push(`índice ${name} ausente`);
    }
    return problems;
  });
}
