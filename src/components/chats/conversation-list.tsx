"use client";

import Link from "next/link";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { LinkProvider } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import type { ConversationSummary } from "@/src/server/data";

interface ConversationListProps {
  summaries: ConversationSummary[];
  selectedConversationId?: string;
}

/**
 * Lista de conversas do tenant ativo (lote-3 — CHAT-01): linhas edge-to-edge
 * (nunca cards), já ordenadas por `getConversationSummaries` (T3 — última
 * mensagem DESC). A seleção é só navegação — `LinkProvider` roteia o `href`
 * de cada `ListItem` pelo `next/link` (mesmo padrão do `Sidebar`), então
 * clicar troca `?conversa=` sem recarregar a página inteira.
 */
export function ConversationList({
  summaries,
  selectedConversationId,
}: ConversationListProps) {
  if (summaries.length === 0) {
    return (
      <EmptyState
        isCompact
        title="Nenhuma conversa ainda"
        description="Conversas com leads desta imobiliária aparecerão aqui."
      />
    );
  }

  return (
    <LinkProvider component={Link}>
      <List density="balanced" hasDividers>
        {summaries.map((summary) => (
          <ListItem
            key={summary.id}
            label={summary.leadName || "Lead"}
            description={summary.lastMessage?.content ?? "Sem mensagens"}
            href={`/chats?conversa=${summary.id}`}
            isSelected={summary.id === selectedConversationId}
            endContent={
              summary.lastMessage ? (
                <Timestamp
                  value={summary.lastMessage.sentAt.toISOString()}
                  format="relative"
                />
              ) : undefined
            }
          />
        ))}
      </List>
    </LinkProvider>
  );
}
