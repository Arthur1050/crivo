"use client";

import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  ChartTooltip,
  useChartTheme,
} from "@/src/components/dashboard/chart-theme";
import { toDistributionSlices } from "@/src/lib/distribution";
import { formatPercentInt } from "@/src/lib/format";

export interface DistributionChartBucket {
  bucket: string;
  count: number;
}

interface DistributionChartProps {
  data: DistributionChartBucket[];
  /** Rótulo pt-BR para cada `bucket` (ex.: `nao_informado` → "Não informado"). */
  labels: Record<string, string>;
  emptyDescription: string;
  /**
   * Onde a legenda fica em relação ao donut. `"side"` segue a Referência
   * Visual R2 e exige um card largo; `"below"` existe porque o mesmo
   * componente também é usado numa coluna estreita do grid, onde lado a lado
   * espremeria o donut a ~130px. Quem conhece a largura é a página.
   */
  legendPlacement?: "side" | "below";
}

const CHART_HEIGHT = 200;
const DONUT_INNER_RADIUS = "62%";
const DONUT_OUTER_RADIUS = "92%";
const SIDE_LEGEND_WIDTH = 180;

/**
 * Distribuição de P por um campo categórico fixo (lote-4 — DASH-04):
 * modalidade ou motivação. Buckets fixos (incluindo "Não informado") já
 * vêm prontos da DAL/página. Estado vazio quando a soma de todos os
 * buckets é 0 — nunca um gráfico em branco quebrado (DASH-04.2).
 *
 * Donut com legenda vertical ao lado conforme design.md § R2. A forma
 * diferencia a leitura de composição (parte/todo) da leitura de série
 * temporal do `VolumeChart`, em vez de repetir um terceiro gráfico de
 * barras idêntico. Cálculo e contrato de dados são os mesmos de antes.
 */
export function DistributionChart({
  data,
  labels,
  emptyDescription,
  legendPlacement = "side",
}: DistributionChartProps) {
  const theme = useChartTheme();
  const total = data.reduce((sum, bucket) => sum + bucket.count, 0);

  if (data.length === 0 || total === 0) {
    return <EmptyState title="Sem leads no período" description={emptyDescription} />;
  }

  const slices = toDistributionSlices(data, labels);

  const donut = (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="count"
          nameKey="label"
          innerRadius={DONUT_INNER_RADIUS}
          outerRadius={DONUT_OUTER_RADIUS}
          paddingAngle={2}
          stroke="none"
          /*
           * Animação de entrada desligada de propósito: no Recharts 3.10.1
           * o `Pie` animado não emite `path` nenhum — o donut simplesmente
           * não aparece (reproduzido com 1 e com 2 fatias, e o resize não
           * recupera). O `Bar` do VolumeChart anima normalmente. Um gráfico
           * que renderiza vale mais que uma animação de entrada.
           */
          isAnimationActive={false}
        >
          {slices.map((slice) => (
            <Cell key={slice.bucket} fill={theme.hueColor(slice.hue)} />
          ))}
        </Pie>
        <Tooltip cursor={false} content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );

  const legend = (
    <VStack gap={2} width={legendPlacement === "side" ? SIDE_LEGEND_WIDTH : undefined}>
      {slices.map((slice) => (
        <HStack key={slice.bucket} gap={2} hAlign="between" vAlign="center">
          <Token label={slice.label} color={slice.hue} size="sm" />
          <HStack gap={1.5} vAlign="center">
            <Text type="label">{slice.count}</Text>
            <Text type="supporting" color="secondary">
              {formatPercentInt(slice.percent)}
            </Text>
          </HStack>
        </HStack>
      ))}
    </VStack>
  );

  if (legendPlacement === "below") {
    return (
      <VStack gap={4}>
        {donut}
        {legend}
      </VStack>
    );
  }

  return (
    <HStack gap={4} vAlign="center">
      <StackItem size="fill">{donut}</StackItem>
      {legend}
    </HStack>
  );
}
