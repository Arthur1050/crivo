import { describe, expect, it } from "vitest";
import {
  linkInstagram,
  linkTelefone,
  linkWhatsapp,
  mensagemCatalogo,
  mensagemItem,
} from "../contato";

const textoDe = (link: string | null) => {
  expect(link).not.toBeNull();
  return decodeURIComponent(new URL(link as string).searchParams.get("text") ?? "");
};

describe("L16b T8 — WhatsApp (VITEM-02 AC3, AC4)", () => {
  it("10 e 11 dígitos recebem o prefixo 55", () => {
    expect(linkWhatsapp("3433334444", "x")).toBe("https://wa.me/553433334444?text=x");
    expect(linkWhatsapp("34999990000", "x")).toBe("https://wa.me/5534999990000?text=x");
  });

  it("12 e 13 dígitos não recebem prefixo", () => {
    expect(linkWhatsapp("553433334444", "x")).toBe("https://wa.me/553433334444?text=x");
    expect(linkWhatsapp("5534999990000", "x")).toBe("https://wa.me/5534999990000?text=x");
  });

  it("remove o que não é dígito (máscara, +, espaço, parênteses)", () => {
    expect(linkWhatsapp("+55 (34) 99999-0000", "x")).toBe("https://wa.me/5534999990000?text=x");
    expect(linkWhatsapp("(34) 99999-0000", "x")).toBe("https://wa.me/5534999990000?text=x");
  });

  it("sem nenhum dígito não gera link", () => {
    expect(linkWhatsapp("sem número", "x")).toBeNull();
    expect(linkWhatsapp("", "x")).toBeNull();
  });

  it("a mensagem do item, decodificada, é igual ao texto da spec, com a referência em maiúsculas", () => {
    const texto = "Olá! Vi o imóvel AP-0142 na vitrine da Imobiliária Alfa e tenho interesse.";
    expect(mensagemItem("ap-0142", "Imobiliária Alfa")).toBe(texto);
    expect(mensagemItem("AP-0142", "Imobiliária Alfa")).toBe(texto);
    expect(textoDe(linkWhatsapp("34999990000", mensagemItem("ap-0142", "Imobiliária Alfa")))).toBe(texto);
  });

  it("a mensagem do catálogo, decodificada, é igual ao texto da spec", () => {
    const texto = "Olá! Vi a vitrine da Imobiliária Alfa e gostaria de atendimento.";
    expect(mensagemCatalogo("Imobiliária Alfa")).toBe(texto);
    expect(textoDe(linkWhatsapp("34999990000", mensagemCatalogo("Imobiliária Alfa")))).toBe(texto);
  });

  it("nome com & # ? + e acento atravessa a codificação sem se perder", () => {
    const nome = "Casa & Cia #1 (Ltda?) + Ação";
    const link = linkWhatsapp("34999990000", mensagemItem("im-0007", nome));
    expect(textoDe(link)).toBe(`Olá! Vi o imóvel IM-0007 na vitrine da ${nome} e tenho interesse.`);
    expect(new URL(link as string).hash).toBe("");
  });
});

describe("L16b T8 — telefone e Instagram (VLEGAL-01 AC3, AC4)", () => {
  it("tel:+<dígitos> com 55 quando o número tem 10 ou 11 dígitos", () => {
    expect(linkTelefone("(34) 3333-4444")).toBe("tel:+553433334444");
    expect(linkTelefone("34999990000")).toBe("tel:+5534999990000");
    expect(linkTelefone("+55 34 3333-4444")).toBe("tel:+553433334444");
    expect(linkTelefone("5534999990000")).toBe("tel:+5534999990000");
    expect(linkTelefone("---")).toBeNull();
  });

  it("https://instagram.com/<handle>", () => {
    expect(linkInstagram("imobiliaria.alfa")).toBe("https://instagram.com/imobiliaria.alfa");
    expect(linkInstagram("@imobiliaria_alfa")).toBe("https://instagram.com/imobiliaria_alfa");
    expect(linkInstagram("  ")).toBeNull();
    expect(linkInstagram("a/b?c")).toBe("https://instagram.com/a%2Fb%3Fc");
  });
});
