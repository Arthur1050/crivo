const agendarReuniaoTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolWorkflow",
  version: 2.2,
  config: {
    name: "agendar_reuniao",
    position: [7560, 1300],
    parameters: {
      description:
        "Confirma um horário de reunião com o corretor. Só chame na fase de agendamento, com um horário específico (proposto pelo lead ou por você, dentro do horário comercial informado no system message).",
      source: "database",
      workflowId: { __rl: true, mode: "id", value: TOOL_AGENDAR_REUNIAO_WORKFLOW_ID },
      workflowInputs: {
        mappingMode: "defineBelow",
        value: {
          meetingAtProposto: fromAi("meetingAtProposto", "Horário da reunião proposto, ISO-8601 com timezone, ex: 2026-08-17T13:00:00-03:00"),
          tenantSlug: expr("{{ $('Code: gate').first().json.tenantSlug }}"),
          waId: expr("{{ $('Code: gate').first().json.waId }}"),
          leadId: expr("{{ $('Code: gate').first().json.id }}"),
          calendarId: expr("{{ $('Code: gate').first().json.calendarId }}"),
          contactName: expr("{{ $('Code: contexto do lead').first().json.contactName }}"),
          meetingDays: expr("{{ $('HTTP: GET /settings').first().json.meetingDays }}"),
          meetingHoursStart: expr("{{ $('HTTP: GET /settings').first().json.meetingHoursStart }}"),
          meetingHoursEnd: expr("{{ $('HTTP: GET /settings').first().json.meetingHoursEnd }}"),
        },
        // Mesmo achado do `responderLeadTool` acima (T12) — `schema`
        // obrigatório para o resourceMapper mapear qualquer campo.
        schema: [
          { id: "meetingAtProposto", displayName: "meetingAtProposto", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "tenantSlug", displayName: "tenantSlug", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "waId", displayName: "waId", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "leadId", displayName: "leadId", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "calendarId", displayName: "calendarId", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "contactName", displayName: "contactName", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "meetingDays", displayName: "meetingDays", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "meetingHoursStart", displayName: "meetingHoursStart", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "meetingHoursEnd", displayName: "meetingHoursEnd", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
        ],
      },
    },
  },
  output: [{}],
});

