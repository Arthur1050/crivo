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

// lote-6b — PER-02: `mensagens` substitui `resposta` na whitelist de topo.
// `resposta` não é mais aceita vinda do modelo (campo não whitelisted) —
// ela volta na saída validada só como campo DERIVADO (`mensagens.join(" ")`),
// nunca confiado ao texto do LLM.
const TOP_LEVEL_ALLOWED_KEYS = new Set([
  "acao",
  "campos",
  "mensagens",
  "motivoEscalonamento",
]);

const MIN_MENSAGENS = 1;
const MAX_MENSAGENS = 3;

/**
 * Valida o campo `mensagens` (design.md — § Saída multi-mensagem; PER-02
 * AC1): array de 1 a 3 strings não vazias (após `trim`) — qualquer desvio
 * (não é array, fora da faixa de tamanho, item vazio/não-string) rejeita a
 * saída INTEIRA, mesma regra de rejeição total já estabelecida neste
 * arquivo (AD-014). Nunca uma coerção parcial (ex.: descartar só o item
 * inválido e aceitar o resto).
 * @param {unknown} value
 * @returns {{ok: true, value: string[]} | {ok: false}}
 */
function validateMensagens(value) {
  if (!Array.isArray(value)) return { ok: false };
  if (value.length < MIN_MENSAGENS || value.length > MAX_MENSAGENS) {
    return { ok: false };
  }
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") return { ok: false };
  }
  return { ok: true, value };
}

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
 *   {ok: true, acao: "responder"|"atualizar_campos"|"agendar"|"escalar", campos: LlmCampos, mensagens: string[], resposta: string, motivoEscalonamento?: string}
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

  const mensagensResult = validateMensagens(raw.mensagens);
  if (!mensagensResult.ok) return fail("mensagens-invalida");

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

  // `resposta` é DERIVADA (mensagens.join(" ")), nunca aceita crua do
  // modelo — mantida por compatibilidade com `executiveSummary` de
  // agendamento/escalonamento (design.md — § Saída multi-mensagem; PER-02
  // AC5), que consome um texto único.
  const result = {
    ok: true,
    acao: raw.acao,
    campos,
    mensagens: mensagensResult.value,
    resposta: mensagensResult.value.join(" "),
  };
  if (typeof raw.motivoEscalonamento === "string") {
    result.motivoEscalonamento = raw.motivoEscalonamento;
  }
  return result;
}
