import type { ReactNode } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Grid, GridSpan } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { DistributionChart } from "@/src/components/dashboard/distribution-chart";
import { KpiTiles } from "@/src/components/dashboard/kpi-tiles";
import { PeriodFilter } from "@/src/components/dashboard/period-filter";
import { RecentLeadsTable } from "@/src/components/dashboard/recent-leads-table";
import { VolumeChart } from "@/src/components/dashboard/volume-chart";
import { resolveDashboardPeriod } from "@/src/lib/dashboard-period";
import { formatCurrencyBRL } from "@/src/lib/format";
import {
  getDashboardKpis,
  getLeadDistributions,
  getLeadVolumeSeries,
  getRecentLeads,
  getTenant,
} from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

/** Últimos N leads listados no card "Leads Recentes" (RD-04 AC4). */
const RECENT_LEADS_LIMIT = 5;

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

  const [kpis, tenant, volumeSeries, distributions, recentLeads] =
    await Promise.all([
      getDashboardKpis(tenantId, period),
      getTenant(tenantId),
      getLeadVolumeSeries(tenantId, period, period.granularity),
      getLeadDistributions(tenantId, period),
      // Independente de `period` de propósito (spec.md — assumption "Leads
      // Recentes"): o filtro de período governa KPIs e gráficos, nunca esta
      // lista dos últimos leads gerados pelo agente.
      getRecentLeads(tenantId, RECENT_LEADS_LIMIT),
    ]);

  const volumeChartData = volumeSeries.map((bucket) => ({
    bucketStart: bucket.bucketStart.toISOString(),
    count: bucket.count,
  }));

  // Serializa a fronteira RSC→client (AD-007): `budgetCents` é bigint e
  // `firstContactAt` é Date — nenhum dos dois atravessa cru.
  const recentLeadRows = recentLeads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    budget: formatCurrencyBRL(lead.budgetCents),
    modality: lead.modality,
    status: lead.status,
    brokerName: lead.brokerName,
    firstContactAt: lead.firstContactAt.toISOString(),
  }));

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Dashboard</Heading>
        <Text type="body" color="secondary">
          Visão geral do desempenho do agente SDR e do pipeline de leads
        </Text>
      </VStack>
      <PeriodFilter period={period} />
      <KpiTiles
        kpis={kpis}
        baseline={{
          baselineLeadsPerMonth: tenant?.baselineLeadsPerMonth ?? null,
          baselineFirstResponseMinutes: tenant?.baselineFirstResponseMinutes ?? null,
          baselineLeadToMeetingPct: tenant?.baselineLeadToMeetingPct ?? null,
        }}
      />

      <Grid columns={3} gap={4} align="start">
        <GridSpan columns={2}>
          <ChartCard
            title="Volume de leads no período"
            description="Leads com primeiro contato dentro do período selecionado."
          >
            <VolumeChart
              data={volumeChartData}
              granularity={period.granularity}
            />
          </ChartCard>
        </GridSpan>

        <ChartCard
          title="Distribuição por modalidade"
          description="Como os leads do período se dividem entre imóveis novos e usados."
        >
          <DistributionChart
            data={distributions.modality}
            labels={MODALITY_LABELS}
            emptyDescription="Nenhum lead com primeiro contato dentro do período selecionado."
          />
        </ChartCard>

        <GridSpan columns="full">
          <ChartCard
            title="Distribuição por motivação"
            description="Perfil de compra dos leads do período: investidor ou morador."
          >
            <DistributionChart
              data={distributions.motivation}
              labels={MOTIVATION_LABELS}
              emptyDescription="Nenhum lead com primeiro contato dentro do período selecionado."
            />
          </ChartCard>
        </GridSpan>
      </Grid>

      <Card>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={3}>Leads Recentes</Heading>
            <Text type="supporting" color="secondary">
              Últimos {RECENT_LEADS_LIMIT} leads gerados pelo agente,
              independentemente do período selecionado.
            </Text>
          </VStack>
          <RecentLeadsTable rows={recentLeadRows} />
        </VStack>
      </Card>
    </VStack>
  );
}

/**
 * Card de gráfico do dashboard (design.md § R2): heading + descrição acima do
 * gráfico, que continua sendo Recharts tematizado via `useTheme` (AD-009) —
 * nem a lib nem o cálculo mudam, só o invólucro.
 */
function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={3}>{title}</Heading>
          <Text type="supporting" color="secondary">
            {description}
          </Text>
        </VStack>
        {children}
      </VStack>
    </Card>
  );
}
