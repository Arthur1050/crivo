import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../../../db";
import { tenant_members, tenants, users } from "../../../db/schema";
import { countActiveAdministrators, getBrokers } from "../index";

const tenantId = randomUUID();
const userIds = Array.from({ length: 4 }, () => randomUUID());

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.$client.end();
});

describe("VOCAB-01 AC6 — predicados de papéis", () => {
  it("preserva o SQL literal e o pertencimento a múltiplos papéis nas duas consultas reais", async () => {
    await db.insert(tenants).values({ id: tenantId, name: "Papéis", slug: `roles-${tenantId}`, agentName: "Teste", supportedModality: "ambos" });
    await db.insert(users).values(userIds.map((id, index) => ({ id, name: `Pessoa ${index}`, email: `${id}@fixture.test` })));
    const roles = ["gestor,corretor", "administrador,gestor", "gestor", "administrador,corretor"];
    await db.insert(tenant_members).values(userIds.map((userId, index) => ({
      organizationId: tenantId, userId, role: roles[index], deactivatedAt: index === 3 ? new Date() : null,
    })));
    const query = vi.spyOn(db.$client, "query");
    try {
      expect((await getBrokers(tenantId)).map(row => row.id)).toEqual([userIds[0]]);
      expect(await countActiveAdministrators(tenantId)).toBe(1);
      const statements = query.mock.calls.map(call => {
        const first: unknown = call[0];
        return typeof first === "string" ? first : (first as { text: string }).text;
      });
      const dialect = new PgDialect();
      expect(statements.some(text => text.includes(dialect.sqlToQuery(sql`'corretor' = any(string_to_array(${tenant_members.role}, ','))`).sql))).toBe(true);
      expect(statements.some(text => text.includes(dialect.sqlToQuery(sql`'administrador' = any(string_to_array(${tenant_members.role}, ','))`).sql))).toBe(true);
    } finally {
      query.mockRestore();
    }
  });
});
