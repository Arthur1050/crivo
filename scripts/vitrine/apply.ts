/**
 * Executor do SQL da vitrine (lote-16a — AD-040).
 *
 * `applyVitrineSql` roda `scripts/vitrine/vitrine.sql` (idempotente) num banco;
 * `dropVitrineSchema` derruba o schema `vitrine` antes do `drizzle-kit push`,
 * porque alterar coluna usada por view faz o push falhar (F5 do gate). Nenhuma
 * URL é impressa nem entra em mensagem de erro.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const SQL_FILE = path.resolve(process.cwd(), "scripts/vitrine/vitrine.sql");

async function withClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/**
 * Aplica o SQL da vitrine no banco de `url`. Falha no primeiro erro, sem aplicar
 * parte. A senha do papel só é definida quando chega em `options.password` (nos
 * bancos de teste, vinda do ambiente local); sem ela, a senha do papel fica como
 * está — em produção quem a define é o usuário, à parte.
 */
export async function applyVitrineSql(
  url: string,
  options: { password?: string } = {}
): Promise<void> {
  const sql = readFileSync(SQL_FILE, "utf8");
  await withClient(url, async (client) => {
    // Sem parâmetros o `pg` usa o protocolo simples: vários comandos numa
    // chamada, todos dentro de uma transação implícita.
    await client.query(sql);
    if (options.password) {
      // `ALTER ROLE ... PASSWORD` não aceita parâmetro; o literal é escapado pelo driver.
      await client.query(`alter role crivo_vitrine password ${client.escapeLiteral(options.password)}`);
    }
  });
}

/** Derruba o schema `vitrine` e tudo que há nele (views, grants do schema). */
export async function dropVitrineSchema(url: string): Promise<void> {
  await withClient(url, async (client) => {
    await client.query("drop schema if exists vitrine cascade");
  });
}
