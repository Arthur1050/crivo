import "server-only";

import { start } from "workflow/api";
import { processDocumentWorkflow } from "../../../workflows/process-document";
import type { ProcessingStart } from "./processing";

/**
 * Único ponto que liga o domínio ao runtime do Workflow. O input durável leva
 * só identidades e o attempt lógico — nunca binário, texto ou pergunta.
 */
export const startDocumentProcessingRun: ProcessingStart = async (job) => {
  const run = await start(processDocumentWorkflow, [job]);
  return { id: run.runId };
};
