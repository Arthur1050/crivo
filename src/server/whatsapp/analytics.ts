import "server-only";
import { createAnalyticsContract, normalizeAnalytics, type AnalyticsContract, type AnalyticsContractEvidence, type AnalyticsNormalization, type AnalyticsQuery } from "./analytics-contract";
import { CLOUD_API_TIMEOUT_MS, GRAPH_API_VERSION } from "./cloud-api";

export type AnalyticsAdapterProof = {
  contract: AnalyticsContractEvidence;
  format: "meta-v25-pricing-analytics";
  phoneFilter: "normalized-number";
  pagination: "single-page-no-paging";
  fullMonthSha256: string;
  numberFilterSha256: string;
  paginationSha256: string;
};
export type AnalyticsAdapter = Readonly<{ contract: AnalyticsContract; phoneFilter: "normalized-number" }>;
const adapters = new WeakSet<object>();
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

/** Configuração interna revisada, nunca claim do payload. Nenhuma prova real tem default. */
export function createAnalyticsAdapter(proof: AnalyticsAdapterProof | null = null): AnalyticsAdapter | null {
  if (!proof || !record(proof.contract) || proof.format !== "meta-v25-pricing-analytics" || proof.contract.graphVersion !== GRAPH_API_VERSION
    || proof.phoneFilter !== "normalized-number" || proof.pagination !== "single-page-no-paging"
    || !hash(proof.fullMonthSha256) || !hash(proof.numberFilterSha256) || !hash(proof.paginationSha256)) return null;
  const contract = createAnalyticsContract(proof.contract);
  if (!contract) return null;
  const adapter = Object.freeze({ contract, phoneFilter: proof.phoneFilter });
  adapters.add(adapter);
  return adapter;
}

export type AnalyticsQueryResult = AnalyticsNormalization
  | { ok: false; reason: "credential-missing" | "permission-denied" | "rate-limited" | "transport-failed" | "timeout" | "request-obsolete" };

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Shape básico observado em probe read-only v25; integralidade/zero precisam de prova separada. */
function decode(payload: unknown, query: AnalyticsQuery, adapter: AnalyticsAdapter): AnalyticsQueryResult {
  if (!record(payload) || !Array.isArray(payload.data)) return { ok: false, reason: "invalid-response" };
  // Não segue URL externa/next nem transforma página parcial em snapshot.
  if ("paging" in payload) return { ok: false, reason: "incomplete-response" };
  if (Object.keys(payload).some((key) => key !== "data")) return { ok: false, reason: "invalid-response" };
  const partitions: Record<string, unknown>[] = [];
  for (const group of payload.data) {
    if (!record(group) || !Array.isArray(group.data_points) || "paging" in group
      || Object.keys(group).some((key) => key !== "data_points")) return { ok: false, reason: "incomplete-response" };
    for (const point of group.data_points) {
      if (!record(point) || typeof point.country !== "string" || !/^[A-Z]{2}$/.test(point.country)
        || Object.keys(point).some((key) => !["start", "end", "phone_number", "country", "pricing_type", "pricing_category", "volume"].includes(key))) {
        return { ok: false, reason: "invalid-response" };
      }
      partitions.push({ start: point.start, end: point.end, phoneNumber: point.phone_number, country: point.country,
        pricingType: point.pricing_type, category: point.pricing_category, volume: point.volume, metric: "VOLUME" });
    }
  }
  // A comprovação do contrato associa endpoint/filtros/páginas ao request; Meta não ecoa esses campos.
  return normalizeAnalytics({ contractId: adapter.contract.id, wabaId: query.wabaId, phoneNumber: query.phoneNumber,
    start: query.start, end: query.end, filters: query.filters, complete: true, hasMore: false, partitions }, query, adapter.contract);
}

/** Uma chamada, orçamento total de 15s incluindo corpo JSON. Resultado nunca carrega erro bruto/token. */
export async function queryAnalytics(
  query: AnalyticsQuery,
  adapter: AnalyticsAdapter | null = null,
  dependencies: { fetch?: typeof fetch; beforeFetch?: () => Promise<boolean>; signal?: AbortSignal } = {},
): Promise<AnalyticsQueryResult> {
  if (!adapter || !adapters.has(adapter)) return { ok: false, reason: "contract-unverified" };
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, reason: "credential-missing" };
  const controller = new AbortController();
  const expiresAt = performance.now() + CLOUD_API_TIMEOUT_MS;
  const signal = dependencies.signal ? AbortSignal.any([controller.signal, dependencies.signal]) : controller.signal;
  const stopped = (): AnalyticsQueryResult | null => {
    if (performance.now() >= expiresAt && !controller.signal.aborted) controller.abort();
    return signal.aborted ? { ok: false, reason: controller.signal.aborted ? "timeout" : "request-obsolete" } : null;
  };
  const params = new URLSearchParams({ start: String(query.start), end: String(query.end), granularity: "DAILY",
    metric_types: JSON.stringify(["VOLUME"]), pricing_categories: JSON.stringify(["SERVICE"]),
    pricing_types: JSON.stringify(["FREE_CUSTOMER_SERVICE"]), phone_numbers: JSON.stringify([query.phoneNumber]),
    dimensions: JSON.stringify(["PHONE", "PRICING_CATEGORY", "PRICING_TYPE", "COUNTRY"]) });
  const url = `https://graph.facebook.com/${adapter.contract.graphVersion}/${encodeURIComponent(query.wabaId)}/pricing_analytics?${params}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort: (() => void) | undefined;
  const deadline = new Promise<AnalyticsQueryResult>((resolve) => {
    const onAbort = () => resolve({ ok: false, reason: controller.signal.aborted ? "timeout" : "request-obsolete" });
    signal.addEventListener("abort", onAbort, { once: true });
    removeAbort = () => signal.removeEventListener("abort", onAbort);
    timer = setTimeout(() => { controller.abort(); }, CLOUD_API_TIMEOUT_MS);
    if (signal.aborted) onAbort();
  });
  const run = async (): Promise<AnalyticsQueryResult> => {
    try {
      if (dependencies.beforeFetch) {
        const current = await dependencies.beforeFetch();
        const stop = stopped();
        if (stop) return stop;
        if (!current) return { ok: false, reason: "request-obsolete" };
      }
      const before = stopped();
      if (before) return before;
      const response = await (dependencies.fetch ?? fetch)(url, { method: "GET", headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store" });
      const afterResponse = stopped();
      if (afterResponse) return afterResponse;
      if (response.status === 401 || response.status === 403) return { ok: false, reason: "permission-denied" };
      if (response.status === 429) return { ok: false, reason: "rate-limited" };
      if (!response.ok) return { ok: false, reason: "transport-failed" };
      const payload: unknown = await response.json();
      const afterJson = stopped();
      if (afterJson) return afterJson;
      const result = decode(payload, query, adapter);
      return stopped() ?? result;
    } catch {
      return stopped() ?? { ok: false, reason: "transport-failed" };
    }
  };
  try { return await Promise.race([run(), deadline]); }
  finally { clearTimeout(timer); removeAbort?.(); }
}
