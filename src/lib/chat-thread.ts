/**
 * Agrupamento de uma thread de conversa (redesign-crm-astryx — RD-06 AC2/AC3,
 * design.md § R5). Função PURA: recebe as mensagens já ordenadas
 * cronologicamente pela DAL (`getMessages` — `sentAt ASC, id`) e devolve a
 * estrutura que a UI renderiza, sem nenhuma decisão de layout inline no
 * componente.
 *
 * Duas regras, ambas da spec:
 *
 * - **RD-06 AC3** — cada limite de dia abre um novo bloco, que a UI separa com
 *   um `ChatSystemMessage variant="divider"`. O dia é o dia de calendário
 *   LOCAL do runtime (mesma leitura que o usuário faz do relógio), não o dia
 *   UTC do ISO.
 * - **RD-06 AC2** — mensagens consecutivas do mesmo remetente formam um grupo
 *   multi-bolha (`group` = first/middle/last). Uma mensagem sozinha no grupo
 *   fica sem `group`, ou seja, com o raio completo da bolha isolada.
 *
 * Um limite de dia SEMPRE encerra o grupo corrente: duas mensagens seguidas do
 * mesmo remetente em dias diferentes ficam em blocos diferentes, porque o
 * divisor de data as separa visualmente.
 */

export type ChatSender = "lead" | "agente";

/** Mensagem já serializada para atravessar a fronteira RSC→client (AD-007). */
export interface ChatThreadMessageInput {
  id: string;
  sender: ChatSender;
  content: string;
  /** ISO 8601. */
  sentAt: string;
}

export type ChatBubbleGroup = "first" | "middle" | "last";

export interface ChatThreadBubble {
  id: string;
  content: string;
  sentAt: string;
  /** `undefined` = bolha isolada (raio completo). */
  group?: ChatBubbleGroup;
}

export interface ChatThreadGroup {
  /** Id da primeira mensagem do grupo — chave estável de render. */
  key: string;
  sender: ChatSender;
  bubbles: ChatThreadBubble[];
}

export interface ChatThreadDay {
  /** `YYYY-MM-DD` no calendário local. */
  key: string;
  /** ISO da primeira mensagem do dia — valor exibido no divisor de data. */
  dividerAt: string;
  groups: ChatThreadGroup[];
}

function localDayKey(sentAt: string): string {
  const date = new Date(sentAt);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function withBubbleGroups(messages: ChatThreadMessageInput[]): ChatThreadBubble[] {
  return messages.map((message, index) => {
    const bubble: ChatThreadBubble = {
      id: message.id,
      content: message.content,
      sentAt: message.sentAt,
    };
    if (messages.length === 1) return bubble;
    if (index === 0) return { ...bubble, group: "first" };
    if (index === messages.length - 1) return { ...bubble, group: "last" };
    return { ...bubble, group: "middle" };
  });
}

export function buildChatThread(
  messages: ChatThreadMessageInput[]
): ChatThreadDay[] {
  const days: ChatThreadDay[] = [];
  // Buffer do grupo corrente: só vira `ChatThreadGroup` quando fecha (troca de
  // remetente, virada de dia ou fim da thread), porque as posições
  // first/middle/last só existem depois que o grupo inteiro é conhecido.
  let pending: ChatThreadMessageInput[] = [];

  function flushGroup() {
    if (pending.length === 0) return;
    days[days.length - 1].groups.push({
      key: pending[0].id,
      sender: pending[0].sender,
      bubbles: withBubbleGroups(pending),
    });
    pending = [];
  }

  for (const message of messages) {
    const dayKey = localDayKey(message.sentAt);
    const currentDay = days[days.length - 1];

    if (!currentDay || currentDay.key !== dayKey) {
      flushGroup();
      days.push({ key: dayKey, dividerAt: message.sentAt, groups: [] });
    } else if (pending.length > 0 && pending[0].sender !== message.sender) {
      flushGroup();
    }

    pending.push(message);
  }

  flushGroup();
  return days;
}
