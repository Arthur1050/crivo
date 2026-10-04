import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../db";
import { integrationRefusals, tenantApiKeys, tenants, whatsappChannels, whatsappUsage } from "../../../../db/schema";
import { DELETE, GET, PATCH, POST, PUT } from "../../../../../app/api/v1/whatsapp/usage/sync/route";
import * as analytics from "../../../whatsapp/analytics";
import * as usageData from "../../../data/whatsapp";
import { analyticsFixtureAdapter, analyticsFixtureChannel, analyticsFixtureGraph as graph } from "../../../whatsapp/__tests__/analytics-fixtures";
import { MAX_BODY_BYTES } from "../../parsers";

const tenantId = randomUUID(), foreignTenant = randomUUID(), apiKey = `fixture-${randomUUID()}`, base = new Date("2026-10-02T12:00:00Z");
const adapter = analyticsFixtureAdapter(base), realSync = analytics.syncUsage;
let clock: Date, fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
async function channel(patch: Partial<typeof whatsappChannels.$inferInsert> = {}) {
  return analyticsFixtureChannel(tenantId, base, { phoneNumberId: BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), ...patch });
}
function post(phoneNumberId: string, body: unknown = { phoneNumberId }, raw?: string, authenticated = true) {
  return POST(new Request("http://local/api/v1/whatsapp/usage/sync", { method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: `Bearer ${apiKey}` } : {}) }, body: raw ?? JSON.stringify(body) }), undefined);
}
async function periods(phoneNumberId: string) { return db.select().from(whatsappUsage).where(and(eq(whatsappUsage.tenantId, tenantId), eq(whatsappUsage.phoneNumberId, phoneNumberId))); }
async function payload(response: Response, status = 200) { expect(response.status).toBe(status); return response.json(); }
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T44", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(tenantApiKeys).values({ tenantId, label: "fixtureT44", keyHash: createHash("sha256").update(apiKey).digest("hex") });
});
beforeEach(() => {
  clock = base; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(clock); vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "fixture-sync-server-token");
  fetcher = vi.fn<typeof fetch>(async (url) => graph(url));
  // Prova sintética só na dependência interna do teste, nunca habilitada pelo body.
  vi.spyOn(analytics, "syncUsage").mockImplementation((auth, input) => realSync(auth, input, { now: () => clock, adapter, fetch: fetcher }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(integrationRefusals).where(inArray(integrationRefusals.tenantId, ids)); await db.delete(whatsappUsage).where(inArray(whatsappUsage.tenantId, ids));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids)); await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
  await db.delete(tenants).where(inArray(tenants.id, ids)); await db.$client.end();
});

describe("T44 — sincronização autenticada sem parâmetros Graph do caller", () => {
  it("primeira consulta200 devolve snapshot permitido e monta mês/filtros do servidor", async () => {
    const row = await channel(), response = await payload(await post(row.phoneNumberId));
    expect(response).toEqual({ result: "synced", snapshot: { state: "available", phoneLabel: row.analyticsPhoneNumber, monthLabel: "outubro de 2026", used: 999, remaining: 1, queriedAt: base.toISOString(), stale: false, updateFailed: false, estimated: true } });
    expect(fetcher).toHaveBeenCalledTimes(1); const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.pathname).toBe(`/${adapter.contract.graphVersion}/${row.wabaId}/pricing_analytics`);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ start: "1790812800", end: "1790942400", phone_numbers: JSON.stringify([row.analyticsPhoneNumber]), pricing_types: '["FREE_CUSTOMER_SERVICE"]', pricing_categories: '["SERVICE"]' });
    expect((await periods(row.phoneNumberId))[0].freeServiceVolume).toBe(999);
  });
  it("cadência200 skip até15min e lease ativa não consulta nem altera snapshot", async () => {
    const row = await channel(); await payload(await post(row.phoneNumberId)); const saved = await periods(row.phoneNumberId);
    clock = new Date(base.getTime() + 899999); vi.setSystemTime(clock);
    expect(await payload(await post(row.phoneNumberId))).toMatchObject({ result: "skipped", reason: "cadence", snapshot: { used: 999 } });
    expect(await periods(row.phoneNumberId)).toEqual(saved); expect(fetcher).toHaveBeenCalledTimes(1);
    await db.update(whatsappChannels).set({ usageSyncToken: randomUUID(), usageSyncDeadline: new Date(clock.getTime() + 90000) }).where(eq(whatsappChannels.id, row.id));
    expect(await payload(await post(row.phoneNumberId))).toMatchObject({ result: "skipped", reason: "lease-active", snapshot: { used: 999 } }); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("canal desabilitado/teste/estrangeiro/ausente200 indisponível sem tentativa Graph", async () => {
    for (const patch of [{ usageEnabled: false }, { accountKind: "test" as const, usageEnabled: false }, { tenantId: foreignTenant }]) {
      const row = await channel(patch), before = await db.select().from(whatsappChannels).where(eq(whatsappChannels.id, row.id));
      expect(await payload(await post(row.phoneNumberId))).toEqual({ result: "unavailable", reason: "usage-disabled", snapshot: { state: "unavailable", label: "Consumo indisponível" } });
      expect(await periods(row.phoneNumberId)).toEqual([]); expect(await db.select().from(whatsappChannels).where(eq(whatsappChannels.id, row.id))).toEqual(before);
    }
    expect(await payload(await post("00000000000000000001"))).toMatchObject({ result: "unavailable", snapshot: { state: "unavailable" } }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("adapter produtivo ausente200 conserva indisponível sem presumir zero", async () => {
    const row = await channel(); vi.mocked(analytics.syncUsage).mockImplementation(realSync); const guard = vi.spyOn(globalThis, "fetch");
    expect(await payload(await post(row.phoneNumberId))).toEqual({ result: "unavailable", reason: "contract-unverified", snapshot: { state: "unavailable", label: "Consumo indisponível" } });
    expect(guard).not.toHaveBeenCalled(); expect((await periods(row.phoneNumberId))[0]).toMatchObject({ freeServiceVolume: null, lastSuccessAt: null, failureCode: "contract-unverified" });
  });
  it("429200 conserva snapshot factual e limita nova tentativa por15min", async () => {
    const row = await channel(); await payload(await post(row.phoneNumberId)); const [saved] = await periods(row.phoneNumberId);
    clock = new Date(base.getTime() + 900000); vi.setSystemTime(clock); fetcher.mockResolvedValueOnce(new Response("fixture-private-error", { status: 429 }));
    expect(await payload(await post(row.phoneNumberId))).toMatchObject({ result: "unavailable", reason: "rate-limited", snapshot: { state: "available", used: 999, queriedAt: base.toISOString(), updateFailed: true } });
    const [after] = await periods(row.phoneNumberId); expect(after).toMatchObject({ freeServiceVolume: saved.freeServiceVolume, queryEnd: saved.queryEnd, lastSuccessAt: saved.lastSuccessAt, failureCode: "rate-limited" });
    expect(await payload(await post(row.phoneNumberId))).toMatchObject({ result: "skipped", reason: "cadence" }); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("timeout200 conserva volume/queryEnd/sucesso sem erro bruto", async () => {
    const row = await channel(); await payload(await post(row.phoneNumberId)); const [saved] = await periods(row.phoneNumberId);
    clock = new Date(base.getTime() + 900000); vi.setSystemTime(clock); let elapsed = 0; vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    fetcher.mockImplementationOnce(async (url) => { const response = graph(url); response.json = async () => { elapsed = 15000; return {}; }; return response; });
    expect(await payload(await post(row.phoneNumberId))).toMatchObject({ result: "unavailable", reason: "timeout", snapshot: { state: "available", used: 999, updateFailed: true } });
    expect((await periods(row.phoneNumberId))[0]).toMatchObject({ freeServiceVolume: saved.freeServiceVolume, queryEnd: saved.queryEnd, lastSuccessAt: saved.lastSuccessAt, failureCode: "timeout" });
  });
  it("virada de mês não apresenta snapshot anterior e respeita cadência antes de nova consulta", async () => {
    const row = await channel(); clock = new Date("2026-10-31T23:55:00Z"); vi.setSystemTime(clock); await payload(await post(row.phoneNumberId));
    clock = new Date("2026-11-01T00:00:00Z"); vi.setSystemTime(clock);
    expect(await payload(await post(row.phoneNumberId))).toEqual({ result: "skipped", reason: "cadence", snapshot: { state: "unavailable", label: "Consumo indisponível" } }); expect(fetcher).toHaveBeenCalledTimes(1);
    clock = new Date("2026-11-01T00:10:00Z"); vi.setSystemTime(clock); fetcher.mockImplementationOnce(async (url) => graph(url, 2));
    expect(await payload(await post(row.phoneNumberId))).toMatchObject({ result: "synced", snapshot: { monthLabel: "novembro de 2026", used: 2, remaining: 998 } });
    expect(await periods(row.phoneNumberId)).toHaveLength(2); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("401/corpo400/413/controles Graph400/verbos405 não consultam nem gravam", async () => {
    const row = await channel(); expect(await payload(await post(row.phoneNumberId, undefined, "{", false), 401)).toMatchObject({ code: "nao-autenticado" });
    expect(await payload(await post(row.phoneNumberId, undefined, "{"), 400)).toMatchObject({ code: "payload-invalido" });
    expect(await payload(await post(row.phoneNumberId, undefined, " ".repeat(MAX_BODY_BYTES + 1)), 413)).toMatchObject({ code: "corpo-grande-demais" });
    for (const body of [null, [], {}, { phoneNumberId: 123 }, { phoneNumberId: "x" }, ...["tenantId", "expectedRevision", "wabaId", "start", "end", "adapter", "token", "phoneNumber", "granularity"].map((key) => ({ phoneNumberId: row.phoneNumberId, [key]: "fixture" }))]) expect(await payload(await post(row.phoneNumberId, body), 400)).toMatchObject({ code: "payload-invalido" });
    for (const handler of [GET, PUT, PATCH, DELETE]) { const response = handler(); expect(response.headers.get("Allow")).toBe("POST"); expect(await payload(response, 405)).toMatchObject({ code: "metodo-nao-suportado" }); }
    expect(fetcher).not.toHaveBeenCalled(); expect(await periods(row.phoneNumberId)).toEqual([]);
  });
  it("falha de persistência503 tem detalhe estático e não publica snapshot inventado", async () => {
    const row = await channel(); vi.mocked(analytics.syncUsage).mockResolvedValueOnce({ ok: false, reason: "persistence-failed" });
    expect(await payload(await post(row.phoneNumberId), 503)).toMatchObject({ code: "servico-indisponivel", detail: "Sincronização de consumo temporariamente indisponível." }); expect(await periods(row.phoneNumberId)).toEqual([]); expect(fetcher).not.toHaveBeenCalled();
    vi.mocked(analytics.syncUsage).mockResolvedValueOnce({ ok: false, reason: "usage-disabled" });
    vi.spyOn(usageData, "getIntegrationUsage").mockRejectedValueOnce(new Error("fixture-private-db-error"));
    expect(await payload(await post(row.phoneNumberId), 503)).toMatchObject({ code: "servico-indisponivel", detail: "Leitura de consumo temporariamente indisponível." });
    expect(await periods(row.phoneNumberId)).toEqual([]); expect(fetcher).not.toHaveBeenCalled();
  });
});
