/**
 * Decisão determinística do agendamento (lote-8 — ATRIB-02, tasks.md T29).
 * Funções puras, sem I/O, sem dependências — rodam dentro de um Code node do
 * `crivo-tool-agendar-reuniao`.
 *
 * A ordem do sub-workflow foi invertida nesta task: o `PATCH /leads/{id}` do
 * CRM acontece ANTES da criação do evento no Google Calendar. Quem escolhe o
 * corretor é o CRM (AD-022: a regra mora em quem a detém), e o agente nunca
 * vê a lista de candidatos — só quem ficou. Este módulo é a camada que lê a
 * resposta do CRM e decide, sem discrição do modelo:
 *
 * - o CRM confirmou o agendamento? só então o evento é criado;
 * - quem entra como convidado do evento (o e-mail do corretor devolvido);
 * - o que é devolvido ao agente quando o CRM recusa (`sem-corretor-disponivel`,
 *   `conflito-de-agenda` ou qualquer outro `code` do contrato — AD-013);
 * - o `aviso` quando CRM e Calendar divergem, para que estado inconsistente
 *   NUNCA seja silencioso (design.md — Risks & Concerns).
 */

/** Recusa reportada quando o CRM não respondeu com um `code` legível
 * (falha de transporte, corpo vazio, 5xx sem problem+json). */
const RECUSA_PADRAO = "falha-ao-atualizar-crm";

/** Orientação que acompanha cada recusa conhecida do contrato. É o que faz o
 * agente oferecer outro horário em vez de insistir no mesmo. */
const ORIENTACOES = {
  "sem-corretor-disponivel":
    "Nenhum corretor da imobiliária atende nesse horário. A reunião NÃO foi marcada: ofereça outro horário ao lead.",
  "conflito-de-agenda":
    "O corretor desse horário já tem outra reunião marcada. A reunião NÃO foi marcada: ofereça outro horário ao lead.",
};

const ORIENTACAO_PADRAO =
  "Não foi possível registrar a reunião no CRM. NÃO confirme a reunião ao lead e ofereça outro horário.";

const AVISO_EVENTO_AUSENTE =
  "Reunião registrada no CRM, mas o evento no Google Calendar não foi criado — confirme a reunião ao lead, diga que o link do Meet chega em seguida, e sinalize a falha.";

/**
 * @typedef {{name: string, email: string}} Corretor
 */

/**
 * Normaliza o `assignedBroker` devolvido pelo contrato (`{name, email}` —
 * nunca o id interno do usuário). Devolve `null` quando não veio nada
 * aproveitável; mantém o corretor quando só um dos dois campos veio, para não
 * apagar da resposta do agente um responsável que o CRM de fato escolheu.
 * @param {unknown} valor
 * @returns {Corretor | null}
 */
function normalizarCorretor(valor) {
  if (valor === null || typeof valor !== "object") return null;
  const name = typeof valor.name === "string" ? valor.name.trim() : "";
  const email = typeof valor.email === "string" ? valor.email.trim() : "";
  if (name === "" && email === "") return null;
  return { name, email };
}

/**
 * Lê a resposta do `PATCH /leads/{id}` (nó HTTP Request com
 * `fullResponse` + `neverError`, para que o corpo `problem+json` de um 409
 * chegue aqui em vez de virar erro de nó) e decide se o evento pode ser
 * criado.
 *
 * Confirmação exige as duas metades: `200` E `status: "qualificado_agendado"`.
 * Qualquer outra coisa é recusa — inclusive `{error: ...}` de falha de
 * transporte —, e recusa nunca cria evento (ATRIB-02 AC5).
 * @param {unknown} resposta - item de saída do nó HTTP Request
 * @returns {{crmConfirmou: boolean, reason: string | null, corretor: Corretor | null, convidados: string[]}}
 */
export function interpretarPatchAgendamento(resposta) {
  const envelope = resposta !== null && typeof resposta === "object" ? resposta : {};
  const body =
    envelope.body !== null && typeof envelope.body === "object" ? envelope.body : {};
  const statusCode = typeof envelope.statusCode === "number" ? envelope.statusCode : null;

  const confirmado = statusCode === 200 && body.status === "qualificado_agendado";
  if (!confirmado) {
    const code =
      typeof body.code === "string" && body.code.trim() !== ""
        ? body.code.trim()
        : RECUSA_PADRAO;
    return { crmConfirmou: false, reason: code, corretor: null, convidados: [] };
  }

  const corretor = normalizarCorretor(body.assignedBroker);
  return {
    crmConfirmou: true,
    reason: null,
    corretor,
    convidados: corretor !== null && corretor.email !== "" ? [corretor.email] : [],
  };
}

/**
 * Resposta devolvida ao agente quando o CRM recusou o agendamento. Nomeia o
 * motivo (o `code` estável do contrato) e diz o que fazer — nunca falha em
 * silêncio, nunca deixa o agente confirmar uma reunião que não existe.
 * @param {unknown} reason
 * @returns {{ok: false, reason: string, eventoCriado: false, orientacao: string}}
 */
export function montarRecusaAgendamento(reason) {
  const motivo =
    typeof reason === "string" && reason.trim() !== "" ? reason.trim() : RECUSA_PADRAO;
  const orientacao = Object.prototype.hasOwnProperty.call(ORIENTACOES, motivo)
    ? ORIENTACOES[motivo]
    : ORIENTACAO_PADRAO;
  return { ok: false, reason: motivo, eventoCriado: false, orientacao };
}

/**
 * Resposta devolvida ao agente quando o CRM já confirmou o agendamento. O
 * evento no Calendar é o passo que pode faltar agora que a ordem foi
 * invertida: sem `htmlLink`, a reunião existe no CRM e não no Calendar, e o
 * `aviso` reporta essa divergência ao agente (mesmo mecanismo que antes
 * cobria a direção oposta).
 * @param {{meetingAt?: unknown, evento?: unknown, corretor?: unknown}} [entrada]
 * @returns {{ok: true, meetingAt: string | null, meetLink: string | null, corretor: Corretor | null, crmAtualizado: true, eventoCriado: boolean, aviso: string | null}}
 */
export function montarRespostaAgendamento({ meetingAt, evento, corretor } = {}) {
  const eventoObj = evento !== null && typeof evento === "object" ? evento : {};
  const link = typeof eventoObj.htmlLink === "string" ? eventoObj.htmlLink.trim() : "";
  const eventoCriado = link !== "";

  return {
    ok: true,
    meetingAt: typeof meetingAt === "string" && meetingAt !== "" ? meetingAt : null,
    meetLink: eventoCriado ? link : null,
    corretor: normalizarCorretor(corretor),
    crmAtualizado: true,
    eventoCriado,
    aviso: eventoCriado ? null : AVISO_EVENTO_AUSENTE,
  };
}
