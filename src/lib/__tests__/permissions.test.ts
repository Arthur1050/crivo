import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  RESOURCES,
  ROLES,
  can,
  type Action,
  type Resource,
  type Role,
} from "../permissions";

// lote-8 — PERM-01. A matriz vive em `context.md` (§ Papéis e permissões) e é
// transcrita aqui como tabela esperada: cada célula é o conjunto de ações que
// AQUELE papel tem sobre AQUELE recurso. O teste varre papel × recurso × ação
// (3 × 6 × 2 = 36 combinações) contra ela, então nenhuma célula fica sem
// verificação — nem as concedidas, nem as negadas.
const EXPECTED: Record<Role, Record<Resource, Action[]>> = {
  administrador: {
    dashboard: ["ler"],
    pipeline: ["ler", "escrever"],
    chats: ["ler", "escrever"],
    documentos: ["ler", "escrever"],
    configuracoes: ["ler", "escrever"],
    usuarios: ["ler", "escrever"],
  },
  gestor: {
    dashboard: ["ler"],
    pipeline: ["ler", "escrever"],
    chats: ["ler", "escrever"],
    documentos: ["ler", "escrever"],
    configuracoes: ["ler", "escrever"],
    usuarios: [],
  },
  corretor: {
    dashboard: ["ler"],
    pipeline: ["ler", "escrever"],
    chats: ["ler", "escrever"],
    documentos: ["ler"],
    configuracoes: [],
    usuarios: [],
  },
};

describe("lib/permissions — can (lote-8, PERM-01)", () => {
  describe("cada papel × cada recurso × cada ação", () => {
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        for (const action of ACTIONS) {
          const expected = EXPECTED[role][resource].includes(action);
          it(`${role} ${expected ? "pode" : "não pode"} ${action} ${resource}`, () => {
            expect(can([role], resource, action)).toBe(expected);
          });
        }
      }
    }
  });

  // PERM-01 AC1: administrador e gestor leem Dashboard, Pipeline e Chats da
  // imobiliária inteira e escrevem em Documentos e Configurações.
  it("administrador e gestor têm exatamente o mesmo alcance fora de Usuários (AC1)", () => {
    for (const resource of RESOURCES) {
      if (resource === "usuarios") continue;
      for (const action of ACTIONS) {
        expect(can(["administrador"], resource, action)).toBe(
          can(["gestor"], resource, action)
        );
      }
    }
  });

  // PERM-01 AC2: gestão de usuários é exclusiva do administrador.
  it("só administrador alcança Usuários (AC2)", () => {
    expect(can(["administrador"], "usuarios", "escrever")).toBe(true);
    expect(can(["gestor"], "usuarios", "escrever")).toBe(false);
    expect(can(["corretor"], "usuarios", "escrever")).toBe(false);
    expect(can(["gestor"], "usuarios", "ler")).toBe(false);
    expect(can(["corretor"], "usuarios", "ler")).toBe(false);
  });

  // PERM-01 AC3: corretor lê documentos, não escreve neles e não acessa
  // Configurações — nem para ler.
  it("corretor lê Documentos, não escreve, e não alcança Configurações (AC3)", () => {
    expect(can(["corretor"], "documentos", "ler")).toBe(true);
    expect(can(["corretor"], "documentos", "escrever")).toBe(false);
    expect(can(["corretor"], "configuracoes", "ler")).toBe(false);
    expect(can(["corretor"], "configuracoes", "escrever")).toBe(false);
  });

  // PERM-01 AC4: papéis acumulados concedem a UNIÃO das permissões — o papel
  // mais permissivo vence, nunca o mais restritivo.
  describe("papéis acumulados (AC4)", () => {
    it("corretor + gestor ganha o que o gestor tem, sem perder nada do corretor", () => {
      expect(can(["corretor", "gestor"], "documentos", "escrever")).toBe(true);
      expect(can(["corretor", "gestor"], "configuracoes", "escrever")).toBe(true);
      expect(can(["corretor", "gestor"], "pipeline", "ler")).toBe(true);
    });

    it("corretor + administrador alcança Usuários, que nenhum dos dois papéis isolados do corretor alcança", () => {
      expect(can(["corretor"], "usuarios", "escrever")).toBe(false);
      expect(can(["corretor", "administrador"], "usuarios", "escrever")).toBe(true);
    });

    it("a ordem dos papéis acumulados não muda o resultado", () => {
      expect(can(["gestor", "corretor"], "configuracoes", "escrever")).toBe(
        can(["corretor", "gestor"], "configuracoes", "escrever")
      );
    });

    it("acumular não concede o que nenhum dos papéis concede", () => {
      expect(can(["corretor", "gestor"], "usuarios", "ler")).toBe(false);
      expect(can(["corretor", "gestor"], "dashboard", "escrever")).toBe(false);
    });
  });

  it("lista de papéis vazia não concede nada", () => {
    for (const resource of RESOURCES) {
      for (const action of ACTIONS) {
        expect(can([], resource, action)).toBe(false);
      }
    }
  });
});
