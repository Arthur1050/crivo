import "server-only";
import {
  BlobNotFoundError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  del,
  get,
  head,
} from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import {
  DocumentStorageError,
  type AuthorizedUpload,
  type ClientUploadGrant,
  type DocumentStorage,
  type StoredObject,
  type StoredObjectStream,
  toDocumentStorageError,
} from "./storage";

/**
 * Traduz o vocabulário de erro do provedor para o do domínio. Vive aqui, e não
 * em `storage.ts`, porque o contrato de domínio é deliberadamente neutro de
 * provedor — quem conhece as classes da Vercel é o adapter.
 *
 * As classes do SDK não carregam `status` nem `code`: `BlobNotFoundError` só
 * se identifica pelo próprio tipo. Sem este mapeamento ela caía no default
 * `permanent`, e como `head() === null` é o que autoriza o hard delete, toda
 * remoção física ficava presa em pendência eterna.
 *
 * `absent` é concedido exclusivamente a `BlobNotFoundError`. Store inexistente,
 * suspenso ou credencial inválida são `permanent`, nunca `absent`: classificar
 * um erro de configuração como ausência apagaria a linha enquanto o original
 * continua existindo num store inalcançável.
 */
export function translateVercelBlobError(error: unknown): DocumentStorageError {
  if (error instanceof DocumentStorageError) return error;
  if (error instanceof BlobNotFoundError) return new DocumentStorageError("absent");
  if (
    error instanceof BlobServiceNotAvailable ||
    error instanceof BlobServiceRateLimited ||
    error instanceof BlobRequestAbortedError
  ) {
    return new DocumentStorageError("transient");
  }
  return toDocumentStorageError(error);
}

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
      const translated = translateVercelBlobError(error);
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
      const translated = translateVercelBlobError(error);
      if (translated.kind === "absent") return null;
      throw translated;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await del(key);
    } catch (error) {
      const translated = translateVercelBlobError(error);
      if (translated.kind !== "absent") throw translated;
    }
  }
}
