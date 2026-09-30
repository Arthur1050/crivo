import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as systemMessageModule from "../system-message.mjs";
import { buildSystemMessage } from "../system-message.mjs";

/**
 * Orientação de opt-out no system message depois da decisão D11 do lote-13
 * (2026-09-30). A pergunta "você quer parar de receber mensagens?" para o lead
 * desinteressado soava como convite para sair e foi removida: só o pedido
 * explícito é tratado como pedido de opt-out, e desinteresse, recusa, número
 * errado ou "para de mandar foto" seguem como conversa normal.
 *
 * O baseline (`n8n/fixtures/system-message-baseline.json`) é a saída de
 * `buildSystemMessage` depois da D11 para entradas fixas. Protege o texto
 * porque `benchmark-contexto.ts` inlina o mesmo módulo.
 */
type Case = { nome: string; input: NonNullable<Parameters<typeof buildSystemMessage>[0]>; esperado: string };
const baseline: { casos: Case[] } = JSON.parse(readFileSync("n8n/fixtures/system-message-baseline.json", "utf8"));

const input = { settings: { realEstateName: "Triângulo Imóveis", agentName: "Marina" }, phase: "qualificando" as const };
const message = buildSystemMessage(input);

describe("buildSystemMessage — texto fixo depois da D11", () => {
  it("o baseline cobre as entradas fixas", () => {
    expect(baseline.casos.map((c) => c.nome)).toEqual([
      "minimo",
      "primeiro-turno-qualificando",
      "qualificando-com-perguntados",
      "agendando-sem-reuniao",
      "agendando-com-reuniao",
    ]);
  });

  it.each(baseline.casos.map((c) => [c.nome, c] as const))("%s: byte a byte o baseline", (_nome, c) => {
    expect(buildSystemMessage(c.input)).toBe(c.esperado);
  });

  it("um flag `optOutAmbiguo` legado não muda o texto", () => {
    for (const c of baseline.casos) {
      expect(buildSystemMessage({ ...c.input, optOutAmbiguo: true } as Case["input"])).toBe(c.esperado);
    }
  });
});

describe("sem pergunta de confirmação para o lead desinteressado (D11)", () => {
  it("o módulo não exporta mais a instrução da faixa ambígua", () => {
    expect("OPT_OUT_AMBIGUOUS_INSTRUCTION" in systemMessageModule).toBe(false);
  });

  it("o system message não manda perguntar se o lead quer parar de receber mensagens", () => {
    expect(message).not.toMatch(/pergunte[^.]*se ele quer parar de receber mensagens/i);
    expect(message).toMatch(/sem perguntar se ele quer parar de receber mensagens/);
  });
});

describe("orientação 'responda sair' só para o pedido explícito (L-012, uma subcláusula por teste)", () => {
  it("vale só quando o lead pede explicitamente para parar de receber mensagens", () => {
    expect(message).toMatch(/Só trate como pedido quando o lead pedir explicitamente para parar de receber mensagens/);
  });

  it("continua orientando a palavra sair, sozinha", () => {
    expect(message).toMatch(/basta ele responder com a palavra sair — sozinha, sem mais nada/);
  });

  it("desinteresse, recusa, número errado e pedido só de conteúdo não são pedido", () => {
    expect(message).toMatch(
      /Desinteresse, recusa de uma opção, número errado ou pedido para parar de mandar só um tipo de conteúdo NÃO são pedido para parar de receber mensagens/
    );
  });

  it("nesses casos, responde normalmente sem mencionar a palavra sair", () => {
    expect(message).toMatch(/responda normalmente, sem mencionar a palavra sair/);
  });

  it("não trata mais engano nem falta de interesse como pedido", () => {
    expect(message).not.toMatch(/disse que foi engano, que não tem interesse/);
  });
});
