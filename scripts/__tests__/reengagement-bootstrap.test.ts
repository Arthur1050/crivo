import { afterEach, describe, expect, it, vi } from "vitest";
import { createN8nStateReader, diagnoseReengagementBootstrap, runBootstrapCli, type BootstrapDependencies, type CrmSnapshot } from "../reengagement-bootstrap";
import { preflightWhatsAppAccount } from "../whatsapp-account-preflight";

const tenantId = "11111111-1111-1111-1111-111111111111";
const leadId = "22222222-2222-2222-2222-222222222222";
const anchorId = "33333333-3333-3333-3333-333333333333";
const otherId = "44444444-4444-4444-4444-444444444444";
const version = "2026-10-01T12:00:00.000Z";
const key = { tenantSlug: "fixture", waId: "synthetic-wa-id", leadId };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function snapshot(): CrmSnapshot {
  return { tenantId, tenantSlug: key.tenantSlug,
    channels: [{ id: otherId, tenantId, phoneNumberId: "456", wabaId: "123", configurationRevision: 2 }],
    leads: [{ id: leadId, tenantId, externalId: key.waId, resetAt: null, anchorId, revision: 3, projection: null, consumedEpisodes: 0 }] };
}
function row(overrides: Record<string, unknown> = {}) {
  return { ...key, fase: "agendando", anchorMessageId: anchorId, expectedRevision: 3, resetObservedAt: null, updatedAt: version,
    bufferJson: "texto privado", aberturasJson: '["texto privado"]', ...overrides };
}
function reader(fetch: typeof globalThis.fetch) {
  return createN8nStateReader({ origin: "https://n8n.example", tableId: "0123456789abcdef", apiKey: "synthetic-n8n-secret", fetch });
}
function deps(state = row(), initial = snapshot(), current = initial): BootstrapDependencies {
  return { readCrm: vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(current),
    readState: vi.fn().mockResolvedValue({ state: "observed", row: state }) };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
afterEach(() => vi.unstubAllEnvs());

describe("T65 — bootstrap readonly, tenant e estado observado", () => {
  it("distingue fase real, linha ausente e cache legado sem prova de contexto", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({ data: [row()], nextCursor: null }))
      .mockResolvedValueOnce(json({ data: [], nextCursor: null }))
      .mockResolvedValueOnce(json({ data: [row({ anchorMessageId: undefined, expectedRevision: undefined, resetObservedAt: undefined, lastInboundAt: version })], nextCursor: null }));
    const run = () => diagnoseReengagementBootstrap({ tenantId }, { readCrm: async () => snapshot(), readState: reader(fetch) });
    const observed = (await run()).leads[0];
    expect(observed).toMatchObject({ phase: "agendando", source: "n8n-data-table-row", sourceVersion: version,
      observedRevision: 3, expectedRevision: 3, gate: { state: "confirmed", code: "observed-context-verified" } });
    expect((await run()).leads[0]).toMatchObject({ phase: null, source: "absent", gate: { state: "pending", code: "phase-absent" } });
    expect((await run()).leads[0]).toMatchObject({ phase: "agendando", observedRevision: null,
      gate: { state: "pending", code: "cache-context-proof-missing" } });
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/v1/data-tables/0123456789abcdef/rows");
    expect(JSON.parse(url.searchParams.get("filter")!)).toEqual({ type: "and", filters: [
      { columnName: "tenantSlug", condition: "eq", value: key.tenantSlug }, { columnName: "waId", condition: "eq", value: key.waId },
    ] });
  });

  it("recusa âncora/reset/revisão antigos no cache ou alterados durante leitura", async () => {
    for (const [change, code] of [
      [{ anchorMessageId: otherId }, "anchor-changed"], [{ resetObservedAt: version }, "reset-changed"],
      [{ expectedRevision: 2 }, "revision-conflict"],
    ] as const) {
      expect((await diagnoseReengagementBootstrap({ tenantId }, deps(row(change)))).leads[0].gate).toEqual({ state: "pending", code });
    }
    for (const [change, code] of [
      [{ anchorId: otherId }, "anchor-changed"], [{ resetAt: version }, "reset-changed"], [{ revision: 4 }, "revision-conflict"],
    ] as const) {
      const current = snapshot(); Object.assign(current.leads[0], change);
      expect((await diagnoseReengagementBootstrap({ tenantId }, deps(row(), snapshot(), current))).leads[0].gate).toEqual({ state: "pending", code });
    }
  });

  it("marca WABA de teste com preflight real sem inferir acesso a produção", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "synthetic-meta-secret");
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({ id: "123", name: "Test WhatsApp Business Account", timezone_id: 1 }))
      .mockResolvedValueOnce(json({ data: [{ id: "456" }] }));
    const dependencies = deps(); dependencies.preflight = (input) => preflightWhatsAppAccount(input, { fetch });
    const report = await diagnoseReengagementBootstrap({ tenantId }, dependencies);
    expect(report.channels[0]).toMatchObject({ account: { state: "confirmed", code: "account-observed" }, testAccount: true, usageEnabled: false });
    expect(report.channels[0].analytics.state).toBe("pending");
    expect(report.usageEnabled).toBe(false);
    expect(fetch.mock.calls.every(([, request]) => request?.method === "GET" && request.body === undefined)).toBe(true);
  });

  it("canal/fuso/mês/zero sem prova mantêm capacidades desabilitadas inclusive sem canais", async () => {
    const result = await diagnoseReengagementBootstrap({ tenantId }, deps());
    expect(result.channels[0]).toMatchObject({ usageEnabled: false, ownership: { state: "pending" },
      timezone: { state: "pending" }, analytics: { state: "pending", code: "full-civil-month-and-zero-proof-required" } });
    expect(result).toMatchObject({ usageEnabled: false, dispatchEnabled: false });
    expect(result).not.toHaveProperty("remaining");
    const missing = snapshot(); missing.channels = [];
    expect((await diagnoseReengagementBootstrap({ tenantId }, deps(row(), missing))).channels).toEqual([]);
  });

  it("dryrun usa apenas GET e snapshots imutáveis sem alterar banco, conta, workflow ou env", async () => {
    vi.stubEnv("N8N_API_KEY", "process-secret");
    const stored = freeze(snapshot());
    const before = JSON.stringify(stored);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ data: [row()], nextCursor: null }));
    const readCrm = vi.fn().mockResolvedValue(stored);
    const report = await runBootstrapCli(["--tenant-id", tenantId], { readCrm, readState: reader(fetch) });
    expect(report.gate.state).toBe("confirmed");
    expect(report.dryRun).toBe(true);
    expect(JSON.stringify(stored)).toBe(before);
    expect(readCrm.mock.calls).toEqual([[tenantId], [tenantId]]);
    expect(process.env.N8N_API_KEY).toBe("process-secret");
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(fetch.mock.calls[0][1]?.body).toBeUndefined();
  });

  it("exige tenant explícito e recusa snapshot/linha de outro tenant antes de qualificá-los", async () => {
    const dependencies = deps();
    for (const tenant of [undefined, "not-a-tenant"]) {
      expect((await diagnoseReengagementBootstrap({ tenantId: tenant }, dependencies)).gate.code).toBe("explicit-tenant-required");
    }
    expect(dependencies.readCrm).not.toHaveBeenCalled();
    const foreign = snapshot(); foreign.leads[0].tenantId = otherId;
    const crossed = deps(row(), foreign);
    expect((await diagnoseReengagementBootstrap({ tenantId }, crossed)).gate.code).toBe("tenant-snapshot-unverified");
    expect(crossed.readState).not.toHaveBeenCalled();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ data: [row({ tenantSlug: "other" })], nextCursor: null }));
    expect(await reader(fetch)(key)).toEqual({ state: "pending" });
  });

  it("replay preserva encerramento e episódios consumidos sem reabrir ou rearmar envio", async () => {
    const stored = snapshot(); stored.leads[0].projection = { anchorId, resetAt: null, phase: "encerrada" };
    stored.leads[0].consumedEpisodes = 1; freeze(stored);
    const before = JSON.stringify(stored);
    for (let attempt = 0; attempt < 2; attempt++) {
      const report = await diagnoseReengagementBootstrap({ tenantId }, deps(row({ fase: "encerrada" }), stored));
      expect(report.leads[0]).toMatchObject({ phase: "encerrada", gate: { state: "confirmed", code: "projection-phase-current" },
        dispatch: { state: "pending", code: "episode-already-consumed" } });
      expect(report.dispatchEnabled).toBe(false);
    }
    expect((await diagnoseReengagementBootstrap({ tenantId }, deps(row(), stored))).leads[0].gate.code).toBe("phase-closed");
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("sanitiza credenciais/textos e falhas; API indisponível ou paginação inválida nunca vira ausência", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({ data: [row()], nextCursor: null }));
    const report = await diagnoseReengagementBootstrap({ tenantId }, { readCrm: async () => snapshot(), readState: reader(fetch) });
    expect(JSON.stringify(report)).not.toMatch(/synthetic-n8n-secret|synthetic-wa-id|texto privado|bufferJson|aberturasJson/);
    expect(fetch.mock.calls[0][1]?.headers).toEqual({ "X-N8N-API-KEY": "synthetic-n8n-secret" });
    expect(String(fetch.mock.calls[0][0])).not.toContain("synthetic-n8n-secret");
    for (const response of [json({ error: "secret lead text" }, 404), json({ data: [] }),
      json({ data: [row(), row()], nextCursor: null }), json({ data: [], nextCursor: "again" })]) {
      const failing = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
      expect(await reader(failing)(key)).toEqual({ state: "pending" });
    }
    const unavailable = deps(); unavailable.readState = vi.fn().mockRejectedValue(new Error("secret lead text"));
    expect((await diagnoseReengagementBootstrap({ tenantId }, unavailable)).leads[0]).toMatchObject({ phase: null, source: "pending", gate: { code: "state-read-pending" } });
    unavailable.readCrm = vi.fn().mockRejectedValue(new Error("postgres://secret"));
    expect(JSON.stringify(await diagnoseReengagementBootstrap({ tenantId }, unavailable))).not.toMatch(/postgres|secret/);
    const paged = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(json({ data: [], nextCursor: "page-two" }))
      .mockResolvedValueOnce(json({ data: [row()], nextCursor: null }));
    expect((await reader(paged)(key)).state).toBe("observed");
    expect(new URL(String(paged.mock.calls[1][0])).searchParams.get("cursor")).toBe("page-two");
  });

  it("recusa aplicação, seed e rotação antes de qualquer leitura ou efeito externo", async () => {
    const dependencies = deps();
    expect((await runBootstrapCli(["--tenant-id", tenantId, "--apply"], dependencies)).gate.code).toBe("application-outside-diagnostic");
    for (const flag of ["--seed", "--rotate-key", "--tenant-id"]) {
      const args = flag === "--tenant-id" ? [flag] : ["--tenant-id", tenantId, flag];
      expect((await runBootstrapCli(args, dependencies)).gate.code).toBe("invalid-arguments");
    }
    expect(dependencies.readCrm).not.toHaveBeenCalled();
    expect(dependencies.readState).not.toHaveBeenCalled();
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(await createN8nStateReader({ origin: "https://secret:password@n8n.example", tableId: "0123456789abcdef", apiKey: "secret", fetch })(key)).toEqual({ state: "pending" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
