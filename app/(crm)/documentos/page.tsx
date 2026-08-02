import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading } from "@astryxdesign/core/Text";
import { CategoryManagerDialog } from "@/src/components/documents/category-manager-dialog";
import { DocumentsTable } from "@/src/components/documents/documents-table";
import { DocumentsToolbar } from "@/src/components/documents/documents-toolbar";
import { UploadDialog } from "@/src/components/documents/upload-dialog";
import { NavLink } from "@/src/components/shared/nav-link";
import { getDocumentCategories, getDocuments, type Modality } from "@/src/server/data";
import { getActiveTenantId } from "@/src/server/tenant";

const VALID_MODALITIES: readonly string[] = ["novo", "usado", "ambos"];

function asModality(value: string | undefined): Modality | undefined {
  return value && VALID_MODALITIES.includes(value) ? (value as Modality) : undefined;
}

interface DocumentosPageProps {
  searchParams: Promise<{
    modalidade?: string;
    categoria?: string;
    q?: string;
  }>;
}

/**
 * Listagem de documentos do tenant ativo (lote-2 — DOC-01): o RSC lê
 * `searchParams` (modalidade/categoria/q) e consulta o banco já filtrado via
 * `getActiveTenantId()`. Duas condições de vazio são distintas: tenant sem
 * nenhum documento vs. filtro/busca sem resultado.
 */
export default async function DocumentosPage({
  searchParams,
}: DocumentosPageProps) {
  const params = await searchParams;
  const tenantId = await getActiveTenantId();

  const modality = asModality(params.modalidade);
  const categoryId = params.categoria || undefined;
  const search = params.q?.trim() || undefined;
  const hasActiveFilters = Boolean(modality || categoryId || search);

  const [allDocuments, filteredDocuments, categories] = await Promise.all([
    getDocuments(tenantId),
    getDocuments(tenantId, { modality, categoryId, search }),
    getDocumentCategories(tenantId),
  ]);

  const hasAnyDocuments = allDocuments.length > 0;

  return (
    <VStack gap={6}>
      <HStack vAlign="center">
        <StackItem size="fill">
          <Heading level={1}>Documentos</Heading>
        </StackItem>
        <HStack gap={2}>
          <CategoryManagerDialog categories={categories} />
          <UploadDialog categories={categories} />
        </HStack>
      </HStack>

      {hasAnyDocuments && <DocumentsToolbar categories={categories} />}

      {!hasAnyDocuments ? (
        <EmptyState
          title="Nenhum documento ainda"
          description="Documentos de contexto desta imobiliária aparecerão aqui."
        />
      ) : filteredDocuments.length === 0 ? (
        <EmptyState
          title="Nenhum resultado encontrado"
          description="Ajuste os filtros ou o termo de busca para ver mais documentos."
          actions={
            hasActiveFilters ? (
              <NavLink href="/documentos" isStandalone>
                Limpar filtros
              </NavLink>
            ) : undefined
          }
        />
      ) : (
        <DocumentsTable documents={filteredDocuments} categories={categories} />
      )}
    </VStack>
  );
}
