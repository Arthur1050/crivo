/**
 * Ordenação da listagem de documentos (`?ordem=`). O servidor já entrega os
 * documentos do mais recente para o mais antigo; reordenar é só apresentação,
 * então acontece no cliente sobre o resultado filtrado.
 */

export type DocumentSort = "recentes" | "nome" | "tamanho";

export const DEFAULT_DOCUMENT_SORT: DocumentSort = "recentes";

export const DOCUMENT_SORT_OPTIONS: { value: DocumentSort; label: string }[] = [
  { value: "recentes", label: "Mais recentes" },
  { value: "nome", label: "Nome" },
  { value: "tamanho", label: "Tamanho" },
];

export function asDocumentSort(value: string | null | undefined): DocumentSort {
  return DOCUMENT_SORT_OPTIONS.some((option) => option.value === value)
    ? (value as DocumentSort)
    : DEFAULT_DOCUMENT_SORT;
}

interface SortableDocument {
  name: string;
  sizeBytes: bigint;
  uploadedAt: Date;
}

export function sortDocuments<T extends SortableDocument>(documents: T[], sort: DocumentSort): T[] {
  const sorted = [...documents];
  switch (sort) {
    case "nome":
      return sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    case "tamanho":
      return sorted.sort((a, b) => (a.sizeBytes === b.sizeBytes ? 0 : a.sizeBytes > b.sizeBytes ? -1 : 1));
    case "recentes":
      return sorted.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }
}
