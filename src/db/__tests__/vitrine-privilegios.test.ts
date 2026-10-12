import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { properties, tenants, tenantStorefronts, users } from "../schema";
import { resolveVitrineTestUrl } from "../test-connection";
import { currentTestDatabaseUrl } from "./vitrine-helpers";

// Este teste CONECTA como `krivo_vitrine`, com a senha de VITRINE_TEST_DB_PASSWORD
// (ambiente local). Ele afirma o estado que `npm run db:push:test` deixou no
// alvo (papel, views, grants); não reaplica o SQL por conta própria.

const ROLE = "krivo_vitrine";
const TABLES_DENIED = [
  "leads", "messages", "conversations", "users", "sessions", "accounts",
  "tenants", "tenant_storefronts", "properties", "tenant_api_keys",
] as const;
const VIEWS = ["lojas", "imoveis"] as const;

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  return typeof record.code === "string" ? record.code : pgCode(record.cause);
}

async function codeOf(attempt: Promise<unknown>): Promise<string | undefined> {
  try {
    await attempt;
  } catch (error) {
    return pgCode(error);
  }
  return undefined;
}

describe("L16a T9 — papel krivo_vitrine e grants (VBANCO-02)", () => {
  let vitrine: Client;
  let tenantId: string;
  let slug: string;
  let userId: string;

  it("a senha de teste do papel está no ambiente local (sem ela este teste falha, não pula)", () => {
    expect(
      process.env.VITRINE_TEST_DB_PASSWORD,
      "VITRINE_TEST_DB_PASSWORD não está definida no ambiente local: sem ela não há login como krivo_vitrine."
    ).toBeTruthy();
  });

  beforeAll(async () => {
    // Lança com mensagem clara (sem a URL) quando a senha falta.
    const url = resolveVitrineTestUrl({
      baseUrl: currentTestDatabaseUrl(),
      password: process.env.VITRINE_TEST_DB_PASSWORD,
    });
    vitrine = new Client({ connectionString: url });
    await vitrine.connect();

    userId = randomUUID();
    tenantId = randomUUID();
    slug = `fixture-privilegios-${tenantId}`;
    await db.insert(users).values({ id: userId, name: "Captador privilégios", email: `${userId}@fixture.test` });
    await db.insert(tenants).values({
      id: tenantId, slug, name: "Fixture privilégios", agentName: "Agente", supportedModality: "ambos",
      agentWhatsapp: "5534999990000", city: "Uberaba", state: "MG",
    });
    await db.insert(tenantStorefronts).values({
      tenantId, active: true, creci: "CRECI 1", legalName: "Fixture Ltda",
    });
    await db.insert(properties).values({
      tenantId, capturedByUserId: userId, sequence: 1, reference: "PRV-1",
      kind: "casa", modality: "novo", status: "disponivel", published: true,
      neighborhood: "Centro", neighborhoodNormalized: "centro", city: "Uberaba", cityNormalized: "uberaba", state: "MG",
      priceCents: 100_000_00n, areaSqm: 80, bedrooms: 2, bathrooms: 1, parkingSpots: 1,
    });
  });

  afterAll(async () => {
    await vitrine?.end();
    await db.delete(properties).where(eq(properties.tenantId, tenantId));
    await db.delete(tenants).where(inArray(tenants.id, [tenantId]));
    await db.delete(users).where(eq(users.id, userId));
    await db.$client.end();
  });

  describe("o que o papel lê (AC7)", () => {
    it("lê vitrine.lojas e enxerga a loja da fixture", async () => {
      const result = await vitrine.query("select slug from vitrine.lojas where slug = $1", [slug]);
      expect(result.rows).toEqual([{ slug }]);
    });

    it("lê vitrine.imoveis e enxerga o imóvel da fixture", async () => {
      const result = await vitrine.query("select referencia from vitrine.imoveis where loja_slug = $1", [slug]);
      expect(result.rows).toEqual([{ referencia: "PRV-1" }]);
    });
  });

  describe("o que o papel NÃO lê (AC8): 42501 em cada tabela, uma asserção por tabela", () => {
    it.each(TABLES_DENIED)("SELECT em public.%s é recusado com 42501", async (table) => {
      expect(await codeOf(vitrine.query(`select 1 from public.${table} limit 1`))).toBe("42501");
    });
  });

  describe("o que o papel NÃO escreve (AC9)", () => {
    // Coluna que cada view tem de fato: o SQL precisa ser válido para que a
    // recusa seja de privilégio ou de escrita, não de coluna inexistente.
    const column: Record<(typeof VIEWS)[number], string> = { lojas: "slug", imoveis: "referencia" };
    const statements: Record<string, string> = {
      INSERT: "insert into vitrine.%v default values",
      UPDATE: "update vitrine.%v set %c = %c",
      DELETE: "delete from vitrine.%v",
    };
    for (const view of VIEWS) {
      for (const [verb, template] of Object.entries(statements)) {
        it(`${verb} em vitrine.${view} é recusado`, async () => {
          const code = await codeOf(vitrine.query(template.replaceAll("%v", view).replaceAll("%c", column[view])));
          // 25006 (transação somente leitura), 42501 (sem privilégio) ou 55000
          // (view de junção não é atualizável): qualquer uma é recusa do Postgres.
          expect(["25006", "42501", "55000"]).toContain(code);
        });
      }
    }

    it("nada foi escrito pelas tentativas: a loja e o imóvel da fixture continuam como estavam", async () => {
      const lojas = await db.execute(sql`select count(*)::int as n from vitrine.lojas where slug = ${slug}`);
      const imoveis = await db.execute(sql`select count(*)::int as n from vitrine.imoveis where loja_slug = ${slug}`);
      expect(lojas.rows[0].n).toBe(1);
      expect(imoveis.rows[0].n).toBe(1);
    });
  });

  describe("configuração do papel (AC6) e isolamento (AC10, AC11), vistos como dono", () => {
    it("AC6: login, default_transaction_read_only = on e statement_timeout = 5s no papel", async () => {
      const result = await db.execute(sql`
        select rolcanlogin, rolconfig from pg_roles where rolname = ${ROLE}`);
      const role = result.rows[0] as { rolcanlogin: boolean; rolconfig: string[] };
      expect(role.rolcanlogin).toBe(true);
      expect(role.rolconfig).toContain("default_transaction_read_only=on");
      expect(role.rolconfig).toContain("statement_timeout=5s");
    });

    it("AC6: a sessão do papel nasce somente leitura e com timeout de 5 s; escrever é recusado com 25006", async () => {
      const readOnly = await vitrine.query("show default_transaction_read_only");
      expect(readOnly.rows[0].default_transaction_read_only).toBe("on");
      const timeout = await vitrine.query("show statement_timeout");
      expect(timeout.rows[0].statement_timeout).toBe("5s");
      expect(await codeOf(vitrine.query("create temp table escrita_proibida (a int)"))).toBe("25006");
    });

    it("AC6: USAGE no schema vitrine", async () => {
      const result = await db.execute(sql`select has_schema_privilege(${ROLE}, 'vitrine', 'USAGE') as ok`);
      expect(result.rows[0].ok).toBe(true);
    });

    it("AC10: não é membro de neon_superuser nem de papel algum, e não tem atributos elevados", async () => {
      const member = await db.execute(sql`select pg_has_role(${ROLE}, 'neon_superuser', 'member') as ok`);
      expect(member.rows[0].ok).toBe(false);
      const memberships = await db.execute(sql`
        select count(*)::int as n from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = ${ROLE}`);
      expect(memberships.rows[0].n).toBe(0);
      const attrs = await db.execute(sql`
        select rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_roles where rolname = ${ROLE}`);
      expect(attrs.rows[0]).toEqual({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false });
    });

    it("AC11: role_table_grants tem exatamente duas linhas, SELECT em vitrine.lojas e em vitrine.imoveis", async () => {
      const result = await db.execute(sql`
        select table_schema, table_name, privilege_type from information_schema.role_table_grants
        where grantee = ${ROLE} order by table_schema, table_name, privilege_type`);
      expect(result.rows).toEqual([
        { table_schema: "vitrine", table_name: "imoveis", privilege_type: "SELECT" },
        { table_schema: "vitrine", table_name: "lojas", privilege_type: "SELECT" },
      ]);
    });

    it("AC11: nenhuma tabela, view ou coluna de public é legível pelo papel (nem por privilégio de coluna)", async () => {
      const result = await db.execute(sql`
        select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
          and has_any_column_privilege(${ROLE}, c.oid, 'select, insert, update, references')
        order by c.relname`);
      expect(result.rows).toEqual([]);
    });
  });
});
