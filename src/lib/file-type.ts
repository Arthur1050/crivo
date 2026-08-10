/**
 * Classificação de tipo de arquivo por `mimeType` (lote-6b — UI-02,
 * design.md § R2). Função PURA: mapa literal (nunca regex frouxa) cobrindo
 * os MIME reais do seed (`application/pdf`, DOCX) e os equivalentes
 * Office/OpenDocument — qualquer MIME desconhecido cai no fallback
 * `generico` (spec.md — Edge Cases: "nunca quebra a linha nem esconde o
 * documento").
 */

export type FileKind =
  | "pdf"
  | "documento"
  | "planilha"
  | "apresentacao"
  | "imagem"
  | "generico";

const MIME_TO_KIND: Record<string, FileKind> = {
  "application/pdf": "pdf",

  // Documento de texto — Word (legado e OOXML) e OpenDocument Text.
  "application/msword": "documento",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "documento",
  "application/vnd.oasis.opendocument.text": "documento",

  // Planilha — Excel (legado e OOXML) e OpenDocument Spreadsheet.
  "application/vnd.ms-excel": "planilha",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    "planilha",
  "application/vnd.oasis.opendocument.spreadsheet": "planilha",

  // Apresentação — PowerPoint (legado e OOXML) e OpenDocument Presentation.
  "application/vnd.ms-powerpoint": "apresentacao",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "apresentacao",
  "application/vnd.oasis.opendocument.presentation": "apresentacao",

  // Imagem.
  "image/png": "imagem",
  "image/jpeg": "imagem",
  "image/jpg": "imagem",
  "image/gif": "imagem",
  "image/webp": "imagem",
  "image/svg+xml": "imagem",
};

/**
 * Resolve o `FileKind` a partir do `mimeType` gravado em `documents.mimeType`.
 * Qualquer MIME não mapeado (inclusive vazio ou malformado) devolve
 * `generico`.
 */
export function resolveFileKind(mimeType: string): FileKind {
  return MIME_TO_KIND[mimeType] ?? "generico";
}
