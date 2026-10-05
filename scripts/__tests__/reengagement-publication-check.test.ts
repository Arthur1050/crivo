import { afterEach, describe, expect, it, vi } from "vitest";
import { checkReengagementPublication, publicationDigest, readLocalCompatibility, readLocalPublicationArtifacts, workflowOperationsDigest,
  type LocalPublicationArtifact, type PublicationEvidence } from "../reengagement-publication-check";

const now = "2026-10-05T11:08:30.000Z";
const activeVersion = "00000000-0000-4000-8000-000000000001";
const priorVersion = "00000000-0000-4000-8000-000000000002";
const expected = { handlerHash: "a".repeat(64), schemaHash: "b".repeat(64) };
const roles = ["principal", "scheduler", "reengagement-contextual"] as const;
const trigger = { name: "WhatsApp Trigger", type: "n8n-nodes-base.whatsAppTrigger", typeVersion: 1,
  parameters: { updates: ["messages"], options: { messageStatusUpdates: ["delivered", "failed"] } } };
function artifacts(): LocalPublicationArtifact[] {
  return roles.map((role) => {
    const graph = { nodes: role === "principal" ? [structuredClone(trigger)] : [], connections: {}, settings: {} };
    return { role, sourceHash: "1".repeat(64), expectedGeneratedHash: "2".repeat(64), generatedHash: "2".repeat(64),
      operationsHash: workflowOperationsDigest(graph), graph };
  });
}
function evidence(local = artifacts()): PublicationEvidence {
  const targets = roles.map((role, index) => ({ role, workflowId: `fixtureWorkflow${index}` }));
  return { targets,
    installed: targets.map((target, index) => ({ ...target, source: "n8n-readonly", observedAt: now, active: true,
      activeVersionId: activeVersion, latestSavedVersionId: activeVersion, operationsHash: local[index].operationsHash,
      ...(target.role === "principal" ? { serializerHash: publicationDigest(trigger.parameters), trigger: structuredClone(trigger), credentialSha256: "c".repeat(64) } : {}) })),
    signature: { source: "installed-trigger-probe", evidence: { workflowId: targets[0].workflowId, activeVersionId: activeVersion,
      triggerVersion: 1, signatureAlgorithm: "hmac-sha256", signatureInput: "raw-body", acceptsValidSignatures: true,
      rejectsInvalidSignatures: true, credentialSha256: "c".repeat(64), verifiedAt: now } },
    queues: targets.map((target) => ({ source: "n8n-readonly", workflowId: target.workflowId, observedAt: now,
      requestedStatuses: ["new", "running", "waiting", "unknown"], count: 0, estimated: false, data: [] })),
    legacyTemplate: { source: "n8n-readonly", workflowId: targets[1].workflowId, activeVersionId: activeVersion, observedAt: now,
      templateBDisabled: true, pendingTemplateExecutions: 0 },
    compatibility: { source: "crm-readonly", observedAt: now, deploymentId: "fixture-deployment", ...expected, handlersCompatible: true, schemaCompatible: true },
    account: { source: "server-account-readonly", observedAt: now, tenantId: "11111111-1111-1111-1111-111111111111",
      phoneNumberId: "456", wabaId: "123", production: true, ownershipConfirmed: true, ianaConfirmed: true,
      analyticsMonthConfirmed: true, explicitZeroConfirmed: true, projectionCurrent: true, snapshotCurrent: true } };
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("T67 — publicação reproduzível readonly e gates instalados", () => {
  it("distingue fonte/gerado/publicado e comprova equivalência local sem inventar instalação", async () => {
    const actual = await readLocalPublicationArtifacts();
    expect(actual).toHaveLength(3);
    for (const artifact of actual) {
      expect(artifact.expectedGeneratedHash).toBe(artifact.generatedHash);
      expect(artifact.sourceHash).not.toBe(artifact.generatedHash);
      expect(artifact.operationsHash).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(readLocalCompatibility()).toEqual({ handlerHash: expect.stringMatching(/^[a-f0-9]{64}$/), schemaHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const local = artifacts(), observed = evidence(local);
    local[1].generatedHash = "different-artifact"; observed.installed![0].operationsHash = "different-published-operations";
    const report = checkReengagementPublication(local, expected, observed);
    expect(report.workflows[0]).toMatchObject({ local: { state: "confirmed" }, published: { state: "pending" } });
    expect(report.workflows[1].local).toEqual({ state: "pending", code: "source-generated-divergent" });
    expect(report.ready).toBe(false);
    expect(checkReengagementPublication(artifacts(), expected, { targets: observed.targets }).workflows.every((entry) => entry.published.state === "pending")).toBe(true);
  });

  it("status selection e serializer exigem configuração efetiva instalada, não opções locais", () => {
    const local = artifacts(), observed = evidence(local);
    expect(checkReengagementPublication(local, expected, observed)).toMatchObject({ serializer: { state: "confirmed" },
      statusSelection: { state: "confirmed", code: "installed-delivered-failed-confirmed" } });
    for (const selection of [["all"], [], ["delivered"]]) {
      const changed = evidence(local); changed.installed![0].trigger!.parameters.options = { messageStatusUpdates: selection };
      changed.installed![0].serializerHash = publicationDigest(changed.installed![0].trigger!.parameters);
      const report = checkReengagementPublication(local, expected, changed);
      expect(report.serializer.state).toBe("pending");
      expect(report.statusSelection.state).toBe("pending");
      expect(report.ready).toBe(false);
    }
    const absent = evidence(local); delete absent.installed![0].trigger;
    expect(checkReengagementPublication(local, expected, absent).statusSelection.state).toBe("pending");
  });

  it("garantia HMAC precisa probe válido/ inválido e corpo bruto na versão/credencial instalada", () => {
    const local = artifacts();
    for (const patch of [{ activeVersionId: priorVersion }, { triggerVersion: 2 }, { rejectsInvalidSignatures: false },
      { acceptsValidSignatures: false }, { signatureInput: "parsed-body" }, { credentialSha256: "d".repeat(64) }]) {
      const observed = evidence(local); Object.assign(observed.signature!.evidence, patch);
      expect(checkReengagementPublication(local, expected, observed).signature.state).toBe("pending");
    }
    const missing = evidence(local); delete missing.signature;
    expect(checkReengagementPublication(local, expected, missing).signature.code).toBe("installed-signature-unverified");
    expect(checkReengagementPublication(local, expected, missing).statusSelection.state).toBe("confirmed");
    expect(checkReengagementPublication(local, expected, missing).ready).toBe(false);
    const historyOnly = evidence(local); delete historyOnly.installed![0].activeVersionId;
    expect(checkReengagementPublication(local, expected, historyOnly).workflows[0]).toMatchObject({ activeVersionId: null, latestSavedVersionId: activeVersion, published: { state: "pending" } });
    expect(checkReengagementPublication(local, expected, historyOnly).signature.state).toBe("pending");
  });

  it("execução antiga/template pendente bloqueiam ativação e metadata real não prova versão ativa", () => {
    const local = artifacts(), observed = evidence(local);
    observed.queues![1].count = 1;
    observed.queues![1].data = [{ id: "old-execution-1", workflowId: observed.targets[1].workflowId, status: "waiting", versionId: priorVersion }];
    observed.legacyTemplate!.pendingTemplateExecutions = 1;
    const report = checkReengagementPublication(local, expected, observed);
    expect(report.queues[1]).toMatchObject({ count: 1, executionIds: ["old-execution-1"], gate: { code: "pending-executions-remain" } });
    expect(report.legacyTemplate.state).toBe("pending"); expect(report.activation.ready).toBe(false);
    for (const patch of [{ estimated: true }, { count: -1 }, { requestedStatuses: ["running"] }]) {
      const incomplete = evidence(local); Object.assign(incomplete.queues![0], patch);
      expect(checkReengagementPublication(local, expected, incomplete).queues[0].gate.code).toBe("execution-queue-unverified");
    }
    // Fatos readonly coletados pelo root; histórico mais recente não é activeVersionId.
    const factual: PublicationEvidence = { targets: [{ role: "principal", workflowId: "0B1nqjODu7xuYYKF" }],
      installed: [{ source: "n8n-readonly", workflowId: "0B1nqjODu7xuYYKF", observedAt: now, active: true,
        latestSavedVersionId: "e3e25681-8cd1-4ea3-bc38-33d373cf6b80" }],
      queues: [{ source: "n8n-readonly", workflowId: "0B1nqjODu7xuYYKF", observedAt: now,
        requestedStatuses: ["new", "running", "waiting", "unknown"], count: 0, estimated: false, data: [] }] };
    const fact = checkReengagementPublication(local, expected, factual);
    expect(fact.queues[0].gate.state).toBe("confirmed"); expect(fact.workflows[0].activeVersionId).toBeNull();
    expect(fact.signature.state).toBe("pending"); expect(fact.legacyTemplate.state).toBe("pending"); expect(fact.ready).toBe(false);
  });

  it("handlers/schema precisam prova de produção compatível antes de novos callers", () => {
    const local = artifacts();
    expect(checkReengagementPublication(local, expected, evidence(local))).toMatchObject({ ready: true, compatibility: { state: "confirmed" } });
    for (const patch of [{ handlerHash: "changed" }, { schemaHash: "changed" }, { handlersCompatible: false }, { schemaCompatible: false }]) {
      const changed = evidence(local); Object.assign(changed.compatibility!, patch);
      const report = checkReengagementPublication(local, expected, changed);
      expect(report.compatibility.state).toBe("pending"); expect(report.ready).toBe(false);
      expect(report.activation.steps[0]).toBe("deploy-compatible-handlers-and-schema");
    }
    const absent = evidence(local); delete absent.compatibility;
    expect(checkReengagementPublication(local, expected, absent).compatibility.state).toBe("pending");
  });

  it("conta pendente/sem mês-zero ou contexto corrente não habilita apesar de workflows provados", () => {
    const local = artifacts();
    for (const patch of [{ production: false }, { ownershipConfirmed: false }, { ianaConfirmed: false },
      { analyticsMonthConfirmed: false }, { explicitZeroConfirmed: false }, { projectionCurrent: false }, { snapshotCurrent: false }]) {
      const observed = evidence(local); Object.assign(observed.account!, patch);
      const report = checkReengagementPublication(local, expected, observed);
      expect(report.account.state).toBe("pending"); expect(report.activation.ready).toBe(false);
    }
    const absent = evidence(local); delete absent.account;
    expect(checkReengagementPublication(local, expected, absent).account.code).toBe("production-account-state-snapshot-unverified");
  });

  it("rollback pausa novas capacidades, conserva tombstones/consumo/ack e nunca restaura template", () => {
    const report = checkReengagementPublication(artifacts(), expected, evidence());
    expect(report.rollback).toEqual({ steps: ["pause-B-and-usage", "reconcile-accepted-records-without-redispatch", "keep-template-B-disabled"],
      preserveBranches: ["A", "D", "human-send"], preserveTombstones: true, preserveDispatchConsumption: true,
      preserveAcceptedPendingRecord: true, restoreTemplateB: false, restoreLegacyScheduler: false, rearmDispatch: false });
    expect(report.activation.steps.indexOf("disable-template-B")).toBeLessThan(report.activation.steps.indexOf("drain-prior-executions"));
    expect(report.activation.steps.indexOf("drain-prior-executions")).toBeLessThan(report.activation.steps.indexOf("publish-readonly-generation-and-principal"));
  });

  it("relatório não publica/muta DB/env/workflows e descarta credencial, texto e erro bruto", () => {
    const fetch = vi.fn().mockRejectedValue(new Error("External mutation forbidden")); vi.stubGlobal("fetch", fetch);
    vi.stubEnv("N8N_API_KEY", "synthetic-secret-key");
    const local = artifacts(), observed = evidence(local);
    Object.assign(observed, { apiKey: "synthetic-secret-key", leadText: "private lead text", rawError: "Bearer private" });
    local[0].graph.nodes.push({ name: "Synthetic private example", type: "code", typeVersion: 1, parameters: { jsCode: "private lead text", example: "synthetic-secret-key" } });
    freeze(local); freeze(observed); freeze(expected);
    const before = JSON.stringify({ local, observed, expected });
    const report = checkReengagementPublication(local, expected, observed);
    expect(report).toMatchObject({ dryRun: true, mutations: 0 });
    expect(JSON.stringify(report)).not.toMatch(/synthetic-secret-key|private lead text|Bearer private|Synthetic private example/);
    expect(JSON.stringify({ local, observed, expected })).toBe(before);
    expect(process.env.N8N_API_KEY).toBe("synthetic-secret-key"); expect(fetch).not.toHaveBeenCalled();
  });
});
