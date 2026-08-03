import { XIcon } from "lucide-react";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { NavLink } from "@/src/components/shared/nav-link";
import { formatCurrencyBRL } from "@/src/lib/format";
import type { Lead, Modality } from "@/src/server/data";

const FALLBACK = "—";

const MODALITY_LABELS: Record<Modality, string> = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
};

const PROPERTY_TYPE_LABELS: Record<
  NonNullable<Lead["propertyType"]>,
  string
> = {
  casa: "Casa",
  apartamento: "Apartamento",
};

const MOTIVATION_LABELS: Record<NonNullable<Lead["motivation"]>, string> = {
  investidor: "Investidor",
  morador: "Morador",
};

const CREDIT_STATUS_LABELS: Record<
  NonNullable<Lead["creditStatus"]>,
  string
> = {
  pre_aprovado: "Pré-aprovado",
  recurso_proprio: "Recurso próprio",
  fgts: "FGTS",
};

function formatBoolean(value: boolean | null): string {
  if (value === null) return FALLBACK;
  return value ? "Sim" : "Não";
}

interface QualificationRowProps {
  label: string;
  value: string;
}

function QualificationRow({ label, value }: QualificationRowProps) {
  return (
    <HStack vAlign="center">
      <StackItem size="fill">
        <Text type="supporting" color="secondary">
          {label}
        </Text>
      </StackItem>
      <Text type="body">{value}</Text>
    </HStack>
  );
}

interface LeadDetailPanelProps {
  lead: Lead;
  /** id da conversa deste lead, quando existir (lote-3 — PIPE-04). */
  conversationId?: string;
  onClose: () => void;
}

/**
 * Conteúdo do painel lateral de detalhe do lead (lote-3 — PIPE-03): resumo
 * executivo, motivo do escalonamento (só quando o lead está escalado) e
 * campos de qualificação formatados — convenção única para ausência de dado:
 * "—" em todo campo nulo, nunca "R$ NaN" para orçamento. Renderizado dentro
 * de uma `LayoutPanel` pelo `PipelineBoard`, que mantém o quadro montado por
 * trás — fechar o painel não perde scroll/colunas.
 */
export function LeadDetailPanel({
  lead,
  conversationId,
  onClose,
}: LeadDetailPanelProps) {
  const isEscalated = lead.status === "escalado_humano";
  const budgetLabel = formatCurrencyBRL(lead.budgetCents) ?? FALLBACK;

  return (
    <VStack gap={5}>
      <HStack vAlign="center">
        <StackItem size="fill">
          <Heading level={3}>{lead.name}</Heading>
        </StackItem>
        <IconButton
          label="Fechar painel do lead"
          icon={<XIcon size={16} />}
          variant="ghost"
          size="sm"
          onClick={onClose}
        />
      </HStack>

      <VStack gap={1}>
        <Text type="label" color="secondary">
          Resumo executivo
        </Text>
        <Text type="body">
          {lead.executiveSummary ?? "Resumo ainda não disponível"}
        </Text>
      </VStack>

      {isEscalated && (
        <VStack gap={1}>
          <Text type="label" color="secondary">
            Motivo do escalonamento
          </Text>
          <Text type="body">
            {lead.escalationReason ?? "Motivo não informado"}
          </Text>
        </VStack>
      )}

      <VStack gap={2}>
        <Text type="label" color="secondary">
          Qualificação
        </Text>
        <VStack gap={1.5}>
          <QualificationRow
            label="Modalidade"
            value={lead.modality ? MODALITY_LABELS[lead.modality] : FALLBACK}
          />
          <QualificationRow label="Região" value={lead.region ?? FALLBACK} />
          <QualificationRow label="Orçamento" value={budgetLabel} />
          <QualificationRow
            label="Tipo de imóvel"
            value={
              lead.propertyType
                ? PROPERTY_TYPE_LABELS[lead.propertyType]
                : FALLBACK
            }
          />
          <QualificationRow
            label="Horizonte de compra"
            value={lead.purchaseHorizon ?? FALLBACK}
          />
          <QualificationRow
            label="Motivação"
            value={
              lead.motivation ? MOTIVATION_LABELS[lead.motivation] : FALLBACK
            }
          />
          <QualificationRow
            label="Situação de crédito"
            value={
              lead.creditStatus
                ? CREDIT_STATUS_LABELS[lead.creditStatus]
                : FALLBACK
            }
          />
          <QualificationRow
            label="Operação casada"
            value={formatBoolean(lead.chainedOperation)}
          />
          <HStack vAlign="center">
            <StackItem size="fill">
              <Text type="supporting" color="secondary">
                Reunião
              </Text>
            </StackItem>
            {lead.meetingAt ? (
              <Timestamp value={lead.meetingAt.toISOString()} format="date_time" />
            ) : (
              <Text type="body">{FALLBACK}</Text>
            )}
          </HStack>
          <QualificationRow
            label="Compareceu à reunião"
            value={formatBoolean(lead.meetingAttended)}
          />
        </VStack>
      </VStack>

      {conversationId && (
        <NavLink href={`/chats?conversa=${conversationId}`}>
          Ver conversa
        </NavLink>
      )}
    </VStack>
  );
}
