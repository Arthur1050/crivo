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
 * @typedef {{id?: string, sender: "lead"|"agente"|"humano", content: string, sentAt: string, authorName?: string|null}} HistoryMessage
 */

/**
 * revision é a revisão da PONTE lida no frame, independente da revisão do agente.
 * O frame é contexto factual verificado pelo CRM, nunca autorização de envio.
 * @typedef {{state: string, bridgeRevision: number, bridgeInvalidatedAt: string|null,
 * resetObservedAt: string|null, anchorMessageId: string, anchorSentAt: string,
 * originSessionStartMessageId: string, originSessionEndMessageId: string,
 * messageId: string, firstInboundMessageId: string|null, firstInboundSentAt: string|null,
 * bridgeLastInboundAt: string|null}} SessionBridge
 * @typedef {{revision: number, resetRequestedAt: string|null, bridge: SessionBridge|null}} SessionFrame
 */

/**
 * @typedef {{type: "ai"|"user"|"system", message: string}} SeedMemoryItem
 */

const UNKNOWN_AUTHOR = "alguém da equipe";

function validBridge(frame) {
  const bridge = frame?.bridge;
  if (!bridge || bridge.state !== "accepted" || bridge.bridgeInvalidatedAt !== null
      || !Number.isInteger(frame.revision) || frame.revision < 1 || frame.revision !== bridge.bridgeRevision) return null;
  const reset = frame.resetRequestedAt === null ? null : new Date(frame.resetRequestedAt).getTime();
  const observed = bridge.resetObservedAt === null ? null : new Date(bridge.resetObservedAt).getTime();
  if (reset !== observed || (reset !== null && !Number.isFinite(reset))) return null;
  const anchor = new Date(bridge.anchorSentAt).getTime();
  const first = bridge.firstInboundSentAt === null ? NaN : new Date(bridge.firstInboundSentAt).getTime();
  const last = bridge.bridgeLastInboundAt === null ? NaN : new Date(bridge.bridgeLastInboundAt).getTime();
  if (![bridge.anchorMessageId, bridge.originSessionStartMessageId, bridge.originSessionEndMessageId,
    bridge.messageId, bridge.firstInboundMessageId].every((id) => typeof id === "string" && id.length > 0)
      || ![anchor, first, last].every(Number.isFinite) || first <= anchor || first >= anchor + 48 * 3600000
      || last < first || (reset !== null && anchor < reset)) return null;
  return bridge;
}

function orderedMessages(messages) {
  return (Array.isArray(messages) ? messages : []).filter((message) => Number.isFinite(new Date(message.sentAt).getTime()))
    .slice().sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      || (a.id ?? "").localeCompare(b.id ?? ""));
}

function messageBudget(maxMessages) {
  return Number.isFinite(maxMessages) && maxMessages >= 0
    ? Math.min(Math.floor(maxMessages), DEFAULT_MAX_SEED_MESSAGES) : DEFAULT_MAX_SEED_MESSAGES;
}

/** Primeiro inbound vinculado reconstrói também uma memória já aquecida.
 * @param {SessionFrame|null|undefined} frame
 * @param {string[]} [bufferMessageIds]
 */
export function requiresSessionRebuild(frame, bufferMessageIds = []) {
  const bridge = validBridge(frame);
  return !!bridge && bufferMessageIds.includes(bridge.firstInboundMessageId);
}

/** Sessão da âncora e suas respostas; ignora somente o gap externo até preparação.
 * @param {HistoryMessage[]|null|undefined} messages
 * @param {string} anchorMessageId
 * @param {{maxMessages?: number, sessionGapHours?: number}} [options]
 * @returns {HistoryMessage[]}
 */
export function selectOriginSessionMessages(messages, anchorMessageId,
  { maxMessages = DEFAULT_MAX_SEED_MESSAGES, sessionGapHours = DEFAULT_SESSION_GAP_HOURS } = {}) {
  return selectOriginSessionFrame(messages, anchorMessageId, { maxMessages, sessionGapHours })?.messages ?? [];
}

/** Limites factuais não são recortados junto com o conteúdo semeado.
 * @param {HistoryMessage[]|null|undefined} messages
 * @param {string} anchorMessageId
 * @param {{maxMessages?: number, sessionGapHours?: number}} [options]
 * @returns {{startMessageId: string|null, endMessageId: string|null, messages: HistoryMessage[]}|null}
 */
export function selectOriginSessionFrame(messages, anchorMessageId,
  { maxMessages = DEFAULT_MAX_SEED_MESSAGES, sessionGapHours = DEFAULT_SESSION_GAP_HOURS } = {}) {
  const budget = messageBudget(maxMessages);
  const list = orderedMessages(messages);
  const anchor = list.findIndex((message) => message.id === anchorMessageId);
  if (anchor < 0) return null;
  const gapMs = sessionGapHours * 3600000;
  let start = anchor, end = anchor;
  while (start > 0 && new Date(list[start].sentAt).getTime() - new Date(list[start - 1].sentAt).getTime() <= gapMs) start--;
  while (end + 1 < list.length && new Date(list[end + 1].sentAt).getTime() - new Date(list[end].sentAt).getTime() <= gapMs) end++;
  return { startMessageId: list[start].id ?? null, endMessageId: list[end].id ?? null,
    messages: budget === 0 ? [] : list.slice(start, end + 1).slice(-budget) };
}

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
 * @param {{frame?: SessionFrame|null}} [options]
 * @returns {boolean}
 */
export function isSessionExpired(lastInboundAt, now, gapHours = DEFAULT_SESSION_GAP_HOURS, { frame } = {}) {
  const bridge = validBridge(frame);
  if (bridge) lastInboundAt = bridge.bridgeLastInboundAt;
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
 * @param {{maxMessages?: number, sessionGapHours?: number, frame?: SessionFrame|null, excludeMessageIds?: string[]}} [options]
 * @returns {HistoryMessage[]}
 */
export function selectSeedMessages(
  messages,
  now,
  { maxMessages = DEFAULT_MAX_SEED_MESSAGES, sessionGapHours = DEFAULT_SESSION_GAP_HOURS, frame, excludeMessageIds = [] } = {}
) {
  const budget = messageBudget(maxMessages);
  if (budget === 0) return [];
  // O reset do CRM invalida a PONTE (validBridge), não o histórico: sem ponte
  // vale o corte normal de 12h, e a devolução ao agente (AD-034) precisa
  // ressemear a sessão com as falas da equipe anteriores ao pedido de reset.
  const list = orderedMessages(messages);
  if (list.length === 0) return [];

  const gapMs = sessionGapHours * 60 * 60 * 1000;
  const nowMs = new Date(now).getTime();
  let bridge = validBridge(frame);
  const start = list.findIndex((message) => message.id === bridge?.originSessionStartMessageId);
  const end = list.findIndex((message) => message.id === bridge?.originSessionEndMessageId);
  const anchor = list.find((message) => message.id === bridge?.anchorMessageId);
  const resume = list.find((message) => message.id === bridge?.messageId);
  const first = list.find((message) => message.id === bridge?.firstInboundMessageId);
  if (bridge && (start < 0 || end < start || !anchor || !resume || !first
      || anchor.sender !== "lead" || resume.sender !== "agente" || first.sender !== "lead"
      || new Date(anchor.sentAt).getTime() !== new Date(bridge.anchorSentAt).getTime()
      || new Date(first.sentAt).getTime() !== new Date(bridge.firstInboundSentAt).getTime()
      || new Date(list[start].sentAt).getTime() > new Date(anchor.sentAt).getTime()
      || new Date(list[end].sentAt).getTime() < new Date(anchor.sentAt).getTime())) bridge = null;
  if (bridge && isSessionExpired(bridge.bridgeLastInboundAt, now, sessionGapHours)) return [];
  const entryId = bridge ? list[Math.min(list.findIndex((message) => message.id === bridge.messageId),
    list.findIndex((message) => message.id === bridge.firstInboundMessageId))].id : undefined;

  let sessionStart = 0;
  let previousMs = nowMs;
  let previousId;
  for (let i = list.length - 1; i >= 0; i--) {
    const currentMs = new Date(list[i].sentAt).getTime();
    const specialGap = bridge && ((list[i].id === bridge.originSessionEndMessageId && previousId === entryId)
      || (list[i].id === bridge.messageId && previousId === bridge.firstInboundMessageId)
      || (list[i].id === bridge.firstInboundMessageId && previousId === bridge.messageId));
    if (previousMs - currentMs > gapMs && !specialGap) {
      sessionStart = i + 1;
      break;
    }
    previousMs = currentMs;
    previousId = list[i].id;
    if (bridge && i === start) {
      sessionStart = i;
      break;
    }
  }

  const excluded = new Set(excludeMessageIds);
  const session = list.slice(sessionStart).filter((message) => !excluded.has(message.id));
  return session.slice(-budget);
}

/**
 * Converte uma mensagem do CRM no item que a semeadura insere na memória do
 * agente (lote-14 — DEVOLVER-01 AC5, AC6). `agente` → `ai`; `lead` → `user`;
 * `humano` → `system`, com a atribuição ao corretor (tipo confirmado na T1:
 * o `memoryManager` aceita `system` no meio da sessão e o modelo usa o fato).
 * A fala humana nunca entra como `user`: o modelo a leria como fala do lead.
 * Remetente desconhecido é descartado (`null`).
 * @param {Partial<HistoryMessage> & {sender?: unknown}} message
 * @returns {SeedMemoryItem | null}
 */
export function toSeedMemoryItem(message) {
  const content = message.content;
  if (message.sender === "agente") return { type: "ai", message: content };
  if (message.sender === "lead") return { type: "user", message: content };
  if (message.sender === "humano") {
    const name = typeof message.authorName === "string" ? message.authorName.trim() : "";
    const author = name === "" ? UNKNOWN_AUTHOR : name;
    return {
      type: "system",
      message: `Mensagem enviada ao lead por ${author}, da equipe da imobiliária: ${content}`,
    };
  }
  return null;
}
