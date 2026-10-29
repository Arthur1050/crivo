import {
  folderHref,
  type DocumentFolderFilter,
  type DocumentFolderOption,
  type FolderParam,
} from "../../lib/document-folders";

export type DocumentsPageMode =
  | { kind: "raiz"; folderFilter: DocumentFolderFilter | undefined }
  | { kind: "pasta"; folder: DocumentFolderOption }
  | { kind: "pasta-inexistente" };

export function resolveDocumentsPageMode(
  param: FolderParam,
  folder: DocumentFolderOption | null,
): DocumentsPageMode {
  switch (param.kind) {
    case "todas":
      return { kind: "raiz", folderFilter: undefined };
    case "sem-pasta":
      return { kind: "raiz", folderFilter: { kind: "sem-pasta" } };
    case "pasta":
      return folder ? { kind: "pasta", folder } : { kind: "pasta-inexistente" };
    case "invalida":
      return { kind: "pasta-inexistente" };
  }
}

export function folderFilterFor(mode: DocumentsPageMode): DocumentFolderFilter | undefined {
  if (mode.kind === "pasta") return { kind: "pasta", folderId: mode.folder.id };
  return mode.kind === "raiz" ? mode.folderFilter : undefined;
}

export function clearFiltersHref(mode: DocumentsPageMode): string {
  return mode.kind === "pasta" ? folderHref(mode.folder.id) : "/documentos";
}
