import "dotenv/config";
import { describe, expect, it } from "vitest";
import { start } from "workflow/api";
import { processDocumentStep, processDocumentWorkflow, toProcessDocumentOutput } from "../process-document";

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
