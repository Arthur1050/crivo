/**
 * Controle da conversa no Chats (lote-14 — design.md C3): janela de 24h do
 * WhatsApp e visibilidade dos controles de condução. Puro, fora do componente
 * (L-003). A regra "quem conduz" vem de `n8n/src/conduction.mjs`, a mesma
 * fonte que o n8n usa.
 */
import { isHumanConducted } from "../../n8n/src/conduction.mjs";

const MINUTE_MS = 60 * 1000;
const WINDOW_MS = 24 * 60 * MINUTE_MS;

/**
 * Intervalo da atualização periódica da conversa aberta. A spec exige no
 * máximo 10 s (THREAD-01 AC2).
 */
export const CHAT_REFRESH_INTERVAL_MS = 5000;

export type PageVisibility = "visible" | "hidden";

export interface WhatsappWindow {
  open: boolean;
  closesAt: Date | null;
  remainingMinutes: number;
}

/**
 * Janela de 24h (JANELA-01 AC1): aberta enquanto a mensagem mais recente do
 * lead tem menos de 24 h; com 24 h exatas ou mais, fechada. Sem mensagem do
 * lead, fechada. `remainingMinutes` arredonda para baixo (nunca promete mais
 * tempo do que há).
 */
export function whatsappWindow(lastLeadMessageAt: Date | null, now: Date): WhatsappWindow {
  if (!lastLeadMessageAt) return { open: false, closesAt: null, remainingMinutes: 0 };
  const closesAt = new Date(lastLeadMessageAt.getTime() + WINDOW_MS);
  const remainingMs = closesAt.getTime() - now.getTime();
  if (remainingMs <= 0) return { open: false, closesAt, remainingMinutes: 0 };
  return { open: true, closesAt, remainingMinutes: Math.floor(remainingMs / MINUTE_MS) };
}

/** Tempo restante da janela aberta, em horas e minutos (JANELA-01 AC2). */
export function formatWindowRemaining(minutes: number): string {
  if (minutes < 1) return "menos de 1 min";
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export type Conductor = "agente" | "humano" | "escalado" | "opt-out";
export type ComposerState = "oculto" | "bloqueado" | "ativo";

export interface ConversationControlsInput {
  status: string;
  humanTakeoverAt: Date | string | null;
  optedOutAt: Date | string | null;
  canWrite: boolean;
  window: WhatsappWindow;
}

export interface ConversationControls {
  conductor: Conductor;
  canAssume: boolean;
  canReturn: boolean;
  canOptOut: boolean;
  composer: ComposerState;
}

/**
 * Quem conduz e o que a tela oferece (ASSUMIR-01 AC8, DEVOLVER-01 AC9,
 * OPTHUM-01 AC7). Opt-out vence tudo: conversa só leitura. Sem
 * `chats:escrever`, nenhum controle.
 */
export function conversationControls(input: ConversationControlsInput): ConversationControls {
  const { status, humanTakeoverAt, optedOutAt, canWrite, window } = input;
  if (optedOutAt) {
    return {
      conductor: "opt-out",
      canAssume: false,
      canReturn: false,
      canOptOut: false,
      composer: "oculto",
    };
  }

  const human = isHumanConducted({ status, humanTakeoverAt });
  const conductor: Conductor = !human ? "agente" : humanTakeoverAt ? "humano" : "escalado";
  const composer: ComposerState =
    !canWrite || !human ? "oculto" : window.open ? "ativo" : "bloqueado";

  return {
    conductor,
    canAssume: canWrite && !human,
    canReturn: canWrite && human,
    canOptOut: canWrite,
    composer,
  };
}

/**
 * A conversa só é consultada periodicamente com uma conversa aberta e a aba
 * visível (THREAD-01 AC2/AC3).
 */
export function shouldPollConversation(
  hasOpenConversation: boolean,
  visibility: PageVisibility
): boolean {
  return hasOpenConversation && visibility === "visible";
}
