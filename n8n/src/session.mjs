/**
 * Expiração de sessão e semeadura da memória (design.md — n8n/src/session.mjs;
 * spec.md MEM-02, MEM-03). Funções puras, sem I/O, sem dependências — rodam
 * dentro de um Code node do n8n. Absorve o corte de sessão de `history.mjs`
 * (o teto de 20 mensagens é removido — AD-019: sem teto de política, só a
 * salvaguarda alta de 50).
 */

const DEFAULT_SESSION_GAP_HOURS = 12;
const DEFAULT_MAX_SEED_MESSAGES = 50;

/**
 * @typedef {{sender: "lead"|"agente", content: string, sentAt: string}} HistoryMessage
 */

/**
 * Decide se a sessão expirou: o intervalo entre a mensagem atual (`now`) e a
 * última mensagem RECEBIDA da sessão (`lastInboundAt`) é maior que
 * `gapHours` (spec.md — MEM-02 AC3). `lastInboundAt` nulo significa
 * conversa nova, sem sessão nenhuma a purgar — nunca `true` (tasks.md — T3
 * Done-when). O limite é estritamente "maior que", não "maior ou igual"
 * (mesma convenção de `history.mjs`/`business-hours.mjs`): exatamente 12h de
 * intervalo NÃO expira a sessão.
 * @param {string | null | undefined} lastInboundAt
 * @param {string} now
 * @param {number} [gapHours]
 * @returns {boolean}
 */
export function isSessionExpired(lastInboundAt, now, gapHours = DEFAULT_SESSION_GAP_HOURS) {
  if (lastInboundAt === null || lastInboundAt === undefined || lastInboundAt === "") {
    return false;
  }

  const last = new Date(lastInboundAt).getTime();
  const current = new Date(now).getTime();
  if (Number.isNaN(last) || Number.isNaN(current)) return false;

  const gapMs = gapHours * 60 * 60 * 1000;
  return current - last > gapMs;
}

/**
 * Seleciona, dentre as mensagens do CRM, as que pertencem à sessão CORRENTE
 * para semear a memória em cold start (spec.md — MEM-03 AC5). Varre de trás
 * para frente comparando intervalos consecutivos — incluindo `now` como um
 * ponto de corte adicional ao final da lista: se já existe um intervalo
 * maior que `sessionGapHours` entre a última mensagem real e o instante
 * atual, nenhuma mensagem antiga é trazida (a sessão já teria sido purgada
 * por `isSessionExpired` antes deste passo — este cálculo apenas não
 * pressupõe essa ordem). Depois do corte de sessão, aplica só a salvaguarda
 * de `maxMessages` (default 50) — NUNCA o antigo teto de 20 (AD-019).
 * @param {HistoryMessage[] | null | undefined} messages - ordem cronológica crescente (mais antiga primeiro)
 * @param {string} now
 * @param {{maxMessages?: number, sessionGapHours?: number}} [options]
 * @returns {HistoryMessage[]}
 */
export function selectSeedMessages(
  messages,
  now,
  { maxMessages = DEFAULT_MAX_SEED_MESSAGES, sessionGapHours = DEFAULT_SESSION_GAP_HOURS } = {}
) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length === 0) return [];

  const gapMs = sessionGapHours * 60 * 60 * 1000;
  const nowMs = new Date(now).getTime();

  let sessionStart = 0;
  let previousMs = nowMs;
  for (let i = list.length - 1; i >= 0; i--) {
    const currentMs = new Date(list[i].sentAt).getTime();
    if (previousMs - currentMs > gapMs) {
      sessionStart = i + 1;
      break;
    }
    previousMs = currentMs;
  }

  const session = list.slice(sessionStart);
  return session.length > maxMessages ? session.slice(session.length - maxMessages) : session;
}
