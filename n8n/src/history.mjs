/**
 * Janela de histórico de conversa para o prompt do agente (design.md — §
 * Histórico no prompt; lote-6b — CTX-01). Função pura, sem I/O, sem
 * dependências — roda dentro de um Code node do n8n, no mesmo estilo de
 * `gate.mjs`/`business-hours.mjs`.
 */

// Janela dupla e cumulativa (context.md — decisão do usuário, 2026-08-10):
// no máximo 20 mensagens, e só as da sessão corrente (corte no primeiro
// intervalo > 12h entre mensagens consecutivas, varrendo de trás pra
// frente).
const DEFAULT_MAX_MESSAGES = 20;
const DEFAULT_SESSION_GAP_HOURS = 12;

/**
 * @typedef {{sender: "lead"|"agente", content: string, sentAt: string}} HistoryMessage
 * @typedef {{window: HistoryMessage[], hasAgentMessage: boolean}} HistoryWindowResult
 */

/**
 * Seleciona a janela de histórico que entra no prompt do turno.
 *
 * ORDEM DE APLICAÇÃO (importa — design.md § Histórico no prompt): primeiro
 * corta a sessão (varre de trás para frente, para no primeiro intervalo >
 * `sessionGapHours` entre duas mensagens consecutivas), DEPOIS aplica o
 * teto de `maxMessages` sobre o que sobrou da sessão corrente. Inverter a
 * ordem (teto primeiro, corte de sessão depois) produziria uma janela que
 * atravessa o intervalo de sessão — exatamente o que a janela existe para
 * evitar.
 *
 * `hasAgentMessage` é derivado DA JANELA resultante, nunca da lista inteira
 * (CTX-01 AC4; spec.md — Edge Cases "reengajamento após dias"): decide se a
 * primeira mensagem do turno pode se apresentar, ou se a conversa já está
 * em andamento dentro da janela considerada.
 *
 * @param {HistoryMessage[] | null | undefined} messages - em ordem cronológica crescente (mais antiga primeiro)
 * @param {{maxMessages?: number, sessionGapHours?: number}} [options]
 * @returns {HistoryWindowResult}
 */
export function selectHistoryWindow(
  messages,
  { maxMessages = DEFAULT_MAX_MESSAGES, sessionGapHours = DEFAULT_SESSION_GAP_HOURS } = {}
) {
  const list = Array.isArray(messages) ? messages : [];

  if (list.length === 0) {
    return { window: [], hasAgentMessage: false };
  }

  const gapMs = sessionGapHours * 60 * 60 * 1000;

  // Corte de sessão: varre de trás para frente; `sessionStart` é o índice da
  // primeira mensagem da sessão corrente. Sem nenhum intervalo grande o
  // bastante, a sessão é a lista inteira (sessionStart = 0).
  let sessionStart = 0;
  for (let i = list.length - 1; i > 0; i--) {
    const current = new Date(list[i].sentAt).getTime();
    const previous = new Date(list[i - 1].sentAt).getTime();
    if (current - previous > gapMs) {
      sessionStart = i;
      break;
    }
  }

  const session = list.slice(sessionStart);

  // Teto aplicado DEPOIS do corte de sessão, sobre o que sobrou dela —
  // pega as mensagens mais RECENTES da sessão corrente.
  const window =
    session.length > maxMessages ? session.slice(session.length - maxMessages) : session;

  return {
    window,
    hasAgentMessage: window.some((message) => message.sender === "agente"),
  };
}
