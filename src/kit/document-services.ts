import "server-only";

import { realEstate } from "../verticals/real-estate";
import { getDocumentSample as selectDocumentSample } from "../server/data";
import { createDocumentProcessingService as createProcessing } from "../server/documents/processing";
import { reconcileTenantDocumentAdmission as reconcileAdmission } from "../server/documents/repository";

export function createDocumentProcessingService(input: Parameters<typeof createProcessing>[0]) {
  return createProcessing({ ...input, facet: realEstate.documentSegments });
}

export function reconcileTenantDocumentAdmission(tenantId: string, now?: Date) {
  return reconcileAdmission(tenantId, now, realEstate.documentSegments);
}

export function getDocumentSample(tenantId: string) {
  return selectDocumentSample(tenantId, realEstate.documentSegments);
}
