import type { ComponentType, ReactNode } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  ClockIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { NavLink } from "@/src/components/shared/nav-link";
import {
  formatDurationMinutes,
  formatPercentInt,
  formatQualificationDelta,
  formatResponseTimeDelta,
} from "@/src/lib/format";
import { normalizeMonthlyBaseline } from "@/src/lib/pilot-metrics";
import type { DashboardKpis } from "@/src/server/data";

export interface KpiTilesBaseline {
  baselineLeadsPerMonth: number | null;
  baselineFirstResponseMinutes: number | null;
  baselineLeadToMeetingPct: number | null;
  // lote-9 — BASE-02: os dois baselines que faltavam para os 5 tiles.
  // Opcionais só nesta task (T27): o Dashboard (T28) ainda não os passa —
  // omitidos equivalem a "sem baseline", o mesmo tratamento de `null`.
  baselineEscalationPct?: number | null;
  baselineAttendancePct?: number | null;
}

interface KpiTilesProps {
  kpis: DashboardKpis;
  baseline: KpiTilesBaseline;
  /** Duração do período selecionado, em dias (mesmo `period` que alimenta
   * gráficos e filtro — regra de definição única de P do lote-4). Único
   * baseline que precisa de normalização é o de volume, que é mensal.
   * Opcional só nesta task (T27) — o Dashboard (T28) é quem passa o valor
   * real; sem ele, a normalização assume um período de 30 dias (mensal). */
  periodDays?: number;
  /** Permissão de escrita em Configurações do usuário autenticado (BASE-02
   * AC4/AC5) — decide se a ausência de baseline mostra convite com link ou
   * só a indicação de indisponível. Opcional só nesta task (T27); sem
   * valor, assume o caso mais restrito (sem convite, sem link). */
  canEditSettings?: boolean;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

const NO_BASELINE = "Baseline não disponível";

/**
 * Formata um valor normalizado de volume (lote-9 — BASE-02 AC2, "por
 * extenso"): inteiro sem casas quando cai redondo, senão 1 casa decimal —
 * períodos com menos de um dia preservam fração em vez de arredondar para
 * zero (spec.md — Edge Cases).
 */
function formatNormalizedVolume(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} ${pluralize(rounded, "lead", "leads")}`;
}

/**
 * Compara o volume apurado do período com o baseline mensal já normalizado
 * para a mesma duração (BASE-02 AC1): delta em leads e direção. Único dos
 * cinco tiles com essa etapa extra — os outros quatro comparam unidades que
 * já independem da duração do período (minutos, percentuais).
 */
function formatVolumeComparison(currentCount: number, normalizedBaseline: number): string {
  const baselineLabel = formatNormalizedVolume(normalizedBaseline);
  const delta = currentCount - normalizedBaseline;
  if (Math.abs(delta) < 0.05) {
    return `No baseline (${baselineLabel})`;
  }
  const direction = delta > 0 ? "acima" : "abaixo";
  return `${formatNormalizedVolume(Math.abs(delta))} ${direction} do baseline (${baselineLabel})`;
}

/**
 * Rodapé de baseline de um tile (BASE-02 AC3/AC4/AC5/AC6): com baseline
 * registrado, mostra o texto de comparação já calculado pelo chamador; sem
 * baseline, mostra convite com link para Configurações só para quem tem
 * `configuracoes:escrever` — sem essa permissão, só a indicação de
 * indisponível, sem convite nem link (AC5).
 */
function BaselineSection({
  hasBaseline,
  canEditSettings,
  comparisonText,
}: {
  hasBaseline: boolean;
  canEditSettings: boolean;
  comparisonText: string;
}): ReactNode {
  if (hasBaseline) {
    return (
      <Text type="supporting" color="secondary">
        {comparisonText}
      </Text>
    );
  }

  if (canEditSettings) {
    return (
      <Text type="supporting" color="secondary">
        Baseline não registrado.{" "}
        <NavLink href="/configuracoes">Registrar em Configurações</NavLink>
      </Text>
    );
  }

  return (
    <Text type="supporting" color="secondary">
      {NO_BASELINE}
    </Text>
  );
}

/**
 * Linha de 5 tiles de KPI do período (lote-4 — DASH-01, DASH-05, DASH-07;
 * lote-9 — BASE-02). Server Component só de apresentação: recebe os números
 * já calculados pela DAL (fração 0–1 para taxas, `null` em denominador zero)
 * e formata para exibição — nunca recalcula nada. Os cinco KPIs agora têm
 * baseline: volume e 1ª resposta comparam contra um alvo em unidade própria
 * (mensal normalizado / minutos), qualificação, escalonamento e
 * comparecimento comparam contra um alvo em percentual.
 */
export function KpiTiles({
  kpis,
  baseline,
  periodDays = 30,
  canEditSettings = false,
}: KpiTilesProps) {
  const responseHasBaseline = baseline.baselineFirstResponseMinutes !== null;
  const responseComparisonText = responseHasBaseline
    ? kpis.avgFirstResponseMinutes === null
      ? `Baseline: ${formatDurationMinutes(baseline.baselineFirstResponseMinutes!)}`
      : formatResponseTimeDelta(
          kpis.avgFirstResponseMinutes,
          baseline.baselineFirstResponseMinutes!
        )
    : "";

  const volumeHasBaseline = baseline.baselineLeadsPerMonth !== null;
  const normalizedVolumeBaseline = volumeHasBaseline
    ? normalizeMonthlyBaseline(baseline.baselineLeadsPerMonth!, periodDays)
    : null;
  const volumeComparisonText =
    normalizedVolumeBaseline === null
      ? ""
      : formatVolumeComparison(kpis.leadCount, normalizedVolumeBaseline);

  const qualificationHasBaseline = baseline.baselineLeadToMeetingPct !== null;
  const qualificationComparisonText = qualificationHasBaseline
    ? kpis.qualificationRate === null
      ? `Baseline: ${baseline.baselineLeadToMeetingPct}%`
      : formatQualificationDelta(kpis.qualificationRate, baseline.baselineLeadToMeetingPct!)
    : "";

  const escalationHasBaseline =
    baseline.baselineEscalationPct !== null && baseline.baselineEscalationPct !== undefined;
  const escalationComparisonText = escalationHasBaseline
    ? kpis.escalationRate === null
      ? `Baseline: ${baseline.baselineEscalationPct}%`
      : formatQualificationDelta(kpis.escalationRate, baseline.baselineEscalationPct!)
    : "";

  const attendanceHasBaseline =
    baseline.baselineAttendancePct !== null && baseline.baselineAttendancePct !== undefined;
  const attendanceComparisonText = attendanceHasBaseline
    ? kpis.attendanceRate === null
      ? `Baseline: ${baseline.baselineAttendancePct}%`
      : formatQualificationDelta(kpis.attendanceRate, baseline.baselineAttendancePct!)
    : "";

  return (
    // `max: 5` mantém os cinco KPIs numa linha só em largura de desktop. Com
    // o `minWidth: 220` anterior cabiam 4 por linha e o quinto ficava órfão
    // numa segunda linha, o que lia como layout quebrado em vez de escolha.
    <Grid columns={{ minWidth: 190, max: 5, repeat: "fit" }} gap={4}>
      <KpiTile
        label="Tempo médio até 1ª resposta"
        icon={ClockIcon}
        hue="teal"
        value={
          kpis.avgFirstResponseMinutes === null
            ? "—"
            : formatDurationMinutes(kpis.avgFirstResponseMinutes)
        }
        base={`de ${kpis.respondedCount} ${pluralize(kpis.respondedCount, "lead respondido", "leads respondidos")}`}
        baselineSection={
          <BaselineSection
            hasBaseline={responseHasBaseline}
            canEditSettings={canEditSettings}
            comparisonText={responseComparisonText}
          />
        }
      />
      <KpiTile
        label="Volume de leads"
        icon={TrendingUpIcon}
        hue="blue"
        value={String(kpis.leadCount)}
        base="no período selecionado"
        baselineSection={
          <BaselineSection
            hasBaseline={volumeHasBaseline}
            canEditSettings={canEditSettings}
            comparisonText={volumeComparisonText}
          />
        }
      />
      <KpiTile
        label="Taxa de qualificação"
        icon={CheckIcon}
        hue="green"
        value={
          kpis.qualificationRate === null ? "—" : formatPercentInt(kpis.qualificationRate)
        }
        base={`de ${kpis.leadCount} ${pluralize(kpis.leadCount, "lead", "leads")}`}
        baselineSection={
          <BaselineSection
            hasBaseline={qualificationHasBaseline}
            canEditSettings={canEditSettings}
            comparisonText={qualificationComparisonText}
          />
        }
      />
      <KpiTile
        label="Taxa de escalonamento"
        icon={UsersIcon}
        hue="orange"
        value={
          kpis.escalationRate === null ? "—" : formatPercentInt(kpis.escalationRate)
        }
        base={`de ${kpis.leadCount} ${pluralize(kpis.leadCount, "lead", "leads")}`}
        baselineSection={
          <BaselineSection
            hasBaseline={escalationHasBaseline}
            canEditSettings={canEditSettings}
            comparisonText={escalationComparisonText}
          />
        }
      />
      <KpiTile
        label="Taxa de comparecimento"
        icon={CalendarDaysIcon}
        hue="purple"
        value={
          kpis.attendanceRate === null ? "—" : formatPercentInt(kpis.attendanceRate)
        }
        base={`de ${kpis.confirmedMeetingCount} ${pluralize(kpis.confirmedMeetingCount, "reunião confirmada", "reuniões confirmadas")}`}
        baselineSection={
          <BaselineSection
            hasBaseline={attendanceHasBaseline}
            canEditSettings={canEditSettings}
            comparisonText={attendanceComparisonText}
          />
        }
      />
    </Grid>
  );
}

/**
 * Matiz do chip de ícone. Cada KPI ganha a sua para que a linha de cinco
 * tiles seja escaneável — antes eram cinco `NavIcon` de accent sólido
 * idênticos, que não distinguiam nada e ainda concentravam cinco pontos
 * saturados na região mais nobre da página.
 */
type KpiHue = "teal" | "blue" | "green" | "orange" | "purple";

/**
 * Classe de cor do glifo, token-backed pela ponte Tailwind da Astryx
 * (`--color-<hue>-vivid`). Mapa literal em vez de string interpolada porque
 * o Tailwind v4 só gera a utility que encontra escaneando o código.
 */
const HUE_ICON_CLASS: Record<KpiHue, string> = {
  teal: "text-teal-vivid",
  blue: "text-blue-vivid",
  green: "text-green-vivid",
  orange: "text-orange-vivid",
  purple: "text-purple-vivid",
};

interface KpiTileProps {
  label: string;
  value: string;
  base: string;
  baselineSection?: ReactNode;
  /** Ícone temático do KPI, exibido no chip do topo-direita (R2). */
  icon: ComponentType<{ size?: number; className?: string }>;
  hue: KpiHue;
}

/**
 * Tile de KPI conforme design.md § R2: label pequeno no topo-esquerda,
 * chip de ícone colorido no topo-direita, valor em destaque e sublabels
 * secundários. Apresentação pura — os números e os formatadores são
 * exatamente os mesmos de antes (spec.md — RD-04 AC2).
 */
function KpiTile({
  label,
  value,
  base,
  baselineSection,
  icon: Icon,
  hue,
}: KpiTileProps): ReactNode {
  return (
    <Card>
      <VStack gap={2}>
        <HStack hAlign="between" vAlign="start" gap={2}>
          <Text type="label" color="secondary">
            {label}
          </Text>
          <Card variant={hue} padding={1.5}>
            <Icon size={16} className={HUE_ICON_CLASS[hue]} />
          </Card>
        </HStack>
        <Heading level={2}>{value}</Heading>
        <Text type="supporting" color="secondary">
          {base}
        </Text>
        {baselineSection}
      </VStack>
    </Card>
  );
}
