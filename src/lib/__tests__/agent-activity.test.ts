import { describe, expect, it } from "vitest";
import { formatAgentActivitySubtitle } from "../agent-activity";

const NOW = new Date("2026-08-15T12:00:00.000Z");

describe("formatAgentActivitySubtitle", () => {
  it("valor nulo (nenhuma mensagem do agente): estado ocioso explícito, sem inventar atividade", () => {
    expect(formatAgentActivitySubtitle(null, NOW)).toBe(
      "Nenhuma mensagem enviada ainda"
    );
  });

  it("com mensagem do agente: instante relativo em português (ramo 'relativo')", () => {
    const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60_000);
    expect(formatAgentActivitySubtitle(fiveMinutesAgo, NOW)).toBe(
      "Ativo pela última vez há 5 minutos"
    );
  });

  it("aceita o instante como string ISO (serialização RSC→client — AD-007)", () => {
    const oneHourAgoIso = new Date(NOW.getTime() - 60 * 60_000).toISOString();
    expect(formatAgentActivitySubtitle(oneHourAgoIso, NOW)).toBe(
      "Ativo pela última vez há 1 hora"
    );
  });
});
