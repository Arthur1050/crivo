import { describe, expect, it } from "vitest";
import { formatRelativeTimePtBR } from "../relative-time";

/** Relógio fixo: teste de tempo nunca depende do `new Date()` real. */
const NOW = new Date("2026-08-03T12:00:00.000Z");

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe("formatRelativeTimePtBR", () => {
  it("colapsa o último minuto em 'agora'", () => {
    expect(formatRelativeTimePtBR(ago(0), NOW)).toBe("agora");
    expect(formatRelativeTimePtBR(ago(59_000), NOW)).toBe("agora");
  });

  it("usa singular em exatamente uma unidade", () => {
    expect(formatRelativeTimePtBR(ago(MINUTE), NOW)).toBe("há 1 minuto");
    expect(formatRelativeTimePtBR(ago(HOUR), NOW)).toBe("há 1 hora");
    expect(formatRelativeTimePtBR(ago(DAY), NOW)).toBe("há 1 dia");
    expect(formatRelativeTimePtBR(ago(MONTH), NOW)).toBe("há 1 mês");
    expect(formatRelativeTimePtBR(ago(YEAR), NOW)).toBe("há 1 ano");
  });

  it("usa plural acima de uma unidade", () => {
    expect(formatRelativeTimePtBR(ago(8 * HOUR), NOW)).toBe("há 8 horas");
    expect(formatRelativeTimePtBR(ago(4 * DAY), NOW)).toBe("há 4 dias");
    expect(formatRelativeTimePtBR(ago(2 * MONTH), NOW)).toBe("há 2 meses");
    expect(formatRelativeTimePtBR(ago(3 * YEAR), NOW)).toBe("há 3 anos");
  });

  it("troca de unidade exatamente no limite", () => {
    expect(formatRelativeTimePtBR(ago(HOUR - 1), NOW)).toBe("há 59 minutos");
    expect(formatRelativeTimePtBR(ago(DAY - 1), NOW)).toBe("há 23 horas");
    expect(formatRelativeTimePtBR(ago(MONTH - 1), NOW)).toBe("há 29 dias");
    expect(formatRelativeTimePtBR(ago(YEAR - 1), NOW)).toBe("há 12 meses");
  });

  it("aceita ISO string além de Date", () => {
    expect(
      formatRelativeTimePtBR("2026-08-03T04:00:00.000Z", NOW)
    ).toBe("há 8 horas");
  });

  it("colapsa instante futuro em 'agora' em vez de contar para frente", () => {
    expect(formatRelativeTimePtBR(new Date(NOW.getTime() + HOUR), NOW)).toBe(
      "agora"
    );
  });

  it("devolve 'agora' em data ilegível em vez de NaN", () => {
    expect(formatRelativeTimePtBR("data-invalida", NOW)).toBe("agora");
  });
});
