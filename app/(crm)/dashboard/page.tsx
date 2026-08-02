import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Text";
import { DistributionChart } from "@/src/components/dashboard/distribution-chart";
import { KpiTiles } from "@/src/components/dashboard/kpi-tiles";
import { PeriodFilter } from "@/src/components/dashboard/period-filter";
import { VolumeChart } from "@/src/components/dashboard/volume-chart";
import { resolveDashboardPeriod } from "@/src/lib/dashboard-period";
import {
  getDashboardKpis,
  getLeadDistributions,
  getLeadVolumeSeries,
  getTenant,
} from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

interface DashboardPageProps {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}

const MODALITY_LABELS: Record<string, string> = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
  nao_informado: "Não informado",
};

const MOTIVATION_LABELS: Record<string, string> = {
  investidor: "Investidor",
  morador: "Morador",
  nao_informado: "Não informado",
};

/**
 * Dashboard do tenant ativo (lote-4 — DASH-01..07). `resolveDashboardPeriod`
 * roda uma única vez por render (design.md — "Definição única de P"): o
 * mesmo `{from, to}` alimenta tiles, série de volume e distribuições —
 * nunca dois cálculos de período divergentes na mesma página. Params
 * inválidos caem no default 30 dias silenciosamente (DASH-02 AC4), já
 * garantido por `resolveDashboardPeriod`. Trocar de tenant (cookie) troca
 * todos os números mantendo o período (DASH-06.2) porque o período vem só
 * da URL, nunca de estado ligado ao tenant.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const tenantId = await getActiveTenantId();
  const period = resolveDashboardPeriod(params);

  const [kpis, tenant, volumeSeries, distributions] = await Promise.all([
    getDashboardKpis(tenantId, period),
    getTenant(tenantId),
    getLeadVolumeSeries(tenantId, period, period.granularity),
    getLeadDistributions(tenantId, period),
  ]);

  const volumeChartData = volumeSeries.map((bucket) => ({
    bucketStart: bucket.bucketStart.toISOString(),
    count: bucket.count,
  }));

  return (
    <VStack gap={6}>
      <Heading level={1}>Dashboard</Heading>
      <PeriodFilter period={period} />
      <KpiTiles
        kpis={kpis}
        baseline={{
          baselineLeadsPerMonth: tenant?.baselineLeadsPerMonth ?? null,
          baselineFirstResponseMinutes: tenant?.baselineFirstResponseMinutes ?? null,
          baselineLeadToMeetingPct: tenant?.baselineLeadToMeetingPct ?? null,
        }}
      />

      <Divider />

      <VStack gap={4}>
        <Heading level={3}>Volume de leads no período</Heading>
        <VolumeChart data={volumeChartData} granularity={period.granularity} />
      </VStack>

      <Divider />

      <Grid columns={{ minWidth: 320, repeat: "fit" }} gap={4}>
        <VStack gap={4}>
          <Heading level={3}>Distribuição por modalidade</Heading>
          <DistributionChart
            data={distributions.modality}
            labels={MODALITY_LABELS}
            emptyDescription="Nenhum lead com primeiro contato dentro do período selecionado."
          />
        </VStack>
        <VStack gap={4}>
          <Heading level={3}>Distribuição por motivação</Heading>
          <DistributionChart
            data={distributions.motivation}
            labels={MOTIVATION_LABELS}
            emptyDescription="Nenhum lead com primeiro contato dentro do período selecionado."
          />
        </VStack>
      </Grid>
    </VStack>
  );
}
