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

export interface DistributionChartBucket {
  bucket: string;
  count: number;
}

interface DistributionChartProps {
  data: DistributionChartBucket[];
  /** Rótulo pt-BR para cada `bucket` (ex.: `nao_informado` → "Não informado"). */
  labels: Record<string, string>;
  emptyDescription: string;
}

/**
 * Distribuição de P por um campo categórico fixo (lote-4 — DASH-04):
 * modalidade ou motivação. Buckets fixos (incluindo "Não informado") já
 * vêm prontos da DAL/página. Estado vazio quando a soma de todos os
 * buckets é 0 — nunca um gráfico em branco quebrado (DASH-04.2).
 */
export function DistributionChart({
  data,
  labels,
  emptyDescription,
}: DistributionChartProps) {
  const { token } = useTheme();
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);

  if (data.length === 0 || total === 0) {
    return <EmptyState title="Sem leads no período" description={emptyDescription} />;
  }

  const gridColor = token("--color-border");
  const axisColor = token("--color-text-secondary");
  const axisFontSize = token("--font-size-sm");
  const barColor = token("--color-accent");

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal vertical={false} stroke={gridColor} />
        <XAxis
          dataKey="bucket"
          tickFormatter={(bucket: string) => labels[bucket] ?? bucket}
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
          labelFormatter={(bucket) => labels[String(bucket)] ?? String(bucket)}
          formatter={(value) => [value, "Leads"]}
        />
        <Bar dataKey="count" name="Leads" fill={barColor} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
