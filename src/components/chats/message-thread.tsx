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
import { buildChatThread } from "../../lib/chat-thread";
import type { Message } from "@/src/server/data";
import type { MessagePricingView } from "../../server/data/whatsapp";
import { Text } from "@astryxdesign/core/Text";
import { MessagePricing } from "./message-pricing";

interface MessageThreadProps {
  messages: Message[];
  /** `null` quando a classificação por entrega está desligada. */
  pricingViews?: MessagePricingView[] | null;
  /** Nome do lead — rótulo e avatar das bolhas ghost à esquerda. */
  leadName: string;
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * Thread de uma conversa (lote-3 — CHAT-01): `messages` já chega ordenado
 * `sentAt ASC, id` (T3 — ordem cronológica de leitura). O campo de envio do
 * lote-14 vive fora deste componente (`HumanComposer`).
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
  pricingViews = null,
  leadName,
  emptyTitle,
  emptyDescription,
}: MessageThreadProps) {
  if (messages.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  // null = classificação desligada (status ainda não chegam ao CRM): as bolhas
  // de saída mantêm só o horário, como antes do L14b.
  const pricingByMessage = pricingViews
    ? new Map(pricingViews.map((pricing) => [pricing.messageId, pricing]))
    : null;

  const days = buildChatThread(
    messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      content: message.content,
      sentAt: message.sentAt.toISOString(),
      authorName: message.authorName,
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
            // Lote-14 (THREAD-01 AC1/AC7): o humano também fica à direita,
            // com bolha filled, mas com avatar e nome do autor gravados na
            // mensagem. Avatar e nome são o que distinguem a fala humana da
            // do agente.
            const isLead = group.sender === "lead";
            const isHuman = group.sender === "humano";
            const authorName = group.authorName ?? "Equipe";
            const lastIndex = group.bubbles.length - 1;

            return (
              <ChatMessage
                key={group.key}
                sender={isLead ? "assistant" : "user"}
                avatar={
                  isLead ? (
                    <Avatar name={leadName} size="sm" />
                  ) : isHuman ? (
                    <Avatar name={authorName} size="sm" />
                  ) : undefined
                }
              >
                {group.bubbles.map((bubble, index) => (
                  <ChatMessageBubble
                    key={bubble.id}
                    variant={isLead ? "ghost" : "filled"}
                    group={bubble.group}
                    name={
                      index === 0 && (isLead || isHuman) ? (
                        <Text type="supporting" weight="semibold" color="secondary">
                          {isLead ? leadName : authorName}
                        </Text>
                      ) : undefined
                    }
                    metadata={
                      !isLead && pricingByMessage ? (
                        <MessagePricing
                          sender={group.sender}
                          pricing={pricingByMessage.get(bubble.id)}
                          timestamp={
                            index === lastIndex ? (
                              <Timestamp value={bubble.sentAt} format="time" />
                            ) : undefined
                          }
                        />
                      ) : index === lastIndex ? (
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
