import { FileTextIcon } from "lucide-react";
import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import { FileTypeIcon } from "@/src/components/documents/file-type-icon";
import { NavLink } from "@/src/components/shared/nav-link";
import { SettingsForm } from "@/src/components/settings/settings-form";
import {
  getDocumentCategories,
  getDocumentSample,
  getTenant,
  type Modality,
} from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

const MODALITY_LABELS: Record<Modality, string> = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
};

// Mesmas cores por modalidade da tabela de Documentos
// (`src/components/documents/documents-table.tsx`) — UI-02 AC4.
const MODALITY_BADGE_VARIANT: Record<Modality, "blue" | "purple" | "teal"> = {
  novo: "blue",
  usado: "purple",
  ambos: "teal",
};

const NO_CATEGORY_LABEL = "Sem categoria";

/**
 * Tela de Configurações do tenant ativo (lote-2 — CONF-01 a CONF-04): edição
 * de nome/agente/modalidade e uma amostra dos documentos (5 mais recentes +
 * contagem por modalidade), sempre resolvida via `getActiveTenantId()`.
 *
 * Recomposta em redesign-crm-astryx (RD-07, design.md § R4): o formulário
 * virou dois cards seccionados (dados da imobiliária e persona do agente),
 * renderizados pelo próprio `SettingsForm` porque compartilham um único
 * estado e um único save; o card "Documentos" permanece, com o mesmo
 * conteúdo e o mesmo link "Ver todos" (RD-07 AC4).
 */
export default async function ConfiguracoesPage() {
  const tenantId = await getActiveTenantId();
  const [tenant, sample, categories] = await Promise.all([
    getTenant(tenantId),
    getDocumentSample(tenantId),
    getDocumentCategories(tenantId),
  ]);
  const categoryById = new Map(
    categories.map((category) => [category.id, category])
  );

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
      <VStack gap={1}>
        <Heading level={1}>Configurações</Heading>
        <Text type="body" color="secondary">
          Gerencie os dados da imobiliária e do agente SDR
        </Text>
      </VStack>

      <SettingsForm tenant={tenant} />

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
              <HStack gap={2}>
                {(Object.keys(MODALITY_LABELS) as Modality[]).map((modality) => (
                  <Badge
                    key={modality}
                    label={`${MODALITY_LABELS[modality]}: ${sample.countsByModality[modality]}`}
                    variant={MODALITY_BADGE_VARIANT[modality]}
                  />
                ))}
              </HStack>

              <List density="balanced">
                {sample.recent.map((document) => {
                  const category = document.categoryId
                    ? (categoryById.get(document.categoryId) ?? null)
                    : null;

                  return (
                    <ListItem
                      key={document.id}
                      label={document.name}
                      startContent={<FileTypeIcon mimeType={document.mimeType} />}
                      description={
                        <HStack gap={2} vAlign="center">
                          {category ? (
                            <Token
                              label={category.name}
                              color={category.color}
                              size="sm"
                            />
                          ) : (
                            <Text type="supporting" color="secondary">
                              {NO_CATEGORY_LABEL}
                            </Text>
                          )}
                          <Text type="supporting" color="secondary">
                            {MODALITY_LABELS[document.modality]}
                          </Text>
                        </HStack>
                      }
                      endContent={
                        <Timestamp
                          value={document.uploadedAt.toISOString()}
                          format="date"
                        />
                      }
                    />
                  );
                })}
              </List>
            </VStack>
          )}
        </VStack>
      </Card>
    </VStack>
  );
}
