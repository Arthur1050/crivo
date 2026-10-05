/** T67: relatório readonly. Não publica, ativa, restaura workflow ou altera DB/env.
 * Uso: tsx scripts/reengagement-publication-check.ts --evidence <metadata.json>
 * A coleta contém somente IDs, hashes, versões, contagens e provas revisadas.
 * Fonte/gerado não substituem observar instalação e assinatura efetivas.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inlineWorkflowSource } from "./n8n-inline.mjs";
import { preparePrincipalStatusPublication, type StatusPublicationEvidence } from "./n8n-status-publication";

type Graph = Parameters<typeof preparePrincipalStatusPublication>[0] & { settings?: unknown };
type Gate = { state: "confirmed" | "pending"; code: string };
type Role = "principal" | "scheduler" | "reengagement-contextual";
const roles: Role[] = ["principal", "scheduler", "reengagement-contextual"];
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
const time = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const gate = (confirmed: boolean, ok: string, pending: string): Gate => ({ state: confirmed ? "confirmed" : "pending", code: confirmed ? ok : pending });
function canonical(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/\r\n/g, "\n");
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export const publicationDigest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const textDigest = (value: string) => createHash("sha256").update(value.replace(/\r\n/g, "\n")).digest("hex");

/** Exclui exemplos/pinData e posições; inclui configuração efetiva, retries,
 * credenciais referenciadas e conexões. O conteúdo só sai como hash.
 */
export function workflowOperationsDigest(graph: Graph) {
  return publicationDigest({ nodes: graph.nodes.map((node) => {
    const effective = node as Graph["nodes"][number] & Record<string, unknown>;
    return Object.fromEntries(["name", "type", "typeVersion", "parameters", "credentials", "disabled", "onError", "retryOnFail", "maxTries", "waitBetweenTries", "executeOnce", "alwaysOutputData", "continueOnFail"]
      .filter((key) => effective[key] !== undefined).map((key) => [key, effective[key]]));
  }).sort((a, b) => String(a.name).localeCompare(String(b.name))), connections: graph.connections, settings: graph.settings ?? {} });
}
export interface LocalPublicationArtifact {
  role: Role;
  sourceHash: string;
  expectedGeneratedHash: string;
  generatedHash: string;
  operationsHash: string;
  graph: Graph;
}
export interface InstalledObservation {
  source: "n8n-readonly";
  workflowId: string;
  observedAt: string;
  active: boolean | null;
  /** Ausência não é suprida pela versão mais recente do histórico. */
  activeVersionId?: string;
  latestSavedVersionId?: string;
  operationsHash?: string;
  serializerHash?: string;
  trigger?: Graph["nodes"][number];
  credentialSha256?: string;
}
export interface QueueObservation {
  source: "n8n-readonly"; workflowId: string; observedAt: string;
  requestedStatuses: string[]; count: number; estimated: boolean;
  data: { id: string; workflowId: string; status: string; versionId?: string }[];
}
export interface PublicationEvidence {
  targets: { role: Role; workflowId: string }[];
  installed?: InstalledObservation[];
  signature?: { source: "installed-trigger-probe"; evidence: StatusPublicationEvidence };
  queues?: QueueObservation[];
  legacyTemplate?: { source: "n8n-readonly"; workflowId: string; activeVersionId: string; observedAt: string; templateBDisabled: true; pendingTemplateExecutions: number };
  compatibility?: { source: "crm-readonly"; observedAt: string; deploymentId: string; handlerHash: string; schemaHash: string; handlersCompatible: true; schemaCompatible: true };
  account?: { source: "server-account-readonly"; observedAt: string; tenantId: string; phoneNumberId: string; wabaId: string;
    production: true; ownershipConfirmed: true; ianaConfirmed: true; analyticsMonthConfirmed: true; explicitZeroConfirmed: true; projectionCurrent: true; snapshotCurrent: true };
}
export interface LocalCompatibility { handlerHash: string; schemaHash: string }

/** Apenas provas instaladas vinculadas à leitura atual passam pelo guard T49.
 * O resultado não concede contexto de origem ao writer CRM.
 */
export function checkReengagementPublication(artifacts: LocalPublicationArtifact[], expected: LocalCompatibility, evidence: PublicationEvidence) {
  const installed = evidence.installed ?? [];
  const observations = roles.map((role) => {
    const target = evidence.targets.find((entry) => entry.role === role);
    const artifact = artifacts.find((entry) => entry.role === role);
    const observation = target && installed.find((entry) => entry.workflowId === target.workflowId);
    const observed = !!target && identifier(target.workflowId) && observation?.source === "n8n-readonly" && time(observation.observedAt);
    const versionBound = observed && uuid(observation.activeVersionId);
    const generatedEqual = !!artifact && artifact.expectedGeneratedHash === artifact.generatedHash;
    return { role, workflowId: target && identifier(target.workflowId) ? target.workflowId : null,
      sourceHash: artifact?.sourceHash ?? null, expectedGeneratedHash: artifact?.expectedGeneratedHash ?? null,
      generatedHash: artifact?.generatedHash ?? null, operationsHash: artifact?.operationsHash ?? null,
      activeVersionId: versionBound ? observation.activeVersionId : null,
      latestSavedVersionId: observed && uuid(observation.latestSavedVersionId) ? observation.latestSavedVersionId : null,
      local: gate(generatedEqual, "source-generated-equivalent", "source-generated-divergent"),
      published: gate(!!artifact && versionBound && observation.active === true && observation.operationsHash === artifact.operationsHash,
        "installed-operations-equivalent", "installed-version-or-operations-unverified") };
  });
  const principalTarget = evidence.targets.find((entry) => entry.role === "principal");
  const principal = principalTarget && installed.find((entry) => entry.workflowId === principalTarget.workflowId && entry.source === "n8n-readonly" && time(entry.observedAt));
  const localPrincipal = artifacts.find((entry) => entry.role === "principal");
  const localTrigger = localPrincipal?.graph.nodes.find((node) => node.type === "n8n-nodes-base.whatsAppTrigger");
  const serializerVerified = !!principal?.trigger && uuid(principal.activeVersionId) && !!localTrigger
    && principal.serializerHash === publicationDigest(principal.trigger.parameters)
    && principal.serializerHash === publicationDigest(localTrigger.parameters);
  // Seleção observada é um fato distinto do probe de assinatura instalado.
  const installedOptions = principal?.trigger?.parameters.options as { messageStatusUpdates?: unknown } | undefined;
  const statusSelectionVerified = serializerVerified && JSON.stringify(installedOptions?.messageStatusUpdates) === '["delivered","failed"]';
  let originVerified = false;
  if (principal?.trigger && uuid(principal.activeVersionId) && serializerVerified
    && evidence.signature?.source === "installed-trigger-probe" && sha(principal.credentialSha256)
    && principal.credentialSha256 === evidence.signature.evidence.credentialSha256) {
    try {
      preparePrincipalStatusPublication({ nodes: [principal.trigger], connections: {} },
        { workflowId: principal.workflowId, activeVersionId: principal.activeVersionId }, evidence.signature.evidence);
      originVerified = true;
    } catch { /* A assinatura/configuração não é presumida pela fonte local. */ }
  }
  const queueReports = roles.map((role) => {
    const target = evidence.targets.find((entry) => entry.role === role);
    const queue = target && evidence.queues?.find((entry) => entry.workflowId === target.workflowId);
    const required = ["new", "running", "waiting", "unknown"];
    const complete = queue?.source === "n8n-readonly" && time(queue.observedAt) && queue.estimated === false
      && Number.isSafeInteger(queue.count) && queue.count >= 0 && queue.count === queue.data.length
      && required.every((status) => queue.requestedStatuses.includes(status))
      && queue.data.every((entry) => identifier(entry.id) && entry.workflowId === target?.workflowId && required.includes(entry.status));
    return { role, workflowId: target && identifier(target.workflowId) ? target.workflowId : null,
      count: complete ? queue.count : null,
      executionIds: complete ? queue.data.map((entry) => entry.id) : [],
      gate: gate(!!complete && queue.count === 0, "pending-executions-drained", complete ? "pending-executions-remain" : "execution-queue-unverified") };
  });
  const schedulerTarget = evidence.targets.find((entry) => entry.role === "scheduler");
  const scheduler = schedulerTarget && installed.find((entry) => entry.workflowId === schedulerTarget.workflowId && entry.source === "n8n-readonly" && time(entry.observedAt));
  const legacy = evidence.legacyTemplate;
  const templateDisabled = !!scheduler && uuid(scheduler.activeVersionId) && legacy?.source === "n8n-readonly" && time(legacy.observedAt)
    && legacy.workflowId === scheduler.workflowId && legacy.activeVersionId === scheduler.activeVersionId
    && legacy.templateBDisabled === true && legacy.pendingTemplateExecutions === 0;
  const compatibility = evidence.compatibility;
  const compatible = compatibility?.source === "crm-readonly" && time(compatibility.observedAt) && identifier(compatibility.deploymentId)
    && sha(expected.handlerHash) && sha(expected.schemaHash) && compatibility.handlerHash === expected.handlerHash && compatibility.schemaHash === expected.schemaHash
    && compatibility.handlersCompatible === true && compatibility.schemaCompatible === true;
  const account = evidence.account;
  const accountVerified = account?.source === "server-account-readonly" && time(account.observedAt) && uuid(account.tenantId)
    && /^\d+$/.test(account.phoneNumberId) && /^\d+$/.test(account.wabaId) && account.production === true
    && account.ownershipConfirmed === true && account.ianaConfirmed === true && account.analyticsMonthConfirmed === true
    && account.explicitZeroConfirmed === true && account.projectionCurrent === true && account.snapshotCurrent === true;
  const ready = observations.every((entry) => entry.local.state === "confirmed" && entry.published.state === "confirmed")
    && statusSelectionVerified && originVerified && templateDisabled && !!compatible && !!accountVerified && queueReports.every((entry) => entry.gate.state === "confirmed");
  return { dryRun: true, mutations: 0, ready,
    workflows: observations, queues: queueReports,
    serializer: gate(serializerVerified, "installed-serializer-matches", "installed-serializer-unverified"),
    statusSelection: gate(statusSelectionVerified, "installed-delivered-failed-confirmed", "installed-status-selection-unverified"),
    signature: gate(originVerified, "installed-hmac-raw-body-confirmed", "installed-signature-unverified"),
    legacyTemplate: gate(templateDisabled, "template-B-disabled-and-drained", "template-B-or-pending-executions-unverified"),
    compatibility: gate(!!compatible, "deployed-handlers-schema-compatible", "production-handlers-schema-unverified"),
    account: gate(!!accountVerified, "production-channel-state-snapshot-confirmed", "production-account-state-snapshot-unverified"),
    activation: { ready, steps: ["deploy-compatible-handlers-and-schema", "disable-template-B", "drain-prior-executions",
      "publish-readonly-generation-and-principal", "publish-scheduler-with-B-and-usage-paused", "activate-only-confirmed-channel-state-snapshot"], preserveBranches: ["A", "D", "human-send"] },
    rollback: { steps: ["pause-B-and-usage", "reconcile-accepted-records-without-redispatch", "keep-template-B-disabled"],
      preserveBranches: ["A", "D", "human-send"], preserveTombstones: true, preserveDispatchConsumption: true,
      preserveAcceptedPendingRecord: true, restoreTemplateB: false, restoreLegacyScheduler: false, rearmDispatch: false } };
}

/** Leitura local limitada a operações/provas; nada imprime fonte/gerado/grafo. */
export async function readLocalPublicationArtifacts(): Promise<LocalPublicationArtifact[]> {
  const artifacts: LocalPublicationArtifact[] = [];
  for (const role of roles) {
    const source = readFileSync(`n8n/workflows/${role}.ts`, "utf8");
    const generated = readFileSync(`n8n/generated/${role}.ts`, "utf8");
    const generatedPath = `../n8n/generated/${role}`;
    const workflowModule = await import(generatedPath) as { default: { toJSON(): Graph } };
    const graph = workflowModule.default.toJSON();
    artifacts.push({ role, sourceHash: textDigest(source), expectedGeneratedHash: textDigest(inlineWorkflowSource(source)),
      generatedHash: textDigest(generated), operationsHash: workflowOperationsDigest(graph), graph });
  }
  return artifacts;
}
export function readLocalCompatibility(): LocalCompatibility {
  const files = ["whatsapp/statuses", "whatsapp/usage/sync", "whatsapp/automation/candidates", "whatsapp/automation/channels", "whatsapp/automation/reconcile",
    "leads/[id]/agent-state", "leads/[id]/reengagement/prepare", "leads/[id]/reengagement/expire", "leads/[id]/reengagement/[episodeId]/send",
    "leads/[id]/reengagement/[episodeId]/acknowledgement", "leads/[id]/reengagement/[episodeId]/preparation-failure"];
  return { handlerHash: publicationDigest(files.map((path) => ({ path, source: readFileSync(`app/api/v1/${path}/route.ts`, "utf8") }))),
    schemaHash: textDigest(readFileSync("src/db/schema.ts", "utf8")) };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--evidence") { console.error("Uso: --evidence <metadata.json>"); process.exitCode = 1; return; }
  const evidence = JSON.parse(readFileSync(args[1], "utf8")) as PublicationEvidence;
  const report = checkReengagementPublication(await readLocalPublicationArtifacts(), readLocalCompatibility(), evidence);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/reengagement-publication-check.ts")) {
  main().catch(() => { console.error("publication-evidence-unverified"); process.exitCode = 1; });
}
