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
        "const reminder = $('Data Table: lembretes devidos (agenda_envios)').item.json;\n" +
        "const tenant = $json;\n" +
        "return { json: { leadId: reminder.leadId, tenantSlug: reminder.tenantSlug, waId: reminder.waId, meetingAt: reminder.meetingAt, meetLink: reminder.meetLink, agendaEnvioRowId: reminder.id, apiKey: tenant.apiKey, phoneNumberId: tenant.phoneNumberId } };\n",
    },
  },
  output: [{ leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", tenantSlug: "vale-do-uberaba", waId: "5534999990001", meetingAt: "2026-08-05T13:00:00.000Z", meetLink: "https://meet.google.com/abc-defg-hij", agendaEnvioRowId: 1, apiKey: "exemplo", phoneNumberId: "109876543210001" }],
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
        "/**\n * Horário comercial do tenant + janela de 24h da Meta (design.md — Camada de\n * decisão; AGT-04, AGT-06). Funções puras, sem I/O, sem dependências — rodam\n * dentro de um Code node do n8n. Toda conversão de timezone usa\n * `Intl.DateTimeFormat` nativo (nenhuma lib de datas é necessária).\n */\n\n// Timezone fixa do produto no piloto (design.md — Tech Decisions: \"100%\n// Uberaba/MG; TZ por tenant é productização futura\").\nconst TIMEZONE = \"America/Sao_Paulo\";\n\n// Fallback seg-sex 9h-18h quando o tenant não configurou horário comercial\n// (design.md — resolveBusinessHours; guia-integracao.md §8). ISO 1(segunda)\n// a 7(domingo), mesma convenção do schema (`tenants.meeting_days`).\nconst FALLBACK_DAYS = [1, 2, 3, 4, 5];\nconst FALLBACK_START = \"09:00\";\nconst FALLBACK_END = \"18:00\";\n\n/**\n * @typedef {{meetingDays: number[]|null, meetingHoursStart: string|null, meetingHoursEnd: string|null}} BusinessHoursSettings\n * @typedef {{days: number[], start: string, end: string}} ResolvedBusinessHours\n */\n\n/**\n * Resolve o horário comercial efetivo do tenant (T3 — `GET /api/v1/settings`\n * shape). Os 3 campos são configurados como uma unidade só pelo CRM\n * (CONF-05 AC3: `validateBusinessHours` exige dias + início + fim juntos, ou\n * nada) — então qualquer um deles ausente/vazio aqui é tratado como\n * \"horário comercial não configurado\" e cai no fallback INTEIRO seg-sex\n * 9h-18h, nunca uma mistura parcial de default + configurado.\n *\n * @param {BusinessHoursSettings | null | undefined} settings\n * @returns {ResolvedBusinessHours}\n */\nfunction resolveBusinessHours(settings) {\n  const days = settings?.meetingDays;\n  const start = settings?.meetingHoursStart;\n  const end = settings?.meetingHoursEnd;\n\n  if (!Array.isArray(days) || days.length === 0 || !start || !end) {\n    return { days: FALLBACK_DAYS, start: FALLBACK_START, end: FALLBACK_END };\n  }\n\n  return { days, start, end };\n}\n\nconst ISO_WEEKDAY_BY_SHORT_NAME = {\n  Mon: 1,\n  Tue: 2,\n  Wed: 3,\n  Thu: 4,\n  Fri: 5,\n  Sat: 6,\n  Sun: 7,\n};\n\n/**\n * Extrai o dia da semana ISO (1=segunda..7=domingo) e o horário \"HH:MM\" de\n * um instante, na timezone informada.\n * @param {Date} date\n * @param {string} timeZone\n * @returns {{isoWeekday: number|undefined, time: string}}\n */\nfunction localDayAndTime(date, timeZone) {\n  const parts = new Intl.DateTimeFormat(\"en-US\", {\n    timeZone,\n    weekday: \"short\",\n    hour: \"2-digit\",\n    minute: \"2-digit\",\n    hour12: false,\n  }).formatToParts(date);\n\n  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));\n  const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[map.weekday];\n  // Alguns motores ICU renderizam meia-noite como \"24\" em vez de \"00\" com\n  // hour12:false — normalizado defensivamente (não observado no runtime\n  // testado, mas o custo de checar é zero e a correção aqui é crítica para\n  // não deixar o agente agendar fora do horário real).\n  const hour = map.hour === \"24\" ? \"00\" : map.hour;\n  return { isoWeekday, time: `${hour}:${map.minute}` };\n}\n\n/**\n * Verifica se um horário proposto (`meetingAtProposto`, ISO-8601) cai dentro\n * do horário comercial resolvido do tenant (design.md — AGT-04): dia da\n * semana permitido E horário dentro de `[start, end)`, na timezone\n * `America/Sao_Paulo` (fixa no produto).\n *\n * Escolha explícita de limite (documentada e testada): o início (`start`) é\n * INCLUSIVO — um slot exatamente às `start` é aceito; o fim (`end`) é\n * EXCLUSIVO — um slot exatamente às `end` (ex.: 18:00 quando `end=\"18:00\"`)\n * é REJEITADO, porque a reunião começaria no instante em que o atendimento\n * já fechou.\n *\n * @param {string} isoDateTime - horário proposto, ISO-8601 com timezone\n * @param {BusinessHoursSettings | null | undefined} settings\n * @returns {boolean}\n */\nfunction isSlotWithinBusinessHours(isoDateTime, settings) {\n  const date = new Date(isoDateTime);\n  if (Number.isNaN(date.getTime())) return false;\n\n  const { days, start, end } = resolveBusinessHours(settings);\n  const { isoWeekday, time } = localDayAndTime(date, TIMEZONE);\n\n  if (isoWeekday === undefined || !days.includes(isoWeekday)) return false;\n  return time >= start && time < end;\n}\n\nconst TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;\n\n/**\n * Verifica se `now` está dentro da janela de 24h da Meta, contada a partir\n * da última mensagem RECEBIDA do lead (`lastInboundAt`) — regra da Cloud\n * API: mensagens proativas fora dessa janela exigem template pré-aprovada\n * (design.md — Tech Decisions). Janela FECHADA à direita e por decisão\n * explícita (documentada e testada): exatamente 24h decorridas já conta\n * como FORA da janela (`diff < 24h`, estrito) — mais seguro exigir template\n * do que arriscar um texto livre que a Meta rejeite por estar,\n * tecnicamente, no limite. `now` anterior a `lastInboundAt` (relógio/dado\n * inconsistente) é tratado defensivamente como FORA da janela.\n *\n * @param {string} lastInboundAt - ISO-8601\n * @param {string} now - ISO-8601\n * @returns {boolean}\n */\nfunction isWithin24h(lastInboundAt, now) {\n  const last = new Date(lastInboundAt);\n  const current = new Date(now);\n  if (Number.isNaN(last.getTime()) || Number.isNaN(current.getTime())) return false;\n\n  const diffMs = current.getTime() - last.getTime();\n  return diffMs >= 0 && diffMs < TWENTY_FOUR_HOURS_MS;\n}" +
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
  output: [{ leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", tenantSlug: "vale-do-uberaba", waId: "5534999990001", meetingAt: "2026-08-05T13:00:00.000Z", meetLink: "https://meet.google.com/abc-defg-hij", agendaEnvioRowId: 1, apiKey: "exemplo", phoneNumberId: "109876543210001", route: "texto-livre" }],
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
      recipientPhoneNumber: expr("{{ $json.waId }}"),
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
      recipientPhoneNumber: expr("{{ $json.waId }}"),
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
        "const conversa = $('Filter: exclui encerradas (reengajamento)').item.json;\n" +
        "const tenant = $json;\n" +
        "return { json: { tenantSlug: conversa.tenantSlug, waId: conversa.waId, leadId: conversa.leadId, apiKey: tenant.apiKey, phoneNumberId: tenant.phoneNumberId } };\n",
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", apiKey: "exemplo", phoneNumberId: "109876543210001" }],
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
      recipientPhoneNumber: expr("{{ $('Code: combinar reengajamento e tenant').first().json.waId }}"),
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
