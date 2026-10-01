import { describe, expect, it } from "vitest";
import { gate } from "../gate.mjs";

/**
 * SILENCIO-01 (lote-14): com a marca de condução humana, o gate cala o agente
 * (`somente-registrar`) no mesmo nível de `escalado_humano`, e a palavra exata
 * de opt-out continua vencendo a marca. Arquivo separado porque `gate.test.ts`
 * é congelado (sem a marca, as rotas não mudam).
 */
describe("gate com a marca de condução humana (SILENCIO-01)", () => {
  const MARCA = "2026-10-01T12:00:00.000Z";
  const CONDUZIDO = {
    optedOutAt: null,
    status: "em_qualificacao",
    humanTakeoverAt: MARCA,
    hasMedia: false,
  };

  it("marca + texto → somente-registrar (AC1, AC2)", () => {
    expect(gate({ ...CONDUZIDO, text: "Oi, ainda tem o apartamento?" })).toBe("somente-registrar");
  });

  it("marca + texto em qualificado_agendado → somente-registrar (AC2: não depende do status)", () => {
    expect(gate({ ...CONDUZIDO, status: "qualificado_agendado", text: "Confirmado amanhã" })).toBe(
      "somente-registrar"
    );
  });

  it("marca + mídia sem texto → somente-registrar, nunca a resposta fixa de mídia (Edge Cases)", () => {
    expect(gate({ ...CONDUZIDO, hasMedia: true, text: "" })).toBe("somente-registrar");
  });

  it('marca + "sair" → opt-out (AC3: a palavra exata vence a marca, L-041)', () => {
    expect(gate({ ...CONDUZIDO, text: "sair" })).toBe("opt-out");
  });

  it('marca + "PARAR" com espaços → opt-out (AC3)', () => {
    expect(gate({ ...CONDUZIDO, text: "  PARAR " })).toBe("opt-out");
  });

  it("marca + frase que contém sair → somente-registrar (não é a palavra exata)", () => {
    expect(gate({ ...CONDUZIDO, text: "quero sair do aluguel" })).toBe("somente-registrar");
  });

  it('marca + optedOutAt → somente-registrar, mesmo com "sair" (sem segunda confirmação)', () => {
    const optedOut = { ...CONDUZIDO, optedOutAt: "2026-09-29T00:00:00Z" };
    expect(gate({ ...optedOut, text: "sair" })).toBe("somente-registrar");
    expect(gate({ ...optedOut, text: "oi" })).toBe("somente-registrar");
  });

  it("sem a marca (nula), a mesma mensagem segue para conversa", () => {
    expect(gate({ ...CONDUZIDO, humanTakeoverAt: null, text: "Oi, ainda tem o apartamento?" })).toBe(
      "conversa"
    );
  });
});
