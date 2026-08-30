"use server";

import { revalidatePath } from "next/cache";
import { getActiveTenantId } from "../tenant";
import { denyIfForbidden } from "./permission";
import { updateTenantSettings, type Modality } from "../data";
import {
  validateAgentVoiceTone,
  validateBaselineCount,
  validateBaselinePercent,
  validateBusinessHours,
  validateModality,
  validateName,
} from "../validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface UpdateTenantSettingsInput {
  name: string;
  agentName: string;
  supportedModality: Modality;
  // Identidade opcional (redesign-crm-astryx — RD-07 AC3). Repassados como
  // vieram: `updateTenantSettings` é quem normaliza (chave ausente = coluna
  // intocada; vazio/só espaços = null). Quem edita esses campos na UI precisa
  // enviá-los SEMPRE, senão limpar um campo não apaga a coluna.
  city?: string | null;
  state?: string | null;
  agentWhatsapp?: string | null;
  website?: string | null;
  agentPresentationMessage?: string | null;
  // Tom de voz e personalidade (lote-6b — PER-03). Mesma regra de
  // sempre-enviar dos campos acima; validado (máx. 500 chars) nesta action
  // antes de repassar à DAL.
  agentVoiceTone?: string | null;
  // Horário comercial (lote-6 — CONF-05). Mesma regra de sempre-enviar dos
  // campos acima: o form manda os 3 sempre, para que limpar a configuração
  // (voltar ao fallback) também seja possível via a mesma action.
  meetingDays?: number[] | null;
  meetingHoursStart?: string | null;
  meetingHoursEnd?: string | null;
  // Baseline pré-piloto (lote-9 — BASE-01). Mesma regra de sempre-enviar dos
  // campos acima: o formulário manda os 5 sempre, para que limpar um
  // baseline (voltar a "não registrado") também passe pela mesma action.
  // Validados (inteiro dentro da faixa) nesta action antes de repassar à DAL.
  baselineLeadsPerMonth?: number | null;
  baselineFirstResponseMinutes?: number | null;
  baselineLeadToMeetingPct?: number | null;
  baselineEscalationPct?: number | null;
  baselineAttendancePct?: number | null;
}

/**
 * Atualiza as configurações do tenant ATIVO (lote-2 — CONF-01/02). O tenant
 * nunca vem de `input` — é sempre resolvido no servidor via
 * `getActiveTenantId()` (cookie `crivo_tenant`), para que nenhum chamador
 * possa gravar em outro tenant informando um id no payload.
 *
 * Só `name`, `agentName` e `supportedModality` são validados: os campos de
 * identidade são opcionais e vazios persistem null (RD-07 AC3).
 */
export async function updateTenantSettingsAction(
  input: UpdateTenantSettingsInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("configuracoes", "escrever");
  if (denied) return denied;

  const nameCheck = validateName(input.name, "Nome do tenant");
  if (!nameCheck.ok) return nameCheck;

  const agentNameCheck = validateName(input.agentName, "Nome do agente");
  if (!agentNameCheck.ok) return agentNameCheck;

  const modalityCheck = validateModality(input.supportedModality);
  if (!modalityCheck.ok) return modalityCheck;

  const agentVoiceToneCheck = validateAgentVoiceTone(input.agentVoiceTone);
  if (!agentVoiceToneCheck.ok) return agentVoiceToneCheck;

  const businessHoursCheck = validateBusinessHours({
    meetingDays: input.meetingDays ?? null,
    meetingHoursStart: input.meetingHoursStart ?? null,
    meetingHoursEnd: input.meetingHoursEnd ?? null,
  });
  if (!businessHoursCheck.ok) return businessHoursCheck;

  // BASE-01 AC3/AC4: um baseline inválido impede a gravação dos CINCO —
  // toda checagem roda antes de qualquer chamada à DAL, mesmo molde de
  // curto-circuito dos campos acima.
  const leadsPerMonthCheck = validateBaselineCount(
    input.baselineLeadsPerMonth,
    "Leads por mês"
  );
  if (!leadsPerMonthCheck.ok) return leadsPerMonthCheck;

  const firstResponseCheck = validateBaselineCount(
    input.baselineFirstResponseMinutes,
    "Minutos até a primeira resposta"
  );
  if (!firstResponseCheck.ok) return firstResponseCheck;

  const leadToMeetingCheck = validateBaselinePercent(
    input.baselineLeadToMeetingPct,
    "Percentual de lead para reunião"
  );
  if (!leadToMeetingCheck.ok) return leadToMeetingCheck;

  const escalationCheck = validateBaselinePercent(
    input.baselineEscalationPct,
    "Percentual de escalonamento"
  );
  if (!escalationCheck.ok) return escalationCheck;

  const attendanceCheck = validateBaselinePercent(
    input.baselineAttendancePct,
    "Percentual de comparecimento"
  );
  if (!attendanceCheck.ok) return attendanceCheck;

  const tenantId = await getActiveTenantId();
  const updated = await updateTenantSettings(tenantId, {
    name: input.name.trim(),
    agentName: input.agentName.trim(),
    supportedModality: input.supportedModality,
    city: input.city,
    state: input.state,
    agentWhatsapp: input.agentWhatsapp,
    website: input.website,
    agentPresentationMessage: input.agentPresentationMessage,
    agentVoiceTone: input.agentVoiceTone,
    meetingDays: input.meetingDays,
    meetingHoursStart: input.meetingHoursStart,
    meetingHoursEnd: input.meetingHoursEnd,
    baselineLeadsPerMonth: input.baselineLeadsPerMonth,
    baselineFirstResponseMinutes: input.baselineFirstResponseMinutes,
    baselineLeadToMeetingPct: input.baselineLeadToMeetingPct,
    baselineEscalationPct: input.baselineEscalationPct,
    baselineAttendancePct: input.baselineAttendancePct,
  });

  if (!updated) {
    return { ok: false, error: "Tenant não encontrado." };
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}
