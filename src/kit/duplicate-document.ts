import { duplicateDocumentMessage } from "../lib/duplicate-document";
import { realEstate } from "../verticals/real-estate";

export function formatDuplicateDocumentMessage(existingName?: string | null): string {
  return duplicateDocumentMessage(realEstate.brand.tenantNoun, existingName);
}
