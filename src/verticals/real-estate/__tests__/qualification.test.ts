import { describe, expect, it } from "vitest";
import { qualification } from "../qualification";

const row = {
  modality: "usado", region: "Zona Norte", budgetCents: 67890123n, propertyType: "apartamento",
  purchaseHorizon: "seis meses", motivation: "investidor", creditStatus: "fgts", chainedOperation: false,
};

describe("faceta de qualificação — QUAL-01", () => {
  it.each([
    ["modality", "usado", "usado", "imóvel"],
    ["region", " Zona Norte ", "Zona Norte", 7],
    ["budgetCents", "67890123", 67890123n, -1],
    ["propertyType", "apartamento", "apartamento", "loja"],
    ["purchaseHorizon", " seis meses ", "seis meses", 6],
    ["motivation", "investidor", "investidor", "alugar"],
    ["creditStatus", "fgts", "fgts", "pendente"],
    ["chainedOperation", false, false, "false"],
  ])("valida e mapeia o campo %s", (field, value, parsed, invalid) => {
    expect(qualification.parsePatch({})).toEqual({ ok: true, dto: {} });
    for (const [input, output] of [[null, null], [value, parsed]]) {
      const patch = qualification.parsePatch({ [field]: input });
      expect(patch).toEqual({ ok: true, dto: { [field]: output } });
      if (!patch.ok) throw new Error(patch.detail);
      expect(qualification.toLeadColumns(patch.dto)).toEqual({ [field]: output });
    }
    expect(qualification.parsePatch({ [field]: invalid })).toMatchObject({
      ok: false, detail: expect.stringContaining(`Campo '${field}'`),
    });
    expect(qualification.toLeadColumns({})).toEqual({});
  });

  it("serializa os oito campos e fornece os mesmos fatos ao prompt", () => {
    const wire = { ...row, budgetCents: "67890123" };
    expect(qualification.serialize(row)).toEqual(wire);
    expect(qualification.promptFacts(row)).toEqual(wire);
    const empty = {
      modality: null, region: null, budgetCents: null, propertyType: null,
      purchaseHorizon: null, motivation: null, creditStatus: null, chainedOperation: null,
    };
    expect(qualification.serialize(empty)).toEqual(empty);
    expect(qualification.promptFacts(empty)).toEqual(empty);
  });
});
