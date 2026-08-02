"use server";

import { revalidatePath } from "next/cache";
import { getActiveTenantId } from "../tenant";
import { updateTenantSettings, type Modality } from "../data";
import { validateModality, validateName } from "../validation";

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface UpdateTenantSettingsInput {
  name: string;
  agentName: string;
  supportedModality: Modality;
}

/**
 * Atualiza as configurações do tenant ATIVO (lote-2 — CONF-01/02). O tenant
 * nunca vem de `input` — é sempre resolvido no servidor via
 * `getActiveTenantId()` (cookie `crivo_tenant`), para que nenhum chamador
 * possa gravar em outro tenant informando um id no payload.
 */
export async function updateTenantSettingsAction(
  input: UpdateTenantSettingsInput
): Promise<ActionResult> {
  const nameCheck = validateName(input.name, "Nome do tenant");
  if (!nameCheck.ok) return nameCheck;

  const agentNameCheck = validateName(input.agentName, "Nome do agente");
  if (!agentNameCheck.ok) return agentNameCheck;

  const modalityCheck = validateModality(input.supportedModality);
  if (!modalityCheck.ok) return modalityCheck;

  const tenantId = await getActiveTenantId();
  const updated = await updateTenantSettings(tenantId, {
    name: input.name.trim(),
    agentName: input.agentName.trim(),
    supportedModality: input.supportedModality,
  });

  if (!updated) {
    return { ok: false, error: "Tenant não encontrado." };
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}
