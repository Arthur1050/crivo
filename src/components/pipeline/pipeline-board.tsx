"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { updateLeadStatusAction } from "@/src/server/actions/pipeline";
import type { Lead, LeadStatus, Modality } from "@/src/server/data";

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

interface ColumnDefinition {
  status: LeadStatus;
  title: string;
  emptyDescription: string;
}

// As 3 colunas fixas do funil (spec.md — PIPE-01.1); qualquer lead com status
// fora deste conjunto (dado corrompido) nunca aparece em coluna nenhuma —
// filtragem por igualdade exata já garante o silêncio exigido pelo AC de
// "status desconhecido" (spec.md — Edge Cases).
const COLUMNS: ColumnDefinition[] = [
  {
    status: "em_qualificacao",
    title: "Em qualificação",
    emptyDescription: "Leads em atendimento pelo agente aparecerão aqui.",
  },
  {
    status: "qualificado_agendado",
    title: "Qualificado e agendado",
    emptyDescription: "Leads qualificados com reunião agendada aparecerão aqui.",
  },
  {
    status: "escalado_humano",
    title: "Escalado para humano",
    emptyDescription: "Leads que precisam de atenção humana aparecerão aqui.",
  },
];

interface PipelineBoardProps {
  leads: Lead[];
}

/**
 * Kanban de leads do tenant ativo (lote-3 — PIPE-01): agrupa os leads
 * recebidos do RSC em 3 colunas fixas por status. `getLeads` já entrega
 * ordenação determinística `updatedAt DESC, id` (T3) — o board só agrupa,
 * nunca reordena (spec.md — Out of Scope: sem reordenação manual na coluna).
 */
export function PipelineBoard({ leads }: PipelineBoardProps) {
  const router = useRouter();
  // Override otimista aplicado durante o voo do drag (e desfeito em caso de
  // falha da action) — nunca escreve em `leads`, só reagrupa a exibição
  // (lote-3 — PIPE-02.1/02.2).
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, LeadStatus>
  >({});
  const [error, setError] = useState<string | null>(null);

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
          <VStack
            key={column.status}
            gap={3}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const leadId = event.dataTransfer.getData("text/plain");
              if (leadId) void handleDrop(column.status, leadId);
            }}
          >
            <HStack vAlign="center" gap={2}>
              <Heading level={3}>{column.title}</Heading>
              <Badge label={String(column.leads.length)} variant="neutral" />
            </HStack>

            {column.leads.length === 0 ? (
              <EmptyState
                isCompact
                title="Nenhum lead"
                description={column.emptyDescription}
              />
            ) : (
              <VStack gap={2}>
                {column.leads.map((lead) => (
                  <Card
                    key={lead.id}
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData("text/plain", lead.id)
                    }
                  >
                    <VStack gap={1}>
                      <Text type="body" weight="medium">
                        {lead.name}
                      </Text>
                      <HStack gap={2} vAlign="center" wrap="wrap">
                        {lead.modality && (
                          <Badge
                            label={MODALITY_LABELS[lead.modality]}
                            variant={MODALITY_BADGE_VARIANT[lead.modality]}
                          />
                        )}
                        <Timestamp
                          value={lead.firstContactAt.toISOString()}
                          format="relative"
                          type="supporting"
                          color="secondary"
                        />
                      </HStack>
                    </VStack>
                  </Card>
                ))}
              </VStack>
            )}
          </VStack>
        ))}
      </Grid>
    </VStack>
  );
}
