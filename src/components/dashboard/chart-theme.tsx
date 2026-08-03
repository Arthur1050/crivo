"use client";

import { useTheme } from "@astryxdesign/core/theme";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { useReducedMotion } from "@/src/components/shared/use-reduced-motion";
import type { DistributionHue } from "@/src/lib/distribution";
import { parseDurationMs } from "@/src/lib/motion";

/** Fallback em ms caso os tokens de duração da Astryx mudem de formato. */
const FALLBACK_DURATION_MS = 410;

export interface ChartTheme {
  grid: string;
  axis: string;
  axisFontSize: string;
  accent: string;
  /**
   * Preenchimento do realce de coluna sob o cursor. O default do Recharts é
   * um cinza opaco que TAMPA a barra; o overlay de hover da Astryx é
   * translúcido e passa por cima sem esconder o dado.
   */
  cursorFill: string;
  animationDuration: number;
  isAnimationActive: boolean;
  /** Resolve o matiz de uma fatia para a cor de ícone correspondente. */
  hueColor: (hue: DistributionHue) => string;
}

/**
 * Configuração visual compartilhada pelos gráficos do dashboard, sempre
 * derivada dos tokens da Astryx via `useTheme` (AD-009) — nenhum hex cru.
 */
export function useChartTheme(): ChartTheme {
  const { token } = useTheme();
  const reducedMotion = useReducedMotion();

  return {
    grid: token("--color-border"),
    axis: token("--color-text-secondary"),
    axisFontSize: token("--font-size-sm"),
    accent: token("--color-accent"),
    cursorFill: token("--color-overlay-hover"),
    animationDuration: parseDurationMs(
      token("--duration-medium"),
      FALLBACK_DURATION_MS
    ),
    // Movimento reduzido zera a animação em vez de trocá-la por outra.
    isAnimationActive: !reducedMotion,
    hueColor: (hue) => token(`--color-icon-${hue}`),
  };
}

interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
}

interface ChartTooltipProps {
  /** Injetadas pelo Recharts ao clonar o elemento passado em `content`. */
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  /** Formata o rótulo do eixo X para leitura humana. */
  formatLabel?: (label: string | number) => string;
}

/**
 * Tooltip dos gráficos construído com componentes da Astryx.
 *
 * O `<Tooltip>` do Recharts sem estilo renderiza uma caixa branca com fonte
 * do sistema — ilegível no tema escuro. Em vez de remendar `contentStyle`
 * com valores crus, o conteúdo inteiro vira um `Card`, então superfície,
 * sombra, raio, tipografia e espaçamento saem todos do tema.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
}: ChartTooltipProps) {
  if (active !== true || payload === undefined || payload.length === 0) {
    return null;
  }

  return (
    <Card padding={2} elevation="high">
      <VStack gap={1}>
        {label === undefined ? null : (
          <Text type="supporting" color="secondary">
            {formatLabel === undefined ? String(label) : formatLabel(label)}
          </Text>
        )}
        {payload.map((entry, index) => (
          <HStack key={`${entry.name ?? index}`} gap={3} hAlign="between" vAlign="center">
            <Text type="supporting" color="secondary">
              {entry.name}
            </Text>
            <Text type="label">{entry.value}</Text>
          </HStack>
        ))}
      </VStack>
    </Card>
  );
}
