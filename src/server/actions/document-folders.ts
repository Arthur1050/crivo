"use server";

import { FOLDER_ERROR_MESSAGES, FOLDER_NAME_LABEL, type DocumentFolderOption, type FolderActionResult } from "../../lib/document-folders";
import { revalidatePath } from "next/cache";
import { getActiveTenantId } from "../tenant";
import { denyIfForbidden } from "./permission";
import { validateName } from "../validation";
import { createDocumentFolder, deleteDocumentFolder, renameDocumentFolder } from "../data/document-folders";

export interface CreateDocumentFolderInput { name: string }
export interface RenameDocumentFolderInput { folderId: string; name: string }
export interface DeleteDocumentFolderInput { folderId: string }
export interface MoveDocumentsToFolderInput { documentIds: string[]; folderId: string | null }

export async function createDocumentFolderAction(
  input: CreateDocumentFolderInput
): Promise<FolderActionResult<{ folder: DocumentFolderOption }>> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return { ok: false, code: "sem-permissao", error: denied.error };
  const check = validateName(input.name, FOLDER_NAME_LABEL);
  if (!check.ok) return { ok: false, code: "nome-invalido", error: check.error };
  const result = await createDocumentFolder(await getActiveTenantId(), input.name.trim());
  if (result.kind === "duplicate_name") return { ok: false, code: "nome-duplicado", error: FOLDER_ERROR_MESSAGES["nome-duplicado"] };
  revalidatePath("/documentos");
  return { ok: true, folder: result.folder };
}

export async function renameDocumentFolderAction(
  input: RenameDocumentFolderInput
): Promise<FolderActionResult<{ folder: DocumentFolderOption }>> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return { ok: false, code: "sem-permissao", error: denied.error };
  const check = validateName(input.name, FOLDER_NAME_LABEL);
  if (!check.ok) return { ok: false, code: "nome-invalido", error: check.error };
  const result = await renameDocumentFolder(await getActiveTenantId(), input.folderId, input.name.trim());
  if (result.kind === "not_found") return { ok: false, code: "pasta-nao-encontrada", error: FOLDER_ERROR_MESSAGES["pasta-nao-encontrada"] };
  if (result.kind === "duplicate_name") return { ok: false, code: "nome-duplicado", error: FOLDER_ERROR_MESSAGES["nome-duplicado"] };
  revalidatePath("/documentos");
  return { ok: true, folder: result.folder };
}

export async function deleteDocumentFolderAction(
  input: DeleteDocumentFolderInput
): Promise<FolderActionResult<{ movedToRootCount: number }>> {
  const denied = await denyIfForbidden("documentos", "escrever");
  if (denied) return { ok: false, code: "sem-permissao", error: denied.error };
  const result = await deleteDocumentFolder(await getActiveTenantId(), input.folderId);
  if (result.kind === "not_found") return { ok: false, code: "pasta-nao-encontrada", error: FOLDER_ERROR_MESSAGES["pasta-nao-encontrada"] };
  revalidatePath("/documentos");
  return { ok: true, movedToRootCount: result.movedToRootCount };
}

export async function moveDocumentsToFolderAction(
  input: MoveDocumentsToFolderInput
): Promise<FolderActionResult<{ movedCount: number }>> {
  void input;
  throw new Error("L17: implementado na T14");
}
