"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { ButtonGroup } from "@astryxdesign/core/ButtonGroup";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/Stack";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { setMeetingAttendanceAction } from "@/src/server/actions/pipeline";

const FALLBACK = "—";

/**
 * Linha já SERIALIZADA para atravessar a fronteira RSC→client (AD-007):
 * `meetingAt` vem em ISO — a coluna de origem (`PendingMeeting.meetingAt`,
 * `src/server/data/index.ts`) é `Date`.
 */
export interface PendingMeetingRow extends Record<string, unknown> {
  leadId: string;
  leadName: string;
  meetingAt: string;
  brokerName: string | null;
}

interface PendingMeetingsProps {
  rows: PendingMeetingRow[];
}

/**
 * Bloco "Reuniões a confirmar" do Dashboard (lote-9 — PRES-01): lista
 * reuniões encerradas sem comparecimento registrado, ainda dentro da janela
 * de 14 dias (`getPendingAttendanceMeetings`, T19), com confirmação em um
 * clique. Mesmo padrão de mutação de `src/components/pipeline/lead-controls.tsx`:
 * a action decide, o componente só reflete o resultado — sem estado
 * otimista aqui porque a linha inteira desaparece da lista assim que deixa
 * de ser pendente (`router.refresh()` busca o RSC de novo).
 */
export function PendingMeetings({ rows }: PendingMeetingsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);

  async function confirm(leadId: string, attended: boolean) {
    setError(null);
    setPendingLeadId(leadId);

    const result = await setMeetingAttendanceAction({ leadId, attended });
    setPendingLeadId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
  }

  const columns: TableColumn<PendingMeetingRow>[] = [
    {
      key: "leadName",
      header: "Lead",
      width: proportional(2),
      renderCell: (row) => (
        <Text type="body" weight="medium">
          {row.leadName}
        </Text>
      ),
    },
    {
      key: "brokerName",
      header: "Corretor",
      width: proportional(1),
      renderCell: (row) =>
        row.brokerName ? (
          <Text type="body">{row.brokerName}</Text>
        ) : (
          <Text type="body" color="secondary">
            {FALLBACK}
          </Text>
        ),
    },
    {
      key: "meetingAt",
      header: "Reunião",
      width: pixel(160),
      renderCell: (row) => <Timestamp value={row.meetingAt} format="date" />,
    },
    {
      key: "confirmacao",
      header: "Confirmar comparecimento",
      width: pixel(300),
      renderCell: (row) => (
        <ButtonGroup label={`Confirmar comparecimento de ${row.leadName}`}>
          <Button
            label="Compareceu"
            variant="secondary"
            size="sm"
            isLoading={pendingLeadId === row.leadId}
            clickAction={() => confirm(row.leadId, true)}
          />
          <Button
            label="Não compareceu"
            variant="secondary"
            size="sm"
            isLoading={pendingLeadId === row.leadId}
            clickAction={() => confirm(row.leadId, false)}
          />
        </ButtonGroup>
      ),
    },
  ];

  return (
    <VStack gap={3}>
      {error && (
        <Banner
          status="error"
          title={error}
          isDismissable
          onDismiss={() => setError(null)}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhuma reunião pendente de confirmação"
          description="Reuniões encerradas sem comparecimento registrado aparecerão aqui até 14 dias após a data marcada."
        />
      ) : (
        <Table data={rows} columns={columns} idKey="leadId" dividers="rows" hasHover />
      )}
    </VStack>
  );
}
