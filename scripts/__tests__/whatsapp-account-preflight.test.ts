import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREFLIGHT_TIMEOUT_MS, preflightWhatsAppAccount } from "../whatsapp-account-preflight";

const input = { wabaId: "123", phoneNumberId: "456", tenantId: "11111111-1111-1111-1111-111111111111" };
const source = "https://developers.facebook.com/docs/whatsapp/cloud-api/reference/timezones";
// Fixture de evidência revisada; não comprova o mapping ou acesso da conta real.
const evidence = {
  timezone: { timezoneId: 1, iana: "America/Los_Angeles", source },
  analytics: { source: "https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics", monthlyServiceVolume: true as const, explicitZero: true as const },
};
function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status }); }
function graph(name = "Imobiliaria") {
  return vi.fn<typeof fetch>()
    .mockResolvedValueOnce(json({ id: "123", name, timezone_id: 1 }))
    .mockResolvedValueOnce(json({ data: [{ id: "456" }] }));
}
describe("T1 — diagnóstico de conta, sem presumir consumo (USO-01 AC1/6/7/8; L14B-01 AC2/4)", () => {
  beforeEach(() => vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-server-credential"));
  afterEach(() => vi.unstubAllEnvs());

  it("200 confirma identidade e membership do número esperado; não habilita consumo nem publica saldo", async () => {
    const fetch = graph();
    const result = await preflightWhatsAppAccount(input, { fetch });
    expect(result.account).toEqual({ state: "confirmed", code: "account-read", wabaId: "123", testAccount: false, timezoneId: 1 });
    expect(result.ownership).toEqual({ state: "confirmed", code: "waba-membership", tenantId: input.tenantId, phoneNumberId: "456" });
    expect(result.timezone.state).toBe("pending");
    expect(result.analytics.state).toBe("pending");
    expect(result.zero.state).toBe("pending");
    expect(result.usageEnabled).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(result).not.toHaveProperty("remaining");
    for (const [url, request] of fetch.mock.calls) {
      expect(new URL(String(url)).hostname).toBe("graph.facebook.com");
      expect(new URL(String(url)).searchParams.has("access_token")).toBe(false);
      expect(request?.method).toBe("GET");
      expect(request?.body).toBeUndefined();
      expect(request?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(PREFLIGHT_TIMEOUT_MS).toBe(15_000);
  });

  it.each([[401, "unauthorized"], [403, "forbidden"], [429, "rate-limited"]])("HTTP %i preserva gate pendente e descarta erro sensível", async (status, code) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ error: { message: "test-server-credential conversa completa" } }, Number(status)));
    const result = await preflightWhatsAppAccount(input, { fetch });
    expect(result.account).toEqual({ state: "pending", code });
    expect(result.analytics.state).toBe("pending");
    expect(result.usageEnabled).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/test-server-credential|conversa completa/);
  });

  it("timeout do transporte não expõe exceção e mantém pendência", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new DOMException("test-server-credential", "TimeoutError"));
    const result = await preflightWhatsAppAccount(input, { fetch });
    expect(result.account).toEqual({ state: "pending", code: "timeout" });
    expect(result.usageEnabled).toBe(false);
    expect(JSON.stringify(result)).not.toContain("test-server-credential");
  });

  it("conta de teste não comprova Analytics de produção mesmo com evidência documental", async () => {
    const result = await preflightWhatsAppAccount({ ...input, evidence }, { fetch: graph("Test WhatsApp Business Account") });
    expect(result.account.testAccount).toBe(true);
    expect(result.analytics).toEqual({ state: "pending", code: "test-account-production-unproven" });
    expect(result.zero.state).toBe("pending");
    expect(result.usageEnabled).toBe(false);
  });

  it("número divergente da lista de WABA não confirma vínculo", async () => {
    const fetch = graph();
    fetch.mockReset().mockResolvedValueOnce(json({ id: "123", name: "Imobiliaria", timezone_id: 1 })).mockResolvedValueOnce(json({ data: [{ id: "999" }] }));
    const result = await preflightWhatsAppAccount({ ...input, evidence }, { fetch });
    expect(result.ownership).toEqual({ state: "pending", code: "number-mismatch" });
    expect(result.analytics.state).toBe("pending");
  });

  it("fuso primário revisado distingue o fuso da conta do fuso SP; zero e primeira consulta ficam pendentes", async () => {
    const result = await preflightWhatsAppAccount({ ...input, evidence }, { fetch: graph() });
    expect(result.timezone).toEqual({ state: "confirmed", code: "primary-timezone-reviewed", iana: "America/Los_Angeles", source });
    expect(result.monthlyContract).toEqual({ state: "confirmed", code: "monthly-contract-reviewed", source: evidence.analytics.source });
    expect(result.analytics).toEqual({ state: "pending", code: "account-access-full-month-response-pending" });
    expect(result.zero).toEqual({ state: "pending", code: "documented-zero-account-response-pending" });
    expect(result.usageEnabled).toBe(false);
    expect(result).not.toHaveProperty("used");
  });

  it.each([
    { ...evidence, timezone: { ...evidence.timezone, timezoneId: 2 } },
    { ...evidence, timezone: { ...evidence.timezone, source: "https://example.test/timezone" } },
    { ...evidence, timezone: { ...evidence.timezone, iana: "Zona/Inexistente" } },
    { timezone: evidence.timezone, analytics: { ...evidence.analytics, explicitZero: false as unknown as true } },
  ])("evidência ausente/divergente/inválida ou zero não documentado não autoriza consumo", async (proof) => {
    const result = await preflightWhatsAppAccount({ ...input, evidence: proof }, { fetch: graph() });
    expect(result.analytics.state).toBe("pending");
    expect(result.zero.state).toBe("pending");
    expect(result.usageEnabled).toBe(false);
  });

  it("sem credencial servidor não faz rede", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const fetch = graph();
    const result = await preflightWhatsAppAccount(input, { fetch });
    expect(result.account).toEqual({ state: "pending", code: "credential-missing" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("locator documental com segredo em query ou fragmento não entra no relatório (L14B-01 AC4)", async () => {
    for (const suffix of ["?access_token=test-server-credential", "#test-server-credential-conversa-completa"]) {
      for (const proof of [
        { ...evidence, timezone: { ...evidence.timezone, source: source + suffix } },
        { ...evidence, analytics: { ...evidence.analytics, source: evidence.analytics.source + suffix } },
      ]) {
        const result = await preflightWhatsAppAccount({ ...input, evidence: proof }, { fetch: graph() });
        expect(result.monthlyContract.state).toBe("pending");
        expect(result.analytics.state).toBe("pending");
        expect(JSON.stringify(result)).not.toMatch(/test-server-credential|access_token|conversa-completa/);
        expect(result.usageEnabled).toBe(false);
      }
    }
  });

  it("paginação incompleta não confirma número encontrado numa página parcial", async () => {
    const fetch = graph();
    fetch.mockReset().mockResolvedValueOnce(json({ id: "123", name: "Imobiliaria", timezone_id: 1 })).mockResolvedValueOnce(json({ data: [{ id: "456" }], paging: { next: "https://attacker.test?access_token=secret" } }));
    const result = await preflightWhatsAppAccount(input, { fetch });
    expect(result.ownership).toEqual({ state: "pending", code: "incomplete-number-pagination" });
    expect(JSON.stringify(result)).not.toMatch(/attacker|secret/);
  });
});
