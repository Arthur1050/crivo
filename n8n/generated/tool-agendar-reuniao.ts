/**
 * crivo-tool-agendar-reuniao — sub-workflow tool `agendar_reuniao` (T8).
 *
 * Compõe disponibilidade + criação do evento no Google Calendar + `PATCH`
 * do CRM + fila de lembrete numa unidade só (design.md — Components:
 * "Sub-workflow crivo-tool-agendar-reuniao"; "Por que 3 tools nativas e 2
 * sub-workflows"). Chamado pelo nó AI Agent (T11) via `toolWorkflow`.
 * Requisito: AGN-03.
 *
 * Contrato de entrada (`Execute Workflow Trigger`): `meetingAtProposto` é o
 * único campo preenchido pelo modelo (fromAi, no wiring do T11). Todo o
 * resto — `tenantSlug`, `waId`, `leadId`, `calendarId`,
 * `contactName`, `meetingDays`, `meetingHoursStart`, `meetingHoursEnd` —
 * vem de expressão do fluxo (o `HTTP: GET /settings` e o contexto do lead
 * já resolvidos em `principal.ts` antes do agente rodar), NUNCA de
 * `$fromAI` (mesmo risco de escrita cross-lead do design.md — Risks &
 * Concerns).
 *
 * AD-018 (tool boundary): horário fora do expediente ou ocupado DEGRADA —
 * devolve ao agente uma sugestão/motivo nomeado, nunca falha em silêncio, e
 * nunca cria efeito colateral (evento/PATCH) sem a checagem determinística
 * ter passado.
 *
 * SEM FUNÇÕES CUSTOMIZADAS no nível deste arquivo (mesma regra de
 * `principal.ts`/`tool-responder-lead.ts` — confirmada pelo
 * `validate_workflow` do MCP).
 */
import { workflow, node, trigger, ifElse, newCredential, expr } from "@n8n/workflow-sdk";

const CRM_BASE_URL = "https://crivo-arthur1050s-projects.vercel.app/api/v1";
const AGENDA_ENVIOS_TABLE_ID = "m83dxX8YZYg1NDYq";

const scheduleTrigger = trigger({
  type: "n8n-nodes-base.executeWorkflowTrigger",
  version: 1.2,
  config: {
    name: "Execute Workflow Trigger",
    position: [0, 0],
    parameters: {
      inputSource: "workflowInputs",
      workflowInputs: {
        values: [
          { name: "meetingAtProposto", type: "string" },
          { name: "tenantSlug", type: "string" },
          { name: "waId", type: "string" },
          { name: "leadId", type: "string" },
          { name: "calendarId", type: "string" },
          { name: "contactName", type: "string" },
          { name: "meetingDays", type: "array" },
          { name: "meetingHoursStart", type: "string" },
          { name: "meetingHoursEnd", type: "string" },
        ],
      },
    },
  },
  output: [
    {
      meetingAtProposto: "2026-08-17T13:00:00.000Z",
      tenantSlug: "imobiliaria-a",
      waId: "553499532444",
      leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      calendarId: "exemplo@group.calendar.google.com",
      contactName: "Lead Exemplo",
      meetingDays: [1, 2, 3, 4, 5],
      meetingHoursStart: "09:00",
      meetingHoursEnd: "18:00",
    },
  ],
});

const checkBusinessHours = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: checar horario comercial",
    position: [260, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "/**\n * Horário comercial do tenant + janela de 24h da Meta (design.md — Camada de\n * decisão; AGT-04, AGT-06). Funções puras, sem I/O, sem dependências — rodam\n * dentro de um Code node do n8n. Toda conversão de timezone usa\n * `Intl.DateTimeFormat` nativo (nenhuma lib de datas é necessária).\n */\n\n// Timezone fixa do produto no piloto (design.md — Tech Decisions: \"100%\n// Uberaba/MG; TZ por tenant é productização futura\").\nconst TIMEZONE = \"America/Sao_Paulo\";\n\n// Fallback seg-sex 9h-18h quando o tenant não configurou horário comercial\n// (design.md — resolveBusinessHours; guia-integracao.md §8). ISO 1(segunda)\n// a 7(domingo), mesma convenção do schema (`tenants.meeting_days`).\nconst FALLBACK_DAYS = [1, 2, 3, 4, 5];\nconst FALLBACK_START = \"09:00\";\nconst FALLBACK_END = \"18:00\";\n\n/**\n * @typedef {{meetingDays: number[]|null, meetingHoursStart: string|null, meetingHoursEnd: string|null}} BusinessHoursSettings\n * @typedef {{days: number[], start: string, end: string}} ResolvedBusinessHours\n */\n\n/**\n * Resolve o horário comercial efetivo do tenant (T3 — `GET /api/v1/settings`\n * shape). Os 3 campos são configurados como uma unidade só pelo CRM\n * (CONF-05 AC3: `validateBusinessHours` exige dias + início + fim juntos, ou\n * nada) — então qualquer um deles ausente/vazio aqui é tratado como\n * \"horário comercial não configurado\" e cai no fallback INTEIRO seg-sex\n * 9h-18h, nunca uma mistura parcial de default + configurado.\n *\n * @param {BusinessHoursSettings | null | undefined} settings\n * @returns {ResolvedBusinessHours}\n */\nfunction resolveBusinessHours(settings) {\n  const days = settings?.meetingDays;\n  const start = settings?.meetingHoursStart;\n  const end = settings?.meetingHoursEnd;\n\n  if (!Array.isArray(days) || days.length === 0 || !start || !end) {\n    return { days: FALLBACK_DAYS, start: FALLBACK_START, end: FALLBACK_END };\n  }\n\n  return { days, start, end };\n}\n\nconst ISO_WEEKDAY_BY_SHORT_NAME = {\n  Mon: 1,\n  Tue: 2,\n  Wed: 3,\n  Thu: 4,\n  Fri: 5,\n  Sat: 6,\n  Sun: 7,\n};\n\n/**\n * Extrai o dia da semana ISO (1=segunda..7=domingo) e o horário \"HH:MM\" de\n * um instante, na timezone informada.\n * @param {Date} date\n * @param {string} timeZone\n * @returns {{isoWeekday: number|undefined, time: string}}\n */\nfunction localDayAndTime(date, timeZone) {\n  const parts = new Intl.DateTimeFormat(\"en-US\", {\n    timeZone,\n    weekday: \"short\",\n    hour: \"2-digit\",\n    minute: \"2-digit\",\n    hour12: false,\n  }).formatToParts(date);\n\n  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));\n  const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[map.weekday];\n  // Alguns motores ICU renderizam meia-noite como \"24\" em vez de \"00\" com\n  // hour12:false — normalizado defensivamente (não observado no runtime\n  // testado, mas o custo de checar é zero e a correção aqui é crítica para\n  // não deixar o agente agendar fora do horário real).\n  const hour = map.hour === \"24\" ? \"00\" : map.hour;\n  return { isoWeekday, time: `${hour}:${map.minute}` };\n}\n\n/**\n * Verifica se um horário proposto (`meetingAtProposto`, ISO-8601) cai dentro\n * do horário comercial resolvido do tenant (design.md — AGT-04): dia da\n * semana permitido E horário dentro de `[start, end)`, na timezone\n * `America/Sao_Paulo` (fixa no produto).\n *\n * Escolha explícita de limite (documentada e testada): o início (`start`) é\n * INCLUSIVO — um slot exatamente às `start` é aceito; o fim (`end`) é\n * EXCLUSIVO — um slot exatamente às `end` (ex.: 18:00 quando `end=\"18:00\"`)\n * é REJEITADO, porque a reunião começaria no instante em que o atendimento\n * já fechou.\n *\n * @param {string} isoDateTime - horário proposto, ISO-8601 com timezone\n * @param {BusinessHoursSettings | null | undefined} settings\n * @returns {boolean}\n */\nfunction isSlotWithinBusinessHours(isoDateTime, settings) {\n  const date = new Date(isoDateTime);\n  if (Number.isNaN(date.getTime())) return false;\n\n  const { days, start, end } = resolveBusinessHours(settings);\n  const { isoWeekday, time } = localDayAndTime(date, TIMEZONE);\n\n  if (isoWeekday === undefined || !days.includes(isoWeekday)) return false;\n  return time >= start && time < end;\n}\n\nconst TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;\n\n/**\n * Verifica se `now` está dentro da janela de 24h da Meta, contada a partir\n * da última mensagem RECEBIDA do lead (`lastInboundAt`) — regra da Cloud\n * API: mensagens proativas fora dessa janela exigem template pré-aprovada\n * (design.md — Tech Decisions). Janela FECHADA à direita e por decisão\n * explícita (documentada e testada): exatamente 24h decorridas já conta\n * como FORA da janela (`diff < 24h`, estrito) — mais seguro exigir template\n * do que arriscar um texto livre que a Meta rejeite por estar,\n * tecnicamente, no limite. `now` anterior a `lastInboundAt` (relógio/dado\n * inconsistente) é tratado defensivamente como FORA da janela.\n *\n * @param {string} lastInboundAt - ISO-8601\n * @param {string} now - ISO-8601\n * @returns {boolean}\n */\nfunction isWithin24h(lastInboundAt, now) {\n  const last = new Date(lastInboundAt);\n  const current = new Date(now);\n  if (Number.isNaN(last.getTime()) || Number.isNaN(current.getTime())) return false;\n\n  const diffMs = current.getTime() - last.getTime();\n  return diffMs >= 0 && diffMs < TWENTY_FOUR_HOURS_MS;\n}" +
        "\n\n" +
        "const trigger = $json;\n" +
        "const settings = { meetingDays: trigger.meetingDays, meetingHoursStart: trigger.meetingHoursStart, meetingHoursEnd: trigger.meetingHoursEnd };\n" +
        "const within = isSlotWithinBusinessHours(trigger.meetingAtProposto, settings);\n" +
        "const resolved = resolveBusinessHours(settings);\n" +
        "return [{ json: { ...trigger, withinBusinessHours: within, resolvedDays: resolved.days, resolvedStart: resolved.start, resolvedEnd: resolved.end } }];\n",
    },
  },
  output: [
    {
      meetingAtProposto: "2026-08-17T13:00:00.000Z",
      tenantSlug: "imobiliaria-a",
      waId: "553499532444",
      leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      calendarId: "exemplo@group.calendar.google.com",
      contactName: "Lead Exemplo",
      withinBusinessHours: true,
      resolvedDays: [1, 2, 3, 4, 5],
      resolvedStart: "09:00",
      resolvedEnd: "18:00",
    },
  ],
});

const isWithinBusinessHours = ifElse({
  version: 2.3,
  config: {
    name: "Dentro do horario comercial?",
    position: [520, 0],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.withinBusinessHours }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

const outsideBusinessHoursResponse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: fora do horario comercial (sugestao)",
    position: [780, 200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "return [{ json: {\n" +
        "  ok: false,\n" +
        "  reason: 'fora-do-horario-comercial',\n" +
        "  diasPermitidos: $json.resolvedDays,\n" +
        "  horarioInicio: $json.resolvedStart,\n" +
        "  horarioFim: $json.resolvedEnd,\n" +
        "} }];\n",
    },
  },
  output: [{ ok: false, reason: "fora-do-horario-comercial", diasPermitidos: [1, 2, 3, 4, 5], horarioInicio: "09:00", horarioFim: "18:00" }],
});

const checkAvailability = node({
  type: "n8n-nodes-base.googleCalendar",
  version: 1.3,
  config: {
    name: "Google Calendar: availability",
    position: [780, -200],
    parameters: {
      resource: "calendar",
      operation: "availability",
      calendar: { __rl: true, mode: "id", value: expr("{{ $json.calendarId }}") },
      timeMin: expr("{{ $json.meetingAtProposto }}"),
      timeMax: expr("{{ DateTime.fromISO($json.meetingAtProposto).plus({ minutes: 30 }).toISO() }}"),
    },
    credentials: { googleCalendarOAuth2Api: newCredential("Google Calendar account") },
  },
  output: [{ available: true }],
});

const isAvailable = ifElse({
  version: 2.3,
  config: {
    name: "Horario disponivel?",
    position: [1040, -200],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.available }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

const unavailableResponse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: horario ocupado",
    position: [1300, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return [{ json: { ok: false, reason: 'horario-ocupado' } }];\n",
    },
  },
  output: [{ ok: false, reason: "horario-ocupado" }],
});

const createEvent = node({
  type: "n8n-nodes-base.googleCalendar",
  version: 1.3,
  config: {
    name: "Google Calendar: criar evento (Meet)",
    position: [1300, -400],
    parameters: {
      resource: "event",
      operation: "create",
      calendar: { __rl: true, mode: "id", value: expr("{{ $('Code: checar horario comercial').first().json.calendarId }}") },
      start: expr("{{ $('Code: checar horario comercial').first().json.meetingAtProposto }}"),
      end: expr("{{ DateTime.fromISO($('Code: checar horario comercial').first().json.meetingAtProposto).plus({ minutes: 30 }).toISO() }}"),
      additionalFields: {
        summary: expr("{{ 'Reunião com ' + $('Code: checar horario comercial').first().json.contactName }}"),
        conferenceDataUi: { conferenceDataValues: { conferenceSolution: "hangoutsMeet" } },
      },
    },
    credentials: { googleCalendarOAuth2Api: newCredential("Google Calendar account") },
  },
  output: [{ id: "evt123", htmlLink: "https://calendar.google.com/event?eid=evt123", start: { dateTime: "2026-08-17T13:00:00.000Z" } }],
});

const patchLeadScheduled = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: PATCH /leads/{id} (agendado)",
    position: [1560, -400],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    // AD-018: falha aqui NUNCA é silenciada — o Code final abaixo checa o
    // shape da resposta e reporta ao agente com o meetLink de qualquer
    // jeito (Done-when: "Falha no PATCH após o evento criado é reportada
    // ao agente com o meetLink, nunca silenciada").
    onError: "continueRegularOutput",
    parameters: {
      method: "PATCH",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: checar horario comercial').first().json.leadId }}`),
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: checar horario comercial').first().json.tenantSlug }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { status: 'qualificado_agendado', meetingAt: $('Code: checar horario comercial').first().json.meetingAtProposto, executiveSummary: 'Reunião agendada via WhatsApp (tool agendar_reuniao).' } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "qualificado_agendado" }],
});

const insertAgendaEnvio = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: agendar lembrete (agenda_envios)",
    position: [1820, -400],
    parameters: {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "id", value: AGENDA_ENVIOS_TABLE_ID },
      columns: {
        mappingMode: "defineBelow",
        value: {
          leadId: expr("{{ $('Code: checar horario comercial').first().json.leadId }}"),
          tenantSlug: expr("{{ $('Code: checar horario comercial').first().json.tenantSlug }}"),
          waId: expr("{{ $('Code: checar horario comercial').first().json.waId }}"),
          meetingAt: expr("{{ $('Code: checar horario comercial').first().json.meetingAtProposto }}"),
          meetLink: expr("{{ $('Google Calendar: criar evento (Meet)').first().json.htmlLink }}"),
        },
        schema: [
          { id: "leadId", displayName: "leadId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "tenantSlug", displayName: "tenantSlug", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "waId", displayName: "waId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "meetingAt", displayName: "meetingAt", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "meetLink", displayName: "meetLink", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
        ],
      },
    },
  },
  output: [{ id: 1 }],
});

const scheduledResponse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: montar resposta do agendamento",
    position: [2080, -400],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const patch = $('HTTP: PATCH /leads/{id} (agendado)').first().json;\n" +
        "const meetLink = $('Google Calendar: criar evento (Meet)').first().json.htmlLink;\n" +
        "const meetingAt = $('Code: checar horario comercial').first().json.meetingAtProposto;\n" +
        "const crmAtualizado = typeof patch.status === 'string' && patch.status === 'qualificado_agendado';\n" +
        "return [{ json: {\n" +
        "  ok: true,\n" +
        "  meetLink,\n" +
        "  meetingAt,\n" +
        "  crmAtualizado,\n" +
        "  aviso: crmAtualizado ? null : 'Evento criado no Calendar, mas houve falha ao atualizar o status do lead no CRM — informe ao lead que a reunião está confirmada e sinalize a falha.',\n" +
        "} }];\n",
    },
  },
  output: [{ ok: true, meetLink: "https://calendar.google.com/event?eid=evt123", meetingAt: "2026-08-17T13:00:00.000Z", crmAtualizado: true, aviso: null }],
});

const scheduledBranch = createEvent.to(patchLeadScheduled.to(insertAgendaEnvio.to(scheduledResponse)));

export default workflow("crivo-tool-agendar-reuniao", "crivo-tool-agendar-reuniao")
  .add(scheduleTrigger)
  .to(
    checkBusinessHours.to(
      isWithinBusinessHours
        .onTrue(checkAvailability.to(isAvailable.onTrue(scheduledBranch).onFalse(unavailableResponse)))
        .onFalse(outsideBusinessHoursResponse)
    )
  );
