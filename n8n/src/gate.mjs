/**
 * Detecção de opt-out + máquina de estados de roteamento da conversa
 * (design.md — Camada de decisão; LGPD-03, AGT-05 AC3, AGT-01). Funções
 * puras, sem I/O, sem dependências — rodam dentro de um Code node do n8n.
 */

// Faixa Unicode dos diacríticos combinantes (U+0300-U+036F) produzidos pela
// decomposição NFD — escrita como escape \uXXXX (não caractere literal) de
// propósito, para o padrão ficar legível e imune a mangling de encoding.
const DIACRITICS_PATTERN = /[̀-ͯ]/g;
const OPT_OUT_KEYWORDS = new Set(["sair", "parar"]);

/**
 * Remove acentos (via decomposição NFD + descarte dos diacríticos
 * combinantes), apara espaços e normaliza para minúsculas — sem depender de
 * nenhuma lib externa.
 * @param {string} text
 * @returns {string}
 */
function foldAccentsAndCase(text) {
  return text.normalize("NFD").replace(DIACRITICS_PATTERN, "").trim().toLowerCase();
}

/**
 * Detecta opt-out (LGPD-03): a mensagem inteira, depois de normalizada
 * (minúsculas, sem acento, sem espaços nas bordas), precisa ser EXATAMENTE
 * "sair" ou "parar" — a palavra isolada, não uma frase que a contém. Isso é
 * deliberado: "quero sair do apartamento" é uma frase sobre o imóvel, não um
 * comando de descadastro, e não pode disparar opt-out (spec.md — LGPD-03,
 * "Done when").
 * @param {unknown} text
 * @returns {boolean}
 */
export function detectOptOut(text) {
  if (typeof text !== "string") return false;
  const normalized = foldAccentsAndCase(text);
  return OPT_OUT_KEYWORDS.has(normalized);
}

/**
 * @typedef {"opt-out" | "somente-registrar" | "midia" | "conversa"} GateRoute
 */

/**
 * Decide a ÚNICA rota de uma mensagem recebida (design.md — Camada de
 * decisão, pipeline passo 7). Precedência, na ordem exata abaixo (cada
 * checagem só é avaliada se as anteriores não decidiram):
 *
 * 1. `optedOutAt` já preenchido (lead opinou por sair numa mensagem
 *    ANTERIOR) vence tudo → 'somente-registrar'. Isso evita reenviar a
 *    confirmação de descadastro (que o contrato exige ser única — LGPD-03
 *    AC1) quando um lead já opted-out manda "sair" de novo, ou qualquer
 *    outra mensagem (LGPD-03 AC3: nunca retoma a conversa automaticamente).
 * 2. Só então o texto é checado: opt-out detectado agora → 'opt-out'
 *    (LGPD-03 AC1 — primeira vez, dispara confirmação única). Vence a
 *    checagem de mídia abaixo (um opt-out em texto nunca é tratado como
 *    mídia).
 * 3. `status === 'escalado_humano'` (humano assumiu) → 'somente-registrar'
 *    (AGT-05 AC3) — vence a checagem de mídia abaixo também.
 * 4. Mídia sem texto (`hasMedia` e nenhum texto) → 'midia' (edge case —
 *    resposta fixa "sigo por texto", sem LLM).
 * 5. Caso contrário → 'conversa' (rota padrão, segue para o LLM).
 *
 * @param {{optedOutAt: unknown, status: unknown, hasMedia: unknown, text: unknown}} input
 * @returns {GateRoute}
 */
export function gate({ optedOutAt, status, hasMedia, text }) {
  if (optedOutAt) return "somente-registrar";
  if (detectOptOut(text)) return "opt-out";
  if (status === "escalado_humano") return "somente-registrar";
  if (hasMedia && !text) return "midia";
  return "conversa";
}
