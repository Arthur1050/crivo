import { describe, expect, it } from "vitest";
import { isSessionExpired, selectSeedMessages, selectOriginSessionMessages, requiresSessionRebuild, toSeedMemoryItem } from "../session.mjs";

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

describe("REEN-04: ponte restrita e reconstrução de sessão (T24)", () => {
  const hour = 3600000;
  const anchorAt = Date.parse("2026-10-01T10:00:00.000Z");
  const at = (hours: number, ms = 0) => new Date(anchorAt + hours * hour + ms).toISOString();
  const msg = (id: string, hours: number, sender: HistoryMessage["sender"] = "lead", ms = 0): HistoryMessage =>
    ({ id, sender, content: id, sentAt: at(hours, ms) });
  const source = [msg("old", -20), msg("source-start", -1, "humano"), msg("anchor", 0), msg("source-end", 1, "agente")];
  const history = [...source, msg("resume", 22, "agente"), msg("first", 40)];
  const frame = {
    revision: 3, resetRequestedAt: null,
    bridge: {
      state: "accepted", bridgeRevision: 3, bridgeInvalidatedAt: null, resetObservedAt: null,
      anchorMessageId: "anchor", anchorSentAt: at(0), originSessionStartMessageId: "source-start",
      originSessionEndMessageId: "source-end", messageId: "resume", firstInboundMessageId: "first",
      firstInboundSentAt: at(40), bridgeLastInboundAt: at(40),
    },
  };
  const ids = (rows: HistoryMessage[]) => rows.map((row) => row.id);

  it("preparação recupera somente segmento que contém âncora e respostas, sem corte até now", () => {
    expect(ids(selectOriginSessionMessages(source, "anchor"))).toEqual(["source-start", "anchor", "source-end"]);
    expect(selectOriginSessionMessages(source, "missing")).toEqual([]);
  });

  it("warm e cold compartilham frame: primeira resposta força reconstrução da mesma memória", () => {
    expect(isSessionExpired(at(0), at(40), 12, { frame })).toBe(false);
    expect(requiresSessionRebuild(frame, ["first"])).toBe(true);
    const cold = selectSeedMessages(history, at(40), { frame, excludeMessageIds: ["first"] }).map(toSeedMemoryItem);
    const warm = requiresSessionRebuild(frame, ["first"])
      ? selectSeedMessages(history, at(40), { frame, excludeMessageIds: ["first"] }).map(toSeedMemoryItem)
      : [{ type: "user", message: "memória antiga" }];
    expect(cold).toEqual([
      { type: "system", message: "Mensagem enviada ao lead por alguém da equipe, da equipe da imobiliária: source-start" },
      { type: "user", message: "anchor" }, { type: "ai", message: "source-end" }, { type: "ai", message: "resume" },
    ]);
    expect(warm).toEqual(cold);
    expect(requiresSessionRebuild(frame, ["next"])).toBe(false);
  });

  it.each([50, 51])("salvaguarda mantém últimas 50 de %i mensagens da sessão ligada", (count) => {
    const tail = Array.from({ length: count - 5 }, (_, i) => msg(`tail-${String(i).padStart(2, "0")}`, 40, "lead", i + 1));
    const rows = selectSeedMessages([...history, ...tail], at(40, 100), { frame });
    expect(rows).toHaveLength(50);
    expect(ids(rows)).toEqual(ids([...history.slice(count === 51 ? 2 : 1), ...tail]));
  });

  it.each([[0, 0], [NaN, 50], [7, 7], [80, 50]])("orçamento %s mantém teto seguro em ambos os seletores", (budget, expected) => {
    const rows = buildMessages(60).map((row, i) => ({ ...row, id: `row-${i}` }));
    const wanted = expected === 0 ? [] : rows.slice(-expected);
    expect(selectSeedMessages(rows, rows[59].sentAt, { maxMessages: budget })).toEqual(wanted);
    expect(selectOriginSessionMessages(rows, "row-30", { maxMessages: budget })).toEqual(wanted);
  });

  it("ordena por sentAt/id sem alterar array recebido", () => {
    const rows = [...history, msg("z", 41), msg("a", 41)].reverse();
    const original = [...rows];
    expect(ids(selectSeedMessages(rows, at(41), { frame }))).toEqual(["source-start", "anchor", "source-end", "resume", "first", "a", "z"]);
    expect(rows).toEqual(original);
  });

  it("12h exatas do último inbound mantém origem; 12h+1ms expira e corta toda sessão", () => {
    expect(isSessionExpired(at(0), at(52), 12, { frame })).toBe(false);
    expect(ids(selectSeedMessages(history, at(52), { frame }))).toEqual(ids(history.slice(1)));
    expect(isSessionExpired(at(0), at(52, 1), 12, { frame })).toBe(true);
    expect(selectSeedMessages(history, at(52, 1), { frame })).toEqual([]);
  });

  it.each([[-1, true], [0, false], [1, false]])("primeira resposta em 48h%+ims respeita limite exclusivo", (ms, valid) => {
    const first = msg("first", 48, "lead", ms);
    const boundaryFrame = { ...frame, bridge: { ...frame.bridge, firstInboundSentAt: first.sentAt, bridgeLastInboundAt: first.sentAt } };
    expect(isSessionExpired(at(0), first.sentAt, 12, { frame: boundaryFrame })).toBe(!valid);
    expect(requiresSessionRebuild(boundaryFrame, ["first"])).toBe(valid);
    expect(ids(selectSeedMessages([...history.slice(0, -1), first], first.sentAt, { frame: boundaryFrame })))
      .toEqual(valid ? ids(history.slice(1)) : ["first"]);
  });

  it("não perdoa gap entre origem e mensagem de outro episódio", () => {
    const other = msg("other-episode", 20, "agente");
    expect(ids(selectSeedMessages([...history, other], at(40), { frame }))).toEqual(["other-episode", "resume", "first"]);
  });

  it("não perdoa gaps posteriores à primeira resposta", () => {
    const next = msg("next", 53);
    const advanced = { ...frame, bridge: { ...frame.bridge, bridgeLastInboundAt: next.sentAt } };
    expect(ids(selectSeedMessages([...history, next], next.sentAt, { frame: advanced }))).toEqual(["next"]);
  });

  it("reset vigente elimina contexto antigo e revisão anterior não força reconstrução", () => {
    const reset = { ...frame, resetRequestedAt: at(39) };
    expect(isSessionExpired(at(0), at(40), 12, { frame: reset })).toBe(true);
    expect(ids(selectSeedMessages(history, at(40), { frame: reset }))).toEqual(["first"]);
    expect(requiresSessionRebuild(reset, ["first"])).toBe(false);
  });

  it.each(["revision", "invalidated"])("ponte %s inválida preserva regra normal sem reconstrução", (kind) => {
    const stale = kind === "revision" ? { ...frame, revision: 4 }
      : { ...frame, bridge: { ...frame.bridge, bridgeInvalidatedAt: at(39) } };
    expect(isSessionExpired(at(0), at(40), 12, { frame: stale })).toBe(true);
    expect(ids(selectSeedMessages(history, at(40), { frame: stale }))).toEqual(["first"]);
    expect(requiresSessionRebuild(stale, ["first"])).toBe(false);
  });

  it("exclui todos os IDs do buffer depois do corte sem romper ligação", () => {
    expect(ids(selectSeedMessages([...history, msg("next", 41)], at(41), { frame, excludeMessageIds: ["first", "next"] })))
      .toEqual(["source-start", "anchor", "source-end", "resume"]);
  });

  it("histórico apagado não reaparece nem perdoa referência ausente", () => {
    expect(ids(selectSeedMessages(history.filter((row) => row.id !== "source-end"), at(40), { frame }))).toEqual(["first"]);
    expect(selectSeedMessages([], at(40), { frame })).toEqual([]);
  });

  it("sessão retomada ativa continua após 48h e expira pelo último inbound real", () => {
    const next = msg("next", 50);
    const advanced = { ...frame, bridge: { ...frame.bridge, bridgeLastInboundAt: next.sentAt } };
    expect(isSessionExpired(at(0), at(62), 12, { frame: advanced })).toBe(false);
    expect(ids(selectSeedMessages([...history, next], at(62), { frame: advanced }))).toEqual([...ids(history.slice(1)), "next"]);
    expect(isSessionExpired(at(0), at(62, 1), 12, { frame: advanced })).toBe(true);
    expect(selectSeedMessages([...history, next], at(62, 1), { frame: advanced })).toEqual([]);
  });

  it("saída recente não mantém ponte quando último inbound ultrapassou 12h", () => {
    expect(isSessionExpired(at(0), at(53), 12, { frame })).toBe(true);
    expect(selectSeedMessages([...history, msg("later-outbound", 52, "agente")], at(53), { frame })).toEqual([]);
  });

  it("revisão do agente avança sem invalidar a revisão independente da ponte", () => {
    const advanced = { ...frame, agentStateRevision: 99 };
    expect(isSessionExpired(at(0), at(40), 12, { frame: advanced })).toBe(false);
    expect(ids(selectSeedMessages(history, at(40), { frame: advanced }))).toEqual(ids(history.slice(1)));
  });

  it("sem ponte aceita ou com datas não finitas não presume continuidade", () => {
    const bad = { ...frame, bridge: { ...frame.bridge, firstInboundSentAt: "invalid" } };
    const pending = { ...frame, bridge: { ...frame.bridge, state: "uncertain" } };
    for (const invalid of [bad, pending]) {
      expect(isSessionExpired(at(0), at(40), 12, { frame: invalid })).toBe(true);
      expect(ids(selectSeedMessages(history, at(40), { frame: invalid }))).toEqual(["first"]);
      expect(requiresSessionRebuild(invalid, ["first"])).toBe(false);
    }
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
    // @ts-expect-error remetente fora do contrato, de propósito
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
