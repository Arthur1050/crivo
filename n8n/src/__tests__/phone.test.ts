import { describe, expect, it } from "vitest";
import { toWhatsAppMsisdn } from "../phone.mjs";

describe("toWhatsAppMsisdn (nono dígito brasileiro no envio)", () => {
  it("wa_id legado do número de teste vira o MSISDN aceito pela Meta — caso exato da falha 131030 (execução 354)", () => {
    expect(toWhatsAppMsisdn("553499532444")).toBe("5534999532444");
  });

  it("celular brasileiro já com 13 dígitos volta inalterado", () => {
    expect(toWhatsAppMsisdn("5534999532444")).toBe("5534999532444");
  });

  it("aplicar a função duas vezes dá o mesmo resultado (idempotência — nunca insere um segundo 9)", () => {
    const once = toWhatsAppMsisdn("553499532444");
    const twice = toWhatsAppMsisdn(once);

    expect(twice).toBe("5534999532444");
    expect(twice).toBe(once);
  });

  it("fixo brasileiro de 8 dígitos NÃO recebe o nono dígito (local começa com 2-5 — Anatel: o 9 foi só do Serviço Móvel Pessoal)", () => {
    expect(toWhatsAppMsisdn("553432221111")).toBe("553432221111");
    expect(toWhatsAppMsisdn("551123456789")).toBe("551123456789");
    expect(toWhatsAppMsisdn("553444445555")).toBe("553444445555");
    expect(toWhatsAppMsisdn("553455556666")).toBe("553455556666");
  });

  it("celular legado começando com 6, 7 ou 8 também recebe o nono dígito (faixa móvel legada é 6-9)", () => {
    expect(toWhatsAppMsisdn("553461112222")).toBe("5534961112222");
    expect(toWhatsAppMsisdn("553471112222")).toBe("5534971112222");
    expect(toWhatsAppMsisdn("553481112222")).toBe("5534981112222");
  });

  it("número não-brasileiro volta inalterado — nenhuma regra de outro país é inventada", () => {
    expect(toWhatsAppMsisdn("12025550123")).toBe("12025550123");
    expect(toWhatsAppMsisdn("351912345678")).toBe("351912345678");
  });

  it("entradas inválidas/vazias viram string vazia, sem lançar exceção (mesma postura defensiva dos módulos vizinhos)", () => {
    expect(toWhatsAppMsisdn(null)).toBe("");
    expect(toWhatsAppMsisdn(undefined)).toBe("");
    expect(toWhatsAppMsisdn("")).toBe("");
    expect(toWhatsAppMsisdn("   ")).toBe("");
    expect(toWhatsAppMsisdn(5534999532444)).toBe("");
    expect(() => toWhatsAppMsisdn(null)).not.toThrow();
  });

  it("descarta formatação (+, espaço, hífen) antes de decidir — valor pode vir de Data Table preenchida à mão", () => {
    expect(toWhatsAppMsisdn("+55 34 9953-2444")).toBe("5534999532444");
  });
});
