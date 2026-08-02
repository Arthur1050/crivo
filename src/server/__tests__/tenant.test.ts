import "dotenv/config";
import { describe, expect, it } from "vitest";
import { resolveActiveTenant, setActiveTenant } from "../tenant";
import type { Tenant } from "../data";

function makeTenant(overrides: Partial<Tenant> & { id: string }): Tenant {
  return {
    name: "Tenant",
    agentName: "Agente",
    supportedModality: "ambos",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as Tenant;
}

const tenantA = makeTenant({ id: "tenant-a", name: "Imobiliária A" });
const tenantB = makeTenant({ id: "tenant-b", name: "Imobiliária B" });
const tenants: Tenant[] = [tenantA, tenantB];

describe("resolveActiveTenant", () => {
  it("retorna o tenant correspondente quando o cookie aponta para um tenant válido", () => {
    const result = resolveActiveTenant("tenant-b", tenants);
    expect(result).toBe(tenantB);
  });

  it("retorna o primeiro tenant da lista quando o cookie está ausente (undefined)", () => {
    const result = resolveActiveTenant(undefined, tenants);
    expect(result).toBe(tenantA);
  });

  it("retorna o primeiro tenant da lista quando o cookie aponta para um tenant inexistente (edge case — seed recriado)", () => {
    const result = resolveActiveTenant("tenant-recriado-inexistente", tenants);
    expect(result).toBe(tenantA);
  });
});

// setActiveTenant valida o tenantId antes de qualquer chamada a next/headers
// `cookies()` — a rejeição abaixo é alcançável sem harness de server action
// (o `throw` acontece antes de tocar no cookie), então é testável direto
// contra o banco real já seedado, sem mock.
describe("setActiveTenant", () => {
  it("rejeita um tenantId inexistente sem gravar o cookie (não falha silenciosamente)", async () => {
    await expect(
      setActiveTenant("00000000-0000-4000-8000-000000000000")
    ).rejects.toThrow();
  });
});
