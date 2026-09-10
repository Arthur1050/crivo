import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { PropertiesToolbar } from "@/src/components/properties/properties-toolbar";
import {
  PropertiesView,
  type PropertiesEmptyState,
} from "@/src/components/properties/properties-view";
import { can } from "@/src/lib/permissions";
import {
  getProperties,
  getTenantMembers,
  type Modality,
  type PropertyKind,
  type PropertyStatus,
} from "@/src/server/data";
import { verifySession } from "@/src/server/auth/session";
import { getActiveTenantId } from "@/src/server/tenant";

const VALID_STATUSES: readonly string[] = ["disponivel", "reservado", "vendido"];
const VALID_KINDS: readonly string[] = [
  "casa",
  "apartamento",
  "sobrado",
  "cobertura",
  "terreno",
  "sala_comercial",
  "chacara",
];
const VALID_MODALITIES: readonly string[] = ["novo", "usado", "ambos"];

function asStatus(value: string | undefined): PropertyStatus | undefined {
  return value && VALID_STATUSES.includes(value) ? (value as PropertyStatus) : undefined;
}

function asKind(value: string | undefined): PropertyKind | undefined {
  return value && VALID_KINDS.includes(value) ? (value as PropertyKind) : undefined;
}

function asModality(value: string | undefined): Modality | undefined {
  return value && VALID_MODALITIES.includes(value) ? (value as Modality) : undefined;
}

function asPublished(value: string | undefined): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

interface ImoveisPageProps {
  searchParams: Promise<{
    status?: string;
    publicado?: string;
    tipo?: string;
    modalidade?: string;
    q?: string;
  }>;
}

/**
 * Catálogo de imóveis do tenant ativo (lote-11 — IMOV-01/04). Molde direto de
 * `app/(crm)/documentos/page.tsx`: o RSC lê `searchParams` e consulta o banco
 * duas vezes (tudo × filtrado) para distinguir "nenhum imóvel cadastrado" de
 * "nenhum imóvel casa com o filtro atual" (Edge Case da spec). `canWrite` vem
 * da matriz de permissões (`can`) sobre os papéis do vínculo ATIVO da sessão
 * — os controles de escrita só chegam ao client quando verdadeiro; a recusa
 * de verdade é sempre do servidor, nas próprias actions (IMOV-04 AC3).
 */
export default async function ImoveisPage({ searchParams }: ImoveisPageProps) {
  const params = await searchParams;
  const tenantId = await getActiveTenantId();
  const { roles } = await verifySession();
  const canWrite = can(roles, "imoveis", "escrever");

  const status = asStatus(params.status);
  const published = asPublished(params.publicado);
  const kind = asKind(params.tipo);
  const modality = asModality(params.modalidade);
  const search = params.q?.trim() || undefined;
  const hasActiveFilters = Boolean(
    status || published !== undefined || kind || modality || search
  );

  const [allProperties, filteredProperties, members] = await Promise.all([
    getProperties(tenantId),
    getProperties(tenantId, { status, published, kind, modality, search }),
    getTenantMembers(tenantId),
  ]);

  const hasAnyProperties = allProperties.length > 0;

  // IMOV-02 AC4: o seletor de captador do diálogo só lista membros ATIVOS
  // da imobiliária — o mesmo corte de `isActiveMemberOf`.
  const captadores = members
    .filter((member) => member.deactivatedAt === null)
    .map((member) => ({ id: member.userId, name: member.name }));

  const emptyState: PropertiesEmptyState | null = !hasAnyProperties
    ? {
        title: "Nenhum imóvel cadastrado",
        description: "Imóveis cadastrados por esta imobiliária aparecerão aqui.",
        showClearFilters: false,
      }
    : filteredProperties.length === 0
      ? {
          title: "Nenhum resultado encontrado",
          description: "Ajuste os filtros ou o termo de busca para ver mais imóveis.",
          showClearFilters: hasActiveFilters,
        }
      : null;

  return (
    <VStack gap={6}>
      <HStack vAlign="start" gap={4} wrap="wrap">
        <StackItem size="fill">
          <VStack gap={1}>
            <Heading level={1}>Catálogo de Imóveis</Heading>
            <Text type="body" color="secondary">
              Inventário desta imobiliária, usado pelo agente para responder ao lead com
              dado exato em vez de inventar
            </Text>
          </VStack>
        </StackItem>
      </HStack>

      {hasAnyProperties && <PropertiesToolbar />}

      <PropertiesView
        properties={filteredProperties}
        captadores={captadores}
        canWrite={canWrite}
        emptyState={emptyState}
      />
    </VStack>
  );
}
