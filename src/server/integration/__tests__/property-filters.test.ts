import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "../../../lib/normalize-text";
import { parsePropertyFilters } from "../property-filters";

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

/**
 * Parse dos filtros de `GET /api/v1/properties` (tasks.md — T11; spec.md
 * BUSCA-01/03 e os Edge Cases de preço/quartos). Função pura — nenhum I/O.
 */
describe("server/integration property-filters — parsePropertyFilters", () => {
  it("ausência de todo filtro é aceita, devolvendo filtros vazios", () => {
    const result = parsePropertyFilters(params(""));
    expect(result).toEqual({ ok: true, filters: {} });
  });

  describe("modalidade", () => {
    it("aceita um valor válido do enum", () => {
      const result = parsePropertyFilters(params("modalidade=usado"));
      expect(result).toEqual({ ok: true, filters: { modality: "usado" } });
    });

    it("recusa um valor fora do enum", () => {
      const result = parsePropertyFilters(params("modalidade=comercial"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toContain("modalidade");
    });
  });

  describe("tipo", () => {
    it("aceita um valor válido do enum (superset de PropertyType)", () => {
      const result = parsePropertyFilters(params("tipo=sala_comercial"));
      expect(result).toEqual({ ok: true, filters: { kind: "sala_comercial" } });
    });

    it("recusa um valor fora do enum", () => {
      const result = parsePropertyFilters(params("tipo=fazenda"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toContain("tipo");
    });
  });

  describe("bairro / cidade — passam por normalizeForSearch", () => {
    it("bairro é normalizado (minúsculas, sem acento, sem espaço nas pontas)", () => {
      const result = parsePropertyFilters(params("bairro=" + encodeURIComponent("São José ")));
      expect(result).toEqual({
        ok: true,
        filters: { neighborhood: normalizeForSearch("São José ") },
      });
      expect(result.ok && result.filters.neighborhood).toBe("sao jose");
    });

    it("cidade é normalizada", () => {
      const result = parsePropertyFilters(params("cidade=" + encodeURIComponent("Uberlândia")));
      expect(result).toEqual({
        ok: true,
        filters: { city: normalizeForSearch("Uberlândia") },
      });
      expect(result.ok && result.filters.city).toBe("uberlandia");
    });
  });

  describe("precoMin / precoMax — reais convertidos para centavos, uma única vez", () => {
    it("precoMin em reais vira minPriceCents em centavos", () => {
      const result = parsePropertyFilters(params("precoMin=500"));
      expect(result).toEqual({ ok: true, filters: { minPriceCents: 50000 } });
    });

    it("precoMax em reais vira maxPriceCents em centavos", () => {
      const result = parsePropertyFilters(params("precoMax=1000"));
      expect(result).toEqual({ ok: true, filters: { maxPriceCents: 100000 } });
    });

    it("precoMin e precoMax combinados, ambos válidos, convertidos e aceitos", () => {
      const result = parsePropertyFilters(params("precoMin=100&precoMax=500"));
      expect(result).toEqual({
        ok: true,
        filters: { minPriceCents: 10000, maxPriceCents: 50000 },
      });
    });

    it("precoMin maior que precoMax é recusado, com detalhe nomeando o conflito (Edge Case)", () => {
      const result = parsePropertyFilters(params("precoMin=600&precoMax=500"));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.detail).toContain("600");
      expect(result.detail).toContain("500");
    });

    it("precoMin igual a precoMax é aceito (não é um conflito)", () => {
      const result = parsePropertyFilters(params("precoMin=500&precoMax=500"));
      expect(result).toEqual({
        ok: true,
        filters: { minPriceCents: 50000, maxPriceCents: 50000 },
      });
    });

    it.each([
      ["não inteiro", "precoMin=12.5"],
      ["negativo", "precoMin=-10"],
      ["zero", "precoMin=0"],
      ["não numérico", "precoMin=abc"],
    ])(
      "precoMin %s é recusado, nunca reinterpretado como centavos (Edge Case)",
      (_label, query) => {
        const result = parsePropertyFilters(params(query));
        expect(result.ok).toBe(false);
      }
    );

    it.each([
      ["não inteiro", "precoMax=12.5"],
      ["negativo", "precoMax=-10"],
      ["zero", "precoMax=0"],
      ["não numérico", "precoMax=abc"],
    ])("precoMax %s é recusado (Edge Case)", (_label, query) => {
      const result = parsePropertyFilters(params(query));
      expect(result.ok).toBe(false);
    });
  });

  describe("quartosMin", () => {
    it("aceita um inteiro positivo", () => {
      const result = parsePropertyFilters(params("quartosMin=3"));
      expect(result).toEqual({ ok: true, filters: { minBedrooms: 3 } });
    });

    it.each([
      ["zero", "quartosMin=0"],
      ["negativo", "quartosMin=-1"],
      ["não inteiro", "quartosMin=1.5"],
      ["não numérico", "quartosMin=abc"],
    ])("quartosMin %s é recusado (Edge Case)", (_label, query) => {
      const result = parsePropertyFilters(params(query));
      expect(result.ok).toBe(false);
    });
  });

  it("combina todos os filtros por conjunção quando todos estão presentes", () => {
    const result = parsePropertyFilters(
      params(
        "modalidade=novo&tipo=casa&bairro=Centro&cidade=Uberaba&precoMin=100&precoMax=900&quartosMin=2"
      )
    );
    expect(result).toEqual({
      ok: true,
      filters: {
        modality: "novo",
        kind: "casa",
        neighborhood: "centro",
        city: "uberaba",
        minPriceCents: 10000,
        maxPriceCents: 90000,
        minBedrooms: 2,
      },
    });
  });
});
