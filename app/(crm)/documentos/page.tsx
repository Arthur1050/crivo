import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { describeBenchmarkNotice } from "@/src/components/documents/benchmark-notice";
import { CategoryManagerDialog } from "@/src/components/documents/category-manager-dialog";
import { DocumentProcessingRefresh } from "@/src/components/documents/document-processing-refresh";
import { DocumentsBrowser } from "@/src/components/documents/documents-browser";
import { DocumentsToolbar } from "@/src/components/documents/documents-toolbar";
import { clearFiltersHref, folderFilterFor, resolveDocumentsPageMode } from "@/src/components/documents/documents-page-state";
import { FolderHeader } from "@/src/components/documents/folder-header";
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
  const pageHeader = (
    <VStack gap={1}>
      <Heading level={1}>Documentos de Contexto</Heading>
      <Text type="body" color="secondary">
        Arquivos usados pelo agente {tenant?.agentName} para responder com
        precisão nas conversas
      </Text>
    </VStack>
  );

  if (mode.kind === "pasta-inexistente") {
    return (
      <VStack gap={6}>
        {pageHeader}
        <EmptyState
          title="Pasta não encontrada"
          description="Esta pasta não existe ou foi excluída."
          actions={<NavLink href="/documentos" isStandalone>Voltar para Documentos</NavLink>}
        />
      </VStack>
    );
  }

  return (
    <VStack gap={6}>
      <HStack vAlign="end" gap={4} wrap="wrap">
        <StackItem size="fill">
          {pageHeader}
        </StackItem>
        {canWrite && (
          <HStack gap={2} wrap="wrap">
            {mode.kind === "raiz" && <CreateFolderDialog />}
            <CategoryManagerDialog categories={categories} />
            <UploadDialog categories={categories} folder={mode.kind === "pasta" ? mode.folder : undefined} />
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

      {mode.kind === "raiz" ? (
        <FoldersGrid folders={folderItems} canWrite={canWrite} createAction={<CreateFolderDialog />} />
      ) : (
        <FolderHeader
          folder={{ ...mode.folder, fileCount: summaries.find((item) => item.id === mode.folder.id)?.fileCount ?? 0 }}
          canWrite={canWrite}
        />
      )}

      {(hasAnyDocuments || mode.kind === "pasta") && (
        <DocumentsToolbar categories={categories} showFolderFilter={mode.kind === "raiz"} />
      )}

      <DocumentsBrowser
        documents={filteredDocuments}
        categories={categories}
        canWrite={canWrite}
        folders={folderOptions}
        heading={mode.kind === "pasta" ? <Heading level={2}>{mode.folder.name}</Heading> : undefined}
        emptyState={
          mode.kind === "pasta" && !hasActiveFilters ? (
            <EmptyState
              title="Esta pasta está vazia"
              description={canWrite ? "Envie um arquivo ou mova documentos para cá." : "Nenhum arquivo nesta pasta."}
            />
          ) : mode.kind === "raiz" && !hasAnyDocuments ? (
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
                  <NavLink href={clearFiltersHref(mode)} isStandalone>
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
