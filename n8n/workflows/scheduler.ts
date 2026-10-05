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
const pageB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: página B pronta", position: [700, 0], parameters: { mode: "runOnceForAllItems", jsCode: '__INLINE(scheduler-reengagement.mjs)__' + "\nreturn candidatePageJobs($input.first().json, $('Code: cursor B').item.json).map(json => ({ json }));" } }, output: [{}] });
const candidatesLoopB = splitInBatches({ version: 3, config: { name: "Loop: candidatos B", position: [600, 0], parameters: { batchSize: 1, options: { reset: expr("{{ $json.pageStart === true }}") } } } });
const candidateB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: candidato B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "return { json: $json }; " } }, output: [{}] });
const candidateRouteB = switchCase({ version: 3.4, config: { name: "Switch: ação B", position: [800, 0], parameters: { mode: "rules", rules: { values: ["prepare", "omit"].map(action => ({ conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.action }}"), operator: { type: "string", operation: "equals" }, rightValue: action }], combinator: "and" } })) }, options: { fallbackOutput: "extra" } } } });
// Live conduction is an early read; prepare and send also revalidate under CRM locks.
const getLeadForReengagement = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: GET /leads/{id} (reengajamento)", position: [900, 0], onError: "continueErrorOutput", parameters: { method: "GET", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $json.tenantSlug }}") }] } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const conductionForReengagement = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: condução ao vivo (reengajamento)", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: '__INLINE(conduction.mjs)__' + "\nconst conversa = $('Code: candidato B').item.json; const lead = $json; return { json: { ...conversa, podeContatar: canAgentContactProactively({ status: lead.status, optedOutAt: lead.optedOutAt, humanTakeoverAt: lead.humanTakeoverAt }) } }; " } }, output: [{}] });
const canContactForReengagement = ifElse({ version: 2.3, config: { name: "Filter: agente pode contatar (reengajamento)", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.podeContatar" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const prepareB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: preparar B", position: [1100, 0], onError: "continueRegularOutput",  parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/prepare"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: candidato B').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "{ anchorMessageId: $json.anchorMessageId }" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const claimB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: claim B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: '__INLINE(scheduler-reengagement.mjs)__' + "\nreturn { json: preparationClaim($json, $('Code: candidato B').item.json, Date.now()) }; " } }, output: [{}] });
const claimedB = ifElse({ version: 2.3, config: { name: "Claim B adquirida?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.claimed" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const generateB = node({ type: "n8n-nodes-base.executeWorkflow", version: 1.3, config: { name: "Executar: geração B readonly", position: [1200, 0], onError: "continueRegularOutput", parameters: { source: "parameter", mode: "each", workflowJson: JSON.stringify(readonlyGeneration.toJSON()), options: { waitForSubWorkflow: true } } }, output: [{}] });
const validateB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: geração B validada", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: '__INLINE(scheduler-reengagement.mjs)__' + "\nreturn { json: generationForDispatch($json, $('Code: claim B').item.json, Date.now()) }; " } }, output: [{}] });
const validB = ifElse({ version: 2.3, config: { name: "Texto B válido no prazo?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.valid" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const releaseB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: liberar preparação B", position: [1100, 0], onError: "continueRegularOutput", retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/{{ $json.episodeId }}/preparation-failure"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: geração B validada').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "{ claimToken: $json.claimToken, code: $json.failureCode }" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const sendB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: enviar B uma vez", position: [1100, 0], onError: "continueRegularOutput",  parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/{{ $json.episodeId }}/send"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: geração B validada').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "{ claimToken: $json.claimToken, text: $json.text }" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const sendResultB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: resultado B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: '__INLINE(scheduler-reengagement.mjs)__' + "\nreturn { json: acknowledgementForSend($json, $('Code: geração B validada').item.json) }; " } }, output: [{}] });
const needsAckB = ifElse({ version: 2.3, config: { name: "Aceite B precisa registro?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.needsAck" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const acknowledgeB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: acknowledgement B", position: [1100, 0], onError: "continueRegularOutput", retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/{{ $json.episodeId }}/acknowledgement"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: resultado B').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "$json.acknowledgement" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const omitB = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: omitir B", position: [1100, 0], onError: "continueRegularOutput", retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/expire"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: candidato B').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ " + "{ anchorMessageId: $json.anchorMessageId }" + " }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const endB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: concluir candidato B", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "const candidate = $('Code: candidato B').item.json; return { json: { ...candidate, pageStart: false, outcome: $json.error ? 'crm-unavailable' : ($json.outcome || ($json.podeContatar === false ? 'contact-denied' : 'processed')) } }; " } }, output: [{}] });
const nextPageB = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: próxima página B", position: [700, 0], parameters: { mode: "runOnceForAllItems", jsCode: "const last = $input.all().at(-1)?.json; if (!last) throw new Error('candidate-page-unavailable'); return [{ json: { tenantSlug: last.tenantSlug, cursor: last.nextCursor, cutoffAt: last.cutoffAt } }];" } }, output: [{}] });
const hasNextPageB = ifElse({ version: 2.3, config: { name: "Há próxima página B?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.cursor !== null" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });

// =======================================================================
// Varredura C — Expire CRM independente de retomada/horário.
const getTenantsForC = node({ type: "n8n-nodes-base.dataTable", version: 1.1, config: { name: "Data Table: tenants C", position: [260, 0], parameters: { resource: "row", operation: "get", dataTableId: { __rl: true, mode: "id", value: TENANT_CONFIG_TABLE_ID }, returnAll: true } }, output: [{}] });
const uniqueTenantsC = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: tenants únicos C", position: [700, 0], parameters: { mode: "runOnceForAllItems", jsCode: "const seen = new Set(); return $input.all().filter(item => { const slug = item.json.tenantSlug; if (typeof slug !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(slug) || seen.has(slug)) return false; seen.add(slug); return true; }).map(item => ({ json: { tenantSlug: item.json.tenantSlug, cursor: null, cutoffAt: null } }));" } }, output: [{}] });
const tenantsLoopC = splitInBatches({ version: 3, config: { name: "Loop: tenants C", position: [400, 0], parameters: { batchSize: 1 } } });
const cursorC = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: cursor C", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "return { json: $json }; " } }, output: [{}] });
const candidatesC = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: candidatos C", position: [1100, 0], onError: "continueRegularOutput",  parameters: { method: "GET", url: expr(CRM_BASE_URL + "/whatsapp/automation/candidates?limit=100{{ $json.cursor ? '&cursor=' + encodeURIComponent($json.cursor) : '' }}"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: cursor C').item.json.tenantSlug }}") }] },  options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const pageC = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: página C pronta", position: [700, 0], parameters: { mode: "runOnceForAllItems", jsCode: '__INLINE(scheduler-reengagement.mjs)__' + "\nreturn candidatePageJobs($input.first().json, $('Code: cursor C').item.json).map(json => ({ json }));" } }, output: [{}] });
const candidatesLoopC = splitInBatches({ version: 3, config: { name: "Loop: candidatos C", position: [600, 0], parameters: { batchSize: 1, options: { reset: expr("{{ $json.pageStart === true }}") } } } });
const candidateC = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: candidato C", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: "return { json: $json }; " } }, output: [{}] });
const getLeadForEscalation = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: GET /leads/{id} (escalonamento)", position: [900, 0], onError: "continueErrorOutput", parameters: { method: "GET", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $json.tenantSlug }}") }] } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const conductionForEscalation = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: condução ao vivo (escalonamento)", position: [700, 0], parameters: { mode: "runOnceForEachItem", jsCode: '__INLINE(conduction.mjs)__' + "\nconst conversa = $('Code: candidato C').item.json; const lead = $json; return { json: { ...conversa, podeContatar: canAgentContactProactively({ status: lead.status, optedOutAt: lead.optedOutAt, humanTakeoverAt: lead.humanTakeoverAt }) } }; " } }, output: [{}] });
const canContactForEscalation = ifElse({ version: 2.3, config: { name: "Filter: agente pode contatar (escalonamento)", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.podeContatar" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const nextPageC = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: próxima página C", position: [700, 0], parameters: { mode: "runOnceForAllItems", jsCode: "const last = $input.all().at(-1)?.json; if (!last) throw new Error('candidate-page-unavailable'); return [{ json: { tenantSlug: last.tenantSlug, cursor: last.nextCursor, cutoffAt: last.cutoffAt } }];" } }, output: [{}] });
const hasNextPageC = ifElse({ version: 2.3, config: { name: "Há próxima página C?", position: [900, 0], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ " + "$json.cursor !== null" + " }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const candidateRouteC = switchCase({ version: 3.4, config: { name: "Switch: ação C", position: [800, 400], parameters: { mode: "rules", rules: { values: [{ conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.action }}"), operator: { type: "string", operation: "equals" }, rightValue: "escalate" }], combinator: "and" } }] }, options: { fallbackOutput: "extra" } } } });
const expireC = node({ type: "n8n-nodes-base.httpRequest", version: 4.4, config: { name: "HTTP: expirar C", position: [1100, 400], retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: "continueRegularOutput", parameters: { method: "POST", url: expr(CRM_BASE_URL + "/leads/{{ $json.leadId }}/reengagement/expire"), authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: candidato C').item.json.tenantSlug }}") }] }, sendBody: true, contentType: "json", specifyBody: "json", jsonBody: expr("{{ { anchorMessageId: $json.anchorMessageId } }}"), options: { timeout: 15000 } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const confirmedExpiryC = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: expiração C confirmada", position: [1300, 400], parameters: { mode: "runOnceForEachItem", jsCode: '__INLINE(scheduler-reengagement.mjs)__' + "\nreturn { json: silenceExpiryResult($json, $('Code: candidato C').item.json) };" } }, output: [{}] });
const committedExpiryC = ifElse({ version: 2.3, config: { name: "Escalada C confirmada?", position: [1450, 400], parameters: { conditions: { combinator: "and", options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.committed }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }] } } } });
const mirrorExpiryC = node({ type: "n8n-nodes-base.dataTable", version: 1.1, config: { name: "Data Table: marcar escalado localmente", position: [1600, 400], retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, parameters: { resource: "row", operation: "update", dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID }, matchType: "allConditions", filters: { conditions: [{ keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $json.tenantSlug }}") }, { keyName: "leadId", condition: "eq", keyValue: expr("{{ $json.leadId }}") }] }, columns: { mappingMode: "defineBelow", value: { fase: "encerrada" }, schema: [{ id: "fase", displayName: "fase", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true }] } } }, output: [{}] });
const endC = node({ type: "n8n-nodes-base.code", version: 2, config: { name: "Code: concluir candidato C", position: [1800, 400], parameters: { mode: "runOnceForEachItem", jsCode: "const candidate = $('Code: candidato C').item.json; return { json: { ...candidate, pageStart: false, outcome: $json.error ? 'crm-unavailable' : ($json.outcome || ($json.podeContatar === false ? 'contact-denied' : 'processed')) } };" } }, output: [{}] });

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
        '__INLINE(conduction.mjs)__' +
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

const endCWired = endC.to(nextBatch(candidatesLoopC));
const expireCWired = expireC.to(confirmedExpiryC.to(committedExpiryC.onTrue(mirrorExpiryC.to(endCWired)).onFalse(endCWired)));
const contactCWired = getLeadForEscalation.to(conductionForEscalation.to(canContactForEscalation.onTrue(expireCWired).onFalse(endCWired))).onError(endCWired);
const candidateCWired = candidateC.to(candidateRouteC.onCase(0, contactCWired).onCase(1, endCWired));
const pageCWired = candidatesLoopC.onEachBatch(candidateCWired).onDone(nextPageC.to(hasNextPageC.onTrue(cursorC).onFalse(nextBatch(tenantsLoopC))));
const escalonamentoChain = getTenantsForC.to(uniqueTenantsC.to(tenantsLoopC.onEachBatch(cursorC.to(candidatesC.to(pageC.to(pageCWired))))));

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
