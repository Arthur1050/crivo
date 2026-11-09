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
      await client.query(`alter role krivo_vitrine password ${client.escapeLiteral(options.password)}`);
    }
  });
}

/** Derruba o schema `vitrine` e tudo que há nele (views, grants do schema). */
export async function dropVitrineSchema(url: string): Promise<void> {
  await withClient(url, async (client) => {
    await client.query("drop schema if exists vitrine cascade");
  });
}

const EXPECTED_CHECKS = [
  "tenant_storefronts_accent_color_check",
  "tenant_storefronts_active_requires_identity_check",
];
const EXPECTED_VIEWS = ["imoveis", "lojas"];
const EXPECTED_GRANTS = ["vitrine.imoveis:SELECT", "vitrine.lojas:SELECT"];

/**
 * Confere o estado final da vitrine no banco de `url` e devolve os problemas
 * achados (lista vazia = tudo certo): os dois checks de `tenant_storefronts`, as
 * duas views com `security_barrier`, o papel com login e as duas configurações,
 * e exatamente os dois grants. O `drizzle-kit push` já saiu com 0 sem aplicar
 * check (L-068): só a conferência do estado decide se o alvo está pronto.
 */
export async function verifyVitrineState(url: string): Promise<string[]> {
  return withClient(url, async (client) => {
    const problems: string[] = [];

    const checks = await client.query<{ conname: string }>(
      `select conname from pg_constraint
       where conrelid = to_regclass('public.tenant_storefronts') and contype = 'c'`
    );
    const presentChecks = new Set(checks.rows.map((row) => row.conname));
    for (const name of EXPECTED_CHECKS) {
      if (!presentChecks.has(name)) problems.push(`check ${name} ausente em tenant_storefronts`);
    }

    const views = await client.query<{ relname: string; reloptions: string[] | null }>(
      `select c.relname, c.reloptions from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'vitrine' and c.relkind = 'v'`
    );
    const viewOptions = new Map(views.rows.map((row) => [row.relname, row.reloptions ?? []]));
    for (const name of EXPECTED_VIEWS) {
      const options = viewOptions.get(name);
      if (!options) problems.push(`view vitrine.${name} ausente`);
      else if (!options.includes("security_barrier=true")) problems.push(`view vitrine.${name} sem security_barrier`);
    }

    const role = await client.query<{ rolcanlogin: boolean; rolconfig: string[] | null }>(
      "select rolcanlogin, rolconfig from pg_roles where rolname = 'krivo_vitrine'"
    );
    if (role.rows.length === 0) {
      problems.push("papel krivo_vitrine ausente");
    } else {
      const { rolcanlogin, rolconfig } = role.rows[0];
      if (!rolcanlogin) problems.push("papel krivo_vitrine sem login");
      for (const setting of ["default_transaction_read_only=on", "statement_timeout=5s"]) {
        if (!(rolconfig ?? []).includes(setting)) problems.push(`papel krivo_vitrine sem ${setting}`);
      }
    }

    const grants = await client.query<{ table_schema: string; table_name: string; privilege_type: string }>(
      `select table_schema, table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'krivo_vitrine'`
    );
    const presentGrants = new Set(grants.rows.map((row) => `${row.table_schema}.${row.table_name}:${row.privilege_type}`));
    for (const grant of EXPECTED_GRANTS) {
      if (!presentGrants.has(grant)) problems.push(`grant ${grant} ausente para krivo_vitrine`);
    }
    for (const grant of presentGrants) {
      if (!EXPECTED_GRANTS.includes(grant)) problems.push(`grant inesperado ${grant} para krivo_vitrine`);
    }

    return problems;
  });
}
