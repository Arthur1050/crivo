import { Avatar } from "@astryxdesign/core/Avatar";
import { Banner } from "@astryxdesign/core/Banner";
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
import { ChatRefresh } from "@/src/components/chats/chat-refresh";
import { ConversationHeader } from "@/src/components/chats/conversation-header";
import { ConversationList } from "@/src/components/chats/conversation-list";
import { HumanComposer } from "@/src/components/chats/human-composer";
import { MessageThread } from "@/src/components/chats/message-thread";
import {
  conversationControls,
  optOutNotice,
  whatsappWindow,
  windowClosedNotice,
  windowOpenLabel,
} from "@/src/lib/conversation-control";
import { can } from "@/src/lib/permissions";
import {
  getConversationSummaries,
  getLastLeadMessageAt,
  getLead,
  getMessages,
  getTenant,
  getTenantMembers,
} from "@/src/server/data";
import { getLeadScope, verifySession } from "@/src/server/auth/session";
import { getActiveTenantId } from "@/src/server/tenant";
import { getMessageClassifications } from "@/src/server/data/whatsapp";

interface ChatsPageProps {
  searchParams: Promise<{ conversa?: string }>;
}

/**
 * Conversas do tenant ativo (lote-3 — CHAT-01). A partir do lote-14, a
 * equipe assume, responde, devolve e registra opt-out pela tela; janela de
 * 24h e controles são calculados aqui, no servidor (design.md C6). A seleção vive na URL (`?conversa=`, RSC-first — design.md):
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
  // SCOPE-01 AC2: o escopo vem da guarda, nunca um tenantId solto — quem só
  // tem papel corretor enxerga apenas as conversas dos leads dele.
  const scope = await getLeadScope();
  const summaries = await getConversationSummaries(scope);

  const selectedSummary = params.conversa
    ? summaries.find((summary) => summary.id === params.conversa)
    : undefined;

  // `selectedLead` só existe para o cabeçalho da thread (RD-06 AC4 — nome +
  // telefone): `getConversationSummaries` não carrega o telefone, e
  // `getLead` já é tenant-scoped, então nenhuma consulta nova precisa nascer
  // na DAL.
  const session = await verifySession();
  const [messages, selectedLead, tenant, lastLeadMessageAt, pricingViews] = await Promise.all([
    selectedSummary ? getMessages(scope, selectedSummary.id) : [],
    selectedSummary ? getLead(scope, selectedSummary.leadId) : null,
    getTenant(tenantId),
    selectedSummary ? getLastLeadMessageAt(tenantId, selectedSummary.leadId) : null,
    selectedSummary ? getMessageClassifications(session, selectedSummary.id) : [],
  ]);

  // Lote-14 (design.md C6): janela e controles calculados no servidor; o
  // cliente recebe o texto pronto, sem relógio próprio.
  const now = new Date();
  const chatWindow = whatsappWindow(lastLeadMessageAt, now);
  const controls = selectedLead
    ? conversationControls({
        status: selectedLead.status,
        humanTakeoverAt: selectedLead.humanTakeoverAt,
        optedOutAt: selectedLead.optedOutAt,
        canWrite: can(session.roles, "chats", "escrever"),
        window: chatWindow,
      })
    : null;
  const takeoverUser =
    selectedLead?.humanTakeoverBy
      ? (await getTenantMembers(tenantId)).find(
          (member) => member.userId === selectedLead.humanTakeoverBy
        )
      : undefined;
  const agentName = tenant?.agentName ?? "SDR";
  const conductorLabel = !controls
    ? ""
    : controls.conductor === "agente"
      ? `Conduzida pelo agente ${agentName}`
      : controls.conductor === "humano"
        ? `Conduzida por ${takeoverUser?.name ?? "alguém da equipe"}`
        : controls.conductor === "escalado"
          ? "Escalado para humano"
          : "Opt-out registrado";

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={1}>
            <Heading level={1}>Chats</Heading>
            <Text type="body" color="secondary">
              {/* THREAD-01 AC6: conta as conversas sem dizer quem conduz. */}
              {summaries.length === 1
                ? "1 conversa no WhatsApp"
                : `${summaries.length} conversas no WhatsApp`}
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
            <ChatRefresh hasOpenConversation />
            <VStack height="100%" gap={0}>
              {/* Cabeçalho da thread (RD-06 AC4; lote-14 THREAD-01 AC4) — estático. */}
              {controls ? (
                <ConversationHeader
                  leadId={selectedSummary.leadId}
                  leadName={selectedSummary.leadName || "Lead"}
                  phone={selectedLead?.phone ?? null}
                  controls={controls}
                  conductorLabel={conductorLabel}
                />
              ) : (
                <HStack gap={3} vAlign="center" padding={4}>
                  <Avatar name={selectedSummary.leadName || "Lead"} size="md" />
                  <Heading level={3}>{selectedSummary.leadName}</Heading>
                </HStack>
              )}
              <Divider />
              <StackItem size="fill" isScrollable>
                <VStack padding={4} height="100%">
                  <MessageThread
                    messages={messages}
                    pricingViews={pricingViews}
                    leadName={selectedSummary.leadName || "Lead"}
                    emptyTitle="Nenhuma mensagem ainda"
                    emptyDescription="Esta conversa ainda não tem mensagens registradas."
                  />
                </VStack>
              </StackItem>
              {selectedLead?.optedOutAt && (
                <VStack padding={4}>
                  <Banner
                    status="info"
                    title={optOutNotice(selectedLead.optedOutAt)}
                    description="Conversa somente leitura: o lead não recebe mais mensagens."
                  />
                </VStack>
              )}
              {controls && controls.composer !== "oculto" && (
                <VStack padding={4}>
                  <HumanComposer
                    key={selectedSummary.leadId}
                    leadId={selectedSummary.leadId}
                    state={controls.composer}
                    windowLabel={
                      chatWindow.open ? windowOpenLabel(chatWindow.remainingMinutes) : null
                    }
                    closedNotice={windowClosedNotice(chatWindow.closesAt)}
                  />
                </VStack>
              )}
            </VStack>
          </LayoutContent>
        )
      }
    />
  );
}
