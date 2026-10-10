import { describe, expect, it } from "vitest";
import {
  formatarPreco,
  metadadosDoCatalogo,
  metadadosDoItem,
  rotuloDaModalidade,
  resumoDosAtributos,
  rotuloDoTipo,
  textoAlternativoDaFoto,
  TIPOS_DE_IMOVEL,
} from "../apresentacao";

describe("L16b T9 — preço (VCAT AC11)", () => {
  it("52000000n → R$ 520.000", () => {
    expect(formatarPreco(52_000_000n)).toBe("R$ 520.000");
  });

  it("sem centavos, com ponto de milhar em todas as ordens de grandeza", () => {
    expect(formatarPreco(0n)).toBe("R$ 0");
    expect(formatarPreco(99_900n)).toBe("R$ 999");
    expect(formatarPreco(100_000n)).toBe("R$ 1.000");
    expect(formatarPreco(123_456_789_00n)).toBe("R$ 123.456.789");
    expect(formatarPreco(1_000_000_000_00n)).toBe("R$ 1.000.000.000");
  });

  it("centavos soltos são descartados, não arredondados para cima", () => {
    expect(formatarPreco(52_000_099n)).toBe("R$ 520.000");
  });
});

describe("L16b T9 — rótulos de tipo e modalidade (VCAT AC6)", () => {
  it("os 7 tipos têm rótulo", () => {
    expect(TIPOS_DE_IMOVEL.map(rotuloDoTipo)).toEqual([
      "Casa",
      "Apartamento",
      "Sobrado",
      "Cobertura",
      "Terreno",
      "Sala comercial",
      "Chácara",
    ]);
  });

  it("tipo desconhecido cai num rótulo legível, nunca vazio", () => {
    expect(rotuloDoTipo("galpao_industrial")).toBe("Galpao industrial");
    expect(rotuloDoTipo("")).toBe("Imóvel");
  });

  it("novo e usado têm rótulo; ambos, não (VITEM Assumptions)", () => {
    expect(rotuloDaModalidade("novo")).toBe("Novo");
    expect(rotuloDaModalidade("usado")).toBe("Usado");
    expect(rotuloDaModalidade("ambos")).toBeNull();
    expect(rotuloDaModalidade("qualquer")).toBeNull();
  });
});

describe("L16b T9 — texto alternativo das fotos (VITEM AC8)", () => {
  it("cita tipo, bairro e posição", () => {
    expect(textoAlternativoDaFoto({ tipo: "apartamento", bairro: "Centro", posicao: 2 })).toBe(
      "Apartamento em Centro, foto 2"
    );
    expect(textoAlternativoDaFoto({ tipo: "sala_comercial", bairro: "Fabrício", posicao: 1, total: 5 })).toBe(
      "Sala comercial em Fabrício, foto 1 de 5"
    );
  });
});

describe("L16b T9 — metadados de compartilhamento (VOG AC2, AC3)", () => {
  it("catálogo com título institucional: descrição = o título institucional", () => {
    expect(
      metadadosDoCatalogo({ nome: "Imobiliária Alfa", titulo: "Seu lar em Uberaba", cidade: "Uberaba", uf: "MG" })
    ).toEqual({ titulo: "Imobiliária Alfa — imóveis", descricao: "Seu lar em Uberaba" });
  });

  it("catálogo sem título institucional: Imóveis disponíveis em <cidade>/<uf>", () => {
    for (const titulo of [null, "", "   "]) {
      expect(
        metadadosDoCatalogo({ nome: "Imobiliária Alfa", titulo, cidade: "Uberaba", uf: "MG" })
      ).toEqual({ titulo: "Imobiliária Alfa — imóveis", descricao: "Imóveis disponíveis em Uberaba/MG" });
    }
  });

  it("catálogo sem título e sem cidade/UF: descrição sem lugar", () => {
    expect(metadadosDoCatalogo({ nome: "Alfa", titulo: null, cidade: null, uf: null }).descricao).toBe(
      "Imóveis disponíveis"
    );
  });

  it("item: título '<Tipo> em <bairro> — <REF>' e descrição '<quartos> quartos · <área> m² · <preço>'", () => {
    expect(
      metadadosDoItem({
        tipo: "apartamento",
        bairro: "Centro",
        referencia: "ap-0142",
        quartos: 3,
        areaM2: 85,
        precoCentavos: 52_000_000n,
      })
    ).toEqual({
      titulo: "Apartamento em Centro — AP-0142",
      descricao: "3 quartos · 85 m² · R$ 520.000",
    });
  });
});

describe("L16b T19 — atributos do card (VCAT AC6)", () => {
  it("quartos, banheiros, vagas e área, separados por ponto médio", () => {
    expect(resumoDosAtributos({ quartos: 3, banheiros: 2, vagas: 2, areaM2: 120 })).toBe(
      "3 quartos · 2 banheiros · 2 vagas · 120 m²"
    );
  });

  it("singular só para 1; zero fica no plural", () => {
    expect(resumoDosAtributos({ quartos: 1, banheiros: 1, vagas: 1, areaM2: 38 })).toBe(
      "1 quarto · 1 banheiro · 1 vaga · 38 m²"
    );
    expect(resumoDosAtributos({ quartos: 0, banheiros: 0, vagas: 0, areaM2: 0 })).toBe(
      "0 quartos · 0 banheiros · 0 vagas · 0 m²"
    );
  });
});

