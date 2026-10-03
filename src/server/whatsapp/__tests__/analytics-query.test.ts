import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnalyticsQuery } from "../analytics-contract";
import { createAnalyticsAdapter, queryAnalytics, type AnalyticsAdapterProof } from "../analytics";

// Provas e respostas sintéticas; nenhuma configura produção ou comprova volume real.
const token = "fixture-analytics-server-credential";
const proof: AnalyticsAdapterProof = { contract: { id: "fixture-v25", graphVersion: "v25.0",
  sourceUrl: "https://example.invalid/fixture", verifiedAt: new Date("2026-10-02T11:00:00Z"), responseSha256: "a".repeat(64) },
  format: "meta-v25-pricing-analytics", phoneFilter: "normalized-number", pagination: "single-page-no-paging",
  fullMonthSha256: "b".repeat(64), numberFilterSha256: "c".repeat(64), paginationSha256: "d".repeat(64) };
const adapter = createAnalyticsAdapter(proof)!;
const query = createAnalyticsQuery({ phoneNumberId: "1321478747709350", phoneNumber: "5511999990000", wabaId: "1000000000000000",
  accountTimezone: "UTC", now: new Date("2026-10-02T12:00:00Z") })!;
function payload(patch: Record<string, unknown> = {}) {
  return { data: [{ data_points: [{ start: 1790812800, end: 1790942400, phone_number: "5511999990000", country: "BR",
    pricing_type: "FREE_CUSTOMER_SERVICE", pricing_category: "SERVICE", volume: 999, ...patch }] }] };
}
function response(body: unknown = payload(), status = 200) { return new Response(JSON.stringify(body), { status }); }
beforeEach(() => { vi.stubEnv("WHATSAPP_ACCESS_TOKEN", token); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("T12 — Graph comprovado com falha fechada e orçamento total", () => {
  it("GET usa filtro normalizado comprovado, período e dimensões exatos, sem token na URL", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    expect(await queryAnalytics(query, adapter, { fetch: fetcher })).toEqual({ ok: true, volume: 999n, remaining: 1, progress: 0.999 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [address, init] = fetcher.mock.calls[0];
    const url = new URL(String(address));
    expect(url.origin + url.pathname).toBe("https://graph.facebook.com/v25.0/1000000000000000/pricing_analytics");
    expect(Object.fromEntries(url.searchParams)).toEqual({ start: "1790812800", end: "1790942400", granularity: "DAILY",
      metric_types: '["VOLUME"]', pricing_categories: '["SERVICE"]', pricing_types: '["FREE_CUSTOMER_SERVICE"]',
      phone_numbers: '["5511999990000"]', dimensions: '["PHONE","PRICING_CATEGORY","PRICING_TYPE","COUNTRY"]' });
    expect(url.toString()).not.toContain(query.phoneNumberId);
    expect(url.toString()).not.toContain(token);
    expect(init!.method).toBe("GET");
    expect(init!.cache).toBe("no-store");
    expect(new Headers(init!.headers).get("Authorization")).toBe(`Bearer ${token}`);
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });

  it("sem contrato/default/prova integral não chama Meta nem concede capacidade pelo claim", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    expect(await queryAnalytics(query, null, { fetch: fetcher })).toEqual({ ok: false, reason: "contract-unverified" });
    expect(await queryAnalytics(query, { ...adapter }, { fetch: fetcher })).toEqual({ ok: false, reason: "contract-unverified" });
    expect(createAnalyticsAdapter()).toBeNull();
    expect(createAnalyticsAdapter({ ...proof, fullMonthSha256: "unproved" })).toBeNull();
    expect(createAnalyticsAdapter({ ...proof, contract: { ...proof.contract, graphVersion: "v26.0" } })).toBeNull();
    expect(createAnalyticsAdapter({ ...proof, phoneFilter: "phone-number-id" as never })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("credencial ausente recusa sem fetch ou zero", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", " ");
    const fetcher = vi.fn<typeof fetch>(async () => response());
    expect(await queryAnalytics(query, adapter, { fetch: fetcher })).toEqual({ ok: false, reason: "credential-missing" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([401, 403])("HTTP%i vira permission-denied limitado", async (status) => {
    expect(await queryAnalytics(query, adapter, { fetch: async () => response({ error: { message: `${token} conversa privada` } }, status) }))
      .toEqual({ ok: false, reason: "permission-denied" });
  });

  it("429 vira rate-limited, sem retry ou interpretação de corpo como zero", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ error: { message: `${token} conversa privada` } }, 429));
    expect(await queryAnalytics(query, adapter, { fetch: fetcher })).toEqual({ ok: false, reason: "rate-limited" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("erro de rede/HTTP/JSON não retorna nem registra token ou erro bruto", async () => {
    const log = vi.spyOn(console, "error");
    const results = [await queryAnalytics(query, adapter, { fetch: async () => { throw new Error(`${token} conversa privada`); } }),
      await queryAnalytics(query, adapter, { fetch: async () => response({ error: `${token} conversa privada` }, 500) }),
      await queryAnalytics(query, adapter, { fetch: async () => new Response("invalid-json") })];
    expect(results).toEqual(Array(3).fill({ ok: false, reason: "transport-failed" }));
    expect(JSON.stringify(results)).not.toContain(token);
    expect(JSON.stringify(results)).not.toContain("conversa privada");
    expect(log).not.toHaveBeenCalled();
  });

  it("fetch pendente aborta exatamente no orçamento total de 15s", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let settled = false;
    const pending = queryAnalytics(query, adapter, { fetch: async (_url, init) => { signal = init!.signal!; return new Promise<Response>(() => {}); } });
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(signal!.aborted).toBe(true);
  });

  it("10s de fetch + JSON pendente compartilham 15s, sem novo prazo para corpo", async () => {
    vi.useFakeTimers();
    const json = vi.fn(async () => new Promise<unknown>(() => {}));
    const body = response();
    body.json = json;
    let signal: AbortSignal | undefined;
    let settled = false;
    const pending = queryAnalytics(query, adapter, { fetch: async (_url, init) => { signal = init!.signal!; await new Promise((resolve) => setTimeout(resolve, 10_000)); return body; } });
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(json).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(signal!.aborted).toBe(true);
  });

  it("paging/next não é seguido nem vira resposta integral", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response({ ...payload(), paging: { next: `https://example.invalid/${token}` } }));
    expect(await queryAnalytics(query, adapter, { fetch: fetcher })).toEqual({ ok: false, reason: "incomplete-response" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bucket parcial ou país não canônico não é completado por inferência", async () => {
    expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ start: 1790838000, end: 1790924400 })) }))
      .toEqual({ ok: false, reason: "incomplete-response" });
    expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ country: "Brazil" })) }))
      .toEqual({ ok: false, reason: "invalid-response" });
  });

  it("número divergente ou shape desconhecido não se torna saldo", async () => {
    expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ phone_number: "5511888880000" })) }))
      .toEqual({ ok: false, reason: "identity-mismatch" });
    expect(await queryAnalytics(query, adapter, { fetch: async () => response({ data: [{ unfamiliar: [] }] }) }))
      .toEqual({ ok: false, reason: "incomplete-response" });
  });

  it("zero explícito válido funciona, vazio sem prova continua indisponível", async () => {
    expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ volume: 0 })) }))
      .toEqual({ ok: true, volume: 0n, remaining: 1000, progress: 0 });
    expect(await queryAnalytics(query, adapter, { fetch: async () => response({ data: [] }) }))
      .toEqual({ ok: false, reason: "zero-unverified" });
  });

  it("vazio só é zero com prova específica configurada no servidor", async () => {
    const zeroAdapter = createAnalyticsAdapter({ ...proof, contract: { ...proof.contract, emptyZeroSha256: "e".repeat(64) } })!;
    expect(await queryAnalytics(query, zeroAdapter, { fetch: async () => response({ data: [] }) }))
      .toEqual({ ok: true, volume: 0n, remaining: 1000, progress: 0 });
  });

  it("guarda viva/cancelamento antes do transporte impede fetch", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => response());
    expect(await queryAnalytics(query, adapter, { fetch: fetcher, beforeFetch: async () => false })).toEqual({ ok: false, reason: "request-obsolete" });
    const controller = new AbortController();
    controller.abort();
    expect(await queryAnalytics(query, adapter, { fetch: fetcher, signal: controller.signal })).toEqual({ ok: false, reason: "request-obsolete" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("country null não é agregado total comprovado no decoder v25 observado", async () => {
    expect(await queryAnalytics(query, adapter, { fetch: async () => response(payload({ country: null })) }))
      .toEqual({ ok: false, reason: "invalid-response" });
  });

  it("JSON síncrono que ultrapassa deadline monotônico não retorna sucesso", async () => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const body = response();
    body.json = async () => { elapsed = 15_000; return payload(); };
    let signal: AbortSignal | undefined;
    expect(await queryAnalytics(query, adapter, { fetch: async (_url, init) => { signal = init!.signal!; return body; } }))
      .toEqual({ ok: false, reason: "timeout" });
    expect(signal!.aborted).toBe(true);
  });

  it("decode síncrono que ultrapassa deadline monotônico não publica volume", async () => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const raw = payload();
    Object.defineProperty(raw.data[0].data_points[0], "volume", { enumerable: true, get: () => { elapsed = 15_001; return 999; } });
    const body = response();
    body.json = async () => raw;
    let signal: AbortSignal | undefined;
    expect(await queryAnalytics(query, adapter, { fetch: async (_url, init) => { signal = init!.signal!; return body; } }))
      .toEqual({ ok: false, reason: "timeout" });
    expect(signal!.aborted).toBe(true);
  });
});
