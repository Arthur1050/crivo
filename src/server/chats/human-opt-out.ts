import "server-only";
import { OPT_OUT_CONFIRMATION } from "../../../n8n/src/opt-out-intent.mjs";
import { toWhatsAppMsisdn } from "../../../n8n/src/phone.mjs";
import { whatsappWindow } from "../../lib/conversation-control";
import { getLastLeadMessageAt, getLead, optOutLeadByHuman } from "../data";
import {
  deliverHumanText,
  type HumanSendContext,
  type HumanSendDependencies,
} from "./human-send";

/**
 * Opt-out registrado pelo humano (lote-14 — OPTHUM-01; design.md C5). O
 * registro jurídico vem primeiro e nunca é desfeito: a confirmação ao lead é
 * um esforço adicional, enviada só com a janela de 24h aberta e o número do
 * canal conhecido, com o mesmo texto do caminho do agente
 * (`OPT_OUT_CONFIRMATION`, importado sem alteração — AD-032).
 */

export type HumanOptOutFailure = "fora-do-escopo";

export const HUMAN_OPT_OUT_MESSAGES: Record<HumanOptOutFailure | "confirmacao-nao-entregue", string> = {
  "fora-do-escopo": "Lead não encontrado.",
  "confirmacao-nao-entregue": "Opt-out registrado. A confirmação não foi entregue ao lead.",
};

export type HumanOptOutResult =
  | {
      ok: true;
      optedOutAt: Date;
      /** `false` quando o lead já tinha opt-out: nada foi gravado nem enviado. */
      newlyOptedOut: boolean;
      confirmationDelivered: boolean;
      /** Presente quando a confirmação foi tentada e não chegou (AC5). */
      warning?: string;
    }
  | { ok: false; failure: HumanOptOutFailure; error: string };

export interface RegisterHumanOptOutInput {
  leadId: string;
  /** Chave de idempotência do envio da confirmação. */
  requestId: string;
}

export async function registerHumanOptOut(
  context: HumanSendContext,
  input: RegisterHumanOptOutInput,
  now: Date,
  deps: HumanSendDependencies = {}
): Promise<HumanOptOutResult> {
  const registered = await optOutLeadByHuman(context.scope, input.leadId, now);
  if (!registered) {
    return {
      ok: false,
      failure: "fora-do-escopo",
      error: HUMAN_OPT_OUT_MESSAGES["fora-do-escopo"],
    };
  }

  const base = {
    ok: true as const,
    optedOutAt: registered.optedOutAt,
    newlyOptedOut: registered.newlyOptedOut,
  };
  if (!registered.newlyOptedOut) return { ...base, confirmationDelivered: false };

  const lead = await getLead(context.scope, input.leadId);
  if (!lead || !lead.whatsappPhoneNumberId) return { ...base, confirmationDelivered: false };
  const to = toWhatsAppMsisdn(lead.externalId);
  const lastLeadMessageAt = await getLastLeadMessageAt(lead.tenantId, lead.id);
  if (!to || !whatsappWindow(lastLeadMessageAt, now).open) {
    return { ...base, confirmationDelivered: false };
  }

  const sent = await deliverHumanText(
    {
      tenantId: lead.tenantId,
      leadId: lead.id,
      requestId: input.requestId,
      user: context.user,
      body: OPT_OUT_CONFIRMATION,
      phoneNumberId: lead.whatsappPhoneNumberId,
      to,
    },
    now,
    deps
  );
  // `entregue-sem-registro`: a Meta entregou ao lead; só o registro falhou.
  if (sent.ok || sent.failure === "entregue-sem-registro") {
    return { ...base, confirmationDelivered: true };
  }
  return {
    ...base,
    confirmationDelivered: false,
    warning: HUMAN_OPT_OUT_MESSAGES["confirmacao-nao-entregue"],
  };
}
