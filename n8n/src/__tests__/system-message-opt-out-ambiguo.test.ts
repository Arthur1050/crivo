import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPT_OUT_AMBIGUOUS_INSTRUCTION, buildSystemMessage } from "../system-message.mjs";

/**
 * Pergunta de confirmação da faixa ambígua (lote-13 T5 — OPTAMB-01 AC1,
 * OPTDOC-01 AC2). A instrução só entra no turno classificado como ambíguo.
 *
 * O baseline (`n8n/fixtures/system-message-baseline.json`) é a saída de
 * `buildSystemMessage` na revisão 0a5cb47, ANTES desta tarefa, para entradas
 * fixas. Com `optOutAmbiguo` ausente o texto tem de ser byte a byte o mesmo:
 * `benchmark-contexto.ts` inlina este módulo sem o parâmetro novo.
 */
type Case = { nome: string; input: Parameters<typeof buildSystemMessage>[0]; esperado: string };
const baseline: { casos: Case[] } = JSON.parse(readFileSync("n8n/fixtures/system-message-baseline.json", "utf8"));

const GUIDANCE = /basta ele responder com a palavra sair — sozinha, sem mais nada/;
const input = { settings: { realEstateName: "Triângulo Imóveis", agentName: "Marina" }, phase: "qualificando" as const };

describe("buildSystemMessage — instrução da faixa ambígua (OPTAMB-01)", () => {
  it("com optOutAmbiguo: true, contém a instrução", () => {
    expect(buildSystemMessage({ ...input, optOutAmbiguo: true })).toContain(OPT_OUT_AMBIGUOUS_INSTRUCTION);
  });

  it("com optOutAmbiguo: false, não contém a instrução", () => {
    expect(buildSystemMessage({ ...input, optOutAmbiguo: false })).not.toContain(OPT_OUT_AMBIGUOUS_INSTRUCTION);
  });

  it("com optOutAmbiguo ausente, não contém a instrução (L-005)", () => {
    expect(buildSystemMessage(input)).not.toContain(OPT_OUT_AMBIGUOUS_INSTRUCTION);
  });

  it("com optOutAmbiguo: true, a única diferença é a seção nova", () => {
    for (const { input: fixed, esperado } of baseline.casos) {
      const message = buildSystemMessage({ ...fixed, optOutAmbiguo: true });
      expect(message.replace(`\n\n${OPT_OUT_AMBIGUOUS_INSTRUCTION}`, "")).toBe(esperado);
    }
  });
});

describe("buildSystemMessage — sem o parâmetro, texto idêntico ao de antes da T5", () => {
  it("o baseline cobre as entradas fixas", () => {
    expect(baseline.casos.map((c) => c.nome)).toEqual([
      "minimo",
      "primeiro-turno-qualificando",
      "qualificando-com-perguntados",
      "agendando-sem-reuniao",
      "agendando-com-reuniao",
    ]);
  });

  it.each(baseline.casos.map((c) => [c.nome, c] as const))("%s: ausente é byte a byte o baseline", (_nome, c) => {
    expect(buildSystemMessage(c.input)).toBe(c.esperado);
  });

  it.each(baseline.casos.map((c) => [c.nome, c] as const))("%s: false é byte a byte o baseline", (_nome, c) => {
    expect(buildSystemMessage({ ...c.input, optOutAmbiguo: false })).toBe(c.esperado);
  });
});

describe("buildSystemMessage — a orientação 'responda sair' continua como rede (OPTDOC-01 AC2)", () => {
  it("presente no turno ambíguo", () => {
    expect(buildSystemMessage({ ...input, optOutAmbiguo: true })).toMatch(GUIDANCE);
  });

  it("presente no turno não ambíguo", () => {
    expect(buildSystemMessage({ ...input, optOutAmbiguo: false })).toMatch(GUIDANCE);
  });
});

describe("OPT_OUT_AMBIGUOUS_INSTRUCTION — cada subcláusula (L-012)", () => {
  it("pede UMA frase", () => {
    expect(OPT_OUT_AMBIGUOUS_INSTRUCTION).toMatch(/em UMA frase/);
  });

  it("pergunta se o lead quer parar de receber mensagens por este número", () => {
    expect(OPT_OUT_AMBIGUOUS_INSTRUCTION).toMatch(/pergunte[^.]*se ele quer parar de receber mensagens por este número/i);
  });

  it("proíbe insistir", () => {
    expect(OPT_OUT_AMBIGUOUS_INSTRUCTION).toMatch(/Não insista/);
  });

  it("proíbe prometer que vai parar ou dizer que já parou", () => {
    expect(OPT_OUT_AMBIGUOUS_INSTRUCTION).toMatch(/NUNCA prometa que vai parar nem diga que já parou/);
  });

  it("proíbe puxar outro assunto", () => {
    expect(OPT_OUT_AMBIGUOUS_INSTRUCTION).toMatch(/não puxe outro assunto/i);
  });
});
