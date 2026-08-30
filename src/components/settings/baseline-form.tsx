"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, TrendingUpIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { updateTenantSettingsAction } from "@/src/server/actions/settings";
import type { Tenant } from "@/src/server/data";
import {
  validateBaselineCount,
  validateBaselinePercent,
} from "@/src/server/validation";

// Mesmos rótulos usados pela action (`src/server/actions/settings.ts`) nas
// chamadas de `validateBaselineCount`/`validateBaselinePercent` — o
// prefixo do `error` devolvido pela action é o que roteia o erro para o
// campo certo em `mapActionError`, mesmo padrão de `settings-form.tsx`.
const LEADS_LABEL = "Leads por mês";
const RESPONSE_LABEL = "Minutos até a primeira resposta";
const LEAD_TO_MEETING_LABEL = "Percentual de lead para reunião";
const ESCALATION_LABEL = "Percentual de escalonamento";
const ATTENDANCE_LABEL = "Percentual de comparecimento";

const BASELINE_HELPER =
  "Números da imobiliária ANTES do agente entrar em operação, para comparar o desempenho depois. Deixe em branco o que ainda não foi levantado — vazio não é erro.";

interface FieldErrors {
  leadsPerMonth?: string;
  firstResponseMinutes?: string;
  leadToMeetingPct?: string;
  escalationPct?: string;
  attendancePct?: string;
}

interface BaselineFormProps {
  tenant: Tenant;
}

/**
 * Formulário de baseline pré-piloto (lote-9 — BASE-01): os cinco números que
 * a imobiliária registra para comparar "antes x depois" nos KPIs do
 * Dashboard (BASE-02, T27). Mesmo molde de `settings-form.tsx`: validação
 * client-side é cortesia (feedback imediato); `updateTenantSettingsAction` é
 * sempre a autoridade final, e qualquer erro que ela devolva é exibido,
 * nunca engolido. `name`/`agentName`/`supportedModality` são obrigatórios em
 * TODO save dessa action — este formulário reenvia os valores atuais do
 * tenant sem alterá-los, exercitando só os cinco campos de baseline.
 */
export function BaselineForm({ tenant }: BaselineFormProps) {
  const router = useRouter();
  const [leadsPerMonth, setLeadsPerMonth] = useState<number | null>(
    tenant.baselineLeadsPerMonth
  );
  const [firstResponseMinutes, setFirstResponseMinutes] = useState<number | null>(
    tenant.baselineFirstResponseMinutes
  );
  const [leadToMeetingPct, setLeadToMeetingPct] = useState<number | null>(
    tenant.baselineLeadToMeetingPct
  );
  const [escalationPct, setEscalationPct] = useState<number | null>(
    tenant.baselineEscalationPct
  );
  const [attendancePct, setAttendancePct] = useState<number | null>(
    tenant.baselineAttendancePct
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  function mapActionError(error: string): FieldErrors | null {
    if (error.startsWith(LEADS_LABEL)) return { leadsPerMonth: error };
    if (error.startsWith(RESPONSE_LABEL)) return { firstResponseMinutes: error };
    if (error.startsWith(LEAD_TO_MEETING_LABEL)) return { leadToMeetingPct: error };
    if (error.startsWith(ESCALATION_LABEL)) return { escalationPct: error };
    if (error.startsWith(ATTENDANCE_LABEL)) return { attendancePct: error };
    return null;
  }

  async function handleSave() {
    setBanner(null);

    const leadsCheck = validateBaselineCount(leadsPerMonth, LEADS_LABEL);
    const responseCheck = validateBaselineCount(firstResponseMinutes, RESPONSE_LABEL);
    const leadToMeetingCheck = validateBaselinePercent(
      leadToMeetingPct,
      LEAD_TO_MEETING_LABEL
    );
    const escalationCheck = validateBaselinePercent(escalationPct, ESCALATION_LABEL);
    const attendanceCheck = validateBaselinePercent(attendancePct, ATTENDANCE_LABEL);

    const nextErrors: FieldErrors = {
      leadsPerMonth: leadsCheck.ok ? undefined : leadsCheck.error,
      firstResponseMinutes: responseCheck.ok ? undefined : responseCheck.error,
      leadToMeetingPct: leadToMeetingCheck.ok ? undefined : leadToMeetingCheck.error,
      escalationPct: escalationCheck.ok ? undefined : escalationCheck.error,
      attendancePct: attendanceCheck.ok ? undefined : attendanceCheck.error,
    };

    if (
      nextErrors.leadsPerMonth ||
      nextErrors.firstResponseMinutes ||
      nextErrors.leadToMeetingPct ||
      nextErrors.escalationPct ||
      nextErrors.attendancePct
    ) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    const result = await updateTenantSettingsAction({
      name: tenant.name,
      agentName: tenant.agentName,
      supportedModality: tenant.supportedModality,
      baselineLeadsPerMonth: leadsPerMonth,
      baselineFirstResponseMinutes: firstResponseMinutes,
      baselineLeadToMeetingPct: leadToMeetingPct,
      baselineEscalationPct: escalationPct,
      baselineAttendancePct: attendancePct,
    });

    if (!result.ok) {
      const fieldError = mapActionError(result.error);
      if (fieldError) {
        setErrors(fieldError);
      } else {
        setBanner({ type: "error", message: result.error });
      }
      return;
    }

    setBanner({ type: "success", message: "Baseline salvo com sucesso." });
    router.refresh();
  }

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <HStack gap={2}>
            <TrendingUpIcon size={20} />
            <Heading level={3}>Baseline pré-piloto</Heading>
          </HStack>
          <Text type="supporting" color="secondary">
            {BASELINE_HELPER}
          </Text>
        </VStack>
        <Divider />

        {banner && (
          <Banner
            status={banner.type}
            title={banner.message}
            isDismissable
            onDismiss={() => setBanner(null)}
          />
        )}

        <FormLayout>
          <FormLayout direction="horizontal">
            <NumberInput
              label={LEADS_LABEL}
              units="leads/mês"
              min={0}
              step={1}
              isIntegerOnly
              hasClear
              value={leadsPerMonth}
              onChange={(value) => {
                setLeadsPerMonth(value);
                setErrors((prev) => ({ ...prev, leadsPerMonth: undefined }));
              }}
              status={
                errors.leadsPerMonth
                  ? { type: "error", message: errors.leadsPerMonth }
                  : undefined
              }
            />
            <NumberInput
              label={RESPONSE_LABEL}
              units="minutos"
              min={0}
              step={1}
              isIntegerOnly
              hasClear
              value={firstResponseMinutes}
              onChange={(value) => {
                setFirstResponseMinutes(value);
                setErrors((prev) => ({ ...prev, firstResponseMinutes: undefined }));
              }}
              status={
                errors.firstResponseMinutes
                  ? { type: "error", message: errors.firstResponseMinutes }
                  : undefined
              }
            />
          </FormLayout>

          <FormLayout direction="horizontal">
            <NumberInput
              label={LEAD_TO_MEETING_LABEL}
              units="%"
              min={0}
              max={100}
              step={1}
              isIntegerOnly
              hasClear
              value={leadToMeetingPct}
              onChange={(value) => {
                setLeadToMeetingPct(value);
                setErrors((prev) => ({ ...prev, leadToMeetingPct: undefined }));
              }}
              status={
                errors.leadToMeetingPct
                  ? { type: "error", message: errors.leadToMeetingPct }
                  : undefined
              }
            />
            <NumberInput
              label={ESCALATION_LABEL}
              units="%"
              min={0}
              max={100}
              step={1}
              isIntegerOnly
              hasClear
              value={escalationPct}
              onChange={(value) => {
                setEscalationPct(value);
                setErrors((prev) => ({ ...prev, escalationPct: undefined }));
              }}
              status={
                errors.escalationPct
                  ? { type: "error", message: errors.escalationPct }
                  : undefined
              }
            />
          </FormLayout>

          <FormLayout direction="horizontal">
            <NumberInput
              label={ATTENDANCE_LABEL}
              units="%"
              min={0}
              max={100}
              step={1}
              isIntegerOnly
              hasClear
              value={attendancePct}
              onChange={(value) => {
                setAttendancePct(value);
                setErrors((prev) => ({ ...prev, attendancePct: undefined }));
              }}
              status={
                errors.attendancePct
                  ? { type: "error", message: errors.attendancePct }
                  : undefined
              }
            />
          </FormLayout>
        </FormLayout>

        <HStack hAlign="end">
          <Button
            label="Salvar baseline"
            variant="primary"
            icon={<CheckIcon size={16} />}
            clickAction={handleSave}
          />
        </HStack>
      </VStack>
    </Card>
  );
}
