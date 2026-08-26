/**
 * Janela de trabalho declarada de um corretor (lote-8 — AGENDA-01, AD-022).
 *
 * Função pura, sem I/O: diz se a janela cobre um instante (escalonamento) ou
 * um intervalo inteiro (agendamento), e valida a janela informada na tela.
 * Mesma convenção de `n8n/src/business-hours.mjs` e de
 * `tenants.meetingDays`/`meetingHoursStart`: dias ISO 1(segunda)-7(domingo),
 * horários `HH:MM` interpretados em America/Sao_Paulo, sem timezone
 * armazenada (spec.md — Assumptions).
 */

// Timezone fixa do produto no piloto (spec.md — Assumptions: "America/Sao_Paulo,
// sem timezone armazenado").
const TIMEZONE = "America/Sao_Paulo";

export interface WorkWindow {
  days: number[];
  start: string;
  end: string;
}

export type WorkWindowField = "workDays" | "workHoursStart" | "workHoursEnd";

export type WorkWindowValidation =
  | { ok: true }
  | { ok: false; field: WorkWindowField; message: string };

export interface WorkWindowInput {
  days: number[];
  start: string;
  end: string;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const ISO_WEEKDAY_BY_SHORT_NAME: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/**
 * Dia da semana ISO e horário `HH:MM` de um instante, em America/Sao_Paulo.
 * `null` para data inválida.
 */
function localDayAndTime(
  date: Date
): { isoWeekday: number; time: string } | null {
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;

  const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[map.weekday];
  if (isoWeekday === undefined) return null;
  // Alguns motores ICU renderizam meia-noite como "24" com hour12:false —
  // normalizado defensivamente, como em `n8n/src/business-hours.mjs`.
  const hour = map.hour === "24" ? "00" : map.hour;
  return { isoWeekday, time: `${hour}:${map.minute}` };
}

/**
 * A janela cobre o instante `at`? Alimenta a atribuição por escalonamento
 * (ATRIB-03 AC2). Início inclusivo, fim exclusivo — mesma escolha de limite de
 * `isSlotWithinBusinessHours`: estar exatamente no minuto de fim é estar fora
 * do atendimento.
 *
 * Janela ausente (`null`) é indisponível SEMPRE (AGENDA-01 AC5): quem não
 * declarou horário não recebe reunião nem escalonamento por agenda.
 */
export function coversInstant(window: WorkWindow | null, at: Date): boolean {
  if (!window) return false;

  const local = localDayAndTime(at);
  if (!local) return false;
  if (!window.days.includes(local.isoWeekday)) return false;

  return local.time >= window.start && local.time < window.end;
}

/**
 * A janela contém INTEGRALMENTE o intervalo `[start, end]`? Alimenta a
 * atribuição no agendamento (ATRIB-02 AC2).
 *
 * Contenção integral (spec.md — Edge Cases: "considerar coberto apenas o
 * intervalo integralmente contido na janela"): uma reunião que começa no
 * minuto de FIM da janela não é coberta, e uma que começa no minuto de início
 * é. O fim da reunião pode coincidir com o fim da janela — aí ela ainda está
 * inteira dentro do horário de atendimento.
 *
 * Intervalo que atravessa a virada do dia nunca é coberto: a janela é
 * declarada por dia da semana, então um intervalo com início e fim em dias
 * diferentes não cabe em nenhuma.
 */
export function coversInterval(
  window: WorkWindow | null,
  start: Date,
  end: Date
): boolean {
  if (!window) return false;

  const localStart = localDayAndTime(start);
  const localEnd = localDayAndTime(end);
  if (!localStart || !localEnd) return false;
  if (localStart.isoWeekday !== localEnd.isoWeekday) return false;
  if (!window.days.includes(localStart.isoWeekday)) return false;

  return localStart.time >= window.start && localEnd.time <= window.end;
}

/**
 * Valida a janela informada antes de gravar (AGENDA-01 AC2/AC3/AC4),
 * apontando o campo inválido para a tela destacar.
 */
export function validateWorkWindow(input: WorkWindowInput): WorkWindowValidation {
  if (!Array.isArray(input.days) || input.days.length === 0) {
    return {
      ok: false,
      field: "workDays",
      message: "Selecione ao menos um dia da semana.",
    };
  }

  const invalidDay = input.days.some(
    (day) => !Number.isInteger(day) || day < 1 || day > 7
  );
  if (invalidDay) {
    return {
      ok: false,
      field: "workDays",
      message: "Dia da semana inválido: use de 1 (segunda) a 7 (domingo).",
    };
  }

  if (!TIME_PATTERN.test(input.start)) {
    return {
      ok: false,
      field: "workHoursStart",
      message: "Horário de início inválido: use o formato HH:MM.",
    };
  }

  if (!TIME_PATTERN.test(input.end)) {
    return {
      ok: false,
      field: "workHoursEnd",
      message: "Horário de fim inválido: use o formato HH:MM.",
    };
  }

  if (input.end <= input.start) {
    return {
      ok: false,
      field: "workHoursEnd",
      message: "O horário de fim precisa ser posterior ao de início.",
    };
  }

  return { ok: true };
}
