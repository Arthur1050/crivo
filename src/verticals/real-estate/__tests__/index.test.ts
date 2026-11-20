import { describe, expect, it, vi } from "vitest";
import { checkImports, classifyFile, type BoundaryRule } from "../../../../scripts/boundary/check";
import map from "../../../../scripts/boundary/map.json";
import { defineVertical } from "../../../vertical-kit";
import { sourceGraph } from "../../../vertical-kit/__tests__/source-graph";
import { realEstate } from "../index";
import { qualification } from "../qualification";

vi.mock("../../../vertical-kit", async importOriginal => {
  const original = await importOriginal<typeof import("../../../vertical-kit")>();
  return { ...original, defineVertical: vi.fn(original.defineVertical) };
});

describe("vertical real-estate — VERT-02", () => {
  it("liga a definição ao contrato e preserva marca, catálogo e agendamento", () => {
    expect(defineVertical).toHaveBeenCalledWith(realEstate);
    expect(realEstate).toMatchObject({
      id: "real-estate", brand: { name: "Krivo", problemUrn: "krivo", tenantHeader: "X-Krivo-Tenant", alertTag: "krivo" },
      appointments: true,
      resources: [{ name: "catalog", permissions: { administrador: ["read", "write"], gestor: ["read", "write"], corretor: ["read"] } }],
    });
    expect(realEstate.qualification).toBe(qualification);
    expect(realEstate.documentSegments?.values).toEqual(["novo", "usado", "ambos"]);
  });

  it.each([
    ["novo", "novo", true], ["novo", "usado", false], ["novo", "ambos", true],
    ["usado", "novo", false], ["usado", "usado", true], ["usado", "ambos", true],
    ["ambos", "novo", true], ["ambos", "usado", true], ["ambos", "ambos", true],
  ])("mantém a correspondência documento %s / consulta %s", (document, query, expected) => {
    expect(realEstate.documentSegments!.matches(document, query)).toBe(expected);
  });

  it.each([undefined, null, "invalid"])("recusa segmento inválido nos dois argumentos: %j", segment => {
    expect(realEstate.documentSegments!.matches(segment as string, "ambos")).toBe(false);
    expect(realEstate.documentSegments!.matches("ambos", segment as string)).toBe(false);
  });

  it("mantém todo o grafo seguro para o navegador, sem banco ou módulos de servidor", () => {
    const { sources, externalImports } = sourceGraph("src/verticals/real-estate/index.ts");
    expect(externalImports).toEqual([]);
    expect(checkImports(sources, map as BoundaryRule[])).toEqual([]);
    for (const file of Object.keys(sources)) {
      expect(["@core/db", "@core/server"]).not.toContain(classifyFile(file, map as BoundaryRule[])?.package);
    }
  });
});
