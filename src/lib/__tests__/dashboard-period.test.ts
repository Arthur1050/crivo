import { describe, expect, it } from "vitest";
import { resolveDashboardPeriod } from "../dashboard-period";

// `now` fixo e injetado em todo teste (design.md — "Duas fontes de agora":
// a resolução de período nunca deve depender do relógio real para ser
// testável). Horário no meio do dia para provar que só a data importa.
const NOW = new Date("2026-08-02T15:30:00.000Z");

function iso(year: number, month: number, day: number, endOfDay = false): Date {
  return endOfDay
    ? new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
    : new Date(Date.UTC(year, month - 1, day));
}

describe("resolveDashboardPeriod", () => {
  // DASH-02 AC1: sem parâmetros → default 30 dias, incluindo hoje.
  it("aplica o default de 30 dias quando não há parâmetros", () => {
    const period = resolveDashboardPeriod({}, NOW);
    expect(period.preset).toBe("30d");
    expect(period.from).toEqual(iso(2026, 7, 4));
    expect(period.to).toEqual(iso(2026, 8, 2, true));
  });

  // DASH-02 AC2: presets 7/30/90 dias, cada um incluindo o dia corrente.
  it("resolve o preset 7d incluindo hoje", () => {
    const period = resolveDashboardPeriod({ periodo: "7d" }, NOW);
    expect(period.preset).toBe("7d");
    expect(period.from).toEqual(iso(2026, 7, 27));
    expect(period.to).toEqual(iso(2026, 8, 2, true));
    expect(period.granularity).toBe("day");
  });

  it("resolve o preset 30d incluindo hoje", () => {
    const period = resolveDashboardPeriod({ periodo: "30d" }, NOW);
    expect(period.preset).toBe("30d");
    expect(period.from).toEqual(iso(2026, 7, 4));
    expect(period.to).toEqual(iso(2026, 8, 2, true));
  });

  it("resolve o preset 90d incluindo hoje, com granularidade semanal", () => {
    const period = resolveDashboardPeriod({ periodo: "90d" }, NOW);
    expect(period.preset).toBe("90d");
    expect(period.to).toEqual(iso(2026, 8, 2, true));
    // 90 dias > 31 → granularidade semanal.
    expect(period.granularity).toBe("week");
    // `to` inclui os 999ms finais do dia; usa floor para contar dias inteiros.
    const spanDays =
      Math.floor((period.to.getTime() - period.from.getTime()) / 86400000) + 1;
    expect(spanDays).toBe(90);
  });

  // DASH-02 AC3: range customizado válido.
  it("resolve um range customizado válido", () => {
    const period = resolveDashboardPeriod(
      { de: "2026-07-01", ate: "2026-07-15" },
      NOW
    );
    expect(period.preset).toBe("custom");
    expect(period.from).toEqual(iso(2026, 7, 1));
    expect(period.to).toEqual(iso(2026, 7, 15, true));
    expect(period.granularity).toBe("day");
  });

  // DASH-02 AC5: custom prevalece sobre preset quando ambos presentes.
  it("prioriza de+ate sobre periodo quando ambos estão presentes e válidos", () => {
    const period = resolveDashboardPeriod(
      { periodo: "30d", de: "2026-07-01", ate: "2026-07-15" },
      NOW
    );
    expect(period.preset).toBe("custom");
    expect(period.from).toEqual(iso(2026, 7, 1));
  });

  // DASH-02 AC4 + edge cases: qualquer entrada inválida cai no default.
  it("cai no default quando de/ate tem formato inválido", () => {
    const period = resolveDashboardPeriod(
      { de: "2026/07/01", ate: "2026-07-15" },
      NOW
    );
    expect(period.preset).toBe("30d");
  });

  it("cai no default quando de/ate contém uma data inexistente", () => {
    const period = resolveDashboardPeriod(
      { de: "2026-02-30", ate: "2026-03-15" },
      NOW
    );
    expect(period.preset).toBe("30d");
  });

  it("cai no default quando de é maior que ate", () => {
    const period = resolveDashboardPeriod(
      { de: "2026-07-15", ate: "2026-07-01" },
      NOW
    );
    expect(period.preset).toBe("30d");
  });

  it("cai no default quando o range customizado excede 366 dias", () => {
    const period = resolveDashboardPeriod(
      { de: "2020-01-01", ate: "2021-01-05" },
      NOW
    );
    expect(period.preset).toBe("30d");
  });

  it("aceita um range customizado de exatamente 366 dias (2020 bissexto)", () => {
    const period = resolveDashboardPeriod(
      { de: "2020-01-01", ate: "2020-12-31" },
      NOW
    );
    expect(period.preset).toBe("custom");
    const spanDays =
      Math.floor((period.to.getTime() - period.from.getTime()) / 86400000) + 1;
    expect(spanDays).toBe(366);
  });

  it("cai no default quando periodo é um valor não reconhecido", () => {
    const period = resolveDashboardPeriod({ periodo: "60d" }, NOW);
    expect(period.preset).toBe("30d");
  });

  it("ignora de sem ate (ou vice-versa) e cai no preset/default", () => {
    const period = resolveDashboardPeriod(
      { periodo: "7d", de: "2026-07-01" },
      NOW
    );
    expect(period.preset).toBe("7d");
  });

  // Edge case da spec: range customizado de um único dia (de = ate).
  it("aceita um range customizado de um único dia", () => {
    const period = resolveDashboardPeriod(
      { de: "2026-07-10", ate: "2026-07-10" },
      NOW
    );
    expect(period.preset).toBe("custom");
    expect(period.from).toEqual(iso(2026, 7, 10));
    expect(period.to).toEqual(iso(2026, 7, 10, true));
    expect(period.granularity).toBe("day");
  });

  // Edge case da spec: range terminando numa data futura é aceito.
  it("aceita um range customizado com data final futura", () => {
    const period = resolveDashboardPeriod(
      { de: "2026-08-01", ate: "2026-12-31" },
      NOW
    );
    expect(period.preset).toBe("custom");
    expect(period.from).toEqual(iso(2026, 8, 1));
    expect(period.to).toEqual(iso(2026, 12, 31, true));
  });

  // Granularidade: fronteira exata entre diária e semanal.
  it("usa granularidade diária num range de exatamente 31 dias", () => {
    const period = resolveDashboardPeriod(
      { de: "2026-07-01", ate: "2026-07-31" },
      NOW
    );
    expect(period.granularity).toBe("day");
  });

  it("usa granularidade semanal num range de 32 dias", () => {
    const period = resolveDashboardPeriod(
      { de: "2026-07-01", ate: "2026-08-01" },
      NOW
    );
    expect(period.granularity).toBe("week");
  });
});
