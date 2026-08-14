import { describe, expect, it } from "vitest";
import {
  BANNED_OPENINGS,
  checkCapabilityPromise,
  checkOpening,
  extractOpening,
} from "../voice.mjs";

describe("BANNED_OPENINGS (VOZ-01 AC1)", () => {
  it("cobre show, boa, perfeito, entendido, otimo, legal", () => {
    expect([...BANNED_OPENINGS].sort()).toEqual(
      ["boa", "entendido", "legal", "otimo", "perfeito", "show"].sort()
    );
  });
});

describe("extractOpening", () => {
  it("'Show.' e 'show' colidem no mesmo valor normalizado", () => {
    expect(extractOpening("Show.")).toBe(extractOpening("show"));
    expect(extractOpening("Show.")).toBe("show");
  });

  it("remove acento e normaliza para minúsculas ('Ótimo!' -> 'otimo')", () => {
    expect(extractOpening("Ótimo! Vou verificar.")).toBe("otimo");
  });

  it("corta na primeira pontuação forte, ignorando o resto da mensagem", () => {
    expect(extractOpening("Boa, deixa eu ver aqui")).toBe("boa");
  });

  it("mensagem sem pontuação -> string inteira normalizada", () => {
    expect(extractOpening("legal")).toBe("legal");
  });

  it("valor não-string -> string vazia (defensivo)", () => {
    expect(extractOpening(undefined)).toBe("");
    expect(extractOpening(null)).toBe("");
  });

  it("não confunde saudação com interjeição isolada ('Boa noite' != 'boa')", () => {
    expect(extractOpening("Boa noite, tudo bem?")).toBe("boa noite");
  });
});

describe("checkOpening (VOZ-01 AC1/AC2)", () => {
  it("primeira mensagem 'Show. Qual seu orçamento?' -> abertura-proibida", () => {
    const result = checkOpening(["Show. Qual seu orçamento?"], []);
    expect(result).toEqual({ ok: false, reason: "abertura-proibida" });
  });

  it("todas as 6 aberturas banidas são rejeitadas", () => {
    const openings = ["Show.", "Boa.", "Perfeito.", "Entendido.", "Ótimo.", "Legal."];
    for (const opening of openings) {
      expect(checkOpening([opening], [])).toEqual({ ok: false, reason: "abertura-proibida" });
    }
  });

  it("abertura que coincide com abertura anterior na sessão -> abertura-repetida", () => {
    const result = checkOpening(["Então, me conta mais"], ["entao"]);
    expect(result).toEqual({ ok: false, reason: "abertura-repetida" });
  });

  it("abertura banida tem precedência sobre a checagem de repetição", () => {
    const result = checkOpening(["Show, entendi"], ["algo-diferente"]);
    expect(result).toEqual({ ok: false, reason: "abertura-proibida" });
  });

  it("abertura nova, não banida e não repetida -> ok", () => {
    const result = checkOpening(["Faz sentido, me fala mais sobre a região"], ["entao"]);
    expect(result).toEqual({ ok: true });
  });

  it("aberturasAnteriores vazio/ausente -> nunca marca repetição", () => {
    expect(checkOpening(["Certo, entendi"], [])).toEqual({ ok: true });
    expect(checkOpening(["Certo, entendi"], undefined)).toEqual({ ok: true });
  });

  it("lista de mensagens vazia ou sem string na primeira posição -> ok (nada a checar)", () => {
    expect(checkOpening([], [])).toEqual({ ok: true });
    expect(checkOpening(undefined, [])).toEqual({ ok: true });
  });
});

describe("checkCapabilityPromise (VOZ-02 AC3)", () => {
  it("rejeita 'vou puxar aqui as opções' com promessa-fora-de-capacidade", () => {
    const result = checkCapabilityPromise(["vou puxar aqui as opções"]);
    expect(result).toEqual({ ok: false, reason: "promessa-fora-de-capacidade" });
  });

  it("rejeita 'vou te enviar agora mesmo as opções de apartamentos de até 150 mil'", () => {
    const result = checkCapabilityPromise([
      "vou te enviar agora mesmo as opções de apartamentos de até 150 mil",
    ]);
    expect(result).toEqual({ ok: false, reason: "promessa-fora-de-capacidade" });
  });

  it("NÃO rejeita 'vou anotar aqui' (discriminação — verbo neutro)", () => {
    expect(checkCapabilityPromise(["vou anotar aqui"])).toEqual({ ok: true });
  });

  it("NÃO rejeita 'vou confirmar com o corretor' (discriminação — verbo neutro)", () => {
    expect(checkCapabilityPromise(["vou confirmar com o corretor"])).toEqual({ ok: true });
  });

  it("rejeita quando a promessa está em qualquer mensagem do turno, não só a primeira", () => {
    const result = checkCapabilityPromise([
      "Entendi, deixa eu ver",
      "vou mandar as fotos do apartamento",
    ]);
    expect(result).toEqual({ ok: false, reason: "promessa-fora-de-capacidade" });
  });

  it("verbo de capacidade sem alvo (imóvel/opção/foto/valor) não rejeita", () => {
    expect(checkCapabilityPromise(["vou enviar isso para o corretor depois"])).toEqual({
      ok: true,
    });
  });

  it("turno sem nenhuma promessa -> ok", () => {
    const result = checkCapabilityPromise(["Qual região você prefere?", "Me conta mais"]);
    expect(result).toEqual({ ok: true });
  });

  it("lista vazia/ausente -> ok (defensivo)", () => {
    expect(checkCapabilityPromise([])).toEqual({ ok: true });
    expect(checkCapabilityPromise(undefined)).toEqual({ ok: true });
  });
});
