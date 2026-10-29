import "server-only";

import { and, count, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "../../db";
import { documentFolders, documents } from "../../db/schema";
import { isUuid, type DocumentFolderOption, type DocumentFolderSummary } from "../../lib/document-folders";

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
