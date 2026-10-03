import "server-only";
import { canonicalAnalyticsCountry, createAnalyticsContract, normalizeAnalytics, type AnalyticsContract, type AnalyticsContractEvidence, type AnalyticsNormalization, type AnalyticsQuery } from "./analytics-contract";
import { CLOUD_API_TIMEOUT_MS, GRAPH_API_VERSION } from "./cloud-api";
import type { AuthResult } from "../integration/auth";
import { createAnalyticsQuery } from "./analytics-contract";

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
      if (!record(point) || !canonicalAnalyticsCountry(point.country)
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

export type UsageSyncResult = { ok: true }
  | { ok: false; reason: "usage-disabled" | "configuration-changed" | "cadence" | "lease-active" | "superseded" | "persistence-failed" }
  | Extract<AnalyticsQueryResult, { ok: false }>;
type UsageChannel = typeof import("../../db/schema").whatsappChannels.$inferSelect;
type UsageTransaction = Parameters<Parameters<typeof import("../../db").db.transaction>[0]>[0];
type UsageClaim = { channelId: string; token: string; revision: number; sequence: number; claimedAt: Date; query: AnalyticsQuery };

function channelQuery(row: UsageChannel | undefined, now: Date): AnalyticsQuery | null {
  if (!row?.usageEnabled || row.accountKind !== "production" || !row.ownershipVerifiedAt || !row.analyticsVerifiedAt
    || !row.wabaId || !row.analyticsPhoneNumber || !row.accountTimezone) return null;
  return createAnalyticsQuery({ phoneNumberId: row.phoneNumberId, phoneNumber: row.analyticsPhoneNumber, wabaId: row.wabaId,
    accountTimezone: row.accountTimezone, now });
}

/** Dependências/relógio são internos do servidor; contexto vem da autenticação existente. */
export async function syncUsage(
  context: AuthResult,
  input: { phoneNumberId: string; expectedRevision?: number },
  dependencies: { now?: () => Date; database?: Pick<typeof import("../../db").db, "transaction">; adapter?: AnalyticsAdapter | null; fetch?: typeof fetch } = {},
): Promise<UsageSyncResult> {
  const now = dependencies.now ?? (() => new Date());
  const controller = new AbortController();
  const expiresAt = performance.now() + 80_000; // Handler abaixo da lease de 90s; clock não vem do caller externo.
  const assertBudget = () => {
    if (performance.now() >= expiresAt) controller.abort();
    if (controller.signal.aborted) throw new Error("Usage sync deadline");
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<UsageSyncResult>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve({ ok: false, reason: "timeout" }); }, 80_000);
  });
  const work = async (): Promise<UsageSyncResult> => {
  try {
    const { and, eq, sql } = await import("drizzle-orm");
    const { whatsappChannels, whatsappUsage } = await import("../../db/schema");
    const { randomUUID } = await import("node:crypto");
    const database = dependencies.database ?? (await import("../../db")).db;
    const budget = async (tx: UsageTransaction) => {
      assertBudget();
      const milliseconds = String(Math.max(1, Math.floor(expiresAt - performance.now())));
      // Só esta transação: não altera Pool nem orçamento das suítes/serviços existentes.
      await tx.execute(sql`SELECT set_config('statement_timeout', ${milliseconds}, true), set_config('lock_timeout', ${milliseconds}, true)`);
      assertBudget();
    };
    const started = await database.transaction(async (tx): Promise<{ ok: true; claim: UsageClaim } | Extract<UsageSyncResult, { ok: false }>> => {
      await budget(tx);
      const [row] = await tx.select().from(whatsappChannels).where(and(eq(whatsappChannels.tenantId, context.tenantId), eq(whatsappChannels.phoneNumberId, input.phoneNumberId))).for("update");
      assertBudget();
      if (input.expectedRevision !== undefined && row?.configurationRevision !== input.expectedRevision) return { ok: false, reason: "configuration-changed" };
      const claimedAt = now();
      const query = channelQuery(row, claimedAt);
      if (!row || !query) return { ok: false, reason: "usage-disabled" };
      if (row.usageSyncDeadline && row.usageSyncDeadline.getTime() > claimedAt.getTime()) return { ok: false, reason: "lease-active" };
      // Cadência por canal, mesmo que o mês/configuração tenham mudado ou a tentativa falhado.
      if (row.lastUsageAttemptAt && claimedAt.getTime() - row.lastUsageAttemptAt.getTime() < 15 * 60 * 1000) return { ok: false, reason: "cadence" };
      const token = randomUUID();
      await tx.update(whatsappChannels).set({ lastUsageAttemptAt: claimedAt, usageSyncToken: token,
        usageSyncDeadline: new Date(claimedAt.getTime() + 90_000), updatedAt: claimedAt }).where(eq(whatsappChannels.id, row.id));
      assertBudget();
      const [period] = await tx.insert(whatsappUsage).values({ tenantId: context.tenantId, phoneNumberId: query.phoneNumberId,
        monthStart: query.monthStart, monthEnd: query.monthEnd, accountTimezone: query.accountTimezone, configurationRevision: row.configurationRevision,
        lastAttemptAt: claimedAt, querySequence: 1, responseToken: token, updatedAt: claimedAt }).onConflictDoUpdate({
        target: [whatsappUsage.tenantId, whatsappUsage.phoneNumberId, whatsappUsage.monthStart, whatsappUsage.configurationRevision],
        set: { lastAttemptAt: claimedAt, querySequence: sql`${whatsappUsage.querySequence} + 1`, responseToken: token, updatedAt: claimedAt },
      }).returning({ sequence: whatsappUsage.querySequence });
      assertBudget();
      return { ok: true, claim: { channelId: row.id, token, revision: row.configurationRevision, sequence: period.sequence, claimedAt, query } };
    });
    if (!started.ok) return started;
    const claim = started.claim;
    const periodWhere = and(eq(whatsappUsage.tenantId, context.tenantId), eq(whatsappUsage.phoneNumberId, claim.query.phoneNumberId),
      eq(whatsappUsage.monthStart, claim.query.monthStart), eq(whatsappUsage.configurationRevision, claim.revision));
    // Ordem de locks é sempre canal -> snapshot; transações não ficam abertas durante Graph.
    const live = async (tx: UsageTransaction): Promise<{ current: boolean; checkedAt: Date }> => {
      await budget(tx);
      const [row] = await tx.select().from(whatsappChannels).where(and(eq(whatsappChannels.tenantId, context.tenantId), eq(whatsappChannels.id, claim.channelId))).for("update");
      const [period] = await tx.select().from(whatsappUsage).where(periodWhere).for("update");
      assertBudget();
      // Relógio depois dos locks/round-trips, não no começo de uma espera potencialmente longa.
      const checkedAt = now();
      const query = channelQuery(row, checkedAt);
      if (!row || !query || row.usageSyncToken !== claim.token || !row.usageSyncDeadline
        || checkedAt.getTime() < claim.claimedAt.getTime() || row.usageSyncDeadline.getTime() <= checkedAt.getTime()
        || row.configurationRevision !== claim.revision || query.phoneNumberId !== claim.query.phoneNumberId
        || query.phoneNumber !== claim.query.phoneNumber || query.wabaId !== claim.query.wabaId
        || query.accountTimezone !== claim.query.accountTimezone || query.monthStart.getTime() !== claim.query.monthStart.getTime()) return { current: false, checkedAt };
      return { current: period?.querySequence === claim.sequence && period.responseToken === claim.token
        && period.accountTimezone === claim.query.accountTimezone && period.monthEnd.getTime() === claim.query.monthEnd.getTime(), checkedAt };
    };
    const result = await queryAnalytics(claim.query, dependencies.adapter ?? null, {
      fetch: dependencies.fetch,
      signal: controller.signal,
      beforeFetch: () => database.transaction(async (tx) => (await live(tx)).current),
    });
    return await database.transaction(async (tx): Promise<UsageSyncResult> => {
      const { current, checkedAt } = await live(tx);
      assertBudget();
      if (current) {
        await tx.update(whatsappUsage).set(result.ok
          ? { freeServiceVolume: Number(result.volume), queryEnd: claim.query.queryEnd, lastSuccessAt: checkedAt, failureCode: null, updatedAt: checkedAt }
          : { failureCode: result.reason, updatedAt: checkedAt }).where(periodWhere);
      }
      assertBudget();
      // CAS de token também na liberação: resposta antiga não libera o claim novo.
      await tx.update(whatsappChannels).set({ usageSyncToken: null, usageSyncDeadline: null, updatedAt: checkedAt }).where(and(
        eq(whatsappChannels.tenantId, context.tenantId), eq(whatsappChannels.id, claim.channelId), eq(whatsappChannels.usageSyncToken, claim.token),
      ));
      assertBudget();
      return current ? (result.ok ? { ok: true } : result) : { ok: false, reason: "superseded" };
    });
  } catch {
    if (performance.now() >= expiresAt) controller.abort();
    return { ok: false, reason: controller.signal.aborted ? "timeout" : "persistence-failed" };
  }
  };
  try { return await Promise.race([work(), deadline]); }
  finally { clearTimeout(timer); }
}
