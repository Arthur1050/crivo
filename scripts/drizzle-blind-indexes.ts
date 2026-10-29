import { Client } from "pg";

/**
 * Índices únicos que o `drizzle-kit push` derruba a cada execução e não
 * recria: ele não reconhece o índice de expressão (`lower(name)`) como igual
 * ao do schema, derruba-o e aborta no primeiro `CREATE UNIQUE INDEX` seguinte
 * (o de `leads_tenant_id_id_idx`, que já existe), com saída 0. Sem este
 * passo, a categoria de documento duplicada deixa de ser recusada pelo banco
 * e a suíte falha. Idempotente.
 */
const DRIZZLE_BLIND_INDEXES = [
  `create unique index if not exists "document_categories_tenant_id_lower_name_idx"
   on "document_categories" using btree ("tenant_id", lower("name"))`,
];

/** Recria no banco de `url` os índices que o `drizzle-kit push` derrubou. */
export async function restoreDrizzleBlindIndexes(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const statement of DRIZZLE_BLIND_INDEXES) await client.query(statement);
  } finally {
    await client.end();
  }
}

