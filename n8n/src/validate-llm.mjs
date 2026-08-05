/**
 * Parse estrito da saída estruturada do LLM (design.md — Camada de decisão;
 * AGT-02/04/08; AD-014 — "efeitos colaterais nunca são decididos
 * autonomamente por LLM sem validação determinística antes"). Função pura,
 * sem I/O — roda dentro de um Code node do n8n.
 *
 * SEGURANÇA (tratar como parte do contrato, não um detalhe de
 * implementação): qualquer campo fora da whitelist, qualquer valor de enum
 * fora do domínio, qualquer data não-ISO, ou um `meetingAtProposto` fora do
 * horário comercial do tenant faz a saída INTEIRA ser rejeitada — nunca uma
 * coerção parcial que deixaria passar parte de uma alucinação.
 */
import { isSlotWithinBusinessHours } from "./business-hours.mjs";

// Enums conferidos 1:1 contra docs/integration/openapi.yaml (fonte de
// verdade) antes de codar — a cópia do design.md é só uma referência de
// conveniência e continha um erro (CreditStatus abaixo).
const ACAO_VALUES = new Set(["responder", "atualizar_campos", "agendar", "escalar"]);
const MODALITY_VALUES = new Set(["novo", "usado", "ambos"]);
const PROPERTY_TYPE_VALUES = new Set(["casa", "apartamento"]);
const MOTIVATION_VALUES = new Set(["investidor", "morador"]);
// ATENÇÃO: openapi.yaml `CreditStatus` tem 3 valores distintos —
// [pre_aprovado, recurso_proprio, fgts] — não 2 como a cópia abreviada do
// design.md sugeria ("recurso_proprio_fgts" fundidos). Fonte de verdade
// conferida: docs/integration/openapi.yaml, schema CreditStatus.
const CREDIT_STATUS_VALUES = new Set(["pre_aprovado", "recurso_proprio", "fgts"]);

const CAMPOS_ALLOWED_KEYS = new Set([
  "modality",
  "region",
  "budgetCents",
  "propertyType",
  "purchaseHorizon",
  "motivation",
  "creditStatus",
  "chainedOperation",
  "leadEmail",
  "meetingAtProposto",
]);

const TOP_LEVEL_ALLOWED_KEYS = new Set([
  "acao",
  "campos",
  "resposta",
  "motivoEscalonamento",
]);

// Mesmo padrão de src/server/integration/parsers.ts (ISO-8601 completo —
// data + hora + timezone); duplicado aqui de propósito porque n8n/src/ não
// pode importar do resto do repo (roda isolado no Code node do n8n).
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(reason) {
  return { ok: false, reason };
}

/**
 * Valida o VALOR de uma chave de `campos` já sabida whitelisted. Retorna
 * `{ok:true, value}` ou `{ok:false}` — nunca tenta converter/coagir um
 * valor fora do formato esperado.
 * @param {string} key
 * @param {unknown} value
 * @param {import('./business-hours.mjs').BusinessHoursSettings | null | undefined} settings
 */
function validateCamposField(key, value, settings) {
  switch (key) {
    case "modality":
      return typeof value === "string" && MODALITY_VALUES.has(value)
        ? { ok: true, value }
        : { ok: false };
    case "propertyType":
      return typeof value === "string" && PROPERTY_TYPE_VALUES.has(value)
        ? { ok: true, value }
        : { ok: false };
    case "motivation":
      return typeof value === "string" && MOTIVATION_VALUES.has(value)
        ? { ok: true, value }
        : { ok: false };
    case "creditStatus":
      return typeof value === "string" && CREDIT_STATUS_VALUES.has(value)
        ? { ok: true, value }
        : { ok: false };
    case "region":
    case "purchaseHorizon":
      return typeof value === "string" && value.trim() !== ""
        ? { ok: true, value }
        : { ok: false };
    case "budgetCents":
      return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? { ok: true, value }
        : { ok: false };
    case "chainedOperation":
      return typeof value === "boolean" ? { ok: true, value } : { ok: false };
    case "leadEmail":
      // Só vai ao Calendar (convite), nunca ao CRM (design.md — Data
      // Models). `null` é um valor válido e explícito aqui (diferente dos
      // demais campos): "o lead não quis convite" — omissão da chave
      // significa "não perguntado ainda", `null` significa "perguntado e
      // recusado".
      return value === null || (typeof value === "string" && value.trim() !== "")
        ? { ok: true, value }
        : { ok: false };
    case "meetingAtProposto": {
      if (typeof value !== "string" || !ISO_DATETIME_PATTERN.test(value)) {
        return { ok: false };
      }
      if (Number.isNaN(new Date(value).getTime())) return { ok: false };
      if (!isSlotWithinBusinessHours(value, settings)) return { ok: false };
      return { ok: true, value };
    }
    default:
      return { ok: false };
  }
}

/**
 * @typedef {{
 *   modality?: "novo"|"usado"|"ambos",
 *   region?: string,
 *   budgetCents?: number,
 *   propertyType?: "casa"|"apartamento",
 *   purchaseHorizon?: string,
 *   motivation?: "investidor"|"morador",
 *   creditStatus?: "pre_aprovado"|"recurso_proprio"|"fgts",
 *   chainedOperation?: boolean,
 *   leadEmail?: string|null,
 *   meetingAtProposto?: string,
 * }} LlmCampos
 */

/**
 * @typedef {
 *   {ok: true, acao: "responder"|"atualizar_campos"|"agendar"|"escalar", campos: LlmCampos, resposta: string, motivoEscalonamento?: string}
 *   | {ok: false, reason: string}
 * } ValidateLlmOutputResult
 */

/**
 * Parse estrito da saída bruta do LLM contra o shape `LlmTurnOutput`
 * (design.md — Data Models). `settings` é o shape de `GET /api/v1/settings`
 * (T3/INT-09) — usado só para validar `campos.meetingAtProposto` contra o
 * horário comercial resolvido do tenant (T7, `isSlotWithinBusinessHours`);
 * `settings` ausente/null cai no fallback seg-sex 9h-18h (mesmo
 * comportamento de `resolveBusinessHours`).
 *
 * @param {unknown} raw - saída do modelo, já parseada de JSON (não texto cru)
 * @param {import('./business-hours.mjs').BusinessHoursSettings | null | undefined} [settings]
 * @returns {ValidateLlmOutputResult}
 */
export function validateLlmOutput(raw, settings) {
  if (!isPlainObject(raw)) return fail("saida-nao-e-objeto");

  for (const key of Object.keys(raw)) {
    if (!TOP_LEVEL_ALLOWED_KEYS.has(key)) return fail(`campo-nao-whitelisted:${key}`);
  }

  if (typeof raw.acao !== "string" || !ACAO_VALUES.has(raw.acao)) {
    return fail("acao-invalida");
  }

  if (typeof raw.resposta !== "string" || raw.resposta.trim() === "") {
    return fail("resposta-invalida");
  }

  if (!isPlainObject(raw.campos)) return fail("campos-invalido");

  /** @type {LlmCampos} */
  const campos = {};
  for (const [key, value] of Object.entries(raw.campos)) {
    if (!CAMPOS_ALLOWED_KEYS.has(key)) return fail(`campo-nao-whitelisted:${key}`);
    const result = validateCamposField(key, value, settings);
    if (!result.ok) return fail(`campo-invalido:${key}`);
    campos[key] = result.value;
  }

  if (raw.acao === "escalar") {
    if (
      typeof raw.motivoEscalonamento !== "string" ||
      raw.motivoEscalonamento.trim() === ""
    ) {
      return fail("motivo-escalonamento-obrigatorio");
    }
  } else if (
    "motivoEscalonamento" in raw &&
    raw.motivoEscalonamento !== undefined &&
    typeof raw.motivoEscalonamento !== "string"
  ) {
    return fail("motivo-escalonamento-invalido");
  }

  const result = { ok: true, acao: raw.acao, campos, resposta: raw.resposta };
  if (typeof raw.motivoEscalonamento === "string") {
    result.motivoEscalonamento = raw.motivoEscalonamento;
  }
  return result;
}
