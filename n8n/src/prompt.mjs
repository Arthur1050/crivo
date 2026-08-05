/**
 * Monta o prompt do turno de conversa (design.md — Camada de decisão;
 * AGT-02, AGT-04, AGT-08). Função pura, sem I/O, sem dependências — roda
 * dentro de um Code node do n8n. O texto produzido aqui é só o INPUT do
 * modelo; a saída do modelo é sempre validada por `validate-llm.mjs` antes
 * de qualquer efeito colateral (AD-014) — este módulo nunca decide nada
 * sozinho.
 */

// Os 8 campos de qualificação rastreados (spec.md — P1 "Qualificação
// conversacional por modalidade" AC2/AC3; Independent Test: "8 campos").
// Rótulos em pt-BR usados no prompt para descrever o que falta coletar.
const QUALIFICATION_FIELD_LABELS = {
  modality: "modalidade de interesse (novo, usado ou ambos)",
  region: "região de interesse",
  budgetCents: "orçamento disponível",
  propertyType: "tipo de imóvel (casa ou apartamento)",
  purchaseHorizon: "horizonte de compra",
  motivation: "motivação (investidor ou morador)",
  creditStatus: "status de crédito (pré-aprovado, recurso próprio ou FGTS)",
  chainedOperation: "se tem imóvel próprio para vender (operação casada)",
};

const WEEKDAY_LABELS_PT = {
  1: "segunda",
  2: "terça",
  3: "quarta",
  4: "quinta",
  5: "sexta",
  6: "sábado",
  7: "domingo",
};

// Instrução de transparência (AGT-08 AC5 / spec.md P1 "Qualificação
// conversacional", AC5): o agente NUNCA nega ser uma IA quando perguntado
// diretamente. Texto fixo e citável — testado por conteúdo, não só por
// presença de alguma menção genérica.
const AI_TRANSPARENCY_INSTRUCTION =
  "Transparência obrigatória: se o lead perguntar diretamente se você é uma inteligência artificial, um robô, ou um assistente automatizado, você NUNCA deve negar — confirme com transparência que sim, você é um agente de atendimento automatizado (IA) desta imobiliária, mantendo o tom cordial da conversa.";

function isFieldFilled(value) {
  return value !== null && value !== undefined && value !== "";
}

/**
 * Campos de qualificação ainda sem valor no lead atual (design.md — AGT-02
 * AC4: a próxima pergunta do agente mira só o que falta, nunca reperguntando
 * o que o lead já respondeu).
 * @param {Record<string, unknown> | null | undefined} lead
 * @returns {string[]} chaves dos campos ainda faltantes
 */
function missingQualificationFields(lead) {
  return Object.keys(QUALIFICATION_FIELD_LABELS).filter(
    (field) => !isFieldFilled(lead?.[field])
  );
}

/**
 * @typedef {{realEstateName?: string, agentName?: string, supportedModality?: string, agentPresentationMessage?: string|null}} PromptSettings
 * @typedef {{name: string, category?: {name: string}|null}} PromptContextDocument
 * @typedef {{text: string}} PromptBufferMessage
 * @typedef {{days: number[], start: string, end: string}} PromptBusinessHours
 */

/**
 * Monta o prompt de um turno de conversa (design.md — Interfaces:
 * `buildPrompt({settings, context, lead, buffer, businessHours})`).
 *
 * @param {{
 *   settings?: PromptSettings | null,
 *   context?: PromptContextDocument[] | null,
 *   lead?: Record<string, unknown> | null,
 *   buffer?: PromptBufferMessage[] | null,
 *   businessHours?: PromptBusinessHours | null,
 * }} input
 * @returns {string}
 */
export function buildPrompt({ settings, context, lead, buffer, businessHours } = {}) {
  const persona = settings ?? {};
  const missingFields = missingQualificationFields(lead);
  const missingLabels = missingFields.map((field) => QUALIFICATION_FIELD_LABELS[field]);

  const days = (businessHours?.days ?? []).map(
    (day) => WEEKDAY_LABELS_PT[day] ?? String(day)
  );
  const contextLines = (context ?? []).map(
    (doc) => `- ${doc.name}${doc.category ? ` (${doc.category.name})` : ""}`
  );
  const bufferLines = (buffer ?? []).map((message) => `- ${message.text}`);

  const sections = [
    `Você é ${persona.agentName || "o assistente virtual"}, agente de atendimento via WhatsApp da imobiliária ${persona.realEstateName || "desta imobiliária"}.`,
    persona.agentPresentationMessage
      ? `Mensagem de apresentação institucional: "${persona.agentPresentationMessage}"`
      : null,
    `Modalidade de imóveis atendida por esta imobiliária: ${persona.supportedModality || "não definida"}.`,
    AI_TRANSPARENCY_INSTRUCTION,
    missingLabels.length > 0
      ? `Campos de qualificação AINDA NÃO preenchidos (pergunte só sobre estes — nunca repita uma pergunta sobre um campo já preenchido): ${missingLabels.join("; ")}.`
      : "Todos os campos de qualificação já estão preenchidos — não pergunte mais sobre eles.",
    days.length > 0 && businessHours
      ? `Horário comercial para propor reuniões: ${days.join(", ")}, das ${businessHours.start} às ${businessHours.end} (horário de Brasília, America/Sao_Paulo).`
      : null,
    contextLines.length > 0
      ? `Documentos de contexto disponíveis:\n${contextLines.join("\n")}`
      : null,
    bufferLines.length > 0
      ? `Últimas mensagens do lead nesta rajada:\n${bufferLines.join("\n")}`
      : null,
  ];

  return sections.filter((section) => section !== null && section !== "").join("\n\n");
}
