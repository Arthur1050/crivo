"use server";

import { revalidatePath } from "next/cache";
import { verifySession } from "../auth/session";
import { registerHumanOptOut } from "../chats/human-opt-out";
import { sendHumanMessage, type HumanSendFailure } from "../chats/human-send";
import { returnConversationToAgent, takeOverConversation } from "../data";
import { denyIfForbidden } from "./permission";

// Porta de entrada da tela de Chats (lote-14 — design.md C5; molde de
// `pipeline.ts`). Toda action exige `chats:escrever` e resolve escopo e
// usuário pela sessão, nunca pelo `input`.

export type ChatActionResult = { ok: true } | { ok: false; error: string };

const LEAD_NOT_FOUND = "Lead não encontrado.";
const LEAD_OPTED_OUT = "Este lead pediu para não receber mais mensagens.";

export interface ChatLeadInput {
  leadId: string;
}

/** Assumir a conversa (ASSUMIR-01). Lead já humano mantém a marca original. */
export async function assumeConversationAction(input: ChatLeadInput): Promise<ChatActionResult> {
  const denied = await denyIfForbidden("chats", "escrever");
  if (denied) return denied;

  const session = await verifySession();
  const result = await takeOverConversation(
    session.leadScope,
    input.leadId,
    session.user.id,
    new Date()
  );
  if (result.outcome === "fora-do-escopo") return { ok: false, error: LEAD_NOT_FOUND };
  if (result.outcome === "opt-out") return { ok: false, error: LEAD_OPTED_OUT };

  revalidatePath("/chats");
  return { ok: true };
}

/** Devolver a conversa ao agente (DEVOLVER-01). */
export async function returnConversationToAgentAction(
  input: ChatLeadInput
): Promise<ChatActionResult> {
  const denied = await denyIfForbidden("chats", "escrever");
  if (denied) return denied;

  const session = await verifySession();
  const result = await returnConversationToAgent(session.leadScope, input.leadId, new Date());
  if (result.outcome === "fora-do-escopo") return { ok: false, error: LEAD_NOT_FOUND };
  if (result.outcome === "opt-out") return { ok: false, error: LEAD_OPTED_OUT };

  revalidatePath("/chats");
  return { ok: true };
}

export interface SendHumanMessageActionInput {
  leadId: string;
  text: string;
  /** Chave de idempotência gerada pelo composer a cada texto (ENVIO-01 AC11). */
  requestId: string;
}

export type SendHumanMessageActionResult =
  | { ok: true }
  | { ok: false; error: string; failure?: HumanSendFailure };

/** Envio do corretor ao lead pelo WhatsApp (ENVIO-01, JANELA-01). */
export async function sendHumanMessageAction(
  input: SendHumanMessageActionInput
): Promise<SendHumanMessageActionResult> {
  const denied = await denyIfForbidden("chats", "escrever");
  if (denied) return denied;

  const session = await verifySession();
  const result = await sendHumanMessage(
    { scope: session.leadScope, user: { id: session.user.id, name: session.user.name } },
    input,
    new Date()
  );

  if (result.ok) {
    revalidatePath("/chats");
    return { ok: true };
  }
  // Aba desatualizada: o agente voltou a conduzir; a tela passa a mostrá-lo.
  if (result.failure === "conversa-com-agente") revalidatePath("/chats");
  return { ok: false, error: result.error, failure: result.failure };
}

export interface RegisterOptOutActionInput {
  leadId: string;
  /** Chave de idempotência do envio da confirmação. */
  requestId: string;
}

export type RegisterOptOutActionResult =
  | { ok: true; confirmationDelivered: boolean; warning?: string }
  | { ok: false; error: string };

/** Opt-out registrado pelo humano (OPTHUM-01). */
export async function registerOptOutAction(
  input: RegisterOptOutActionInput
): Promise<RegisterOptOutActionResult> {
  const denied = await denyIfForbidden("chats", "escrever");
  if (denied) return denied;

  const session = await verifySession();
  const result = await registerHumanOptOut(
    { scope: session.leadScope, user: { id: session.user.id, name: session.user.name } },
    input,
    new Date()
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/chats");
  return result.warning === undefined
    ? { ok: true, confirmationDelivered: result.confirmationDelivered }
    : { ok: true, confirmationDelivered: result.confirmationDelivered, warning: result.warning };
}
