"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ComponentType } from "react";
import {
  CalendarDaysIcon,
  CheckIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  UsersIcon,
} from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { LeadDetailPanel } from "@/src/components/pipeline/lead-detail-panel";
import { RelativeTime } from "@/src/components/shared/relative-time";
import { formatCurrencyBRL } from "@/src/lib/format";
import { updateLeadStatusAction } from "@/src/server/actions/pipeline";
import type {
  Broker,
  Lead,
  LeadStatus,
  LeadWithBroker,
  Modality,
} from "@/src/server/data";

const MODALITY_LABELS: Record<Modality, string> = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
};

const MODALITY_BADGE_VARIANT: Record<Modality, "blue" | "purple" | "teal"> = {
  novo: "blue",
  usado: "purple",
  ambos: "teal",
};

const PROPERTY_TYPE_LABELS: Record<NonNullable<Lead["propertyType"]>, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
};

type StatusVariant = "warning" | "success" | "error";

interface ColumnDefinition {
  status: LeadStatus;
  title: string;
  emptyDescription: string;
  /** Cor semântica do status, compartilhada pelo dot e pelo badge (R1). */
  variant: StatusVariant;
  icon: ComponentType<{ size?: number }>;
}

// Badge não expõe as variantes semânticas com o mesmo nome do StatusDot:
// mapeia cada status para a cor equivalente da paleta de badges (R1 —
// "badge de contagem na mesma cor").
const BADGE_VARIANT: Record<StatusVariant, "yellow" | "green" | "red"> = {
  warning: "yellow",
  success: "green",
  error: "red",
};

// As 3 colunas fixas do funil (spec.md — PIPE-01.1); qualquer lead com status
// fora deste conjunto (dado corrompido) nunca aparece em coluna nenhuma —
// filtragem por igualdade exata já garante o silêncio exigido pelo AC de
// "status desconhecido" (spec.md — Edge Cases).
const COLUMNS: ColumnDefinition[] = [
  {
    status: "em_qualificacao",
    title: "Em qualificação",
    emptyDescription: "Leads em atendimento pelo agente aparecerão aqui.",
    variant: "warning",
    icon: MessageCircleIcon,
  },
  {
    status: "qualificado_agendado",
    title: "Qualificado e agendado",
    emptyDescription: "Leads qualificados com reunião agendada aparecerão aqui.",
    variant: "success",
    icon: CheckIcon,
  },
  {
    status: "escalado_humano",
    title: "Escalado para humano",
    emptyDescription: "Leads que precisam de atenção humana aparecerão aqui.",
    variant: "error",
    icon: UsersIcon,
  },
];

interface PipelineBoardProps {
  leads: LeadWithBroker[];
  /** `leadId → conversationId`, para o link "Ver conversa" (lote-3 — PIPE-04). */
  conversationIdByLeadId?: Record<string, string>;
  /** Corretores do tenant ativo, repassados ao painel de detalhe (lote-7 — ATRIB-02). */
  brokers: Pick<Broker, "id" | "name">[];
}

/**
 * Kanban de leads do tenant ativo (lote-3 — PIPE-01): agrupa os leads
 * recebidos do RSC em 3 colunas fixas por status. `getLeads` já entrega
 * ordenação determinística `updatedAt DESC, id` (T3) — o board só agrupa,
 * nunca reordena (spec.md — Out of Scope: sem reordenação manual na coluna).
 */
export function PipelineBoard({
  leads,
  conversationIdByLeadId = {},
  brokers,
}: PipelineBoardProps) {
  const router = useRouter();
  // Override otimista aplicado durante o voo do drag (e desfeito em caso de
  // falha da action) — nunca escreve em `leads`, só reagrupa a exibição
  // (lote-3 — PIPE-02.1/02.2).
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, LeadStatus>
  >({});
  const [error, setError] = useState<string | null>(null);
  // Id do lead aberto no painel lateral (lote-3 — PIPE-03), não o objeto —
  // assim o painel sempre reflete os dados mais recentes de `leads` (ex.:
  // após um `router.refresh()`) em vez de uma cópia parada no momento do
  // clique. Estado puramente client-side (não vai para a URL — design.md):
  // o quadro nunca desmonta ao abrir/fechar o painel, então scroll/colunas
  // são preservados (spec.md — PIPE-03.5).
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead = selectedLeadId
    ? (leads.find((lead) => lead.id === selectedLeadId) ?? null)
    : null;

  function effectiveStatus(lead: Lead): LeadStatus {
    return statusOverrides[lead.id] ?? lead.status;
  }

  const columns = COLUMNS.map((column) => ({
    ...column,
    leads: leads.filter((lead) => effectiveStatus(lead) === column.status),
  }));

  async function handleDrop(targetStatus: LeadStatus, leadId: string) {
    const lead = leads.find((candidate) => candidate.id === leadId);
    if (!lead) return;

    // Soltar na própria coluna de origem = no-op, sem disparar a action
    // (spec.md — PIPE-02.3).
    if (effectiveStatus(lead) === targetStatus) return;

    setError(null);
    setStatusOverrides((prev) => ({ ...prev, [leadId]: targetStatus }));

    const result = await updateLeadStatusAction({
      leadId,
      status: targetStatus,
    });

    if (!result.ok) {
      // Reverte o override otimista: o card volta à coluna original
      // (spec.md — PIPE-02.2).
      setStatusOverrides((prev) => {
        const next = { ...prev };
        delete next[leadId];
        return next;
      });
      setError(result.error);
      return;
    }

    router.refresh();
  }

  return (
    <VStack gap={4}>
      {error && (
        <Banner
          status="error"
          title={error}
          isDismissable
          onDismiss={() => setError(null)}
        />
      )}

      <Grid columns={3} gap={4} align="start">
        {columns.map((column) => (
          <Card
            key={column.status}
            padding={0}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const leadId = event.dataTransfer.getData("text/plain");
              if (leadId) void handleDrop(column.status, leadId);
            }}
          >
            <Layout
              height="auto"
              header={
                <LayoutHeader hasDivider padding={3}>
                  <HStack hAlign="between" vAlign="center" gap={2}>
                    <HStack gap={2} vAlign="center">
                      <StatusDot
                        variant={column.variant}
                        label={`Status ${column.title}`}
                      />
                      <column.icon size={16} />
                      <Heading level={3}>{column.title}</Heading>
                    </HStack>
                    <Badge
                      label={String(column.leads.length)}
                      variant={BADGE_VARIANT[column.variant]}
                    />
                  </HStack>
                </LayoutHeader>
              }
              content={
                <LayoutContent padding={3}>
                  {column.leads.length === 0 ? (
                    <EmptyState
                      isCompact
                      title="Nenhum lead"
                      description={column.emptyDescription}
                    />
                  ) : (
                    <VStack gap={2}>
                      {column.leads.map((lead) => (
                        <ClickableCard
                          key={lead.id}
                          label={`Ver detalhe de ${lead.name}`}
                          draggable
                          onDragStart={(event) =>
                            event.dataTransfer.setData("text/plain", lead.id)
                          }
                          onClick={() => setSelectedLeadId(lead.id)}
                        >
                          <LeadCardBody lead={lead} />
                        </ClickableCard>
                      ))}
                    </VStack>
                  )}
                </LayoutContent>
              }
            />
          </Card>
        ))}
      </Grid>

      {/* Fora do fluxo do quadro de propósito: o painel é um `<dialog>` na top
          layer, então abrir o detalhe não estreita as colunas nem reflowa os
          cards — o pipeline fica intacto por trás do overlay. */}
      {selectedLead && (
        <LeadDetailPanel
          lead={selectedLead}
          conversationId={conversationIdByLeadId[selectedLead.id]}
          brokers={brokers}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </VStack>
  );
}

/**
 * Conteúdo do card de lead (redesign-crm-astryx — RD-03 AC3/AC4,
 * design.md § R1): nome + badge de modalidade, telefone, região,
 * orçamento + tipo de imóvel, divider e rodapé com data e corretor.
 *
 * Cada linha de qualificação só é renderizada quando o dado existe — leads
 * ainda em qualificação simplesmente ficam mais curtos, sem placeholder nem
 * célula vazia (spec.md — Edge Cases).
 */
function LeadCardBody({ lead }: { lead: LeadWithBroker }) {
  const budget = formatCurrencyBRL(lead.budgetCents);

  return (
    <VStack gap={2}>
      <HStack hAlign="between" vAlign="center" gap={2}>
        <Text type="body" weight="medium">
          {lead.name}
        </Text>
        {lead.modality && (
          <Badge
            label={MODALITY_LABELS[lead.modality]}
            variant={MODALITY_BADGE_VARIANT[lead.modality]}
          />
        )}
      </HStack>

      <VStack gap={1}>
        <HStack gap={2} vAlign="center">
          <PhoneIcon size={14} />
          <Text type="supporting" color="secondary">
            {lead.phone}
          </Text>
        </HStack>

        {lead.region && (
          <HStack gap={2} vAlign="center">
            <MapPinIcon size={14} />
            <Text type="supporting" color="secondary">
              {lead.region}
            </Text>
          </HStack>
        )}
      </VStack>

      {(budget || lead.propertyType) && (
        <HStack hAlign="between" vAlign="center" gap={2}>
          {budget && (
            <Text type="body" weight="medium">
              {budget}
            </Text>
          )}
          {lead.propertyType && (
            <Text type="supporting" color="secondary">
              {PROPERTY_TYPE_LABELS[lead.propertyType]}
            </Text>
          )}
        </HStack>
      )}

      <Divider />

      <HStack hAlign="between" vAlign="center" gap={2}>
        <HStack gap={2} vAlign="center">
          <CalendarDaysIcon size={14} />
          <RelativeTime value={lead.firstContactAt.toISOString()} />
        </HStack>
        {lead.brokerName && (
          <Avatar name={lead.brokerName} size="xsm" />
        )}
      </HStack>
    </VStack>
  );
}
