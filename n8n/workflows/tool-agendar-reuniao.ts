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
 * lote-8 (T29, ATRIB-02): a ordem foi INVERTIDA — o `PATCH` do CRM acontece
 * ANTES da criação do evento. É o CRM que escolhe o corretor responsável pelo
 * horário acordado (AD-022) e devolve `assignedBroker`, que entra como
 * convidado do evento pelo e-mail. Uma recusa do CRM
 * (`sem-corretor-disponivel`, `conflito-de-agenda`) não cria evento nenhum: o
 * agente recebe o motivo e oferece outro horário. A decisão de "criar ou
 * recusar" é determinística e mora em `n8n/src/agendamento.mjs`.
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

const patchLeadScheduled = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: PATCH /leads/{id} (agendado)",
    position: [1300, -400],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    // AD-018: falha aqui NUNCA é silenciada. `neverError` + `fullResponse`
    // fazem o corpo `problem+json` de uma recusa (409 `sem-corretor-disponivel`
    // / `conflito-de-agenda`) chegar ao nó seguinte como saída regular, em vez
    // de virar erro de nó sem corpo legível; `onError` cobre o que sobra
    // (falha de transporte depois das 3 tentativas).
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
      options: { response: { response: { fullResponse: true, neverError: true } } },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
  },
  output: [
    {
      statusCode: 200,
      body: {
        id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        status: "qualificado_agendado",
        assignedBroker: { name: "Corretora Manhã", email: "corretora.manha@imobiliaria-a.com.br" },
      },
    },
  ],
});

const interpretPatch = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: interpretar resposta do CRM",
    position: [1560, -400],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(agendamento.mjs)__' +
        "\n\n" +
        "return [{ json: interpretarPatchAgendamento($json) }];\n",
    },
  },
  output: [
    {
      crmConfirmou: true,
      reason: null,
      corretor: { name: "Corretora Manhã", email: "corretora.manha@imobiliaria-a.com.br" },
      convidados: ["corretora.manha@imobiliaria-a.com.br"],
    },
  ],
});

const didCrmConfirm = ifElse({
  version: 2.3,
  config: {
    name: "CRM confirmou o agendamento?",
    position: [1820, -400],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.crmConfirmou }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

const crmRefusedResponse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: recusa do CRM (devolve motivo ao agente)",
    position: [2080, -200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(agendamento.mjs)__' +
        "\n\n" +
        "return [{ json: montarRecusaAgendamento($json.reason) }];\n",
    },
  },
  output: [
    {
      ok: false,
      reason: "sem-corretor-disponivel",
      eventoCriado: false,
      orientacao: "Nenhum corretor da imobiliária atende nesse horário. A reunião NÃO foi marcada: ofereça outro horário ao lead.",
    },
  ],
});

const createEvent = node({
  type: "n8n-nodes-base.googleCalendar",
  version: 1.3,
  config: {
    name: "Google Calendar: criar evento (Meet)",
    position: [2080, -600],
    // Ordem invertida (T29): a reunião JÁ está registrada no CRM quando este
    // nó roda. Falhar aqui não pode derrubar o agendamento — o Code final
    // reporta a divergência ao agente com `aviso`, nunca em silêncio.
    onError: "continueRegularOutput",
    parameters: {
      resource: "event",
      operation: "create",
      calendar: { __rl: true, mode: "id", value: expr("{{ $('Code: checar horario comercial').first().json.calendarId }}") },
      start: expr("{{ $('Code: checar horario comercial').first().json.meetingAtProposto }}"),
      end: expr("{{ DateTime.fromISO($('Code: checar horario comercial').first().json.meetingAtProposto).plus({ minutes: 30 }).toISO() }}"),
      additionalFields: {
        summary: expr("{{ 'Reunião com ' + $('Code: checar horario comercial').first().json.contactName }}"),
        // ATRIB-02 AC8: o corretor escolhido pelo CRM entra como convidado,
        // pelo e-mail. Array vazio quando o CRM não devolveu corretor.
        attendees: expr("{{ $('Code: interpretar resposta do CRM').first().json.convidados }}"),
        conferenceDataUi: { conferenceDataValues: { conferenceSolution: "hangoutsMeet" } },
      },
    },
    credentials: { googleCalendarOAuth2Api: newCredential("Google Calendar account") },
  },
  output: [{ id: "evt123", htmlLink: "https://calendar.google.com/event?eid=evt123", start: { dateTime: "2026-08-17T13:00:00.000Z" } }],
});

const insertAgendaEnvio = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: agendar lembrete (agenda_envios)",
    position: [2340, -600],
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
          // `|| ''` porque a criação do evento agora pode falhar sem derrubar
          // o agendamento já gravado no CRM (ordem invertida — T29).
          meetLink: expr("{{ $('Google Calendar: criar evento (Meet)').first().json.htmlLink || '' }}"),
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
    position: [2600, -600],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(agendamento.mjs)__' +
        "\n\n" +
        "const contexto = $('Code: checar horario comercial').first().json;\n" +
        "const evento = $('Google Calendar: criar evento (Meet)').first().json;\n" +
        "const crm = $('Code: interpretar resposta do CRM').first().json;\n" +
        "return [{ json: montarRespostaAgendamento({ meetingAt: contexto.meetingAtProposto, evento, corretor: crm.corretor }) }];\n",
    },
  },
  output: [
    {
      ok: true,
      meetingAt: "2026-08-17T13:00:00.000Z",
      meetLink: "https://calendar.google.com/event?eid=evt123",
      corretor: { name: "Corretora Manhã", email: "corretora.manha@imobiliaria-a.com.br" },
      crmAtualizado: true,
      eventoCriado: true,
      aviso: null,
    },
  ],
});

// PATCH no CRM primeiro; só com a confirmação dele o evento é criado, já com
// o corretor devolvido como convidado (T29 — ATRIB-02 AC5/AC8).
const scheduledBranch = patchLeadScheduled.to(
  interpretPatch.to(
    didCrmConfirm
      .onTrue(createEvent.to(insertAgendaEnvio.to(scheduledResponse)))
      .onFalse(crmRefusedResponse)
  )
);

export default workflow("crivo-tool-agendar-reuniao", "crivo-tool-agendar-reuniao")
  .add(scheduleTrigger)
  .to(
    checkBusinessHours.to(
      isWithinBusinessHours
        .onTrue(checkAvailability.to(isAvailable.onTrue(scheduledBranch).onFalse(unavailableResponse)))
        .onFalse(outsideBusinessHoursResponse)
    )
  );
