"use server";

import { revalidatePath } from "next/cache";
import { getActiveTenantId } from "../tenant";
import {
  setMeetingAttendance,
  updateLeadBroker,
  updateLeadStatus,
  type LeadStatus,
} from "../data";
import { validateLeadStatus } from "../validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Mesmo padrão das actions do lote-2: o tenant ativo é sempre resolvido no
// servidor via `getActiveTenantId()` (nunca a partir de `input`).

export interface UpdateLeadStatusInput {
  leadId: string;
  status: string;
}

/**
 * Persiste o novo status de um lead ao soltar o card em outra coluna do
 * Kanban (lote-3 — PIPE-02). `status` chega como `string` (drag-and-drop do
 * componente Board) e é validado contra o enum antes de qualquer escrita; um
 * `leadId` que não pertence ao tenant ativo é tratado como não encontrado
 * pela DAL (`updateLeadStatus` retorna `null`), nunca como sucesso silencioso.
 */
export async function updateLeadStatusAction(
  input: UpdateLeadStatusInput
): Promise<ActionResult> {
  const statusCheck = validateLeadStatus(input.status);
  if (!statusCheck.ok) return statusCheck;

  const tenantId = await getActiveTenantId();
  // "humano" explícito (lote-5 — INT-04): o Kanban é a única origem humana
  // de mudança de status; a trava humana (patchLead) depende deste registro.
  const updated = await updateLeadStatus(
    tenantId,
    input.leadId,
    input.status as LeadStatus,
    "humano"
  );

  if (!updated) {
    return { ok: false, error: "Lead não encontrado." };
  }

  revalidatePath("/pipeline");
  return { ok: true };
}

export interface UpdateLeadBrokerInput {
  leadId: string;
  brokerId: string;
}

/**
 * Troca o corretor responsável por um lead a partir do painel de detalhe
 * (lote-7 — ATRIB-02): mesmo molde de `updateLeadStatusAction` — tenant
 * resolvido pelo cookie (AD-007), nunca por parâmetro; a DAL já valida que o
 * corretor pertence ao tenant ativo (`updateLeadBroker`), então um `null`
 * dela (corretor de outro tenant OU lead inexistente/de outro tenant) vira
 * falha explícita aqui, nunca sucesso silencioso.
 */
export async function updateLeadBrokerAction(
  input: UpdateLeadBrokerInput
): Promise<ActionResult> {
  const tenantId = await getActiveTenantId();
  const updated = await updateLeadBroker(tenantId, input.leadId, input.brokerId);

  if (!updated) {
    return { ok: false, error: "Corretor ou lead não encontrado." };
  }

  revalidatePath("/pipeline");
  return { ok: true };
}

export interface SetMeetingAttendanceInput {
  leadId: string;
  attended: boolean | null;
}

/**
 * Persiste o comparecimento à reunião de um lead (lote-7 — KPI-02): mesmo
 * molde de `updateLeadStatusAction`. `attended` chega já como `boolean |
 * null` — os três estados do controle (pendente/compareceu/não compareceu)
 * — e a DAL escopa por tenant ativo.
 */
export async function setMeetingAttendanceAction(
  input: SetMeetingAttendanceInput
): Promise<ActionResult> {
  const tenantId = await getActiveTenantId();
  const updated = await setMeetingAttendance(tenantId, input.leadId, input.attended);

  if (!updated) {
    return { ok: false, error: "Lead não encontrado." };
  }

  revalidatePath("/pipeline");
  return { ok: true };
}
