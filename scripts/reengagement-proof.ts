/** T68: fixture integrada e fronteira de prova real. Nenhum executor externo é
 * embutido. CLI --check-real <metadata.json> diagnostica somente os gates.
 * Full: npx vitest run scripts/__tests__/reengagement-proof.test.ts.
 * A UI de consumo T57/T60/T61/T62 permanece deferida para L14c.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { candidatePageJobs, preparationClaim, generationForDispatch, acknowledgementForSend } from "../n8n/src/scheduler-reengagement.mjs";
import { buildReengagementPrompt } from "../n8n/src/reengagement-prompt.mjs";
import type { PreparationFrame } from "../src/server/reengagement/context";
import type { SendPreparedEpisodeOptions, SendPreparedEpisodeResult } from "../src/server/reengagement/send";
import type { AuthContext } from "../src/server/auth/session";
import type { checkReengagementPublication } from "./reengagement-publication-check";

export const DEFERRED_USAGE_UI = ["T57", "T60", "T61", "T62"] as const;
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export type ProofGraph = { nodes: { name: string; retryOnFail?: boolean; type: string; parameters: Record<string, unknown> }[];
  connections: Record<string, { main?: ({ node: string; type: string; index: number }[] | null)[] }> };
export const PROOF_LINKS: readonly [string, number, string][] = [
  ["A cada 15min", 0, "Data Table: tenants B"], ["Data Table: tenants B", 0, "Code: tenants únicos B"],
  ["Code: tenants únicos B", 0, "Loop: tenants B"], ["Loop: tenants B", 1, "Code: cursor B"],
  ["Code: cursor B", 0, "HTTP: candidatos B"], ["HTTP: candidatos B", 0, "Code: página B pronta"],
  ["Code: página B pronta", 0, "Loop: candidatos B"], ["Loop: candidatos B", 1, "Code: candidato B"],
  ["Code: candidato B", 0, "Switch: ação B"], ["Switch: ação B", 0, "HTTP: GET /leads/{id} (reengajamento)"],
  ["HTTP: GET /leads/{id} (reengajamento)", 0, "Code: condução ao vivo (reengajamento)"],
  ["Code: condução ao vivo (reengajamento)", 0, "Filter: agente pode contatar (reengajamento)"],
  ["Filter: agente pode contatar (reengajamento)", 0, "HTTP: preparar B"], ["HTTP: preparar B", 0, "Code: claim B"],
  ["Code: claim B", 0, "Claim B adquirida?"], ["Claim B adquirida?", 0, "Executar: geração B readonly"],
  ["Executar: geração B readonly", 0, "Code: geração B validada"], ["Code: geração B validada", 0, "Texto B válido no prazo?"],
  ["Texto B válido no prazo?", 0, "HTTP: enviar B uma vez"], ["HTTP: enviar B uma vez", 0, "Code: resultado B"],
  ["Code: resultado B", 0, "Aceite B precisa registro?"], ["Aceite B precisa registro?", 0, "HTTP: acknowledgement B"],
];
export async function loadProofScheduler(): Promise<ProofGraph> {
  const runtimePath = "../n8n/generated/scheduler";
  return (await import(runtimePath)).default.toJSON() as unknown as ProofGraph;
}
export function assertProofWiring(graph: ProofGraph) {
  for (const [from, output, to] of PROOF_LINKS) {
    if (!graph.connections[from]?.main?.[output]?.some((edge) => edge.node === to)) throw new Error("proof-scheduler-link-missing");
  }
  for (const name of ["HTTP: enviar B uma vez", "Executar: geração B readonly"]) {
    const node = graph.nodes.find((entry) => entry.name === name);
    if (!node || node.retryOnFail === true) throw new Error("proof-dispatch-contract-changed");
  }
}
export async function readProofThread(auth: AuthContext, conversationId: string) {
  const [{ getMessages }, { getMessageClassifications }, { MessageThread }] = await Promise.all([
    import("../src/server/data"), import("../src/server/data/whatsapp"), import("../src/components/chats/message-thread"),
  ]);
  const rows = await getMessages(auth.leadScope, conversationId);
  const pricing = await getMessageClassifications(auth, conversationId);
  const markup = renderToStaticMarkup(createElement(MessageThread, { messages: rows, pricingViews: pricing,
    leadName: "Lead de prova", emptyTitle: "Sem mensagens", emptyDescription: "Prova integrada" }));
  return { rows, pricing, markup };
}
export interface FixtureEpisodeOptions {
  tenantSlug: string; auth: AuthContext; leadId: string; conversationId: string; now: () => Date;
  graph?: ProofGraph;
  generate: (frame: PreparationFrame, prompt: ReturnType<typeof buildReengagementPrompt>) => Promise<unknown>;
  /** Obrigatório: transporte fake explícito, sem fallback ao fetch global. */
  fetch: typeof fetch;
  sendOptions?: Omit<SendPreparedEpisodeOptions, "fetch" | "now">;
  beforeSend?: () => Promise<void>;
  recordReceipt?: (sent: Extract<SendPreparedEpisodeResult, { ok: true }>) => Promise<void>;
}

export async function runFixtureEpisode(options: FixtureEpisodeOptions) {
  if (!process.env.VITEST || !process.env.TEST_DATABASE_URL || typeof options.fetch !== "function") throw new Error("proof-test-database-required");
  if (options.auth.tenantId !== options.auth.leadScope.tenantId) throw new Error("proof-tenant-scope-mismatch");
  const graph = options.graph ?? await loadProofScheduler(); assertProofWiring(graph);
  const [{ listCandidates, claimPreparation, reconcileAcceptance, releasePreparationFailure }, { prepareFrame }, { sendPreparedEpisode }] = await Promise.all([
    import("../src/server/reengagement/repository"), import("../src/server/reengagement/context"), import("../src/server/reengagement/send"),
  ]);
  const context = { tenantId: options.auth.tenantId };
  type CandidateJob = { leadId: string; anchorMessageId: string; anchorSentAt: string; phoneNumberId: string; action: "prepare" | "omit" | "escalate" | "empty"; tenantId: string };
  let cursor: string | null = null, selected: CandidateJob | undefined;
  do {
    const page = await listCandidates(context, { cursor }, { now: options.now });
    if (!page.ok) throw new Error("proof-candidates-unavailable");
    const jobs = candidatePageJobs({ ...page, cutoffAt: page.cutoffAt.toISOString() },
      { tenantSlug: options.tenantSlug, tenantId: context.tenantId, cursor, cutoffAt: null }) as CandidateJob[];
    selected = jobs.find((job) => job.leadId === options.leadId);
    cursor = page.nextCursor;
  } while (!selected && cursor);
  if (!selected || selected.action !== "prepare") return { mode: "fixture" as const, executed: false as const, code: "candidate-not-preparable", externalProof: false as const };
  const claimed = await claimPreparation(context, options.leadId, { anchorMessageId: selected.anchorMessageId }, { now: options.now });
  if (!claimed.ok || !claimed.acquired) return { mode: "fixture" as const, executed: false as const, code: "claim-unavailable", externalProof: false as const };
  const framed = await prepareFrame(context, options.leadId, claimed.episodeId, { claimToken: claimed.claimToken }, { now: options.now });
  if (!framed.ok) throw new Error("proof-frame-unavailable");
  const claim = preparationClaim({ ...claimed, claimExpiresAt: claimed.claimExpiresAt.toISOString(), frame: framed.frame }, selected, options.now().getTime());
  if (!claim.claimed) throw new Error("proof-scheduler-frame-contract-broken");
  const prompt = buildReengagementPrompt({ frame: framed.frame });
  if (!prompt.ok) throw new Error("proof-proactive-prompt-unavailable");
  const generated = generationForDispatch(await options.generate(framed.frame, prompt), claim, options.now().getTime());
  if (!generated.valid) {
    await releasePreparationFailure(context, options.leadId, claimed.episodeId, { claimToken: claimed.claimToken, code: generated.failureCode }, { now: options.now });
    return { mode: "fixture" as const, executed: false as const, code: generated.failureCode, externalProof: false as const };
  }
  await options.beforeSend?.();
  const sent = await sendPreparedEpisode(context, options.leadId, claimed.episodeId, { claimToken: claim.claimToken, text: generated.text },
    { ...options.sendOptions, fetch: options.fetch, now: options.now });
  if (!sent.ok) return { mode: "fixture" as const, executed: false as const, code: sent.reason, externalProof: false as const };
  const acknowledgement = acknowledgementForSend({ ...sent, acceptedAt: sent.acceptedAt?.toISOString() }, claim);
  if (acknowledgement.needsAck) {
    const recorded = await reconcileAcceptance(context, options.leadId, claimed.episodeId,
      { wamid: acknowledgement.acknowledgement.wamid, acceptedAt: new Date(acknowledgement.acknowledgement.acceptedAt) }, { now: options.now });
    if (!recorded.ok || !recorded.recorded) throw new Error("proof-acceptance-record-pending");
  }
  await options.recordReceipt?.(sent);
  const thread = await readProofThread(options.auth, options.conversationId);
  if (["accepted", "accepted_pending_record"].includes(sent.state)
    && !thread.rows.some((message) => message.sender === "agente" && message.externalId === sent.wamid && message.content === generated.text)) throw new Error("proof-crm-output-link-broken");
  return { mode: "fixture" as const, executed: true as const, externalProof: false as const, episodeId: claimed.episodeId,
    claimToken: claim.claimToken, frame: framed.frame, sent, textHash: digest(generated.text), thread,
    deferredUsageUI: DEFERRED_USAGE_UI };
}

type PublicationReport = ReturnType<typeof checkReengagementPublication>;
export interface RealProofGates {
  publication: PublicationReport;
  benchmark: { sharedIdentityEqual: boolean; remeasured: boolean; capacityVerified: boolean };
  executorEvidence?: { authorized: true; gateExecutionId: string };
}
export function pendingRealProof(gates: RealProofGates) {
  const pending: string[] = [];
  if (!gates.publication.ready) pending.push("installed-versions-signature-queues-channel-handlers-pending");
  if (!gates.benchmark.capacityVerified || (!gates.benchmark.sharedIdentityEqual && !gates.benchmark.remeasured)) pending.push("benchmark-evidence-pending");
  if (gates.executorEvidence?.authorized !== true || !/^[A-Za-z0-9_-]{1,128}$/.test(gates.executorEvidence.gateExecutionId)) pending.push("executor-gate-evidence-required");
  return pending;
}
export interface ProofExecutionArtifact {
  formatVersion: 1; mode: "real" | "executor-test";
  input: { tenantId: string; leadId: string; conversationId: string; anchorMessageId: string; textHash: string };
  publication: PublicationReport;
  result: { transportCalls: number; episodeId: string; wamid: string; messageId: string | null; acceptedAt: string };
  capture: { path: string; sha256: string };
  executions: { workflowId: string; executionId: string; status: "success"; activeVersionId: string; verifiedBy: "get_execution" }[];
  deferredUsageUI: typeof DEFERRED_USAGE_UI;
}
/** O caller externo fornece transporte/captura aprovados. Captura e artefato
 * persistido precedem cleanup; qualquer falha conserva o cenário para revisão.
 */
export async function runGatedProof(input: {
  mode: "real" | "executor-test"; gates: RealProofGates; proofInput: ProofExecutionArtifact["input"];
}, executor: {
  recheck: () => Promise<RealProofGates>;
  executeSingleDelivery: () => Promise<ProofExecutionArtifact["result"]>;
  executions?: () => Promise<ProofExecutionArtifact["executions"]>;
  capture: () => Promise<ProofExecutionArtifact["capture"]>;
  persist: (artifact: ProofExecutionArtifact) => Promise<{ path: string; sha256: string }>;
  cleanup: () => Promise<void>;
}) {
  let pending = pendingRealProof(input.gates);
  if (pending.length) return { executed: false, externalProof: false, pending, deferredUsageUI: DEFERRED_USAGE_UI };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (![input.proofInput.tenantId, input.proofInput.leadId, input.proofInput.conversationId, input.proofInput.anchorMessageId].every((id) => uuid.test(id))
    || !/^[0-9a-f]{64}$/.test(input.proofInput.textHash)) throw new Error("proof-input-metadata-invalid");
  const freshGates = await executor.recheck();
  pending = pendingRealProof(freshGates);
  if (pending.length) return { executed: false, externalProof: false, pending, deferredUsageUI: DEFERRED_USAGE_UI };
  if (input.mode === "real" && !executor.executions) return { executed: false, externalProof: false, pending: ["verified-executions-required"], deferredUsageUI: DEFERRED_USAGE_UI };
  const result = await executor.executeSingleDelivery();
  if (result.transportCalls !== 1 || !uuid.test(result.episodeId) || (result.messageId !== null && !uuid.test(result.messageId))
    || !/^[A-Za-z0-9_.:-]{1,2048}$/.test(result.wamid) || !Number.isFinite(Date.parse(result.acceptedAt))) throw new Error("proof-single-delivery-evidence-invalid");
  const executions = await executor.executions?.() ?? [];
  if (input.mode === "real" && (!executions.length || executions.some((entry) => entry.verifiedBy !== "get_execution" || entry.status !== "success"
    || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.workflowId) || !/^\d{1,32}$/.test(entry.executionId) || !uuid.test(entry.activeVersionId)
    || !freshGates.publication.workflows.some((workflow) => workflow.workflowId === entry.workflowId && workflow.activeVersionId === entry.activeVersionId)))) throw new Error("proof-executions-unverified");
  const capture = await executor.capture();
  if (!capture.path || digest(readFileSync(capture.path)) !== capture.sha256) throw new Error("proof-capture-not-preserved");
  const { tenantId, leadId, conversationId, anchorMessageId, textHash } = input.proofInput;
  const { transportCalls, episodeId, wamid, messageId, acceptedAt } = result;
  const artifact: ProofExecutionArtifact = { formatVersion: 1, mode: input.mode, input: { tenantId, leadId, conversationId, anchorMessageId, textHash },
    publication: freshGates.publication, result: { transportCalls, episodeId, wamid, messageId, acceptedAt }, capture: { path: capture.path, sha256: capture.sha256 }, executions: executions.map(({ workflowId, executionId, status, activeVersionId, verifiedBy }) => ({ workflowId, executionId, status, activeVersionId, verifiedBy })), deferredUsageUI: DEFERRED_USAGE_UI };
  const saved = await executor.persist(artifact);
  const bytes = readFileSync(saved.path);
  if (digest(bytes) !== saved.sha256 || JSON.stringify(JSON.parse(bytes.toString("utf8"))) !== JSON.stringify(artifact)) throw new Error("proof-artifact-not-preserved");
  await executor.cleanup();
  return { executed: true, externalProof: input.mode === "real", completeProof: false,
    artifactPath: saved.path, deferredUsageUI: DEFERRED_USAGE_UI };
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/reengagement-proof.ts")) {
  const args = process.argv.slice(2);
  try {
    if (args.length !== 2 || args[0] !== "--check-real") throw new Error("usage");
    const pending = pendingRealProof(JSON.parse(readFileSync(args[1], "utf8")) as RealProofGates);
    console.log(JSON.stringify({ mode: "real-gate-diagnostic", executed: false, pending, executor: "external-review-required", deferredUsageUI: DEFERRED_USAGE_UI }));
    process.exitCode = pending.length ? 1 : 0;
  } catch { console.error("proof-gates-unverified"); process.exitCode = 1; }
}
