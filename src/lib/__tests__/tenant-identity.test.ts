import { describe, expect, it } from "vitest";
import { formatTenantLocation } from "../tenant-identity";

// Testes 1:1 com RD-01 AC1 (subtítulo "{city}, {state}" quando ambos existem)
// e RD-01 AC5 / Edge Cases (omitir o subtítulo quando faltar city/state).
describe("formatTenantLocation (RD-01 AC1/AC5)", () => {
  it("monta '{city}, {state}' quando ambos existem", () => {
    expect(formatTenantLocation("Uberaba", "MG")).toBe("Uberaba, MG");
  });

  it("retorna null quando city é null (subtítulo omitido)", () => {
    expect(formatTenantLocation(null, "MG")).toBeNull();
  });

  it("retorna null quando state é null (subtítulo omitido)", () => {
    expect(formatTenantLocation("Uberaba", null)).toBeNull();
  });

  it("retorna null quando ambos são null", () => {
    expect(formatTenantLocation(null, null)).toBeNull();
  });

  it("retorna null quando um dos campos é string vazia ou só espaços", () => {
    expect(formatTenantLocation("", "MG")).toBeNull();
    expect(formatTenantLocation("Uberaba", "   ")).toBeNull();
  });

  it("normaliza espaços nas bordas antes de compor o subtítulo", () => {
    expect(formatTenantLocation("  Uberlândia ", " MG ")).toBe(
      "Uberlândia, MG"
    );
  });

  it("trata undefined como ausente (tenant sem a coluna carregada)", () => {
    expect(formatTenantLocation(undefined, undefined)).toBeNull();
    expect(formatTenantLocation("Uberaba", undefined)).toBeNull();
  });
});
