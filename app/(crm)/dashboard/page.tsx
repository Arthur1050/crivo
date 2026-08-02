import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { getLeads, getTenant } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

export default async function DashboardPage() {
  const tenantId = await getActiveTenantId();
  const [tenant, leads] = await Promise.all([
    getTenant(tenantId),
    getLeads(tenantId),
  ]);

  return (
    <VStack gap={4}>
      <Heading level={1}>Dashboard</Heading>
      <Text type="body">Imobiliária ativa: {tenant?.name ?? "—"}</Text>
      {leads.length === 0 ? (
        <EmptyState
          title="Sem dados ainda"
          description="Métricas desta imobiliária aparecerão aqui assim que houver leads."
        />
      ) : (
        <Text type="body">{leads.length} leads no total</Text>
      )}
    </VStack>
  );
}
