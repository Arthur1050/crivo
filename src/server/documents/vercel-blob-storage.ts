import "server-only";
import { del, get, head } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import {
  type AuthorizedUpload,
  type ClientUploadGrant,
  type DocumentStorage,
  type StoredObject,
  type StoredObjectStream,
  toDocumentStorageError,
} from "./storage";

export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
] as const;

const CLIENT_UPLOAD_TOKEN_TTL_MS = 5 * 60 * 1000;

function isAllowedDocumentContentType(contentType: string) {
  return (DOCUMENT_CONTENT_TYPES as readonly string[]).includes(contentType);
}

function ensureUploadIsWithinDocumentContract(input: AuthorizedUpload) {
  if (
    input.contentLength < 1 ||
    input.contentLength > MAX_DOCUMENT_UPLOAD_BYTES ||
    !isAllowedDocumentContentType(input.contentType)
  ) {
    throw toDocumentStorageError({ status: 400 });
  }
}

function toStoredObject(blob: {
  pathname: string;
  etag: string;
  contentType: string;
  size: number;
}): StoredObject {
  return {
    key: blob.pathname,
    etag: blob.etag,
    contentType: blob.contentType,
    size: blob.size,
  };
}

/** Vercel Private Blob implementation of the provider-neutral document contract. */
export class VercelBlobDocumentStorage implements DocumentStorage {
  async authorizeClientUpload(
    input: AuthorizedUpload
  ): Promise<ClientUploadGrant> {
    ensureUploadIsWithinDocumentContract(input);

    const expiresAt = new Date(
      Math.min(
        input.expiresAt.getTime(),
        Date.now() + CLIENT_UPLOAD_TOKEN_TTL_MS
      )
    );
    const clientToken = await generateClientTokenFromReadWriteToken({
      pathname: input.key,
      maximumSizeInBytes: input.contentLength,
      allowedContentTypes: [input.contentType],
      validUntil: expiresAt.getTime(),
      addRandomSuffix: false,
      allowOverwrite: false,
    });

    return {
      key: input.key,
      clientToken,
      expiresAt,
      access: "private",
    };
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      return toStoredObject(await head(key));
    } catch (error) {
      const translated = toDocumentStorageError(error);
      if (translated.kind === "absent") return null;
      throw translated;
    }
  }

  async open(key: string): Promise<StoredObjectStream | null> {
    try {
      const result = await get(key, { access: "private" });
      if (result === null || result.statusCode !== 200) return null;

      return {
        ...toStoredObject(result.blob),
        stream: result.stream,
      };
    } catch (error) {
      const translated = toDocumentStorageError(error);
      if (translated.kind === "absent") return null;
      throw translated;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await del(key);
    } catch (error) {
      if (toDocumentStorageError(error).kind !== "absent") {
        throw toDocumentStorageError(error);
      }
    }
  }
}
