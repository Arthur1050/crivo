/** Fronteira de publicação do principal: preparar o JSON antes de qualquer upload.
 * Não constitui prova: o caller fornece a evidência observada da versão instalada.
 * T67 reutiliza esta fronteira; sem prova não há payload publicável.
 */
type PrincipalGraph = { nodes: { name: string; type: string; typeVersion: number; parameters: Record<string, unknown> }[]; connections: unknown };
export type StatusPublicationEvidence = {
  workflowId: string; activeVersionId: string; triggerVersion: number;
  signatureAlgorithm: "hmac-sha256"; signatureInput: "raw-body";
  rejectsInvalidSignatures: true; acceptsValidSignatures: true;
  credentialSha256: string; verifiedAt: string;
};

export function preparePrincipalStatusPublication(graph: PrincipalGraph, target: { workflowId: string; activeVersionId: string }, evidence?: StatusPublicationEvidence | null) {
  const trigger = graph.nodes.find((node) => node.type === "n8n-nodes-base.whatsAppTrigger");
  const options = trigger?.parameters.options as { messageStatusUpdates?: unknown } | undefined;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!evidence || evidence.workflowId !== target.workflowId || evidence.activeVersionId !== target.activeVersionId || !uuid.test(target.activeVersionId) ||
    !target.workflowId || evidence.triggerVersion !== trigger?.typeVersion || evidence.signatureAlgorithm !== "hmac-sha256" || evidence.signatureInput !== "raw-body" ||
    evidence.rejectsInvalidSignatures !== true || evidence.acceptsValidSignatures !== true || !/^[0-9a-f]{64}$/i.test(evidence.credentialSha256) ||
    !Number.isFinite(Date.parse(evidence.verifiedAt))) throw new Error("status-origin-unverified");
  if (JSON.stringify(options?.messageStatusUpdates) !== '["delivered","failed"]') throw new Error("status-trigger-config-unverified");
  return graph;
}
