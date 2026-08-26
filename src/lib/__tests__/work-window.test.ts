import { describe, expect, it } from "vitest";
import {
  coversInstant,
  coversInterval,
  validateWorkWindow,
  type WorkWindow,
} from "../work-window";

/**
 * Datas escritas com offset explícito de America/Sao_Paulo (`-03:00`), que é a
 * timezone em que a janela é interpretada (AGENDA-01 AC2).
 * 2026-08-24 = segunda (ISO 1); 2026-08-29 = sábado (6); 2026-08-30 = domingo (7).
 */
function saoPaulo(isoLocal: string): Date {
  return new Date(`${isoLocal}-03:00`);
}

// Janela seg-sex 08:00-14:00 — o mesmo formato que o seed grava (T14).
const MANHA: WorkWindow = { days: [1, 2, 3, 4, 5], start: "08:00", end: "14:00" };

describe("coversInstant (ATRIB-03 AC2 — janela cobre o instante do escalonamento)", () => {
  it("instante dentro do dia e do horário declarados é coberto", () => {
    expect(coversInstant(MANHA, saoPaulo("2026-08-24T10:00:00"))).toBe(true);
  });

  it("instante exatamente no minuto de início é coberto (início inclusivo)", () => {
    expect(coversInstant(MANHA, saoPaulo("2026-08-24T08:00:00"))).toBe(true);
  });

  it("instante exatamente no minuto de fim NÃO é coberto (fim exclusivo)", () => {
    expect(coversInstant(MANHA, saoPaulo("2026-08-24T14:00:00"))).toBe(false);
  });

  it("instante antes do início do atendimento não é coberto", () => {
    expect(coversInstant(MANHA, saoPaulo("2026-08-24T07:59:00"))).toBe(false);
  });

  it("dia da semana fora dos declarados não é coberto, mesmo no horário", () => {
    // Sábado 10:00 — horário dentro da faixa, dia fora de seg-sex.
    expect(coversInstant(MANHA, saoPaulo("2026-08-29T10:00:00"))).toBe(false);
  });

  it("o instante é lido em America/Sao_Paulo, não em UTC (AGENDA-01 AC2)", () => {
    // 10:59Z = 07:59 em São Paulo, ANTES do início — mas 10:59 lido como UTC
    // cairia dentro de 08:00-14:00. É o par que separa as duas leituras.
    // 11:00Z = 08:00 local, o primeiro minuto coberto.
    expect(coversInstant(MANHA, new Date("2026-08-24T10:59:00.000Z"))).toBe(false);
    expect(coversInstant(MANHA, new Date("2026-08-24T11:00:00.000Z"))).toBe(true);
  });

  it("janela ausente é indisponível sempre (AGENDA-01 AC5)", () => {
    expect(coversInstant(null, saoPaulo("2026-08-24T10:00:00"))).toBe(false);
  });
});

describe("coversInterval (ATRIB-02 AC2 — janela cobre integralmente a reunião)", () => {
  it("reunião de 30 min inteiramente dentro da janela é coberta", () => {
    expect(
      coversInterval(
        MANHA,
        saoPaulo("2026-08-24T10:00:00"),
        saoPaulo("2026-08-24T10:30:00")
      )
    ).toBe(true);
  });

  it("reunião que começa no minuto de início da janela é coberta", () => {
    expect(
      coversInterval(
        MANHA,
        saoPaulo("2026-08-24T08:00:00"),
        saoPaulo("2026-08-24T08:30:00")
      )
    ).toBe(true);
  });

  it("reunião que termina no minuto de fim da janela é coberta (contida por inteiro)", () => {
    expect(
      coversInterval(
        MANHA,
        saoPaulo("2026-08-24T13:30:00"),
        saoPaulo("2026-08-24T14:00:00")
      )
    ).toBe(true);
  });

  it("reunião que COMEÇA no minuto de fim da janela não é coberta", () => {
    expect(
      coversInterval(
        MANHA,
        saoPaulo("2026-08-24T14:00:00"),
        saoPaulo("2026-08-24T14:30:00")
      )
    ).toBe(false);
  });

  it("reunião que transborda o fim da janela não é coberta (contenção integral, não sobreposição)", () => {
    expect(
      coversInterval(
        MANHA,
        saoPaulo("2026-08-24T13:45:00"),
        saoPaulo("2026-08-24T14:15:00")
      )
    ).toBe(false);
  });

  it("reunião que começa antes do início da janela não é coberta", () => {
    expect(
      coversInterval(
        MANHA,
        saoPaulo("2026-08-24T07:45:00"),
        saoPaulo("2026-08-24T08:15:00")
      )
    ).toBe(false);
  });

  it("reunião em dia fora dos declarados não é coberta", () => {
    expect(
      coversInterval(
        MANHA,
        saoPaulo("2026-08-30T10:00:00"),
        saoPaulo("2026-08-30T10:30:00")
      )
    ).toBe(false);
  });

  it("reunião que atravessa a virada do dia não cabe em nenhuma janela", () => {
    const madrugada: WorkWindow = { days: [1], start: "08:00", end: "23:59" };
    expect(
      coversInterval(
        madrugada,
        saoPaulo("2026-08-24T23:50:00"),
        saoPaulo("2026-08-25T00:20:00")
      )
    ).toBe(false);
  });

  it("janela ausente é indisponível sempre (AGENDA-01 AC5)", () => {
    expect(
      coversInterval(
        null,
        saoPaulo("2026-08-24T10:00:00"),
        saoPaulo("2026-08-24T10:30:00")
      )
    ).toBe(false);
  });
});

describe("validateWorkWindow (AGENDA-01 AC2/AC3/AC4)", () => {
  it("aceita dias de 1 a 7 e horários HH:MM", () => {
    expect(
      validateWorkWindow({ days: [1, 2, 3, 4, 5, 6, 7], start: "00:00", end: "23:59" })
    ).toEqual({ ok: true });
  });

  it("recusa fim igual ao início, apontando o campo de fim (AC3)", () => {
    expect(
      validateWorkWindow({ days: [1], start: "09:00", end: "09:00" })
    ).toEqual({
      ok: false,
      field: "workHoursEnd",
      message: "O horário de fim precisa ser posterior ao de início.",
    });
  });

  it("recusa fim anterior ao início, apontando o campo de fim (AC3)", () => {
    const result = validateWorkWindow({ days: [1], start: "18:00", end: "09:00" });
    expect(result).toMatchObject({ ok: false, field: "workHoursEnd" });
  });

  it("recusa nenhum dia selecionado, informando que ao menos um é obrigatório (AC4)", () => {
    expect(validateWorkWindow({ days: [], start: "09:00", end: "18:00" })).toEqual({
      ok: false,
      field: "workDays",
      message: "Selecione ao menos um dia da semana.",
    });
  });

  it("recusa dia fora do intervalo 1-7, apontando o campo de dias (AC2)", () => {
    expect(
      validateWorkWindow({ days: [1, 8], start: "09:00", end: "18:00" })
    ).toMatchObject({ ok: false, field: "workDays" });
    expect(
      validateWorkWindow({ days: [0], start: "09:00", end: "18:00" })
    ).toMatchObject({ ok: false, field: "workDays" });
  });

  it("recusa horário fora do formato HH:MM, apontando o campo do horário (AC2)", () => {
    expect(
      validateWorkWindow({ days: [1], start: "9:00", end: "18:00" })
    ).toMatchObject({ ok: false, field: "workHoursStart" });
    expect(
      validateWorkWindow({ days: [1], start: "09:00", end: "25:00" })
    ).toMatchObject({ ok: false, field: "workHoursEnd" });
  });
});

describe("work-window é módulo puro", () => {
  it("não importa banco, rede nem lê o relógio (design.md — função pura, sem I/O)", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("../work-window.ts", import.meta.url), "utf-8")
    );
    expect(source).not.toMatch(/\bimport\b/);
    expect(source).not.toMatch(/Date\.now\(\)/);
  });
});
