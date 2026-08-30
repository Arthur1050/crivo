import { describe, expect, it } from "vitest";
import {
  attendanceWindow,
  isPendingAttendance,
  normalizeMonthlyBaseline,
  periodDays,
  resolveIntegrationHealth,
} from "../pilot-metrics";

const DAY_MS = 86400000;

describe("periodDays", () => {
  it("um dia corrido completo (início do dia UTC até fim do dia UTC) devolve exatamente 1", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-01T23:59:59.999Z");
    expect(periodDays(from, to)).toBe(1);
  });

  it("30 dias corridos completos (preset 30d) devolve exatamente 30", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-30T23:59:59.999Z");
    expect(periodDays(from, to)).toBe(30);
  });

  it("período de menos de 1 dia preserva a fração — nunca arredonda para zero", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-01T06:00:00.000Z"); // 6h
    const result = periodDays(from, to);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
    expect(result).toBeCloseTo(0.25, 5);
  });

  it("from === to (instante único) ainda devolve um valor positivo, não zero", () => {
    const instant = new Date("2026-08-01T12:00:00.000Z");
    expect(periodDays(instant, instant)).toBeGreaterThan(0);
  });
});

describe("normalizeMonthlyBaseline", () => {
  it("baseline mensal normalizado para 15 dias é a metade", () => {
    expect(normalizeMonthlyBaseline(30, 15)).toBe(15);
  });

  it("baseline mensal normalizado para 30 dias permanece igual", () => {
    expect(normalizeMonthlyBaseline(19, 30)).toBe(19);
  });

  it("baseline zero é tratado como valor — devolve 0, não é tratado como ausência", () => {
    expect(normalizeMonthlyBaseline(0, 15)).toBe(0);
  });
});

describe("attendanceWindow", () => {
  it("pendingFrom é 30 minutos após a reunião; expiresAt é 14 dias após pendingFrom", () => {
    const meetingAt = new Date("2026-08-01T10:00:00.000Z");
    const { pendingFrom, expiresAt } = attendanceWindow(meetingAt);

    expect(pendingFrom.getTime()).toBe(meetingAt.getTime() + 30 * 60 * 1000);
    expect(expiresAt.getTime()).toBe(pendingFrom.getTime() + 14 * DAY_MS);
  });
});

describe("isPendingAttendance", () => {
  const meetingAt = new Date("2026-08-01T10:00:00.000Z");
  const pendingFrom = new Date(meetingAt.getTime() + 30 * 60 * 1000);
  const expiresAt = new Date(pendingFrom.getTime() + 14 * DAY_MS);

  it("antes do encerramento (now < pendingFrom) não cobra confirmação", () => {
    const now = new Date(pendingFrom.getTime() - 1);
    expect(isPendingAttendance(meetingAt, null, now)).toBe(false);
  });

  it("exatamente no instante de encerramento (+30min) já cobra confirmação — limite incluso", () => {
    expect(isPendingAttendance(meetingAt, null, pendingFrom)).toBe(true);
  });

  it("no meio da janela (poucos dias após o encerramento) cobra confirmação", () => {
    const now = new Date(pendingFrom.getTime() + 3 * DAY_MS);
    expect(isPendingAttendance(meetingAt, null, now)).toBe(true);
  });

  it("exatamente nos 14 dias (no instante de expiresAt) já prescreveu — limite excluso", () => {
    expect(isPendingAttendance(meetingAt, null, expiresAt)).toBe(false);
  });

  it("um milissegundo antes de expiresAt ainda cobra confirmação", () => {
    const now = new Date(expiresAt.getTime() - 1);
    expect(isPendingAttendance(meetingAt, null, now)).toBe(true);
  });

  it("comparecimento já confirmado como true não cobra mais, mesmo dentro da janela", () => {
    const now = new Date(pendingFrom.getTime() + DAY_MS);
    expect(isPendingAttendance(meetingAt, true, now)).toBe(false);
  });

  it("comparecimento já confirmado como false (ausência) não cobra mais, mesmo dentro da janela", () => {
    const now = new Date(pendingFrom.getTime() + DAY_MS);
    expect(isPendingAttendance(meetingAt, false, now)).toBe(false);
  });
});

describe("resolveIntegrationHealth", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");

  it("sucesso recente (dentro de 24h) e nenhuma recusa: saudável", () => {
    const lastSuccessAt = new Date(now.getTime() - 60 * 60 * 1000); // 1h atrás
    expect(resolveIntegrationHealth({ lastSuccessAt, refusalCount: 0 }, now)).toBe(
      "saudavel"
    );
  });

  it("sucesso a mais de 24h e nenhuma recusa: problema", () => {
    const lastSuccessAt = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(resolveIntegrationHealth({ lastSuccessAt, refusalCount: 0 }, now)).toBe(
      "problema"
    );
  });

  it("recusa presente mesmo com sucesso recente: problema — 'OU recusa' já decide", () => {
    const lastSuccessAt = new Date(now.getTime() - 60 * 1000); // 1 minuto atrás
    expect(resolveIntegrationHealth({ lastSuccessAt, refusalCount: 1 }, now)).toBe(
      "problema"
    );
  });

  it("nenhum sucesso e nenhuma recusa (ausência total de atividade): problema, não silêncio", () => {
    expect(resolveIntegrationHealth({ lastSuccessAt: null, refusalCount: 0 }, now)).toBe(
      "problema"
    );
  });

  it("nenhum sucesso mas com recusa: problema", () => {
    expect(resolveIntegrationHealth({ lastSuccessAt: null, refusalCount: 3 }, now)).toBe(
      "problema"
    );
  });
});
