import "server-only";
import { randomUUID } from "node:crypto";

/** A provider-neutral grant that authorizes one private, direct-to-storage upload. */
export interface AuthorizedUpload {
  key: string;
  contentType: string;
  contentLength: number;
  expiresAt: Date;
}

/**
 * An upload capability, not a durable object identity. The database stores the
 * opaque key, never a provider URL or this short-lived token.
 */
export interface ClientUploadGrant {
  key: string;
  clientToken: string;
  expiresAt: Date;
  access: "private";
}

export interface StoredObject {
  key: string;
  etag: string;
  contentType: string;
  size: number;
}

export interface StoredObjectStream extends StoredObject {
  stream: ReadableStream<Uint8Array>;
}

/** Domain contract; implementations must keep objects private. */
export interface DocumentStorage {
  authorizeClientUpload(input: AuthorizedUpload): Promise<ClientUploadGrant>;
  head(key: string): Promise<StoredObject | null>;
  open(key: string): Promise<StoredObjectStream | null>;
  delete(key: string): Promise<void>;
}

export type DocumentStorageFailureKind = "absent" | "transient" | "permanent";

export type DocumentStorageErrorCode =
  | "STORAGE_OBJECT_ABSENT"
  | "STORAGE_TRANSIENT_FAILURE"
  | "STORAGE_PERMANENT_FAILURE";

const errorCodeForKind: Record<
  DocumentStorageFailureKind,
  DocumentStorageErrorCode
> = {
  absent: "STORAGE_OBJECT_ABSENT",
  transient: "STORAGE_TRANSIENT_FAILURE",
  permanent: "STORAGE_PERMANENT_FAILURE",
};

const safeMessageForKind: Record<DocumentStorageFailureKind, string> = {
  absent: "Stored document was not found.",
  transient: "Document storage is temporarily unavailable.",
  permanent: "Document storage rejected the operation.",
};

/**
 * Stable, sanitized storage failure. Provider messages, paths, URLs and
 * credentials must never cross this boundary.
 */
export class DocumentStorageError extends Error {
  readonly code: DocumentStorageErrorCode;

  constructor(readonly kind: DocumentStorageFailureKind) {
    super(safeMessageForKind[kind]);
    this.name = "DocumentStorageError";
    this.code = errorCodeForKind[kind];
  }
}

type ProviderErrorShape = {
  code?: unknown;
  status?: unknown;
};

function providerStatus(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const status = (error as ProviderErrorShape).status;
  return typeof status === "number" ? status : undefined;
}

function providerCode(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as ProviderErrorShape).code;
  return typeof code === "string" ? code.toUpperCase() : undefined;
}

/** Translate a provider exception into the only failure vocabulary the domain uses. */
export function toDocumentStorageError(error: unknown): DocumentStorageError {
  if (error instanceof DocumentStorageError) return error;

  const status = providerStatus(error);
  const code = providerCode(error);

  if (
    status === 404 ||
    code === "ENOENT" ||
    code === "NOT_FOUND" ||
    code === "BLOB_NOT_FOUND"
  ) {
    return new DocumentStorageError("absent");
  }

  if (
    status === 408 ||
    status === 429 ||
    (status !== undefined && status >= 500) ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EAI_AGAIN" ||
    code === "ECONNREFUSED"
  ) {
    return new DocumentStorageError("transient");
  }

  return new DocumentStorageError("permanent");
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, field: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a UUID.`);
  }
  return value.toLowerCase();
}

/**
 * Creates an immutable storage pathname from server-issued UUIDs only. It has
 * no filename or other client-controlled component and is safe to persist as
 * an opaque identity.
 */
export function createDocumentStorageKey(
  tenantId: string,
  intentId: string,
  objectId = randomUUID()
) {
  return `documents/v1/${requireUuid(tenantId, "tenantId")}/${requireUuid(
    intentId,
    "intentId"
  )}/${requireUuid(objectId, "objectId")}`;
}

const FALLBACK_DOWNLOAD_FILENAME = "documento";
const MAX_DOWNLOAD_FILENAME_LENGTH = 160;

/**
 * Makes a display/download filename safe for a Content-Disposition header.
 * It is intentionally separate from the opaque object key.
 */
export function sanitizeDownloadFilename(filename: string | null | undefined) {
  const leaf = filename?.split(/[\\/]/).at(-1) ?? "";
  const normalized = leaf
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[^\p{L}\p{N}._() \-]/gu, "_")
    .replace(/\s+/g, " ")
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, MAX_DOWNLOAD_FILENAME_LENGTH);

  if (!normalized || /^\.+$/.test(normalized)) {
    return FALLBACK_DOWNLOAD_FILENAME;
  }

  return normalized;
}
