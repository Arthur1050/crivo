import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { getDocuments, getTenant } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

export default async function DocumentosPage() {
  const tenantId = await getActiveTenantId();
  const [tenant, documents] = await Promise.all([
    getTenant(tenantId),
    getDocuments(tenantId),
  ]);

  return (
    <VStack gap={4}>
      <Heading level={1}>Documentos</Heading>
      <Text type="body">Imobiliária ativa: {tenant?.name ?? "—"}</Text>
      {documents.length === 0 ? (
        <EmptyState
          title="Nenhum documento ainda"
          description="Documentos de contexto desta imobiliária aparecerão aqui."
        />
      ) : (
        <Text type="body">{documents.length} documentos cadastrados</Text>
      )}
    </VStack>
  );
}
