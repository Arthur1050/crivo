import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { leads, tenantApiKeys, tenants, whatsappChannels } from "../../../db/schema";
import { authenticate } from "../../integration/auth";
import { resolveChannel } from "../channels";

const SYNTHETIC_TOKEN = "fixture-server-credential-not-for-dto";
function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  return typeof record.code === "string" ? record.code : pgCode(record.cause);
}
async function codeOf(promise: Promise<unknown>) {
  try { await promise; return undefined; } catch (error) { return pgCode(error); }
}

describe("T7 — canal servidor e Analytics independentes (USO-01 AC8; L14B-01 AC1/2)", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const ctxA = { tenantId: tenantA };
  const ctxB = { tenantId: tenantB };
  const key = `fixture-auth-${randomUUID()}`;
  const verifiedAt = new Date("2026-10-02T12:00:00Z");
  beforeAll(async () => {
    await db.insert(tenants).values([tenantA, tenantB].map((id) => ({
      id, slug: `fixture-${id}`, name: "Fixture canal", agentName: "Agente", supportedModality: "ambos" as const,
    })));
    await db.insert(tenantApiKeys).values({ tenantId: tenantA, label: "Fixture canais", keyHash: createHash("sha256").update(key).digest("hex") });
  });
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", SYNTHETIC_TOKEN);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Resolvedor não chama a Meta"); }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    const ids = [tenantA, tenantB];
    await db.delete(tenantApiKeys).where(inArray(tenantApiKeys.tenantId, ids));
    await db.delete(leads).where(inArray(leads.tenantId, ids));
    await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
    await db.delete(tenants).where(inArray(tenants.id, ids));
    await db.$client.end();
  });
  async function channel(patch: Partial<typeof whatsappChannels.$inferInsert> = {}) {
    const [row] = await db.insert(whatsappChannels).values({
      tenantId: tenantA, phoneNumberId: `fixture-${randomUUID()}`,
      accountKind: "production", ownershipVerifiedAt: verifiedAt,
      wabaId: "1000000000000001", analyticsPhoneNumber: "15555550100",
      accountTimezone: "America/Los_Angeles", analyticsVerifiedAt: verifiedAt,
      usageEnabled: true, ...patch,
    }).returning();
    return row;
  }

  it("canal ausente/null/vazio permanece desconhecido sem consulta remota", async () => {
    for (const phoneNumberId of [null, "", " ", `missing-${randomUUID()}`]) {
      expect(await resolveChannel(ctxA, { phoneNumberId })).toEqual({ ok: false, reason: "unknown-channel" });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tenant vem da autenticação existente; outro tenant não é revelado nem associado", async () => {
    const own = await channel();
    const foreign = await channel({ tenantId: tenantB });
    const auth = await authenticate(new Request("http://local/api/v1/statuses", { headers: { Authorization: `Bearer ${key}`, "X-Crivo-Tenant": `fixture-${tenantB}` } }));
    expect(auth).toEqual(ctxA);
    if (auth instanceof Response) throw new Error("Fixture não autenticada");
    expect(await resolveChannel(auth, { phoneNumberId: foreign.phoneNumberId })).toEqual({ ok: false, reason: "unknown-channel" });
    const result = await resolveChannel(auth, { phoneNumberId: own.phoneNumberId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Fixture própria não resolvida");
    expect(result.channel.tenantId).toBe(tenantA);
  });

  it("unicidade global recusa cadastro duplicado sem trocar propriedade", async () => {
    const own = await channel();
    expect(await codeOf(db.insert(whatsappChannels).values({ tenantId: tenantB, phoneNumberId: own.phoneNumberId }))).toBe("23505");
    const result = await resolveChannel(ctxA, { phoneNumberId: own.phoneNumberId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Fixture própria não resolvida");
    expect(result.channel.id).toBe(own.id);
    expect(await resolveChannel(ctxB, { phoneNumberId: own.phoneNumberId })).toEqual({ ok: false, reason: "unknown-channel" });
  });

  it("cadastro sem ownership provado não é identidade autorizada", async () => {
    const row = await channel({ usageEnabled: false, ownershipVerifiedAt: null });
    expect(await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId })).toEqual({ ok: false, reason: "ownership-unverified" });
  });

  it("conta test ou unverified nunca habilita Analytics mesmo com demais metadados", async () => {
    for (const accountKind of ["test", "unverified"] as const) {
      const row = await channel({ usageEnabled: false, accountKind });
      const result = await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Identidade deve continuar disponível");
      expect(result.usage).toEqual({ enabled: false, reason: "account-not-production" });
    }
  });

  it("fuso ausente/inválido/abreviação/offset não vira IANA nem habilita consumo", async () => {
    for (const accountTimezone of [null, "Mars/Olympus", "PST", "GMT", "+03:00"]) {
      const row = await channel({ accountTimezone, usageEnabled: accountTimezone !== null });
      const result = await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Identidade deve continuar disponível");
      expect(result.usage).toEqual({ enabled: false, reason: "timezone-unverified" });
    }
  });

  it("permissão Analytics ou número normalizado não provados deixam consumo indisponível", async () => {
    for (const patch of [{ analyticsVerifiedAt: null }, { analyticsPhoneNumber: null }, { analyticsPhoneNumber: " " }]) {
      const row = await channel({ usageEnabled: false, ...patch });
      const result = await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Identidade deve continuar disponível");
      expect(result.usage).toEqual({ enabled: false, reason: "analytics-unverified" });
    }
  });

  it("WABA ausente impede consumo sem impedir a identidade do canal", async () => {
    const row = await channel({ usageEnabled: false, wabaId: null });
    const result = await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Identidade deve continuar disponível");
    expect(result.usage).toEqual({ enabled: false, reason: "waba-unverified" });
  });

  it("configuração mudou: revisão antiga falha antes da credencial; nova revisão é explícita", async () => {
    const row = await channel();
    await db.update(whatsappChannels).set({ configurationRevision: 2 }).where(eq(whatsappChannels.id, row.id));
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    expect(await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId, expectedRevision: 1 })).toEqual({ ok: false, reason: "configuration-changed" });
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", SYNTHETIC_TOKEN);
    const result = await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId, expectedRevision: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Revisão atual deve resolver");
    expect(result.channel.configurationRevision).toBe(2);
  });

  it("credencial ausente no processo falha com código sem segredo ou rede", async () => {
    const row = await channel();
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", " ");
    expect(await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId })).toEqual({ ok: false, reason: "credential-missing" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retorno interno tem chaves/valores explícitos, sem token em resultado/log/erro", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const row = await channel();
    const result = await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId });
    expect(result).toEqual({
      ok: true,
      channel: { id: row.id, tenantId: tenantA, phoneNumberId: row.phoneNumberId, configurationRevision: 1 },
      usage: { enabled: true, wabaId: "1000000000000001", analyticsPhoneNumber: "15555550100", accountTimezone: "America/Los_Angeles" },
    });
    expect(JSON.stringify(result)).not.toContain(SYNTHETIC_TOKEN);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("legado não infere canal de agentWhatsapp ou telefone exibido da lead", async () => {
    await channel();
    await db.update(tenants).set({ agentWhatsapp: "+15555550100" }).where(eq(tenants.id, tenantA));
    const [lead] = await db.insert(leads).values({ tenantId: tenantA, name: "Lead legado", phone: "+15555550100", status: "em_qualificacao", firstContactAt: new Date() }).returning();
    expect(lead.whatsappPhoneNumberId).toBeNull();
    expect(await resolveChannel(ctxA, { phoneNumberId: lead.whatsappPhoneNumberId })).toEqual({ ok: false, reason: "unknown-channel" });
    expect(await resolveChannel(ctxA, { phoneNumberId: lead.phone })).toEqual({ ok: false, reason: "unknown-channel" });
  });

  it("produção com todos os gates e UTC habilita consumo sem consulta externa", async () => {
    const row = await channel({ accountTimezone: "UTC", configurationRevision: 3 });
    const result = await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId, expectedRevision: 3 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Fixture verificada deve resolver");
    expect(result.channel.configurationRevision).toBe(3);
    expect(result.usage).toEqual({ enabled: true, wabaId: "1000000000000001", analyticsPhoneNumber: "15555550100", accountTimezone: "UTC" });
  });

  it("provas completas sem usageEnabled não ativam Analytics por inferência", async () => {
    const row = await channel({ usageEnabled: false });
    const result = await resolveChannel(ctxA, { phoneNumberId: row.phoneNumberId });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Identidade deve continuar disponível");
    expect(result.usage).toEqual({ enabled: false, reason: "usage-disabled" });
  });
});
