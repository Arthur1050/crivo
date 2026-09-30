import { describe, expect, it } from "vitest";
import { gate } from "../gate.mjs";

/**
 * OPTKEY-01 AC3 (lote-13): com o lead em `escalado_humano`, a mensagem inteira
 * `sair`/`parar` ainda registra o opt-out. O opt-out pela palavra exata vence a
 * trava humana (`gate.mjs`, precedência 2 antes da 3). Arquivo separado porque
 * OPTKEY-01 AC2 exige `gate.test.ts` inalterado.
 */
describe("palavra exata com lead em escalado_humano (OPTKEY-01 AC3)", () => {
  const ESCALADO = { optedOutAt: null, status: "escalado_humano", hasMedia: false };

  it('"sair" → opt-out', () => {
    expect(gate({ ...ESCALADO, text: "sair" })).toBe("opt-out");
  });

  it('"parar" → opt-out', () => {
    expect(gate({ ...ESCALADO, text: "parar" })).toBe("opt-out");
  });

  it('"SAIR" com espaços → opt-out (mesma normalização do caminho comum)', () => {
    expect(gate({ ...ESCALADO, text: "  SAIR  " })).toBe("opt-out");
  });

  it("frase que não é a palavra exata continua somente-registrar", () => {
    expect(gate({ ...ESCALADO, text: "quero sair da lista" })).toBe("somente-registrar");
  });

  it("lead já descadastrado em escalado_humano: somente-registrar, sem segunda confirmação", () => {
    expect(gate({ ...ESCALADO, optedOutAt: "2026-09-29T00:00:00Z", text: "sair" })).toBe("somente-registrar");
  });
});
