"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { DateRangeInput } from "@astryxdesign/core/DateRangeInput";
import type { DateRange } from "@astryxdesign/core/DateRangeInput";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { HStack } from "@astryxdesign/core/Stack";
import type { DashboardPeriod, DashboardPreset } from "@/src/lib/dashboard-period";

interface PeriodFilterProps {
  period: DashboardPeriod;
}

const PRESETS: { value: Exclude<DashboardPreset, "custom">; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

function toISODate(date: Date): ISODateString {
  return date.toISOString().slice(0, 10) as ISODateString;
}

/**
 * Filtro de período (lote-4 — DASH-02): presets 7/30/90 dias (destacando o
 * ativo) + range customizado, escrevendo `?periodo=` ou `?de=&ate=` na URL —
 * a página (RSC) relê `searchParams` e resolve o mesmo `DashboardPeriod`
 * para tiles e gráficos (design.md — "Definição única de P"). Nenhum estado
 * client além do que já está na URL; navegação limpa sempre o outro modo
 * (preset limpa `de`/`ate` e vice-versa — precedência de DASH-02 AC5).
 */
export function PeriodFilter({ period }: PeriodFilterProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handlePresetChange(value: string) {
    router.push(`${pathname}?periodo=${value}`);
  }

  function handleRangeChange(range: DateRange | null) {
    if (!range) {
      router.push(pathname);
      return;
    }
    router.push(`${pathname}?de=${range.start}&ate=${range.end}`);
  }

  const rangeValue: DateRange | null =
    period.preset === "custom"
      ? { start: toISODate(period.from), end: toISODate(period.to) }
      : null;

  return (
    <HStack gap={4} wrap="wrap" vAlign="end">
      <SegmentedControl
        value={period.preset === "custom" ? "" : period.preset}
        onChange={handlePresetChange}
        label="Período"
      >
        {PRESETS.map((preset) => (
          <SegmentedControlItem key={preset.value} value={preset.value} label={preset.label} />
        ))}
      </SegmentedControl>
      <DateRangeInput
        label="Range customizado"
        isLabelHidden
        placeholder="Range customizado"
        value={rangeValue}
        onChange={handleRangeChange}
        size="md"
      />
    </HStack>
  );
}
