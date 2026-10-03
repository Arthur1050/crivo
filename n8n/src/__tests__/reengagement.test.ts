import { describe, expect, it } from "vitest";
import { evaluateReengagement } from "../reengagement.mjs";

const NOW = "2026-10-06T15:00:00.000Z"; // terça, 12h em São Paulo
const HOUR = 60 * 60 * 1000;
const base = {
  lead: { status: "em_qualificacao", optedOutAt: null, humanTakeoverAt: null },
  anchor: { messageId: "inbound-real", sentAt: "2026-10-05T17:00:00.000Z" },
  phase: "qualificando",
  channel: { phoneNumberId: "123456789" },
  destination: "5534999990001",
  now: NOW,
  settings: null,
};

describe("evaluateReengagement — REEN-01 AC1/2, fronteiras do inbound real", () => {
  it.each([
    [22 * HOUR - 1, null, "too-early"],
    [22 * HOUR, "prepare", "eligible"],
    [24 * HOUR - 1, "prepare", "eligible"],
    [24 * HOUR, "omit", "window-closed"],
  ])("silêncio de %i ms: ação %s", (silence, action, reason) => {
    const anchor = { ...base.anchor, sentAt: new Date(Date.parse(NOW) - silence).toISOString() };
    expect(evaluateReengagement({ ...base, anchor })).toEqual({ action, reason });
  });

  it("fase agendando ainda não encerrada é elegível", () => {
    expect(evaluateReengagement({ ...base, phase: "agendando" })).toEqual({ action: "prepare", reason: "eligible" });
  });
});

describe("evaluateReengagement — REEN-01 AC3, horário de contato A2", () => {
  it.each([
    ["2026-10-06T11:59:59.999Z", null],
    ["2026-10-06T12:00:00.000Z", "prepare"],
    ["2026-10-06T20:59:59.999Z", "prepare"],
    ["2026-10-06T21:00:00.000Z", null],
  ])("início inclusivo e fim exclusivo em %s", (now, action) => {
    const anchor = { ...base.anchor, sentAt: new Date(Date.parse(now) - 22 * HOUR).toISOString() };
    expect(evaluateReengagement({ ...base, now, anchor })).toEqual({ action, reason: action ? "eligible" : "outside-contact-hours" });
  });

  it.each(["2026-10-03T15:00:00.000Z", "2026-10-04T15:00:00.000Z"])("fallback não contata no fim de semana %s", (now) => {
    const anchor = { ...base.anchor, sentAt: new Date(Date.parse(now) - 22 * HOUR).toISOString() };
    expect(evaluateReengagement({ ...base, now, anchor })).toEqual({ action: null, reason: "outside-contact-hours" });
  });

  it("configuração incompleta usa o fallback inteiro seg–sex 09h–18h", () => {
    expect(evaluateReengagement({ ...base, settings: { meetingDays: [6], meetingHoursStart: null, meetingHoursEnd: "12:00" } })).toEqual({ action: "prepare", reason: "eligible" });
  });

  it("contata sábado configurado dentro do intervalo", () => {
    expect(evaluateReengagement({ ...base, now: "2026-10-03T13:00:00.000Z", anchor: { ...base.anchor, sentAt: "2026-10-02T15:00:00.000Z" }, settings: { meetingDays: [6], meetingHoursStart: "10:00", meetingHoursEnd: "12:00" } })).toEqual({ action: "prepare", reason: "eligible" });
  });

  it("espera fora do horário, mas não contata no próximo dia se a janela acabou", () => {
    const anchor = { ...base.anchor, sentAt: "2026-10-05T23:00:00.000Z" };
    expect(evaluateReengagement({ ...base, anchor, now: "2026-10-06T21:00:00.000Z" })).toEqual({ action: null, reason: "outside-contact-hours" });
    expect(evaluateReengagement({ ...base, anchor, now: "2026-10-07T12:00:00.000Z" })).toEqual({ action: "omit", reason: "window-closed" });
  });
});

describe("evaluateReengagement — REEN-01 AC5/6, falha fechada", () => {
  it.each([
    { ...base, lead: { ...base.lead, status: "qualificado_agendado" } },
    { ...base, lead: { ...base.lead, status: "escalado_humano" } },
    { ...base, phase: "encerrada" },
    { ...base, lead: { ...base.lead, optedOutAt: NOW } },
    { ...base, lead: { ...base.lead, humanTakeoverAt: NOW } },
  ])("exclui pipeline/condução incompatível %#", (input) => {
    expect(evaluateReengagement(input)).toEqual({ action: null, reason: "ineligible" });
  });

  it.each([
    { ...base, lead: null },
    { ...base, lead: { status: "em_qualificacao" } },
    { ...base, phase: null },
    { ...base, phase: "inventada" },
    { ...base, anchor: null },
    { ...base, anchor: { messageId: "", sentAt: base.anchor.sentAt } },
    { ...base, anchor: { ...base.anchor, sentAt: "ilegível" } },
    { ...base, anchor: { ...base.anchor, sentAt: "2026-10-06T15:00:00.001Z" } },
    { ...base, now: "ilegível" },
    { ...base, channel: null },
    { ...base, channel: { phoneNumberId: "ilegível" } },
    { ...base, destination: "" },
  ])("não contata com fato crítico ausente/inválido %#", (input) => {
    expect(evaluateReengagement(input)).toEqual({ action: null, reason: "unknown-data" });
  });

  it.each([
    { ...base, phase: Object("qualificando") as unknown },
    { ...base, phase: 1 },
    { ...base, lead: { ...base.lead, status: Object("em_qualificacao") as unknown } },
    { ...base, lead: { ...base.lead, optedOutAt: false } },
    { ...base, lead: { ...base.lead, optedOutAt: "" } },
    { ...base, lead: { ...base.lead, optedOutAt: "ilegível" } },
    { ...base, lead: { ...base.lead, humanTakeoverAt: false } },
    { ...base, lead: { ...base.lead, humanTakeoverAt: "" } },
    { ...base, lead: { ...base.lead, humanTakeoverAt: new Date("ilegível") } },
  ])("tipo inválido não vira fato elegível por coerção %#", (input) => {
    expect(evaluateReengagement(input)).toEqual({ action: null, reason: "unknown-data" });
  });
});

describe("evaluateReengagement — REEN-05 AC2, escalonamento independente de contato", () => {
  it.each([
    [48 * HOUR - 1, "omit", "window-closed"],
    [48 * HOUR, "escalate", "silence-expired"],
    [48 * HOUR + 1, "escalate", "silence-expired"],
  ])("silêncio de %i ms em domingo fora de horário: %s", (silence, action, reason) => {
    const now = "2026-10-04T03:00:00.000Z";
    const anchor = { ...base.anchor, sentAt: new Date(Date.parse(now) - silence).toISOString() };
    expect(evaluateReengagement({ ...base, now, anchor })).toEqual({ action, reason });
  });

  it("as 48h não retiram a proteção de condução humana", () => {
    expect(evaluateReengagement({ ...base, anchor: { ...base.anchor, sentAt: "2026-10-04T15:00:00.000Z" }, lead: { ...base.lead, humanTakeoverAt: NOW } })).toEqual({ action: null, reason: "ineligible" });
  });
});
