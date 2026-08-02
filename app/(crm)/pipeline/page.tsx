import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/Stack";
import { PipelineBoard } from "@/src/components/pipeline/pipeline-board";
import { getConversations, getLeads } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

/**
 * Kanban de leads do tenant ativo (lote-3 — PIPE-01). RSC carrega `getLeads`
 * (já ordenado `updatedAt DESC, id` — T3) e entrega ao `PipelineBoard`
 * client, que agrupa por status. Também carrega `getConversations` para
 * montar o mapa `leadId → conversationId` do link cruzado "Ver conversa"
 * (lote-3 — PIPE-04): um objeto simples (não um `Map`) para atravessar a
 * fronteira RSC→client como prop serializável comum.
 */
export default async function PipelinePage() {
  const tenantId = await getActiveTenantId();
  const [leads, conversations] = await Promise.all([
    getLeads(tenantId),
    getConversations(tenantId),
  ]);

  const conversationIdByLeadId = Object.fromEntries(
    conversations.map((conversation) => [conversation.leadId, conversation.id])
  );

  return (
    <VStack gap={6}>
      <Heading level={1}>Pipeline</Heading>
      <PipelineBoard
        leads={leads}
        conversationIdByLeadId={conversationIdByLeadId}
      />
    </VStack>
  );
}
