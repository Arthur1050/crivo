"use client";

import type { ReactNode } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { HStack, StackItem } from "@astryxdesign/core/Stack";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import {
  MODALITY_BADGE_VARIANT,
  MODALITY_LABELS,
  NO_CATEGORY_LABEL,
  NO_EXPIRY_LABEL,
  type DocumentTableItem,
} from "@/src/components/documents/document-presentation";
import { deriveDocumentState, describeFailure } from "@/src/components/documents/document-row-state";
import { FileKindGlyph } from "@/src/components/documents/file-type-icon";
import { formatFileSize } from "@/src/lib/format";
import type { DocumentCategory } from "@/src/server/data";

interface DocumentRow extends Record<string, unknown> {
  id: string;
  document: DocumentTableItem;
  category: DocumentCategory | null;
}

interface DocumentsTableProps {
  documents: DocumentTableItem[];
  categoryById: Map<string, DocumentCategory>;
  renderActions: (document: DocumentTableItem) => ReactNode;
}

/**
 * Visão em lista de `/documentos` (lote-2 — DOC-01/04/05), no desenho do
 * gerenciador de arquivos: linhas edge-to-edge sem card envolvendo, nome com
 * ícone do tipo e a modalidade como selo ao lado, e o menu de ações (⋮) na
 * última coluna. O filtro/busca acontece no servidor; a ordenação e as ações
 * chegam prontas de `DocumentsBrowser`.
 */
export function DocumentsTable({ documents, categoryById, renderActions }: DocumentsTableProps) {
  const rows: DocumentRow[] = documents.map((document) => ({
    id: document.id,
    document,
    category: document.categoryId ? categoryById.get(document.categoryId) ?? null : null,
  }));

  const columns: TableColumn<DocumentRow>[] = [
    {
      key: "name",
      header: "Nome",
      width: proportional(2),
      renderCell: ({ document }) => (
        <HStack gap={3} vAlign="center">
          <FileKindGlyph mimeType={document.mimeType} />
          <StackItem size="fill">
            <Text type="body" weight="medium" maxLines={1}>
              {document.name}
            </Text>
          </StackItem>
          <Badge
            label={MODALITY_LABELS[document.modality]}
            variant={MODALITY_BADGE_VARIANT[document.modality]}
          />
        </HStack>
      ),
    },
    {
      key: "category",
      header: "Categoria",
      width: proportional(1),
      renderCell: ({ category }) =>
        category ? (
          <Token label={category.name} color={category.color} size="sm" />
        ) : (
          <Text type="body" color="secondary">
            {NO_CATEGORY_LABEL}
          </Text>
        ),
    },
    {
      key: "status",
      header: "Estado",
      width: pixel(140),
      renderCell: ({ document }) => {
        const presentation = deriveDocumentState(document);
        return (
          <HStack gap={2} vAlign="center">
            <StatusDot
              variant={presentation.variant}
              label={presentation.label}
              tooltip={
                presentation.state === "falha"
                  ? describeFailure(document.failureCode)
                  : presentation.description
              }
              isPulsing={presentation.state === "processando"}
            />
            <Text type="body">{presentation.label}</Text>
          </HStack>
        );
      },
    },
    {
      key: "uploadedAt",
      header: "Enviado em",
      width: pixel(170),
      renderCell: ({ document }) => (
        <Timestamp value={document.uploadedAt.toISOString()} format="date" type="body" />
      ),
    },
    {
      key: "expiresAt",
      header: "Validade",
      width: pixel(170),
      renderCell: ({ document }) =>
        document.expiresAt ? (
          <Timestamp value={document.expiresAt.toISOString()} format="date_time" type="body" />
        ) : (
          <Text type="body" color="secondary">
            {NO_EXPIRY_LABEL}
          </Text>
        ),
    },
    {
      key: "sizeBytes",
      header: "Tamanho",
      width: pixel(100),
      renderCell: ({ document }) => <Text type="body">{formatFileSize(document.sizeBytes)}</Text>,
    },
    {
      key: "actions",
      header: "",
      width: pixel(56),
      renderCell: ({ document }) => renderActions(document),
    },
  ];

  return (
    <Table
      data={rows}
      columns={columns}
      idKey="id"
      density="compact"
      dividers="rows"
      hasHover
    />
  );
}
