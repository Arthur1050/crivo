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
 *
 * lote-14 (T26): a marca de condução humana é gravada pelo CRM e não passa
 * por `fase`, então Reengajamento e Escalonamento passam a reler o lead ao
 * vivo (`GET /leads/{id}`) depois do filtro de `fase` e só seguem com
 * `canAgentContactProactively` (`n8n/src/conduction.mjs`). Lembretes não
 * mudam (SILENCIO-01 AC8).
 */
import { workflow, trigger, node, ifElse, switchCase, newCredential, expr, splitInBatches, nextBatch } from "@n8n/workflow-sdk";

import readonlyGeneration from "../generated/reengagement-contextual";

const CRM_BASE_URL = "https://crivo-arthur1050s-projects.vercel.app/api/v1";
const TENANT_CONFIG_TABLE_ID = "xRHckWWd6fxGeNta";
const CONVERSA_ESTADO_TABLE_ID = "ZsplBxJjXv3kwKZ8";
const AGENDA_ENVIOS_TABLE_ID = "m83dxX8YZYg1NDYq";

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
        "/**\n * Normalização do destinatário de envio no WhatsApp (nono dígito brasileiro).\n *\n * PROBLEMA REAL (execução 354 de `crivo-agente-principal`, confirmado contra\n * duas fontes): o webhook da Meta entrega o contato em `wa_id` no formato\n * LEGADO, sem o nono dígito — `553499532444` (12 dígitos) — enquanto a Cloud\n * API só aceita como destinatário o número atual, com o 9 — `5534999532444`\n * (13 dígitos, o mesmo valor que o painel da Meta usa no campo `to` do curl\n * de exemplo). Enviar o `wa_id` cru resulta em erro 131030 (\"Recipient phone\n * number not in allowed list\") — ou seja, TODA resposta do agente a um lead\n * brasileiro falha, não só a do número de teste.\n *\n * ESCOPO DELIBERADO: esta função normaliza SÓ o destinatário do envio. O\n * `wa_id` cru continua sendo a chave das Data Tables (`conversa_estado`,\n * `agenda_envios`) e o `externalId` do lead no CRM — mudar essas chaves\n * quebraria o casamento com os eventos recebidos da Meta, que sempre chegam\n * no formato legado.\n *\n * Função pura, sem I/O, sem dependências — roda dentro de um Code node do\n * n8n (sandbox: sem `require`, sem rede).\n */\n\n// Marca do país no formato E.164 sem o \"+\" (é como o `wa_id` chega da Meta).\nconst BRAZIL_COUNTRY_CODE = \"55\";\n\n// Comprimentos brasileiros: 55 + DDD(2) + 8 (formato legado, pré-nono-dígito)\n// e 55 + DDD(2) + 9 (formato atual). Só o primeiro precisa de conserto.\nconst BR_LEGACY_LENGTH = 12;\nconst BR_DDD_END_INDEX = 4; // fim de \"55\" + DDD\n\n// Discriminador celular x fixo (Anatel — Plano de Numeração Brasileiro,\n// cartilha do nono dígito): o 9 foi acrescentado SÓ aos números do Serviço\n// Móvel Pessoal, que no formato legado de 8 dígitos começavam com 6, 7, 8 ou\n// 9; a telefonia fixa também tem 8 dígitos, mas começa com 2, 3, 4 ou 5 e\n// NUNCA recebeu o nono dígito. Sem esse discriminador, um fixo de 8 dígitos\n// gravado como contato viraria um celular inexistente de 9 dígitos.\nconst BR_MOBILE_LOCAL_PREFIX = /^[6-9]/;\n\nconst NON_DIGIT_PATTERN = /\\D/g;\n\n/**\n * Converte um `wa_id` da Meta no MSISDN aceito pela Cloud API como\n * destinatário de envio.\n *\n * Regras (nesta ordem):\n * 1. Entrada não-string ou sem nenhum dígito (null/undefined/\"\"/lixo) → `\"\"`.\n *    Devolver string vazia (em vez do valor cru) evita que o nó de envio\n *    mande literalmente \"undefined\" para a Meta; o envio falha de forma\n *    explícita, que é o comportamento defensivo dos módulos vizinhos\n *    (`normalizeEvent` → null, `detectOptOut` → false).\n * 2. Caracteres não numéricos (`+`, espaço, hífen) são descartados — o\n *    `wa_id` da Meta é sempre só dígitos, mas o valor pode chegar de uma\n *    Data Table preenchida à mão.\n * 3. Número brasileiro (prefixo `55`) no formato legado (12 dígitos) cujo\n *    número local começa com 6-9 (celular) → insere `9` depois do DDD.\n * 4. Qualquer outro caso — brasileiro já com 13 dígitos, fixo brasileiro de\n *    8 dígitos locais, número de outro país, comprimento inesperado — volta\n *    inalterado. Nenhuma regra de outro país é inventada aqui.\n *\n * Idempotente por construção: o resultado da regra 3 tem 13 dígitos e cai na\n * regra 4 numa segunda aplicação.\n *\n * @param {unknown} waId - `wa_id` do contato no evento da Meta\n * @returns {string} MSISDN pronto para `recipientPhoneNumber`\n */\nfunction toWhatsAppMsisdn(waId) {\n  if (typeof waId !== \"string\") return \"\";\n\n  const digits = waId.replace(NON_DIGIT_PATTERN, \"\");\n  if (digits === \"\") return \"\";\n\n  if (!digits.startsWith(BRAZIL_COUNTRY_CODE)) return digits;\n  if (digits.length !== BR_LEGACY_LENGTH) return digits;\n\n  const ddd = digits.slice(0, BR_DDD_END_INDEX);\n  const local = digits.slice(BR_DDD_END_INDEX);\n  if (!BR_MOBILE_LOCAL_PREFIX.test(local)) return digits;\n\n  return `${ddd}9${local}`;\n}" +
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
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: combinar lembrete e tenant').item.json.tenantSlug }}") }],
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
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
    // placeholder "WhatsApp Send — Crivo" nunca resolveu, publish_workflow
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
    // placeholder "WhatsApp Send — Crivo" nunca resolveu, publish_workflow
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
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: canal do lembrete').first().json.tenantSlug }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: 'lembrete-' + $('Code: canal do lembrete').first().json.agendaEnvioRowId, sender: 'agente', content: 'Lembrete de reunião enviado (' + $('Code: canal do lembrete').first().json.route + ')', sentAt: $now.toISO() } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
// Varredura B — CRM autoritativo, preparação readonly e envio sem retry.



const getTenantsForB = node({ type: "n8n-nodes-base.dataTable", version: 1.1, config: { name: "Data Table: tenants B", position: [260, 0], parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "id", value: TENANT_CONFIG_TABLE_ID }, returnAll: true } }, output: [{}] });
const uniqueTenantsB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: tenants únicos B", position: [700, 0], parameters: { mode: "runOnceForAllItems", jsCode: "const seen = new Set(); return $input.all().filter(item => { const slug = item.json.tenantSlug; if (typeof slug !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(slug) || seen.has(slug)) return false; seen.add(slug); return true; }).map(item => ({ json: { tenantSlug: item.json.tenantSlug, cursor: null, cutoffAt: null } }));" } }, output: [{}] });
const tenantsLoopB = splitInBatches({ version: 3, config: { name: "Loop: tenants B", position: [400, 0], parameters: { batchSize: 1 } } });
const cursorB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: cursor B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "return { json: $json }; " } }, output: [{}] });
const candidatesB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: candidatos B", position: [1100, 0], onError: "continueRegularOutput",  parameters: { method: "GET", url: expr(CRM_BASE_URL + "/whatsapp/automation/candidates?limit=100{{ $json.cursor ? '&cursor=' + encodeURIComponent($json.cursor) : '' }}"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: cursor B').item.json.tenantSlug }}") }] },  options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const pageB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: página B pronta", position: [700, 0], parameters: { mode: "runOnceForAllItems", jsCode: "const B_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nfunction bDate(value) { return typeof value === \"string\" && Number.isFinite(Date.parse(value)); }\n\n/** CRM owns eligibility and the opaque cursor; an empty page still advances. */\nfunction candidatePageJobs(response, page) {\n  if (response?.error || !Array.isArray(response?.candidates) || response.candidates.length > 100 || !bDate(response.cutoffAt)\n      || !(response.nextCursor === null || (typeof response.nextCursor === \"string\" && response.nextCursor.length > 0))\n      || (page.cutoffAt && page.cutoffAt !== response.cutoffAt) || (response.nextCursor && response.nextCursor === page.cursor)) throw new Error(\"candidate-page-unavailable\");\n  const context = { ...page, cutoffAt: response.cutoffAt, nextCursor: response.nextCursor };\n  const jobs = response.candidates.map(candidate => {\n    if (!candidate || !B_UUID.test(candidate.leadId) || !B_UUID.test(candidate.anchorMessageId) || !bDate(candidate.anchorSentAt)\n        || typeof candidate.phoneNumberId !== \"string\" || !/^\\d{1,32}$/.test(candidate.phoneNumberId) || ![\"prepare\", \"omit\", \"escalate\"].includes(candidate.action)) throw new Error(\"candidate-page-unavailable\");\n    return { ...context, leadId: candidate.leadId, anchorMessageId: candidate.anchorMessageId, anchorSentAt: candidate.anchorSentAt, phoneNumberId: candidate.phoneNumberId, action: candidate.action, pageStart: true };\n  });\n  return jobs.length ? jobs : [{ ...context, action: \"empty\", pageStart: true }];\n}\n\nfunction preparationClaim(response, candidate, now) {\n  if (response?.error || !B_UUID.test(response?.episodeId) || !B_UUID.test(response?.claimToken) || !bDate(response?.claimExpiresAt)\n      || Date.parse(response.claimExpiresAt) <= now || !response.frame || !B_UUID.test(response.frame.tenantId) || (candidate.tenantId && response.frame.tenantId !== candidate.tenantId) || response.frame.leadId !== candidate.leadId\n      || response.frame.episodeId !== response.episodeId || response.frame.phoneNumberId !== candidate.phoneNumberId\n      || response.frame.anchor?.id !== candidate.anchorMessageId || response.frame.anchor?.sentAt !== candidate.anchorSentAt\n      || !Number.isSafeInteger(response.agentStateRevision) || response.frame.agent?.revision !== response.agentStateRevision) return { ...candidate, claimed: false, outcome: \"claim-unavailable\" };\n  return { ...candidate, claimed: true, episodeId: response.episodeId, claimToken: response.claimToken, frame: response.frame, deadline: Math.min(now + 120000, Date.parse(response.claimExpiresAt)) };\n}\n\nfunction generationForDispatch(response, claim, now) {\n  let code = \"generation-failed\", text = typeof response?.text === \"string\" ? response.text.trim() : \"\";\n  if (now >= claim.deadline) code = \"generation-timeout\";\n  else if ([\"generation-timeout\", \"context-read-failed\", \"invalid-text\"].includes(response?.code)) code = response.code;\n  else if (response?.ok === true && !response.error) {\n    if (text && text.length <= 4096) return { ...claim, valid: true, text };\n    code = \"invalid-text\";\n  }\n  return { ...claim, valid: false, failureCode: code };\n}\n\n/** Acceptance identity comes only from send, never generation or the clock. */\nfunction acknowledgementForSend(response, claim) {\n  const valid = !response?.error && response?.episodeId === claim.episodeId && response.state === \"accepted_pending_record\"\n    && typeof response.wamid === \"string\" && response.wamid.trim() === response.wamid && response.wamid.length > 0 && response.wamid.length <= 2048 && bDate(response.acceptedAt);\n  return { ...claim, needsAck: valid, ...(valid ? { acknowledgement: { wamid: response.wamid, acceptedAt: response.acceptedAt } } : {}), outcome: typeof response?.state === \"string\" ? response.state : \"uncertain\" };\n}" + "\nreturn candidatePageJobs($input.first().json, $('Code: cursor B').item.json).map(json => ({ json }));" } }, output: [{}] });
const candidatesLoopB = splitInBatches({ version: 3, config: { name: "Loop: candidatos B", position: [600, 0], parameters: { batchSize: 1, options: { reset: expr("{{ $json.pageStart === true }}") } } } });
const candidateB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: candidato B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "return { json: $json }; " } }, output: [{}] });
const candidateRouteB = switchCase({ version: 3.4, config: { name: "Switch: ação B", position: [800, 0], parameters: { mode: "rules", rules: { values: ["prepare", "omit"].map(action => ({ conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.action }}"), operator: { type: "string", operation: "equals" }, rightValue: action }], combinator: "and" } })) }, options: { fallbackOutput: "extra" } } } });
// Live conduction is an early read; prepare and send also revalidate under CRM locks.
const getLeadForReengagement = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: GET /leads/{id} (reengajamento)", position: [900, 0], onError: "continueErrorOutput", parameters: { method: "GET", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $json.tenantSlug }}") }] } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const conductionForReengagement = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: condução ao vivo (reengajamento)", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "/**\n * Regra única de condução da conversa (lote-14 — design.md C2; AD-034).\n * Funções puras, sem I/O, sem dependências: rodam inline nos Code nodes do\n * n8n e são importadas pelo CRM (`src/lib/conversation-control.ts`), para que\n * a regra \"quem conduz\" tenha uma fonte só.\n */\n\n/**\n * @typedef {{status?: unknown, humanTakeoverAt?: unknown, optedOutAt?: unknown}} ConductionLead\n */\n\n/**\n * Conduzido por humano: tem a marca de condução humana **ou** está em\n * `escalado_humano` (ASSUMIR-01 AC7).\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction isHumanConducted({ status, humanTakeoverAt }) {\n  return Boolean(humanTakeoverAt) || status === \"escalado_humano\";\n}\n\n/**\n * O agente pode enviar dentro do turno em andamento (SILENCIO-01 AC4)?\n * Olha só a marca e o opt-out. **Nunca** bloqueia por `escalado_humano`: o\n * agente que acabou de escalar ainda precisa enviar a mensagem de passagem\n * (`system-message.mjs`).\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction canAgentSendInTurn({ optedOutAt, humanTakeoverAt }) {\n  return !optedOutAt && !humanTakeoverAt;\n}\n\n/**\n * O agente pode iniciar contato sem mensagem do lead (reengajamento,\n * escalonamento por silêncio — SILENCIO-01 AC6/AC7)?\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction canAgentContactProactively(lead) {\n  return !lead.optedOutAt && !isHumanConducted(lead);\n}\n\n/**\n * @param {unknown} value\n * @returns {boolean}\n */\nfunction isAbsent(value) {\n  return value === null || value === undefined || value === \"\";\n}\n\n/**\n * @param {unknown} value\n * @returns {number}\n */\nfunction toTime(value) {\n  if (value instanceof Date) return value.getTime();\n  if (typeof value !== \"string\" && typeof value !== \"number\") return Number.NaN;\n  return new Date(value).getTime();\n}\n\n/**\n * O pedido de reconstrução da memória ainda não foi atendido? Devido só\n * quando o pedido é **estritamente** mais novo que o último atendido: pedido\n * igual ao atendido já foi consumido (DEVOLVER-01 AC7). Data inválida nunca\n * dispara a purga.\n * @param {unknown} requestedAt - `memoryResetRequestedAt` do lead no CRM\n * @param {unknown} honoredAt - `memoryResetAt` de `conversa_estado` no n8n\n * @returns {boolean}\n */\nfunction memoryResetDue(requestedAt, honoredAt) {\n  if (isAbsent(requestedAt)) return false;\n  const requested = toTime(requestedAt);\n  if (Number.isNaN(requested)) return false;\n  if (isAbsent(honoredAt)) return true;\n  const honored = toTime(honoredAt);\n  if (Number.isNaN(honored)) return false;\n  return requested > honored;\n}" + "\nconst conversa = $('Code: candidato B').item.json; const lead = $json; return { json: { ...conversa, podeContatar: canAgentContactProactively({ status: lead.status, optedOutAt: lead.optedOutAt, humanTakeoverAt: lead.humanTakeoverAt }) } }; " } }, output: [{}] });
const canContactForReengagement = ifElse({ version: 2.3, config: { name: "Filter: agente pode contatar (reengajamento)", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.podeContatar" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const prepareB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: preparar B", position: [1100, 0], onError: "continueRegularOutput",  parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/prepare"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: candidato B').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "{ anchorMessageId: $json.anchorMessageId }" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const claimB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: claim B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "const B_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nfunction bDate(value) { return typeof value === \"string\" && Number.isFinite(Date.parse(value)); }\n\n/** CRM owns eligibility and the opaque cursor; an empty page still advances. */\nfunction candidatePageJobs(response, page) {\n  if (response?.error || !Array.isArray(response?.candidates) || response.candidates.length > 100 || !bDate(response.cutoffAt)\n      || !(response.nextCursor === null || (typeof response.nextCursor === \"string\" && response.nextCursor.length > 0))\n      || (page.cutoffAt && page.cutoffAt !== response.cutoffAt) || (response.nextCursor && response.nextCursor === page.cursor)) throw new Error(\"candidate-page-unavailable\");\n  const context = { ...page, cutoffAt: response.cutoffAt, nextCursor: response.nextCursor };\n  const jobs = response.candidates.map(candidate => {\n    if (!candidate || !B_UUID.test(candidate.leadId) || !B_UUID.test(candidate.anchorMessageId) || !bDate(candidate.anchorSentAt)\n        || typeof candidate.phoneNumberId !== \"string\" || !/^\\d{1,32}$/.test(candidate.phoneNumberId) || ![\"prepare\", \"omit\", \"escalate\"].includes(candidate.action)) throw new Error(\"candidate-page-unavailable\");\n    return { ...context, leadId: candidate.leadId, anchorMessageId: candidate.anchorMessageId, anchorSentAt: candidate.anchorSentAt, phoneNumberId: candidate.phoneNumberId, action: candidate.action, pageStart: true };\n  });\n  return jobs.length ? jobs : [{ ...context, action: \"empty\", pageStart: true }];\n}\n\nfunction preparationClaim(response, candidate, now) {\n  if (response?.error || !B_UUID.test(response?.episodeId) || !B_UUID.test(response?.claimToken) || !bDate(response?.claimExpiresAt)\n      || Date.parse(response.claimExpiresAt) <= now || !response.frame || !B_UUID.test(response.frame.tenantId) || (candidate.tenantId && response.frame.tenantId !== candidate.tenantId) || response.frame.leadId !== candidate.leadId\n      || response.frame.episodeId !== response.episodeId || response.frame.phoneNumberId !== candidate.phoneNumberId\n      || response.frame.anchor?.id !== candidate.anchorMessageId || response.frame.anchor?.sentAt !== candidate.anchorSentAt\n      || !Number.isSafeInteger(response.agentStateRevision) || response.frame.agent?.revision !== response.agentStateRevision) return { ...candidate, claimed: false, outcome: \"claim-unavailable\" };\n  return { ...candidate, claimed: true, episodeId: response.episodeId, claimToken: response.claimToken, frame: response.frame, deadline: Math.min(now + 120000, Date.parse(response.claimExpiresAt)) };\n}\n\nfunction generationForDispatch(response, claim, now) {\n  let code = \"generation-failed\", text = typeof response?.text === \"string\" ? response.text.trim() : \"\";\n  if (now >= claim.deadline) code = \"generation-timeout\";\n  else if ([\"generation-timeout\", \"context-read-failed\", \"invalid-text\"].includes(response?.code)) code = response.code;\n  else if (response?.ok === true && !response.error) {\n    if (text && text.length <= 4096) return { ...claim, valid: true, text };\n    code = \"invalid-text\";\n  }\n  return { ...claim, valid: false, failureCode: code };\n}\n\n/** Acceptance identity comes only from send, never generation or the clock. */\nfunction acknowledgementForSend(response, claim) {\n  const valid = !response?.error && response?.episodeId === claim.episodeId && response.state === \"accepted_pending_record\"\n    && typeof response.wamid === \"string\" && response.wamid.trim() === response.wamid && response.wamid.length > 0 && response.wamid.length <= 2048 && bDate(response.acceptedAt);\n  return { ...claim, needsAck: valid, ...(valid ? { acknowledgement: { wamid: response.wamid, acceptedAt: response.acceptedAt } } : {}), outcome: typeof response?.state === \"string\" ? response.state : \"uncertain\" };\n}" + "\nreturn { json: preparationClaim($json, $('Code: candidato B').item.json, Date.now()) }; " } }, output: [{}] });
const claimedB = ifElse({ version: 2.3, config: { name: "Claim B adquirida?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.claimed" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const generateB = node({ type: "n8n-nodes-base.executeWorkflow", version: 1.3, config: { name: "Executar: geração B readonly", position: [1200, 0], onError: "continueRegularOutput", parameters: { source: "parameter", mode: "each", workflowJson: JSON.stringify(readonlyGeneration.toJSON()), options: { waitForSubWorkflow: true } } }, output: [{}] });
const validateB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: geração B validada", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "const B_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nfunction bDate(value) { return typeof value === \"string\" && Number.isFinite(Date.parse(value)); }\n\n/** CRM owns eligibility and the opaque cursor; an empty page still advances. */\nfunction candidatePageJobs(response, page) {\n  if (response?.error || !Array.isArray(response?.candidates) || response.candidates.length > 100 || !bDate(response.cutoffAt)\n      || !(response.nextCursor === null || (typeof response.nextCursor === \"string\" && response.nextCursor.length > 0))\n      || (page.cutoffAt && page.cutoffAt !== response.cutoffAt) || (response.nextCursor && response.nextCursor === page.cursor)) throw new Error(\"candidate-page-unavailable\");\n  const context = { ...page, cutoffAt: response.cutoffAt, nextCursor: response.nextCursor };\n  const jobs = response.candidates.map(candidate => {\n    if (!candidate || !B_UUID.test(candidate.leadId) || !B_UUID.test(candidate.anchorMessageId) || !bDate(candidate.anchorSentAt)\n        || typeof candidate.phoneNumberId !== \"string\" || !/^\\d{1,32}$/.test(candidate.phoneNumberId) || ![\"prepare\", \"omit\", \"escalate\"].includes(candidate.action)) throw new Error(\"candidate-page-unavailable\");\n    return { ...context, leadId: candidate.leadId, anchorMessageId: candidate.anchorMessageId, anchorSentAt: candidate.anchorSentAt, phoneNumberId: candidate.phoneNumberId, action: candidate.action, pageStart: true };\n  });\n  return jobs.length ? jobs : [{ ...context, action: \"empty\", pageStart: true }];\n}\n\nfunction preparationClaim(response, candidate, now) {\n  if (response?.error || !B_UUID.test(response?.episodeId) || !B_UUID.test(response?.claimToken) || !bDate(response?.claimExpiresAt)\n      || Date.parse(response.claimExpiresAt) <= now || !response.frame || !B_UUID.test(response.frame.tenantId) || (candidate.tenantId && response.frame.tenantId !== candidate.tenantId) || response.frame.leadId !== candidate.leadId\n      || response.frame.episodeId !== response.episodeId || response.frame.phoneNumberId !== candidate.phoneNumberId\n      || response.frame.anchor?.id !== candidate.anchorMessageId || response.frame.anchor?.sentAt !== candidate.anchorSentAt\n      || !Number.isSafeInteger(response.agentStateRevision) || response.frame.agent?.revision !== response.agentStateRevision) return { ...candidate, claimed: false, outcome: \"claim-unavailable\" };\n  return { ...candidate, claimed: true, episodeId: response.episodeId, claimToken: response.claimToken, frame: response.frame, deadline: Math.min(now + 120000, Date.parse(response.claimExpiresAt)) };\n}\n\nfunction generationForDispatch(response, claim, now) {\n  let code = \"generation-failed\", text = typeof response?.text === \"string\" ? response.text.trim() : \"\";\n  if (now >= claim.deadline) code = \"generation-timeout\";\n  else if ([\"generation-timeout\", \"context-read-failed\", \"invalid-text\"].includes(response?.code)) code = response.code;\n  else if (response?.ok === true && !response.error) {\n    if (text && text.length <= 4096) return { ...claim, valid: true, text };\n    code = \"invalid-text\";\n  }\n  return { ...claim, valid: false, failureCode: code };\n}\n\n/** Acceptance identity comes only from send, never generation or the clock. */\nfunction acknowledgementForSend(response, claim) {\n  const valid = !response?.error && response?.episodeId === claim.episodeId && response.state === \"accepted_pending_record\"\n    && typeof response.wamid === \"string\" && response.wamid.trim() === response.wamid && response.wamid.length > 0 && response.wamid.length <= 2048 && bDate(response.acceptedAt);\n  return { ...claim, needsAck: valid, ...(valid ? { acknowledgement: { wamid: response.wamid, acceptedAt: response.acceptedAt } } : {}), outcome: typeof response?.state === \"string\" ? response.state : \"uncertain\" };\n}" + "\nreturn { json: generationForDispatch($json, $('Code: claim B').item.json, Date.now()) }; " } }, output: [{}] });
const validB = ifElse({ version: 2.3, config: { name: "Texto B válido no prazo?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.valid" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const releaseB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: liberar preparação B", position: [1100, 0], onError: "continueRegularOutput", retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/{{ $json.episodeId }}/preparation-failure"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: geração B validada').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "{ claimToken: $json.claimToken, code: $json.failureCode }" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const sendB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: enviar B uma vez", position: [1100, 0], onError: "continueRegularOutput",  parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/{{ $json.episodeId }}/send"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: geração B validada').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "{ claimToken: $json.claimToken, text: $json.text }" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const sendResultB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: resultado B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "const B_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\nfunction bDate(value) { return typeof value === \"string\" && Number.isFinite(Date.parse(value)); }\n\n/** CRM owns eligibility and the opaque cursor; an empty page still advances. */\nfunction candidatePageJobs(response, page) {\n  if (response?.error || !Array.isArray(response?.candidates) || response.candidates.length > 100 || !bDate(response.cutoffAt)\n      || !(response.nextCursor === null || (typeof response.nextCursor === \"string\" && response.nextCursor.length > 0))\n      || (page.cutoffAt && page.cutoffAt !== response.cutoffAt) || (response.nextCursor && response.nextCursor === page.cursor)) throw new Error(\"candidate-page-unavailable\");\n  const context = { ...page, cutoffAt: response.cutoffAt, nextCursor: response.nextCursor };\n  const jobs = response.candidates.map(candidate => {\n    if (!candidate || !B_UUID.test(candidate.leadId) || !B_UUID.test(candidate.anchorMessageId) || !bDate(candidate.anchorSentAt)\n        || typeof candidate.phoneNumberId !== \"string\" || !/^\\d{1,32}$/.test(candidate.phoneNumberId) || ![\"prepare\", \"omit\", \"escalate\"].includes(candidate.action)) throw new Error(\"candidate-page-unavailable\");\n    return { ...context, leadId: candidate.leadId, anchorMessageId: candidate.anchorMessageId, anchorSentAt: candidate.anchorSentAt, phoneNumberId: candidate.phoneNumberId, action: candidate.action, pageStart: true };\n  });\n  return jobs.length ? jobs : [{ ...context, action: \"empty\", pageStart: true }];\n}\n\nfunction preparationClaim(response, candidate, now) {\n  if (response?.error || !B_UUID.test(response?.episodeId) || !B_UUID.test(response?.claimToken) || !bDate(response?.claimExpiresAt)\n      || Date.parse(response.claimExpiresAt) <= now || !response.frame || !B_UUID.test(response.frame.tenantId) || (candidate.tenantId && response.frame.tenantId !== candidate.tenantId) || response.frame.leadId !== candidate.leadId\n      || response.frame.episodeId !== response.episodeId || response.frame.phoneNumberId !== candidate.phoneNumberId\n      || response.frame.anchor?.id !== candidate.anchorMessageId || response.frame.anchor?.sentAt !== candidate.anchorSentAt\n      || !Number.isSafeInteger(response.agentStateRevision) || response.frame.agent?.revision !== response.agentStateRevision) return { ...candidate, claimed: false, outcome: \"claim-unavailable\" };\n  return { ...candidate, claimed: true, episodeId: response.episodeId, claimToken: response.claimToken, frame: response.frame, deadline: Math.min(now + 120000, Date.parse(response.claimExpiresAt)) };\n}\n\nfunction generationForDispatch(response, claim, now) {\n  let code = \"generation-failed\", text = typeof response?.text === \"string\" ? response.text.trim() : \"\";\n  if (now >= claim.deadline) code = \"generation-timeout\";\n  else if ([\"generation-timeout\", \"context-read-failed\", \"invalid-text\"].includes(response?.code)) code = response.code;\n  else if (response?.ok === true && !response.error) {\n    if (text && text.length <= 4096) return { ...claim, valid: true, text };\n    code = \"invalid-text\";\n  }\n  return { ...claim, valid: false, failureCode: code };\n}\n\n/** Acceptance identity comes only from send, never generation or the clock. */\nfunction acknowledgementForSend(response, claim) {\n  const valid = !response?.error && response?.episodeId === claim.episodeId && response.state === \"accepted_pending_record\"\n    && typeof response.wamid === \"string\" && response.wamid.trim() === response.wamid && response.wamid.length > 0 && response.wamid.length <= 2048 && bDate(response.acceptedAt);\n  return { ...claim, needsAck: valid, ...(valid ? { acknowledgement: { wamid: response.wamid, acceptedAt: response.acceptedAt } } : {}), outcome: typeof response?.state === \"string\" ? response.state : \"uncertain\" };\n}" + "\nreturn { json: acknowledgementForSend($json, $('Code: geração B validada').item.json) }; " } }, output: [{}] });
const needsAckB = ifElse({ version: 2.3, config: { name: "Aceite B precisa registro?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.needsAck" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const acknowledgeB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: acknowledgement B", position: [1100, 0], onError: "continueRegularOutput", retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/{{ $json.episodeId }}/acknowledgement"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: resultado B').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "$json.acknowledgement" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const omitB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: omitir B", position: [1100, 0], onError: "continueRegularOutput", retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/expire"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: candidato B').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "{ anchorMessageId: $json.anchorMessageId }" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const endB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: concluir candidato B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "const candidate = $('Code: candidato B').item.json; return { json: { ...candidate, pageStart: false, outcome: $json.error ? 'crm-unavailable' : ($json.outcome || ($json.podeContatar === false ? 'contact-denied' : 'processed')) } }; " } }, output: [{}] });
const nextPageB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: próxima página B", position: [700, 0], parameters: { mode: "runOnceForAllItems", jsCode: "const last = $input.all().at(-1)?.json; if (!last) throw new Error('candidate-page-unavailable'); return [{ json: { tenantSlug: last.tenantSlug, cursor: last.nextCursor, cutoffAt: last.cutoffAt } }];" } }, output: [{}] });
const hasNextPageB = ifElse({ version: 2.3, config: { name: "Há próxima página B?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.cursor !== null" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });

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

// lote-14 (T26 — SILENCIO-01 AC6/AC7): relê o lead ao vivo antes do contato
// proativo. `fase` em `conversa_estado` não sabe da marca de condução humana
// (gravada pelo CRM), então só o CRM decide. Falha da leitura: saída de erro
// sem ligação — o item cai sem contato e as outras varreduras do tick seguem.
const getLeadForEscalation = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: GET /leads/{id} (escalonamento)",
    position: [650, 250],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueErrorOutput",
    parameters: {
      method: "GET",
      url: expr(`${CRM_BASE_URL}/leads/{{ $json.leadId }}`),
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $json.tenantSlug }}") }] },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "em_qualificacao", optedOutAt: null, humanTakeoverAt: null, memoryResetRequestedAt: null }],
});

const conductionForEscalation = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: condução ao vivo (escalonamento)",
    position: [780, 250],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "/**\n * Regra única de condução da conversa (lote-14 — design.md C2; AD-034).\n * Funções puras, sem I/O, sem dependências: rodam inline nos Code nodes do\n * n8n e são importadas pelo CRM (`src/lib/conversation-control.ts`), para que\n * a regra \"quem conduz\" tenha uma fonte só.\n */\n\n/**\n * @typedef {{status?: unknown, humanTakeoverAt?: unknown, optedOutAt?: unknown}} ConductionLead\n */\n\n/**\n * Conduzido por humano: tem a marca de condução humana **ou** está em\n * `escalado_humano` (ASSUMIR-01 AC7).\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction isHumanConducted({ status, humanTakeoverAt }) {\n  return Boolean(humanTakeoverAt) || status === \"escalado_humano\";\n}\n\n/**\n * O agente pode enviar dentro do turno em andamento (SILENCIO-01 AC4)?\n * Olha só a marca e o opt-out. **Nunca** bloqueia por `escalado_humano`: o\n * agente que acabou de escalar ainda precisa enviar a mensagem de passagem\n * (`system-message.mjs`).\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction canAgentSendInTurn({ optedOutAt, humanTakeoverAt }) {\n  return !optedOutAt && !humanTakeoverAt;\n}\n\n/**\n * O agente pode iniciar contato sem mensagem do lead (reengajamento,\n * escalonamento por silêncio — SILENCIO-01 AC6/AC7)?\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction canAgentContactProactively(lead) {\n  return !lead.optedOutAt && !isHumanConducted(lead);\n}\n\n/**\n * @param {unknown} value\n * @returns {boolean}\n */\nfunction isAbsent(value) {\n  return value === null || value === undefined || value === \"\";\n}\n\n/**\n * @param {unknown} value\n * @returns {number}\n */\nfunction toTime(value) {\n  if (value instanceof Date) return value.getTime();\n  if (typeof value !== \"string\" && typeof value !== \"number\") return Number.NaN;\n  return new Date(value).getTime();\n}\n\n/**\n * O pedido de reconstrução da memória ainda não foi atendido? Devido só\n * quando o pedido é **estritamente** mais novo que o último atendido: pedido\n * igual ao atendido já foi consumido (DEVOLVER-01 AC7). Data inválida nunca\n * dispara a purga.\n * @param {unknown} requestedAt - `memoryResetRequestedAt` do lead no CRM\n * @param {unknown} honoredAt - `memoryResetAt` de `conversa_estado` no n8n\n * @returns {boolean}\n */\nfunction memoryResetDue(requestedAt, honoredAt) {\n  if (isAbsent(requestedAt)) return false;\n  const requested = toTime(requestedAt);\n  if (Number.isNaN(requested)) return false;\n  if (isAbsent(honoredAt)) return true;\n  const honored = toTime(honoredAt);\n  if (Number.isNaN(honored)) return false;\n  return requested > honored;\n}" +
        "\n\n" +
        "const conversa = $('Filter: exclui encerradas (escalonamento)').item.json;\n" +
        "const lead = $json;\n" +
        "return { json: { ...conversa, podeContatar: canAgentContactProactively({ status: lead.status, humanTakeoverAt: lead.humanTakeoverAt, optedOutAt: lead.optedOutAt }) } };\n",
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando", podeContatar: true }],
});

const canContactForEscalation = node({
  type: "n8n-nodes-base.filter",
  version: 2.3,
  config: {
    name: "Filter: agente pode contatar (escalonamento)",
    position: [910, 250],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.podeContatar }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando", podeContatar: true }],
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
  output: [{ phoneNumberId: "109876543210001", tenantSlug: "vale-do-uberaba" }],
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
        "return { json: { tenantSlug: conversa.tenantSlug, waId: conversa.waId, leadId: conversa.leadId } };\n",
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }],
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $json.tenantSlug }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { status: 'escalado_humano', escalationReason: 'ausência de resposta', executiveSummary: 'Lead silencioso por mais de 48h após reengajamento único.' } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
// Varredura D — Purga pedida pelo CRM (lote-14 — T27; OPTHUM-01 AC6,
// DEVOLVER-01). Devolução ao agente e opt-out registrado pelo CRM gravam
// `memoryResetRequestedAt` no lead; o lead pode nunca mais escrever, então a
// purga não pode depender de um turno do principal. Mesmo trigger (R3).
// Idempotente com o principal: os dois só purgam quando o pedido é mais novo
// que `memoryResetAt`, e reconstruir a partir do CRM dá o mesmo conteúdo.
// =======================================================================

const getTenantsForPurge = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: tenants (purga pedida pelo CRM)",
    position: [260, 800],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: TENANT_CONFIG_TABLE_ID },
      returnAll: true,
    },
  },
  output: [{ phoneNumberId: "109876543210001", tenantSlug: "vale-do-uberaba", calendarId: "exemplo" }],
});

// CRM fora: `continueRegularOutput` — a janela de 24h do `since` repete o
// pedido no próximo tick (purga atrasada, nunca perdida dentro de 24h).
const getMemoryResets = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: GET /memory-resets (purga pedida pelo CRM)",
    position: [520, 800],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueRegularOutput",
    parameters: {
      method: "GET",
      url: `${CRM_BASE_URL}/memory-resets`,
      sendQuery: true,
      queryParameters: { parameters: [{ name: "since", value: expr("{{ $now.minus({ hours: 24 }).toISO() }}") }] },
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $json.tenantSlug }}") }] },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
  },
  output: [{ resets: [{ leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", waId: "5534999990001", requestedAt: "2026-10-01T12:00:00.000Z" }] }],
});

// Guarda antes do Split: a resposta de erro (CRM fora) não tem `resets`, e o
// Split precisa do campo. Sem pedidos, `resets` vazio termina a cadeia sem
// erro. Leva o tenant junto, porque a resposta do CRM não o repete.
const normalizeMemoryResets = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: pedidos de purga do tenant",
    position: [780, 800],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "const tenant = $('Data Table: tenants (purga pedida pelo CRM)').item.json;\n" +
        "return { json: { tenantSlug: tenant.tenantSlug, resets: Array.isArray($json.resets) ? $json.resets : [] } };\n",
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", resets: [{ leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", waId: "5534999990001", requestedAt: "2026-10-01T12:00:00.000Z" }] }],
});

const splitMemoryResets = node({
  type: "n8n-nodes-base.splitOut",
  version: 1,
  config: {
    name: "Split: pedidos de purga",
    position: [1040, 800],
    parameters: { fieldToSplitOut: "resets", include: "allOtherFields" },
  },
  output: [{ tenantSlug: "vale-do-uberaba", resets: { leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", waId: "5534999990001", requestedAt: "2026-10-01T12:00:00.000Z" } }],
});

const lookupConversaForPurge = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: conversa_estado (purga pedida pelo CRM)",
    position: [1300, 800],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $json.resets.waId }}") },
        ],
      },
      returnAll: false,
      limit: 1,
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", memoryResetAt: "" }],
});

// `sessionId` é montado exatamente como a `sessionKey` do
// `memoryPostgresChat` do principal: `<tenantSlug>:<waId>`.
const decideMemoryResetDue = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: reset devido?",
    position: [1560, 800],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "/**\n * Regra única de condução da conversa (lote-14 — design.md C2; AD-034).\n * Funções puras, sem I/O, sem dependências: rodam inline nos Code nodes do\n * n8n e são importadas pelo CRM (`src/lib/conversation-control.ts`), para que\n * a regra \"quem conduz\" tenha uma fonte só.\n */\n\n/**\n * @typedef {{status?: unknown, humanTakeoverAt?: unknown, optedOutAt?: unknown}} ConductionLead\n */\n\n/**\n * Conduzido por humano: tem a marca de condução humana **ou** está em\n * `escalado_humano` (ASSUMIR-01 AC7).\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction isHumanConducted({ status, humanTakeoverAt }) {\n  return Boolean(humanTakeoverAt) || status === \"escalado_humano\";\n}\n\n/**\n * O agente pode enviar dentro do turno em andamento (SILENCIO-01 AC4)?\n * Olha só a marca e o opt-out. **Nunca** bloqueia por `escalado_humano`: o\n * agente que acabou de escalar ainda precisa enviar a mensagem de passagem\n * (`system-message.mjs`).\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction canAgentSendInTurn({ optedOutAt, humanTakeoverAt }) {\n  return !optedOutAt && !humanTakeoverAt;\n}\n\n/**\n * O agente pode iniciar contato sem mensagem do lead (reengajamento,\n * escalonamento por silêncio — SILENCIO-01 AC6/AC7)?\n * @param {ConductionLead} lead\n * @returns {boolean}\n */\nfunction canAgentContactProactively(lead) {\n  return !lead.optedOutAt && !isHumanConducted(lead);\n}\n\n/**\n * @param {unknown} value\n * @returns {boolean}\n */\nfunction isAbsent(value) {\n  return value === null || value === undefined || value === \"\";\n}\n\n/**\n * @param {unknown} value\n * @returns {number}\n */\nfunction toTime(value) {\n  if (value instanceof Date) return value.getTime();\n  if (typeof value !== \"string\" && typeof value !== \"number\") return Number.NaN;\n  return new Date(value).getTime();\n}\n\n/**\n * O pedido de reconstrução da memória ainda não foi atendido? Devido só\n * quando o pedido é **estritamente** mais novo que o último atendido: pedido\n * igual ao atendido já foi consumido (DEVOLVER-01 AC7). Data inválida nunca\n * dispara a purga.\n * @param {unknown} requestedAt - `memoryResetRequestedAt` do lead no CRM\n * @param {unknown} honoredAt - `memoryResetAt` de `conversa_estado` no n8n\n * @returns {boolean}\n */\nfunction memoryResetDue(requestedAt, honoredAt) {\n  if (isAbsent(requestedAt)) return false;\n  const requested = toTime(requestedAt);\n  if (Number.isNaN(requested)) return false;\n  if (isAbsent(honoredAt)) return true;\n  const honored = toTime(honoredAt);\n  if (Number.isNaN(honored)) return false;\n  return requested > honored;\n}" +
        "\n\n" +
        "const pedido = $('Split: pedidos de purga').item.json;\n" +
        "const row = $json;\n" +
        "const tenantSlug = pedido.tenantSlug;\n" +
        "const waId = pedido.resets.waId;\n" +
        "const requestedAt = pedido.resets.requestedAt;\n" +
        "return { json: { tenantSlug, waId, leadId: pedido.resets.leadId, requestedAt, sessionId: tenantSlug + ':' + waId, resetDue: memoryResetDue(requestedAt, row.memoryResetAt || null) } };\n",
    },
  },
  output: [{ tenantSlug: "vale-do-uberaba", waId: "5534999990001", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", requestedAt: "2026-10-01T12:00:00.000Z", sessionId: "vale-do-uberaba:5534999990001", resetDue: true }],
});

const isMemoryResetDueIf = ifElse({
  version: 2.3,
  config: {
    name: "Reset devido?",
    position: [1820, 800],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.resetDue }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

// DELETE parametrizado (tabela e coluna confirmadas na T1, execução 2802).
// A CTE devolve sempre uma linha por sessão, mesmo sem nada a apagar, para a
// purga de `conversa_estado` seguir. Memória primeiro: se o DELETE falhar,
// `memoryResetAt` não é gravado e o pedido segue devido no próximo tick.
const deleteAgentSession = node({
  type: "n8n-nodes-base.postgres",
  version: 2.7,
  config: {
    name: "Postgres: apagar sessão",
    position: [2080, 800],
    parameters: {
      operation: "executeQuery",
      query:
        "WITH apagadas AS (DELETE FROM n8n_chat_histories WHERE session_id = $1::text RETURNING 1) SELECT $1::text AS session_id, count(*)::int AS apagadas FROM apagadas",
      options: { queryReplacement: expr("{{ $json.sessionId }}") },
    },
    credentials: { postgres: newCredential("Postgres n8n local") },
  },
  output: [{ session_id: "vale-do-uberaba:5534999990001", apagadas: 4 }],
});

const purgeConversaEstadoOnCrmReset = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: purgar qualificação e persona (purga pedida pelo CRM)",
    position: [2340, 800],
    parameters: {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: reset devido?').item.json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: reset devido?').item.json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          tenantSlug: expr("{{ $('Code: reset devido?').item.json.tenantSlug }}"),
          waId: expr("{{ $('Code: reset devido?').item.json.waId }}"),
          perguntadosJson: "[]",
          aberturasJson: "[]",
          memoryResetAt: expr("{{ $('Code: reset devido?').item.json.requestedAt }}"),
        },
        schema: [
          { id: "tenantSlug", displayName: "tenantSlug", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "waId", displayName: "waId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "perguntadosJson", displayName: "perguntadosJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "aberturasJson", displayName: "aberturasJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "memoryResetAt", displayName: "memoryResetAt", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
        ],
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
  .onCase(1, sendReminderText.to(markSentWired))
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

// A single checkpoint belongs to each tenant/page/candidate run; no repeated .first reads.
const endBWired = endB.to(nextBatch(candidatesLoopB));
const acknowledgementBWired = sendResultB.to(needsAckB.onTrue(acknowledgeB.to(endBWired)).onFalse(endBWired));
const dispatchBWired = validateB.to(validB.onTrue(sendB.to(acknowledgementBWired)).onFalse(releaseB.to(endBWired)));
const prepareBWired = prepareB.to(claimB.to(claimedB.onTrue(generateB.to(dispatchBWired)).onFalse(endBWired)));
const contactBWired = getLeadForReengagement.to(conductionForReengagement.to(canContactForReengagement.onTrue(prepareBWired).onFalse(endBWired))).onError(endBWired);
const candidateBWired = candidateB.to(candidateRouteB.onCase(0, contactBWired).onCase(1, omitB.to(endBWired)).onCase(2, endBWired));
const pageBWired = candidatesLoopB.onEachBatch(candidateBWired).onDone(nextPageB.to(hasNextPageB.onTrue(cursorB).onFalse(nextBatch(tenantsLoopB))));
const reengajamentoChain = getTenantsForB.to(uniqueTenantsB.to(tenantsLoopB.onEachBatch(cursorB.to(candidatesB.to(pageB.to(pageBWired))))));

const escalonamentoChain = getSilentReengaged.to(
  excludeClosedForEscalation.to(
    getLeadForEscalation.to(
      conductionForEscalation.to(
        canContactForEscalation.to(
          lookupTenantForEscalation.to(
            mergeEscalationContext.to(patchEscalateSilence.to(markEscalatedLocally))
          )
        )
      )
    )
  )
);

scheduleEveryFifteenMinutes.to(lembretesChain);
scheduleEveryFifteenMinutes.to(reengajamentoChain);
scheduleEveryFifteenMinutes.to(escalonamentoChain);

// lote-14 (T27): a saída falsa do IF fica sem ligação — pedido já atendido.
const purgaPedidaChain = getTenantsForPurge.to(
  getMemoryResets.to(
    normalizeMemoryResets.to(
      splitMemoryResets.to(
        lookupConversaForPurge.to(
          decideMemoryResetDue.to(isMemoryResetDueIf.onTrue(deleteAgentSession.to(purgeConversaEstadoOnCrmReset)))
        )
      )
    )
  )
);
scheduleEveryFifteenMinutes.to(purgaPedidaChain);

const schedulerWorkflow = workflow("crivo-agente-scheduler", "crivo-agente-scheduler").add(scheduleEveryFifteenMinutes);
schedulerWorkflow.regenerateNodeIds(new Map());
export default schedulerWorkflow;
