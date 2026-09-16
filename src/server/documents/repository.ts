import "server-only";

import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  documentUploadIntents,
  documents,
  tenantDocumentContextLimits,
} from "../../db/schema";

export type DocumentListItem = Omit<
  typeof documents.$inferSelect,
  "extractedText"
>;

export interface CreateUploadIntentInput {
  requestedByUserId: string;
  clientSha256: string;
  name: string;
  mimeType: string;
  sizeBytes: bigint | number;
  modality: "novo" | "usado" | "ambos";
  categoryId?: string | null;
  expiresAt?: Date | null;
  storageKey: string;
  expiresAtIntent: Date;
}

export type CreateUploadIntentResult =
  | { kind: "created"; intent: typeof documentUploadIntents.$inferSelect }
  | { kind: "active_duplicate" };

export interface CommitUploadIntentInput {
  storageProvider: string;
  storageEtag: string;
  contentSha256: string;
  now?: Date;
}

export type CommitUploadIntentResult =
  | { kind: "committed"; document: typeof documents.$inferSelect }
  | { kind: "already_committed"; documentId: string }
  | { kind: "duplicate_content"; documentId: string }
  | { kind: "expired" }
  | { kind: "not_finalizing" }
  | { kind: "not_found" };

export type ClaimUploadIntentResult =
  | { kind: "claimed"; intent: typeof documentUploadIntents.$inferSelect }
  | { kind: "already_committed"; documentId: string }
  | { kind: "expired" }
  | { kind: "not_found" }
  | { kind: "not_claimable" };

export interface CompleteProcessingInput {
  documentId: string;
  processingAttempt: number;
  status: "pronto" | "falha" | "fora_do_agente";
  extractedText?: string | null;
  extractedBytes?: number | null;
  extractorVersion?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  now?: Date;
}

export type CompareAndSetResult = "applied" | "stale";

export interface DocumentContextLimitInput {
  queryModality: "novo" | "usado" | "ambos";
  maxResponseBytes: number;
  modelId: string;
  workflowVersion: string;
  systemMessageHash: string;
  toolsHash: string;
  memoryWindow: number;
  benchmarkedAt: Date;
  staleAt?: Date | null;
  staleReason?: string | null;
  metrics: Record<string, unknown>;
}

function asBigint(value: bigint | number): bigint {
  return typeof value === "bigint" ? value : BigInt(Math.trunc(value));
}

function pgErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  return record.cause === undefined ? undefined : pgErrorCode(record.cause);
}

function isUniqueViolation(error: unknown): boolean {
  return pgErrorCode(error) === "23505";
}

/** A listagem do CRM nunca projeta o texto extraído, que só é aberto sob demanda. */
export async function listTenantDocuments(tenantId: string): Promise<DocumentListItem[]> {
  return db
    .select({
      id: documents.id,
      tenantId: documents.tenantId,
      name: documents.name,
      modality: documents.modality,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
      categoryId: documents.categoryId,
      uploadedAt: documents.uploadedAt,
      expiresAt: documents.expiresAt,
      storageProvider: documents.storageProvider,
      storageKey: documents.storageKey,
      storageEtag: documents.storageEtag,
      contentSha256: documents.contentSha256,
      status: documents.status,
      extractedBytes: documents.extractedBytes,
      extractorVersion: documents.extractorVersion,
      failureCode: documents.failureCode,
      failureMessage: documents.failureMessage,
      processingAttempt: documents.processingAttempt,
      workflowRunId: documents.workflowRunId,
      processingStartedAt: documents.processingStartedAt,
      processedAt: documents.processedAt,
      deletedAt: documents.deletedAt,
      deletionAttempts: documents.deletionAttempts,
      deletionLastErrorCode: documents.deletionLastErrorCode,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.uploadedAt));
}

/** Reserves one active upload intent per tenant/hash, expiring old reservations first. */
export async function createUploadIntent(
  tenantId: string,
  input: CreateUploadIntentInput,
  now = new Date()
): Promise<CreateUploadIntentResult> {
  return db.transaction(async (tx) => {
    await tx
      .update(documentUploadIntents)
      .set({ state: "failed" })
      .where(
        and(
          eq(documentUploadIntents.tenantId, tenantId),
          lte(documentUploadIntents.expiresAtIntent, now),
          sql`${documentUploadIntents.state} in ('pending', 'finalizing')`
        )
      );

    try {
      const [intent] = await tx
        .insert(documentUploadIntents)
        .values({
          tenantId,
          ...input,
          sizeBytes: asBigint(input.sizeBytes),
        })
        .returning();
      return { kind: "created", intent };
    } catch (error) {
      if (isUniqueViolation(error)) return { kind: "active_duplicate" };
      throw error;
    }
  });
}

/** Claims a pending intent with a tenant-scoped compare-and-set. */
export async function claimUploadIntentForFinalization(
  tenantId: string,
  intentId: string,
  now = new Date()
): Promise<ClaimUploadIntentResult> {
  const [claimed] = await db
    .update(documentUploadIntents)
    .set({ state: "finalizing" })
    .where(
      and(
        eq(documentUploadIntents.tenantId, tenantId),
        eq(documentUploadIntents.id, intentId),
        eq(documentUploadIntents.state, "pending"),
        gt(documentUploadIntents.expiresAtIntent, now)
      )
    )
    .returning();
  if (claimed) return { kind: "claimed", intent: claimed };

  const [intent] = await db
    .select({
      state: documentUploadIntents.state,
      documentId: documentUploadIntents.documentId,
      expiresAtIntent: documentUploadIntents.expiresAtIntent,
    })
    .from(documentUploadIntents)
    .where(and(eq(documentUploadIntents.tenantId, tenantId), eq(documentUploadIntents.id, intentId)));
  if (!intent) return { kind: "not_found" };
  if (intent.state === "committed" && intent.documentId) {
    return { kind: "already_committed", documentId: intent.documentId };
  }
  if (intent.expiresAtIntent <= now) return { kind: "expired" };
  return { kind: "not_claimable" };
}

/** Commits a claimed intent exactly once and translates uniqueness into domain results. */
export async function commitUploadIntent(
  tenantId: string,
  intentId: string,
  input: CommitUploadIntentInput
): Promise<CommitUploadIntentResult> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [intent] = await tx
      .select()
      .from(documentUploadIntents)
      .where(and(eq(documentUploadIntents.tenantId, tenantId), eq(documentUploadIntents.id, intentId)));
    if (!intent) return { kind: "not_found" };
    if (intent.state === "committed" && intent.documentId) {
      return { kind: "already_committed", documentId: intent.documentId };
    }
    if (intent.expiresAtIntent <= now) return { kind: "expired" };
    if (intent.state !== "finalizing") return { kind: "not_finalizing" };

    const [document] = await tx
      .insert(documents)
      .values({
        tenantId,
        name: intent.name,
        mimeType: intent.mimeType,
        sizeBytes: intent.sizeBytes,
        modality: intent.modality,
        categoryId: intent.categoryId,
        expiresAt: intent.expiresAt,
        storageProvider: input.storageProvider,
        storageKey: intent.storageKey,
        storageEtag: input.storageEtag,
        contentSha256: input.contentSha256,
        status: "processando",
        processingStartedAt: now,
      })
      .onConflictDoNothing({
        target: [documents.tenantId, documents.contentSha256],
        where: sql`${documents.deletedAt} is null`,
      })
      .returning();
    if (document) {
      await tx
        .update(documentUploadIntents)
        .set({ state: "committed", documentId: document.id, storageEtag: input.storageEtag })
        .where(and(eq(documentUploadIntents.tenantId, tenantId), eq(documentUploadIntents.id, intentId)));
      return { kind: "committed", document };
    }
    const [existing] = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.contentSha256, input.contentSha256),
          isNull(documents.deletedAt)
        )
      );
    if (!existing) throw new Error("Document content conflict without active document.");
    await tx
      .update(documentUploadIntents)
      .set({ state: "committed", documentId: existing.id, storageEtag: input.storageEtag })
      .where(and(eq(documentUploadIntents.tenantId, tenantId), eq(documentUploadIntents.id, intentId)));
    return { kind: "duplicate_content", documentId: existing.id };
  });
}

export async function retryDocumentProcessing(
  tenantId: string,
  documentId: string,
  now = new Date()
): Promise<CompareAndSetResult> {
  const rows = await db
    .update(documents)
    .set({
      status: "processando",
      processingAttempt: sql`${documents.processingAttempt} + 1`,
      processingStartedAt: now,
      processedAt: null,
      extractedText: null,
      extractedBytes: null,
      extractorVersion: null,
      failureCode: null,
      failureMessage: null,
    })
    .where(
      and(
        eq(documents.tenantId, tenantId),
        eq(documents.id, documentId),
        eq(documents.status, "falha"),
        isNull(documents.deletedAt),
        sql`(${documents.expiresAt} is null or ${documents.expiresAt} > ${now})`
      )
    )
    .returning({ id: documents.id });
  return rows.length === 1 ? "applied" : "stale";
}

export async function completeDocumentProcessing(
  tenantId: string,
  input: CompleteProcessingInput
): Promise<CompareAndSetResult> {
  const now = input.now ?? new Date();
  const completion = input.status === "falha"
    ? {
        extractedText: null,
        extractedBytes: null,
        extractorVersion: null,
        failureCode: input.failureCode ?? "processamento_falhou",
        failureMessage: input.failureMessage ?? null,
      }
    : {
        extractedText: input.extractedText ?? null,
        extractedBytes: input.extractedBytes ?? null,
        extractorVersion: input.extractorVersion ?? null,
        failureCode: null,
        failureMessage: null,
      };
  const rows = await db
    .update(documents)
    .set({ status: input.status, processedAt: now, ...completion })
    .where(
      and(
        eq(documents.tenantId, tenantId),
        eq(documents.id, input.documentId),
        eq(documents.status, "processando"),
        eq(documents.processingAttempt, input.processingAttempt),
        isNull(documents.deletedAt),
        sql`(${documents.expiresAt} is null or ${documents.expiresAt} > ${now})`
      )
    )
    .returning({ id: documents.id });
  return rows.length === 1 ? "applied" : "stale";
}

export async function tombstoneDocument(
  tenantId: string,
  documentId: string,
  now = new Date()
): Promise<"tombstoned" | "already_tombstoned" | "not_found"> {
  const rows = await db
    .update(documents)
    .set({
      deletedAt: now,
      extractedText: null,
      extractedBytes: null,
      extractorVersion: null,
      failureCode: null,
      failureMessage: null,
    })
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId), isNull(documents.deletedAt)))
    .returning({ id: documents.id });
  if (rows.length === 1) return "tombstoned";
  const [existing] = await db
    .select({ deletedAt: documents.deletedAt })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)));
  return existing ? "already_tombstoned" : "not_found";
}

export async function expireDueDocuments(now = new Date()): Promise<string[]> {
  const rows = await db
    .update(documents)
    .set({ deletedAt: now, extractedText: null, extractedBytes: null, extractorVersion: null })
    .where(and(isNull(documents.deletedAt), lte(documents.expiresAt, now)))
    .returning({ id: documents.id });
  return rows.map((row) => row.id);
}

export async function upsertDocumentContextLimit(
  tenantId: string,
  input: DocumentContextLimitInput
): Promise<typeof tenantDocumentContextLimits.$inferSelect> {
  const [limit] = await db
    .insert(tenantDocumentContextLimits)
    .values({ tenantId, ...input })
    .onConflictDoUpdate({
      target: [tenantDocumentContextLimits.tenantId, tenantDocumentContextLimits.queryModality],
      set: {
        maxResponseBytes: input.maxResponseBytes,
        modelId: input.modelId,
        workflowVersion: input.workflowVersion,
        systemMessageHash: input.systemMessageHash,
        toolsHash: input.toolsHash,
        memoryWindow: input.memoryWindow,
        benchmarkedAt: input.benchmarkedAt,
        staleAt: input.staleAt ?? null,
        staleReason: input.staleReason ?? null,
        metrics: input.metrics,
      },
    })
    .returning();
  return limit;
}
