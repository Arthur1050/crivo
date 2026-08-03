import { describe, expect, it } from "vitest";
import { getMockManager } from "../mock-manager";

// Testes 1:1 com RD-01 AC4 (redesign-crm-astryx): o rodapé da sidebar exibe um
// bloco de usuário mock "derivado deterministicamente do tenant".
describe("getMockManager (RD-01 AC4)", () => {
  const tenantA = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Imobiliária Vale do Uberaba",
  };
  const tenantB = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Triângulo Imóveis",
  };

  it("é determinístico: o mesmo tenant sempre produz o mesmo nome e email", () => {
    const first = getMockManager(tenantA);
    const second = getMockManager(tenantA);
    expect(second).toEqual(first);
    expect(second.name).toBe(first.name);
    expect(second.email).toBe(first.email);
  });

  it("tenants distintos produzem managers distintos (email derivado do nome do tenant)", () => {
    const managerA = getMockManager(tenantA);
    const managerB = getMockManager(tenantB);
    expect(managerA.email).not.toBe(managerB.email);
    expect(managerA.email).toBe("gestor@imobiliaria-vale-do-uberaba.com.br");
    expect(managerB.email).toBe("gestor@triangulo-imoveis.com.br");
  });

  it("expõe o nome de gestor da referência visual (design.md — R0, rodapé)", () => {
    expect(getMockManager(tenantA).name).toBe("Gestor Demo");
  });

  it("email é sempre um endereço bem formado, sem acento nem espaço", () => {
    const { email } = getMockManager({
      id: tenantA.id,
      name: "Imóveis São João & Cia. Ltda",
    });
    expect(email).toBe("gestor@imoveis-sao-joao-cia-ltda.com.br");
    expect(email).toMatch(/^[a-z0-9]+@[a-z0-9-]+\.com\.br$/);
  });

  it("cai no id do tenant como domínio quando o nome não gera slug algum", () => {
    const manager = getMockManager({ id: "abc-123", name: "  ***  " });
    expect(manager.email).toBe("gestor@abc-123.com.br");
  });
});
