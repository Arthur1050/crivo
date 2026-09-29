/**
 * Opt-out em linguagem natural (lote-13 — design.md, módulo
 * `n8n/src/opt-out-intent.mjs`; spec.md OPTMSG-01, OPTREG-01, OPTAMB-01).
 * Funções puras, sem I/O, sem dependências — rodam dentro de um Code node do
 * n8n. Este arquivo inteiro entra na identidade do classificador
 * (`scripts/opt-out-measurement.ts`): mudar qualquer texto daqui exige nova
 * medição aprovada.
 */

/** Confirmação única dos dois caminhos de opt-out (OPTMSG-01 AC1, AC2). */
export const OPT_OUT_CONFIRMATION =
  "Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!";

/**
 * Falha do registro por linguagem natural (OPTREG-01 AC7): orienta a palavra
 * exata sem afirmar que as mensagens pararam (AC10).
 */
export const OPT_OUT_REGISTRATION_FAILED =
  "Não consegui registrar seu pedido agora. Para encerrar, responda com a palavra sair, sozinha.";

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyText(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Última mensagem de autoria do agente na sessão corrente.
 *
 * `loaded` é a saída de `Chat Memory Manager: carregar sessão`
 * (`{ messages, messagesCount }`, formato registrado na T1, execução 2598):
 * cada elemento agrupa mensagens consecutivas por autoria; `ai` string é a
 * fala do agente, `ai: []` é uma chamada de tool sem texto (ignorada),
 * `human` é o lead e `tool` é o resultado de tool.
 *
 * `seeded` são os itens de `Code: selecionar mensagens de semeadura`:
 * `{ type: 'user'|'ai', message, nadaParaSemear: false }` ou o sentinela
 * `{ nadaParaSemear: true }`.
 *
 * Precedência: uma carga não vazia É a sessão corrente, e a semeadura é
 * ignorada (mesmo que a carga não tenha fala do agente). A semeadura só vale
 * quando a carga veio vazia. Ausente (undefined/null) conta como vazio.
 * Sessão vazia → `null` (é o caso do "sim" depois do corte de 12h).
 *
 * @param {{ loaded?: { messages?: unknown } | null, seeded?: unknown }} input
 * @returns {string | null}
 */
export function lastAgentMessage({ loaded, seeded } = {}) {
  const messages = Array.isArray(loaded?.messages) ? loaded.messages : [];
  if (messages.length > 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const ai = messages[i]?.ai;
      if (isNonEmptyText(ai)) return ai;
    }
    return null;
  }

  const items = Array.isArray(seeded) ? seeded : [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.nadaParaSemear === true) continue;
    if (item?.type === "ai" && isNonEmptyText(item.message)) return item.message;
  }
  return null;
}

/**
 * Texto que o classificador lê (OPTREG-01 AC2: só a mensagem do turno e a
 * última mensagem enviada). `userMessage` aceita o texto pronto ou a lista de
 * textos do buffer do turno, unida por quebra de linha, como o `userMessage`
 * do agente (`principal.ts`, `buffer.map((m) => m.text).join('\n')`).
 *
 * @param {{ lastAgentMessage?: string | null, userMessage?: string | string[] | null }} input
 * @returns {string}
 */
export function buildClassifierInput({ lastAgentMessage, userMessage } = {}) {
  const last = isNonEmptyText(lastAgentMessage) ? lastAgentMessage : "(nenhuma)";
  const text = Array.isArray(userMessage) ? userMessage.join("\n") : (userMessage ?? "");
  return `Última mensagem enviada ao lead: ${last}\nMensagem do lead: ${text}`;
}

/**
 * Minúsculas, sem acento, espaços colapsados. A lista do buffer vira um texto
 * só, unido por quebra de linha, como em `buildClassifierInput`.
 *
 * @param {string | string[] | null | undefined} userMessage
 * @returns {string}
 */
function normalizeUserMessage(userMessage) {
  const text = Array.isArray(userMessage) ? userMessage.join("\n") : (userMessage ?? "");
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "parar/para/pare/parem de [me/nos] mandar|enviar <objeto>". */
const STOP_SENDING_OBJECT = /\b(?:parar|para|pare|parem) de (?:(?:me|nos) )?(?:mandar|enviar) \S/;

/** Menção ao contato em si: com qualquer uma delas, o pedido não é só de conteúdo. */
const CONTACT_MENTION = /mensag|msg|contat|lista|descadastr|nada|whatsapp/;

/** "mensagem de voz" é formato (como áudio), não o contato em si. */
const VOICE_MESSAGE = /mensage(?:m|ns) de (?:voz|audio)/g;

/**
 * Pedido para parar de mandar só um conteúdo, formato ou filtro de busca
 * ("para de mandar casa, eu quero apartamento"), sem menção ao contato em si.
 * Trava determinística depois do classificador (T12d, decisão D3): a medição
 * v3 deixou falsos positivos aleatórios exatamente nesse formato.
 *
 * @param {string | string[] | null | undefined} userMessage
 * @returns {boolean}
 */
export function isContentOnlyStop(userMessage) {
  const text = normalizeUserMessage(userMessage);
  if (!STOP_SENDING_OBJECT.test(text)) return false;
  return !CONTACT_MENTION.test(text.replace(VOICE_MESSAGE, ""));
}

/**
 * Categoria final do turno: `explicita` com pedido só de conteúdo vira
 * `ambigua` (o agente pergunta em vez de descadastrar). Qualquer outra
 * categoria passa inalterada.
 *
 * @param {{ categoria?: string, userMessage?: string | string[] | null }} input
 * @returns {string | undefined}
 */
export function refineOptOutCategory({ categoria, userMessage } = {}) {
  if (categoria === "explicita" && isContentOnlyStop(userMessage)) return "ambigua";
  return categoria;
}
