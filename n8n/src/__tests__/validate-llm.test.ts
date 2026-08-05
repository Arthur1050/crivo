import { describe, expect, it } from "vitest";
import { validateLlmOutput } from "../validate-llm.mjs";
import llmValidAtualizarCampos from "../../fixtures/llm-valid-atualizar-campos.json";
import llmValidAgendar from "../../fixtures/llm-valid-agendar.json";
import llmInvalidEnum from "../../fixtures/llm-invalid-enum.json";
import llmHallucinatedField from "../../fixtures/llm-hallucinated-field.json";
import llmInvalidDate from "../../fixtures/llm-invalid-date.json";
import llmInvalidOutsideHours from "../../fixtures/llm-invalid-outside-hours.json";

const FALLBACK_SETTINGS = null; // resolveBusinessHours(null) -> fallback seg-sex 9h-18h

describe("validateLlmOutput — saídas válidas (fixtures)", () => {
  it("aceita uma saída válida de atualizar_campos e preserva os campos extraídos", () => {
    const result = validateLlmOutput(llmValidAtualizarCampos, FALLBACK_SETTINGS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.acao).toBe("atualizar_campos");
    expect(result.campos).toEqual({
      modality: "usado",
      region: "Abadia, Uberaba",
      budgetCents: 45000000,
      propertyType: "apartamento",
    });
    expect(result.resposta).toBe(llmValidAtualizarCampos.resposta);
  });

  it("aceita uma saída válida de agendar com meetingAtProposto dentro do horário comercial (fallback)", () => {
    const result = validateLlmOutput(llmValidAgendar, FALLBACK_SETTINGS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.acao).toBe("agendar");
    expect(result.campos.meetingAtProposto).toBe("2026-08-10T12:00:00.000Z");
  });

  it("aceita acao=responder com campos vazio (turno sem extração)", () => {
    const result = validateLlmOutput(
      { acao: "responder", campos: {}, resposta: "Pode me contar mais sobre o que procura?" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({
      ok: true,
      acao: "responder",
      campos: {},
      resposta: "Pode me contar mais sobre o que procura?",
    });
  });

  it("acao=escalar com motivoEscalonamento preenchido é aceito e o motivo é preservado", () => {
    const result = validateLlmOutput(
      {
        acao: "escalar",
        campos: {},
        resposta: "Vou te transferir para um dos nossos corretores.",
        motivoEscalonamento: "Lead hostil, respostas incoerentes reiteradas.",
      },
      FALLBACK_SETTINGS
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.motivoEscalonamento).toBe(
      "Lead hostil, respostas incoerentes reiteradas."
    );
  });
});

describe("validateLlmOutput — rejeita enum fora do contrato (fixture da armadilha do design.md)", () => {
  it("creditStatus='recurso_proprio_fgts' é rejeitado — não existe no enum real (openapi.yaml tem 3 valores separados)", () => {
    const result = validateLlmOutput(llmInvalidEnum, FALLBACK_SETTINGS);
    expect(result).toEqual({ ok: false, reason: "campo-invalido:creditStatus" });
  });

  it("os 3 valores REAIS de creditStatus são aceitos individualmente", () => {
    for (const value of ["pre_aprovado", "recurso_proprio", "fgts"]) {
      const result = validateLlmOutput(
        { acao: "atualizar_campos", campos: { creditStatus: value }, resposta: "ok" },
        FALLBACK_SETTINGS
      );
      expect(result.ok).toBe(true);
    }
  });

  it("modality fora do enum é rejeitado", () => {
    const result = validateLlmOutput(
      { acao: "atualizar_campos", campos: { modality: "novissimo" }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:modality" });
  });

  it("propertyType fora do enum é rejeitado", () => {
    const result = validateLlmOutput(
      { acao: "atualizar_campos", campos: { propertyType: "kitnet" }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:propertyType" });
  });

  it("motivation fora do enum é rejeitado", () => {
    const result = validateLlmOutput(
      { acao: "atualizar_campos", campos: { motivation: "curioso" }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:motivation" });
  });

  it("acao fora do enum é rejeitado (não é campo de 'campos', é o nível superior)", () => {
    const result = validateLlmOutput(
      { acao: "deletar_lead", campos: {}, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "acao-invalida" });
  });
});

describe("validateLlmOutput — rejeita alucinação (campo fora da whitelist)", () => {
  it("campo hallucinado dentro de 'campos' (creditScore) rejeita a saída inteira, mesmo com os outros campos válidos", () => {
    const result = validateLlmOutput(llmHallucinatedField, FALLBACK_SETTINGS);
    expect(result).toEqual({ ok: false, reason: "campo-nao-whitelisted:creditScore" });
  });

  it("campo hallucinado no nível superior (fora de 'campos') também rejeita", () => {
    const result = validateLlmOutput(
      {
        acao: "responder",
        campos: {},
        resposta: "ok",
        confiancaDoModelo: 0.98,
      },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({
      ok: false,
      reason: "campo-nao-whitelisted:confiancaDoModelo",
    });
  });
});

describe("validateLlmOutput — rejeita data não-ISO e slot fora do horário comercial", () => {
  it("meetingAtProposto sem hora (data pura, não ISO-8601 completo) é rejeitado", () => {
    const result = validateLlmOutput(llmInvalidDate, FALLBACK_SETTINGS);
    expect(result).toEqual({ ok: false, reason: "campo-invalido:meetingAtProposto" });
  });

  it("meetingAtProposto fora do horário comercial (domingo, fora do fallback seg-sex) é rejeitado", () => {
    const result = validateLlmOutput(llmInvalidOutsideHours, FALLBACK_SETTINGS);
    expect(result).toEqual({ ok: false, reason: "campo-invalido:meetingAtProposto" });
  });

  it("meetingAtProposto dentro da configuração customizada do tenant é aceito", () => {
    const settings = {
      meetingDays: [6],
      meetingHoursStart: "10:00",
      meetingHoursEnd: "12:00",
    };
    // sábado 10:00 local = 13:00 UTC (verificado em business-hours.test.ts)
    const result = validateLlmOutput(
      {
        acao: "agendar",
        campos: { meetingAtProposto: "2026-08-15T13:00:00.000Z" },
        resposta: "ok",
      },
      settings
    );
    expect(result.ok).toBe(true);
  });

  it("meetingAtProposto fora da configuração customizada do tenant (dia não permitido) é rejeitado", () => {
    const settings = {
      meetingDays: [6],
      meetingHoursStart: "10:00",
      meetingHoursEnd: "12:00",
    };
    // segunda-feira não está em meetingDays:[6]
    const result = validateLlmOutput(
      {
        acao: "agendar",
        campos: { meetingAtProposto: "2026-08-10T13:30:00.000Z" },
        resposta: "ok",
      },
      settings
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:meetingAtProposto" });
  });
});

describe("validateLlmOutput — estrutura obrigatória (nada 'passa limpo' por coerção)", () => {
  it("rejeita quando a raiz não é um objeto (string, array, null, number)", () => {
    expect(validateLlmOutput("string qualquer", FALLBACK_SETTINGS)).toEqual({
      ok: false,
      reason: "saida-nao-e-objeto",
    });
    expect(validateLlmOutput([], FALLBACK_SETTINGS)).toEqual({
      ok: false,
      reason: "saida-nao-e-objeto",
    });
    expect(validateLlmOutput(null, FALLBACK_SETTINGS)).toEqual({
      ok: false,
      reason: "saida-nao-e-objeto",
    });
    expect(validateLlmOutput(42, FALLBACK_SETTINGS)).toEqual({
      ok: false,
      reason: "saida-nao-e-objeto",
    });
  });

  it("rejeita quando 'acao' está ausente", () => {
    const result = validateLlmOutput(
      { campos: {}, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "acao-invalida" });
  });

  it("rejeita quando 'resposta' está ausente ou vazia", () => {
    expect(
      validateLlmOutput({ acao: "responder", campos: {} }, FALLBACK_SETTINGS)
    ).toEqual({ ok: false, reason: "resposta-invalida" });
    expect(
      validateLlmOutput(
        { acao: "responder", campos: {}, resposta: "   " },
        FALLBACK_SETTINGS
      )
    ).toEqual({ ok: false, reason: "resposta-invalida" });
  });

  it("rejeita quando 'campos' está ausente ou não é um objeto", () => {
    expect(
      validateLlmOutput({ acao: "responder", resposta: "ok" }, FALLBACK_SETTINGS)
    ).toEqual({ ok: false, reason: "campos-invalido" });
    expect(
      validateLlmOutput(
        { acao: "responder", campos: "nao-e-objeto", resposta: "ok" },
        FALLBACK_SETTINGS
      )
    ).toEqual({ ok: false, reason: "campos-invalido" });
    expect(
      validateLlmOutput(
        { acao: "responder", campos: [], resposta: "ok" },
        FALLBACK_SETTINGS
      )
    ).toEqual({ ok: false, reason: "campos-invalido" });
  });

  it("acao=escalar SEM motivoEscalonamento é rejeitado", () => {
    const result = validateLlmOutput(
      { acao: "escalar", campos: {}, resposta: "Transferindo você." },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "motivo-escalonamento-obrigatorio" });
  });

  it("acao=escalar com motivoEscalonamento em branco é rejeitado", () => {
    const result = validateLlmOutput(
      {
        acao: "escalar",
        campos: {},
        resposta: "Transferindo você.",
        motivoEscalonamento: "   ",
      },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "motivo-escalonamento-obrigatorio" });
  });

  it("budgetCents como string (não number) é rejeitado — o contrato do prompt exige number", () => {
    const result = validateLlmOutput(
      { acao: "atualizar_campos", campos: { budgetCents: "45000000" }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:budgetCents" });
  });

  it("budgetCents negativo é rejeitado", () => {
    const result = validateLlmOutput(
      { acao: "atualizar_campos", campos: { budgetCents: -100 }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:budgetCents" });
  });

  it("budgetCents não-inteiro é rejeitado", () => {
    const result = validateLlmOutput(
      { acao: "atualizar_campos", campos: { budgetCents: 100.5 }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:budgetCents" });
  });

  it("chainedOperation como string 'true' (não boolean) é rejeitado", () => {
    const result = validateLlmOutput(
      { acao: "atualizar_campos", campos: { chainedOperation: "true" }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:chainedOperation" });
  });

  it("chainedOperation=false é aceito (boolean válido, não confundido com ausência)", () => {
    const result = validateLlmOutput(
      { acao: "atualizar_campos", campos: { chainedOperation: false }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.campos.chainedOperation).toBe(false);
  });

  it("leadEmail=null é aceito (recusa explícita do convite — nunca vai ao CRM)", () => {
    const result = validateLlmOutput(
      { acao: "agendar", campos: { leadEmail: null }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.campos.leadEmail).toBeNull();
  });

  it("leadEmail como string vazia é rejeitado (use null para 'recusou', não '')", () => {
    const result = validateLlmOutput(
      { acao: "agendar", campos: { leadEmail: "" }, resposta: "ok" },
      FALLBACK_SETTINGS
    );
    expect(result).toEqual({ ok: false, reason: "campo-invalido:leadEmail" });
  });
});
