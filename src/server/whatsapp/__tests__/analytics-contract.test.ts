import { describe, expect, it } from "vitest";
import { createAnalyticsContract, createAnalyticsQuery, normalizeAnalytics, type AnalyticsQuery } from "../analytics-contract";

// Envelope interno e prova SINTÉTICA: não documentam JSON Meta nem conta instalada.
const evidence = { id: "fixture-semantic-v1", graphVersion: "v25.0", sourceUrl: "https://example.invalid/fixture",
  verifiedAt: new Date("2026-10-02T11:00:00Z"), responseSha256: "a".repeat(64) };
const contract = createAnalyticsContract(evidence)!;
const zeroContract = createAnalyticsContract({ ...evidence, emptyZeroSha256: "b".repeat(64) })!;
const query = createAnalyticsQuery({ phoneNumberId: "phone-id-confirmed", phoneNumber: "5511999990000", wabaId: "waba-confirmed",
  accountTimezone: "UTC", now: new Date("2026-10-02T12:00:00Z") })!;
function point(patch: Record<string, unknown> = {}) {
  return { phoneNumber: "5511999990000", metric: "VOLUME", category: "SERVICE", pricingType: "FREE_CUSTOMER_SERVICE",
    country: null, start: 1790812800, end: 1790942400, volume: 999, ...patch };
}
function response(partitions: unknown[] = [point()], patch: Record<string, unknown> = {}) {
  return { contractId: "fixture-semantic-v1", wabaId: "waba-confirmed", phoneNumber: "5511999990000", start: 1790812800,
    end: 1790942400, filters: { metric: "VOLUME", category: "SERVICE", pricingType: "FREE_CUSTOMER_SERVICE", dimension: "PHONE" },
    complete: true, hasMore: false, partitions, ...patch };
}
function civil(accountTimezone: string, now: string): AnalyticsQuery | null {
  return createAnalyticsQuery({ phoneNumberId: "phone-id-confirmed", phoneNumber: "5511999990000", wabaId: "waba-confirmed", accountTimezone, now: new Date(now) });
}

describe("T11 — período civil e volume sem saldo presumido", () => {
  it("UTC usa mês completo até instante capturado em segundos, sem consultar futuro", () => {
    const result = civil("UTC", "2026-10-02T12:34:56.789Z")!;
    expect(result.monthStart).toEqual(new Date("2026-10-01T00:00:00Z"));
    expect(result.monthEnd).toEqual(new Date("2026-11-01T00:00:00Z"));
    expect(result.queryEnd).toEqual(new Date("2026-10-02T12:34:56Z"));
    expect(result.start).toBe(1790812800);
    expect(result.end).toBe(1790944496);
    expect(result.filters).toEqual({ metric: "VOLUME", category: "SERVICE", pricingType: "FREE_CUSTOMER_SERVICE", dimension: "PHONE" });
  });

  it("Los Angeles cruza DST no mês, sem usar duração fixa ou fuso SP", () => {
    const result = civil("America/Los_Angeles", "2026-03-15T12:00:00Z")!;
    expect(result.monthStart).toEqual(new Date("2026-03-01T08:00:00Z"));
    expect(result.monthEnd).toEqual(new Date("2026-04-01T07:00:00Z"));
  });

  it("SP ainda está em setembro quando UTC entrou em outubro", () => {
    const result = civil("America/Sao_Paulo", "2026-10-01T01:00:00Z")!;
    expect(result.monthStart).toEqual(new Date("2026-09-01T03:00:00Z"));
    expect(result.monthEnd).toEqual(new Date("2026-10-01T03:00:00Z"));
  });

  it("Tóquio já está em outubro antes de UTC, sem transportar mês anterior", () => {
    const result = civil("Asia/Tokyo", "2026-09-30T16:00:00Z")!;
    expect(result.monthStart).toEqual(new Date("2026-09-30T15:00:00Z"));
    expect(result.monthEnd).toEqual(new Date("2026-10-31T15:00:00Z"));
  });

  it("Havana inclui a primeira hora repetida da meia-noite de novembro", () => {
    const result = civil("America/Havana", "2026-11-01T04:30:00Z")!;
    expect(result.monthStart).toEqual(new Date("2026-11-01T04:00:00Z"));
    expect(result.monthEnd).toEqual(new Date("2026-12-01T05:00:00Z"));
    expect(result.queryEnd).toEqual(new Date("2026-11-01T04:30:00Z"));
  });

  it("Amman abril/2011 começa em 01h após salto de meia-noite, sem omitir mês", () => {
    const result = civil("Asia/Amman", "2011-04-15T12:00:00Z")!;
    expect(result.monthStart).toEqual(new Date("2011-03-31T22:00:00Z"));
    expect(result.monthEnd).toEqual(new Date("2011-04-30T21:00:00Z"));
  });

  it("fuso ausente/offset/desconhecido e identidade/data inválidos não têm default", () => {
    for (const zone of ["", "BRT", "+03:00", "Mars/Olympus"]) expect(civil(zone, "2026-10-02T12:00:00Z")).toBeNull();
    expect(civil("UTC", "invalid-date")).toBeNull();
    expect(createAnalyticsQuery({ phoneNumberId: "", phoneNumber: "5511999990000", wabaId: "waba-confirmed", accountTimezone: "UTC", now: new Date("2026-10-02T12:00:00Z") })).toBeNull();
  });

  it.each([[0, 1000, 0], [999, 1, 0.999], [1000, 0, 1], [1001, 0, 1]])("V=%i conserva volume e calcula restante=%i", (volume, remaining, progress) => {
    expect(normalizeAnalytics(response([point({ volume })]), query, contract)).toEqual({ ok: true, volume: BigInt(volume), remaining, progress });
  });

  it("default sem prova e claim bruto de contrato não concedem capacidade", () => {
    expect(normalizeAnalytics(response(), query)).toEqual({ ok: false, reason: "contract-unverified" });
    expect(normalizeAnalytics(response(), query, { ...evidence })).toEqual({ ok: false, reason: "contract-unverified" });
    expect(createAnalyticsContract()).toBeNull();
    expect(createAnalyticsContract({ ...evidence, responseSha256: "not-a-proof" })).toBeNull();
  });

  it("contrato semântico divergente não supõe shape nem versão", () => {
    expect(normalizeAnalytics(response(undefined, { contractId: "unknown-format" }), query, contract)).toEqual({ ok: false, reason: "invalid-response" });
  });

  it("FEP/template/COST e claims inbound/webhook não entram na franquia", () => {
    const raw = response([point({ volume: 999 }), point({ pricingType: "FREE_ENTRY_POINT", volume: 400 }),
      point({ category: "MARKETING", pricingType: "REGULAR", volume: 300 }), point({ metric: "COST", volume: 500 })],
    { inboundVolume: 600, failedVolume: 700, webhookVolume: 800 });
    expect(normalizeAnalytics(raw, query, contract)).toEqual({ ok: true, volume: 999n, remaining: 1, progress: 0.999 });
  });

  it("países disjuntos somam volume sem duplicar entrega", () => {
    expect(normalizeAnalytics(response([point({ country: "BR", volume: 600 }), point({ country: "PT", volume: 399 })]), query, contract))
      .toEqual({ ok: true, volume: 999n, remaining: 1, progress: 0.999 });
  });

  it("total e detalhe não podem ser somados juntos", () => {
    expect(normalizeAnalytics(response([point(), point({ country: "BR", volume: 999 })]), query, contract)).toEqual({ ok: false, reason: "overlapping-partitions" });
  });

  it("duplicata ou sobreposição temporal no mesmo país não duplica volume", () => {
    expect(normalizeAnalytics(response([point({ country: "BR" }), point({ country: "BR" })]), query, contract)).toEqual({ ok: false, reason: "overlapping-partitions" });
    expect(normalizeAnalytics(response([point({ end: 1790900000 }), point({ start: 1790899999 })]), query, contract)).toEqual({ ok: false, reason: "overlapping-partitions" });
  });

  it("partições temporais contíguas cobrem todo período uma única vez", () => {
    expect(normalizeAnalytics(response([point({ end: 1790877600, volume: 500 }), point({ start: 1790877600, volume: 499 })]), query, contract))
      .toEqual({ ok: true, volume: 999n, remaining: 1, progress: 0.999 });
  });

  it("lacuna temporal ou cobertura parcial não publica novo saldo", () => {
    expect(normalizeAnalytics(response([point({ start: 1790812801 })]), query, contract)).toEqual({ ok: false, reason: "incomplete-response" });
    expect(normalizeAnalytics(response([point({ end: 1790942399 })]), query, contract)).toEqual({ ok: false, reason: "incomplete-response" });
    expect(normalizeAnalytics(response([point({ end: 1790877600 }), point({ start: 1790877601 })]), query, contract)).toEqual({ ok: false, reason: "incomplete-response" });
  });

  it("vazio sem prova específica não significa zero", () => {
    expect(normalizeAnalytics(response([]), query, contract)).toEqual({ ok: false, reason: "zero-unverified" });
    expect(normalizeAnalytics(response([point({ pricingType: "FREE_ENTRY_POINT" })]), query, zeroContract)).toEqual({ ok: false, reason: "zero-unverified" });
  });

  it("vazio só usa zero com prova específica do contrato servidor", () => {
    expect(normalizeAnalytics(response([]), query, zeroContract)).toEqual({ ok: true, volume: 0n, remaining: 1000, progress: 0 });
  });

  it("resposta parcial/paginação incompleta ou flags ausentes é recusada", () => {
    for (const patch of [{ complete: false }, { hasMore: true }, { complete: undefined }, { hasMore: undefined }]) {
      expect(normalizeAnalytics(response(undefined, patch), query, contract)).toEqual({ ok: false, reason: "incomplete-response" });
    }
  });

  it("número/conta divergentes não se confundem com número confirmado", () => {
    expect(normalizeAnalytics(response(undefined, { phoneNumber: "5511000000000" }), query, contract)).toEqual({ ok: false, reason: "identity-mismatch" });
    expect(normalizeAnalytics(response(undefined, { wabaId: "foreign-waba" }), query, contract)).toEqual({ ok: false, reason: "identity-mismatch" });
    expect(normalizeAnalytics(response([point({ phoneNumber: "5511000000000" })]), query, contract)).toEqual({ ok: false, reason: "identity-mismatch" });
  });

  it("filtros não confirmados não substituem SERVICE/FREE_CUSTOMER_SERVICE/VOLUME/PHONE", () => {
    for (const patch of [{ metric: "COST" }, { category: "MARKETING" }, { pricingType: "FREE_ENTRY_POINT" }, { dimension: "TIER" }]) {
      expect(normalizeAnalytics(response(undefined, { filters: { ...query.filters, ...patch } }), query, contract)).toEqual({ ok: false, reason: "filters-mismatch" });
    }
  });

  it("período externo não altera start/queryEnd nem publica período futuro", () => {
    expect(normalizeAnalytics(response(undefined, { start: 1790812801 }), query, contract)).toEqual({ ok: false, reason: "period-mismatch" });
    expect(normalizeAnalytics(response(undefined, { end: 1790942401 }), query, contract)).toEqual({ ok: false, reason: "period-mismatch" });
    expect(normalizeAnalytics(response([point({ end: 1790942401 })]), query, contract)).toEqual({ ok: false, reason: "period-mismatch" });
    expect(normalizeAnalytics(response([point({ start: 1790942400 })]), query, contract)).toEqual({ ok: false, reason: "period-mismatch" });
  });

  it("volume negativo/fracionário/string/não finito/ausente/inseguro não publica saldo", () => {
    for (const volume of [-1, 0.5, "999", NaN, Infinity, undefined, Number.MAX_SAFE_INTEGER + 1]) {
      expect(normalizeAnalytics(response([point({ volume })]), query, contract)).toEqual({ ok: false, reason: "invalid-volume" });
    }
    expect(normalizeAnalytics(response([point({ country: "BR", volume: Number.MAX_SAFE_INTEGER }), point({ country: "PT", volume: 1 })]), query, contract))
      .toEqual({ ok: false, reason: "invalid-volume" });
  });

  it("agregado sem dimensão de país/discriminação e corpo inválido não viram zero", () => {
    expect(normalizeAnalytics(response([point({ country: undefined })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" });
    expect(normalizeAnalytics({ ...response(), partitions: null }, query, contract)).toEqual({ ok: false, reason: "invalid-response" });
  });

  it("aliases de país não parecem partições disjuntas nem duplicam BR", () => {
    expect(normalizeAnalytics(response([point({ country: "BR" }), point({ country: "br" })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" });
    expect(normalizeAnalytics(response([point({ country: "BR" }), point({ country: "Brazil" })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" });
  });

  it("T13 aliases ISO uppercase UK/GB e BU/MM não são países disjuntos", () => {
    expect(normalizeAnalytics(response([point({ country: "GB" }), point({ country: "UK" })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" });
    expect(normalizeAnalytics(response([point({ country: "MM" }), point({ country: "BU" })]), query, contract)).toEqual({ ok: false, reason: "invalid-response" });
  });
});
