import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { tenants, tenantStorefronts } from "../schema";

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  return typeof record.code === "string" ? record.code : pgCode(record.cause);
}

async function codeOf(attempt: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await attempt;
  } catch (error) {
    return pgCode(error);
  }
  return undefined;
}

describe("L16a T1 — tabela da vitrine e destaque de imóvel (VCFG-01, VDEST-01)", () => {
  const created: string[] = [];
  afterAll(async () => {
    if (created.length > 0) await db.delete(tenants).where(inArray(tenants.id, created));
    await db.$client.end();
  });

  async function newTenant() {
    const id = randomUUID();
    created.push(id);
    await db.insert(tenants).values({
      id, slug: `fixture-vitrine-${id}`, name: "Fixture vitrine", agentName: "Agente", supportedModality: "ambos",
    });
    return id;
  }

  it("VCFG-01 AC2: guarda exatamente as colunas da configuração, com chave primária no tenant", async () => {
    const result = await db.execute(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'tenant_storefronts'
      order by column_name`);
    const names = (result.rows as { column_name: string }[]).map((row) => row.column_name);
    expect(names).toEqual([
      "about", "accent_color", "active", "address", "creci", "font", "headline",
      "instagram", "layout", "legal_name", "phone", "tenant_id", "updated_at",
    ]);
    const pk = await db.execute(sql`
      select a.attname from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = 'public.tenant_storefronts'::regclass and i.indisprimary`);
    expect((pk.rows as { attname: string }[]).map((row) => row.attname)).toEqual(["tenant_id"]);
  });

  it("VCFG-01 AC3: padrões são ativa=false, layout=grade e fonte=inter; o resto nasce nulo", async () => {
    const tenantId = await newTenant();
    await db.insert(tenantStorefronts).values({ tenantId });
    const [row] = await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, tenantId));
    expect(row.active).toBe(false);
    expect(row.layout).toBe("grade");
    expect(row.font).toBe("inter");
    expect(row.accentColor).toBeNull();
    expect(row.creci).toBeNull();
    expect(row.legalName).toBeNull();
    expect(row.headline).toBeNull();
    expect(row.about).toBeNull();
    expect(row.instagram).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.address).toBeNull();
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it("VCFG-01 AC1 e Edge Case: excluir a imobiliária remove a linha da vitrine em cascata", async () => {
    const tenantId = await newTenant();
    await db.insert(tenantStorefronts).values({ tenantId, creci: "CRECI 1234", legalName: "Imobiliária Ltda" });
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    created.splice(created.indexOf(tenantId), 1);
    const rows = await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, tenantId));
    expect(rows).toHaveLength(0);
  });

  it("VCFG-01 AC12: o banco recusa active=true com CRECI nulo, vazio ou só espaços (23514)", async () => {
    for (const creci of [null, "", "   "]) {
      const tenantId = await newTenant();
      const code = await codeOf(
        db.insert(tenantStorefronts).values({ tenantId, active: true, creci, legalName: "Imobiliária Ltda" })
      );
      expect(code, `creci=${JSON.stringify(creci)}`).toBe("23514");
      const rows = await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, tenantId));
      expect(rows).toHaveLength(0);
    }
  });

  it("VCFG-01 AC12: o banco recusa active=true com razão social nula, vazia ou só espaços (23514)", async () => {
    for (const legalName of [null, "", "   "]) {
      const tenantId = await newTenant();
      const code = await codeOf(
        db.insert(tenantStorefronts).values({ tenantId, active: true, creci: "CRECI 1234", legalName })
      );
      expect(code, `legalName=${JSON.stringify(legalName)}`).toBe("23514");
    }
  });

  it("VCFG-01 AC12: ativar uma linha existente sem CRECI é recusado e a linha continua inativa", async () => {
    const tenantId = await newTenant();
    await db.insert(tenantStorefronts).values({ tenantId, legalName: "Imobiliária Ltda" });
    const code = await codeOf(
      db.update(tenantStorefronts).set({ active: true }).where(eq(tenantStorefronts.tenantId, tenantId))
    );
    expect(code).toBe("23514");
    const [row] = await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, tenantId));
    expect(row.active).toBe(false);
  });

  it("VCFG-01 AC12: ativa com CRECI e razão social preenchidos é aceita; inativa com campos vazios também", async () => {
    const complete = await newTenant();
    await db.insert(tenantStorefronts).values({ tenantId: complete, active: true, creci: "CRECI 1234", legalName: "Imobiliária Ltda" });
    const [row] = await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, complete));
    expect(row.active).toBe(true);

    const inactive = await newTenant();
    await db.insert(tenantStorefronts).values({ tenantId: inactive, active: false, creci: "", legalName: null });
    const [other] = await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, inactive));
    expect(other.active).toBe(false);
  });

  it("VCFG-01 AC12: o banco recusa cor fora de #rrggbb minúsculo (23514) e aceita #aabbcc", async () => {
    for (const accentColor of ["#ABC", "vermelho", "#aabbc", "#aabbccd", "aabbcc", "#AABBCC"]) {
      const tenantId = await newTenant();
      const code = await codeOf(db.insert(tenantStorefronts).values({ tenantId, accentColor }));
      expect(code, `accentColor=${accentColor}`).toBe("23514");
    }
    const tenantId = await newTenant();
    await db.insert(tenantStorefronts).values({ tenantId, accentColor: "#aabbcc" });
    const [row] = await db.select().from(tenantStorefronts).where(eq(tenantStorefronts.tenantId, tenantId));
    expect(row.accentColor).toBe("#aabbcc");
  });

  it("os dois checks existem em pg_constraint neste alvo (push já saiu com 0 sem aplicar check, L-068)", async () => {
    const result = await db.execute(sql`
      select conname from pg_constraint
      where conrelid = 'public.tenant_storefronts'::regclass and contype = 'c'
      order by conname`);
    expect((result.rows as { conname: string }[]).map((row) => row.conname)).toEqual([
      "tenant_storefronts_accent_color_check",
      "tenant_storefronts_active_requires_identity_check",
    ]);
  });

  it("VDEST-01 AC1: properties.featured é booleano, não nulo, com padrão false", async () => {
    const result = await db.execute(sql`
      select data_type, is_nullable, column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'properties' and column_name = 'featured'`);
    expect(result.rows).toEqual([{ data_type: "boolean", is_nullable: "NO", column_default: "false" }]);
  });
});
