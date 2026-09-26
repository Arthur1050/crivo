import { describe, expect, it } from "vitest";
import { buildCanonicalContext, findCorpusOverflow, measureCanonicalContext, reconcileDocumentAdmission, type ContextBudgetDocument } from "../context-budget";

const limits = { novo: 10_000, usado: 10_000, ambos: 10_000 };
const doc = (id: string, modality: ContextBudgetDocument["modality"], content = id, status: ContextBudgetDocument["status"] = "processando", seconds = 0): ContextBudgetDocument => ({ id, name: `${id}.txt`, modality, content, status, uploadedAt: new Date(1_700_000_000_000 + seconds * 1000) });

describe("direct context budget (lote-12 T12)", () => {
  it("serializes the approved direct envelope", () => expect(buildCanonicalContext([doc("a", "novo")], "novo")).toEqual({ retrievalMode: "direct", documents: [{ id: "a", name: "a.txt", modality: "novo", category: null, contentMode: "full", content: "a" }] }));
  it("counts UTF-8 bytes of that exact JSON", () => { const envelope = buildCanonicalContext([doc("á", "novo", "ç")], "novo"); expect(measureCanonicalContext(envelope)).toBe(Buffer.byteLength(JSON.stringify(envelope), "utf8")); });
  it("includes novo plus ambos for novo", () => expect(buildCanonicalContext([doc("n", "novo"), doc("u", "usado"), doc("a", "ambos")], "novo").documents.map((d) => d.id)).toEqual(["a", "n"]));
  it("includes usado plus ambos for usado", () => expect(buildCanonicalContext([doc("n", "novo"), doc("u", "usado"), doc("a", "ambos")], "usado").documents.map((d) => d.id)).toEqual(["a", "u"]));
  it("includes all once for ambos", () => expect(buildCanonicalContext([doc("n", "novo"), doc("u", "usado"), doc("a", "ambos")], "ambos").documents.map((d) => d.id)).toEqual(["a", "n", "u"]));
  it("orders by upload time then id", () => expect(buildCanonicalContext([doc("b", "novo", "b", "processando", 1), doc("a", "novo", "a", "processando", 1)], "novo").documents.map((d) => d.id)).toEqual(["a", "b"]));
  it("admits a fitting candidate", () => expect(reconcileDocumentAdmission([doc("a", "novo")], limits).statusByDocumentId.get("a")).toBe("pronto"));
  it("keeps incumbents when their current envelope still fits", () => expect(reconcileDocumentAdmission([doc("a", "novo", "x", "pronto")], limits).statusByDocumentId.get("a")).toBe("pronto"));
  it("rejects an oversized single document without truncating it", () => { const result = reconcileDocumentAdmission([doc("a", "novo", "x".repeat(500))], { novo: 20, usado: 20, ambos: 20 }); expect(result.statusByDocumentId.get("a")).toBe("fora_do_agente"); expect(result.contexts.novo.documents).toEqual([]); });
  it("requires ambos content to fit every relevant corpus", () => expect(reconcileDocumentAdmission([doc("a", "ambos", "x".repeat(50))], { novo: 10_000, usado: 10_000, ambos: 10 }).statusByDocumentId.get("a")).toBe("fora_do_agente"));
  it("continues after an older oversized outsider", () => { const result = reconcileDocumentAdmission([doc("big", "novo", "x".repeat(500), "processando", 0), doc("small", "novo", "x", "processando", 1)], { novo: 300, usado: 300, ambos: 300 }); expect(result.statusByDocumentId.get("big")).toBe("fora_do_agente"); expect(result.statusByDocumentId.get("small")).toBe("pronto"); });
  it("demotes outsiders after a limit reduction", () => { const result = reconcileDocumentAdmission([doc("old", "novo", "x".repeat(50), "pronto", 0), doc("new", "novo", "x".repeat(50), "processando", 1)], { novo: 200, usado: 200, ambos: 200 }); expect(result.statusByDocumentId.get("new")).toBe("fora_do_agente"); });
  it("rebalances ready documents by age after a limit reduction", () => { const result = reconcileDocumentAdmission([doc("old", "novo", "x".repeat(50), "pronto", 0), doc("new", "novo", "x".repeat(50), "pronto", 1)], { novo: 200, usado: 200, ambos: 200 }); expect(result.statusByDocumentId.get("old")).toBe("pronto"); expect(result.statusByDocumentId.get("new")).toBe("fora_do_agente"); });
  it("promotes an outsider when capacity is free", () => expect(reconcileDocumentAdmission([doc("a", "novo", "x", "fora_do_agente")], limits).statusByDocumentId.get("a")).toBe("pronto"));
  it("preserves full text in an admitted response", () => { const text = "integral\nsem corte"; const result = reconcileDocumentAdmission([doc("a", "novo", text)], limits); expect(result.contexts.novo.documents[0]?.content).toBe(text); });
  it("counts envelope overhead", () => expect(measureCanonicalContext(buildCanonicalContext([doc("a", "novo", "x")], "novo"))).toBeGreaterThan(1));
  it("does not duplicate ambos", () => { const result = reconcileDocumentAdmission([doc("a", "ambos")], limits); expect(result.contexts.ambos.documents).toHaveLength(1); });
  it("does not include a novo document in usado", () => expect(reconcileDocumentAdmission([doc("n", "novo")], limits).contexts.usado.documents).toEqual([]));
  it("does not include a usado document in novo", () => expect(reconcileDocumentAdmission([doc("u", "usado")], limits).contexts.novo.documents).toEqual([]));
});

describe("gatilho mensurável de RAG (lote-12 T44, DOCLIM-01 AC12)", () => {
  it("reporta a modalidade cujo corpus inteiro passa do teto, com bytes, teto e excluídos", () => {
    const documents = [doc("old", "novo", "x".repeat(50), "pronto", 0), doc("new", "novo", "x".repeat(50), "processando", 1)];
    const ceilings = { novo: 200, usado: 200, ambos: 200 };
    const result = reconcileDocumentAdmission(documents, ceilings);
    const corpusBytes = measureCanonicalContext(buildCanonicalContext(documents, "novo"));
    expect(findCorpusOverflow(documents, ceilings, result)).toEqual([
      { modality: "novo", corpusBytes, ceilingBytes: 200, excludedDocuments: 1 },
      { modality: "ambos", corpusBytes, ceilingBytes: 200, excludedDocuments: 1 },
    ]);
  });

  it("corpus que cabe inteiro não é gatilho", () => {
    const documents = [doc("a", "novo", "x", "pronto")];
    expect(findCorpusOverflow(documents, limits, reconcileDocumentAdmission(documents, limits))).toEqual([]);
  });

  it("teto zero (sem benchmark) não é gatilho de RAG", () => {
    const documents = [doc("a", "novo", "x", "pronto")];
    const none = { novo: 0, usado: 0, ambos: 0 };
    expect(findCorpusOverflow(documents, none, reconcileDocumentAdmission(documents, none))).toEqual([]);
  });

  it("o evento carrega só números e a modalidade, nunca nome ou conteúdo", () => {
    const documents = [doc("segredo-nome", "usado", "conteúdo sigiloso ".repeat(20), "processando")];
    const ceilings = { novo: 100, usado: 100, ambos: 100 };
    const serialized = JSON.stringify(findCorpusOverflow(documents, ceilings, reconcileDocumentAdmission(documents, ceilings)));
    expect(serialized).not.toContain("segredo-nome");
    expect(serialized).not.toContain("sigiloso");
  });
});
