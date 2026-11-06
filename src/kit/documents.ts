import "server-only";
import { createDocumentUploadIntake as createIntake, type DocumentUploadIntakeDependencies } from "../server/documents/uploads";
import { verifySession } from "./session";
export * from "../server/documents/uploads";
export function createDocumentUploadIntake(dependencies: DocumentUploadIntakeDependencies = {}) {
  return createIntake({ getActor: verifySession, ...dependencies });
}
