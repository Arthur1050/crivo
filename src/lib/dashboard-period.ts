export type DashboardPreset = "7d" | "30d" | "90d" | "custom";

export interface DashboardPeriod {
  from: Date;
  to: Date;
  granularity: "day" | "week";
  preset: DashboardPreset;
}

const DEFAULT_PRESET_DAYS = 30;
const MAX_CUSTOM_RANGE_DAYS = 366;
const DAY_MS = 86400000;
const MAX_DAY_GRANULARITY_DAYS = 31;

const PRESET_DAYS: Record<"7d" | "30d" | "90d", number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` → meia-noite UTC daquele dia, ou `null` se malformado/inválido. */
function parseDateOnlyUTC(value: string): Date | null {
  if (!DATE_ONLY_PATTERN.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const parsed = new Date(ms);
  // Rejeita datas que o JS "corrigiria" silenciosamente (ex.: 2026-02-30).
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function endOfDayUTC(dayStart: Date): Date {
  return new Date(dayStart.getTime() + DAY_MS - 1);
}

function startOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function granularityFor(from: Date, to: Date): "day" | "week" {
  const spanDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  return spanDays <= MAX_DAY_GRANULARITY_DAYS ? "day" : "week";
}

function buildDefault(now: Date): DashboardPeriod {
  const to = endOfDayUTC(startOfDayUTC(now));
  const from = startOfDayUTC(
    new Date(to.getTime() - (DEFAULT_PRESET_DAYS - 1) * DAY_MS)
  );
  return { from, to, granularity: granularityFor(from, to), preset: "30d" };
}

function buildPreset(preset: "7d" | "30d" | "90d", now: Date): DashboardPeriod {
  const days = PRESET_DAYS[preset];
  const to = endOfDayUTC(startOfDayUTC(now));
  const from = startOfDayUTC(new Date(to.getTime() - (days - 1) * DAY_MS));
  return { from, to, granularity: granularityFor(from, to), preset };
}

/**
 * Resolve `searchParams` num período validado (lote-4 — DASH-02). Função
 * pura: `now` é injetável para que os testes controlem o relógio (design.md
 * — "Duas fontes de agora"). Precedência: `de`+`ate` válidos > `periodo`
 * preset válido > default 30 dias. Qualquer entrada inválida (formato,
 * `de` > `ate`, range > 366 dias) cai silenciosamente no default — nunca
 * lança erro (spec.md — DASH-02 AC4).
 */
export function resolveDashboardPeriod(
  params: { periodo?: string; de?: string; ate?: string },
  now: Date = new Date()
): DashboardPeriod {
  if (params.de && params.ate) {
    const from = parseDateOnlyUTC(params.de);
    const toDayStart = parseDateOnlyUTC(params.ate);
    if (from && toDayStart) {
      const to = endOfDayUTC(toDayStart);
      const spanDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
      if (spanDays >= 1 && spanDays <= MAX_CUSTOM_RANGE_DAYS) {
        return { from, to, granularity: granularityFor(from, to), preset: "custom" };
      }
    }
  }

  if (params.periodo === "7d" || params.periodo === "30d" || params.periodo === "90d") {
    return buildPreset(params.periodo, now);
  }

  return buildDefault(now);
}
