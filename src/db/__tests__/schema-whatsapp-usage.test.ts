import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { tenants, whatsappChannels, whatsappUsage } from "../schema";

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  return typeof record.code === "string" ? record.code : pgCode(record.cause);
}
async function codeOf(promise: Promise<unknown>) {
  try { await promise; return undefined; } catch (error) { return pgCode(error); }
}

describe("T6 — snapshot mensal sem zero presumido (USO-01/02; Done when T6)", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const foreignPhone = `fixture-${randomUUID()}`;
  const monthStart = new Date("2026-10-01T00:00:00Z");
  const monthEnd = new Date("2026-11-01T00:00:00Z");
  const queryEnd = new Date("2026-10-02T10:00:00Z");
  const lastSuccessAt = new Date("2026-10-02T10:00:15Z");
  const success = { queryEnd, lastSuccessAt, freeServiceVolume: 999 };

  beforeAll(async () => {
    await db.insert(tenants).values([tenantA, tenantB].map((id) => ({
      id, slug: `fixture-${id}`, name: "Fixture consumo", agentName: "Agente", supportedModality: "ambos" as const,
    })));
    await db.insert(whatsappChannels).values({ tenantId: tenantB, phoneNumberId: foreignPhone });
  });
  afterAll(async () => {
    const ids = [tenantA, tenantB];
    await db.delete(whatsappUsage).where(inArray(whatsappUsage.tenantId, ids));
    await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
    await db.delete(tenants).where(inArray(tenants.id, ids));
    await db.$client.end();
  });
  async function period() {
    const phoneNumberId = `fixture-${randomUUID()}`;
    await db.insert(whatsappChannels).values({ tenantId: tenantA, phoneNumberId });
    return { tenantId: tenantA, phoneNumberId, monthStart, monthEnd, accountTimezone: "UTC", configurationRevision: 1 };
  }

  it("mesmo canal/mês/revisão não duplica; mês ou revisão diferente são isolados", async () => {
    const input = await period();
    await db.insert(whatsappUsage).values({ ...input, ...success });
    expect(await codeOf(db.insert(whatsappUsage).values(input))).toBe("23505");
    await db.insert(whatsappUsage).values([
      { ...input, configurationRevision: 2 },
      { ...input, monthStart: new Date("2026-11-01T00:00:00Z"), monthEnd: new Date("2026-12-01T00:00:00Z") },
    ]);
    const rows = await db.select().from(whatsappUsage).where(eq(whatsappUsage.phoneNumberId, input.phoneNumberId));
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.freeServiceVolume === null)).toHaveLength(2);
    expect(rows.find((row) => row.monthStart.getTime() === monthStart.getTime() && row.configurationRevision === 1)?.freeServiceVolume).toBe(999);
  });

  it("volume inteiro não negativo aceita zero explícito e1001; negativo/fracionário são recusados", async () => {
    const input = await period();
    expect(await codeOf(db.insert(whatsappUsage).values({ ...input, ...success, freeServiceVolume: -1 }))).toBe("23514");
    expect(await codeOf(db.insert(whatsappUsage).values({ ...input, ...success, freeServiceVolume: 1.5 }))).toBe("22P02");
    const [zero] = await db.insert(whatsappUsage).values({ ...input, ...success, freeServiceVolume: 0 }).returning();
    const [above] = await db.insert(whatsappUsage).values({ ...await period(), ...success, freeServiceVolume: 1001 }).returning();
    expect(zero.freeServiceVolume).toBe(0);
    expect(above.freeServiceVolume).toBe(1001);
  });

  it("fuso explícito define fronteiras civis UTC/SP/LosAngeles inclusive mudança DST", async () => {
    const fixtures = [
      { accountTimezone: "UTC", start: "2026-10-01T00:00:00Z", end: "2026-11-01T00:00:00Z" },
      { accountTimezone: "America/Sao_Paulo", start: "2026-10-01T03:00:00Z", end: "2026-11-01T03:00:00Z" },
      { accountTimezone: "America/Los_Angeles", start: "2026-11-01T07:00:00Z", end: "2026-12-01T08:00:00Z" },
    ];
    for (const expected of fixtures) {
      const [row] = await db.insert(whatsappUsage).values({ ...await period(), accountTimezone: expected.accountTimezone, monthStart: new Date(expected.start), monthEnd: new Date(expected.end) }).returning();
      expect(row.accountTimezone).toBe(expected.accountTimezone);
      expect(row.monthStart).toEqual(new Date(expected.start));
      expect(row.monthEnd).toEqual(new Date(expected.end));
    }
    expect(await codeOf(db.insert(whatsappUsage).values({ ...await period(), accountTimezone: "America/Sao_Paulo" }))).toBe("23514");
    expect(await codeOf(db.insert(whatsappUsage).values({ ...await period(), accountTimezone: "Mars/Olympus" }))).toBe("22023");
    expect(await codeOf(db.insert(whatsappUsage).values({ ...await period(), accountTimezone: null as never }))).toBe("23502");
  });

  it("FK composta recusa canal estrangeiro/inexistente e não publica snapshot parcial", async () => {
    for (const phoneNumberId of [foreignPhone, `fixture-missing-${randomUUID()}`]) {
      expect(await codeOf(db.insert(whatsappUsage).values({ ...await period(), phoneNumberId, ...success }))).toBe("23503");
      expect(await db.select().from(whatsappUsage).where(eq(whatsappUsage.phoneNumberId, phoneNumberId))).toHaveLength(0);
    }
  });

  it("tentativa/falha não são sucesso; atualizá-las preserva volume e queryEnd bem sucedidos", async () => {
    const input = await period();
    const [unknown] = await db.insert(whatsappUsage).values(input).returning();
    expect(unknown.freeServiceVolume).toBeNull();
    expect(unknown.queryEnd).toBeNull();
    expect(unknown.lastSuccessAt).toBeNull();
    expect(unknown.lastAttemptAt).toBeNull();
    await db.update(whatsappUsage).set(success).where(eq(whatsappUsage.phoneNumberId, input.phoneNumberId));
    const lastAttemptAt = new Date("2026-10-02T10:15:00Z");
    const [failed] = await db.update(whatsappUsage).set({ lastAttemptAt, failureCode: "http-429" }).where(eq(whatsappUsage.phoneNumberId, input.phoneNumberId)).returning();
    expect(failed.freeServiceVolume).toBe(999);
    expect(failed.queryEnd).toEqual(queryEnd);
    expect(failed.lastSuccessAt).toEqual(lastSuccessAt);
    expect(failed.lastAttemptAt).toEqual(lastAttemptAt);
    expect(failed.failureCode).toBe("http-429");
  });

  it("queryEnd é corte do snapshot e distinto do sucesso; fora do mês ou sucesso parcial é recusado", async () => {
    for (const invalid of [new Date("2026-09-30T23:59:59Z"), new Date("2026-11-01T00:00:01Z")]) {
      expect(await codeOf(db.insert(whatsappUsage).values({ ...await period(), ...success, queryEnd: invalid }))).toBe("23514");
    }
    for (const patch of [{ queryEnd: null }, { lastSuccessAt: null }, { freeServiceVolume: null }]) {
      expect(await codeOf(db.insert(whatsappUsage).values({ ...await period(), ...success, ...patch }))).toBe("23514");
    }
    const [row] = await db.insert(whatsappUsage).values({ ...await period(), ...success }).returning();
    expect(row.queryEnd).toEqual(queryEnd);
    expect(row.lastSuccessAt).toEqual(lastSuccessAt);
    expect(row.queryEnd).not.toEqual(row.lastSuccessAt);
  });

  it("expiração é metadado separado; limpar vencido não transporta volume de período anterior", async () => {
    const input = await period();
    const cutoff = new Date("2026-11-01T00:00:00Z");
    const [old] = await db.insert(whatsappUsage).values({ ...input, ...success, expiresAt: cutoff }).returning();
    const [current] = await db.insert(whatsappUsage).values({ ...input, monthStart: cutoff, monthEnd: new Date("2026-12-01T00:00:00Z"), expiresAt: new Date("2026-12-01T00:00:00Z") }).returning();
    const [foreign] = await db.insert(whatsappUsage).values({ ...input, tenantId: tenantB, phoneNumberId: foreignPhone, expiresAt: cutoff }).returning();
    await db.delete(whatsappUsage).where(and(eq(whatsappUsage.tenantId, tenantA), lte(whatsappUsage.expiresAt, cutoff)));
    expect(await db.select().from(whatsappUsage).where(and(eq(whatsappUsage.phoneNumberId, old.phoneNumberId), eq(whatsappUsage.monthStart, old.monthStart)))).toHaveLength(0);
    expect(await db.select().from(whatsappUsage).where(eq(whatsappUsage.phoneNumberId, current.phoneNumberId))).toEqual([current]);
    expect(current.freeServiceVolume).toBeNull();
    expect(await db.select().from(whatsappUsage).where(eq(whatsappUsage.phoneNumberId, foreignPhone))).toEqual([foreign]);
  });

  it("sequência e token de resposta preservam identidade; revisão positiva e sequência não negativa", async () => {
    for (const patch of [{ configurationRevision: 0 }, { configurationRevision: -1 }, { querySequence: -1 }]) {
      expect(await codeOf(db.insert(whatsappUsage).values({ ...await period(), ...patch }))).toBe("23514");
    }
    const responseToken = randomUUID();
    const [row] = await db.insert(whatsappUsage).values({ ...await period(), ...success, configurationRevision: 2, querySequence: 3, responseToken }).returning();
    expect(row.configurationRevision).toBe(2);
    expect(row.querySequence).toBe(3);
    expect(row.responseToken).toBe(responseToken);
    const [unknown] = await db.insert(whatsappUsage).values(await period()).returning();
    expect(unknown.querySequence).toBe(0);
    expect(unknown.responseToken).toBeNull();
    expect(unknown.expiresAt.getTime() - unknown.updatedAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
