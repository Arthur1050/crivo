import { describe, expect, it } from "vitest";
import { parseDurationMs } from "../motion";

const FALLBACK = 300;

describe("parseDurationMs", () => {
  it("converte segundos em milissegundos", () => {
    expect(parseDurationMs("0.41s", FALLBACK)).toBe(410);
  });

  it("aceita a forma sem zero à esquerda que a Astryx emite", () => {
    expect(parseDurationMs(".175s", FALLBACK)).toBe(175);
  });

  it("mantém milissegundos como estão", () => {
    expect(parseDurationMs("240ms", FALLBACK)).toBe(240);
  });

  it("ignora espaços em volta do valor", () => {
    expect(parseDurationMs("  .41s  ", FALLBACK)).toBe(410);
  });

  it("cai no fallback quando o token não existe", () => {
    expect(parseDurationMs(undefined, FALLBACK)).toBe(FALLBACK);
    expect(parseDurationMs(null, FALLBACK)).toBe(FALLBACK);
    expect(parseDurationMs("", FALLBACK)).toBe(FALLBACK);
  });

  it("cai no fallback quando falta unidade ou o valor é ilegível", () => {
    expect(parseDurationMs("410", FALLBACK)).toBe(FALLBACK);
    expect(parseDurationMs("fast", FALLBACK)).toBe(FALLBACK);
  });

  it("cai no fallback em duração negativa", () => {
    expect(parseDurationMs("-1s", FALLBACK)).toBe(FALLBACK);
  });
});
