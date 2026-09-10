import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "../normalize-text";

describe("normalizeForSearch", () => {
  it("acento nasce igual à forma sem acento e minúscula, com espaço na ponta aparado (spec.md — Edge Case de bairro/cidade)", () => {
    expect(normalizeForSearch("Santa María ")).toBe(
      normalizeForSearch("santa maria")
    );
    expect(normalizeForSearch("Santa María ")).toBe("santa maria");
  });

  it("cedilha é removida", () => {
    expect(normalizeForSearch("Coração")).toBe("coracao");
  });

  it("caixa alta e baixa produzem o mesmo valor", () => {
    expect(normalizeForSearch("SANTA MARIA")).toBe(
      normalizeForSearch("santa maria")
    );
  });

  it("espaço duplo interno é colapsado a um único espaço", () => {
    expect(normalizeForSearch("santa  maria")).toBe("santa maria");
  });

  it("espaço nas pontas é aparado", () => {
    expect(normalizeForSearch("  santa maria  ")).toBe("santa maria");
  });

  it("string vazia permanece vazia", () => {
    expect(normalizeForSearch("")).toBe("");
  });
});
