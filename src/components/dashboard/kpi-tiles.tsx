import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { formatDurationMinutes, formatPercentInt } from "@/src/lib/format";
import type { DashboardKpis } from "@/src/server/data";

export interface KpiTilesBaseline {
  baselineLeadsPerMonth: number | null;
  baselineFirstResponseMinutes: number | null;
  baselineLeadToMeetingPct: number | null;
}

interface KpiTilesProps {
  kpis: DashboardKpis;
  baseline: KpiTilesBaseline;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

const NO_BASELINE = "Baseline não disponível";

/**
 * Linha de 5 tiles de KPI do período (lote-4 — DASH-01, DASH-05, DASH-07).
 * Server Component só de apresentação: recebe os números já calculados pela
 * DAL (fração 0–1 para taxas, `null` em denominador zero) e formata para
 * exibição — nunca recalcula nada. Baseline só existe para 1ª resposta,
 * volume e qualificação (o schema não guarda baseline de escalonamento nem
 * comparecimento — spec.md assumption "Comparação de taxa com baseline").
 */
export function KpiTiles({ kpis, baseline }: KpiTilesProps) {
  const responseBaselineLine =
    baseline.baselineFirstResponseMinutes === null
      ? NO_BASELINE
      : kpis.avgFirstResponseMinutes === null
        ? `Baseline: ${formatDurationMinutes(baseline.baselineFirstResponseMinutes)}`
        : deltaMinutesLine(
            kpis.avgFirstResponseMinutes,
            baseline.baselineFirstResponseMinutes
          );

  const volumeBaselineLine =
    baseline.baselineLeadsPerMonth === null
      ? NO_BASELINE
      : `Baseline: ${baseline.baselineLeadsPerMonth}/mês`;

  const qualificationBaselineLine =
    baseline.baselineLeadToMeetingPct === null
      ? NO_BASELINE
      : kpis.qualificationRate === null
        ? `Baseline: ${baseline.baselineLeadToMeetingPct}%`
        : deltaPercentLine(kpis.qualificationRate, baseline.baselineLeadToMeetingPct);

  return (
    <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={4}>
      <KpiTile
        label="Tempo médio até 1ª resposta"
        value={
          kpis.avgFirstResponseMinutes === null
            ? "—"
            : formatDurationMinutes(kpis.avgFirstResponseMinutes)
        }
        base={`de ${kpis.respondedCount} ${pluralize(kpis.respondedCount, "lead respondido", "leads respondidos")}`}
        baselineLine={responseBaselineLine}
      />
      <KpiTile
        label="Volume de leads"
        value={String(kpis.leadCount)}
        base="no período selecionado"
        baselineLine={volumeBaselineLine}
      />
      <KpiTile
        label="Taxa de qualificação"
        value={
          kpis.qualificationRate === null ? "—" : formatPercentInt(kpis.qualificationRate)
        }
        base={`de ${kpis.leadCount} ${pluralize(kpis.leadCount, "lead", "leads")}`}
        baselineLine={qualificationBaselineLine}
      />
      <KpiTile
        label="Taxa de escalonamento"
        value={
          kpis.escalationRate === null ? "—" : formatPercentInt(kpis.escalationRate)
        }
        base={`de ${kpis.leadCount} ${pluralize(kpis.leadCount, "lead", "leads")}`}
      />
      <KpiTile
        label="Taxa de comparecimento"
        value={
          kpis.attendanceRate === null ? "—" : formatPercentInt(kpis.attendanceRate)
        }
        base={`de ${kpis.confirmedMeetingCount} ${pluralize(kpis.confirmedMeetingCount, "reunião confirmada", "reuniões confirmadas")}`}
      />
    </Grid>
  );
}

function deltaMinutesLine(currentMinutes: number, baselineMinutes: number): string {
  const deltaMinutes = Math.round(currentMinutes) - Math.round(baselineMinutes);
  const baselineLabel = formatDurationMinutes(baselineMinutes);
  if (deltaMinutes === 0) {
    return `No baseline (${baselineLabel})`;
  }
  const direction = deltaMinutes < 0 ? "mais rápido" : "mais lento";
  return `${formatDurationMinutes(Math.abs(deltaMinutes))} ${direction} que o baseline (${baselineLabel})`;
}

function deltaPercentLine(currentFraction: number, baselinePct: number): string {
  const currentPct = Math.round(currentFraction * 100);
  const deltaPct = currentPct - baselinePct;
  if (deltaPct === 0) {
    return `No baseline (${baselinePct}%)`;
  }
  const direction = deltaPct > 0 ? "acima" : "abaixo";
  return `${Math.abs(deltaPct)}pp ${direction} do baseline (${baselinePct}%)`;
}

interface KpiTileProps {
  label: string;
  value: string;
  base: string;
  baselineLine?: string;
}

function KpiTile({ label, value, base, baselineLine }: KpiTileProps) {
  return (
    <Card>
      <VStack gap={2}>
        <Text type="label" color="secondary">
          {label}
        </Text>
        <Heading level={2}>{value}</Heading>
        <Text type="supporting" color="secondary">
          {base}
        </Text>
        {baselineLine ? (
          <Text type="supporting" color="secondary">
            {baselineLine}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}
