import "server-only";
import { createDocumentUploadIntake as createIntake, type DocumentUploadIntakeDependencies } from "../server/documents/uploads";
import { startDocumentProcessingRun } from "../server/documents/workflow-start";
import { realEstate } from "../verticals/real-estate";
import { verifySession } from "./session";
export * from "../server/documents/uploads";
export function createDocumentUploadIntake(dependencies: DocumentUploadIntakeDependencies = {}) {
  return createIntake({ getActor: verifySession, facet: realEstate.documentSegments, ...dependencies }, startDocumentProcessingRun);
}
