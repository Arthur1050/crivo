"use client";

import { useTheme } from "@astryxdesign/core/theme";
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

function bucketLabel(bucketStart: string): string {
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
  const { token } = useTheme();
  const total = data.reduce((sum, point) => sum + point.count, 0);

  if (data.length === 0 || total === 0) {
    return (
      <EmptyState
        title="Sem leads no período"
        description="Nenhum lead com primeiro contato dentro do período selecionado."
      />
    );
  }

  const gridColor = token("--color-border");
  const axisColor = token("--color-text-secondary");
  const barColor = token("--color-accent");
  const axisFontSize = token("--font-size-sm");

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal vertical={false} stroke={gridColor} />
        <XAxis
          dataKey="bucketStart"
          tickFormatter={bucketLabel}
          tick={{ fontSize: axisFontSize, fill: axisColor }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: axisFontSize, fill: axisColor }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip
          labelFormatter={(value) => bucketLabel(String(value))}
          formatter={(value) => [
            value,
            granularity === "day" ? "Leads no dia" : "Leads na semana",
          ]}
        />
        <Bar dataKey="count" name="Leads" fill={barColor} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
