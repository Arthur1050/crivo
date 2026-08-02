import { ChatMessage, ChatMessageBubble, ChatMessageList } from "@astryxdesign/core/Chat";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import type { Message } from "@/src/server/data";

interface MessageThreadProps {
  messages: Message[];
  emptyTitle: string;
  emptyDescription: string;
}

/**
 * Thread somente leitura de uma conversa (lote-3 — CHAT-01): `messages` já
 * chega ordenado `sentAt ASC, id` (T3 — ordem cronológica de leitura). Sem
 * `ChatComposer` — a tela nunca oferece campo de envio (spec.md — CHAT-01.6).
 * Bolhas distintas por remetente: `agente` renderiza como `assistant`
 * (ghost, alinhado à esquerda), `lead` como `user` (preenchido, à direita).
 */
export function MessageThread({
  messages,
  emptyTitle,
  emptyDescription,
}: MessageThreadProps) {
  if (messages.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ChatMessageList>
      {messages.map((message) => (
        <ChatMessage
          key={message.id}
          sender={message.sender === "agente" ? "assistant" : "user"}
        >
          <ChatMessageBubble
            variant={message.sender === "agente" ? "ghost" : "filled"}
            metadata={
              <Timestamp value={message.sentAt.toISOString()} format="time" />
            }
          >
            {message.content}
          </ChatMessageBubble>
        </ChatMessage>
      ))}
    </ChatMessageList>
  );
}
