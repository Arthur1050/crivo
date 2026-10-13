import { describe, expect, it } from "vitest";
import {
  paginar,
  POR_PAGINA,
  referenciaDaUrl,
  referenciaParaUrl,
  slugValido,
  urlDaPagina,
} from "../catalogo";

const itens = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("L16b T7 — paginar (VCAT-02)", () => {
  it("24 itens cabem em 1 página, sem paginação", () => {
    const r = paginar(itens(24), "1");
    expect(POR_PAGINA).toBe(24);
    expect(r.totalPaginas).toBe(1);
    expect(r.pagina).toBe(1);
    expect(r.itens).toHaveLength(24);
  });

  it("25 itens: a página 2 tem exatamente 1 item, e a 1 tem 24", () => {
    expect(paginar(itens(25), "2")).toMatchObject({ pagina: 2, totalPaginas: 2, itens: [25] });
    expect(paginar(itens(25), "1").itens).toHaveLength(24);
    expect(paginar(itens(25), "1").itens[0]).toBe(1);
  });

  it("pagina inválida (0, -1, abc, 1.5, vazia, ausente, lista) cai na página 1", () => {
    for (const pedida of ["0", "-1", "abc", "1.5", "", undefined, ["2", "3"], null, "2x"]) {
      expect(paginar(itens(60), pedida).pagina, String(pedida)).toBe(1);
    }
  });

  it("pagina acima da última mostra a última, inclusive número gigante", () => {
    const r = paginar(itens(50), "99");
    expect(r).toMatchObject({ pagina: 3, totalPaginas: 3 });
    expect(r.itens).toEqual([49, 50]);
    expect(paginar(itens(50), "99999999999999999999999").pagina).toBe(3);
  });

  it("a última página exata (48 itens, página 2) tem 24", () => {
    expect(paginar(itens(48), "2")).toMatchObject({ pagina: 2, totalPaginas: 2 });
    expect(paginar(itens(48), "2").itens).toHaveLength(24);
    expect(paginar(itens(48), "3").pagina).toBe(2);
  });

  it("lista vazia: 1 página, sem itens, total 0", () => {
    expect(paginar([], "5")).toEqual({ itens: [], pagina: 1, totalPaginas: 1, total: 0 });
  });
});

describe("L16b T7 — slugValido (VCAT-03)", () => {
  it("aceita 63 caracteres e recusa 64", () => {
    expect(slugValido("a".repeat(63))).toBe(true);
    expect(slugValido("a".repeat(64))).toBe(false);
  });

  it("recusa vazio, maiúscula, sublinhado, espaço, ponto e barra", () => {
    for (const slug of ["", "Loja", "loja_a", "loja a", "loja.a", "loja/a", "../x"]) {
      expect(slugValido(slug), JSON.stringify(slug)).toBe(false);
    }
  });

  it("aceita minúsculas, dígitos e hífen, e recusa o que não é texto", () => {
    expect(slugValido("loja-a-9")).toBe(true);
    expect(slugValido(undefined)).toBe(false);
    expect(slugValido(["a"])).toBe(false);
  });
});

describe("L16b T7 — referência na URL (VITEM-01)", () => {
  it("gera em minúsculas", () => {
    expect(referenciaParaUrl("AP-0142")).toBe("ap-0142");
  });

  it("lê a URL em maiúsculas ou minúsculas, com ida e volta", () => {
    expect(referenciaDaUrl("ap-0142")).toBe("ap-0142");
    expect(referenciaDaUrl("AP-0142")).toBe("ap-0142");
    expect(referenciaDaUrl(referenciaParaUrl("IM-0007"))).toBe("im-0007");
  });

  it("recusa o que não tem formato de referência", () => {
    const longa = "a".repeat(41);
    for (const parametro of ["", "  ", "ap 0142", "ap_0142", "../x", "ap-0142;drop", longa, "%E0%A4%A", undefined, 7]) {
      expect(referenciaDaUrl(parametro), String(parametro)).toBeNull();
    }
    expect(referenciaDaUrl("a".repeat(40))).toBe("a".repeat(40));
  });
});

describe("L16b fechamento — urlDaPagina (VCAT-02 AC3)", () => {
  it("a página 1 volta à rota sem parâmetro e as demais usam ?pagina=<n>", () => {
    expect(urlDaPagina("/c/loja-a", 1)).toBe("/c/loja-a");
    expect(urlDaPagina("/c/loja-a", 2)).toBe("/c/loja-a?pagina=2");
    expect(urlDaPagina("/c/loja-a", 13)).toBe("/c/loja-a?pagina=13");
  });
});
