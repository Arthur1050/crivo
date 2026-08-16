"use client";

import NextLink from "next/link";
import {
  ArrowLeftRightIcon,
  Building2Icon,
  CalendarClockIcon,
  CalendarDaysIcon,
  LandmarkIcon,
  MapPinIcon,
  MessageCircleIcon,
  PhoneIcon,
  SparklesIcon,
  TagIcon,
  TargetIcon,
  WalletIcon,
} from "lucide-react";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import {
  Layout,
  LayoutContent,
  LayoutFooter,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import { LeadControls } from "@/src/components/pipeline/lead-controls";
import { RelativeTime } from "@/src/components/shared/relative-time";
import { formatCurrencyBRL } from "@/src/lib/format";
import type {
  Broker,
  Lead,
  LeadStatus,
  LeadWithBroker,
  Modality,
} from "@/src/server/data";

const FALLBACK = "—";

const MODALITY_LABELS: Record<Modality, string> = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
};

// Mesma paleta dos cards do quadro (redesign-crm-astryx — design.md § R1):
// abrir o painel não pode recolorir a modalidade que o usuário acabou de ver.
const MODALITY_BADGE_VARIANT: Record<Modality, "blue" | "purple" | "teal"> = {
  novo: "blue",
  usado: "purple",
  ambos: "teal",
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

interface StatusMeta {
  label: string;
  variant: "warning" | "success" | "error";
}

// Espelha as 3 colunas do `PipelineBoard`: o painel repete o status da coluna
// de onde o card veio, com o mesmo rótulo e a mesma cor semântica.
const STATUS_META: Record<LeadStatus, StatusMeta> = {
  em_qualificacao: { label: "Em qualificação", variant: "warning" },
  qualificado_agendado: { label: "Qualificado e agendado", variant: "success" },
  escalado_humano: { label: "Escalado para humano", variant: "error" },
};

// Os 9 campos que o agente preenche ao longo da conversa (PRD §6.4). O painel
// mostra quantos já vieram como barra de progresso — é o que diferencia um
// lead "vazio, recém-chegado" de um "qualificado de verdade" antes mesmo de o
// gestor ler linha por linha.
const QUALIFICATION_FIELDS = [
  "modality",
  "region",
  "budgetCents",
  "propertyType",
  "purchaseHorizon",
  "motivation",
  "creditStatus",
  "chainedOperation",
  "meetingAt",
] as const satisfies readonly (keyof Lead)[];

function countFilledFields(lead: Lead): number {
  return QUALIFICATION_FIELDS.filter((field) => lead[field] !== null).length;
}

/** Texto de valor ausente — cinza de placeholder, nunca com o peso de um dado real. */
function EmptyValue() {
  return (
    <Text type="body" color="placeholder">
      {FALLBACK}
    </Text>
  );
}

/** Booleano de qualificação como token semântico: verde para sim, neutro para não. */
function BooleanValue({ value }: { value: boolean | null }) {
  if (value === null) return <EmptyValue />;
  return (
    <Token
      label={value ? "Sim" : "Não"}
      color={value ? "green" : "gray"}
      size="sm"
    />
  );
}

interface LeadDetailPanelProps {
  lead: LeadWithBroker;
  /** id da conversa deste lead, quando existir (lote-3 — PIPE-04). */
  conversationId?: string;
  /** Corretores do tenant ativo, para o seletor do `LeadControls` (lote-7 — ATRIB-02). */
  brokers: Pick<Broker, "id" | "name">[];
  onClose: () => void;
}

/**
 * Painel de detalhe do lead (lote-3 — PIPE-03): resumo executivo, motivo do
 * escalonamento (só quando o lead está escalado) e campos de qualificação
 * formatados — convenção única para ausência de dado: "—" em todo campo nulo,
 * nunca "R$ NaN" para orçamento.
 *
 * Renderizado como `Dialog` ancorado na borda direita (drawer), não mais como
 * `LayoutPanel` no slot `end` do quadro: o `<dialog>` nativo vive na top layer
 * do browser, então abrir o painel sobrepõe o pipeline em vez de reduzir a
 * largura das colunas e reflowar os cards. Vem de brinde o comportamento
 * esperado de um drawer — backdrop, foco preso dentro do painel e Escape para
 * fechar — sem estado extra aqui. O quadro continua montado por trás, então
 * fechar não perde scroll/colunas (spec.md — PIPE-03.5).
 */
export function LeadDetailPanel({
  lead,
  conversationId,
  brokers,
  onClose,
}: LeadDetailPanelProps) {
  const isEscalated = lead.status === "escalado_humano";
  const status = STATUS_META[lead.status];
  const budgetLabel = formatCurrencyBRL(lead.budgetCents);
  const filledFields = countFilledFields(lead);
  const isFullyQualified = filledFields === QUALIFICATION_FIELDS.length;

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      aria-label={`Detalhe do lead ${lead.name}`}
      width={420}
      maxHeight="100dvh"
      position={{ top: 0, right: 0, bottom: 0 }}
      padding={0}
      className="rounded-none"
    >
      {/* `padding` explícito nos três slots do Layout: o `Dialog` está com
          `padding={0}` (quem manda no espaçamento interno do drawer é o
          Layout), então sem isso header e footer herdam zero e encostam o
          botão de fechar e o de ligar na borda do painel. */}
      <Layout
        header={
          <LayoutHeader hasDivider padding={4}>
            <VStack gap={3}>
              <HStack gap={3} vAlign="start">
                <Avatar name={lead.name} size="md" tooltip={false} />
                <StackItem size="fill">
                  <VStack gap={0.5}>
                    <Heading level={3}>{lead.name}</Heading>
                    <HStack gap={1.5} vAlign="center">
                      <Icon icon={PhoneIcon} size="xsm" color="secondary" />
                      <Text type="supporting">{lead.phone}</Text>
                    </HStack>
                  </VStack>
                </StackItem>
                <IconButton
                  label="Fechar painel do lead"
                  icon={<Icon icon="close" />}
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                />
              </HStack>

              <HStack gap={2} vAlign="center" wrap="wrap">
                <StatusDot variant={status.variant} label={status.label} />
                <Text type="supporting">{status.label}</Text>
                {lead.modality && (
                  <Badge
                    label={MODALITY_LABELS[lead.modality]}
                    variant={MODALITY_BADGE_VARIANT[lead.modality]}
                  />
                )}
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={4}>
              {lead.optedOutAt && (
                <Banner
                  status="error"
                  title="Lead pediu opt-out"
                  description="O agente não envia mais mensagens para este contato."
                />
              )}

              {isEscalated && (
                <Banner
                  status="warning"
                  title="Escalado para humano"
                  description={lead.escalationReason ?? "Motivo não informado"}
                />
              )}

              <VStack gap={1.5}>
                <HStack hAlign="between" vAlign="center" gap={2}>
                  <Text type="label" color="secondary">
                    Qualificação
                  </Text>
                  <Text type="supporting" hasTabularNumbers>
                    {filledFields} de {QUALIFICATION_FIELDS.length} campos
                  </Text>
                </HStack>
                <ProgressBar
                  label="Progresso da qualificação"
                  isLabelHidden
                  value={filledFields}
                  max={QUALIFICATION_FIELDS.length}
                  variant={isFullyQualified ? "success" : "accent"}
                />
              </VStack>

              <Section variant="muted" padding={3}>
                <VStack gap={2}>
                  <HStack gap={1.5} vAlign="center">
                    <Icon icon={WalletIcon} size="xsm" color="secondary" />
                    <Text type="supporting">Orçamento</Text>
                  </HStack>
                  {budgetLabel ? (
                    <Heading level={2}>{budgetLabel}</Heading>
                  ) : (
                    <EmptyValue />
                  )}
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Token
                      icon={<Icon icon={Building2Icon} size="xsm" />}
                      label={
                        lead.propertyType
                          ? PROPERTY_TYPE_LABELS[lead.propertyType]
                          : "Tipo não informado"
                      }
                      size="sm"
                    />
                    <Token
                      icon={<Icon icon={MapPinIcon} size="xsm" />}
                      label={lead.region ?? "Região não informada"}
                      size="sm"
                    />
                  </HStack>
                </VStack>
              </Section>

              <VStack gap={1.5}>
                <HStack gap={1.5} vAlign="center">
                  <Icon icon={SparklesIcon} size="xsm" color="accent" />
                  <Text type="label" color="secondary">
                    Resumo executivo
                  </Text>
                </HStack>
                {lead.executiveSummary ? (
                  <Text type="body">{lead.executiveSummary}</Text>
                ) : (
                  <Text type="body" color="placeholder">
                    Resumo ainda não disponível — o agente publica assim que a
                    conversa avança.
                  </Text>
                )}
              </VStack>

              <Divider />

              <MetadataList
                title={
                  <Text type="label" color="secondary">
                    Perfil de compra
                  </Text>
                }
                label={{ position: "start" }}
              >
                <MetadataListItem
                  label="Modalidade"
                  icon={<Icon icon={TagIcon} size="xsm" color="secondary" />}
                >
                  {lead.modality ? (
                    <Text type="body">{MODALITY_LABELS[lead.modality]}</Text>
                  ) : (
                    <EmptyValue />
                  )}
                </MetadataListItem>
                <MetadataListItem
                  label="Horizonte de compra"
                  icon={
                    <Icon
                      icon={CalendarClockIcon}
                      size="xsm"
                      color="secondary"
                    />
                  }
                >
                  {lead.purchaseHorizon ? (
                    <Text type="body">{lead.purchaseHorizon}</Text>
                  ) : (
                    <EmptyValue />
                  )}
                </MetadataListItem>
                <MetadataListItem
                  label="Motivação"
                  icon={<Icon icon={TargetIcon} size="xsm" color="secondary" />}
                >
                  {lead.motivation ? (
                    <Text type="body">
                      {MOTIVATION_LABELS[lead.motivation]}
                    </Text>
                  ) : (
                    <EmptyValue />
                  )}
                </MetadataListItem>
                <MetadataListItem
                  label="Situação de crédito"
                  icon={
                    <Icon icon={LandmarkIcon} size="xsm" color="secondary" />
                  }
                >
                  {lead.creditStatus ? (
                    <Token
                      label={CREDIT_STATUS_LABELS[lead.creditStatus]}
                      color="blue"
                      size="sm"
                    />
                  ) : (
                    <EmptyValue />
                  )}
                </MetadataListItem>
                <MetadataListItem
                  label="Operação casada"
                  icon={
                    <Icon
                      icon={ArrowLeftRightIcon}
                      size="xsm"
                      color="secondary"
                    />
                  }
                >
                  <BooleanValue value={lead.chainedOperation} />
                </MetadataListItem>
              </MetadataList>

              <Divider />

              <MetadataList
                title={
                  <Text type="label" color="secondary">
                    Reunião
                  </Text>
                }
                label={{ position: "start" }}
              >
                <MetadataListItem
                  label="Agendada para"
                  icon={
                    <Icon icon={CalendarDaysIcon} size="xsm" color="secondary" />
                  }
                >
                  {lead.meetingAt ? (
                    <Timestamp
                      value={lead.meetingAt.toISOString()}
                      format="date_time"
                    />
                  ) : (
                    <EmptyValue />
                  )}
                </MetadataListItem>
              </MetadataList>

              {/* Corretor + comparecimento migram do texto somente leitura para
                  o client component interativo (lote-7 — ATRIB-02, KPI-02):
                  `LeadControls` já traz seus próprios rótulos, então substitui
                  os dois `MetadataListItem` inteiros em vez de aninhar dentro
                  deles (evita rótulo duplicado). */}
              <VStack gap={1.5}>
                <Text type="label" color="secondary">
                  Atribuição e comparecimento
                </Text>
                <LeadControls
                  leadId={lead.id}
                  brokers={brokers}
                  brokerId={lead.brokerId}
                  meetingAt={lead.meetingAt ? lead.meetingAt.toISOString() : null}
                  meetingAttended={lead.meetingAttended}
                />
              </VStack>

              <Divider />

              <MetadataList
                title={
                  <Text type="label" color="secondary">
                    Atendimento
                  </Text>
                }
                label={{ position: "start" }}
              >
                <MetadataListItem
                  label="Primeiro contato"
                  icon={
                    <Icon icon={CalendarDaysIcon} size="xsm" color="secondary" />
                  }
                >
                  <RelativeTime
                    value={lead.firstContactAt.toISOString()}
                    type="body"
                  />
                </MetadataListItem>
                {lead.optedOutAt && (
                  <MetadataListItem
                    label="Opt-out em"
                    icon={
                      <Icon
                        icon={MessageCircleIcon}
                        size="xsm"
                        color="secondary"
                      />
                    }
                  >
                    <Timestamp
                      value={lead.optedOutAt.toISOString()}
                      format="date_time"
                    />
                  </MetadataListItem>
                )}
              </MetadataList>
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider padding={4}>
            <HStack gap={2} vAlign="center">
              <StackItem size="fill">
                <Button
                  label="Ver conversa"
                  variant="primary"
                  width="100%"
                  icon={<Icon icon={MessageCircleIcon} />}
                  isDisabled={!conversationId}
                  tooltip={
                    conversationId
                      ? undefined
                      : "Este lead ainda não tem conversa registrada"
                  }
                  href={
                    conversationId
                      ? `/chats?conversa=${conversationId}`
                      : undefined
                  }
                  as={NextLink}
                />
              </StackItem>
              <Button
                label="Ligar"
                variant="secondary"
                icon={<Icon icon={PhoneIcon} />}
                isIconOnly
                tooltip={`Ligar para ${lead.phone}`}
                href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
