import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { tenants, whatsappChannels } from "../schema";

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const value = error as { code?: unknown; cause?: unknown };
  return typeof value.code === "string" ? value.code : pgCode(value.cause);
}
async function codeOf(promise: Promise<unknown>) {
  try { await promise; return undefined; } catch (error) { return pgCode(error); }
}
const phone = () => randomUUID().replace(/[^0-9]/g, "");
describe("T2 — canal WhatsApp aditivo (USO-01 AC8; USO-02 AC2; Done when T2)", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  beforeAll(async () => {
    await db.insert(tenants).values([tenantA, tenantB].map((id) => ({
      id, name: `Fixture canais ${id}`, agentName: "Agente", supportedModality: "ambos" as const, slug: `fixture-${id}`,
    })));
  });
  afterAll(async () => {
    await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, [tenantA, tenantB]));
    await db.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
    await db.$client.end();
  });
  const channel = () => ({ tenantId: tenantA, phoneNumberId: phone() });
  const verified = () => ({
    ...channel(), accountKind: "production" as const,
    analyticsPhoneNumber: "5534900000000", wabaId: "100000000000",
    accountTimezone: "America/Los_Angeles", ownershipVerifiedAt: new Date(), analyticsVerifiedAt: new Date(),
  });

  it("novo canal nasce desconhecido/desabilitado, sem provas ou lease", async () => {
    const [row] = await db.insert(whatsappChannels).values(channel()).returning();
    expect(row.usageEnabled).toBe(false);
    expect(row.accountKind).toBe("unverified");
    expect(row.wabaId).toBeNull();
    expect(row.accountTimezone).toBeNull();
    expect(row.analyticsPhoneNumber).toBeNull();
    expect(row.ownershipVerifiedAt).toBeNull();
    expect(row.analyticsVerifiedAt).toBeNull();
    expect(row.configurationRevision).toBe(1);
    expect(row.lastUsageAttemptAt).toBeNull();
    expect(row.usageSyncToken).toBeNull();
    expect(row.usageSyncDeadline).toBeNull();
  });

  it("o mesmo número físico não pertence a dois tenants", async () => {
    const input = channel();
    await db.insert(whatsappChannels).values(input);
    expect(await codeOf(db.insert(whatsappChannels).values({ ...input, tenantId: tenantB }))).toBe("23505");
    const rows = await db.select().from(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, input.phoneNumberId));
    expect(rows.map((row) => row.tenantId)).toEqual([tenantA]);
  });

  it("tenant inexistente viola a FK e não deixa canal", async () => {
    const input = { ...channel(), tenantId: randomUUID() };
    expect(await codeOf(db.insert(whatsappChannels).values(input))).toBe("23503");
    expect(await db.select().from(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, input.phoneNumberId))).toHaveLength(0);
  });

  it("canal não verificado ou conta de teste não habilita consumo", async () => {
    expect(await codeOf(db.insert(whatsappChannels).values({ ...channel(), usageEnabled: true }))).toBe("23514");
    for (const accountKind of ["test", "unverified"] as const) {
      expect(await codeOf(db.insert(whatsappChannels).values({ ...verified(), accountKind, usageEnabled: true }))).toBe("23514");
    }
    for (const field of ["ownershipVerifiedAt", "analyticsVerifiedAt", "accountTimezone", "wabaId", "analyticsPhoneNumber"] as const) {
      const input = { ...verified(), usageEnabled: true, [field]: null };
      expect(await codeOf(db.insert(whatsappChannels).values(input))).toBe("23514");
    }
  });

  it("provas completas permitem habilitação explícita, sem assumir fuso SP", async () => {
    const input = { ...verified(), usageEnabled: true };
    const [row] = await db.insert(whatsappChannels).values(input).returning();
    expect(row.usageEnabled).toBe(true);
    expect(row.accountKind).toBe("production");
    expect(row.accountTimezone).toBe("America/Los_Angeles");
    expect(row.ownershipVerifiedAt).toEqual(input.ownershipVerifiedAt);
    expect(row.analyticsVerifiedAt).toEqual(input.analyticsVerifiedAt);
  });

  it("revisão positiva é persistida; zero e negativa são recusadas", async () => {
    for (const configurationRevision of [0, -1]) {
      expect(await codeOf(db.insert(whatsappChannels).values({ ...channel(), configurationRevision }))).toBe("23514");
    }
    const [row] = await db.insert(whatsappChannels).values({ ...channel(), configurationRevision: 2 }).returning();
    expect(row.configurationRevision).toBe(2);
  });

  it("lease exige token e prazo juntos, separados da última tentativa", async () => {
    const usageSyncToken = randomUUID();
    const usageSyncDeadline = new Date("2026-10-02T12:01:30Z");
    const lastUsageAttemptAt = new Date("2026-10-02T12:00:00Z");
    expect(await codeOf(db.insert(whatsappChannels).values({ ...channel(), usageSyncToken }))).toBe("23514");
    expect(await codeOf(db.insert(whatsappChannels).values({ ...channel(), usageSyncDeadline }))).toBe("23514");
    const [row] = await db.insert(whatsappChannels).values({ ...channel(), usageSyncToken, usageSyncDeadline, lastUsageAttemptAt }).returning();
    expect(row.usageSyncToken).toBe(usageSyncToken);
    expect(row.usageSyncDeadline).toEqual(usageSyncDeadline);
    expect(row.lastUsageAttemptAt).toEqual(lastUsageAttemptAt);
  });

  it("excluir tenant dono remove seu canal e preserva o de outro tenant", async () => {
    const owner = randomUUID();
    await db.insert(tenants).values({ id: owner, name: "Dono descartável", agentName: "Agente", supportedModality: "ambos", slug: `fixture-${owner}` });
    const [own] = await db.insert(whatsappChannels).values({ ...channel(), tenantId: owner }).returning();
    const [foreign] = await db.insert(whatsappChannels).values({ ...channel(), tenantId: tenantB }).returning();
    await db.delete(tenants).where(eq(tenants.id, owner));
    expect(await db.select().from(whatsappChannels).where(eq(whatsappChannels.id, own.id))).toHaveLength(0);
    expect(await db.select().from(whatsappChannels).where(eq(whatsappChannels.id, foreign.id))).toEqual([foreign]);
  });
});
