const getDueReminders = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: lembretes devidos (agenda_envios)",
    position: [260, -400],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: AGENDA_ENVIOS_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          // Janela de 90 min com tick de 1 h: o lembrete sai entre 30 e 90 min antes.
          { keyName: "meetingAt", condition: "lte", keyValue: expr("{{ $now.plus({ minutes: 90 }).toISO() }}") },
          { keyName: "sentAt", condition: "isEmpty", keyValue: "" },
        ],
      },
      returnAll: true,
    },
  },
  output: [{ id: 1, leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", tenantSlug: "vale-do-uberaba", waId: "5534999990001", meetingAt: "2026-08-05T13:00:00.000Z", meetLink: "https://meet.google.com/abc-defg-hij", sentAt: null }],
});

const lookupTenantForReminder = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: tenant do lembrete",
    position: [520, -400],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: TENANT_CONFIG_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $json.tenantSlug }}") }],
      },
      returnAll: false,
      limit: 1,
    },
  },
  output: [{ phoneNumberId: "109876543210001", tenantSlug: "vale-do-uberaba", calendarId: "exemplo" }],
});

const mergeReminderContext = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: combinar lembrete e tenant",
    position: [780, -400],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        '__INLINE(phone.mjs)__' +
        "\n\n" +
        "const reminder = $('Data Table: lembretes devidos (agenda_envios)').item.json;\n" +
        "const tenant = $json;\n" +
        "return { json: { leadId: reminder.leadId, tenantSlug: reminder.tenantSlug, waId: reminder.waId, recipientMsisdn: toWhatsAppMsisdn(reminder.waId), meetingAt: reminder.meetingAt, meetLink: reminder.meetLink, agendaEnvioRowId: reminder.id, phoneNumberId: tenant.phoneNumberId } };\n",
    },
  },
  output: [{ leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", tenantSlug: "vale-do-uberaba", waId: "553499532444", recipientMsisdn: "5534999532444", meetingAt: "2026-08-05T13:00:00.000Z", meetLink: "https://meet.google.com/abc-defg-hij", agendaEnvioRowId: 1, phoneNumberId: "109876543210001" }],
});

const lookupConversaForReminder = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: conversa_estado do lembrete",
    position: [1040, -400],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $json.waId }}") },
        ],
      },
      returnAll: false,
      limit: 1,
    },
  },
  output: [{ lastInboundAt: "2026-08-05T10:00:00.000Z" }],
});

const postLeadForReminder = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: POST /leads (reconsulta lembrete)",
    position: [1300, -400],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: `${CRM_BASE_URL}/leads`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Krivo-Tenant", value: expr("{{ $('Code: combinar lembrete e tenant').item.json.tenantSlug }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      // Reconsulta idempotente por externalId=waId (guia-integracao.md §2):
      // como o lead JÁ EXISTE nesse ponto (foi criado no primeiro contato,
      // T10), os campos name/phone/firstContactAt reenviados aqui são
      // ignorados pelo contrato (a resposta é sempre o lead JÁ armazenado)
      // — só usados formalmente para satisfazer o schema obrigatório do
      // POST. O objetivo real desta chamada é ler `optedOutAt` fresco.
      jsonBody: expr(
        "{{ { name: 'Lead', phone: $('Code: combinar lembrete e tenant').item.json.waId, externalId: $('Code: combinar lembrete e tenant').item.json.waId, firstContactAt: $now.toISO() } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Krivo - chave de servico") },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "qualificado_agendado", optedOutAt: null }],
});

const decideReminderChannel = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: canal do lembrete",
    position: [1560, -400],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(business-hours.mjs)__' +
        "\n\n" +
        "const ctx = $('Code: combinar lembrete e tenant').first().json;\n" +
        "const conversa = $('Data Table: conversa_estado do lembrete').first().json;\n" +
        "const lead = $input.first().json;\n" +
        "let route;\n" +
        "if (lead.optedOutAt) {\n" +
        "  route = 'skip';\n" +
        "} else if (conversa.lastInboundAt && isWithin24h(conversa.lastInboundAt, $now.toISO())) {\n" +
        "  route = 'texto-livre';\n" +
        "} else {\n" +
        "  route = 'template';\n" +
        "}\n" +
        "return [{ json: { ...ctx, leadId: lead.id, route } }];\n",
    },
  },
  output: [{ leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", tenantSlug: "vale-do-uberaba", waId: "553499532444", recipientMsisdn: "5534999532444", meetingAt: "2026-08-05T13:00:00.000Z", meetLink: "https://meet.google.com/abc-defg-hij", agendaEnvioRowId: 1, phoneNumberId: "109876543210001", route: "texto-livre" }],
});

const reminderRouteSwitch = switchCase({
  version: 3.4,
  config: {
    name: "Switch: canal do lembrete",
    position: [1820, -400],
    parameters: {
      rules: {
        values: [
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.route }}"), operator: { type: "string", operation: "equals" }, rightValue: "skip" }], combinator: "and" } },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.route }}"), operator: { type: "string", operation: "equals" }, rightValue: "texto-livre" }], combinator: "and" } },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.route }}"), operator: { type: "string", operation: "equals" }, rightValue: "template" }], combinator: "and" } },
        ],
      },
      options: {},
    },
  },
});

const sendReminderText = node({
  type: "n8n-nodes-base.whatsApp",
  version: 1.1,
  config: {
    name: "WhatsApp: lembrete (texto livre)",
    position: [2080, -480],
    parameters: {
      resource: "message",
      operation: "send",
      phoneNumberId: expr("{{ $json.phoneNumberId }}"),
      // `recipientMsisdn` (não `waId`): nono dígito brasileiro normalizado em
      // `Code: combinar lembrete e tenant` — ver n8n/src/phone.mjs.
      recipientPhoneNumber: expr("{{ $json.recipientMsisdn }}"),
      messageType: "text",
      textBody: expr("{{ 'Passando para confirmar sua reunião hoje às ' + $json.meetingAt.substring(11,16) + '. Link do Google Meet: ' + $json.meetLink }}"),
    },
    // Mesmo achado documentado em n8n/workflows/principal.ts (WhatsApp send):
    // placeholder "WhatsApp Send — Krivo" nunca resolveu, publish_workflow
    // rejeitou o workflow com "Missing required credential: whatsAppApi" nos
    // 3 nós abaixo até este fix — id copiado exatamente de `list_credentials`.
    credentials: { whatsAppApi: newCredential("WhatsApp account") },
  },
  output: [{ messages: [{ id: "wamid.LEMBRETE_TEXTO" }] }],
});

// Template "lembrete_reuniao" (n8n/README.md §5): {{1}}=horário, {{2}}=link
// do Meet. Fora da janela de 24h da Meta — obrigatório por regra da Cloud
// API (design.md — Tech Decisions).
const sendReminderTemplate = node({
  type: "n8n-nodes-base.whatsApp",
  version: 1.1,
  config: {
    name: "WhatsApp: lembrete (template)",
    position: [2080, -320],
    parameters: {
      resource: "message",
      operation: "sendTemplate",
      phoneNumberId: expr("{{ $json.phoneNumberId }}"),
      // Mesmo motivo do nó de texto livre acima (n8n/src/phone.mjs).
      recipientPhoneNumber: expr("{{ $json.recipientMsisdn }}"),
      template: "lembrete_reuniao",
      components: {
        component: [
          {
            type: "body",
            bodyParameters: {
              parameter: [
                { type: "text", text: expr("{{ $json.meetingAt.substring(11,16) }}") },
                { type: "text", text: expr("{{ $json.meetLink }}") },
              ],
            },
          },
        ],
      },
    },
    // Mesmo achado documentado em n8n/workflows/principal.ts (WhatsApp send):
    // placeholder "WhatsApp Send — Krivo" nunca resolveu, publish_workflow
    // rejeitou o workflow com "Missing required credential: whatsAppApi" nos
    // 3 nós abaixo até este fix — id copiado exatamente de `list_credentials`.
    credentials: { whatsAppApi: newCredential("WhatsApp account") },
  },
  output: [{ messages: [{ id: "wamid.LEMBRETE_TEMPLATE" }] }],
});

const registerReminderMessage = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: POST /leads/{id}/messages (lembrete)",
    position: [2340, -400],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: canal do lembrete').first().json.leadId }}/messages`),
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Krivo-Tenant", value: expr("{{ $('Code: canal do lembrete').first().json.tenantSlug }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: 'lembrete-' + $('Code: canal do lembrete').first().json.agendaEnvioRowId, sender: 'agente', content: 'Lembrete de reunião enviado (' + $('Code: canal do lembrete').first().json.route + ')', sentAt: $now.toISO() } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Krivo - chave de servico") },
  },
  output: [{ id: "7fa85f64-5717-4562-b3fc-2c963f66afaa", sender: "agente" }],
});

const markReminderSent = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: marcar lembrete enviado",
    position: [2600, -400],
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: AGENDA_ENVIOS_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [{ keyName: "id", condition: "eq", keyValue: expr("{{ $('Code: canal do lembrete').first().json.agendaEnvioRowId }}") }],
      },
      columns: {
        mappingMode: "defineBelow",
        value: { sentAt: expr("{{ $now.toISO() }}") },
        schema: [{ id: "sentAt", displayName: "sentAt", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true }],
      },
    },
  },
  output: [{ id: 1 }],
});

