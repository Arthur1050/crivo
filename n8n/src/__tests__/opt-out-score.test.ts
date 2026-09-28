import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_EXPLICIT_RATE, scoreMeasurement } from "../opt-out-score.mjs";

type Run = { id: string; faixa: string; categoria: string };

/** `n` execuções de uma frase, todas com a mesma categoria. */
function runs(id: string, faixa: string, categoria: string, n = 1): Run[] {
  return Array.from({ length: n }, () => ({ id, faixa, categoria }));
}

/**
 * 60 execuções explícitas (20 frases × 3), das quais `hits` saem como
 * explícita e o resto como ambígua. 54/60 é exatamente 0,9.
 */
function explicitRuns(hits: number): Run[] {
  const all: Run[] = [];
  for (let i = 0; i < 60; i++) {
    all.push({ id: `exp-${String(Math.floor(i / 3) + 1).padStart(2, "0")}`, faixa: "explicita", categoria: i < hits ? "explicita" : "ambigua" });
  }
  return all;
}

describe("scoreMeasurement — contagens por frase e por faixa (OPTMED-01 AC5)", () => {
  // Conjunto escrito à mão: 2 frases por faixa, 3 execuções cada.
  const results: Run[] = [
    ...runs("exp-01", "explicita", "explicita", 3),
    { id: "exp-02", faixa: "explicita", categoria: "explicita" },
    { id: "exp-02", faixa: "explicita", categoria: "ambigua" },
    { id: "exp-02", faixa: "explicita", categoria: "fora" },
    ...runs("amb-01", "ambigua", "ambigua", 3),
    { id: "amb-02", faixa: "ambigua", categoria: "ambigua" },
    { id: "amb-02", faixa: "ambigua", categoria: "fora" },
    { id: "amb-02", faixa: "ambigua", categoria: "other" },
    ...runs("fora-01", "fora", "fora", 3),
    { id: "fora-02", faixa: "fora", categoria: "fora" },
    { id: "fora-02", faixa: "fora", categoria: "erro" },
    { id: "fora-02", faixa: "fora", categoria: "ambigua" },
  ];
  const report = scoreMeasurement(results);

  it("por frase, na ordem em que as frases aparecem", () => {
    expect(report.porFrase).toEqual([
      { id: "exp-01", faixa: "explicita", explicita: 3, ambigua: 0, fora: 0 },
      { id: "exp-02", faixa: "explicita", explicita: 1, ambigua: 1, fora: 1 },
      { id: "amb-01", faixa: "ambigua", explicita: 0, ambigua: 3, fora: 0 },
      { id: "amb-02", faixa: "ambigua", explicita: 0, ambigua: 1, fora: 2 },
      { id: "fora-01", faixa: "fora", explicita: 0, ambigua: 0, fora: 3 },
      { id: "fora-02", faixa: "fora", explicita: 0, ambigua: 1, fora: 2 },
    ]);
  });

  it("por faixa, com o total de execuções", () => {
    expect(report.porFaixa).toEqual({
      explicita: { explicita: 4, ambigua: 1, fora: 1, total: 6 },
      ambigua: { explicita: 0, ambigua: 4, fora: 2, total: 6 },
      fora: { explicita: 0, ambigua: 1, fora: 5, total: 6 },
    });
  });

  it("falsos positivos e taxa explícita", () => {
    expect(report.falsosPositivos).toBe(0);
    expect(report.taxaExplicita).toBe(4 / 6);
  });

  it("veredito reprovado pela taxa (4/6 < 0,9)", () => {
    expect(report.veredito).toBe("REPROVADO");
  });
});

describe("scoreMeasurement — barra do OPTMED-01 AC6 (cada condição isolada, L-012)", () => {
  const clean = [...runs("amb-01", "ambigua", "ambigua", 3), ...runs("fora-01", "fora", "fora", 3)];

  it("APROVADO com 0 falso positivo e taxa exatamente 0,9 (fronteira, L-023)", () => {
    const report = scoreMeasurement([...explicitRuns(54), ...clean]);
    expect(report.taxaExplicita).toBe(0.9);
    expect(report.falsosPositivos).toBe(0);
    expect(report.veredito).toBe("APROVADO");
  });

  it("REPROVADO com taxa logo abaixo de 0,9 (53/60) e 0 falso positivo", () => {
    const report = scoreMeasurement([...explicitRuns(53), ...clean]);
    expect(report.taxaExplicita).toBe(53 / 60);
    expect(report.falsosPositivos).toBe(0);
    expect(report.veredito).toBe("REPROVADO");
  });

  it("REPROVADO com 1 falso positivo vindo de frase ambígua, mesmo com taxa 100%", () => {
    const report = scoreMeasurement([
      ...explicitRuns(60),
      ...clean,
      { id: "amb-02", faixa: "ambigua", categoria: "explicita" },
    ]);
    expect(report.taxaExplicita).toBe(1);
    expect(report.falsosPositivos).toBe(1);
    expect(report.veredito).toBe("REPROVADO");
  });

  it("REPROVADO com 1 falso positivo vindo de frase fora, mesmo com taxa 100%", () => {
    const report = scoreMeasurement([
      ...explicitRuns(60),
      ...clean,
      { id: "fora-02", faixa: "fora", categoria: "explicita" },
    ]);
    expect(report.taxaExplicita).toBe(1);
    expect(report.falsosPositivos).toBe(1);
    expect(report.veredito).toBe("REPROVADO");
  });

  it("sem nenhuma execução explícita a taxa é 0 e o veredito REPROVADO", () => {
    const report = scoreMeasurement(clean);
    expect(report.taxaExplicita).toBe(0);
    expect(report.veredito).toBe("REPROVADO");
  });
});

describe("scoreMeasurement — other e erro contam como fora", () => {
  it("em frase explícita, other e erro contam como fora e não como explícita", () => {
    const report = scoreMeasurement([
      { id: "exp-01", faixa: "explicita", categoria: "other" },
      { id: "exp-01", faixa: "explicita", categoria: "erro" },
    ]);
    expect(report.porFrase[0]).toEqual({ id: "exp-01", faixa: "explicita", explicita: 0, ambigua: 0, fora: 2 });
    expect(report.taxaExplicita).toBe(0);
  });

  it("em frase fora, other e erro não viram falso positivo", () => {
    const report = scoreMeasurement([
      { id: "fora-01", faixa: "fora", categoria: "other" },
      { id: "fora-01", faixa: "fora", categoria: "erro" },
    ]);
    expect(report.porFaixa.fora).toEqual({ explicita: 0, ambigua: 0, fora: 2, total: 2 });
    expect(report.falsosPositivos).toBe(0);
  });
});

describe("scoreMeasurement — default da barra (L-037)", () => {
  it("DEFAULT_MIN_EXPLICIT_RATE é 0,9", () => {
    expect(DEFAULT_MIN_EXPLICIT_RATE).toBe(0.9);
  });

  it("minExplicitRate informado substitui o default", () => {
    const report = scoreMeasurement(explicitRuns(53), { minExplicitRate: 0.85 });
    expect(report.veredito).toBe("APROVADO");
  });
});
