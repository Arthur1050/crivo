import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  authorizeOrThrow,
  type AuthContext,
  verifySession,
} from "../auth/session";
import {
  validateFileSize,
  validateMimeType,
  validateModality,
  validateName,
} from "../validation";
import {
  claimUploadIntentForFinalization,
  commitUploadIntent,
  createUploadIntent,
  failUploadIntent,
  findUploadIntentById,
  type CreateUploadIntentInput,
} from "./repository";
import {
  createDocumentStorageKey,
  type ClientUploadGrant,
  type DocumentStorage,
} from "./storage";
import {
  MAX_DOCUMENT_UPLOAD_BYTES,
  VercelBlobDocumentStorage,
} from "./vercel-blob-storage";

const UPLOAD_INTENT_TTL_MS = 60 * 60 * 1000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MODALITIES = ["novo", "usado", "ambos"] as const;

export interface CreateDocumentUploadInput {
  clientSha256: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  modality: (typeof MODALITIES)[number];
  categoryId?: string | null;
  expiresAt?: Date | null;
}

export type BeginDocumentUploadResult =
  | { kind: "ready"; intentId: string; grant: ClientUploadGrant }
  | { kind: "duplicate_upload" }
  | { kind: "invalid"; code: "upload_input_invalid" }
  | { kind: "storage_failure" };

export type FinalizeDocumentUploadResult =
  | { kind: "committed"; documentId: string }
  | { kind: "duplicate_content"; documentId: string }
  | { kind: "not_found" | "expired" | "not_finalizable" }
  | { kind: "rejected"; code: string }
  | { kind: "compensation_pending" };

type DocumentUploadRepository = Pick<
  typeof import("./repository"),
  | "claimUploadIntentForFinalization"
  | "commitUploadIntent"
  | "createUploadIntent"
  | "failUploadIntent"
  | "findUploadIntentById"
>;

const defaultRepository: DocumentUploadRepository = {
  claimUploadIntentForFinalization,
  commitUploadIntent,
  createUploadIntent,
  failUploadIntent,
  findUploadIntentById,
};

export interface DocumentUploadIntakeDependencies {
  storage?: DocumentStorage;
  repository?: DocumentUploadRepository;
  now?: () => Date;
}

function validInput(input: CreateDocumentUploadInput, now: Date) {
  return (
    validateName(input.name, "Nome do documento").ok &&
    validateMimeType(input.mimeType).ok &&
    input.sizeBytes >= 1 &&
    validateFileSize(input.sizeBytes).ok &&
    input.sizeBytes <= MAX_DOCUMENT_UPLOAD_BYTES &&
    validateModality(input.modality).ok &&
    MODALITIES.includes(input.modality) &&
    SHA256_PATTERN.test(input.clientSha256) &&
    (input.expiresAt === undefined ||
      input.expiresAt === null ||
      input.expiresAt > now)
  );
}

function signatureMatches(mimeType: string, firstBytes: Uint8Array) {
  if (mimeType === "application/pdf") {
    return new TextDecoder().decode(firstBytes.subarray(0, 5)) === "%PDF-";
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return (
      firstBytes[0] === 0x50 &&
      firstBytes[1] === 0x4b &&
      firstBytes[2] === 0x03 &&
      firstBytes[3] === 0x04
    );
  }
  return !firstBytes.includes(0);
}

async function hashAndValidateStream(
  stream: ReadableStream<Uint8Array>,
  mimeType: string,
  expectedSize: bigint
) {
  const hash = createHash("sha256");
  const reader = stream.getReader();
  const firstBytes: number[] = [];
  let bytes = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_DOCUMENT_UPLOAD_BYTES) {
      return { ok: false as const, code: "uploaded_size_invalid" };
    }
    hash.update(value);
    for (const byte of value) {
      if (firstBytes.length === 8) break;
      firstBytes.push(byte);
    }
  }

  if (BigInt(bytes) !== expectedSize) {
    return { ok: false as const, code: "uploaded_size_mismatch" };
  }
  if (!signatureMatches(mimeType, Uint8Array.from(firstBytes))) {
    return { ok: false as const, code: "uploaded_signature_invalid" };
  }
  return { ok: true as const, contentSha256: hash.digest("hex") };
}

/**
 * Keeps an upload invisible after a failed validation or DB write. A failed
 * delete leaves the failed intent and opaque key for the maintenance routine.
 */
async function compensateUpload(
  repository: DocumentUploadRepository,
  storage: DocumentStorage,
  intent: { tenantId: string; id: string; storageKey: string }
) {
  await repository.failUploadIntent(intent.tenantId, intent.id);
  try {
    await storage.delete(intent.storageKey);
    return { kind: "rejected" as const, code: "upload_validation_failed" };
  } catch {
    return { kind: "compensation_pending" as const };
  }
}

/**
 * Service for an authenticated browser upload and a verified provider callback.
 * `begin` rechecks permissions itself; `finalize` trusts only the callback's
 * intent identifier and then verifies the object again from private storage.
 */
export function createDocumentUploadIntake(
  dependencies: DocumentUploadIntakeDependencies = {}
) {
  const storage = dependencies.storage ?? new VercelBlobDocumentStorage();
  const repository = dependencies.repository ?? defaultRepository;
  const now = dependencies.now ?? (() => new Date());

  return {
    async begin(
      input: CreateDocumentUploadInput,
      suppliedActor?: AuthContext
    ): Promise<BeginDocumentUploadResult> {
      const actor = suppliedActor ?? (await verifySession());
      authorizeOrThrow(actor, "documentos", "escrever");
      const startedAt = now();
      if (!validInput(input, startedAt)) {
        return { kind: "invalid", code: "upload_input_invalid" };
      }

      const intentId = randomUUID();
      const intentInput: CreateUploadIntentInput = {
        id: intentId,
        requestedByUserId: actor.user.id,
        clientSha256: input.clientSha256,
        name: input.name.trim(),
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        modality: input.modality,
        categoryId: input.categoryId ?? null,
        expiresAt: input.expiresAt ?? null,
        storageKey: createDocumentStorageKey(actor.tenantId, intentId),
        expiresAtIntent: new Date(startedAt.getTime() + UPLOAD_INTENT_TTL_MS),
      };
      const created = await repository.createUploadIntent(
        actor.tenantId,
        intentInput,
        startedAt
      );
      if (created.kind === "active_duplicate") return { kind: "duplicate_upload" };

      try {
        const grant = await storage.authorizeClientUpload({
          key: created.intent.storageKey,
          contentType: created.intent.mimeType,
          contentLength: Number(created.intent.sizeBytes),
          expiresAt: created.intent.expiresAtIntent,
        });
        return { kind: "ready", intentId: created.intent.id, grant };
      } catch {
        await repository.failUploadIntent(actor.tenantId, created.intent.id);
        return { kind: "storage_failure" };
      }
    },

    async finalize(intentId: string): Promise<FinalizeDocumentUploadResult> {
      const initialIntent = await repository.findUploadIntentById(intentId);
      if (!initialIntent) return { kind: "not_found" };

      const claim = await repository.claimUploadIntentForFinalization(
        initialIntent.tenantId,
        intentId,
        now()
      );
      if (claim.kind === "already_committed") {
        return { kind: "committed", documentId: claim.documentId };
      }
      if (claim.kind === "expired") return { kind: "expired" };
      if (claim.kind !== "claimed") return { kind: "not_finalizable" };

      try {
        const metadata = await storage.head(claim.intent.storageKey);
        const object = await storage.open(claim.intent.storageKey);
        if (
          !metadata ||
          !object ||
          metadata.etag !== object.etag ||
          metadata.contentType !== claim.intent.mimeType ||
          metadata.size !== Number(claim.intent.sizeBytes)
        ) {
          return compensateUpload(repository, storage, claim.intent);
        }

        const verified = await hashAndValidateStream(
          object.stream,
          metadata.contentType,
          claim.intent.sizeBytes
        );
        if (
          !verified.ok ||
          verified.contentSha256 !== claim.intent.clientSha256
        ) {
          return compensateUpload(repository, storage, claim.intent);
        }

        const committed = await repository.commitUploadIntent(
          claim.intent.tenantId,
          claim.intent.id,
          {
            storageProvider: "vercel_blob",
            storageEtag: metadata.etag,
            contentSha256: verified.contentSha256,
            now: now(),
          }
        );
        if (committed.kind === "committed") {
          return { kind: "committed", documentId: committed.document.id };
        }
        if (committed.kind === "already_committed") {
          return { kind: "committed", documentId: committed.documentId };
        }
        if (committed.kind === "duplicate_content") {
          const compensation = await compensateUpload(repository, storage, claim.intent);
          return compensation.kind === "compensation_pending"
            ? compensation
            : { kind: "duplicate_content", documentId: committed.documentId };
        }
        if (committed.kind === "expired") return { kind: "expired" };
        return { kind: "not_finalizable" };
      } catch {
        return compensateUpload(repository, storage, claim.intent);
      }
    },
  };
}
