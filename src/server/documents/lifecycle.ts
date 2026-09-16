import "server-only";

import {
  findTombstonedDocumentForDeletion,
  hardDeleteTombstonedDocument,
  recordDocumentDeletionFailure,
  tombstoneDocument,
} from "./repository";
import { DocumentStorageError, toDocumentStorageError, type DocumentStorage } from "./storage";

export type DocumentRemovalResult =
  | { kind: "removed" }
  | { kind: "retryable"; code: DocumentStorageError["code"] }
  | { kind: "not_found" };

export interface DocumentLifecycleDependencies {
  storage: DocumentStorage;
  now?: () => Date;
}

/**
 * Enforces tombstone -> storage delete/head -> hard-delete. A failed provider
 * operation can never restore access because the row is tombstoned first.
 */
export function createDocumentLifecycle({ storage, now = () => new Date() }: DocumentLifecycleDependencies) {
  async function removeTombstone(tenantId: string, documentId: string): Promise<DocumentRemovalResult> {
    const document = await findTombstonedDocumentForDeletion(tenantId, documentId);
    if (!document) return { kind: "not_found" };

    try {
      try {
        await storage.delete(document.storageKey);
      } catch (error) {
        // A provider may report a previous successful deletion as 404.
        if (toDocumentStorageError(error).kind !== "absent") throw error;
      }

      const remaining = await storage.head(document.storageKey);
      if (remaining) throw new DocumentStorageError("permanent");

      return await hardDeleteTombstonedDocument(tenantId, documentId)
        ? { kind: "removed" }
        : { kind: "not_found" };
    } catch (error) {
      const safe = toDocumentStorageError(error);
      await recordDocumentDeletionFailure(tenantId, documentId, safe.code);
      return { kind: "retryable", code: safe.code };
    }
  }

  return {
    async remove(input: { tenantId: string; documentId: string }): Promise<DocumentRemovalResult> {
      const state = await tombstoneDocument(input.tenantId, input.documentId, now());
      if (state === "not_found") return { kind: "not_found" };
      return removeTombstone(input.tenantId, input.documentId);
    },
    async retry(input: { tenantId: string; documentId: string }): Promise<DocumentRemovalResult> {
      return removeTombstone(input.tenantId, input.documentId);
    },
  };
}
