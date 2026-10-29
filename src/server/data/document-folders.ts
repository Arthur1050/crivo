import "server-only";

import { and, count, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { db } from "../../db";
import { documentFolders, documents } from "../../db/schema";
import { isUuid, MAX_DOCUMENTS_PER_MOVE, type DocumentFolderOption, type DocumentFolderSummary } from "../../lib/document-folders";
import { isUniqueViolation } from "./pg-errors";

export async function listDocumentFolderSummaries(tenantId: string): Promise<DocumentFolderSummary[]> {
  const rows = await db.select({
    id: documentFolders.id, name: documentFolders.name, updatedAt: documentFolders.updatedAt,
    fileCount: count(documents.id), totalSizeBytes: sql<string>`coalesce(sum(${documents.sizeBytes}), 0)`,
    lastUploadedAt: max(documents.uploadedAt),
  }).from(documentFolders).leftJoin(documents, and(
    eq(documents.folderId, documentFolders.id), eq(documents.tenantId, documentFolders.tenantId), isNull(documents.deletedAt)
  )).where(eq(documentFolders.tenantId, tenantId)).groupBy(documentFolders.id);
  const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
  return rows.map((row) => ({
    id: row.id, name: row.name, fileCount: row.fileCount, totalSizeBytes: Number(row.totalSizeBytes),
    lastActivityAt: new Date(Math.max(row.updatedAt.getTime(), row.lastUploadedAt?.getTime() ?? row.updatedAt.getTime())),
  })).sort((a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export async function getDocumentFolder(tenantId: string, folderId: string): Promise<DocumentFolderOption | null> {
  if (!isUuid(folderId)) return null;
  const [folder] = await db.select({ id: documentFolders.id, name: documentFolders.name }).from(documentFolders)
    .where(and(eq(documentFolders.tenantId, tenantId), eq(documentFolders.id, folderId)));
  return folder ?? null;
}

export type CreateDocumentFolderResult =
  | { kind: "created"; folder: DocumentFolderOption }
  | { kind: "duplicate_name" };

export async function createDocumentFolder(tenantId: string, name: string, now = new Date()): Promise<CreateDocumentFolderResult> {
  try {
    const [folder] = await db.insert(documentFolders).values({ tenantId, name, createdAt: now, updatedAt: now })
      .returning({ id: documentFolders.id, name: documentFolders.name });
    return { kind: "created", folder };
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: "duplicate_name" };
    throw error;
  }
}

export type RenameDocumentFolderResult =
  | { kind: "renamed"; folder: DocumentFolderOption }
  | { kind: "not_found" }
  | { kind: "duplicate_name" };

export async function renameDocumentFolder(tenantId: string, folderId: string, name: string, now = new Date()): Promise<RenameDocumentFolderResult> {
  if (!isUuid(folderId)) return { kind: "not_found" };
  try {
    const [folder] = await db.update(documentFolders).set({ name, updatedAt: now })
      .where(and(eq(documentFolders.tenantId, tenantId), eq(documentFolders.id, folderId)))
      .returning({ id: documentFolders.id, name: documentFolders.name });
    return folder ? { kind: "renamed", folder } : { kind: "not_found" };
  } catch (error) {
    if (isUniqueViolation(error)) return { kind: "duplicate_name" };
    throw error;
  }
}

export type DeleteDocumentFolderResult =
  | { kind: "deleted"; movedToRootCount: number }
  | { kind: "not_found" };

export async function deleteDocumentFolder(tenantId: string, folderId: string): Promise<DeleteDocumentFolderResult> {
  if (!isUuid(folderId)) return { kind: "not_found" };
  return db.transaction(async (tx) => {
    const [folder] = await tx.select({ id: documentFolders.id }).from(documentFolders)
      .where(and(eq(documentFolders.tenantId, tenantId), eq(documentFolders.id, folderId))).for("update");
    if (!folder) return { kind: "not_found" };
    const [summary] = await tx.select({ fileCount: count() }).from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.folderId, folderId), isNull(documents.deletedAt)));
    await tx.delete(documentFolders).where(and(eq(documentFolders.tenantId, tenantId), eq(documentFolders.id, folderId)));
    return { kind: "deleted", movedToRootCount: summary.fileCount };
  });
}

export type MoveDocumentsToFolderResult =
  | { kind: "moved"; movedCount: number }
  | { kind: "invalid_selection" }
  | { kind: "folder_not_found" }
  | { kind: "document_not_found" };

export async function moveDocumentsToFolder(
  tenantId: string, documentIds: string[], folderId: string | null, now = new Date()
): Promise<MoveDocumentsToFolderResult> {
  const ids = [...new Set(documentIds)];
  if (ids.length === 0 || ids.length > MAX_DOCUMENTS_PER_MOVE || ids.some((id) => !isUuid(id))) {
    return { kind: "invalid_selection" };
  }
  if (folderId !== null && !isUuid(folderId)) return { kind: "folder_not_found" };
  return db.transaction(async (tx) => {
    if (folderId !== null) {
      const [target] = await tx.select({ id: documentFolders.id }).from(documentFolders)
        .where(and(eq(documentFolders.tenantId, tenantId), eq(documentFolders.id, folderId))).for("key share");
      if (!target) return { kind: "folder_not_found" };
    }
    const rows = await tx.select({ id: documents.id, folderId: documents.folderId }).from(documents)
      .where(and(eq(documents.tenantId, tenantId), inArray(documents.id, ids), isNull(documents.deletedAt))).for("update");
    if (rows.length !== ids.length) return { kind: "document_not_found" };
    const changed = rows.filter((row) => row.folderId !== folderId);
    if (changed.length === 0) return { kind: "moved", movedCount: 0 };
    await tx.update(documents).set({ folderId })
      .where(and(eq(documents.tenantId, tenantId), inArray(documents.id, changed.map((row) => row.id))));
    const touched = [...new Set([folderId, ...changed.map((row) => row.folderId)].filter((id): id is string => id !== null))];
    if (touched.length > 0) {
      await tx.update(documentFolders).set({ updatedAt: now })
        .where(and(eq(documentFolders.tenantId, tenantId), inArray(documentFolders.id, touched)));
    }
    return { kind: "moved", movedCount: changed.length };
  });
}
