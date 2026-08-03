import { Badge } from "@astryxdesign/core/Badge";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { PipelineBoard } from "@/src/components/pipeline/pipeline-board";
import { getConversations, getLeads, getTenant } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

/**
 * Kanban de leads do tenant ativo (lote-3 — PIPE-01; recomposto em
 * redesign-crm-astryx — RD-03, design.md § R1). RSC carrega `getLeads`
 * (já ordenado `updatedAt DESC, id` — T3, agora com `brokerName`) e entrega
 * ao `PipelineBoard` client, que agrupa por status. Também carrega
 * `getConversations` para montar o mapa `leadId → conversationId` do link
 * cruzado "Ver conversa" (lote-3 — PIPE-04): um objeto simples (não um
 * `Map`) para atravessar a fronteira RSC→client como prop serializável comum.
 */
export default async function PipelinePage() {
  const tenantId = await getActiveTenantId();
  const [leads, conversations, tenant] = await Promise.all([
    getLeads(tenantId),
    getConversations(tenantId),
    getTenant(tenantId),
  ]);

  const conversationIdByLeadId = Object.fromEntries(
    conversations.map((conversation) => [conversation.leadId, conversation.id])
  );

  return (
    <VStack gap={6}>
      <HStack hAlign="between" vAlign="start" gap={4} wrap="wrap">
        <VStack gap={1}>
          <Heading level={1}>Pipeline de Leads</Heading>
          <Text type="body" color="secondary">
            {leads.length} leads ativos — gerados pelo agente{" "}
            {tenant?.agentName} via WhatsApp
          </Text>
        </VStack>
        <Badge
          variant="green"
          icon={<StatusDot variant="success" label="Agente online" />}
          label="Agente online"
        />
      </HStack>

      <PipelineBoard
        leads={leads}
        conversationIdByLeadId={conversationIdByLeadId}
      />
    </VStack>
  );
}
