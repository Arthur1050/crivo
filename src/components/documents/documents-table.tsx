"use client";

import { Badge } from "@astryxdesign/core/Badge";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import type { TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { formatFileSize } from "@/src/lib/format";
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
    renderCell: (row) => (
      <Text type="body">{formatFileSize(row.sizeBytes)}</Text>
    ),
  },
  {
    key: "uploadedAt",
    header: "Data de upload",
    width: pixel(160),
    renderCell: (row) => <Timestamp value={row.uploadedAt} format="date" />,
  },
];

interface DocumentsTableProps {
  documents: Document[];
  categories: DocumentCategory[];
}

/**
 * Listagem de documentos do tenant ativo em linhas edge-to-edge (lote-2 —
 * DOC-01): nunca em cards. O filtro/busca acontece no servidor (RSC lê
 * `searchParams` e consulta o banco já filtrado); esta tabela apenas
 * apresenta o resultado que recebe via props.
 */
export function DocumentsTable({ documents, categories }: DocumentsTableProps) {
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
  }));

  return (
    <Table
      data={rows}
      columns={columns}
      idKey="id"
      dividers="rows"
      hasHover
    />
  );
}
