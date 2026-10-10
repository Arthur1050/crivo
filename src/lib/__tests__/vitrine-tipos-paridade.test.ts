import { describe, expect, it } from "vitest";
// AD-044: testes da suíte raiz podem importar de `vitrine/`.
import { MODALIDADES, TIPOS_DE_IMOVEL } from "../../../vitrine/src/lib/apresentacao";
import { modalityEnum, propertyKindEnum } from "../../db/schema";

describe("L16b T9 — tipos e modalidades da vitrine acompanham o enum do CRM (L-029)", () => {
  it("os tipos de imóvel são os do enum property_kind, na mesma ordem", () => {
    expect([...TIPOS_DE_IMOVEL]).toEqual([...propertyKindEnum.enumValues]);
  });

  it("as modalidades são as do enum modality, na mesma ordem", () => {
    expect([...MODALIDADES]).toEqual([...modalityEnum.enumValues]);
  });
});
