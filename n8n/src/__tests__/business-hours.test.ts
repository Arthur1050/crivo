import { describe, expect, it } from "vitest";
import {
  isSlotWithinBusinessHours,
  isWithin24h,
  resolveBusinessHours,
} from "../business-hours.mjs";

const FALLBACK = { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };

describe("resolveBusinessHours (CONF-05 fallback)", () => {
  it("settings null -> fallback seg-sex 9h-18h", () => {
    expect(resolveBusinessHours(null)).toEqual(FALLBACK);
  });

  it("settings undefined -> fallback", () => {
    expect(resolveBusinessHours(undefined)).toEqual(FALLBACK);
  });

  it("os 3 campos null -> fallback", () => {
    expect(
      resolveBusinessHours({
        meetingDays: null,
        meetingHoursStart: null,
        meetingHoursEnd: null,
      })
    ).toEqual(FALLBACK);
  });

  it("meetingDays vazio ([]) -> fallback (0 dias não é uma configuração válida)", () => {
    expect(
      resolveBusinessHours({
        meetingDays: [],
        meetingHoursStart: "09:00",
        meetingHoursEnd: "18:00",
      })
    ).toEqual(FALLBACK);
  });

  it("só meetingDays configurado, horas ausentes -> fallback (configuração parcial = não configurado)", () => {
    expect(
      resolveBusinessHours({
        meetingDays: [6],
        meetingHoursStart: null,
        meetingHoursEnd: null,
      })
    ).toEqual(FALLBACK);
  });

  it("só as horas configuradas, dias ausentes -> fallback (configuração parcial = não configurado)", () => {
    expect(
      resolveBusinessHours({
        meetingDays: null,
        meetingHoursStart: "10:00",
        meetingHoursEnd: "12:00",
      })
    ).toEqual(FALLBACK);
  });

  it("os 3 campos configurados -> usa a configuração do tenant, não o fallback", () => {
    expect(
      resolveBusinessHours({
        meetingDays: [6],
        meetingHoursStart: "10:00",
        meetingHoursEnd: "12:00",
      })
    ).toEqual({ days: [6], start: "10:00", end: "12:00" });
  });
});

describe("isSlotWithinBusinessHours (AGT-04) — fallback seg-sex 9h-18h", () => {
  // 2026-08-10 = segunda-feira; 2026-08-15 = sábado; 2026-08-16 = domingo
  // (verificado independentemente via Date.getUTCDay()). America/Sao_Paulo
  // é GMT-3 fixo (sem horário de verão desde 2019) — local = UTC - 3h.

  it("segunda 09:00 local (limite de abertura) -> true (start é INCLUSIVO)", () => {
    expect(isSlotWithinBusinessHours("2026-08-10T12:00:00.000Z", null)).toBe(true);
  });

  it("segunda 08:59 local (1min antes de abrir) -> false", () => {
    expect(isSlotWithinBusinessHours("2026-08-10T11:59:00.000Z", null)).toBe(false);
  });

  it("segunda 17:59 local (1min antes de fechar) -> true", () => {
    expect(isSlotWithinBusinessHours("2026-08-10T20:59:00.000Z", null)).toBe(true);
  });

  it("segunda 18:00 local EXATO (limite de fechamento) -> false (end é EXCLUSIVO — borda documentada)", () => {
    expect(isSlotWithinBusinessHours("2026-08-10T21:00:00.000Z", null)).toBe(false);
  });

  it("domingo, mesmo dentro do horário 9h-18h -> false (domingo rejeitado no fallback)", () => {
    // domingo 10:00 local = 13:00 UTC
    expect(isSlotWithinBusinessHours("2026-08-16T13:00:00.000Z", null)).toBe(false);
  });

  it("sábado -> false (fallback é só seg-sex)", () => {
    // sábado 10:00 local = 13:00 UTC
    expect(isSlotWithinBusinessHours("2026-08-15T13:00:00.000Z", null)).toBe(false);
  });

  it("data ISO inválida -> false, sem lançar exceção", () => {
    expect(isSlotWithinBusinessHours("nao-e-uma-data", null)).toBe(false);
  });
});

describe("isSlotWithinBusinessHours — configuração customizada do tenant", () => {
  const SATURDAY_MORNING_ONLY = {
    meetingDays: [6],
    meetingHoursStart: "10:00",
    meetingHoursEnd: "12:00",
  };

  it("sábado 10:00 local (dentro da config customizada) -> true", () => {
    expect(
      isSlotWithinBusinessHours("2026-08-15T13:00:00.000Z", SATURDAY_MORNING_ONLY)
    ).toBe(true);
  });

  it("sábado 12:00 local EXATO -> false (end exclusivo vale para config customizada também)", () => {
    expect(
      isSlotWithinBusinessHours("2026-08-15T15:00:00.000Z", SATURDAY_MORNING_ONLY)
    ).toBe(false);
  });

  it("sábado 09:59 local (antes da config customizada abrir) -> false", () => {
    expect(
      isSlotWithinBusinessHours("2026-08-15T12:59:00.000Z", SATURDAY_MORNING_ONLY)
    ).toBe(false);
  });

  it("segunda dentro do horário 10h-12h, mas dia não está na config (só sábado) -> false", () => {
    // segunda 10:30 local = 13:30 UTC
    expect(
      isSlotWithinBusinessHours("2026-08-10T13:30:00.000Z", SATURDAY_MORNING_ONLY)
    ).toBe(false);
  });
});

describe("isWithin24h (AGT-06, janela da Meta)", () => {
  const LAST_INBOUND = "2026-08-10T12:00:00.000Z";

  it("23h59 decorridas -> true (dentro da janela)", () => {
    expect(isWithin24h(LAST_INBOUND, "2026-08-11T11:59:00.000Z")).toBe(true);
  });

  it("exatamente 24h00 decorridas -> false (limite EXCLUSIVO — borda documentada)", () => {
    expect(isWithin24h(LAST_INBOUND, "2026-08-11T12:00:00.000Z")).toBe(false);
  });

  it("24h01 decorridas -> false (fora da janela)", () => {
    expect(isWithin24h(LAST_INBOUND, "2026-08-11T12:01:00.000Z")).toBe(false);
  });

  it("0s decorridos (now === lastInboundAt) -> true", () => {
    expect(isWithin24h(LAST_INBOUND, LAST_INBOUND)).toBe(true);
  });

  it("now anterior a lastInboundAt (relógio/dado inconsistente) -> false, defensivo", () => {
    expect(isWithin24h(LAST_INBOUND, "2026-08-10T11:59:00.000Z")).toBe(false);
  });

  it("datas ISO inválidas -> false, sem lançar exceção", () => {
    expect(isWithin24h("nao-e-uma-data", LAST_INBOUND)).toBe(false);
    expect(isWithin24h(LAST_INBOUND, "nao-e-uma-data")).toBe(false);
  });
});
