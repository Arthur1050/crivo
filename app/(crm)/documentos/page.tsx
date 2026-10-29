import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { describeBenchmarkNotice } from "@/src/components/documents/benchmark-notice";
import { CategoryManagerDialog } from "@/src/components/documents/category-manager-dialog";
import { DocumentProcessingRefresh } from "@/src/components/documents/document-processing-refresh";
import { DocumentsBrowser } from "@/src/components/documents/documents-browser";
import { DocumentsToolbar } from "@/src/components/documents/documents-toolbar";
import { folderFilterFor, resolveDocumentsPageMode } from "@/src/components/documents/documents-page-state";
import { CreateFolderDialog } from "@/src/components/documents/folder-name-dialog";
import { FoldersGrid } from "@/src/components/documents/folders-grid";
import { toFolderCardItems } from "@/src/components/documents/folder-presentation";
import { UploadDialog } from "@/src/components/documents/upload-dialog";
import { NavLink } from "@/src/components/shared/nav-link";
import { can } from "@/src/lib/permissions";
import { parseFolderParam } from "@/src/lib/document-folders";
import { requirePermission } from "@/src/server/auth/session";
import {
  getDocumentCategories,
  getDocuments,
  getTenant,
  type Modality,
} from "@/src/server/data";
import { getTenantContextLimitSummary } from "@/src/server/documents/repository";
import { getDocumentFolder, listDocumentFolderSummaries } from "@/src/server/data/document-folders";
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
    pasta?: string;
  }>;
}

/**
 * Listagem de documentos do tenant ativo (lote-2 — DOC-01): o RSC lê
 * `searchParams` (modalidade/categoria/q) e consulta o banco já filtrado via
 * `getActiveTenantId()`. Duas condições de vazio são distintas: tenant sem
 * nenhum documento vs. filtro/busca sem resultado.
 *
 * Composta como gerenciador de arquivos: cabeçalho com ações, busca com o
 * menu "Filtrar e ordenar", pastas e arquivos em grade ou lista.
 */
export default async function DocumentosPage({
  searchParams,
}: DocumentosPageProps) {
  const params = await searchParams;
  const tenantId = await getActiveTenantId();
  // A leitura da página é exigida de fato; a visibilidade de escrita é só
  // conveniência de interface — cada action e rota revalida permissão e tenant
  // por conta própria, e segue sendo a autoridade.
  const { roles } = await requirePermission("documentos", "ler");
  const canWrite = can(roles, "documentos", "escrever");

  const modality = asModality(params.modalidade);
  const categoryId = params.categoria || undefined;
  const search = params.q?.trim() || undefined;
  const folderParam = parseFolderParam(params.pasta);
  const folder = folderParam.kind === "pasta"
    ? await getDocumentFolder(tenantId, folderParam.folderId)
    : null;
  const mode = resolveDocumentsPageMode(folderParam, folder);
  const hasActiveFilters = Boolean(modality || categoryId || search || folderParam.kind === "sem-pasta");

  const [allDocuments, filteredDocuments, categories, tenant, limitSummary, summaries] =
    await Promise.all([
      getDocuments(tenantId),
      mode.kind === "pasta-inexistente"
        ? Promise.resolve([])
        : getDocuments(tenantId, { modality, categoryId, search, folder: folderFilterFor(mode) }),
      getDocumentCategories(tenantId),
      getTenant(tenantId),
      getTenantContextLimitSummary(tenantId),
      listDocumentFolderSummaries(tenantId),
    ]);
  const now = new Date();
  const folderItems = toFolderCardItems(summaries, now);
  const folderOptions = summaries.map(({ id, name }) => ({ id, name }));

  const hasAnyDocuments = allDocuments.length > 0;
  // O polling só existe enquanto alguma extração está em curso, e a decisão é
  // do servidor: a ilha cliente nem monta quando não há o que observar.
  const hasProcessingDocuments = allDocuments.some(
    (document) => document.status === "processando"
  );
  const benchmarkNotice = describeBenchmarkNotice(limitSummary, canWrite);

  return (
    <VStack gap={6}>
      <HStack vAlign="end" gap={4} wrap="wrap">
        <StackItem size="fill">
          <VStack gap={1}>
            <Heading level={1}>Documentos de Contexto</Heading>
            <Text type="body" color="secondary">
              Arquivos usados pelo agente {tenant?.agentName} para responder com
              precisão nas conversas
            </Text>
          </VStack>
        </StackItem>
        {canWrite && (
          <HStack gap={2} wrap="wrap">
            <CreateFolderDialog />
            <CategoryManagerDialog categories={categories} />
            <UploadDialog categories={categories} />
          </HStack>
        )}
      </HStack>

      {benchmarkNotice && (
        <Banner
          status={benchmarkNotice.status}
          title={benchmarkNotice.title}
          description={benchmarkNotice.description}
        />
      )}

      {hasProcessingDocuments && (
        <DocumentProcessingRefresh hasProcessingDocuments={hasProcessingDocuments} />
      )}

      <FoldersGrid folders={folderItems} canWrite={canWrite} createAction={<CreateFolderDialog />} />

      {hasAnyDocuments && <DocumentsToolbar categories={categories} showFolderFilter />}

      <DocumentsBrowser
        documents={filteredDocuments}
        categories={categories}
        canWrite={canWrite}
        folders={folderOptions}
        emptyState={
          !hasAnyDocuments ? (
            <EmptyState
              title="Nenhum documento ainda"
              description="Documentos de contexto desta imobiliária aparecerão aqui."
            />
          ) : (
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
          )
        }
      />
    </VStack>
  );
}
