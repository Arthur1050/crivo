import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db";

const migration = readFileSync(path.resolve("scripts/brand/rename-to-krivo.sql"), "utf8");
let client: PoolClient;
let schema: string;
let oldRole: string;
let newRole: string;

// Origem e destino da migração usam namespaces exclusivos; nenhum papel ou
// tabela real é renomeado. A conexão do db exige TEST_DATABASE_URL no Vitest.
beforeEach(async () => {
  client = await db.$client.connect();
  const suffix = randomUUID().replaceAll("-", "");
  schema = `krivo_brand_${suffix}`;
  oldRole = `brand_src_${suffix}`;
  newRole = `brand_dst_${suffix}`;
  await client.query(`
    create schema ${schema};
    create role ${oldRole} login;
    alter role ${oldRole} set default_transaction_read_only = on;
    alter role ${oldRole} set statement_timeout = '5s';
    create table ${schema}.tenants (
      id integer primary key, slug text unique, name text, website text,
      agent_presentation_message text, logo text
    );
    create table ${schema}.users (id integer primary key, email text unique);
    create table ${schema}.tenant_members (user_id integer, organization_id integer);
    insert into ${schema}.tenants values
      (1, 'crivo-demo', 'Crivo Demo', 'https://crivo.com.br', 'Olá, sou da Crivo Demo.', '/crivo_white_symbol.png'),
      (2, 'imobiliaria-real', 'Nome do cliente', 'https://cliente.test', 'Mensagem do cliente', '/cliente.png');
    insert into ${schema}.users values (10, 'demo@crivo.com.br'), (20, 'cliente@crivo.com.br');
    insert into ${schema}.tenant_members values (10, 1), (20, 2);
    grant usage on schema ${schema} to ${oldRole};
    grant select on ${schema}.tenants to ${oldRole};
  `);
});

afterEach(async () => {
  if (!client) return;
  // Uma recusa da migração deixa a transação abortada; rollback também é
  // seguro depois de commit. Limpeza limitada aos nomes exclusivos acima.
  await client.query("rollback");
  await client.query(`drop schema if exists ${schema} cascade`);
  await client.query(`drop role if exists ${oldRole}; drop role if exists ${newRole}`);
  client.release();
});

afterAll(async () => { await db.$client.end(); });

function runMigration() {
  return client.query(migration
    .replaceAll("public.", `${schema}.`)
    .replaceAll("crivo_vitrine", oldRole)
    .replaceAll("krivo_vitrine", newRole));
}

describe("migração para Krivo em dados existentes", () => {
  it("preserva IDs, vínculos e privilégio do papel ao atualizar a marca", async () => {
    const before = await client.query("select oid, rolconfig from pg_roles where rolname = $1", [oldRole]);
    await runMigration();
    const after = await client.query("select oid, rolconfig from pg_roles where rolname = $1", [newRole]);
    expect(after.rows).toEqual(before.rows);
    const permission = await client.query("select has_table_privilege($1, $2, 'SELECT') as allowed", [newRole, `${schema}.tenants`]);
    expect(permission.rows[0].allowed).toBe(true);
    const tenants = await client.query(`select * from ${schema}.tenants order by id`);
    expect(tenants.rows).toEqual([
      { id: 1, slug: "krivo-demo", name: "Krivo Demo", website: "https://krivo.com.br", agent_presentation_message: "Olá, sou da Krivo Demo.", logo: "/krivo_white_symbol.png" },
      { id: 2, slug: "imobiliaria-real", name: "Nome do cliente", website: "https://cliente.test", agent_presentation_message: "Mensagem do cliente", logo: "/cliente.png" },
    ]);
    expect((await client.query(`select * from ${schema}.users order by id`)).rows).toEqual([
      { id: 10, email: "demo@krivo.com.br" }, { id: 20, email: "cliente@crivo.com.br" },
    ]);
    expect((await client.query(`select * from ${schema}.tenant_members order by user_id`)).rows).toEqual([
      { user_id: 10, organization_id: 1 }, { user_id: 20, organization_id: 2 },
    ]);
  });

  it("aceita uma segunda execução sem criar outro papel ou tenant", async () => {
    await runMigration();
    await runMigration();
    expect((await client.query(`select slug from ${schema}.tenants order by id`)).rows).toEqual([
      { slug: "krivo-demo" }, { slug: "imobiliaria-real" },
    ]);
    expect((await client.query("select rolname from pg_roles where rolname = any($1)", [[oldRole, newRole]])).rows).toEqual([{ rolname: newRole }]);
  });

  it("atualiza assinaturas PNG para SVG preservando host e parâmetros do URL", async () => {
    await client.query(`insert into ${schema}.tenants (id, slug, logo) values
      (3, 'assinatura-horizontal', 'https://host-existente.test/crivo_white_symbol_and_tipography_horizontal.png?v=1'),
      (4, 'assinatura-vertical', '/crivo_white_symbol_and_tipography_vertical.png')`);
    await runMigration();
    expect((await client.query(`select logo from ${schema}.tenants where id in (3, 4) order by id`)).rows).toEqual([
      { logo: "https://host-existente.test/krivo_white_symbol_and_tipography_horizontal.svg?v=1" },
      { logo: "/krivo_white_symbol_and_tipography_vertical.svg" },
    ]);
  });

  it("recusa papéis de origem e destino coexistentes sem alterar dados", async () => {
    await client.query(`create role ${newRole} login`);
    await expect(runMigration()).rejects.toMatchObject({ code: "P0001" });
    await client.query("rollback");
    expect((await client.query(`select slug from ${schema}.tenants where id = 1`)).rows).toEqual([{ slug: "crivo-demo" }]);
    expect((await client.query("select count(*)::int as total from pg_roles where rolname = any($1)", [[oldRole, newRole]])).rows[0].total).toBe(2);
  });

  it("recusa colisão do slug e reverte também a renomeação do papel", async () => {
    await client.query(`insert into ${schema}.tenants (id, slug) values (3, 'krivo-demo')`);
    await expect(runMigration()).rejects.toMatchObject({ code: "P0001" });
    await client.query("rollback");
    expect((await client.query("select rolname from pg_roles where rolname = any($1)", [[oldRole, newRole]])).rows).toEqual([{ rolname: oldRole }]);
    expect((await client.query(`select email from ${schema}.users where id = 10`)).rows).toEqual([{ email: "demo@crivo.com.br" }]);
  });
});
