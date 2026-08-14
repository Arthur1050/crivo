/**
 * Barreiras determinísticas de persona (design.md — n8n/src/voice.mjs;
 * spec.md VOZ-01, VOZ-02). Funções puras, sem I/O, sem dependências — rodam
 * dentro de um Code node do n8n, aplicadas pelo sub-workflow
 * `tool-responder-lead` ANTES de qualquer envio ao lead.
 */

// Faixa Unicode dos diacríticos combinantes (U+0300-U+036F) produzidos pela
// decomposição NFD — mesma técnica de `gate.mjs:10`, reimplementada aqui de
// propósito (tasks.md — T2 "Reuses": `n8n/src/` já adota duplicação
// deliberada entre módulos, para manter cada arquivo independente dentro do
// Code node em que roda).
const DIACRITICS_PATTERN = /[̀-ͯ]/g;

/**
 * Remove acentos, apara espaços e normaliza para minúsculas.
 * @param {string} text
 * @returns {string}
 */
function foldAccentsAndCase(text) {
  return text.normalize("NFD").replace(DIACRITICS_PATTERN, "").trim().toLowerCase();
}

// Interjeições de aprovação isoladas que abriram quase todo turno na
// conversa real de 2026-08-13 ("Show." 4×, "Boa." 3×, "Entendido.") — spec.md
// VOZ-01 AC1.
export const BANNED_OPENINGS = new Set(["show", "boa", "perfeito", "entendido", "otimo", "legal"]);

// Primeiro caractere de pontuação forte que delimita a "abertura" de uma
// mensagem — o que vem antes dele é a interjeição/locução de abertura; o
// resto é o conteúdo da mensagem.
const OPENING_PUNCTUATION_PATTERN = /[.,!?;:]/;

/**
 * Extrai e normaliza a abertura de uma mensagem: tudo antes da primeira
 * pontuação forte (ou a mensagem inteira, se não houver pontuação), sem
 * acento, minúscula, aparada (design.md — `extractOpening`). "Show." e
 * "show" colidem no mesmo valor normalizado (tasks.md — T2 Done-when).
 * @param {unknown} mensagem
 * @returns {string}
 */
export function extractOpening(mensagem) {
  if (typeof mensagem !== "string") return "";
  const punctuationIndex = mensagem.search(OPENING_PUNCTUATION_PATTERN);
  const head = punctuationIndex === -1 ? mensagem : mensagem.slice(0, punctuationIndex);
  return foldAccentsAndCase(head);
}

/**
 * @typedef {{ok: true}} VoiceCheckOk
 * @typedef {{ok: false, reason: "abertura-proibida" | "abertura-repetida"}} OpeningCheckFail
 * @typedef {{ok: false, reason: "promessa-fora-de-capacidade"}} CapabilityCheckFail
 */

/**
 * Rejeita a abertura da PRIMEIRA mensagem do turno se ela for uma
 * interjeição de aprovação isolada (VOZ-01 AC1) ou se coincidir com a
 * abertura de qualquer turno anterior da mesma sessão (VOZ-01 AC2). Turno
 * sem mensagem alguma passa (nada para checar).
 * @param {string[] | null | undefined} mensagens
 * @param {string[] | null | undefined} aberturasAnteriores
 * @returns {VoiceCheckOk | OpeningCheckFail}
 */
export function checkOpening(mensagens, aberturasAnteriores) {
  const list = Array.isArray(mensagens) ? mensagens : [];
  const first = list[0];
  if (typeof first !== "string" || first.length === 0) {
    return { ok: true };
  }

  const opening = extractOpening(first);

  if (BANNED_OPENINGS.has(opening)) {
    return { ok: false, reason: "abertura-proibida" };
  }

  const previous = Array.isArray(aberturasAnteriores) ? aberturasAnteriores : [];
  if (previous.includes(opening)) {
    return { ok: false, reason: "abertura-repetida" };
  }

  return { ok: true };
}

// Verbos de intenção futura que, combinados com "vou" e um alvo da lista
// abaixo, caracterizam a promessa de uma capacidade que o agente nunca teve
// (spec.md — VOZ-02 AC3: buscar/enviar/mandar/puxar/separar imóvel, opção,
// foto ou valor). Deliberadamente NÃO inclui verbos neutros como
// "anotar"/"confirmar" — "vou anotar aqui" e "vou confirmar com o corretor"
// são exatamente os dois contraexemplos do T2 Done-when que NÃO podem ser
// rejeitados (discriminação — não pode ser um regex guloso).
const CAPABILITY_VERBS = ["buscar", "enviar", "mandar", "puxar", "separar"];

// Alvos que, junto de um verbo de intenção acima, fecham a promessa de
// capacidade inexistente.
const CAPABILITY_TARGETS = [
  "imovel",
  "imoveis",
  "opcao",
  "opcoes",
  "foto",
  "fotos",
  "valor",
  "valores",
  "apartamento",
  "apartamentos",
  "casa",
  "casas",
  "preco",
  "precos",
];

/**
 * @param {string} mensagem
 * @returns {boolean}
 */
function promisesCapability(mensagem) {
  const folded = foldAccentsAndCase(mensagem);
  const hasIntentVerb = CAPABILITY_VERBS.some((verb) => {
    // Até 40 caracteres entre "vou" e o verbo cobrem modificadores como "te",
    // "aqui", "agora mesmo" sem deixar o regex casar frases longas demais.
    const pattern = new RegExp(`\\bvou\\b[^.!?]{0,40}?\\b${verb}\\b`);
    return pattern.test(folded);
  });
  if (!hasIntentVerb) return false;

  return CAPABILITY_TARGETS.some((target) => folded.includes(target));
}

/**
 * Rejeita o turno inteiro se QUALQUER uma das mensagens prometer buscar,
 * enviar, mandar, puxar ou separar imóveis, opções, fotos ou valores
 * (spec.md — VOZ-02 AC3) — capacidade que o agente nunca teve.
 * @param {string[] | null | undefined} mensagens
 * @returns {VoiceCheckOk | CapabilityCheckFail}
 */
export function checkCapabilityPromise(mensagens) {
  const list = Array.isArray(mensagens) ? mensagens : [];
  const violated = list.some(
    (mensagem) => typeof mensagem === "string" && promisesCapability(mensagem)
  );

  if (violated) {
    return { ok: false, reason: "promessa-fora-de-capacidade" };
  }

  return { ok: true };
}
