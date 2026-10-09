import { describe, expect, it } from "vitest";
import {
  ACTIVATION_BLOCKER_LABELS,
  activationBlockers,
  normalizeAccent,
  normalizeInstagram,
  normalizeOptionalText,
  normalizePhoneDigits,
  validateStorefrontInput,
  type StorefrontInput,
} from "../storefront";

function input(overrides: Partial<StorefrontInput> = {}): StorefrontInput {
  return { active: false, layout: "grade", font: "inter", ...overrides };
}

function refusal(overrides: Partial<StorefrontInput>) {
  const result = validateStorefrontInput(input(overrides));
  if (result.ok) throw new Error("esperava recusa");
  return result;
}

describe("L16a T3 — validação da configuração da vitrine (VCFG-02)", () => {
  it("uma configuração completa e válida é normalizada e devolvida inteira", () => {
    const result = validateStorefrontInput({
      active: true,
      layout: "editorial",
      accentColor: "#AABBCC",
      font: "playfair",
      creci: "  CRECI 12345-J  ",
      legalName: " Imobiliária Exemplo Ltda ",
      headline: "Casas e apartamentos",
      about: "Texto institucional.",
      instagram: "@Imobiliaria.X",
      phone: "(11) 99999-1234",
      address: "Rua Exemplo, 100",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        active: true,
        layout: "editorial",
        accentColor: "#aabbcc",
        font: "playfair",
        creci: "CRECI 12345-J",
        legalName: "Imobiliária Exemplo Ltda",
        headline: "Casas e apartamentos",
        about: "Texto institucional.",
        instagram: "imobiliaria.x",
        phone: "11999991234",
        address: "Rua Exemplo, 100",
      },
    });
  });

  it("layout ou fonte fora das listas fechadas é recusado no campo", () => {
    expect(refusal({ layout: "mosaico" }).field).toBe("layout");
    expect(refusal({ font: "comic" }).field).toBe("fonte");
  });

  describe("cor (AC5, AC6 e Edge Case)", () => {
    it.each(["#ABC", "vermelho", "#aabbc", "#aabbccd", "aabbcc", "#gggggg"])(
      "%s é recusada indicando o campo cor",
      (accentColor) => {
        expect(refusal({ accentColor }).field).toBe("cor");
      }
    );

    it("#AABBCC é aceita e gravada como #aabbcc", () => {
      const result = validateStorefrontInput(input({ accentColor: "#AABBCC" }));
      expect(result.ok && result.value.accentColor).toBe("#aabbcc");
    });

    it("cor vazia, só espaços ou ausente vira nulo", () => {
      for (const accentColor of ["", "   ", null, undefined]) {
        const result = validateStorefrontInput(input({ accentColor }));
        expect(result.ok && result.value.accentColor).toBeNull();
      }
    });
  });

  describe("limites de tamanho (AC7), um caso por limite", () => {
    const cases: Array<[string, "creci" | "legalName" | "headline" | "about" | "address", string, number]> = [
      ["creci", "creci", "creci", 40],
      ["razaoSocial", "legalName", "razaoSocial", 120],
      ["titulo", "headline", "titulo", 120],
      ["sobre", "about", "sobre", 1500],
      ["endereco", "address", "endereco", 200],
    ];
    it.each(cases)("%s: o limite é aceito e um caractere a mais é recusado", (_name, key, field, max) => {
      const atLimit = validateStorefrontInput(input({ [key]: "a".repeat(max) }));
      expect(atLimit.ok && atLimit.value[key]).toBe("a".repeat(max));

      const over = refusal({ [key]: "a".repeat(max + 1) });
      expect(over.field).toBe(field);
      expect("value" in over).toBe(false);
    });

    it("espaços nas pontas não contam para o limite", () => {
      const result = validateStorefrontInput(input({ creci: ` ${"a".repeat(40)} ` }));
      expect(result.ok && result.value.creci).toBe("a".repeat(40));
    });
  });

  describe("Instagram (AC8 e Edge Case)", () => {
    it("@Imobiliaria.X é gravado como imobiliaria.x", () => {
      const result = validateStorefrontInput(input({ instagram: "@Imobiliaria.X" }));
      expect(result.ok && result.value.instagram).toBe("imobiliaria.x");
    });

    it("30 caracteres são aceitos e 31 são recusados", () => {
      const ok = validateStorefrontInput(input({ instagram: "a".repeat(30) }));
      expect(ok.ok && ok.value.instagram).toBe("a".repeat(30));
      expect(refusal({ instagram: "a".repeat(31) }).field).toBe("instagram");
    });

    it.each(["com espaço", "com-hifen", "açaí", "a/b", "@@dupla"])("%s é recusado", (instagram) => {
      expect(refusal({ instagram }).field).toBe("instagram");
    });
  });

  describe("telefone (AC9)", () => {
    it("10 e 13 dígitos são aceitos, com ou sem máscara", () => {
      const ten = validateStorefrontInput(input({ phone: "(11) 3333-4444" }));
      expect(ten.ok && ten.value.phone).toBe("1133334444");
      const thirteen = validateStorefrontInput(input({ phone: "+55 (11) 99999-1234" }));
      expect(thirteen.ok && thirteen.value.phone).toBe("5511999991234");
    });

    it("9 e 14 dígitos são recusados indicando o campo telefone", () => {
      expect(refusal({ phone: "123456789" }).field).toBe("telefone");
      expect(refusal({ phone: "12345678901234" }).field).toBe("telefone");
    });
  });

  describe("texto opcional vazio vira nulo (AC10)", () => {
    it("vazio, só espaços ou ausente gravam nulo em todos os campos opcionais", () => {
      for (const blank of ["", "   ", null, undefined]) {
        const result = validateStorefrontInput(
          input({
            creci: blank, legalName: blank, headline: blank, about: blank,
            instagram: blank, phone: blank, address: blank,
          })
        );
        expect(result).toEqual({
          ok: true,
          value: {
            active: false, layout: "grade", accentColor: null, font: "inter",
            creci: null, legalName: null, headline: null, about: null,
            instagram: null, phone: null, address: null,
          },
        });
      }
    });
  });

  it("AC11: qualquer recusa não devolve valor algum para gravar", () => {
    const result = validateStorefrontInput(input({ creci: "CRECI 1", accentColor: "vermelho", about: "ok" }));
    expect(result).toEqual({ ok: false, field: "cor", message: expect.any(String) });
  });
});

describe("normalizadores", () => {
  it("normalizeOptionalText apara e transforma vazio em nulo", () => {
    expect(normalizeOptionalText("  x ")).toBe("x");
    expect(normalizeOptionalText("   ")).toBeNull();
    expect(normalizeOptionalText(undefined)).toBeNull();
  });

  it("normalizeAccent põe em minúsculas e transforma vazio em nulo", () => {
    expect(normalizeAccent("#AABBCC")).toBe("#aabbcc");
    expect(normalizeAccent("")).toBeNull();
  });

  it("normalizeInstagram tira um @ inicial e põe em minúsculas", () => {
    expect(normalizeInstagram("@Imobiliaria.X")).toBe("imobiliaria.x");
    expect(normalizeInstagram("  ")).toBeNull();
  });

  it("normalizePhoneDigits mantém só dígitos", () => {
    expect(normalizePhoneDigits("(11) 99999-1234")).toBe("11999991234");
    expect(normalizePhoneDigits("sem número")).toBeNull();
  });
});

describe("L16a T4 — bloqueios de ativação (VATIV-01)", () => {
  const complete = { creci: "CRECI 12345", legalName: "Imobiliária Ltda" };

  it("nada faltando → lista vazia", () => {
    expect(activationBlockers({ storefront: complete, agentWhatsapp: "5511999991234" })).toEqual([]);
  });

  it("AC1: CRECI vazio sozinho → só creci", () => {
    expect(activationBlockers({ storefront: { ...complete, creci: "" }, agentWhatsapp: "5511999991234" })).toEqual(["creci"]);
  });

  it("AC2: razão social vazia sozinha → só razaoSocial", () => {
    expect(activationBlockers({ storefront: { ...complete, legalName: null }, agentWhatsapp: "5511999991234" })).toEqual(["razaoSocial"]);
  });

  it("AC3: WhatsApp do agente vazio sozinho → só whatsappAgente", () => {
    expect(activationBlockers({ storefront: complete, agentWhatsapp: null })).toEqual(["whatsappAgente"]);
  });

  it("AC4: as três faltando saem na ordem CRECI, razão social, WhatsApp do agente", () => {
    expect(activationBlockers({ storefront: {}, agentWhatsapp: undefined })).toEqual([
      "creci", "razaoSocial", "whatsappAgente",
    ]);
  });

  it("AC4: duas faltando mantêm a ordem relativa", () => {
    expect(activationBlockers({ storefront: { creci: "", legalName: "Ltda" }, agentWhatsapp: " " })).toEqual([
      "creci", "whatsappAgente",
    ]);
    expect(activationBlockers({ storefront: { creci: "CRECI 1", legalName: "" }, agentWhatsapp: "" })).toEqual([
      "razaoSocial", "whatsappAgente",
    ]);
  });

  it("só espaços conta como vazio nos três campos", () => {
    expect(
      activationBlockers({ storefront: { creci: "   ", legalName: "	 " }, agentWhatsapp: "  " })
    ).toEqual(["creci", "razaoSocial", "whatsappAgente"]);
  });

  it("todo bloqueio tem rótulo para a tela", () => {
    for (const blocker of activationBlockers({ storefront: {}, agentWhatsapp: "" })) {
      expect(ACTIVATION_BLOCKER_LABELS[blocker].length).toBeGreaterThan(0);
    }
    expect(Object.keys(ACTIVATION_BLOCKER_LABELS).sort()).toEqual(["creci", "razaoSocial", "whatsappAgente"]);
  });
});
