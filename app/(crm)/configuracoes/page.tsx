import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { getBrokers, getTenant } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

export default async function ConfiguracoesPage() {
  const tenantId = await getActiveTenantId();
  const [tenant, brokers] = await Promise.all([
    getTenant(tenantId),
    getBrokers(tenantId),
  ]);

  return (
    <VStack gap={4}>
      <Heading level={1}>Configurações</Heading>
      <Text type="body">Imobiliária ativa: {tenant?.name ?? "—"}</Text>
      {brokers.length === 0 ? (
        <EmptyState
          title="Nenhum corretor cadastrado"
          description="Corretores desta imobiliária aparecerão aqui."
        />
      ) : (
        <Text type="body">{brokers.length} corretores cadastrados</Text>
      )}
    </VStack>
  );
}
