"use client";

import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartTooltip,
  useChartTheme,
} from "@/src/components/dashboard/chart-theme";

export interface VolumeChartPoint {
  /** ISO string (RSC → client — nunca `Date` cru, design.md "Risks"). */
  bucketStart: string;
  count: number;
}

interface VolumeChartProps {
  data: VolumeChartPoint[];
  granularity: "day" | "week";
}

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

function bucketLabel(bucketStart: string | number): string {
  return DAY_LABEL_FORMATTER.format(new Date(bucketStart));
}

/**
 * Série de volume de leads no tempo (lote-4 — DASH-03). Buckets contínuos
 * (incluindo zerados) já vêm prontos da DAL/página; este componente só
 * formata e desenha. Estado vazio quando não há nenhum lead no período
 * inteiro (soma de todos os buckets = 0) — nunca um gráfico em branco
 * quebrado (DASH-03.3).
 */
export function VolumeChart({ data, granularity }: VolumeChartProps) {
  const theme = useChartTheme();
  const total = data.reduce((sum, point) => sum + point.count, 0);

  if (data.length === 0 || total === 0) {
    return (
      <EmptyState
        title="Sem leads no período"
        description="Nenhum lead com primeiro contato dentro do período selecionado."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal vertical={false} stroke={theme.grid} />
        <XAxis
          dataKey="bucketStart"
          tickFormatter={bucketLabel}
          tick={{ fontSize: theme.axisFontSize, fill: theme.axis }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: theme.axisFontSize, fill: theme.axis }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          cursor={{ fill: theme.cursorFill }}
          content={<ChartTooltip formatLabel={bucketLabel} />}
        />
        <Bar
          dataKey="count"
          name={granularity === "day" ? "Leads no dia" : "Leads na semana"}
          fill={theme.accent}
          radius={[4, 4, 0, 0]}
          isAnimationActive={theme.isAnimationActive}
          animationDuration={theme.animationDuration}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
