import "server-only";

import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  documentUploadIntents,
  documents,
  tenantDocumentContextLimits,
} from "../../db/schema";
import { reconcileDocumentAdmission, type ContextBudgetDocument, type ContextLimits } from "./context-budget";

export type DocumentListItem = Omit<
  typeof documents.$inferSelect,
  "extractedText"
>;

/** Minimal, tenant-scoped projection for the CRM's on-demand text preview. */
export interface DocumentTextPreview {
  status: "pronto" | "fora_do_agente";
  extractedText: string;
}

export interface DocumentDownload {
  storageKey: string;
  name: string;
  mimeType: string;
}

export async function findDocumentForDownload(tenantId: string, documentId: string, now = new Date()): Promise<DocumentDownload | null> {
  const [document] = await db.select({ storageKey: documents.storageKey, name: documents.name, mimeType: documents.mimeType })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId), isNull(documents.deletedAt), sql`(${documents.expiresAt} is null or ${documents.expiresAt} > ${now})`));
  return document ?? null;
}

export async function findDocumentTextPreview(
  tenantId: string,
  documentId: string,
  now = new Date()
): Promise<DocumentTextPreview | null> {
  const [document] = await db
    .select({ status: documents.status, extractedText: documents.extractedText })
    .from(documents)
    .where(and(
      eq(documents.tenantId, tenantId),
      eq(documents.id, documentId),
      isNull(documents.deletedAt),
      sql`(${documents.expiresAt} is null or ${documents.expiresAt} > ${now})`,
      sql`${documents.status} in ('pronto', 'fora_do_agente')`,
      sql`${documents.extractedText} is not null`
    ));
  if (!document?.extractedText) return null;
  return { status: document.status as DocumentTextPreview["status"], extractedText: document.extractedText };
}

export interface CreateUploadIntentInput {
  id?: string;
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

/** Lookup interno para callback já autenticado pelo provedor; nunca é exposto ao CRM. */
export async function findUploadIntentById(intentId: string) {
  const [intent] = await db
    .select()
    .from(documentUploadIntents)
    .where(eq(documentUploadIntents.id, intentId));
  return intent ?? null;
}

/** Keeps a failed upload invisible while its private object is compensated later. */
export async function failUploadIntent(
  tenantId: string,
  intentId: string
): Promise<void> {
  await db
    .update(documentUploadIntents)
    .set({ state: "failed" })
    .where(
      and(
        eq(documentUploadIntents.tenantId, tenantId),
        eq(documentUploadIntents.id, intentId),
        sql`${documentUploadIntents.state} in ('pending', 'finalizing')`
      )
    );
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

/** Claims exactly one retry attempt; concurrent callers reuse the active attempt. */
export async function claimDocumentProcessingRetry(
  tenantId: string,
  documentId: string,
  now = new Date()
): Promise<{ kind: "claimed" | "active"; attempt: number } | { kind: "stale" }> {
  const updated = await retryDocumentProcessing(tenantId, documentId, now);
  if (updated === "applied") {
    const [row] = await db
      .select({ processingAttempt: documents.processingAttempt })
      .from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)));
    if (row) return { kind: "claimed", attempt: row.processingAttempt };
  }
  const [active] = await db
    .select({ processingAttempt: documents.processingAttempt, status: documents.status, deletedAt: documents.deletedAt, expiresAt: documents.expiresAt })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)));
  if (active?.status === "processando" && !active.deletedAt && (!active.expiresAt || active.expiresAt > now)) {
    return { kind: "active", attempt: active.processingAttempt };
  }
  return { kind: "stale" };
}

/** Returns only an active processing attempt, so a late Workflow run cannot read a tombstoned row. */
export async function getDocumentForProcessing(
  tenantId: string,
  documentId: string,
  attempt: number,
  now = new Date()
) {
  const [document] = await db
    .select({
      id: documents.id,
      tenantId: documents.tenantId,
      storageKey: documents.storageKey,
      mimeType: documents.mimeType,
      status: documents.status,
      processingAttempt: documents.processingAttempt,
      expiresAt: documents.expiresAt,
      deletedAt: documents.deletedAt,
    })
    .from(documents)
    .where(and(
      eq(documents.tenantId, tenantId),
      eq(documents.id, documentId),
      eq(documents.status, "processando"),
      eq(documents.processingAttempt, attempt),
      isNull(documents.deletedAt),
      sql`(${documents.expiresAt} is null or ${documents.expiresAt} > ${now})`
    ));
  // O predicado já restringe o estado; estreitar aqui mantém o tipo do retorno
  // fiel ao que a query garante, em vez do enum inteiro da coluna.
  return document ? { ...document, status: "processando" as const } : null;
}

/** Reapplies the published direct-context limits after text becomes available. */
export async function reconcileTenantDocumentAdmission(tenantId: string, now = new Date()): Promise<void> {
  const limitsRows = await db
    .select({ queryModality: tenantDocumentContextLimits.queryModality, maxResponseBytes: tenantDocumentContextLimits.maxResponseBytes })
    .from(tenantDocumentContextLimits)
    .where(and(eq(tenantDocumentContextLimits.tenantId, tenantId), isNull(tenantDocumentContextLimits.staleAt)));
  if (limitsRows.length !== 3) return;
  const limits = Object.fromEntries(limitsRows.map((row) => [row.queryModality, row.maxResponseBytes])) as ContextLimits;
  const rows = await db
    .select({ id: documents.id, name: documents.name, modality: documents.modality, extractedText: documents.extractedText, uploadedAt: documents.uploadedAt, status: documents.status })
    .from(documents)
    .where(and(
      eq(documents.tenantId, tenantId),
      isNull(documents.deletedAt),
      sql`(${documents.expiresAt} is null or ${documents.expiresAt} > ${now})`,
      sql`${documents.status} in ('pronto', 'fora_do_agente')`,
      sql`${documents.extractedText} is not null`
    ));
  const candidates: ContextBudgetDocument[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    modality: row.modality,
    content: row.extractedText!,
    uploadedAt: row.uploadedAt,
    // O predicado acima já limita a `pronto`/`fora_do_agente`; o tipo da coluna
    // carrega o enum inteiro, que a admissão não aceita.
    status: row.status as ContextBudgetDocument["status"],
  }));
  const result = reconcileDocumentAdmission(candidates, limits);
  await db.transaction(async (tx) => {
    for (const [id, status] of result.statusByDocumentId) {
      await tx.update(documents).set({ status }).where(and(eq(documents.tenantId, tenantId), eq(documents.id, id), isNull(documents.deletedAt)));
    }
  });
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

/** Internal projection for physical deletion; never expose tombstoned documents to product reads. */
export async function findTombstonedDocumentForDeletion(tenantId: string, documentId: string) {
  const [document] = await db
    .select({ storageKey: documents.storageKey })
    .from(documents)
    .where(and(
      eq(documents.tenantId, tenantId),
      eq(documents.id, documentId),
      sql`${documents.deletedAt} is not null`
    ));
  return document ?? null;
}

/** Records only the stable storage error vocabulary while a tombstone awaits another attempt. */
export async function recordDocumentDeletionFailure(
  tenantId: string,
  documentId: string,
  code: "STORAGE_OBJECT_ABSENT" | "STORAGE_TRANSIENT_FAILURE" | "STORAGE_PERMANENT_FAILURE"
) {
  await db
    .update(documents)
    .set({
      deletionAttempts: sql`${documents.deletionAttempts} + 1`,
      deletionLastErrorCode: code,
    })
    .where(and(
      eq(documents.tenantId, tenantId),
      eq(documents.id, documentId),
      sql`${documents.deletedAt} is not null`
    ));
}

/** CAS hard-delete: a row may disappear only after the private object was confirmed absent. */
export async function hardDeleteTombstonedDocument(tenantId: string, documentId: string): Promise<boolean> {
  const rows = await db
    .delete(documents)
    .where(and(
      eq(documents.tenantId, tenantId),
      eq(documents.id, documentId),
      sql`${documents.deletedAt} is not null`
    ))
    .returning({ id: documents.id });
  return rows.length === 1;
}

export async function expireDueDocuments(now = new Date()): Promise<string[]> {
  const rows = await db
    .update(documents)
    .set({ deletedAt: now, extractedText: null, extractedBytes: null, extractorVersion: null, failureCode: null, failureMessage: null })
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
