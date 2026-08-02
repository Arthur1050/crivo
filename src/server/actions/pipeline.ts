"use server";

import { revalidatePath } from "next/cache";
import { getActiveTenantId } from "../tenant";
import { updateLeadStatus, type LeadStatus } from "../data";
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
  const updated = await updateLeadStatus(
    tenantId,
    input.leadId,
    input.status as LeadStatus
  );

  if (!updated) {
    return { ok: false, error: "Lead não encontrado." };
  }

  revalidatePath("/pipeline");
  return { ok: true };
}
