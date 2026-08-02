import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { getConversations, getTenant } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

export default async function ChatsPage() {
  const tenantId = await getActiveTenantId();
  const [tenant, conversations] = await Promise.all([
    getTenant(tenantId),
    getConversations(tenantId),
  ]);

  return (
    <VStack gap={4}>
      <Heading level={1}>Chats</Heading>
      <Text type="body">Imobiliária ativa: {tenant?.name ?? "—"}</Text>
      {conversations.length === 0 ? (
        <EmptyState
          title="Nenhuma conversa ainda"
          description="Conversas com leads desta imobiliária aparecerão aqui."
        />
      ) : (
        <Text type="body">{conversations.length} conversas</Text>
      )}
    </VStack>
  );
}
