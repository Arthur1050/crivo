"use server";

import type { DocumentFolderOption, FolderActionResult } from "../../lib/document-folders";

export interface CreateDocumentFolderInput { name: string }
export interface RenameDocumentFolderInput { folderId: string; name: string }
export interface DeleteDocumentFolderInput { folderId: string }
export interface MoveDocumentsToFolderInput { documentIds: string[]; folderId: string | null }

export async function createDocumentFolderAction(
  input: CreateDocumentFolderInput
): Promise<FolderActionResult<{ folder: DocumentFolderOption }>> {
  void input;
  throw new Error("L17: implementado na T13");
}

export async function renameDocumentFolderAction(
  input: RenameDocumentFolderInput
): Promise<FolderActionResult<{ folder: DocumentFolderOption }>> {
  void input;
  throw new Error("L17: implementado na T13");
}

export async function deleteDocumentFolderAction(
  input: DeleteDocumentFolderInput
): Promise<FolderActionResult<{ movedToRootCount: number }>> {
  void input;
  throw new Error("L17: implementado na T13");
}

export async function moveDocumentsToFolderAction(
  input: MoveDocumentsToFolderInput
): Promise<FolderActionResult<{ movedCount: number }>> {
  void input;
  throw new Error("L17: implementado na T14");
}
