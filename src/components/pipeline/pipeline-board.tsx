"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
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
  const columns = COLUMNS.map((column) => ({
    ...column,
    leads: leads.filter((lead) => lead.status === column.status),
  }));

  return (
    <Grid columns={3} gap={4} align="start">
      {columns.map((column) => (
        <VStack key={column.status} gap={3}>
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
                <Card key={lead.id}>
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
  );
}
