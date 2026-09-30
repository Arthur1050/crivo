import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Corpus da medição do classificador de opt-out (lote-13 T8 — OPTMED-01 AC1,
 * AC2, AC3). É a entrada do `crivo-medicao-opt-out` (T9/T12): o que não está
 * aqui não é medido, então as contagens mínimas e as frases obrigatórias são
 * afirmadas uma a uma.
 */

type Faixa = "explicita" | "ambigua" | "fora";
type Item = { id: string; faixa: Faixa; texto: string; ultimaMensagem?: string };
type Corpus = { abertura: string; itens: Item[] };

const corpus = JSON.parse(readFileSync("n8n/fixtures/opt-out-corpus.json", "utf8")) as Corpus;

const porFaixa = (faixa: Faixa) => corpus.itens.filter((item) => item.faixa === faixa);
const comTexto = (texto: string) => corpus.itens.filter((item) => item.texto === texto);

/**
 * Pergunta de confirmação da faixa ambígua. O agente não a faz mais desde a
 * decisão D11; os pares continuam no corpus porque são os da medição v4.
 */
const PERGUNTA_CONFIRMACAO = /parar de receber mensagens/i;

describe("formato do corpus", () => {
  it("tem uma abertura fixa não vazia, usada quando o item não define `ultimaMensagem`", () => {
    expect(typeof corpus.abertura).toBe("string");
    expect(corpus.abertura.trim()).not.toBe("");
  });

  it("todo item tem faixa conhecida e texto não vazio", () => {
    for (const item of corpus.itens) {
      expect(["explicita", "ambigua", "fora"]).toContain(item.faixa);
      expect(item.texto.trim()).not.toBe("");
    }
  });

  it("os ids são únicos", () => {
    const ids = corpus.itens.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("contagens mínimas por faixa (OPTMED-01 AC1)", () => {
  it("pelo menos 20 explícitas", () => {
    expect(porFaixa("explicita").length).toBeGreaterThanOrEqual(20);
  });

  it("pelo menos 15 ambíguas", () => {
    expect(porFaixa("ambigua").length).toBeGreaterThanOrEqual(15);
  });

  it("pelo menos 20 fora", () => {
    expect(porFaixa("fora").length).toBeGreaterThanOrEqual(20);
  });
});

describe("frases reais obrigatórias (OPTMED-01 AC2, AC3)", () => {
  it('"não me mande mais mensagens" está na faixa explícita (T21 do lote-7)', () => {
    expect(comTexto("não me mande mais mensagens").map((item) => item.faixa)).toEqual(["explicita"]);
  });

  it('"eu só quero que você pare de me mandar mensagens" está na faixa explícita (T21 do lote-7)', () => {
    expect(comTexto("eu só quero que você pare de me mandar mensagens").map((item) => item.faixa)).toEqual(["explicita"]);
  });

  it('"quero que você pare de me mandar mensagens" está na faixa explícita (Fase 5 do lote-10)', () => {
    expect(comTexto("quero que você pare de me mandar mensagens").map((item) => item.faixa)).toEqual(["explicita"]);
  });

  it('"pode parar de mandar foto" está na faixa fora', () => {
    expect(comTexto("pode parar de mandar foto").map((item) => item.faixa)).toEqual(["fora"]);
  });
});

describe("pares da pergunta de confirmação", () => {
  it('pergunta de confirmação + "sim" é explícita', () => {
    const par = corpus.itens.find(
      (item) => PERGUNTA_CONFIRMACAO.test(item.ultimaMensagem ?? "") && item.texto.trim().toLowerCase() === "sim"
    );
    expect(par?.faixa).toBe("explicita");
  });

  it('pergunta de confirmação + "não" é fora', () => {
    const par = corpus.itens.find(
      (item) => PERGUNTA_CONFIRMACAO.test(item.ultimaMensagem ?? "") && item.texto.trim().toLowerCase() === "não"
    );
    expect(par?.faixa).toBe("fora");
  });
});

describe("near-misses", () => {
  it('pelo menos 8 frases fora usam "parar"/"sair" para outra coisa', () => {
    const nearMisses = porFaixa("fora").filter((item) => /\b(parar|pare|sair)\b|\bpara de\b/i.test(item.texto));
    expect(nearMisses.length).toBeGreaterThanOrEqual(8);
  });
});

describe("sem dado pessoal", () => {
  const textos = [corpus.abertura, ...corpus.itens.flatMap((item) => [item.texto, item.ultimaMensagem ?? ""])];

  it("nenhum texto contém telefone (8 ou mais dígitos, ignorando separadores)", () => {
    for (const texto of textos) {
      expect(texto.replace(/[\s().+-]/g, "")).not.toMatch(/\d{8,}/);
    }
  });

  it("nenhum texto contém e-mail", () => {
    for (const texto of textos) {
      expect(texto).not.toMatch(/\S+@\S+\.\S+/);
    }
  });

  it("nenhum texto contém nome de pessoa registrado nas evidências reais", () => {
    for (const texto of textos) {
      expect(texto).not.toMatch(/\b(Arthur|André)\b/i);
    }
  });
});
