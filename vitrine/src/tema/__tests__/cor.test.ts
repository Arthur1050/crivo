import { describe, expect, it } from "vitest";
import { COR_PADRAO, corDoCartao, corDoTextoSobre, corValida } from "../cor";

describe("cor do cartão de compartilhamento (VOG-01 AC5)", () => {
  it("usa a cor da loja quando tem o formato #rrggbb em minúsculas", () => {
    expect(corDoCartao("#d4145a")).toBe("#d4145a");
  });

  it("cai na cor padrão com cor nula, fora do padrão ou com maiúsculas", () => {
    for (const cor of [null, undefined, "", "#FFF", "red", "#D4145A", "#d4145a;}</style>"]) {
      expect(corDoCartao(cor)).toBe(COR_PADRAO);
      expect(corValida(cor)).toBeNull();
    }
  });

  it("escolhe o texto branco sobre fundo escuro e quase preto sobre fundo claro", () => {
    expect(corDoTextoSobre("#000000")).toBe("#ffffff");
    expect(corDoTextoSobre("#262626")).toBe("#ffffff");
    expect(corDoTextoSobre("#d4145a")).toBe("#ffffff");
    expect(corDoTextoSobre("#ffffff")).toBe("#111111");
    expect(corDoTextoSobre("#d4af37")).toBe("#111111");
    expect(corDoTextoSobre("#12a150")).toBe("#111111");
  });
});
