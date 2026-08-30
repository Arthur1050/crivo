import { notFound } from "next/navigation";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { KpiTiles } from "@/src/components/dashboard/kpi-tiles";
import { resolveDashboardPeriod } from "@/src/lib/dashboard-period";
import { periodDays } from "@/src/lib/pilot-metrics";
import { getDashboardKpis, getTenant } from "@/src/server/data";
import {
  PermissionDeniedError,
  requirePermission,
} from "@/src/server/auth/session";

interface RelatorioPageProps {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}

/**
 * Relatório imprimível do piloto (lote-9 — REL-01): os cinco KPIs do
 * período ao lado dos cinco baselines, para levar à reunião com a
 * imobiliária sem projetar o CRM ao vivo (spec.md — User Story).
 *
 * Mesma fonte e mesmo período do Dashboard (AC2, "sem recálculo
 * divergente"): `resolveDashboardPeriod` e `getDashboardKpis` são
 * EXATAMENTE as funções que o Dashboard usa, e os números são exibidos pelo
 * mesmíssimo `KpiTiles` — não existe uma segunda apuração paralela aqui.
 * `canEditSettings={false}` fixo: o relatório impresso não tem link
 * navegável nenhum (AC3, "omite... controles interativos").
 *
 * Sem `AppShell` (o grupo `(relatorio)` nasce sem shell — ver layout.tsx) e
 * sem `configuracoes:ler` a rota recusa com 404 (AC4), mesmo tratamento de
 * "recurso inexistente" que `app/(crm)/configuracoes/page.tsx` já usa.
 */
export default async function RelatorioPage({ searchParams }: RelatorioPageProps) {
  let context;
  try {
    context = await requirePermission("configuracoes", "ler");
  } catch (error) {
    if (error instanceof PermissionDeniedError) notFound();
    throw error;
  }

  const params = await searchParams;
  const period = resolveDashboardPeriod(params);

  const [kpis, tenant] = await Promise.all([
    getDashboardKpis(context.leadScope, period),
    getTenant(context.tenantId),
  ]);

  if (!tenant) {
    return (
      <EmptyState
        title="Imobiliária não encontrada"
        description="Não foi possível carregar os dados desta imobiliária para o relatório."
      />
    );
  }

  const location = [tenant.city, tenant.state].filter(Boolean).join(" — ");

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Relatório do piloto</Heading>
        <Text type="body" color="secondary">
          {tenant.name}
          {location ? ` · ${location}` : ""}
        </Text>
        <HStack gap={1} vAlign="center">
          <Text type="supporting" color="secondary">
            Período:
          </Text>
          <Timestamp value={period.from.toISOString()} format="date" />
          <Text type="supporting" color="secondary">
            até
          </Text>
          <Timestamp value={period.to.toISOString()} format="date" />
        </HStack>
      </VStack>

      <KpiTiles
        kpis={kpis}
        baseline={{
          baselineLeadsPerMonth: tenant.baselineLeadsPerMonth,
          baselineFirstResponseMinutes: tenant.baselineFirstResponseMinutes,
          baselineLeadToMeetingPct: tenant.baselineLeadToMeetingPct,
          baselineEscalationPct: tenant.baselineEscalationPct,
          baselineAttendancePct: tenant.baselineAttendancePct,
        }}
        periodDays={periodDays(period.from, period.to)}
        canEditSettings={false}
      />
    </VStack>
  );
}
