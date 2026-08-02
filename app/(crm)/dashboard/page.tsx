import { VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Text";
import { KpiTiles } from "@/src/components/dashboard/kpi-tiles";
import { resolveDashboardPeriod } from "@/src/lib/dashboard-period";
import { getDashboardKpis, getTenant } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

interface DashboardPageProps {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}

/**
 * Dashboard do tenant ativo (lote-4 — DASH-01, DASH-05, DASH-06, DASH-07).
 * `resolveDashboardPeriod` roda uma única vez por render (design.md —
 * "Definição única de P"): o mesmo `{from, to}` alimenta os tiles aqui e,
 * a partir de T9, também os gráficos — nunca dois cálculos de período
 * divergentes na mesma página. Params inválidos caem no default 30 dias
 * silenciosamente (DASH-02 AC4), já garantido por `resolveDashboardPeriod`.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const tenantId = await getActiveTenantId();
  const period = resolveDashboardPeriod(params);

  const [kpis, tenant] = await Promise.all([
    getDashboardKpis(tenantId, period),
    getTenant(tenantId),
  ]);

  return (
    <VStack gap={6}>
      <Heading level={1}>Dashboard</Heading>
      <KpiTiles
        kpis={kpis}
        baseline={{
          baselineLeadsPerMonth: tenant?.baselineLeadsPerMonth ?? null,
          baselineFirstResponseMinutes: tenant?.baselineFirstResponseMinutes ?? null,
          baselineLeadToMeetingPct: tenant?.baselineLeadToMeetingPct ?? null,
        }}
      />
    </VStack>
  );
}
