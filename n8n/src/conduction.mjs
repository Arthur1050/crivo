/**
 * Regra única de condução da conversa (lote-14 — design.md C2; AD-034).
 * Funções puras, sem I/O, sem dependências: rodam inline nos Code nodes do
 * n8n e são importadas pelo CRM (`src/lib/conversation-control.ts`), para que
 * a regra "quem conduz" tenha uma fonte só.
 */

/**
 * @typedef {{status?: unknown, humanTakeoverAt?: unknown, optedOutAt?: unknown}} ConductionLead
 */

/**
 * Conduzido por humano: tem a marca de condução humana **ou** está em
 * `escalado_humano` (ASSUMIR-01 AC7).
 * @param {ConductionLead} lead
 * @returns {boolean}
 */
export function isHumanConducted({ status, humanTakeoverAt }) {
  return Boolean(humanTakeoverAt) || status === "escalado_humano";
}

/**
 * O agente pode enviar dentro do turno em andamento (SILENCIO-01 AC4)?
 * Olha só a marca e o opt-out. **Nunca** bloqueia por `escalado_humano`: o
 * agente que acabou de escalar ainda precisa enviar a mensagem de passagem
 * (`system-message.mjs`).
 * @param {ConductionLead} lead
 * @returns {boolean}
 */
export function canAgentSendInTurn({ optedOutAt, humanTakeoverAt }) {
  return !optedOutAt && !humanTakeoverAt;
}

/**
 * O agente pode iniciar contato sem mensagem do lead (reengajamento,
 * escalonamento por silêncio — SILENCIO-01 AC6/AC7)?
 * @param {ConductionLead} lead
 * @returns {boolean}
 */
export function canAgentContactProactively(lead) {
  return !lead.optedOutAt && !isHumanConducted(lead);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isAbsent(value) {
  return value === null || value === undefined || value === "";
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function toTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" && typeof value !== "number") return Number.NaN;
  return new Date(value).getTime();
}

/**
 * O pedido de reconstrução da memória ainda não foi atendido? Devido só
 * quando o pedido é **estritamente** mais novo que o último atendido: pedido
 * igual ao atendido já foi consumido (DEVOLVER-01 AC7). Data inválida nunca
 * dispara a purga.
 * @param {unknown} requestedAt - `memoryResetRequestedAt` do lead no CRM
 * @param {unknown} honoredAt - `memoryResetAt` de `conversa_estado` no n8n
 * @returns {boolean}
 */
export function memoryResetDue(requestedAt, honoredAt) {
  if (isAbsent(requestedAt)) return false;
  const requested = toTime(requestedAt);
  if (Number.isNaN(requested)) return false;
  if (isAbsent(honoredAt)) return true;
  const honored = toTime(honoredAt);
  if (Number.isNaN(honored)) return false;
  return requested > honored;
}
