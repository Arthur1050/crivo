import { DOCUMENT_STATUS } from "../../lib/vocabulary";
import { Buffer } from "node:buffer";

import { documentSegmentValues, type DocumentSegment, type DocumentSegmentFacet } from "./segments";

export type { DocumentSegment } from "./segments";

export interface ContextBudgetDocument {
  id: string;
  name: string;
  segment: DocumentSegment;
  content: string;
  uploadedAt: Date;
  status: typeof DOCUMENT_STATUS.ready | typeof DOCUMENT_STATUS.outside_agent | typeof DOCUMENT_STATUS.processing;
  category?: { name: string; color: string } | null;
}

export interface DocumentContextEnvelope {
  retrievalMode: "direct";
  documents: Array<{
    id: string;
    name: string;
    modality: DocumentSegment;
    category: { name: string; color: string } | null;
    contentMode: "full";
    content: string;
  }>;
}

export type ContextLimits = Partial<Record<DocumentSegment, number>>;

function applies(document: ContextBudgetDocument, query: DocumentSegment, facet: DocumentSegmentFacet | null) {
  return facet?.matches(document.segment, query) ?? true;
}

function sortDocuments(documents: ContextBudgetDocument[]) {
  return [...documents].sort((left, right) => left.uploadedAt.getTime() - right.uploadedAt.getTime() || left.id.localeCompare(right.id));
}

export function buildCanonicalContext(
  documents: ContextBudgetDocument[], segment: DocumentSegment, facet: DocumentSegmentFacet | null
): DocumentContextEnvelope {
  return {
    retrievalMode: "direct",
    documents: sortDocuments(documents)
      .filter((document) => applies(document, segment, facet))
      .map(({ id, name, segment: documentSegment, category = null, content }) => ({
        id, name, modality: documentSegment, category, contentMode: "full", content,
      })),
  };
}

/** Exact UTF-8 byte count of the API's canonical direct-context response. */
export function measureCanonicalContext(envelope: DocumentContextEnvelope) {
  return Buffer.byteLength(JSON.stringify(envelope), "utf8");
}

export interface AdmissionResult {
  statusByDocumentId: Map<string, typeof DOCUMENT_STATUS.ready | typeof DOCUMENT_STATUS.outside_agent>;
  contexts: Record<string, DocumentContextEnvelope>;
}

export interface CorpusOverflow {
  segment: DocumentSegment;
  corpusBytes: number;
  ceilingBytes: number;
  excludedDocuments: number;
}

/**
 * Modalidades cujo corpus elegível inteiro não cabe no teto medido — o gatilho
 * mensurável do lote condicional de RAG (DOCLIM-01 AC12). Só números: nenhum
 * nome, id ou conteúdo. Teto zero (sem benchmark) não é gatilho: ali nada é
 * medido, não é o corpus que cresceu.
 */
export function findCorpusOverflow(
  documents: ContextBudgetDocument[],
  limits: ContextLimits,
  result: AdmissionResult,
  facet: DocumentSegmentFacet | null
): CorpusOverflow[] {
  return documentSegmentValues(facet).flatMap((segment) => {
    const ceilingBytes = limits[segment] ?? 0;
    if (ceilingBytes <= 0) return [];
    const corpusBytes = measureCanonicalContext(buildCanonicalContext(documents, segment, facet));
    if (corpusBytes <= ceilingBytes) return [];
    const excludedDocuments = documents.filter(
      (document) => applies(document, segment, facet) && result.statusByDocumentId.get(document.id) === DOCUMENT_STATUS.outside_agent
    ).length;
    return [{ segment, corpusBytes, ceilingBytes, excludedDocuments }];
  });
}

/**
 * Preserves admitted documents, then evaluates outsiders by age. A rejected
 * older outsider never prevents a later one from being considered.
 */
export function reconcileDocumentAdmission(
  documents: ContextBudgetDocument[],
  limits: ContextLimits,
  facet: DocumentSegmentFacet | null
): AdmissionResult {
  const currentIncumbents = sortDocuments(documents.filter((document) => document.status === DOCUMENT_STATUS.ready));
  const requiresRebalance = documentSegmentValues(facet).some(
    (segment) => measureCanonicalContext(buildCanonicalContext(currentIncumbents, segment, facet)) > (limits[segment] ?? 0)
  );
  const incumbents = requiresRebalance ? [] : currentIncumbents;
  const outsiders = requiresRebalance
    ? sortDocuments(documents)
    : sortDocuments(documents.filter((document) => document.status !== DOCUMENT_STATUS.ready));
  const admitted = [...incumbents];
  const statusByDocumentId = new Map<string, typeof DOCUMENT_STATUS.ready | typeof DOCUMENT_STATUS.outside_agent>();
  for (const document of incumbents) statusByDocumentId.set(document.id, DOCUMENT_STATUS.ready);

  for (const candidate of outsiders) {
    const proposed = [...admitted, candidate];
    const fits = documentSegmentValues(facet).every(
      (segment) => !applies(candidate, segment, facet) || measureCanonicalContext(buildCanonicalContext(proposed, segment, facet)) <= (limits[segment] ?? 0)
    );
    if (fits) {
      admitted.push(candidate);
      statusByDocumentId.set(candidate.id, DOCUMENT_STATUS.ready);
    } else {
      statusByDocumentId.set(candidate.id, DOCUMENT_STATUS.outside_agent);
    }
  }
  return {
    statusByDocumentId,
    contexts: Object.fromEntries(documentSegmentValues(facet).map((segment) => [
      segment, buildCanonicalContext(admitted, segment, facet),
    ])),
  };
}
