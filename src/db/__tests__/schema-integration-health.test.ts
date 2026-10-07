import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { tenants } from "../schema";

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  return typeof record.code === "string" ? record.code : pgCode(record.cause);
}

describe("L15 T1 — estado de saúde da integração em tenants (ALERTA-01)", () => {
  const created: string[] = [];
  afterAll(async () => {
    if (created.length > 0) await db.delete(tenants).where(inArray(tenants.id, created));
    await db.$client.end();
  });
  async function newTenant() {
    const id = randomUUID();
    created.push(id);
    await db.insert(tenants).values({
      id, slug: `fixture-saude-${id}`, name: "Fixture saúde", agentName: "Agente", supportedModality: "ambos",
    });
    return id;
  }

  it("as duas colunas nascem nulas num tenant novo", async () => {
    const id = await newTenant();
    const [row] = await db.select().from(tenants).where(eq(tenants.id, id));
    expect(row.integrationHealthState).toBeNull();
    expect(row.integrationHealthChangedAt).toBeNull();
  });

  it("aceita saudavel e problema com o instante de mudança", async () => {
    const id = await newTenant();
    const at = new Date("2026-10-01T03:00:00.000Z");
    await db.update(tenants).set({ integrationHealthState: "problema", integrationHealthChangedAt: at }).where(eq(tenants.id, id));
    let [row] = await db.select().from(tenants).where(eq(tenants.id, id));
    expect(row.integrationHealthState).toBe("problema");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe(at.toISOString());
    await db.update(tenants).set({ integrationHealthState: "saudavel" }).where(eq(tenants.id, id));
    [row] = await db.select().from(tenants).where(eq(tenants.id, id));
    expect(row.integrationHealthState).toBe("saudavel");
  });

  it("recusa, no banco, valor fora de saudavel/problema (check 23514)", async () => {
    const id = await newTenant();
    const attempt = db.update(tenants).set({ integrationHealthState: "quebrado" as never }).where(eq(tenants.id, id));
    let code: string | undefined;
    try { await attempt; } catch (error) { code = pgCode(error); }
    expect(code).toBe("23514");
    const [row] = await db.select().from(tenants).where(eq(tenants.id, id));
    expect(row.integrationHealthState).toBeNull();
  });
});
