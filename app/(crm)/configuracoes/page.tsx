import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Grid } from "@astryxdesign/core/Grid";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { FileTextIcon } from "@/src/components/icons/file-text";
import { NavLink } from "@/src/components/shared/nav-link";
import { SettingsForm } from "@/src/components/settings/settings-form";
import { getDocumentSample, getTenant, type Modality } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

const MODALITY_LABELS: Record<Modality, string> = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
};

/**
 * Tela de Configurações do tenant ativo (lote-2 — CONF-01 a CONF-04): edição
 * de nome/agente/modalidade e uma amostra dos documentos (5 mais recentes +
 * contagem por modalidade), sempre resolvida via `getActiveTenantId()`.
 */
export default async function ConfiguracoesPage() {
  const tenantId = await getActiveTenantId();
  const [tenant, sample] = await Promise.all([
    getTenant(tenantId),
    getDocumentSample(tenantId),
  ]);

  if (!tenant) {
    return (
      <EmptyState
        title="Imobiliária não encontrada"
        description="Não foi possível carregar as configurações desta imobiliária."
      />
    );
  }

  return (
    <VStack gap={6}>
      <Heading level={1}>Configurações</Heading>

      {/* Grid 2 colunas em viewport larga, empilhando abaixo de ~420px por
          coluna (lote-3 — UI-02): cada seção é um Card próprio, evitando
          linhas de formulário esticadas na largura total do conteúdo. */}
      <Grid columns={{ minWidth: 420, max: 2 }} gap={6} align="start">
        <Card>
          <VStack gap={4}>
            <VStack gap={1}>
              <Heading level={3}>Imobiliária</Heading>
              <Text type="supporting" color="secondary">
                Nome, agente e modalidade suportada por esta imobiliária.
              </Text>
            </VStack>
            <SettingsForm tenant={tenant} />
          </VStack>
        </Card>

        <Card>
          <VStack gap={4}>
            <HStack vAlign="center">
              <StackItem size="fill">
                <Heading level={3}>Documentos</Heading>
              </StackItem>
              <HStack gap={1} vAlign="center">
                <FileTextIcon size={16} />
                <NavLink href="/documentos">Ver todos</NavLink>
              </HStack>
            </HStack>

            {sample.recent.length === 0 ? (
              <EmptyState
                title="Nenhum documento ainda"
                description="Envie documentos de contexto para o agente desta imobiliária."
                actions={
                  <NavLink href="/documentos" isStandalone>
                    Ir para Documentos
                  </NavLink>
                }
              />
            ) : (
              <VStack gap={4}>
                <HStack gap={6}>
                  {(Object.keys(MODALITY_LABELS) as Modality[]).map((modality) => (
                    <Text key={modality} type="supporting" color="secondary">
                      {MODALITY_LABELS[modality]}: {sample.countsByModality[modality]}
                    </Text>
                  ))}
                </HStack>

                <List density="balanced">
                  {sample.recent.map((document) => (
                    <ListItem
                      key={document.id}
                      label={document.name}
                      description={MODALITY_LABELS[document.modality]}
                      endContent={
                        <Timestamp
                          value={document.uploadedAt.toISOString()}
                          format="date"
                        />
                      }
                    />
                  ))}
                </List>
              </VStack>
            )}
          </VStack>
        </Card>
      </Grid>
    </VStack>
  );
}
