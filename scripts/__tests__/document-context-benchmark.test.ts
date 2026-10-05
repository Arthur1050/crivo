import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { auditProactiveBenchmark, checkBenchmarkIdentity, currentIdentity, planBenchmarkRemediation, validateMeasuredIdentity, type BenchmarkResultsFile, type MeasuredLimit } from "../document-context-benchmark";
import { deriveBenchmarkIdentity } from "../../src/server/documents/benchmark-identity";
import { computeContextCeiling } from "../../src/server/documents/context-ceiling";
import { buildSystemMessage } from "../../n8n/src/system-message.mjs";
import { buildReengagementPrompt } from "../../n8n/src/reengagement-prompt.mjs";
import { reengagementFixtureFrame as frame } from "../../n8n/src/__tests__/reengagement-fixtures";

const recorded = JSON.parse(readFileSync(".specs/archive/lote-14-humano-no-laco/benchmark-contexto-2026-10-01.json", "utf8")) as BenchmarkResultsFile;
// Commit factual em que o registro medido foi versionado; nenhum workflow real executado.
const previous = currentIdentity(recorded.agentWorkflowVersion, "5d937b9578a968527e65ba2524929225f0e25dc5");
const current = currentIdentity(recorded.agentWorkflowVersion);
const measured: MeasuredLimit = { identity: previous, benchmarkedAt: recorded.benchmarkedAt,
  maxResponseBytes: computeContextCeiling(recorded.runs, "ambos").maxResponseBytes };
const settings = { agentName: "Ana Fixture", realEstateName: "Imóveis Fixture" };
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
function audit(limit: MeasuredLimit | null = measured, identity = current) {
  return auditProactiveBenchmark({ current: identity, measured: limit, frame: frame(), settings });
}
afterEach(() => vi.unstubAllGlobals());

describe("T66 — identidade factual, paridade e orçamento proativo AD-031", () => {
  it("hash anterior/novo preserva igualdade factual e mudança compartilhada exige remedição", () => {
    expect(previous.systemMessageHash).toBe("b38f4928cd281edcaa85f4514460e2b5aa0e7c573694729cfabf520d94cd348d");
    expect(current).toEqual(previous);
    expect(audit()).toMatchObject({ sharedIdentityEqual: true, changed: [], stale: false, capacityVerified: true });
    const sources = ["business-hours.mjs", "phase.mjs", "system-message.mjs"].map((file) => readFileSync(`n8n/src/${file}`, "utf8"));
    sources[2] += "\n// Mudança sintética do prompt compartilhado";
    const changed = deriveBenchmarkIdentity({ principalSource: readFileSync("n8n/workflows/principal.ts", "utf8"),
      systemMessageSources: sources, workflowVersion: recorded.agentWorkflowVersion });
    expect(changed.systemMessageHash).not.toBe(previous.systemMessageHash);
    expect(audit(measured, changed)).toMatchObject({ sharedIdentityEqual: false, changed: ["systemMessageHash"], stale: true, capacityVerified: false });
    expect(() => validateMeasuredIdentity(previous, changed)).toThrow(/systemMessageHash/);
    expect(() => currentIdentity("version", "invalid-ref")).toThrow(/Revisão/);
  });

  it("compara prompts efetivos principal/proativo pela fonte comum sem expor texto do frame", () => {
    const result = audit();
    const principal = buildSystemMessage({ settings, phase: "qualificando", perguntados: ["modality", "region", "budgetCents", "chainedOperation"],
      firstTurn: false, now: frame().preparedAt });
    expect(result.promptParity).toBe(true);
    expect(result.promptHashes.principal).toBe(digest(principal));
    expect(result.promptHashes.proactiveBase).toBe(result.promptHashes.principal);
    expect(result.promptHashes.proactiveEffective).not.toBe(result.promptHashes.principal);
    expect(JSON.stringify(result)).not.toMatch(/Pessoa Fixture|Quero novo|Nota factual|Vamos retomar|Ana Fixture/);
    const agendando = frame(); agendando.agent.phase = "agendando";
    expect(auditProactiveBenchmark({ current, measured, frame: agendando, settings }).promptParity).toBe(true);
  });

  it("mantém o teto previamente medido sem expansão por janela ou mudança de identidade", () => {
    const ceiling = measured.maxResponseBytes;
    expect(ceiling).toBeGreaterThan(0);
    for (const identity of [current, { ...current, workflowVersion: "new-version" }]) {
      const result = audit(measured, identity);
      expect(result.budget.limitingCeilingBytes).toBe(ceiling);
      expect(result.budget.maxDocumentBytes).toBeLessThan(ceiling);
      expect(result.budget.maxDocumentBytes).toBeLessThanOrEqual(result.budget.limitingCeilingBytes);
    }
    const constrained = audit({ ...measured, maxResponseBytes: 1 });
    expect(constrained.budget.maxDocumentBytes).toBe(0);
    expect(constrained.capacityVerified).toBe(false);
  });

  it("deduz overhead UTF-8 do frame antes de documentos e soma exatamente ao teto", () => {
    const result = audit();
    const prepared = buildReengagementPrompt({ frame: frame(), settings, documentCeilingBytes: measured.maxResponseBytes });
    expect(result.budget.overheadBytes).toBe(prepared.overheadBytes);
    expect(result.budget.overheadBytes).toBeGreaterThan(0);
    expect(result.budget.maxDocumentBytes + result.budget.overheadBytes).toBe(measured.maxResponseBytes);
    const longer = frame(); longer.history[0].content += " ação😀".repeat(100);
    const changed = auditProactiveBenchmark({ current, measured, frame: longer, settings });
    expect(changed.budget.overheadBytes - result.budget.overheadBytes).toBe(Buffer.byteLength(" ação😀".repeat(100), "utf8"));
    expect(changed.budget.maxDocumentBytes).toBeLessThan(result.budget.maxDocumentBytes);
  });

  it("stale mantém valor antigo limitando e check marca só primeira mudança sem apagar tetos", async () => {
    const stale = audit({ ...measured, staleAt: new Date("2026-10-02T00:00:00Z") });
    expect(stale).toMatchObject({ measured: true, stale: true, capacityVerified: false, code: "remeasurement-required" });
    expect(stale.budget.limitingCeilingBytes).toBe(measured.maxResponseBytes);
    const rows = [{ ...previous, tenantId: "fixture", queryModality: "ambos" as const, staleAt: null as Date | null, maxResponseBytes: measured.maxResponseBytes }];
    const mark = vi.fn(async () => { rows[0].staleAt = new Date("2026-10-02T00:00:00Z"); return true; });
    const dependencies = { identity: { ...current, workflowVersion: "updated" }, list: async () => rows, markStale: mark };
    expect(await checkBenchmarkIdentity("updated", dependencies)).toEqual({ checked: 1, marked: 1, paidCalls: 0 });
    expect(await checkBenchmarkIdentity("updated", dependencies)).toEqual({ checked: 1, marked: 0, paidCalls: 0 });
    expect(mark).toHaveBeenCalledExactlyOnceWith("fixture", "ambos", "mudou: workflowVersion");
    expect(rows[0].maxResponseBytes).toBe(measured.maxResponseBytes);
  });

  it("ausência de resultado medido vale zero e não habilita capacidade nem inventa medição", () => {
    for (const limit of [null, { ...measured, maxResponseBytes: 0 }, { ...measured, benchmarkedAt: "unknown" }]) {
      const report = audit(limit);
      expect(report).toMatchObject({ measured: false, capacityVerified: false, code: "measurement-missing",
        budget: { limitingCeilingBytes: 0, maxDocumentBytes: 0 } });
    }
    expect(audit(null).previousIdentity).toBeNull();
    const invalid = frame(); invalid.agent.phase = "unknown" as "qualificando";
    expect(() => auditProactiveBenchmark({ current, measured, frame: invalid })).toThrow(/Frame/);
  });

  it("check/audit não chamam transporte pago e plano de medição exige evidência interna do executor", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("Não executar chamada paga")); vi.stubGlobal("fetch", fetch);
    const mark = vi.fn();
    expect(await checkBenchmarkIdentity(recorded.agentWorkflowVersion, { identity: current,
      list: async () => [{ ...previous, tenantId: "fixture", queryModality: "novo", staleAt: null }], markStale: mark })).toEqual({ checked: 1, marked: 0, paidCalls: 0 });
    expect(mark).not.toHaveBeenCalled();
    expect(planBenchmarkRemediation(audit())).toMatchObject({ required: false, ready: false, paidCalls: 0 });
    expect(planBenchmarkRemediation(audit(null))).toMatchObject({ required: true, ready: false, paidCalls: 0, code: "executor-evidence-required" });
    const plan = planBenchmarkRemediation(audit(null), { authorized: true, workflowId: recorded.benchmarkWorkflowId, gateExecutionId: "synthetic-approved-gate" });
    expect(plan).toMatchObject({ required: true, ready: true, paidCalls: 0, workflowId: recorded.benchmarkWorkflowId });
    expect(plan.runs).toHaveLength(15);
    expect(plan.runs?.filter((run) => run.observations === 2)).toHaveLength(6);
    expect(fetch).not.toHaveBeenCalled();
    expect(() => validateMeasuredIdentity(previous, current)).not.toThrow();
  });
});
