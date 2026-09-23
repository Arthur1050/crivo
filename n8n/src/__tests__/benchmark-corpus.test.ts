import { describe, expect, it } from "vitest";
import {
  buildBenchmarkCorpus,
  buildBenchmarkFacts,
  buildBenchmarkHistory,
  buildBenchmarkQuestion,
  serializeBenchmarkEnvelope,
} from "../benchmark-corpus.mjs";
import { scoreBenchmarkAnswer } from "../benchmark-score.mjs";
import {
  buildCanonicalContext,
  measureCanonicalContext,
  type ContextBudgetDocument,
  type DocumentModality,
} from "../../../src/server/documents/context-budget";

type BenchmarkDocument = ReturnType<typeof buildBenchmarkCorpus>["documents"][number];

function asCrmDocuments(documents: BenchmarkDocument[]): ContextBudgetDocument[] {
  return documents.map((document) => ({
    id: document.id,
    name: document.name,
    modality: document.modality as DocumentModality,
    content: document.content,
    uploadedAt: new Date(document.uploadedAt),
    status: "pronto",
    category: null,
  }));
}

const MODALITIES: DocumentModality[] = ["novo", "usado", "ambos"];

describe("benchmark-corpus (lote-12 T34)", () => {
  // A faixa medida só vale como teto se o envelope do benchmark for o mesmo
  // que a admissão do CRM mede. Esta é a prova byte a byte.
  it.each(MODALITIES)("envelope %s é idêntico ao buildCanonicalContext do CRM", (modality) => {
    const corpus = buildBenchmarkCorpus({ targetBytes: 64_000, modality, seed: 3 });
    const crm = buildCanonicalContext(asCrmDocuments(corpus.documents), modality);

    expect(corpus.envelope).toBe(JSON.stringify(crm));
    expect(corpus.envelopeBytes).toBe(measureCanonicalContext(crm));
  });

  it("o envelope de outra modalidade também coincide, com filtro de compatibilidade", () => {
    const corpus = buildBenchmarkCorpus({ targetBytes: 40_000, modality: "ambos", seed: 5 });
    for (const modality of MODALITIES) {
      expect(serializeBenchmarkEnvelope(corpus.documents, modality)).toBe(
        JSON.stringify(buildCanonicalContext(asCrmDocuments(corpus.documents), modality))
      );
    }
  });

  it("alcança a faixa pedida sem ultrapassá-la em mais de um documento", () => {
    for (const target of [16_000, 128_000]) {
      const corpus = buildBenchmarkCorpus({ targetBytes: target, modality: "ambos", seed: 1 });
      expect(corpus.envelopeBytes).toBeGreaterThanOrEqual(target);
      expect(corpus.envelopeBytes).toBeLessThan(target + 9_500);
    }
  });

  it("faixa zero devolve envelope vazio para medir o custo fixo", () => {
    const corpus = buildBenchmarkCorpus({ targetBytes: 0, modality: "novo", seed: 1 });
    expect(corpus.documents).toHaveLength(0);
    expect(corpus.envelope).toBe('{"retrievalMode":"direct","documents":[]}');
  });

  it("é determinístico pela seed e muda com ela", () => {
    const a = buildBenchmarkCorpus({ targetBytes: 30_000, modality: "usado", seed: 9 });
    const b = buildBenchmarkCorpus({ targetBytes: 30_000, modality: "usado", seed: 9 });
    const c = buildBenchmarkCorpus({ targetBytes: 30_000, modality: "usado", seed: 10 });
    expect(a.envelope).toBe(b.envelope);
    expect(a.envelope).not.toBe(c.envelope);
    expect(buildBenchmarkFacts(9)).toEqual(buildBenchmarkFacts(9));
  });

  it("põe os fatos no início, no meio e no fim, e os três valem para qualquer modalidade", () => {
    const corpus = buildBenchmarkCorpus({ targetBytes: 100_000, modality: "novo", seed: 2 });
    const [inicio, meio, fim] = corpus.facts;
    const docs = corpus.documents;

    expect(docs[0].content.startsWith(inicio.sentence)).toBe(true);
    expect(docs[docs.length - 1].content.endsWith(fim.sentence)).toBe(true);
    const middle = docs[Math.floor(docs.length / 2)];
    const at = middle.content.indexOf(meio.sentence);
    expect(at).toBeGreaterThan(middle.content.length * 0.3);
    expect(at).toBeLessThan(middle.content.length * 0.7);
    for (const modality of MODALITIES) {
      const envelope = serializeBenchmarkEnvelope(docs, modality);
      for (const fact of corpus.facts) expect(envelope).toContain(fact.value);
    }
  });

  it("histórico tem o tamanho pedido, alterna papéis e não contém nenhum fato", () => {
    const history = buildBenchmarkHistory(50, 4);
    const facts = buildBenchmarkFacts(4);
    expect(history).toHaveLength(50);
    expect(history.map((m) => m.type).slice(0, 4)).toEqual(["user", "ai", "user", "ai"]);
    const text = history.map((m) => m.message).join(" ");
    for (const fact of facts) expect(text).not.toContain(fact.value);
  });

  it("a pergunta cita os três assuntos e nenhum valor", () => {
    const facts = buildBenchmarkFacts(6);
    const question = buildBenchmarkQuestion(facts);
    for (const fact of facts) {
      expect(question).toContain(fact.subject);
      expect(question).not.toContain(fact.value);
    }
  });

  describe("pontuação da resposta", () => {
    const facts = [
      { position: "inicio", value: "VST-48213" },
      { position: "meio", value: "3,45%" },
      { position: "fim", value: "12 dias úteis" },
    ];

    it("reconhece os três valores com variações de escrita", () => {
      const answer = "O código é vst-48213, a taxa é 3.45% ao mês e o prazo é de 12 dias.";
      expect(scoreBenchmarkAnswer(answer, facts)).toEqual({ found: ["inicio", "meio", "fim"], missing: [] });
    });

    it("aponta exatamente o fato perdido", () => {
      const answer = "O código é VST-48213 e a taxa é 3,45%. O prazo não encontrei.";
      expect(scoreBenchmarkAnswer(answer, facts)).toEqual({ found: ["inicio", "meio"], missing: ["fim"] });
    });

    it("resposta vazia não recupera nada", () => {
      expect(scoreBenchmarkAnswer("", facts).missing).toHaveLength(3);
    });
  });
});
