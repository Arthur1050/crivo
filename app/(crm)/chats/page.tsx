import { Avatar } from "@astryxdesign/core/Avatar";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
} from "@astryxdesign/core/Layout";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
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
 *
 * Layout com cabeçalhos fixos e rolagem própria (lote-6b — UI-01,
 * design.md § R1): `Layout height="fill"` + `LayoutHeader` (título da
 * página) + `LayoutPanel isScrollable` (lista de conversas) + `LayoutContent`
 * com um `StackItem size="fill" isScrollable` só ao redor da thread —
 * cabeçalho da página, cabeçalho do lead e lista de conversas ficam
 * estáticos mesmo com uma conversa longa rolada até o fim.
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
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={1}>
            <Heading level={1}>Chats</Heading>
            <Text type="body" color="secondary">
              {summaries.length === 1
                ? `1 conversa conduzida pelo agente ${tenant?.agentName ?? "SDR"} no WhatsApp`
                : `${summaries.length} conversas conduzidas pelo agente ${tenant?.agentName ?? "SDR"} no WhatsApp`}
            </Text>
          </VStack>
        </LayoutHeader>
      }
      start={
        <LayoutPanel width={320} hasDivider isScrollable label="Conversas">
          <ConversationList
            summaries={summaries}
            selectedConversationId={selectedSummary?.id}
          />
        </LayoutPanel>
      }
      content={
        !selectedSummary ? (
          <LayoutContent>
            <EmptyState
              title="Selecione uma conversa"
              description="Escolha uma conversa na lista ao lado para ver o histórico completo."
            />
          </LayoutContent>
        ) : (
          <LayoutContent isScrollable={false} padding={0}>
            <VStack height="100%" gap={0}>
              {/* Cabeçalho da thread (RD-06 AC4, design.md § R5) — estático. */}
              <HStack gap={3} vAlign="center" padding={4}>
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
              <StackItem size="fill" isScrollable>
                <VStack padding={4} height="100%">
                  <MessageThread
                    messages={messages}
                    leadName={selectedSummary.leadName || "Lead"}
                    emptyTitle="Nenhuma mensagem ainda"
                    emptyDescription="Esta conversa ainda não tem mensagens registradas."
                  />
                </VStack>
              </StackItem>
            </VStack>
          </LayoutContent>
        )
      }
    />
  );
}
