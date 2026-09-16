import { Buffer } from "node:buffer";

export type DocumentModality = "novo" | "usado" | "ambos";

export interface ContextBudgetDocument {
  id: string;
  name: string;
  modality: DocumentModality;
  content: string;
  uploadedAt: Date;
  status: "pronto" | "fora_do_agente" | "processando";
  category?: { name: string; color: string } | null;
}

export interface DocumentContextEnvelope {
  retrievalMode: "direct";
  documents: Array<{
    id: string;
    name: string;
    modality: DocumentModality;
    category: { name: string; color: string } | null;
    contentMode: "full";
    content: string;
  }>;
}

export type ContextLimits = Record<DocumentModality, number>;

function applies(document: ContextBudgetDocument, query: DocumentModality) {
  return query === "ambos" || document.modality === "ambos" || document.modality === query;
}

function sortDocuments(documents: ContextBudgetDocument[]) {
  return [...documents].sort((left, right) => left.uploadedAt.getTime() - right.uploadedAt.getTime() || left.id.localeCompare(right.id));
}

export function buildCanonicalContext(documents: ContextBudgetDocument[], modality: DocumentModality): DocumentContextEnvelope {
  return {
    retrievalMode: "direct",
    documents: sortDocuments(documents)
      .filter((document) => applies(document, modality))
      .map(({ id, name, modality: documentModality, category = null, content }) => ({
        id, name, modality: documentModality, category, contentMode: "full", content,
      })),
  };
}

/** Exact UTF-8 byte count of the API's canonical direct-context response. */
export function measureCanonicalContext(envelope: DocumentContextEnvelope) {
  return Buffer.byteLength(JSON.stringify(envelope), "utf8");
}

export interface AdmissionResult {
  statusByDocumentId: Map<string, "pronto" | "fora_do_agente">;
  contexts: Record<DocumentModality, DocumentContextEnvelope>;
}

/**
 * Preserves admitted documents, then evaluates outsiders by age. A rejected
 * older outsider never prevents a later one from being considered.
 */
export function reconcileDocumentAdmission(
  documents: ContextBudgetDocument[],
  limits: ContextLimits
): AdmissionResult {
  const currentIncumbents = sortDocuments(documents.filter((document) => document.status === "pronto"));
  const requiresRebalance = (["novo", "usado", "ambos"] as const).some(
    (modality) => measureCanonicalContext(buildCanonicalContext(currentIncumbents, modality)) > limits[modality]
  );
  const incumbents = requiresRebalance ? [] : currentIncumbents;
  const outsiders = requiresRebalance
    ? sortDocuments(documents)
    : sortDocuments(documents.filter((document) => document.status !== "pronto"));
  const admitted = [...incumbents];
  const statusByDocumentId = new Map<string, "pronto" | "fora_do_agente">();
  for (const document of incumbents) statusByDocumentId.set(document.id, "pronto");

  for (const candidate of outsiders) {
    const proposed = [...admitted, candidate];
    const fits = (["novo", "usado", "ambos"] as const).every(
      (modality) => !applies(candidate, modality) || measureCanonicalContext(buildCanonicalContext(proposed, modality)) <= limits[modality]
    );
    if (fits) {
      admitted.push(candidate);
      statusByDocumentId.set(candidate.id, "pronto");
    } else {
      statusByDocumentId.set(candidate.id, "fora_do_agente");
    }
  }
  return {
    statusByDocumentId,
    contexts: {
      novo: buildCanonicalContext(admitted, "novo"),
      usado: buildCanonicalContext(admitted, "usado"),
      ambos: buildCanonicalContext(admitted, "ambos"),
    },
  };
}
