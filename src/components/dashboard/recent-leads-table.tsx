"use client";

import { LEAD_STATUS } from "../../lib/vocabulary";
import { MODALITY } from "../../verticals/real-estate/vocabulary";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Badge } from "@astryxdesign/core/Badge";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack } from "@astryxdesign/core/Stack";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import type { Lead, LeadStatus } from "@/src/server/data";

const FALLBACK = "—";

type Modality = NonNullable<Lead["modality"]>;

const MODALITY_LABELS: Record<Modality, string> = {
  [MODALITY.new]: "Novo",
  [MODALITY.used]: "Usado",
  [MODALITY.both]: "Ambos",
};

const MODALITY_BADGE_VARIANT: Record<Modality, "blue" | "purple" | "teal"> = {
  [MODALITY.new]: "blue",
  [MODALITY.used]: "purple",
  [MODALITY.both]: "teal",
};

// Mesmas cores semânticas das colunas do Kanban (design.md § R1/R2), para que
// um status signifique visualmente a mesma coisa nas duas telas.
const STATUS_LABELS: Record<LeadStatus, string> = {
  [LEAD_STATUS.engaged]: "Em qualificação",
  [LEAD_STATUS.goal_reached]: "Qualificado e agendado",
  [LEAD_STATUS.escalated]: "Escalado para humano",
};

const STATUS_BADGE_VARIANT: Record<LeadStatus, "warning" | "green" | "red"> = {
  [LEAD_STATUS.engaged]: "warning",
  [LEAD_STATUS.goal_reached]: "green",
  [LEAD_STATUS.escalated]: "red",
};

/**
 * Linha já SERIALIZADA para atravessar a fronteira RSC→client (AD-007):
 * `budget` vem formatado em BRL pelo servidor (a coluna é `bigint`) e
 * `firstContactAt` vem em ISO (a coluna é `Date`).
 */
export interface RecentLeadRow extends Record<string, unknown> {
  id: string;
  name: string;
  budget: string | null;
  modality: Lead["modality"];
  status: LeadStatus;
  brokerName: string | null;
  firstContactAt: string;
}

interface RecentLeadsTableProps {
  rows: RecentLeadRow[];
}

function Fallback() {
  return (
    <Text type="body" color="secondary">
      {FALLBACK}
    </Text>
  );
}

const COLUMNS: TableColumn<RecentLeadRow>[] = [
  {
    key: "name",
    header: "Lead",
    width: proportional(2),
    renderCell: (row) => (
      <Text type="body" weight="medium">
        {row.name}
      </Text>
    ),
  },
  {
    key: "budget",
    header: "Orçamento",
    width: proportional(1),
    renderCell: (row) =>
      row.budget ? <Text type="body">{row.budget}</Text> : <Fallback />,
  },
  {
    key: "modality",
    header: "Modalidade",
    width: proportional(1),
    renderCell: (row) =>
      row.modality ? (
        <Badge
          label={MODALITY_LABELS[row.modality]}
          variant={MODALITY_BADGE_VARIANT[row.modality]}
        />
      ) : (
        <Fallback />
      ),
  },
  {
    key: "status",
    header: "Status",
    width: proportional(1),
    renderCell: (row) => (
      <Badge
        label={STATUS_LABELS[row.status]}
        variant={STATUS_BADGE_VARIANT[row.status]}
      />
    ),
  },
  {
    key: "brokerName",
    header: "Corretor",
    width: proportional(1),
    renderCell: (row) =>
      row.brokerName ? (
        <HStack gap={2} vAlign="center">
          <Avatar name={row.brokerName} size="xsm" />
          <Text type="body">{row.brokerName}</Text>
        </HStack>
      ) : (
        <Fallback />
      ),
  },
  {
    key: "firstContactAt",
    header: "Data",
    width: pixel(140),
    renderCell: (row) => <Timestamp value={row.firstContactAt} format="date" />,
  },
];

/**
 * Tabela "Leads Recentes" do dashboard (redesign-crm-astryx — RD-04 AC4/AC5,
 * design.md § R2). Lista os últimos leads gerados pelo agente,
 * independentemente do filtro de período da página. Campos nulos renderizam
 * "—"; sem nenhum lead, um EmptyState em vez de uma tabela vazia.
 */
export function RecentLeadsTable({ rows }: RecentLeadsTableProps) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nenhum lead ainda"
        description="Os leads gerados pelo agente aparecerão aqui assim que a primeira conversa começar."
      />
    );
  }

  return (
    <Table
      data={rows}
      columns={COLUMNS}
      idKey="id"
      dividers="rows"
      hasHover
    />
  );
}
