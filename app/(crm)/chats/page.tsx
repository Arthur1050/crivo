import { Avatar } from "@astryxdesign/core/Avatar";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Layout, LayoutContent, LayoutPanel } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { ConversationList } from "@/src/components/chats/conversation-list";
import { MessageThread } from "@/src/components/chats/message-thread";
import {
  getConversationSummaries,
  getLead,
  getMessages,
  getTenant,
} from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

interface ChatsPageProps {
  searchParams: Promise<{ conversa?: string }>;
}

/**
 * Visualização somente leitura das conversas do tenant ativo (lote-3 —
 * CHAT-01). A seleção vive na URL (`?conversa=`, RSC-first — design.md):
 * uma conversa que não existe ou pertence a outro tenant simplesmente não é
 * encontrada em `summaries` (já tenant-scoped por `getConversationSummaries`)
 * e cai no mesmo estado neutro de "nenhuma selecionada" — nunca um erro.
 */
export default async function ChatsPage({ searchParams }: ChatsPageProps) {
  const params = await searchParams;
  const tenantId = await getActiveTenantId();
  const summaries = await getConversationSummaries(tenantId);

  const selectedSummary = params.conversa
    ? summaries.find((summary) => summary.id === params.conversa)
    : undefined;

  // `selectedLead` só existe para o cabeçalho da thread (RD-06 AC4 — nome +
  // telefone): `getConversationSummaries` não carrega o telefone, e
  // `getLead` já é tenant-scoped, então nenhuma consulta nova precisa nascer
  // na DAL.
  const [messages, selectedLead, tenant] = await Promise.all([
    selectedSummary ? getMessages(tenantId, selectedSummary.id) : [],
    selectedSummary ? getLead(tenantId, selectedSummary.leadId) : null,
    getTenant(tenantId),
  ]);

  return (
    <VStack gap={6}>
      <Heading level={1}>Chats</Heading>

      <Layout
        height="auto"
        start={
          <LayoutPanel width={320} hasDivider label="Conversas">
            <ConversationList
              summaries={summaries}
              selectedConversationId={selectedSummary?.id}
            />
          </LayoutPanel>
        }
        content={
          <LayoutContent>
            {!selectedSummary ? (
              <EmptyState
                title="Selecione uma conversa"
                description="Escolha uma conversa na lista ao lado para ver o histórico completo."
              />
            ) : (
              <VStack gap={4}>
                {/* Cabeçalho da thread (RD-06 AC4, design.md § R5). */}
                <HStack gap={3} vAlign="center">
                  <Avatar name={selectedSummary.leadName || "Lead"} size="md" />
                  <VStack gap={0.5}>
                    <Heading level={3}>{selectedSummary.leadName}</Heading>
                    {selectedLead?.phone && (
                      <Text type="supporting" color="secondary">
                        {selectedLead.phone}
                      </Text>
                    )}
                  </VStack>
                </HStack>
                <Divider />
                <MessageThread
                  messages={messages}
                  agentName={tenant?.agentName ?? "Agente"}
                  emptyTitle="Nenhuma mensagem ainda"
                  emptyDescription="Esta conversa ainda não tem mensagens registradas."
                />
              </VStack>
            )}
          </LayoutContent>
        }
      />
    </VStack>
  );
}
