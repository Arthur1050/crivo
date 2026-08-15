"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { canEditMeetingAttendance } from "@/src/lib/meeting-attendance";
import {
  setMeetingAttendanceAction,
  updateLeadBrokerAction,
} from "@/src/server/actions/pipeline";
import type { Broker } from "@/src/server/data";

type AttendanceValue = "pendente" | "compareceu" | "nao_compareceu";

const ATTENDANCE_TO_VALUE: Record<AttendanceValue, boolean | null> = {
  pendente: null,
  compareceu: true,
  nao_compareceu: false,
};

const ATTENDANCE_FROM_VALUE: Record<string, AttendanceValue> = {
  null: "pendente",
  true: "compareceu",
  false: "nao_compareceu",
};

const ATTENDANCE_LABELS: Record<AttendanceValue, string> = {
  pendente: "Pendente",
  compareceu: "Compareceu",
  nao_compareceu: "Não compareceu",
};

interface LeadControlsProps {
  leadId: string;
  /** Corretores do tenant ativo (lote-7 — ATRIB-02 AC1). */
  brokers: Pick<Broker, "id" | "name">[];
  brokerId: string | null;
  /** ISO string — nunca `Date` cru na fronteira RSC → client (AD-007). */
  meetingAt: string | null;
  meetingAttended: boolean | null;
}

/**
 * Controles interativos do painel de detalhe do lead (lote-7 — ATRIB-02,
 * KPI-02): seletor de corretor e controle de três estados de comparecimento.
 * Mutação otimista com rollback em caso de falha — mesmo padrão de
 * `pipeline-board.tsx` (`handleDrop`): aplica o valor novo antes da action
 * responder, desfaz se ela devolver `{ ok: false }`, e `router.refresh()` no
 * sucesso para o Kanban e o Dashboard refletirem o dado fresco do servidor.
 */
export function LeadControls({
  leadId,
  brokers,
  brokerId,
  meetingAt,
  meetingAttended,
}: LeadControlsProps) {
  const router = useRouter();
  const [brokerOverride, setBrokerOverride] = useState<string | null | undefined>(
    undefined
  );
  const [attendanceOverride, setAttendanceOverride] = useState<
    boolean | null | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);

  const effectiveBrokerId = brokerOverride !== undefined ? brokerOverride : brokerId;
  const effectiveAttendance =
    attendanceOverride !== undefined ? attendanceOverride : meetingAttended;

  // "Reunião marcada e já passada" (spec.md — Assumptions): função pura
  // testada isoladamente em src/lib/__tests__/meeting-attendance.test.ts.
  // `new Date()` só é lido aqui, na borda de apresentação — nunca dentro da
  // função pura.
  const canEditAttendance = canEditMeetingAttendance(meetingAt, new Date());

  async function handleBrokerChange(nextBrokerId: string) {
    setError(null);
    const previous = effectiveBrokerId;
    setBrokerOverride(nextBrokerId);

    const result = await updateLeadBrokerAction({ leadId, brokerId: nextBrokerId });

    if (!result.ok) {
      setBrokerOverride(previous);
      setError(result.error);
      return;
    }

    router.refresh();
  }

  async function handleAttendanceChange(value: string) {
    setError(null);
    const previous = effectiveAttendance;
    const nextAttended = ATTENDANCE_TO_VALUE[value as AttendanceValue];
    setAttendanceOverride(nextAttended);

    const result = await setMeetingAttendanceAction({
      leadId,
      attended: nextAttended,
    });

    if (!result.ok) {
      setAttendanceOverride(previous);
      setError(result.error);
      return;
    }

    router.refresh();
  }

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

      {brokers.length === 0 ? (
        <Selector
          label="Corretor"
          options={[]}
          isDisabled
          disabledMessage="Nenhum corretor cadastrado neste tenant"
          placeholder="Corretor indisponível"
        />
      ) : (
        <Selector
          label="Corretor"
          options={brokers.map((broker) => ({ value: broker.id, label: broker.name }))}
          value={effectiveBrokerId ?? undefined}
          onChange={(value) => void handleBrokerChange(value)}
          placeholder="Escolha o corretor"
        />
      )}

      {canEditAttendance ? (
        <SegmentedControl
          label="Comparecimento à reunião"
          value={ATTENDANCE_FROM_VALUE[String(effectiveAttendance)]}
          onChange={(value) => void handleAttendanceChange(value)}
        >
          <SegmentedControlItem value="pendente" label="Pendente" />
          <SegmentedControlItem value="compareceu" label="Compareceu" />
          <SegmentedControlItem value="nao_compareceu" label="Não compareceu" />
        </SegmentedControl>
      ) : (
        <HStack vAlign="center">
          <StackItem size="fill">
            <Text type="supporting" color="secondary">
              Compareceu à reunião
            </Text>
          </StackItem>
          <Text type="body">
            {ATTENDANCE_LABELS[ATTENDANCE_FROM_VALUE[String(effectiveAttendance)]]}
          </Text>
        </HStack>
      )}
    </VStack>
  );
}
