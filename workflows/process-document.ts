import { FatalError, RetryableError } from "workflow";
import { VercelBlobDocumentStorage } from "../src/server/documents/vercel-blob-storage";
import { createDocumentProcessingService } from "../src/server/documents/processing";

export interface ProcessDocumentInput {
  tenantId: string;
  documentId: string;
  attempt: number;
}

export type ProcessDocumentOutput =
  | { kind: "completed"; status: "pronto" }
  | { kind: "failed"; code: string }
  | { kind: "stale" };

type ProcessingStepResult =
  | ProcessDocumentOutput
  | { kind: "retryable"; code: string };

/** Maps domain outcomes to Workflow's durable retry taxonomy without content. */
export function toProcessDocumentOutput(result: ProcessingStepResult): ProcessDocumentOutput {
  if (result.kind === "retryable") throw new RetryableError(result.code, { retryAfter: "1s" });
  return result;
}

function validInput(input: ProcessDocumentInput) {
  return Boolean(input.tenantId && input.documentId && Number.isInteger(input.attempt) && input.attempt > 0);
}

type ProcessDocumentStep = (input: ProcessDocumentInput) => Promise<ProcessDocumentOutput>;

/**
 * When the step exhausts its retries (transient storage or extractor), the
 * error reaches the workflow. Without this catch the run failed and the
 * document stayed `processando` forever, with no retry offered in the UI.
 */
export async function processWithTerminalFailure(
  input: ProcessDocumentInput,
  process: ProcessDocumentStep,
  abandon: ProcessDocumentStep
): Promise<ProcessDocumentOutput> {
  try {
    return await process(input);
  } catch {
    return abandon(input);
  }
}

/** The durable event log carries only opaque identities and a logical attempt. */
export async function processDocumentWorkflow(input: ProcessDocumentInput): Promise<ProcessDocumentOutput> {
  "use workflow";
  if (!validInput(input)) throw new FatalError("Invalid document processing input.");
  return processWithTerminalFailure(input, processDocumentStep, abandonDocumentStep);
}

function processingService() {
  return createDocumentProcessingService({
    storage: new VercelBlobDocumentStorage(),
    // This service entrypoint only processes an existing attempt; retry dispatch
    // is supplied by the action boundary, never included in durable payloads.
    start: async () => ({ id: "unused-process-step" }),
  });
}

/** Node I/O, storage access and extraction stay inside this retryable step. */
export async function processDocumentStep(input: ProcessDocumentInput): Promise<ProcessDocumentOutput> {
  "use step";
  const result = await processingService().process({ tenantId: input.tenantId, documentId: input.documentId, attempt: input.attempt });
  return toProcessDocumentOutput(result);
}

/** Terminal CAS after exhausted retries; a superseded attempt stays `stale`. */
export async function abandonDocumentStep(input: ProcessDocumentInput): Promise<ProcessDocumentOutput> {
  "use step";
  return processingService().abandon({ tenantId: input.tenantId, documentId: input.documentId, attempt: input.attempt });
}
