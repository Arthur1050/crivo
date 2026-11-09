import { describe, expect, it } from "vitest";
import {
  creditStatusEnum, modalityEnum, motivationEnum, propertyTypeEnum,
} from "../../../db/schema";
import { propertyKindEnum, propertyStatusEnum, storefrontLayoutEnum } from "../schema";
import { CREDIT_STATUS, MODALITY, MOTIVATION, PROPERTY_KIND, PROPERTY_STATUS, PROPERTY_TYPE, STOREFRONT_LAYOUT } from "../vocabulary";

describe("vocabulário da imobiliária (VOCAB-01)", () => {
  it.each([
    [MODALITY, { new: "novo", used: "usado", both: "ambos" }],
    [PROPERTY_TYPE, { house: "casa", apartment: "apartamento" }],
    [PROPERTY_KIND, { house: "casa", apartment: "apartamento", townhouse: "sobrado", penthouse: "cobertura", land: "terreno", commercial_room: "sala_comercial", farmhouse: "chacara" }],
    [PROPERTY_STATUS, { available: "disponivel", reserved: "reservado", sold: "vendido" }],
    [MOTIVATION, { investor: "investidor", resident: "morador" }],
    [CREDIT_STATUS, { pre_approved: "pre_aprovado", own_funds: "recurso_proprio", fgts: "fgts" }],
    [STOREFRONT_LAYOUT, { grid: "grade", editorial: "editorial" }],
  ])("preserva cada par chave e valor: %j", (actual, expected) => {
    expect(actual).toEqual(expected);
  });

  it.each([
    [MODALITY, modalityEnum.enumValues], [PROPERTY_TYPE, propertyTypeEnum.enumValues],
    [PROPERTY_KIND, propertyKindEnum.enumValues], [PROPERTY_STATUS, propertyStatusEnum.enumValues],
    [MOTIVATION, motivationEnum.enumValues], [CREDIT_STATUS, creditStatusEnum.enumValues],
    [STOREFRONT_LAYOUT, storefrontLayoutEnum.enumValues],
  ])("mantém o conjunto e a ordem do enum: %j", (actual, values) => {
    expect(Object.values(actual)).toEqual(values);
  });
});
