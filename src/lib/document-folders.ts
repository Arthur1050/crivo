/**
 * Contrato das pastas de documentos (lote 17 — AD-051; design.md § 3).
 *
 * Módulo puro e sem imports: é lido pela DAL, pelas actions, pela rota de
 * upload, pelos componentes cliente e pela página. Nenhum `server-only` aqui
 * de propósito, pelo mesmo motivo de `src/lib/permissions.ts`.
 */

/** Valor reservado do parâmetro `pasta`: filtro "sem pasta" na raiz. */
export const NO_FOLDER_PARAM = "sem-pasta";
/** Rótulo da raiz e de documento sem pasta (AD-051 item 2). */
export const NO_FOLDER_LABEL = "Sem pasta";
/** Teto de documentos por movimentação (PMOVER-01 AC5). */
export const MAX_DOCUMENTS_PER_MOVE = 100;
export const FOLDER_NAME_LABEL = "Nome da pasta";

/** Pasta como opção de escolha (diálogos, seletor, caminho). */
export interface DocumentFolderOption {
  id: string;
  name: string;
}

/** Linha da listagem de pastas (PLER-01 AC1). */
export interface DocumentFolderSummary extends DocumentFolderOption {
  fileCount: number;
  /** Soma de `size_bytes` dos documentos não excluídos; `number` é exato até 2^53. */
  totalSizeBytes: number;
  /** max(updated_at da pasta, uploaded_at mais recente dos documentos não excluídos). */
  lastActivityAt: Date;
}

/** Filtro de pasta da DAL de documentos (PFILT-01). Ausente = todas as pastas e sem pasta. */
export type DocumentFolderFilter =
  | { kind: "pasta"; folderId: string }
  | { kind: "sem-pasta" };

/** Leitura do parâmetro `pasta` da URL. */
export type FolderParam =
  | { kind: "todas" }
  | { kind: "sem-pasta" }
  | { kind: "pasta"; folderId: string }
  | { kind: "invalida" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id que não passa aqui nunca vai ao banco: o cast de UUID viraria erro 500. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseFolderParam(raw: string | string[] | undefined): FolderParam {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return { kind: "todas" };
  if (value === NO_FOLDER_PARAM) return { kind: "sem-pasta" };
  if (isUuid(value)) return { kind: "pasta", folderId: value.toLowerCase() };
  return { kind: "invalida" };
}

export function folderHref(folderId: string): string {
  return `/documentos?pasta=${folderId}`;
}

export type FolderActionErrorCode =
  | "sem-permissao"
  | "nome-invalido"
  | "nome-duplicado"
  | "pasta-nao-encontrada"
  | "documento-nao-encontrado"
  | "selecao-invalida";

export type FolderActionResult<T extends object = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; code: FolderActionErrorCode; error: string };

/** Mensagens fixas (a de `sem-permissao` e a de `nome-invalido` vêm da guarda e de `validateName`). */
export const FOLDER_ERROR_MESSAGES: Record<
  Exclude<FolderActionErrorCode, "sem-permissao" | "nome-invalido">,
  string
> = {
  "nome-duplicado": "Já existe uma pasta com esse nome.",
  "pasta-nao-encontrada": "Pasta não encontrada.",
  "documento-nao-encontrado": "Documento não encontrado.",
  "selecao-invalida": "Selecione de 1 a 100 documentos.",
};
