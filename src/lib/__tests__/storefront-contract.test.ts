import { describe, expect, it } from "vitest";
import { storefrontFontEnum, storefrontLayoutEnum } from "../../db/schema";
import {
  STOREFRONT_FONTS,
  STOREFRONT_LAYOUTS,
  STOREFRONT_VIEW_COLUMNS,
  storefrontCacheTag,
} from "../storefront-contract";

describe("L16a T2 — contrato espelhado do lado CRM", () => {
  it("a tag de cache de imob-x é tenant:imob-x:catalogo (AD-042)", () => {
    expect(storefrontCacheTag("imob-x")).toBe("tenant:imob-x:catalogo");
  });

  it("layouts e fontes são iguais aos valores dos enums do schema, na mesma ordem (VCFG-01 AC3)", () => {
    expect([...STOREFRONT_LAYOUTS]).toEqual([...storefrontLayoutEnum.enumValues]);
    expect([...STOREFRONT_FONTS]).toEqual([...storefrontFontEnum.enumValues]);
  });

  it("vitrine.lojas expõe as colunas de VBANCO-01 AC2, na ordem", () => {
    expect([...STOREFRONT_VIEW_COLUMNS.lojas]).toEqual([
      "slug", "nome", "logo", "whatsapp", "cidade", "uf", "layout", "cor", "fonte",
      "creci", "razao_social", "titulo", "sobre", "instagram", "telefone", "endereco",
      "atualizado_em",
    ]);
  });

  it("vitrine.imoveis expõe as colunas de VBANCO-01 AC3, na ordem", () => {
    expect([...STOREFRONT_VIEW_COLUMNS.imoveis]).toEqual([
      "loja_slug", "referencia", "tipo", "modalidade", "bairro", "cidade", "uf",
      "preco_centavos", "area_m2", "quartos", "banheiros", "vagas", "descricao",
      "fotos", "destaque", "atualizado_em",
    ]);
  });
});
