import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { leads, tenant_members, tenants, users } from "../../../db/schema";
import { assignBrokerForEscalation } from "../index";

const at = new Date("2026-10-06T15:00:00Z"), tenantIds: string[] = [], userIds: string[] = [];
async function tenant() {
  const id = randomUUID(); await db.insert(tenants).values({ id, slug: `fixture-${id}`, name: "Fixture T22", agentName: "Agente", supportedModality: "ambos" }); tenantIds.push(id); return id;
}
async function member(tenantId: string, patch: Partial<typeof tenant_members.$inferInsert> = {}) {
  const id = randomUUID(); await db.insert(users).values({ id, name: "Corretor próprio", email: `${id}@fixture.test` }); userIds.push(id);
  await db.insert(tenant_members).values({ organizationId: tenantId, userId: id, role: "corretor", createdAt: new Date("2026-01-01T00:00:00Z"), workDays: [1, 2, 3, 4, 5], workHoursStart: "09:00", workHoursEnd: "18:00", ...patch }); return id;
}
async function lead(tenantId: string, patch: Partial<typeof leads.$inferInsert> = {}) {
  return (await db.insert(leads).values({ tenantId, name: "Lead próprio", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: at, region: "Região preservada", executiveSummary: "Resumo anterior", ...patch }).returning())[0];
}
async function read(id: string) { return (await db.select().from(leads).where(eq(leads.id, id)))[0]; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => {
  if (tenantIds.length) { await db.delete(leads).where(inArray(leads.tenantId, tenantIds)); await db.delete(tenant_members).where(inArray(tenant_members.organizationId, tenantIds)); await db.delete(tenants).where(inArray(tenants.id, tenantIds)); }
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds)); await db.$client.end();
});

describe("T22 — atribuição composta na transação do episódio", () => {
  it("responsável existente permanece, patch parcial e null preservam contrato", async () => {
    const tenantId = await tenant(), existing = await member(tenantId, { deactivatedAt: at }); await member(tenantId);
    const row = await lead(tenantId, { assignedUserId: existing });
    const result = await assignBrokerForEscalation(tenantId, row.id, at, { status: "escalado_humano", escalationReason: "Ausência de resposta", executiveSummary: null });
    expect(result).toMatchObject({ ok: true, brokerId: existing });
    const stored = await read(row.id);
    expect(stored).toEqual({ ...row, status: "escalado_humano", statusChangedBy: "agente", escalationReason: "Ausência de resposta", executiveSummary: null, updatedAt: stored.updatedAt });
    expect(result.ok && result.lead).toEqual(stored);
  });
  it("escolhe corretor elegível com menor carga na mesma escrita de status/motivo", async () => {
    const tenantId = await tenant(), busy = await member(tenantId), idle = await member(tenantId, { createdAt: new Date("2026-01-02T00:00:00Z") });
    await lead(tenantId, { assignedUserId: busy }); const row = await lead(tenantId);
    const result = await db.transaction((tx) => assignBrokerForEscalation(tenantId, row.id, at, { status: "escalado_humano", escalationReason: "Silêncio" }, tx));
    expect(result).toMatchObject({ ok: true, brokerId: idle }); expect(await read(row.id)).toMatchObject({ assignedUserId: idle, status: "escalado_humano", statusChangedBy: "agente", escalationReason: "Silêncio" });
  });
  it("sem corretor ativo escala sem responsável, sem selecionar gestor/inativo", async () => {
    const tenantId = await tenant(); await member(tenantId, { role: "gestor" }); await member(tenantId, { deactivatedAt: at }); const row = await lead(tenantId);
    const result = await assignBrokerForEscalation(tenantId, row.id, at, { status: "escalado_humano", escalationReason: "Sem resposta" });
    expect(result).toMatchObject({ ok: true, brokerId: null }); expect(await read(row.id)).toMatchObject({ assignedUserId: null, status: "escalado_humano", escalationReason: "Sem resposta" });
  });
  it("seleção tenant-scoped não atribui corretor de outra imobiliária", async () => {
    const own = await tenant(), foreign = await tenant(); await member(foreign); const row = await lead(own);
    expect(await db.transaction((tx) => assignBrokerForEscalation(own, row.id, at, { status: "escalado_humano" }, tx))).toMatchObject({ ok: true, brokerId: null });
    expect(await read(row.id)).toMatchObject({ assignedUserId: null, status: "escalado_humano" });
  });
  it("lead alheio recusa e mantém todos os campos intactos", async () => {
    const own = await tenant(), foreign = await tenant(), row = await lead(own);
    expect(await assignBrokerForEscalation(foreign, row.id, at, { status: "escalado_humano" })).toEqual({ ok: false, reason: "lead-nao-encontrado" }); expect(await read(row.id)).toEqual(row);
  });
  it("executor fornecido usa somente transação externa, sem SAVEPOINT", async () => {
    const tenantId = await tenant(), broker = await member(tenantId), row = await lead(tenantId);
    const client = await db.$client.connect();
    try {
      const database = drizzle(client, { schema }), outer = vi.spyOn(database, "transaction"), global = vi.spyOn(db, "transaction"), queries = vi.spyOn(client, "query");
      expect(await database.transaction((tx) => assignBrokerForEscalation(tenantId, row.id, at, { status: "escalado_humano" }, tx))).toMatchObject({ ok: true, brokerId: broker });
      expect(outer).toHaveBeenCalledTimes(1); expect(global).not.toHaveBeenCalled();
      const statements = queries.mock.calls.map((call) => {
        const config: unknown = call[0];
        return typeof config === "string" ? config : config && typeof config === "object" && "text" in config ? String(config.text) : "";
      });
      for (const operation of [/^begin\b/i, /^select\b/i, /^update\b/i, /^commit\b/i]) expect(statements.some((statement) => operation.test(statement))).toBe(true);
      expect(statements.some((statement) => /savepoint/i.test(statement))).toBe(false);
      expect(await read(row.id)).toMatchObject({ assignedUserId: broker, status: "escalado_humano" });
    } finally { client.release(); }
  });
  it("erro depois da atribuição desfaz status/responsável/motivo/timestamps integralmente", async () => {
    const tenantId = await tenant(); await member(tenantId); const row = await lead(tenantId);
    await expect(db.transaction(async (tx) => {
      const result = await assignBrokerForEscalation(tenantId, row.id, at, { status: "escalado_humano", escalationReason: "Rollback próprio" }, tx);
      expect(result).toMatchObject({ ok: true, lead: { status: "escalado_humano", escalationReason: "Rollback próprio" } }); throw new Error("fixture-rollback");
    })).rejects.toThrow("fixture-rollback"); expect(await read(row.id)).toEqual(row);
  });
  it("duas transações esperam lead; seleção após lock vê carga nova e preserva responsável", async () => {
    const tenantId = await tenant(), busy = await member(tenantId), idle = await member(tenantId, { createdAt: new Date("2026-01-02T00:00:00Z") }), row = await lead(tenantId);
    const blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect(), pidA = deferred<number>(), pidB = deferred<number>();
    let pending: ReturnType<typeof assignBrokerForEscalation>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.id]);
      function run(client: PoolClient, pid: ReturnType<typeof deferred<number>>, reason: string) {
        return drizzle(client, { schema }).transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return assignBrokerForEscalation(tenantId, row.id, at, { status: "escalado_humano", escalationReason: reason }, tx); });
      }
      pending = [run(a, pidA, "Primeiro"), run(b, pidB, "Segundo")];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); let waiting = 0;
      for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) { waiting = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting; if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 50)); }
      expect(waiting).toBe(2);
      await blocker.query("INSERT INTO leads (id,tenant_id,name,phone,status,first_contact_at,assigned_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)", [randomUUID(), tenantId, "Carga própria após espera", "+5534900000000", "em_qualificacao", at, busy]);
      await blocker.query("COMMIT"); const results = await Promise.all(pending);
      expect(results.map((result) => result.ok ? result.brokerId : null)).toEqual([idle, idle]);
      expect(await read(row.id)).toMatchObject({ status: "escalado_humano", statusChangedBy: "agente", assignedUserId: idle });
      expect(["Primeiro", "Segundo"]).toContain((await read(row.id)).escalationReason);
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });
});
