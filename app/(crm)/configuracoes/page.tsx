import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { getTenant } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

export default async function ConfiguracoesPage() {
  const tenantId = await getActiveTenantId();
  const tenant = await getTenant(tenantId);

  return (
    <VStack gap={4}>
      <Heading level={1}>Configurações</Heading>
      <Text type="body">Imobiliária ativa: {tenant?.name ?? "—"}</Text>
    </VStack>
  );
}
