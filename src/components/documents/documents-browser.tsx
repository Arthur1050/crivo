"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  DownloadIcon,
  EllipsisVerticalIcon,
  EyeIcon,
  LayoutGridIcon,
  ListIcon,
  RefreshCwIcon,
  SquarePenIcon,
  Trash2Icon,
} from "lucide-react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Banner } from "@astryxdesign/core/Banner";
import { DropdownMenu, type DropdownMenuOption } from "@astryxdesign/core/DropdownMenu";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { DocumentPreviewDialog } from "@/src/components/documents/document-preview-dialog";
import type { DocumentTableItem } from "@/src/components/documents/document-presentation";
import {
  deriveDocumentState,
  deriveRowActions,
  documentDownloadPath,
} from "@/src/components/documents/document-row-state";
import { asDocumentSort, sortDocuments } from "@/src/components/documents/document-sort";
import { DocumentsGrid } from "@/src/components/documents/documents-grid";
import { DocumentsTable } from "@/src/components/documents/documents-table";
import { EditDocumentDialog } from "@/src/components/documents/edit-document-dialog";
import { deleteDocumentAction, retryDocumentAction } from "@/src/server/actions/documents";
import type { DocumentCategory } from "@/src/server/data";

type DocumentsView = "grade" | "lista";

interface DocumentsBrowserProps {
  documents: DocumentTableItem[];
  categories: DocumentCategory[];
  /**
   * Reflete `documentos:escrever`. Esconder um botão é conveniência de
   * interface: cada rota e action revalida permissão e tenant por conta
   * própria, então a API segue sendo a autoridade.
   */
  canWrite: boolean;
  /** Mostrado no lugar dos arquivos quando a listagem filtrada vem vazia. */
  emptyState?: ReactNode;
}

/**
 * Seção "Todos os arquivos" de `/documentos`: alterna entre grade e lista
 * (`?visao=lista`), aplica a ordenação (`?ordem=`) e concentra as ações por
 * documento — visualizar, baixar, reprocessar, editar e excluir — com os
 * diálogos correspondentes, para que as duas visões ofereçam o mesmo menu.
 */
export function DocumentsBrowser({
  documents,
  categories,
  canWrite,
  emptyState,
}: DocumentsBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editingDocument, setEditingDocument] = useState<DocumentTableItem | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<DocumentTableItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentTableItem | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const view: DocumentsView = searchParams.get("visao") === "lista" ? "lista" : "grade";
  const sortedDocuments = sortDocuments(documents, asDocumentSort(searchParams.get("ordem")));
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  function handleViewChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "lista") {
      params.set("visao", "lista");
    } else {
      params.delete("visao");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  async function handleConfirmDelete() {
    if (!deletingDocument) return;
    setIsDeleting(true);
    setDeleteError(null);

    const result = await deleteDocumentAction({
      documentId: deletingDocument.id,
    });

    setIsDeleting(false);

    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }

    setDeletingDocument(null);
    router.refresh();
  }

  async function handleRetry(document: DocumentTableItem) {
    setRetryError(null);
    const result = await retryDocumentAction({ documentId: document.id });
    if (!result.ok) {
      setRetryError(result.error);
      return;
    }
    router.refresh();
  }

  function renderActions(document: DocumentTableItem) {
    const { state } = deriveDocumentState(document);
    const actions = deriveRowActions(state, canWrite);
    const items: DropdownMenuOption[] = [];

    if (actions.canPreview) {
      items.push({
        label: "Visualizar texto",
        icon: <EyeIcon size={16} />,
        onClick: () => setPreviewDocument(document),
      });
    }
    if (actions.canDownload) {
      items.push({
        label: "Baixar original",
        icon: <DownloadIcon size={16} />,
        // A rota autenticada responde com Content-Disposition: attachment,
        // então a navegação vira download sem sair da página.
        onClick: () => window.location.assign(documentDownloadPath(document.id)),
      });
    }
    if (actions.canRetry) {
      items.push({
        label: "Reprocessar",
        icon: <RefreshCwIcon size={16} />,
        onClick: () => void handleRetry(document),
      });
    }
    if (actions.canEdit) {
      items.push({
        label: "Editar",
        icon: <SquarePenIcon size={16} />,
        onClick: () => setEditingDocument(document),
      });
    }
    if (actions.canDelete) {
      if (items.length > 0) items.push({ type: "divider" });
      items.push({
        label: "Excluir",
        icon: <Trash2Icon size={16} />,
        onClick: () => {
          setDeleteError(null);
          setDeletingDocument(document);
        },
      });
    }

    if (items.length === 0) {
      return (
        <Text type="supporting" color="secondary">
          Sem ações
        </Text>
      );
    }
    return (
      <DropdownMenu
        button={{
          label: `Ações de ${document.name}`,
          icon: <EllipsisVerticalIcon size={16} />,
          variant: "ghost",
          size: "sm",
          isIconOnly: true,
        }}
        hasChevron={false}
        menuWidth={200}
        items={items}
      />
    );
  }

  return (
    <>
      <VStack gap={3}>
        <HStack gap={3} vAlign="center">
          <StackItem size="fill">
            <Heading level={2}>Todos os arquivos</Heading>
          </StackItem>
          <SegmentedControl
            value={view}
            onChange={handleViewChange}
            label="Modo de visualização"
            size="sm"
          >
            <SegmentedControlItem
              value="grade"
              label="Grade"
              icon={<LayoutGridIcon size={14} />}
            />
            <SegmentedControlItem value="lista" label="Lista" icon={<ListIcon size={14} />} />
          </SegmentedControl>
        </HStack>

        {retryError && <Banner status="error" title={retryError} />}

        {sortedDocuments.length === 0 ? (
          emptyState
        ) : view === "lista" ? (
          <DocumentsTable
            documents={sortedDocuments}
            categoryById={categoryById}
            renderActions={renderActions}
          />
        ) : (
          <DocumentsGrid
            documents={sortedDocuments}
            categoryById={categoryById}
            renderActions={renderActions}
          />
        )}
      </VStack>

      <DocumentPreviewDialog
        documentId={previewDocument?.id ?? null}
        documentName={previewDocument?.name ?? ""}
        isOpen={previewDocument !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewDocument(null);
        }}
      />

      <EditDocumentDialog
        document={editingDocument}
        categories={categories}
        onClose={() => setEditingDocument(null)}
      />

      <AlertDialog
        isOpen={deletingDocument !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setDeletingDocument(null);
            setDeleteError(null);
          }
        }}
        title="Excluir documento?"
        description={
          deleteError ??
          `"${deletingDocument?.name ?? ""}" será removido permanentemente. Esta ação não pode ser desfeita.`
        }
        actionLabel="Excluir"
        actionVariant="destructive"
        isActionLoading={isDeleting}
        onAction={handleConfirmDelete}
      />
    </>
  );
}
