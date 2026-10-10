import { describe, expect, expectTypeOf, it } from "vitest";
// AD-044: testes da suíte raiz podem importar de `vitrine/`.
import {
  COLUNAS_DAS_VIEWS,
  FONTES,
  LAYOUTS,
  tagDaLoja,
  type CorpoRevalidacao,
  type Fonte,
  type Layout,
} from "../../../vitrine/src/contrato";
import {
  STOREFRONT_FONTS,
  STOREFRONT_LAYOUTS,
  STOREFRONT_VIEW_COLUMNS,
  storefrontCacheTag,
  type RevalidationRequest,
  type StorefrontFont,
  type StorefrontLayout,
} from "../storefront-contract";

describe("L16b T2 — paridade do contrato CRM ↔ vitrine (VPROJ-02 AC7, AC8)", () => {
  it("a tag de cache é igual para 3 slugs, com o formato tenant:<slug>:catalogo", () => {
    for (const slug of ["triangulo", "loja-a", "x9-y"]) {
      expect(tagDaLoja(slug)).toBe(storefrontCacheTag(slug));
      expect(tagDaLoja(slug)).toBe(`tenant:${slug}:catalogo`);
    }
  });

  it("os layouts são os mesmos, na mesma ordem", () => {
    expect([...LAYOUTS]).toEqual([...STOREFRONT_LAYOUTS]);
    expect([...LAYOUTS]).toEqual(["grade", "editorial"]);
  });

  it("as fontes são as mesmas, na mesma ordem", () => {
    expect([...FONTES]).toEqual([...STOREFRONT_FONTS]);
    expect([...FONTES]).toEqual(["inter", "montserrat", "lora", "playfair"]);
  });

  it("as colunas das duas views têm o mesmo nome e a mesma ordem", () => {
    expect(Object.keys(COLUNAS_DAS_VIEWS)).toEqual(Object.keys(STOREFRONT_VIEW_COLUMNS));
    for (const view of ["lojas", "imoveis"] as const) {
      expect([...COLUNAS_DAS_VIEWS[view]], view).toEqual([...STOREFRONT_VIEW_COLUMNS[view]]);
    }
  });

  it("os tipos espelhados são iguais (o tsc da raiz quebra se divergirem)", () => {
    expectTypeOf<Layout>().toEqualTypeOf<StorefrontLayout>();
    expectTypeOf<Fonte>().toEqualTypeOf<StorefrontFont>();
    expectTypeOf<CorpoRevalidacao>().toEqualTypeOf<RevalidationRequest>();
  });
});
