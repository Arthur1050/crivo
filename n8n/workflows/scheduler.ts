/**
 * crivo-agente-scheduler — 3 varreduras completas (T11).
 *
 * Fonte versionada do workflow único de varreduras agendadas (design.md —
 * "Scheduler"; AGT-05 AC2, AGT-06, AGT-07 AC3, LGPD-03 AC2). Texto de
 * ENTRADA do inliner (`scripts/n8n-inline.mjs`) — o publicável é
 * `n8n/generated/scheduler.ts`. Mesma regra do principal.ts: SEM funções
 * customizadas (nem `function`, nem arrow function) no nível do arquivo —
 * confirmado pelo parser do SDK no T10.
 *
 * Cadência: 15 min (design.md — R3, risco de quota documentado no
 * n8n/README.md §6; ajustável em 1 parâmetro — `minutesInterval` abaixo).
 *
 * Fan-out de 1 Schedule Trigger só para as 3 varreduras (não 3 triggers
 * separados) — confirmado válido via `validate_workflow` no T11 (chamar
 * `.to()` várias vezes na MESMA referência de nó acumula conexões de
 * saída, em vez de sobrescrever) — é o que preserva a matemática de R3 (1
 * execução por tick cobre as 3 varreduras, não 3).
 *
 * Simplificação documentada (Agent's Discretion, context.md — "estrutura
 * interna da memória"): a varredura de Reengajamento e a de Escalonamento
 * por silêncio filtram "sem opt-out"/"não travado por humano" via
 * `fase !== 'encerrada'` em `conversa_estado`, sem re-consultar o CRM ao
 * vivo — válido porque `principal.ts` (T10) grava `fase: 'encerrada'`
 * exatamente nos dois casos que importam aqui (opt-out e escalado_humano;
 * ver `Code: finalizar opt-out` e `Code: finalizar escalado`). A varredura
 * de Lembretes, ao contrário, SEMPRE re-consulta `optedOutAt` ao vivo via
 * `POST /leads` — design.md exige explicitamente esse re-check "fresco"
 * (o intervalo entre agendar e a hora da reunião é longo o bastante para o
 * lead ter dado opt-out nesse meio-tempo).
 */
import { workflow, trigger, node, ifElse, switchCase, newCredential, expr } from "@n8n/workflow-sdk";

const CRM_BASE_URL = "https://crivo-arthur1050s-projects.vercel.app/api/v1";
const TENANT_CONFIG_TABLE_ID = "eqp0TUHvN9yQNvdY";
const CONVERSA_ESTADO_TABLE_ID = "6SLkn98QYKQsinFR";
const AGENDA_ENVIOS_TABLE_ID = "ARcM27JDL4F6o3oi";

const scheduleEveryFifteenMinutes = trigger({
  type: "n8n-nodes-base.scheduleTrigger",
  version: 1.3,
  config: {
    name: "A cada 15min",
    position: [0, 0],
    parameters: {
      rule: { interval: [{ field: "minutes", minutesInterval: 15 }] },
    },
  },
  output: [{}],
});

// =======================================================================
// Varredura A — Lembretes (design.md; AGT-06, LGPD-03 AC2)
// =======================================================================

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
          { keyName: "meetingAt", condition: "lte", keyValue: expr("{{ $now.plus({ minutes: 60 }).toISO() }}") },
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
  output: [{ phoneNumberId: "109876543210001", tenantSlug: "vale-do-uberaba", apiKey: "exemplo", calendarId: "exemplo" }],
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
        "return { json: { leadId: reminder.leadId, tenantSlug: reminder.tenantSlug, waId: reminder.waId, recipientMsisdn: toWhatsAppMsisdn(reminder.waId), meetingAt: reminder.meetingAt, meetLink: reminder.meetLink, agendaEnvioRowId: reminder.id, apiKey: tenant.apiKey, phoneNumberId: tenant.phoneNumberId } };\n",
    },
  },
  output: [{ leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", tenantSlug: "vale-do-uberaba", waId: "553499532444", recipientMsisdn: "5534999532444", meetingAt: "2026-08-05T13:00:00.000Z", meetLink: "https://meet.google.com/abc-defg-hij", agendaEnvioRowId: 1, apiKey: "exemplo", phoneNumberId: "109876543210001" }],
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
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: combinar lembrete e tenant').item.json.apiKey }}") }],
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
  output: [{ leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", tenantSlug: "vale-do-uberaba", waId: "553499532444", recipientMsisdn: "5534999532444", meetingAt: "2026-08-05T13:00:00.000Z", meetLink: "https://meet.google.com/abc-defg-hij", agendaEnvioRowId: 1, apiKey: "exemplo", phoneNumberId: "109876543210001", route: "texto-livre" }],
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
    // placeholder "WhatsApp Send — Crivo" nunca resolveu, publish_workflow
    // rejeitou o workflow com "Missing required credential: whatsAppApi" nos
    // 3 nós abaixo até este fix — id copiado exatamente de `list_credentials`.
    credentials: { whatsAppApi: newCredential("WhatsApp account", "HB4RrjlPYBAIkaX8") },
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
    // placeholder "WhatsApp Send — Crivo" nunca resolveu, publish_workflow
    // rejeitou o workflow com "Missing required credential: whatsAppApi" nos
    // 3 nós abaixo até este fix — id copiado exatamente de `list_credentials`.
    credentials: { whatsAppApi: newCredential("WhatsApp account", "HB4RrjlPYBAIkaX8") },
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
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: canal do lembrete').first().json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: 'lembrete-' + $('Code: canal do lembrete').first().json.agendaEnvioRowId, sender: 'agente', content: 'Lembrete de reunião enviado (' + $('Code: canal do lembrete').first().json.route + ')', sentAt: $now.toISO() } }}"
      ),
    },
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

// =======================================================================
// Varredura B — Reengajamento (design.md; AGT-05 AC2)
// =======================================================================

const getStaleConversations = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: conversas paradas 24h (conversa_estado)",
    position: [260, 0],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "lastInboundAt", condition: "lt", keyValue: expr("{{ $now.minus({ hours: 24 }).toISO() }}") },
          { keyName: "reengaged", condition: "eq", keyValue: "false" },
        ],
      },
      returnAll: true,
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando", reengaged: false, lastInboundAt: "2026-08-04T10:00:00.000Z" }],
});

const excludeClosedForReengagement = node({
  type: "n8n-nodes-base.filter",
  version: 2.3,
  config: {
    name: "Filter: exclui encerradas (reengajamento)",
    position: [520, 0],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.fase }}"), operator: { type: "string", operation: "notEquals" }, rightValue: "encerrada" }],
      },
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
});

const lookupTenantForReengagement = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: tenant do reengajamento",
    position: [780, 0],
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
  output: [{ phoneNumberId: "109876543210001", tenantSlug: "vale-do-uberaba", apiKey: "exemplo" }],
});

const mergeReengagementContext = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: combinar reengajamento e tenant",
    position: [1040, 0],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        '__INLINE(phone.mjs)__' +
        "\n\n" +
        "const conversa = $('Filter: exclui encerradas (reengajamento)').item.json;\n" +
        "const tenant = $json;\n" +
        "return { json: { tenantSlug: conversa.tenantSlug, waId: conversa.waId, recipientMsisdn: toWhatsAppMsisdn(conversa.waId), leadId: conversa.leadId, apiKey: tenant.apiKey, phoneNumberId: tenant.phoneNumberId } };\n",
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "553499532444", recipientMsisdn: "5534999532444", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", apiKey: "exemplo", phoneNumberId: "109876543210001" }],
});

const getSettingsForReengagement = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: GET /settings (reengajamento)",
    position: [1300, 0],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "GET",
      url: `${CRM_BASE_URL}/settings`,
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $json.apiKey }}") }] },
    },
  },
  output: [{ agentName: "Ana" }],
});

const sendReengagementTemplate = node({
  type: "n8n-nodes-base.whatsApp",
  version: 1.1,
  config: {
    name: "WhatsApp: reengajamento (template)",
    position: [1560, 0],
    parameters: {
      resource: "message",
      operation: "sendTemplate",
      phoneNumberId: expr("{{ $('Code: combinar reengajamento e tenant').first().json.phoneNumberId }}"),
      // Mesmo motivo dos lembretes acima (n8n/src/phone.mjs): o `waId` cru da
      // Meta vem sem o nono dígito e é rejeitado no envio (erro 131030).
      recipientPhoneNumber: expr("{{ $('Code: combinar reengajamento e tenant').first().json.recipientMsisdn }}"),
      template: "reengajamento",
      components: {
        component: [
          {
            type: "body",
            bodyParameters: { parameter: [{ type: "text", text: expr("{{ $json.agentName }}") }] },
          },
        ],
      },
    },
    // Mesmo achado documentado em n8n/workflows/principal.ts (WhatsApp send):
    // placeholder "WhatsApp Send — Crivo" nunca resolveu, publish_workflow
    // rejeitou o workflow com "Missing required credential: whatsAppApi" nos
    // 3 nós abaixo até este fix — id copiado exatamente de `list_credentials`.
    credentials: { whatsAppApi: newCredential("WhatsApp account", "HB4RrjlPYBAIkaX8") },
  },
  output: [{ messages: [{ id: "wamid.REENGAJAMENTO" }] }],
});

const registerReengagementMessage = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: POST /leads/{id}/messages (reengajamento)",
    position: [1820, 0],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: combinar reengajamento e tenant').first().json.leadId }}/messages`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: combinar reengajamento e tenant').first().json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: 'reengajamento-' + $('Code: combinar reengajamento e tenant').first().json.waId + '-' + $now.toFormat('yyyyMMdd'), sender: 'agente', content: 'Mensagem de reengajamento enviada (template)', sentAt: $now.toISO() } }}"
      ),
    },
  },
  output: [{ id: "8fa85f64-5717-4562-b3fc-2c963f66afab", sender: "agente" }],
});

const markReengaged = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: marcar reengajado",
    position: [2080, 0],
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: combinar reengajamento e tenant').first().json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: combinar reengajamento e tenant').first().json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: { reengaged: true },
        schema: [{ id: "reengaged", displayName: "reengaged", required: false, defaultMatch: false, display: true, type: "boolean", canBeUsedToMatch: true }],
      },
    },
  },
  output: [{ id: 1 }],
});

// =======================================================================
// Varredura C — Escalonamento por silêncio (design.md; AGT-05 AC2,
// motivo fixo "ausência de resposta")
// =======================================================================

const getSilentReengaged = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: reengajadas silenciosas 48h (conversa_estado)",
    position: [260, 400],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "reengaged", condition: "eq", keyValue: "true" },
          { keyName: "lastInboundAt", condition: "lt", keyValue: expr("{{ $now.minus({ hours: 48 }).toISO() }}") },
        ],
      },
      returnAll: true,
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando", reengaged: true, lastInboundAt: "2026-08-03T10:00:00.000Z" }],
});

const excludeClosedForEscalation = node({
  type: "n8n-nodes-base.filter",
  version: 2.3,
  config: {
    name: "Filter: exclui encerradas (escalonamento)",
    position: [520, 400],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.fase }}"), operator: { type: "string", operation: "notEquals" }, rightValue: "encerrada" }],
      },
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
});

const lookupTenantForEscalation = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: tenant do escalonamento",
    position: [780, 400],
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
  output: [{ phoneNumberId: "109876543210001", tenantSlug: "vale-do-uberaba", apiKey: "exemplo" }],
});

const mergeEscalationContext = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: combinar escalonamento e tenant",
    position: [1040, 400],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "const conversa = $('Filter: exclui encerradas (escalonamento)').item.json;\n" +
        "const tenant = $json;\n" +
        "return { json: { tenantSlug: conversa.tenantSlug, waId: conversa.waId, leadId: conversa.leadId, apiKey: tenant.apiKey } };\n",
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", apiKey: "exemplo" }],
});

const patchEscalateSilence = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: PATCH /leads/{id} (silencio 48h)",
    position: [1300, 400],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    // AGT-07 AC1: mesmo tratamento de 409 do principal.ts — segue sem
    // travar a execução (não há retentativa da mesma transição depois).
    onError: "continueRegularOutput",
    parameters: {
      method: "PATCH",
      url: expr(`${CRM_BASE_URL}/leads/{{ $json.leadId }}`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { status: 'escalado_humano', escalationReason: 'ausência de resposta', executiveSummary: 'Lead silencioso por mais de 48h após reengajamento único.' } }}"
      ),
    },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "escalado_humano" }],
});

const markEscalatedLocally = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: marcar escalado localmente",
    position: [1560, 400],
    parameters: {
      resource: "row",
      operation: "update",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: combinar escalonamento e tenant').first().json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: combinar escalonamento e tenant').first().json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: { fase: "encerrada" },
        schema: [{ id: "fase", displayName: "fase", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true }],
      },
    },
  },
  output: [{ id: 1 }],
});

// =======================================================================
// Montagem do grafo — 1 trigger, 3 ramos independentes (fan-out)
// =======================================================================

const markSentWired = registerReminderMessage.to(markReminderSent);

// Case 0 ("skip") propositalmente NÃO recebe `.onCase(...)` — mesmo padrão
// de "sem wiring de saída = execução termina aqui" usado em `isStillLatest`
// (só `.onTrue(...)`, sem `.onFalse(...)`) no principal.ts. É o que garante
// LGPD-03 AC2: lead com opt-out não recebe NENHUM envio proativo.
const reminderRouteSwitchRouted = reminderRouteSwitch
  .onCase!(1, sendReminderText.to(markSentWired))
  .onCase(2, sendReminderTemplate.to(markSentWired));

const lembretesChain = getDueReminders.to(
  lookupTenantForReminder.to(
    mergeReminderContext.to(
      lookupConversaForReminder.to(
        postLeadForReminder.to(decideReminderChannel.to(reminderRouteSwitchRouted))
      )
    )
  )
);

const reengajamentoChain = getStaleConversations.to(
  excludeClosedForReengagement.to(
    lookupTenantForReengagement.to(
      mergeReengagementContext.to(
        getSettingsForReengagement.to(sendReengagementTemplate.to(registerReengagementMessage.to(markReengaged)))
      )
    )
  )
);

const escalonamentoChain = getSilentReengaged.to(
  excludeClosedForEscalation.to(
    lookupTenantForEscalation.to(
      mergeEscalationContext.to(patchEscalateSilence.to(markEscalatedLocally))
    )
  )
);

scheduleEveryFifteenMinutes.to(lembretesChain);
scheduleEveryFifteenMinutes.to(reengajamentoChain);
scheduleEveryFifteenMinutes.to(escalonamentoChain);

export default workflow("crivo-agente-scheduler", "crivo-agente-scheduler").add(scheduleEveryFifteenMinutes);
