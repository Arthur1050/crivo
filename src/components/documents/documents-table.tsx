"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { EditDocumentDialog } from "@/src/components/documents/edit-document-dialog";
import { formatFileSize } from "@/src/lib/format";
import { deleteDocumentAction } from "@/src/server/actions/documents";
import type { Document, DocumentCategory, Modality } from "@/src/server/data";

const MODALITY_LABELS: Record<Modality, string> = {
  novo: "Novo",
  usado: "Usado",
  ambos: "Ambos",
};

const MODALITY_BADGE_VARIANT: Record<Modality, "blue" | "purple" | "teal"> = {
  novo: "blue",
  usado: "purple",
  ambos: "teal",
};

const NO_CATEGORY_LABEL = "Sem categoria";

interface DocumentRow extends Record<string, unknown> {
  id: string;
  name: string;
  modality: Modality;
  categoryName: string;
  sizeBytes: bigint;
  uploadedAt: string;
  document: Document;
}

interface DocumentsTableProps {
  documents: Document[];
  categories: DocumentCategory[];
}

/**
 * Listagem de documentos do tenant ativo em linhas edge-to-edge (lote-2 —
 * DOC-01/04/05): nunca em cards. O filtro/busca acontece no servidor (RSC lê
 * `searchParams` e consulta o banco já filtrado); esta tabela apresenta o
 * resultado recebido via props e expõe as ações de editar/excluir por linha.
 */
export function DocumentsTable({ documents, categories }: DocumentsTableProps) {
  const router = useRouter();
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [deletingDocument, setDeletingDocument] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name])
  );

  const rows: DocumentRow[] = documents.map((document) => ({
    id: document.id,
    name: document.name,
    modality: document.modality,
    categoryName: document.categoryId
      ? categoryNameById.get(document.categoryId) ?? NO_CATEGORY_LABEL
      : NO_CATEGORY_LABEL,
    sizeBytes: document.sizeBytes,
    uploadedAt: document.uploadedAt.toISOString(),
    document,
  }));

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

  const columns: TableColumn<DocumentRow>[] = [
    { key: "name", header: "Nome", width: proportional(2) },
    {
      key: "modality",
      header: "Modalidade",
      width: proportional(1),
      renderCell: (row) => (
        <Badge
          label={MODALITY_LABELS[row.modality]}
          variant={MODALITY_BADGE_VARIANT[row.modality]}
        />
      ),
    },
    {
      key: "categoryName",
      header: "Categoria",
      width: proportional(1),
    },
    {
      key: "sizeBytes",
      header: "Tamanho",
      width: pixel(110),
      renderCell: (row) => <Text type="body">{formatFileSize(row.sizeBytes)}</Text>,
    },
    {
      key: "uploadedAt",
      header: "Data de upload",
      width: pixel(160),
      renderCell: (row) => <Timestamp value={row.uploadedAt} format="date" />,
    },
    {
      key: "actions",
      header: "",
      width: pixel(72),
      renderCell: (row) => (
        <DropdownMenu
          button={{ label: "Ações", variant: "ghost", size: "sm" }}
          items={[
            {
              label: "Editar",
              onClick: () => setEditingDocument(row.document),
            },
            { type: "divider" },
            {
              label: "Excluir",
              onClick: () => {
                setDeleteError(null);
                setDeletingDocument(row.document);
              },
            },
          ]}
        />
      ),
    },
  ];

  return (
    <>
      <Table data={rows} columns={columns} idKey="id" dividers="rows" hasHover />

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
