import "server-only";
import { isHumanConducted } from "../../../n8n/src/conduction.mjs";
import { toWhatsAppMsisdn } from "../../../n8n/src/phone.mjs";
import { whatsappWindow } from "../../lib/conversation-control";
import type { LeadScope } from "../../lib/lead-scope";
import {
  failHumanSend,
  getLastLeadMessageAt,
  getLead,
  recordHumanMessage,
  reserveHumanSend,
  type Message,
} from "../data";
import {
  sendWhatsAppText,
  type CloudApiDependencies,
  type CloudApiFailure,
} from "../whatsapp/cloud-api";

/**
 * Envio humano pelo CRM (lote-14 — ENVIO-01, JANELA-01; design.md C4).
 * `sendHumanMessage` faz as guardas da conversa na ordem da sequência do
 * design e só então chama `deliverHumanText`, o núcleo reserva → Meta →
 * registro, que a confirmação de opt-out (T17) reaproveita com guardas
 * próprias. Toda recusa acontece antes da Meta; a mensagem só é gravada
 * depois do aceite, com o `wamid` como `externalId`.
 */

/** Limite de corpo de texto da Cloud API (spec.md — Assumptions). */
export const HUMAN_TEXT_MAX_LENGTH = 4096;

export type HumanSendFailure =
  | "texto-invalido"
  | "fora-do-escopo"
  | "conversa-com-agente"
  | "lead-com-opt-out"
  | "janela-fechada"
  | "numero-desconhecido"
  | "envio-nao-configurado"
  | "envio-em-andamento"
  | "entregue-sem-registro"
  | Exclude<CloudApiFailure, "nao-configurado">;

const NOT_CONFIGURED = "O envio pelo WhatsApp não está configurado. Avise o administrador.";

/**
 * Texto pt-BR de cada recusa (design.md — Error Handling Strategy). Tipado
 * pelo union: um código novo sem texto não compila (L-029).
 */
export const HUMAN_SEND_MESSAGES: Record<HumanSendFailure, string> = {
  "texto-invalido": "A mensagem precisa ter entre 1 e 4.096 caracteres.",
  "fora-do-escopo": "Lead não encontrado.",
  "conversa-com-agente":
    "O agente voltou a conduzir esta conversa. Assuma de novo para responder.",
  "lead-com-opt-out": "Este lead pediu para não receber mais mensagens.",
  "janela-fechada":
    "O WhatsApp só permite responder até 24 horas depois da última mensagem do lead.",
  "numero-desconhecido":
    "Ainda não há número de WhatsApp registrado para este lead. Ele aparece quando o lead escreve.",
  "envio-nao-configurado": NOT_CONFIGURED,
  "credencial-invalida": NOT_CONFIGURED,
  "envio-em-andamento": "Enviando…",
  "entregue-sem-registro": "A mensagem foi entregue ao lead, mas não ficou registrada aqui.",
  "destinatario-invalido": "O WhatsApp recusou o número deste lead.",
  "tempo-esgotado": "O WhatsApp não respondeu a tempo. Tente de novo.",
  "falha-meta": "O WhatsApp recusou o envio. Tente de novo.",
};

export type HumanSendResult =
  | { ok: true; message: Message }
  | { ok: false; failure: HumanSendFailure; error: string; metaCode?: number };

export interface HumanSendContext {
  scope: LeadScope;
  user: { id: string; name: string };
}

export interface SendHumanMessageInput {
  leadId: string;
  text: string;
  requestId: string;
}

export type HumanSendDependencies = CloudApiDependencies;

function refuse(failure: HumanSendFailure, metaCode?: number): HumanSendResult {
  const error = HUMAN_SEND_MESSAGES[failure];
  return metaCode === undefined
    ? { ok: false, failure, error }
    : { ok: false, failure, error, metaCode };
}

export interface DeliverHumanTextInput {
  tenantId: string;
  leadId: string;
  requestId: string;
  user: { id: string; name: string };
  /** Texto final, já validado: vai à Meta e ao registro sem alteração. */
  body: string;
  phoneNumberId: string;
  /** MSISDN do lead, já convertido por `toWhatsAppMsisdn`. */
  to: string;
}

/**
 * Núcleo do envio: reserva idempotente por `requestId`, chamada à Meta e
 * registro com autor na mesma transação que fecha a reserva. Os logs nunca
 * levam o conteúdo da mensagem.
 */
export async function deliverHumanText(
  input: DeliverHumanTextInput,
  now: Date,
  deps: HumanSendDependencies = {}
): Promise<HumanSendResult> {
  const { tenantId, leadId, requestId, phoneNumberId } = input;

  const reservation = await reserveHumanSend(tenantId, leadId, input.user.id, requestId, now);
  if (reservation.outcome === "ja-enviada") return { ok: true, message: reservation.message };
  if (reservation.outcome === "envio-em-andamento") return refuse("envio-em-andamento");

  const sent = await sendWhatsAppText(
    { phoneNumberId, to: input.to, body: input.body },
    deps
  );

  if (!sent.ok) {
    const failure: HumanSendFailure =
      sent.failure === "nao-configurado" ? "envio-nao-configurado" : sent.failure;
    await failHumanSend(tenantId, requestId, failure, now);
    console.error(
      JSON.stringify({
        event: "envio-humano-falhou",
        tenantId,
        leadId,
        failure,
        metaCode: sent.metaCode ?? null,
      })
    );
    return refuse(failure, sent.metaCode);
  }

  let message: Message | null = null;
  try {
    message = await recordHumanMessage({
      tenantId,
      leadId,
      requestId,
      authorUserId: input.user.id,
      authorName: input.user.name,
      content: input.body,
      wamid: sent.wamid,
      sentAt: now,
      whatsappPhoneNumberId: phoneNumberId,
    });
  } catch {
    message = null;
  }

  if (!message) {
    // A Meta já entregou: a reserva fica em `enviando` para que uma repetição
    // imediata do mesmo `requestId` não reenvie ao lead.
    console.error(
      JSON.stringify({
        event: "envio-humano-sem-registro",
        tenantId,
        leadId,
        wamid: sent.wamid,
      })
    );
    return refuse("entregue-sem-registro");
  }

  return { ok: true, message };
}

/**
 * Envio do corretor ao lead (ENVIO-01 AC1–AC13; JANELA-01 AC4/AC6). Guardas,
 * todas antes da Meta: texto, escopo, opt-out, condução humana, janela de
 * 24h e número do canal. O texto vai sem espaços nas pontas e sem prefixo.
 */
export async function sendHumanMessage(
  context: HumanSendContext,
  input: SendHumanMessageInput,
  now: Date,
  deps: HumanSendDependencies = {}
): Promise<HumanSendResult> {
  const body = input.text.trim();
  if (body.length === 0 || body.length > HUMAN_TEXT_MAX_LENGTH) return refuse("texto-invalido");

  const lead = await getLead(context.scope, input.leadId);
  if (!lead) return refuse("fora-do-escopo");
  if (lead.optedOutAt) return refuse("lead-com-opt-out");
  if (!isHumanConducted({ status: lead.status, humanTakeoverAt: lead.humanTakeoverAt })) {
    return refuse("conversa-com-agente");
  }

  const lastLeadMessageAt = await getLastLeadMessageAt(lead.tenantId, lead.id);
  if (!whatsappWindow(lastLeadMessageAt, now).open) return refuse("janela-fechada");

  if (!lead.whatsappPhoneNumberId) return refuse("numero-desconhecido");
  const to = toWhatsAppMsisdn(lead.externalId);
  if (!to) return refuse("destinatario-invalido");

  return deliverHumanText(
    {
      tenantId: lead.tenantId,
      leadId: lead.id,
      requestId: input.requestId,
      user: context.user,
      body,
      phoneNumberId: lead.whatsappPhoneNumberId,
      to,
    },
    now,
    deps
  );
}
