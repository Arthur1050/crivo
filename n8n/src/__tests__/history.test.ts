import { describe, expect, it } from "vitest";
import { selectHistoryWindow } from "../history.mjs";

/** Constrói N mensagens alternando lead/agente, com `sentAt` espaçado por
 * `stepMinutes` a partir de `startIso` — utilitário só deste arquivo. */
function buildMessages(count, { startIso = "2026-08-01T10:00:00.000Z", stepMinutes = 5 } = {}) {
  const start = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, i) => ({
    sender: i % 2 === 0 ? "lead" : "agente",
    content: `mensagem ${i + 1}`,
    sentAt: new Date(start + i * stepMinutes * 60000).toISOString(),
  }));
}

describe("selectHistoryWindow (lote-6b — CTX-01)", () => {
  it("lista vazia -> janela vazia, hasAgentMessage:false", () => {
    expect(selectHistoryWindow([])).toEqual({ window: [], hasAgentMessage: false });
  });

  it("undefined/null -> janela vazia, hasAgentMessage:false (defensivo)", () => {
    expect(selectHistoryWindow(undefined)).toEqual({ window: [], hasAgentMessage: false });
    expect(selectHistoryWindow(null)).toEqual({ window: [], hasAgentMessage: false });
  });

  it("30 mensagens sem gap -> as últimas 20, em ordem crescente", () => {
    const messages = buildMessages(30);
    const result = selectHistoryWindow(messages);

    expect(result.window).toHaveLength(20);
    expect(result.window[0].content).toBe("mensagem 11");
    expect(result.window[19].content).toBe("mensagem 30");
  });

  // Discrimina a ordem de aplicação: corte de sessão ANTES do teto. Gap de
  // 20h entre a 12ª (índice 11) e a 13ª (índice 12) de 30 mensagens — a
  // sessão corrente começa na 13ª e tem 18 itens, menos que o teto de 20.
  // Se o teto fosse aplicado primeiro (regra invertida — errada), a janela
  // teria 20 itens começando na 11ª, atravessando o intervalo de sessão.
  it("gap de 20h entre a 12ª e a 13ª de 30 mensagens -> sessão começa na 13ª (18 itens, corte antes do teto)", () => {
    const messages = buildMessages(30);
    // Desloca tudo a partir do índice 12 (13ª mensagem) 20h para frente.
    const shifted = messages.map((message, i) => {
      if (i < 12) return message;
      const shiftedTime = new Date(message.sentAt).getTime() + 20 * 60 * 60 * 1000;
      return { ...message, sentAt: new Date(shiftedTime).toISOString() };
    });

    const result = selectHistoryWindow(shifted);

    expect(result.window).toHaveLength(18);
    expect(result.window[0].content).toBe("mensagem 13");
    expect(result.window[17].content).toBe("mensagem 30");
  });

  it("gap grande só entre a penúltima e a última mensagem -> janela de 1 item", () => {
    const messages = buildMessages(10);
    const shifted = messages.map((message, i) => {
      if (i < 9) return message;
      const shiftedTime = new Date(message.sentAt).getTime() + 15 * 60 * 60 * 1000;
      return { ...message, sentAt: new Date(shiftedTime).toISOString() };
    });

    const result = selectHistoryWindow(shifted);

    expect(result.window).toHaveLength(1);
    expect(result.window[0].content).toBe("mensagem 10");
  });

  it("intervalo de EXATAMENTE sessionGapHours (12h) não corta a sessão (regra é 'maior que', não 'maior ou igual')", () => {
    const messages = [
      { sender: "lead", content: "mensagem 1", sentAt: "2026-08-01T10:00:00.000Z" },
      { sender: "agente", content: "mensagem 2", sentAt: "2026-08-01T10:05:00.000Z" },
      // Exatamente 12h após a mensagem 2 — não é "maior que" 12h, então o
      // corte NÃO deve acontecer aqui.
      { sender: "lead", content: "mensagem 3", sentAt: "2026-08-01T22:05:00.000Z" },
      { sender: "agente", content: "mensagem 4", sentAt: "2026-08-01T22:10:00.000Z" },
    ];

    const result = selectHistoryWindow(messages);

    expect(result.window).toHaveLength(4);
  });

  it("maxMessages/sessionGapHours customizados são respeitados", () => {
    const messages = buildMessages(10);
    const result = selectHistoryWindow(messages, { maxMessages: 3 });

    expect(result.window).toHaveLength(3);
    expect(result.window.map((m) => m.content)).toEqual([
      "mensagem 8",
      "mensagem 9",
      "mensagem 10",
    ]);
  });

  it("hasAgentMessage:true quando a janela contém ao menos uma mensagem do agente", () => {
    const messages = buildMessages(4); // índices 1 e 3 são 'agente'
    const result = selectHistoryWindow(messages);
    expect(result.hasAgentMessage).toBe(true);
  });

  it("hasAgentMessage:false quando só o lead falou na janela", () => {
    const messages = [
      { sender: "lead", content: "oi", sentAt: "2026-08-01T10:00:00.000Z" },
      { sender: "lead", content: "tudo bem?", sentAt: "2026-08-01T10:01:00.000Z" },
    ];
    const result = selectHistoryWindow(messages);
    expect(result.hasAgentMessage).toBe(false);
  });

  // Teste discriminante do design.md — "hasAgentMessage é derivado DA
  // JANELA, não da lista inteira": a única mensagem do agente está FORA da
  // janela (cortada pelo corte de sessão) — hasAgentMessage precisa ser
  // false mesmo a mensagem do agente existindo na thread completa.
  it("agente só respondeu numa sessão antiga, fora da janela atual -> hasAgentMessage:false", () => {
    const oldSession = [
      { sender: "lead", content: "mensagem antiga do lead", sentAt: "2026-08-01T09:00:00.000Z" },
      {
        sender: "agente",
        content: "mensagem antiga do agente",
        sentAt: "2026-08-01T09:05:00.000Z",
      },
    ];
    const newSession = [
      {
        sender: "lead",
        content: "mensagem nova do lead",
        sentAt: "2026-08-02T09:00:00.000Z", // > 12h depois da última acima
      },
    ];

    const result = selectHistoryWindow([...oldSession, ...newSession]);

    expect(result.window).toEqual(newSession);
    expect(result.hasAgentMessage).toBe(false);
  });
});
