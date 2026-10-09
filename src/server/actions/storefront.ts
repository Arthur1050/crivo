"use server";

import { revalidatePath } from "next/cache";
import { getActiveTenantId } from "../tenant";
import { denyIfForbidden } from "./permission";
import { getTenant } from "../data";
import { saveStorefront } from "../data/storefront";
import { scheduleStorefrontRevalidation } from "../storefront/schedule";
import {
  ACTIVATION_BLOCKER_LABELS,
  activationBlockers,
  validateStorefrontInput,
  type ActivationBlocker,
  type StorefrontField,
  type StorefrontInput,
} from "../../lib/storefront";

// Gravação da configuração da vitrine pelo CRM (lote-16a — VCFG-02, VATIV-01,
// VREV-02). Molde de `settings.ts`: a recusa de permissão é a primeira coisa
// que roda, o tenant vem sempre de `getActiveTenantId()` (nunca do `input`) e
// toda validação roda antes de qualquer escrita, então uma recusa nunca grava
// parte da configuração.

/** Campo recusado e a mensagem que a tela mostra junto dele. */
export interface StorefrontFieldError {
  field: StorefrontField | ActivationBlocker;
  message: string;
}

export type SaveStorefrontActionResult =
  | { ok: true }
  | {
      ok: false;
      /** Primeira mensagem, para quem só mostra um aviso geral. */
      error: string;
      /** Uma entrada por campo recusado; nas pré-condições de ativação, na ordem CRECI, razão social, WhatsApp do agente. */
      errors: StorefrontFieldError[];
    };

function refuse(errors: StorefrontFieldError[]): SaveStorefrontActionResult {
  return { ok: false, error: errors[0].message, errors };
}

export async function saveStorefrontAction(
  input: StorefrontInput
): Promise<SaveStorefrontActionResult> {
  const denied = await denyIfForbidden("configuracoes", "escrever");
  if (denied) return { ok: false, error: denied.error, errors: [] };

  const validation = validateStorefrontInput(input);
  if (!validation.ok) {
    return refuse([{ field: validation.field, message: validation.message }]);
  }

  const tenantId = await getActiveTenantId();

  // Desativar não exige nada além do valor (VATIV-01 AC7); ativar exige as três
  // pré-condições, todas listadas na ordem da spec (AC4).
  if (validation.value.active) {
    const tenant = await getTenant(tenantId);
    const blockers = activationBlockers({
      storefront: validation.value,
      agentWhatsapp: tenant?.agentWhatsapp,
    });
    if (blockers.length > 0) {
      return refuse(
        blockers.map((field) => ({ field, message: ACTIVATION_BLOCKER_LABELS[field] }))
      );
    }
  }

  const saved = await saveStorefront(tenantId, validation.value);
  if (!saved.ok) {
    // Segunda trava do DAL (VATIV-01 AC5); não deve ser alcançável depois dos bloqueios acima.
    return refuse([
      { field: "creci", message: ACTIVATION_BLOCKER_LABELS.creci },
      { field: "razaoSocial", message: ACTIVATION_BLOCKER_LABELS.razaoSocial },
    ]);
  }

  revalidatePath("/configuracoes");
  scheduleStorefrontRevalidation(tenantId);
  return { ok: true };
}
