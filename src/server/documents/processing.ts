import "server-only";

import { DocumentStorageError, type DocumentStorage } from "./storage";
import { extractDocument, type ExtractionResult } from "./extraction";
import {
  claimDocumentProcessingRetry,
  completeDocumentProcessing,
  getDocumentForProcessing,
  reconcileTenantDocumentAdmission,
} from "./repository";

export interface ProcessingDocument {
  id: string;
  tenantId: string;
  storageKey: string;
  mimeType: string;
  status: "processando";
  processingAttempt: number;
  expiresAt: Date | null;
  deletedAt: Date | null;
}

export interface ProcessingRepository {
  getForProcessing(tenantId: string, documentId: string, attempt: number, now: Date): Promise<ProcessingDocument | null>;
  complete(tenantId: string, input: {
    documentId: string;
    processingAttempt: number;
    status: "pronto" | "falha";
    extractedText?: string | null;
    extractedBytes?: number | null;
    extractorVersion?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    now: Date;
  }): Promise<"applied" | "stale">;
  reconcile(tenantId: string, now: Date): Promise<void>;
  claimRetry(tenantId: string, documentId: string, now: Date): Promise<{ kind: "claimed" | "active"; attempt: number } | { kind: "stale" }>;
}

export interface ProcessingStart {
  (input: { tenantId: string; documentId: string; attempt: number }): Promise<{ id: string }>;
}

const defaultRepository: ProcessingRepository = {
  getForProcessing: getDocumentForProcessing,
  complete: completeDocumentProcessing,
  reconcile: reconcileTenantDocumentAdmission,
  claimRetry: claimDocumentProcessingRetry,
};

async function readAll(stream: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function extractionFailure(result: Extract<ExtractionResult, { ok: false }>) {
  return result.code === "extracao_transitoria"
    ? { kind: "retryable" as const, code: result.code }
    : { kind: "failed" as const, code: result.code };
}

export function createDocumentProcessingService(input: {
  storage: DocumentStorage;
  start: ProcessingStart;
  extract?: typeof extractDocument;
  repository?: ProcessingRepository;
  now?: () => Date;
  extractorVersion?: string;
}) {
  const repository = input.repository ?? defaultRepository;
  const extract = input.extract ?? extractDocument;
  const now = input.now ?? (() => new Date());
  const extractorVersion = input.extractorVersion ?? "native-v1";

  async function fail(
    tenantId: string,
    documentId: string,
    attempt: number,
    code: string,
    at: Date
  ) {
    const completion = await repository.complete(tenantId, {
      documentId,
      processingAttempt: attempt,
      status: "falha",
      failureCode: code,
      failureMessage: code === "processamento_indisponivel"
        ? "Não foi possível processar agora. Tente novamente."
        : undefined,
      now: at,
    });
    return completion === "applied" ? { kind: "failed" as const, code } : { kind: "stale" as const };
  }

  return {
    async process(job: { tenantId: string; documentId: string; attempt: number }) {
      const at = now();
      const document = await repository.getForProcessing(job.tenantId, job.documentId, job.attempt, at);
      if (!document || document.deletedAt || (document.expiresAt && document.expiresAt <= at)) return { kind: "stale" as const };

      let opened;
      try {
        opened = await input.storage.open(document.storageKey);
      } catch (error) {
        if (error instanceof DocumentStorageError && error.kind === "transient") return { kind: "retryable" as const, code: "storage_indisponivel" };
        return fail(job.tenantId, job.documentId, job.attempt, "storage_invalido", at);
      }
      if (!opened) return fail(job.tenantId, job.documentId, job.attempt, "original_ausente", at);

      const extracted = await extract({ mimeType: document.mimeType, bytes: await readAll(opened.stream) });
      if (!extracted.ok) {
        const failure = extractionFailure(extracted);
        if (failure.kind === "retryable") return failure;
        return fail(job.tenantId, job.documentId, job.attempt, failure.code, at);
      }

      const completion = await repository.complete(job.tenantId, {
        documentId: job.documentId,
        processingAttempt: job.attempt,
        status: "pronto",
        extractedText: extracted.text,
        extractedBytes: extracted.extractedBytes,
        extractorVersion,
        now: at,
      });
      if (completion !== "applied") return { kind: "stale" as const };
      await repository.reconcile(job.tenantId, at);
      return { kind: "completed" as const, status: "pronto" as const };
    },

    async retry(job: { tenantId: string; documentId: string }) {
      const at = now();
      const claimed = await repository.claimRetry(job.tenantId, job.documentId, at);
      if (claimed.kind === "stale") return { kind: "stale" as const };
      try {
        const run = await input.start({ tenantId: job.tenantId, documentId: job.documentId, attempt: claimed.attempt });
        return { kind: "scheduled" as const, attempt: claimed.attempt, runId: run.id };
      } catch {
        if (claimed.attempt < 3) return { kind: "dispatch_failed" as const, attempt: claimed.attempt };
        return fail(job.tenantId, job.documentId, claimed.attempt, "processamento_indisponivel", at);
      }
    },
  };
}
