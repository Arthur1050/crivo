import { describe, expect, it, vi } from "vitest";
import { checkImports, type BoundaryRule } from "../../../scripts/boundary/check";
import map from "../../../scripts/boundary/map.json";
import { defineVertical } from "../index";
import { testVertical } from "./fixture-vertical";
import { sourceGraph } from "./source-graph";

vi.mock("../index", async importOriginal => {
  const original = await importOriginal<typeof import("../index")>();
  return { ...original, defineVertical: vi.fn(original.defineVertical) };
});

describe("vertical de teste — VERT-03", () => {
  it("aceita Acme pelo contrato sem catálogo, agendamento, qualificação ou segmentos", () => {
    expect(defineVertical).toHaveBeenCalledWith(testVertical);
    expect(defineVertical(testVertical)).toBe(testVertical);
    expect(testVertical).toEqual({
      id: "test", brand: { name: "Acme", problemUrn: "acme", tenantHeader: "X-Acme-Tenant", alertTag: "acme" },
      resources: [], appointments: false, qualification: null, documentSegments: null,
    });
  });

  it("percorre os imports reais do fixture sem alcançar o vertical imobiliário", () => {
    const { sources, externalImports } = sourceGraph("src/vertical-kit/__tests__/fixture-vertical.ts");
    expect(Object.keys(sources)).toContain("src/vertical-kit/index.ts");
    expect(Object.keys(sources)).toContain("src/lib/vocabulary.ts");
    expect(Object.keys(sources).filter(file => file.startsWith("src/verticals/real-estate/"))).toEqual([]);
    expect(externalImports).toEqual([]);
    expect(checkImports(sources, map as BoundaryRule[])).toEqual([]);
  });
});
