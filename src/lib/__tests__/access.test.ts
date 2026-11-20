import { describe, expect, it } from "vitest";
import { ACTIONS, createAccess, ROLES } from "../access";
import { ROLE, type Role } from "../vocabulary";
import { realEstate } from "../../verticals/real-estate";
import { testVertical } from "../../vertical-kit/__tests__/fixture-vertical";

// Matriz literal de bf5e646, independente da implementação composta.
const baseline = {
  "administrador": {
    "dashboard": [
      "ler"
    ],
    "pipeline": [
      "ler",
      "escrever"
    ],
    "chats": [
      "ler",
      "escrever"
    ],
    "documentos": [
      "ler",
      "escrever"
    ],
    "configuracoes": [
      "ler",
      "escrever"
    ],
    "usuarios": [
      "ler",
      "escrever"
    ],
    "imoveis": [
      "ler",
      "escrever"
    ]
  },
  "gestor": {
    "dashboard": [
      "ler"
    ],
    "pipeline": [
      "ler",
      "escrever"
    ],
    "chats": [
      "ler",
      "escrever"
    ],
    "documentos": [
      "ler",
      "escrever"
    ],
    "configuracoes": [
      "ler",
      "escrever"
    ],
    "usuarios": [],
    "imoveis": [
      "ler",
      "escrever"
    ]
  },
  "corretor": {
    "dashboard": [
      "ler"
    ],
    "pipeline": [
      "ler",
      "escrever"
    ],
    "chats": [
      "ler",
      "escrever"
    ],
    "documentos": [
      "ler"
    ],
    "configuracoes": [],
    "usuarios": [],
    "imoveis": [
      "ler"
    ]
  }
} as const;
const resourceNames = { dashboard: "dashboard", pipeline: "pipeline", chats: "chats", documentos: "documents", configuracoes: "settings", usuarios: "users", imoveis: "catalog" } as const;
const actionNames = { ler: "read", escrever: "write" } as const;

describe("permissões compostas", () => {
  it("preserva cada célula da matriz da base", () => {
    const { can, RESOURCES } = createAccess(realEstate);
    expect(RESOURCES).toEqual(Object.values(resourceNames));
    for (const role of ROLES) {
      for (const resource of Object.keys(resourceNames) as (keyof typeof resourceNames)[]) {
        for (const action of ["ler", "escrever"] as const) {
          expect(can([role], resourceNames[resource], actionNames[action]), `${role}/${resource}/${action}`)
            .toBe((baseline[role][resource] as readonly string[]).includes(action));
        }
      }
    }
  });
  it("recusa recursos ausentes, desconhecidos e nomes do protótipo", () => {
    for (const vertical of [realEstate, testVertical]) {
      const { can } = createAccess(vertical);
      for (const resource of ["", "unknown", "constructor", "toString", null, undefined]) {
        for (const role of ROLES) for (const action of ACTIONS) {
          expect(can([role], resource as string, action)).toBe(false);
        }
      }
    }
  });
  it("não concede catálogo com o vertical de teste", () => {
    const { can, RESOURCES } = createAccess(testVertical);
    expect(RESOURCES).not.toContain("catalog");
    for (const role of ROLES) for (const action of ACTIONS) expect(can([role], "catalog", action)).toBe(false);
  });
  it("compõe as permissões declaradas, fecha a matriz e une papéis", () => {
    const resource = { name: "inventory", permissions: { [ROLE.admin]: ["write" as const], [ROLE.manager]: ["read" as const], [ROLE.attendant]: [] } };
    const { can } = createAccess({ ...testVertical, resources: [resource] });
    resource.permissions[ROLE.admin].length = 0;
    expect(can([ROLE.admin], "inventory", "write")).toBe(true);
    expect(can([ROLE.admin], "inventory", "read")).toBe(false);
    expect(can([ROLE.manager], "inventory", "read")).toBe(true);
    expect(can([ROLE.manager], "inventory", "write")).toBe(false);
    expect(can([ROLE.attendant], "inventory", "read")).toBe(false);
    expect(can([ROLE.attendant], "inventory", "write")).toBe(false);
    expect(can([ROLE.manager, ROLE.admin], "inventory", "write")).toBe(true);
    expect(can([], "inventory", "read")).toBe(false);
    expect(can(["unknown" as Role], "inventory", "read")).toBe(false);
  });
});
