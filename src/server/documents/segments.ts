import { modalityEnum } from "../../db/schema";
import type { DocumentSegmentsFacet } from "../../vertical-kit";

export type DocumentSegment = (typeof modalityEnum.enumValues)[number];
export type DocumentSegmentFacet = Omit<DocumentSegmentsFacet, "values"> & { values: readonly DocumentSegment[] };

// A coluna física continua obrigatória até o L18c.
export const DEFAULT_DOCUMENT_SEGMENT = modalityEnum.enumValues[0];

export function documentSegmentValues(facet: DocumentSegmentFacet | null) {
  return facet?.values ?? [DEFAULT_DOCUMENT_SEGMENT];
}

export function resolveDocumentSegment(value: unknown, facet: DocumentSegmentFacet | null) {
  return facet ? facet.values.find((segment) => segment === value) : DEFAULT_DOCUMENT_SEGMENT;
}
