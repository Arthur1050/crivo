import { Heading } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/Stack";
import { PipelineBoard } from "@/src/components/pipeline/pipeline-board";
import { getLeads } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

/**
 * Kanban de leads do tenant ativo (lote-3 — PIPE-01). RSC carrega `getLeads`
 * (já ordenado `updatedAt DESC, id` — T3) e entrega ao `PipelineBoard`
 * client, que agrupa por status.
 */
export default async function PipelinePage() {
  const tenantId = await getActiveTenantId();
  const leads = await getLeads(tenantId);

  return (
    <VStack gap={6}>
      <Heading level={1}>Pipeline</Heading>
      <PipelineBoard leads={leads} />
    </VStack>
  );
}
