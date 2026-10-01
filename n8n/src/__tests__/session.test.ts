import { describe, expect, it } from "vitest";
import { isSessionExpired, selectSeedMessages, toSeedMemoryItem } from "../session.mjs";

type HistoryMessage = import("../session.mjs").HistoryMessage;

/** Constrói N mensagens alternando lead/agente, com `sentAt` espaçado por
 * `stepMinutes` a partir de `startIso` — mesmo utilitário de `history.test.ts`. */
function buildMessages(
  count: number,
  {
    startIso = "2026-08-01T10:00:00.000Z",
    stepMinutes = 5,
  }: { startIso?: string; stepMinutes?: number } = {}
): HistoryMessage[] {
  const start = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, i) => ({
    sender: i % 2 === 0 ? "lead" : "agente",
    content: `mensagem ${i + 1}`,
    sentAt: new Date(start + i * stepMinutes * 60000).toISOString(),
  }));
}

describe("isSessionExpired (MEM-02 AC3)", () => {
  it("lastInboundAt nulo -> false (conversa nova, sem sessão a purgar)", () => {
    expect(isSessionExpired(null, "2026-08-01T10:00:00.000Z")).toBe(false);
  });

  it("lastInboundAt undefined/vazio -> false (defensivo)", () => {
    expect(isSessionExpired(undefined, "2026-08-01T10:00:00.000Z")).toBe(false);
    expect(isSessionExpired("", "2026-08-01T10:00:00.000Z")).toBe(false);
  });

  it("gap maior que 12h -> true", () => {
    const result = isSessionExpired("2026-08-01T00:00:00.000Z", "2026-08-01T12:00:01.000Z");
    expect(result).toBe(true);
  });

  it("gap exatamente 12h -> false (regra é 'maior que', não 'maior ou igual')", () => {
    const result = isSessionExpired("2026-08-01T00:00:00.000Z", "2026-08-01T12:00:00.000Z");
    expect(result).toBe(false);
  });

  it("gap menor que 12h -> false", () => {
    const result = isSessionExpired("2026-08-01T00:00:00.000Z", "2026-08-01T11:59:00.000Z");
    expect(result).toBe(false);
  });

  it("gapHours customizado é respeitado", () => {
    expect(isSessionExpired("2026-08-01T00:00:00.000Z", "2026-08-01T02:00:01.000Z", 2)).toBe(true);
    expect(isSessionExpired("2026-08-01T00:00:00.000Z", "2026-08-01T01:59:00.000Z", 2)).toBe(false);
  });

  it("datas inválidas -> false (defensivo)", () => {
    expect(isSessionExpired("data-invalida", "2026-08-01T10:00:00.000Z")).toBe(false);
  });
});

describe("selectSeedMessages (MEM-03 AC5)", () => {
  it("lista vazia -> array vazio", () => {
    expect(selectSeedMessages([], "2026-08-01T10:00:00.000Z")).toEqual([]);
  });

  it("undefined/null -> array vazio (defensivo)", () => {
    expect(selectSeedMessages(undefined, "2026-08-01T10:00:00.000Z")).toEqual([]);
    expect(selectSeedMessages(null, "2026-08-01T10:00:00.000Z")).toEqual([]);
  });

  // Teste discriminante (T3 Done-when — prova a remoção do teto de 20,
  // AD-019): 30 mensagens da MESMA sessão (sem gap > 12h entre elas, e sem
  // gap > 12h até `now`) devolvem as 30, não as últimas 20.
  it("30 mensagens da mesma sessão -> devolve as 30 (não corta em 20 — AD-019)", () => {
    const messages = buildMessages(30);
    const now = new Date(
      new Date(messages[29].sentAt).getTime() + 5 * 60000
    ).toISOString();

    const result = selectSeedMessages(messages, now);

    expect(result).toHaveLength(30);
    expect(result[0].content).toBe("mensagem 1");
    expect(result[29].content).toBe("mensagem 30");
  });

  it("corta na sessão corrente: gap de 20h no meio da lista exclui a sessão anterior", () => {
    const messages = buildMessages(10);
    const shifted = messages.map((message, i) => {
      if (i < 6) return message;
      const shiftedTime = new Date(message.sentAt).getTime() + 20 * 60 * 60 * 1000;
      return { ...message, sentAt: new Date(shiftedTime).toISOString() };
    });
    const now = new Date(new Date(shifted[9].sentAt).getTime() + 5 * 60000).toISOString();

    const result = selectSeedMessages(shifted, now);

    expect(result).toHaveLength(4);
    expect(result[0].content).toBe("mensagem 7");
    expect(result[3].content).toBe("mensagem 10");
  });

  it("aplica a salvaguarda de 50 quando a sessão corrente tem mais de 50 mensagens", () => {
    const messages = buildMessages(60);
    const now = new Date(new Date(messages[59].sentAt).getTime() + 5 * 60000).toISOString();

    const result = selectSeedMessages(messages, now);

    expect(result).toHaveLength(50);
    expect(result[0].content).toBe("mensagem 11");
    expect(result[49].content).toBe("mensagem 60");
  });

  it("gap maior que 12h entre a última mensagem real e 'now' -> nenhuma mensagem antiga é trazida", () => {
    const messages = buildMessages(5);
    const now = new Date(
      new Date(messages[4].sentAt).getTime() + 13 * 60 * 60 * 1000
    ).toISOString();

    const result = selectSeedMessages(messages, now);

    expect(result).toEqual([]);
  });

  it("intervalo de EXATAMENTE 12h entre a última mensagem e 'now' NÃO corta (regra 'maior que')", () => {
    const messages = buildMessages(3);
    const now = new Date(
      new Date(messages[2].sentAt).getTime() + 12 * 60 * 60 * 1000
    ).toISOString();

    const result = selectSeedMessages(messages, now);

    expect(result).toHaveLength(3);
  });

  it("maxMessages/sessionGapHours customizados são respeitados", () => {
    const messages = buildMessages(10);
    const now = new Date(new Date(messages[9].sentAt).getTime() + 5 * 60000).toISOString();

    const result = selectSeedMessages(messages, now, { maxMessages: 3 });

    expect(result).toHaveLength(3);
    expect(result.map((m) => m.content)).toEqual(["mensagem 8", "mensagem 9", "mensagem 10"]);
  });
});

/**
 * DEVOLVER-01 AC5/AC6 (lote-14): cada remetente do CRM vira um item da
 * memória do agente. A fala do corretor (`humano`) entra como `system`
 * (tipo confirmado na T1, execução 2802), identificada como escrita pela
 * equipe da imobiliária — nunca como fala do lead (`user`) nem do agente (`ai`).
 */
describe("toSeedMemoryItem (DEVOLVER-01 AC5, AC6)", () => {
  const SENT_AT = "2026-10-01T12:00:00.000Z";

  it("agente -> ai, conteúdo sem alteração", () => {
    expect(toSeedMemoryItem({ sender: "agente", content: "Qual a região?", sentAt: SENT_AT })).toEqual({
      type: "ai",
      message: "Qual a região?",
    });
  });

  it("lead -> user, conteúdo sem alteração", () => {
    expect(toSeedMemoryItem({ sender: "lead", content: "quantas vagas mesmo?", sentAt: SENT_AT })).toEqual({
      type: "user",
      message: "quantas vagas mesmo?",
    });
  });

  it("humano -> system com a atribuição ao autor, byte a byte (AC6)", () => {
    expect(
      toSeedMemoryItem({
        sender: "humano",
        content: "o apartamento da Rua X tem 3 vagas",
        authorName: "Ana Souza",
        sentAt: SENT_AT,
      })
    ).toEqual({
      type: "system",
      message: "Mensagem enviada ao lead por Ana Souza, da equipe da imobiliária: o apartamento da Rua X tem 3 vagas",
    });
  });

  it('humano com authorName nulo -> "alguém da equipe" na atribuição', () => {
    expect(toSeedMemoryItem({ sender: "humano", content: "Oi!", authorName: null, sentAt: SENT_AT })).toEqual({
      type: "system",
      message: "Mensagem enviada ao lead por alguém da equipe, da equipe da imobiliária: Oi!",
    });
  });

  it("remetente desconhecido -> descartado (null)", () => {
    expect(toSeedMemoryItem({ sender: "sistema", content: "x", sentAt: SENT_AT })).toBeNull();
    expect(toSeedMemoryItem({ content: "sem remetente", sentAt: SENT_AT })).toBeNull();
  });

  it("nenhum caminho devolve user para uma mensagem humano (asserção dedicada, AC6)", () => {
    const variants = [
      { authorName: "Ana" },
      { authorName: null },
      { authorName: undefined },
      { authorName: "" },
      { authorName: "Lead" },
    ];
    for (const extra of variants) {
      const item = toSeedMemoryItem({ sender: "humano", content: "texto", sentAt: SENT_AT, ...extra });
      expect(item?.type).toBe("system");
      expect(item?.type).not.toBe("user");
      expect(item?.type).not.toBe("ai");
    }
  });
});
