import { describe, expect, it } from "vitest";
import {
  CHAT_REFRESH_INTERVAL_MS,
  conversationControls,
  formatWindowRemaining,
  shouldPollConversation,
  whatsappWindow,
  type WhatsappWindow,
} from "../conversation-control";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MARK = new Date("2026-10-01T10:00:00.000Z");
const OPTED_OUT = new Date("2026-10-01T11:00:00.000Z");

const OPEN: WhatsappWindow = {
  open: true,
  closesAt: new Date(NOW.getTime() + 3 * HOUR),
  remainingMinutes: 180,
};
const CLOSED: WhatsappWindow = {
  open: false,
  closesAt: new Date(NOW.getTime() - HOUR),
  remainingMinutes: 0,
};

describe("whatsappWindow (JANELA-01 AC1)", () => {
  it("última mensagem do lead há exatamente 24 h -> fechada (fronteira, L-023)", () => {
    const last = new Date(NOW.getTime() - 24 * HOUR);
    const window = whatsappWindow(last, NOW);
    expect(window.open).toBe(false);
    expect(window.remainingMinutes).toBe(0);
    expect(window.closesAt).toEqual(new Date(last.getTime() + 24 * HOUR));
  });

  it("última mensagem do lead há 23 h 59 min -> aberta com 1 minuto restante", () => {
    const last = new Date(NOW.getTime() - (23 * HOUR + 59 * MINUTE));
    const window = whatsappWindow(last, NOW);
    expect(window.open).toBe(true);
    expect(window.remainingMinutes).toBe(1);
  });

  it("closesAt é a última mensagem do lead + 24 h", () => {
    const last = new Date("2026-10-01T08:15:00.000Z");
    expect(whatsappWindow(last, NOW).closesAt).toEqual(new Date("2026-10-02T08:15:00.000Z"));
  });

  it("sem mensagem do lead -> fechada, sem closesAt", () => {
    expect(whatsappWindow(null, NOW)).toEqual({ open: false, closesAt: null, remainingMinutes: 0 });
  });
});

describe("formatWindowRemaining (JANELA-01 AC2)", () => {
  it("200 minutos -> '3 h 20 min'", () => {
    expect(formatWindowRemaining(200)).toBe("3 h 20 min");
  });

  it("1 minuto -> '0 h 1 min'", () => {
    expect(formatWindowRemaining(1)).toBe("0 h 1 min");
  });

  it("menos de 1 minuto com a janela aberta -> 'menos de 1 min'", () => {
    const last = new Date(NOW.getTime() - (24 * HOUR - 30 * 1000));
    const window = whatsappWindow(last, NOW);
    expect(window.open).toBe(true);
    expect(formatWindowRemaining(window.remainingMinutes)).toBe("menos de 1 min");
  });
});

describe("conversationControls (ASSUMIR-01 AC8, DEVOLVER-01 AC9, OPTHUM-01 AC7)", () => {
  it("agente conduz -> canAssume, composer oculto", () => {
    const controls = conversationControls({
      status: "em_qualificacao",
      humanTakeoverAt: null,
      optedOutAt: null,
      canWrite: true,
      window: OPEN,
    });
    expect(controls).toEqual({
      conductor: "agente",
      canAssume: true,
      canReturn: false,
      canOptOut: true,
      composer: "oculto",
    });
  });

  it("marca com a janela aberta -> canReturn, composer ativo", () => {
    const controls = conversationControls({
      status: "em_qualificacao",
      humanTakeoverAt: MARK,
      optedOutAt: null,
      canWrite: true,
      window: OPEN,
    });
    expect(controls).toEqual({
      conductor: "humano",
      canAssume: false,
      canReturn: true,
      canOptOut: true,
      composer: "ativo",
    });
  });

  it("marca com a janela fechada -> composer bloqueado", () => {
    const controls = conversationControls({
      status: "em_qualificacao",
      humanTakeoverAt: MARK,
      optedOutAt: null,
      canWrite: true,
      window: CLOSED,
    });
    expect(controls.composer).toBe("bloqueado");
    expect(controls.canReturn).toBe(true);
  });

  it("escalado_humano sem marca -> conductor escalado, canReturn", () => {
    const controls = conversationControls({
      status: "escalado_humano",
      humanTakeoverAt: null,
      optedOutAt: null,
      canWrite: true,
      window: OPEN,
    });
    expect(controls).toEqual({
      conductor: "escalado",
      canAssume: false,
      canReturn: true,
      canOptOut: true,
      composer: "ativo",
    });
  });

  it("opt-out -> nada habilitado, composer oculto", () => {
    const controls = conversationControls({
      status: "escalado_humano",
      humanTakeoverAt: MARK,
      optedOutAt: OPTED_OUT,
      canWrite: true,
      window: OPEN,
    });
    expect(controls).toEqual({
      conductor: "opt-out",
      canAssume: false,
      canReturn: false,
      canOptOut: false,
      composer: "oculto",
    });
  });

  it("sem chats:escrever -> nenhum controle, composer oculto", () => {
    for (const lead of [
      { status: "em_qualificacao" as const, humanTakeoverAt: null },
      { status: "em_qualificacao" as const, humanTakeoverAt: MARK },
      { status: "escalado_humano" as const, humanTakeoverAt: null },
    ]) {
      const controls = conversationControls({
        ...lead,
        optedOutAt: null,
        canWrite: false,
        window: OPEN,
      });
      expect(controls.canAssume).toBe(false);
      expect(controls.canReturn).toBe(false);
      expect(controls.canOptOut).toBe(false);
      expect(controls.composer).toBe("oculto");
    }
  });

  it("ligação com isHumanConducted: só a marca, status fora de escalado -> conductor humano (L-026)", () => {
    const controls = conversationControls({
      status: "qualificado_agendado",
      humanTakeoverAt: MARK,
      optedOutAt: null,
      canWrite: true,
      window: OPEN,
    });
    expect(controls.conductor).toBe("humano");
    expect(controls.canAssume).toBe(false);
  });
});

describe("atualização periódica do Chats (THREAD-01 AC2/AC3)", () => {
  it("CHAT_REFRESH_INTERVAL_MS é 5.000 em produção e cabe nos 10 s da spec (L-037)", () => {
    expect(CHAT_REFRESH_INTERVAL_MS).toBe(5000);
    expect(CHAT_REFRESH_INTERVAL_MS).toBeLessThanOrEqual(10000);
  });

  it("consulta só com conversa aberta e aba visível", () => {
    expect(shouldPollConversation(true, "visible")).toBe(true);
    expect(shouldPollConversation(true, "hidden")).toBe(false);
    expect(shouldPollConversation(false, "visible")).toBe(false);
  });
});
