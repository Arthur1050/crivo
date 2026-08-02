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
import { Token } from "@astryxdesign/core/Token";
import { DeleteIcon } from "@/src/components/icons/delete";
import { SquarePenIcon } from "@/src/components/icons/square-pen";
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
  category: DocumentCategory | null;
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

  const categoryById = new Map(
    categories.map((category) => [category.id, category])
  );

  const rows: DocumentRow[] = documents.map((document) => ({
    id: document.id,
    name: document.name,
    modality: document.modality,
    category: document.categoryId
      ? categoryById.get(document.categoryId) ?? null
      : null,
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
      key: "category",
      header: "Categoria",
      width: proportional(1),
      renderCell: (row) =>
        row.category ? (
          <Token label={row.category.name} color={row.category.color} size="sm" />
        ) : (
          <Text type="body" color="secondary">
            {NO_CATEGORY_LABEL}
          </Text>
        ),
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
      // 140px (não os 72px originais) — o botão "Ações" com label + chevron
      // precisa de ~87px e transbordava a coluna, encostando na borda direita
      // da área de conteúdo (lote-3 — UI-01); a largura extra também garante
      // o respiro visível pedido no AC.
      width: pixel(140),
      renderCell: (row) => (
        <DropdownMenu
          button={{ label: "Ações", variant: "ghost", size: "sm" }}
          items={[
            {
              label: "Editar",
              icon: <SquarePenIcon size={16} />,
              onClick: () => setEditingDocument(row.document),
            },
            { type: "divider" },
            {
              label: "Excluir",
              icon: <DeleteIcon size={16} />,
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
