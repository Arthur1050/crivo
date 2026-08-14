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
 * resto — `tenantSlug`, `waId`, `leadId`, `apiKey`, `calendarId`,
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
          { name: "apiKey", type: "string" },
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
      apiKey: "exemplo",
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
        '__INLINE(business-hours.mjs)__' +
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
      apiKey: "exemplo",
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
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: checar horario comercial').first().json.apiKey }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { status: 'qualificado_agendado', meetingAt: $('Code: checar horario comercial').first().json.meetingAtProposto, executiveSummary: 'Reunião agendada via WhatsApp (tool agendar_reuniao).' } }}"
      ),
    },
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
