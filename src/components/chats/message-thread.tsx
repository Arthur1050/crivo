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
  /** Nome do agente SDR do tenant — rótulo e avatar das bolhas ghost. */
  agentName: string;
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * Thread somente leitura de uma conversa (lote-3 — CHAT-01): `messages` já
 * chega ordenado `sentAt ASC, id` (T3 — ordem cronológica de leitura). Sem
 * `ChatComposer` — a tela nunca oferece campo de envio (spec.md — CHAT-01.6).
 *
 * Recomposta em redesign-crm-astryx (RD-06 AC2/AC3, design.md § R5): o
 * agrupamento por dia e por remetente é decidido por `buildChatThread` (puro e
 * testado em `src/lib`), e este componente só o traduz para a família Chat da
 * Astryx — divisor de data por bloco, bolha ghost com avatar + nome para o
 * agente (`assistant`) e bolha filled do lado oposto para o lead (`user`),
 * ambas com timestamp na última bolha do grupo.
 */
export function MessageThread({
  messages,
  agentName,
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
            const isAgent = group.sender === "agente";
            const lastIndex = group.bubbles.length - 1;

            return (
              <ChatMessage
                key={group.key}
                sender={isAgent ? "assistant" : "user"}
                avatar={
                  isAgent ? <Avatar name={agentName} size="sm" /> : undefined
                }
              >
                {group.bubbles.map((bubble, index) => (
                  <ChatMessageBubble
                    key={bubble.id}
                    variant={isAgent ? "ghost" : "filled"}
                    group={bubble.group}
                    name={isAgent && index === 0 ? agentName : undefined}
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
