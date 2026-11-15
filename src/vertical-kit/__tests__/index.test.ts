import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkImports, type BoundaryRule } from "../../../scripts/boundary/check";
import { ROLE } from "../../lib/vocabulary";
import { CORE_RESOURCES, defineVertical, type Vertical, type VerticalResource } from "../index";

function fixture(): Vertical {
  return {
    id: "example",
    brand: {
      name: "Exemplo", problemUrn: "example", tenantHeader: "X-Example-Tenant", alertTag: "example",
      tenantNoun: { singular: "loja", plural: "lojas" },
    },
    resources: [{ name: "orders", permissions: { [ROLE.admin]: ["read", "write"], [ROLE.manager]: ["read"], [ROLE.attendant]: [] } }],
    appointments: false, qualification: null, documentSegments: null,
  };
}

describe("defineVertical — VERT-01", () => {
  it.each(["name", "problemUrn", "tenantHeader", "alertTag"] as const)("valida a marca em %s, vazia ou ausente", field => {
    for (const value of [undefined, null, 7, "", " "]) {
      const vertical = fixture();
      const brand = { ...vertical.brand, [field]: value } as Vertical["brand"];
      if (value === undefined) Reflect.deleteProperty(brand, field);
      expect(Object.hasOwn(brand, field)).toBe(value !== undefined);
      expect(() => defineVertical({ ...vertical, brand })).toThrow(`Vertical inválido: brand.${field}.`);
    }
  });

  it.each(["tenantNoun", "singular", "plural"] as const)("valida o nome do tenant em %s", field => {
    for (const value of [undefined, null, 7, "", " "]) {
      const vertical = fixture();
      const { tenantNoun } = vertical.brand;
      const brand = {
        ...vertical.brand,
        tenantNoun: field === "tenantNoun" ? value : { ...tenantNoun, [field]: value },
      } as Vertical["brand"];
      if (value === undefined) {
        Reflect.deleteProperty(field === "tenantNoun" ? brand : brand.tenantNoun, field);
      }
      const path = field === "tenantNoun" ? "brand.tenantNoun" : `brand.tenantNoun.${field}`;
      expect(() => defineVertical({ ...vertical, brand })).toThrow(`Vertical inválido: ${path}.`);
    }
  });

  it("entrega o mesmo objeto válido, preservando todos os campos", () => {
    const vertical = fixture();
    expect(defineVertical(vertical)).toBe(vertical);
    expect(defineVertical({ ...vertical, appointments: true, resources: [] }).appointments).toBe(true);
  });

  it.each([undefined, null, "", "   ", 42])("recusa id inválido: %j", id => {
    expect(() => defineVertical({ ...fixture(), id } as Vertical)).toThrow(/\bid\b/);
  });

  it.each(CORE_RESOURCES)("recusa colisão com o recurso do núcleo %s", name => {
    const vertical = fixture();
    expect(() => defineVertical({ ...vertical, resources: [{ ...vertical.resources[0], name }] })).toThrow("resources[0].name");
  });

  it.each(["brand", "resources", "appointments", "qualification", "documentSegments"])("recusa campo ausente ou inválido: %s", field => {
    for (const value of [undefined, 7]) {
      expect(() => defineVertical({ ...fixture(), [field]: value })).toThrow(field);
    }
    if (field !== "qualification" && field !== "documentSegments") {
      expect(() => defineVertical({ ...fixture(), [field]: null })).toThrow(field);
    }
  });

  it.each(Object.values(ROLE))("exige permissões do papel %s também em runtime", role => {
    for (const value of [undefined, null, ["invalid"]]) {
      const vertical = fixture();
      const resource = vertical.resources[0];
      expect(() => defineVertical({ ...vertical, resources: [{ ...resource, permissions: { ...resource.permissions, [role]: value } }] } as Vertical)).toThrow(`permissions.${role}`);
    }
  });

  it("preserva as funções e os campos do agente da qualificação e a correspondência dos segmentos", () => {
    const qualification = {
      parsePatch: () => ({ ok: true as const, dto: { material: "madeira" } }),
      serialize: () => ({ wireMaterial: "aço" }), toLeadColumns: () => ({ region: "Sul" }), promptFacts: () => ({ need: "cimento" }),
      agentFields: ["material", "quantity"], nextFieldToAsk: (asked: string[]) => asked.length ? null : "material",
    };
    const documentSegments = { values: ["retail", "wholesale"], matches: (document: string, query: string) => document === query };
    const vertical = defineVertical({ ...fixture(), qualification, documentSegments });
    expect(vertical.qualification).toBe(qualification);
    expect(vertical.qualification?.agentFields).toEqual(["material", "quantity"]);
    expect(vertical.qualification?.nextFieldToAsk([])).toBe("material");
    expect(vertical.documentSegments).toBe(documentSegments);
  });

  it("rejeita callbacks ausentes e valores de segmento inválidos", () => {
    expect(() => defineVertical({ ...fixture(), qualification: {} } as Vertical)).toThrow("qualification.parsePatch");
    const functions = { parsePatch: () => ({ ok: true as const, dto: {} }), serialize: () => ({}), toLeadColumns: () => ({}), promptFacts: () => ({}) };
    expect(() => defineVertical({ ...fixture(), qualification: { ...functions, agentFields: [] } } as unknown as Vertical)).toThrow("Vertical inválido: qualification.nextFieldToAsk.");
    for (const agentFields of [undefined, "modality", [""], ["modality", "modality"]]) {
      expect(() => defineVertical({ ...fixture(), qualification: { ...functions, agentFields, nextFieldToAsk: () => null } } as unknown as Vertical))
        .toThrow("Vertical inválido: qualification.agentFields.");
    }
    expect(() => defineVertical({ ...fixture(), documentSegments: { values: [null], matches: () => true } } as unknown as Vertical)).toThrow("documentSegments.values");
    expect(() => defineVertical({ ...fixture(), documentSegments: { values: [] } } as unknown as Vertical)).toThrow("documentSegments.matches");
  });

  it("exige os três papéis em compilação", () => {
    // @ts-expect-error O papel de atendimento é obrigatório, mesmo sem permissões.
    const incomplete: VerticalResource = { name: "orders", permissions: { [ROLE.admin]: ["read"], [ROLE.manager]: [] } };
    expect(() => defineVertical({ ...fixture(), resources: [incomplete] })).toThrow(`permissions.${ROLE.attendant}`);
  });

  it("mantém a fronteira restrita ao vocabulário, inclusive contra novos imports", () => {
    const file = "src/vertical-kit/index.ts";
    const rules: BoundaryRule[] = [
      { glob: "src/vertical-kit/**", layer: "core", package: "@core/vertical-kit" },
      { glob: "src/lib/**", layer: "core", package: "@core/client" },
      { glob: "src/server/**", layer: "core", package: "@core/server" },
      { glob: "src/verticals/**", layer: "vertical" }, { glob: "app/**", layer: "app" },
    ];
    const source = readFileSync(file, "utf8");
    const sources = { [file]: source, "src/lib/vocabulary.ts": readFileSync("src/lib/vocabulary.ts", "utf8") };
    expect(checkImports(sources, rules)).toEqual([]);
    for (const target of ["src/kit/access.ts", "src/server/data/index.ts", "src/verticals/example/index.ts", "app/page.ts", "server-only", "node:fs"]) {
      expect(checkImports({ ...sources, [target]: "", [file]: `${source}\nimport "${target.startsWith("src/") || target.startsWith("app/") ? `@/${target}` : target}";` }, rules)).toEqual([
        expect.objectContaining({ file, message: `Import proibido: ${file} -> ${target}` }),
      ]);
    }
  });
});
