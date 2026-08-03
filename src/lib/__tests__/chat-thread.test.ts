import { describe, expect, it } from "vitest";
import { buildChatThread, type ChatThreadMessageInput } from "../chat-thread";

/**
 * Datas escritas SEM offset de propósito: `new Date("2026-01-05T09:00:00")` é
 * lido como horário local, então o dia de calendário assertado aqui é o mesmo
 * em qualquer fuso onde a suíte rode.
 */
function message(
  id: string,
  sender: ChatThreadMessageInput["sender"],
  sentAt: string,
  content = `msg ${id}`
): ChatThreadMessageInput {
  return { id, sender, sentAt, content };
}

// Testes 1:1 com RD-06 AC2 (agrupamento multi-bolha de mensagens consecutivas
// do mesmo remetente) e RD-06 AC3 (divisor de data quando a thread cruza um
// limite de dia).
describe("buildChatThread (RD-06 AC2/AC3)", () => {
  it("retorna lista vazia quando não há mensagens", () => {
    expect(buildChatThread([])).toEqual([]);
  });

  it("agrupa todas as mensagens do mesmo dia num único bloco de data (AC3)", () => {
    const days = buildChatThread([
      message("m1", "lead", "2026-01-05T09:00:00"),
      message("m2", "agente", "2026-01-05T18:30:00"),
    ]);

    expect(days).toHaveLength(1);
    expect(days[0].key).toBe("2026-01-05");
  });

  it("abre um bloco por dia quando a thread cruza a virada do dia (AC3)", () => {
    const days = buildChatThread([
      message("m1", "lead", "2026-01-05T23:50:00"),
      message("m2", "agente", "2026-01-06T00:10:00"),
      message("m3", "lead", "2026-01-06T08:00:00"),
    ]);

    expect(days.map((day) => day.key)).toEqual(["2026-01-05", "2026-01-06"]);
    expect(days[0].groups.flatMap((group) => group.bubbles.map((b) => b.id))).toEqual(
      ["m1"]
    );
    expect(days[1].groups.flatMap((group) => group.bubbles.map((b) => b.id))).toEqual(
      ["m2", "m3"]
    );
  });

  it("usa o instante da primeira mensagem do dia como valor do divisor (AC3)", () => {
    const days = buildChatThread([
      message("m1", "lead", "2026-01-05T23:50:00"),
      message("m2", "agente", "2026-01-06T00:10:00"),
    ]);

    expect(days[0].dividerAt).toBe("2026-01-05T23:50:00");
    expect(days[1].dividerAt).toBe("2026-01-06T00:10:00");
  });

  it("junta mensagens consecutivas do mesmo remetente num só grupo (AC2)", () => {
    const days = buildChatThread([
      message("m1", "agente", "2026-01-05T09:00:00"),
      message("m2", "agente", "2026-01-05T09:01:00"),
      message("m3", "agente", "2026-01-05T09:02:00"),
    ]);

    expect(days[0].groups).toHaveLength(1);
    expect(days[0].groups[0].sender).toBe("agente");
    expect(days[0].groups[0].bubbles.map((bubble) => bubble.group)).toEqual([
      "first",
      "middle",
      "last",
    ]);
  });

  it("marca apenas first/last num grupo de duas mensagens (AC2)", () => {
    const days = buildChatThread([
      message("m1", "lead", "2026-01-05T09:00:00"),
      message("m2", "lead", "2026-01-05T09:01:00"),
    ]);

    expect(days[0].groups[0].bubbles.map((bubble) => bubble.group)).toEqual([
      "first",
      "last",
    ]);
  });

  it("deixa a bolha isolada sem posição de grupo quando o remetente alterna (AC2)", () => {
    const days = buildChatThread([
      message("m1", "lead", "2026-01-05T09:00:00"),
      message("m2", "agente", "2026-01-05T09:01:00"),
      message("m3", "lead", "2026-01-05T09:02:00"),
    ]);

    expect(days[0].groups.map((group) => group.sender)).toEqual([
      "lead",
      "agente",
      "lead",
    ]);
    expect(
      days[0].groups.map((group) => group.bubbles[0].group)
    ).toEqual([undefined, undefined, undefined]);
  });

  it("encerra o grupo na virada do dia mesmo com o mesmo remetente (AC2+AC3)", () => {
    const days = buildChatThread([
      message("m1", "agente", "2026-01-05T23:50:00"),
      message("m2", "agente", "2026-01-06T00:10:00"),
    ]);

    expect(days).toHaveLength(2);
    expect(days[0].groups[0].bubbles[0].group).toBeUndefined();
    expect(days[1].groups[0].bubbles[0].group).toBeUndefined();
  });

  it("preserva conteúdo, id e instante de cada mensagem na bolha", () => {
    const days = buildChatThread([
      message("m1", "lead", "2026-01-05T09:00:00", "Quero um apê de 3 quartos"),
    ]);

    expect(days[0].groups[0].key).toBe("m1");
    expect(days[0].groups[0].bubbles[0]).toEqual({
      id: "m1",
      content: "Quero um apê de 3 quartos",
      sentAt: "2026-01-05T09:00:00",
    });
  });
});
