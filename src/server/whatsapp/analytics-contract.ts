import "server-only";

export type AnalyticsQuery = {
  phoneNumberId: string;
  phoneNumber: string;
  wabaId: string;
  accountTimezone: string;
  monthStart: Date;
  monthEnd: Date;
  queryEnd: Date;
  start: number;
  end: number;
  filters: { metric: "VOLUME"; category: "SERVICE"; pricingType: "FREE_CUSTOMER_SERVICE"; dimension: "PHONE" };
};

const filters: AnalyticsQuery["filters"] = { metric: "VOLUME", category: "SERVICE", pricingType: "FREE_CUSTOMER_SERVICE", dimension: "PHONE" };
const day = 24 * 60 * 60 * 1000;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const instant = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());
const identifier = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 && value === value.trim();

/** Recusa aliases ISO; não converte nem trata UK/GB como países disjuntos. */
export function canonicalAnalyticsCountry(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value) && new Intl.Locale(`und-${value}`).region === value;
}

/** Primeiro instante do mês inteiro: ocorrência anterior no overlap, depois do gap. */
function monthBoundary(format: Intl.DateTimeFormat, year: number, month: number): number {
  const wall = (epoch: number) => {
    const parts = format.formatToParts(new Date(epoch));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)!.value);
    return Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  };
  const utc = Date.UTC(year, month - 1, 1);
  const offsets = new Set<number>();
  // Captura offsets dos dois lados da fronteira, sem inferir duração fixa do mês.
  for (let sample = utc - 2 * day; sample <= utc + 2 * day; sample += day / 4) {
    offsets.add(wall(sample) - sample);
  }
  const candidates = [...offsets].map((offset) => utc - offset);
  const exact = candidates.filter((candidate) => wall(candidate) === utc);
  return exact.length ? Math.min(...exact) : Math.max(...candidates);
}

/** Campos vêm do canal confirmado; nunca usa o fuso do servidor/contato como default. */
export function createAnalyticsQuery(input: {
  phoneNumberId: string; phoneNumber: string; wabaId: string; accountTimezone: string; now: Date;
}): AnalyticsQuery | null {
  if (!identifier(input.phoneNumberId) || !identifier(input.phoneNumber) || !identifier(input.wabaId) || !instant(input.now)
    || typeof input.accountTimezone !== "string" || (input.accountTimezone !== "UTC" && !input.accountTimezone.includes("/"))) return null;
  try {
    const format = new Intl.DateTimeFormat("en", { timeZone: input.accountTimezone, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
    const parts = format.formatToParts(input.now);
    const year = Number(parts.find((part) => part.type === "year")!.value);
    const month = Number(parts.find((part) => part.type === "month")!.value);
    if (year < 1970 || year > 9998) return null;
    const start = monthBoundary(format, year, month) / 1000;
    const monthEnd = new Date(monthBoundary(format, month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1));
    // start/end são segundos inteiros documentados. Não declara cobertura de fração futura.
    const end = Math.floor(input.now.getTime() / 1000);
    if (start < 0 || end < start) return null;
    return { phoneNumberId: input.phoneNumberId, phoneNumber: input.phoneNumber, wabaId: input.wabaId,
      accountTimezone: format.resolvedOptions().timeZone, monthStart: new Date(start * 1000), monthEnd,
      queryEnd: new Date(end * 1000), start, end, filters: { ...filters } };
  } catch {
    return null;
  }
}

export type AnalyticsContractEvidence = {
  id: string;
  graphVersion: string;
  sourceUrl: string;
  verifiedAt: Date;
  responseSha256: string;
  emptyZeroSha256?: string;
};
export type AnalyticsContract = Readonly<AnalyticsContractEvidence>;
const contracts = new WeakSet<object>();
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

/** Prova é configuração interna revisada. Fixture não comprova o contrato da conta real. */
export function createAnalyticsContract(evidence: AnalyticsContractEvidence | null = null): AnalyticsContract | null {
  if (!evidence || !identifier(evidence.id) || !/^v\d+\.\d+$/.test(evidence.graphVersion) || !instant(evidence.verifiedAt)
    || !hash(evidence.responseSha256) || (evidence.emptyZeroSha256 !== undefined && !hash(evidence.emptyZeroSha256))) return null;
  try {
    if (new URL(evidence.sourceUrl).protocol !== "https:") return null;
  } catch { return null; }
  const contract = Object.freeze({ ...evidence, verifiedAt: new Date(evidence.verifiedAt) });
  contracts.add(contract);
  return contract;
}

export type AnalyticsNormalization =
  | { ok: true; volume: bigint; remaining: number; progress: number }
  | { ok: false; reason: "contract-unverified" | "invalid-response" | "identity-mismatch" | "period-mismatch" | "filters-mismatch" | "incomplete-response" | "invalid-volume" | "overlapping-partitions" | "zero-unverified" };

/**
 * Envelope SEMÂNTICO interno: não afirma o shape JSON Meta. T12 só o produz
 * por decoder versionado comprovado. Nada no envelope concede capacidade.
 * Pontos: phoneNumber, metric/category/pricingType, country null ou ISO alpha2 uppercase,
 * start/end em segundos e volume inteiro seguro; complete/hasMore são obrigatórios.
 */
export function normalizeAnalytics(
  raw: unknown, query: AnalyticsQuery, contract: AnalyticsContract | null = null,
): AnalyticsNormalization {
  const fail = (reason: Extract<AnalyticsNormalization, { ok: false }>["reason"]): AnalyticsNormalization => ({ ok: false, reason });
  if (!contract || !contracts.has(contract)) return fail("contract-unverified");
  if (!record(raw) || raw.contractId !== contract.id || !Array.isArray(raw.partitions)) return fail("invalid-response");
  if (raw.phoneNumber !== query.phoneNumber || raw.wabaId !== query.wabaId) return fail("identity-mismatch");
  if (raw.start !== query.start || raw.end !== query.end) return fail("period-mismatch");
  if (!record(raw.filters) || Object.entries(filters).some(([key, value]) => raw.filters && (raw.filters as Record<string, unknown>)[key] !== value)) return fail("filters-mismatch");
  if (raw.complete !== true || raw.hasMore !== false) return fail("incomplete-response");
  const selected: { country: string | null; start: number; end: number; volume: number }[] = [];
  for (const point of raw.partitions) {
    if (!record(point) || !identifier(point.metric) || !identifier(point.category) || !identifier(point.pricingType)
      || (point.country !== null && !canonicalAnalyticsCountry(point.country))) return fail("invalid-response");
    if (point.phoneNumber !== query.phoneNumber) return fail("identity-mismatch");
    if (typeof point.volume !== "number" || !Number.isSafeInteger(point.volume) || point.volume < 0) return fail("invalid-volume");
    if (typeof point.start !== "number" || typeof point.end !== "number" || !Number.isSafeInteger(point.start) || !Number.isSafeInteger(point.end)
      || point.start < query.start || point.end > query.end || point.end <= point.start) return fail("period-mismatch");
    if (point.metric === "VOLUME" && point.category === "SERVICE" && point.pricingType === "FREE_CUSTOMER_SERVICE") {
      selected.push({ country: point.country as string | null, start: point.start, end: point.end, volume: point.volume });
    }
  }
  if (!selected.length) {
    if (raw.partitions.length || !contract.emptyZeroSha256) return fail("zero-unverified");
    return { ok: true, volume: 0n, remaining: 1000, progress: 0 };
  }
  if (selected.some((point) => point.country === null) && selected.some((point) => point.country !== null)) return fail("overlapping-partitions");
  let volume = 0n;
  for (const country of new Set(selected.map((point) => point.country))) {
    let coveredUntil = query.start;
    for (const point of selected.filter((point) => point.country === country).sort((a, b) => a.start - b.start)) {
      if (point.start < coveredUntil) return fail("overlapping-partitions");
      if (point.start > coveredUntil) return fail("incomplete-response");
      coveredUntil = point.end;
      volume += BigInt(point.volume);
    }
    if (coveredUntil !== query.end) return fail("incomplete-response");
  }
  if (volume > BigInt(Number.MAX_SAFE_INTEGER)) return fail("invalid-volume");
  return { ok: true, volume, remaining: Number(volume < 1000n ? 1000n - volume : 0n), progress: Number(volume < 1000n ? volume : 1000n) / 1000 };
}
