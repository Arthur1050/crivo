import { isSlotWithinBusinessHours } from "./business-hours.mjs";
import { canAgentContactProactively } from "./conduction.mjs";

const HOUR_MS = 60 * 60 * 1000;

/**
 * @typedef {{status?: unknown, optedOutAt?: unknown, humanTakeoverAt?: unknown}} ReengagementLead
 * @typedef {{messageId?: unknown, sentAt?: unknown}} ReengagementAnchor
 * @typedef {{phoneNumberId?: unknown}} ReengagementChannel
 * @typedef {{action: "prepare" | "omit" | "escalate" | null, reason: "eligible" | "too-early" | "window-closed" | "outside-contact-hours" | "ineligible" | "unknown-data" | "silence-expired"}} ReengagementDecision
 */

/** @param {unknown} value */
function time(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  return new Date(value).getTime();
}

/** @param {unknown} value */
function knownMark(value) {
  return value === null || Number.isFinite(time(value));
}

/**
 * Política compartilhada REEN-01/05. Fatos vêm da leitura autoritativa do CRM:
 * anchor é o inbound real corrente; channel é o canal já resolvido/verificado;
 * destination é o MSISDN normalizado pelo transporte existente. Esta função
 * não resolve tenant, propriedade, revisão, claim ou consumo do episódio.
 * O repositório confere esses vínculos sob lock antes de qualquer efeito.
 *
 * Horário usa A2, independente do fuso da conta de consumo. Nenhum resultado
 * autoriza template. Omit/escalate são ações internas, sem envio ao lead:
 * não dependem de canal, destino nem de fase publicada (`phase` null/undefined
 * = o agente ainda não publicou a fase deste inbound, por exemplo porque o
 * turno falhou). O escalonamento é a rede de segurança justamente desse caso.
 * Só "prepare" exige fase conhecida, canal verificado e destino.
 * @param {{lead?: ReengagementLead | null, anchor?: ReengagementAnchor | null, phase?: unknown, channel?: ReengagementChannel | null, destination?: unknown, now?: unknown, settings?: import("./business-hours.mjs").BusinessHoursSettings | null}} input
 * @returns {ReengagementDecision}
 */
export function evaluateReengagement({ lead, anchor, phase, channel, destination, now, settings }) {
  const current = time(now);
  const inbound = time(anchor?.sentAt);
  const unpublished = phase === null || phase === undefined;
  if (!lead || typeof lead.status !== "string" || !["em_qualificacao", "qualificado_agendado", "escalado_humano"].includes(lead.status)
      || !knownMark(lead.optedOutAt) || !knownMark(lead.humanTakeoverAt)
      || (!unpublished && (typeof phase !== "string" || !["qualificando", "agendando", "encerrada"].includes(phase)))
      || typeof anchor?.messageId !== "string" || !anchor.messageId.trim()
      || !Number.isFinite(current) || !Number.isFinite(inbound) || current < inbound) {
    return { action: null, reason: "unknown-data" };
  }
  if (lead.status !== "em_qualificacao" || phase === "encerrada" || !canAgentContactProactively(lead)) {
    return { action: null, reason: "ineligible" };
  }

  const silence = current - inbound;
  if (silence >= 48 * HOUR_MS) return { action: "escalate", reason: "silence-expired" };
  if (silence >= 24 * HOUR_MS) return { action: "omit", reason: "window-closed" };
  if (unpublished
      || typeof channel?.phoneNumberId !== "string" || !/^\d{1,32}$/.test(channel.phoneNumberId)
      || typeof destination !== "string" || !/^\d+$/.test(destination)) {
    return { action: null, reason: "unknown-data" };
  }
  if (silence < 22 * HOUR_MS) return { action: null, reason: "too-early" };
  if (!isSlotWithinBusinessHours(new Date(current).toISOString(), settings)) {
    return { action: null, reason: "outside-contact-hours" };
  }
  return { action: "prepare", reason: "eligible" };
}
