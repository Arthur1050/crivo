/**
 * Política de campos de qualificação e fase da conversa (design.md —
 * n8n/src/phase.mjs; spec.md QLF-01, QLF-03). Função pura, sem I/O, sem
 * dependências — roda dentro de um Code node do n8n, no mesmo estilo de
 * `gate.mjs`/`business-hours.mjs`.
 */

// 3 campos obrigatórios para agendar (spec.md — QLF-01 AC1, decisão do
// usuário 2026-08-14). "Obrigatório" aqui significa PERGUNTADO uma vez, nunca
// PREENCHIDO — um campo perguntado e não respondido continua marcado como
// perguntado e nunca bloqueia o agendamento (QLF-01 AC6, QLF-02 AC6).
export const REQUIRED_FIELDS = Object.freeze(["modality", "region", "propertyType"]);

// Os outros 5 campos do contrato — nunca perguntados pelo agente; só
// registrados via `registrar_qualificacao` se o lead falar espontaneamente
// (spec.md — QLF-01 AC4/AC5).
export const OPPORTUNISTIC_FIELDS = Object.freeze([
  "budgetCents",
  "purchaseHorizon",
  "motivation",
  "creditStatus",
  "chainedOperation",
]);

// Rótulos pt-BR dos 8 campos de qualificação — copiados de `prompt.mjs`
// (QUALIFICATION_FIELD_LABELS) antes da remoção do módulo em T14 (tasks.md —
// T1 "Reuses"). `phase.mjs` passa a ser o dono canônico da política de
// campos, incluindo os rótulos que `system-message.mjs` (T4) usa para pedir
// no máximo um campo obrigatório por turno.
export const FIELD_LABELS = Object.freeze({
  modality: "modalidade de interesse (novo, usado ou ambos)",
  region: "região de interesse",
  propertyType: "tipo de imóvel (casa ou apartamento)",
  budgetCents: "orçamento disponível",
  purchaseHorizon: "horizonte de compra",
  motivation: "motivação (investidor ou morador)",
  creditStatus: "status de crédito (pré-aprovado, recurso próprio ou FGTS)",
  chainedOperation: "se tem imóvel próprio para vender (operação casada)",
});

/**
 * @typedef {"qualificando" | "agendando"} ConversationPhase
 */

/**
 * Decide a fase da conversa a partir do que já foi PERGUNTADO — nunca do que
 * foi preenchido (spec.md — QLF-01 AC7). A assinatura desta função só aceita
 * a lista de campos já perguntados (nomes, não valores): é estruturalmente
 * incapaz de olhar para valor nenhum, o que garante QLF-01 AC6 (campo
 * perguntado e com valor nulo não bloqueia `agendando`) por construção, não
 * por checagem condicional.
 * @param {string[] | null | undefined} perguntados
 * @returns {ConversationPhase}
 */
export function resolveConversationPhase(perguntados) {
  const asked = new Set(Array.isArray(perguntados) ? perguntados : []);
  const allRequiredAsked = REQUIRED_FIELDS.every((field) => asked.has(field));
  return allRequiredAsked ? "agendando" : "qualificando";
}

/**
 * Próximo campo obrigatório a perguntar, na ordem de `REQUIRED_FIELDS` —
 * nunca um campo oportunista (spec.md — QLF-01 AC4, QLF-02 AC3). `null`
 * quando os 3 já constam em `perguntados`.
 * @param {string[] | null | undefined} perguntados
 * @returns {string | null}
 */
export function nextFieldToAsk(perguntados) {
  const asked = new Set(Array.isArray(perguntados) ? perguntados : []);
  const next = REQUIRED_FIELDS.find((field) => !asked.has(field));
  return next ?? null;
}
