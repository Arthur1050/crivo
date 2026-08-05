import { describe, expect, it } from "vitest";
import { detectOptOut, gate } from "../gate.mjs";

describe("detectOptOut (LGPD-03)", () => {
  it("detecta 'sair' (minúsculas)", () => {
    expect(detectOptOut("sair")).toBe(true);
  });

  it("detecta 'SAIR' (maiúsculas — case-insensível)", () => {
    expect(detectOptOut("SAIR")).toBe(true);
  });

  it("detecta 'Sáir' (com acento — acento-insensível)", () => {
    expect(detectOptOut("Sáir")).toBe(true);
  });

  it("detecta 'PARAR ' (com espaço à direita)", () => {
    expect(detectOptOut("PARAR ")).toBe(true);
  });

  it("detecta 'parar' (minúsculas)", () => {
    expect(detectOptOut("parar")).toBe(true);
  });

  it("detecta '  sair  ' (espaços nas duas bordas)", () => {
    expect(detectOptOut("  sair  ")).toBe(true);
  });

  it("NÃO detecta 'quero sair do apartamento' (frase, não a palavra isolada)", () => {
    expect(detectOptOut("quero sair do apartamento")).toBe(false);
  });

  it("NÃO detecta texto comum não relacionado", () => {
    expect(detectOptOut("Oi, tudo bem? Vi o anúncio do apartamento.")).toBe(false);
  });

  it("NÃO detecta string vazia", () => {
    expect(detectOptOut("")).toBe(false);
  });

  it("NÃO detecta valores não-string sem lançar exceção", () => {
    expect(detectOptOut(undefined)).toBe(false);
    expect(detectOptOut(null)).toBe(false);
  });
});

describe("gate — máquina de estados de roteamento (design.md, pipeline passo 7)", () => {
  const BASE = { optedOutAt: null, status: "em_qualificacao", hasMedia: false, text: "Oi" };

  describe("precedência 1: optedOutAt preenchido vence tudo (LGPD-03 AC3)", () => {
    it("optedOutAt preenchido + texto de opt-out -> somente-registrar (não reenvia confirmação)", () => {
      const route = gate({
        ...BASE,
        optedOutAt: "2026-08-01T10:00:00.000Z",
        text: "sair",
      });
      expect(route).toBe("somente-registrar");
    });

    it("optedOutAt preenchido + status escalado_humano -> somente-registrar", () => {
      const route = gate({
        ...BASE,
        optedOutAt: "2026-08-01T10:00:00.000Z",
        status: "escalado_humano",
      });
      expect(route).toBe("somente-registrar");
    });

    it("optedOutAt preenchido + mídia sem texto -> somente-registrar (vence a rota mídia)", () => {
      const route = gate({
        ...BASE,
        optedOutAt: "2026-08-01T10:00:00.000Z",
        hasMedia: true,
        text: "",
      });
      expect(route).toBe("somente-registrar");
    });
  });

  describe("precedência 2: opt-out no texto vence mídia (LGPD-03 AC1)", () => {
    it("texto 'sair', sem optedOutAt prévio -> opt-out", () => {
      const route = gate({ ...BASE, text: "SAIR" });
      expect(route).toBe("opt-out");
    });

    it("texto 'parar' com mídia simultaneamente marcada -> opt-out (texto vence mídia)", () => {
      const route = gate({ ...BASE, hasMedia: true, text: "parar" });
      expect(route).toBe("opt-out");
    });
  });

  describe("precedência 3: status escalado_humano (AGT-05 AC3)", () => {
    it("status escalado_humano, sem opt-out -> somente-registrar", () => {
      const route = gate({ ...BASE, status: "escalado_humano" });
      expect(route).toBe("somente-registrar");
    });

    it("status escalado_humano vence mídia sem texto -> somente-registrar", () => {
      const route = gate({
        ...BASE,
        status: "escalado_humano",
        hasMedia: true,
        text: "",
      });
      expect(route).toBe("somente-registrar");
    });
  });

  describe("precedência 4: mídia sem texto (edge case)", () => {
    it("hasMedia true e texto vazio, sem opt-out, sem escalado -> midia", () => {
      const route = gate({ ...BASE, hasMedia: true, text: "" });
      expect(route).toBe("midia");
    });
  });

  describe("precedência 5: conversa (rota padrão)", () => {
    it("texto comum, tudo normal -> conversa", () => {
      const route = gate({ ...BASE, text: "Quero saber mais sobre o apartamento" });
      expect(route).toBe("conversa");
    });

    it("hasMedia true mas com texto não vazio -> conversa, NÃO midia (mídia só roteia quando SEM texto)", () => {
      const route = gate({ ...BASE, hasMedia: true, text: "Legenda de uma imagem" });
      expect(route).toBe("conversa");
    });

    it("status em_qualificacao e qualificado_agendado (não escalado) seguem para conversa", () => {
      expect(gate({ ...BASE, status: "em_qualificacao" })).toBe("conversa");
      expect(gate({ ...BASE, status: "qualificado_agendado" })).toBe("conversa");
    });
  });
});
