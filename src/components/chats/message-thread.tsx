import { Fragment } from "react";
import { Avatar } from "@astryxdesign/core/Avatar";
import {
  ChatMessage,
  ChatMessageBubble,
  ChatMessageList,
  ChatMessageMetadata,
  ChatSystemMessage,
} from "@astryxdesign/core/Chat";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { buildChatThread } from "@/src/lib/chat-thread";
import type { Message } from "@/src/server/data";

interface MessageThreadProps {
  messages: Message[];
  /** Nome do lead — rótulo e avatar das bolhas ghost à esquerda. */
  leadName: string;
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * Thread somente leitura de uma conversa (lote-3 — CHAT-01): `messages` já
 * chega ordenado `sentAt ASC, id` (T3 — ordem cronológica de leitura). Sem
 * `ChatComposer` — a tela nunca oferece campo de envio (spec.md — CHAT-01.6).
 *
 * Recomposta em redesign-crm-astryx (RD-06 AC2/AC3, design.md § R5) e
 * invertida em lote-6b (UI-01, design.md § R1): as mensagens do agente
 * espelham o WhatsApp e ficam à direita (`sender="user"`, bolha filled, sem
 * avatar — o agente já está identificado no cabeçalho da conversa); as do
 * lead ficam à esquerda (`sender="assistant"`, bolha ghost, com avatar + nome
 * do lead). `buildChatThread` (puro e testado em `src/lib`) decide o
 * agrupamento por dia e por remetente e não muda com o lado das bolhas — este
 * componente só traduz o resultado para a família Chat da Astryx.
 */
export function MessageThread({
  messages,
  leadName,
  emptyTitle,
  emptyDescription,
}: MessageThreadProps) {
  if (messages.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  const days = buildChatThread(
    messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      content: message.content,
      sentAt: message.sentAt.toISOString(),
    }))
  );

  return (
    <ChatMessageList density="compact">
      {days.map((day) => (
        <Fragment key={day.key}>
          <ChatSystemMessage variant="divider">
            <Timestamp value={day.dividerAt} format="date_weekday" />
          </ChatSystemMessage>

          {day.groups.map((group) => {
            // UI-01 AC1: agente à direita (`user`, filled, sem avatar — já
            // identificado no cabeçalho da conversa); lead à esquerda
            // (`assistant`, ghost, avatar + nome do lead).
            const isLead = group.sender === "lead";
            const lastIndex = group.bubbles.length - 1;

            return (
              <ChatMessage
                key={group.key}
                sender={isLead ? "assistant" : "user"}
                avatar={
                  isLead ? <Avatar name={leadName} size="sm" /> : undefined
                }
              >
                {group.bubbles.map((bubble, index) => (
                  <ChatMessageBubble
                    key={bubble.id}
                    variant={isLead ? "ghost" : "filled"}
                    group={bubble.group}
                    name={isLead && index === 0 ? leadName : undefined}
                    metadata={
                      index === lastIndex ? (
                        <ChatMessageMetadata
                          timestamp={
                            <Timestamp value={bubble.sentAt} format="time" />
                          }
                        />
                      ) : undefined
                    }
                  >
                    {bubble.content}
                  </ChatMessageBubble>
                ))}
              </ChatMessage>
            );
          })}
        </Fragment>
      ))}
    </ChatMessageList>
  );
}
