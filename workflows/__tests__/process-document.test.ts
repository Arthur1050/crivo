import "dotenv/config";
import { describe, expect, it, vi } from "vitest";
import { start } from "workflow/api";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  abandonDocumentStep,
  processDocumentStep,
  processDocumentWorkflow,
  processWithTerminalFailure,
  toProcessDocumentOutput,
} from "../process-document";

const JOB = { tenantId: "tenant", documentId: "document", attempt: 2 };

describe("retries esgotados (lote-12 T38 — DOCTXT-01 AC4)", () => {
  it("exports the terminal abandon step", () => {
    expect(abandonDocumentStep).toBeTypeOf("function");
  });

  it("falha final do step vira falha terminal no mesmo attempt", async () => {
    const process = vi.fn(async () => { throw new Error("retries esgotados"); });
    const abandon = vi.fn(async () => ({ kind: "failed" as const, code: "processamento_indisponivel" }));
    await expect(processWithTerminalFailure(JOB, process, abandon)).resolves.toEqual({ kind: "failed", code: "processamento_indisponivel" });
    expect(abandon).toHaveBeenCalledWith(JOB);
  });

  // Teste de delegação (T46). Forçar a exaustão real pelo harness exigiria o
  // Blob devolver erro transitório — só uma indisponibilidade real produz
  // isso, e erro desconhecido é classificado como permanente. Então o que se
  // prova aqui é a costura: o corpo do workflow passa pelo orquestrador com
  // os dois steps, e o orquestrador está coberto pelos testes acima.
  it("o workflow durável delega ao orquestrador com os steps de processar e abandonar", () => {
    const source = readFileSync(join(__dirname, "..", "process-document.ts"), "utf8");
    const body = source.slice(source.indexOf("export async function processDocumentWorkflow"));
    const workflowBody = body.slice(0, body.indexOf("\n}\n"));
    expect(workflowBody).toContain('"use workflow"');
    expect(workflowBody).toContain("return processWithTerminalFailure(input, processDocumentStep, abandonDocumentStep);");
    expect(workflowBody).not.toMatch(/return processDocumentStep\(/);
  });

  it("resultado do step não aciona o abandono", async () => {
    const process = vi.fn(async () => ({ kind: "completed" as const, status: "pronto" as const }));
    const abandon = vi.fn();
    await expect(processWithTerminalFailure(JOB, process, abandon)).resolves.toEqual({ kind: "completed", status: "pronto" });
    expect(abandon).not.toHaveBeenCalled();
  });
});

async function expectFatal(input: Parameters<typeof processDocumentWorkflow>[0]) {
  const run = await start(processDocumentWorkflow, [input]);
  await expect(run.returnValue).rejects.toMatchObject({ name: "WorkflowRunFailedError" });
}

describe("document processing workflow (lote-12 T14)", () => {
  it("exports a durable workflow and its Node step", () => {
    expect(processDocumentWorkflow).toBeTypeOf("function");
    expect(processDocumentStep).toBeTypeOf("function");
  });
  it("rejects a missing tenant before any I/O", async () => {
    await expectFatal({ tenantId: "", documentId: "document", attempt: 1 });
  });
  it("runs validation through the durable harness", async () => {
    await expectFatal({ tenantId: "", documentId: "document", attempt: 1 });
  });
  it("rejects a missing document before any I/O", async () => {
    await expectFatal({ tenantId: "tenant", documentId: "", attempt: 1 });
  });
  it.each([0, -1, 1.5])("rejects invalid attempt %s", async (attempt) => {
    await expectFatal({ tenantId: "tenant", documentId: "document", attempt });
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -2, -100, 0.25, 2.2])("rejects non-durable attempt %s", async (attempt) => {
    await expectFatal({ tenantId: "tenant", documentId: "document", attempt });
  });
  it("turns a transient extractor outcome into a retryable step error", () => {
    expect(() => toProcessDocumentOutput({ kind: "retryable", code: "extracao_transitoria" })).toThrow("extracao_transitoria");
  });
  it("turns a timeout outcome into a retryable step error", () => {
    expect(() => toProcessDocumentOutput({ kind: "retryable", code: "timeout" })).toThrow("timeout");
  });
  it("returns a stale CAS result without text or retry", () => {
    expect(toProcessDocumentOutput({ kind: "stale" })).toEqual({ kind: "stale" });
  });
  it("returns only a small terminal failure result", () => {
    expect(toProcessDocumentOutput({ kind: "failed", code: "nenhum_texto_extraivel" })).toEqual({ kind: "failed", code: "nenhum_texto_extraivel" });
  });
});
