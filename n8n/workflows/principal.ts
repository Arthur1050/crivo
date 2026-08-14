/**
 * crivo-agente-principal — pipeline completo (T10 original; miolo
 * conversacional reescrito no lote-6c).
 *
 * Fonte versionada do workflow n8n de qualificação conversacional
 * (design.md — "Pipeline do workflow principal (visão de nós)"; AD-014:
 * workflow-as-code). Texto de ENTRADA do inliner (`scripts/n8n-inline.mjs`)
 * — o publicável é `n8n/generated/principal.ts` (gerado, nunca editado à
 * mão). Requisitos: AGT-01, AGT-02, AGT-03, AGT-07 (AC1-2), AGT-08,
 * LGPD-03; a partir do lote-6c: AGN-05 (T9), MEM-01..04 (T10), AGN-01..04/
 * CTX-03/OBS-01 (T11).
 *
 * SEM FUNÇÕES CUSTOMIZADAS (nem `function`, nem arrow function) NESTE
 * ARQUIVO — confirmado por `validate_workflow` durante o T10 original: o
 * parser do SDK rejeita tanto `FunctionDeclaration` quanto
 * `ArrowFunctionExpression` no nível do código de workflow ("Unsupported
 * syntax"). Todo padrão repetido (schema de coluna de Data Table, condição
 * de Switch) está por isso ESCRITO POR EXTENSO em cada local, em vez de
 * extraído em um helper — verboso de propósito, não um descuido. Arrow
 * functions DENTRO de uma string de `jsCode`/`expr()` continuam normais
 * (são texto para o motor de expressão do n8n ou o sandbox do Code node em
 * runtime, não código deste arquivo).
 *
 * CONVENÇÃO DE CONVERGÊNCIA (lida antes de mexer neste arquivo): sempre que
 * um nó HTTP/WhatsApp substitui `$json` pela SUA PRÓPRIA resposta (perdendo
 * os campos anteriores), o nó seguinte que precisa desses campos originais
 * os lê de volta via `$('Nome do nó ancestral').first().json...`, nunca
 * confiando em passthrough implícito. Dois "checkpoints" canônicos carregam
 * o contexto:
 *   - `Code: combinar evento e tenant` — evento normalizado + tenant_config
 *     (waId, phoneNumberId, tenantSlug, apiKey, calendarId, text, hasMedia,
 *     sentAt, messageId, contactName).
 *   - `Code: contexto do lead` — o checkpoint acima + a resposta do
 *     `POST /leads` (id, status, optedOutAt, campos de qualificação) + o
 *     buffer de mensagens da rajada.
 * Referenciar SEMPRE esses dois nós pelo nome ao invés de encadear $json
 * cego por um HTTP/WhatsApp node é a regra deste arquivo inteiro.
 *
 * NOTAS DE INCERTEZA GENUÍNA (não fabricadas — sinalizadas em vez de
 * adivinhadas, por instrução do skill):
 *   1. Formato exato do item emitido pelo nó `whatsAppTrigger` do n8n
 *      (envelope bruto da Meta vs. `value` achatado) — harness do
 *      `Code: normalizeEvent` aceita as duas formas defensivamente;
 *      confirmado contra payload real em execução de produção (README §10).
 *
 * lote-6c (T9): removido o miolo hand-rolled (Basic LLM Chain com 2
 * tentativas + output parser estruturado + Switch de ação + cadeia rígida
 * de envio `sendReply1/2/3`) — substituído por memória persistente (T10) e
 * um nó AI Agent com tools (T11). As rotas `opt-out` e `midia` (mensagens
 * fixas, nunca passam pelo agente) ganharam seu próprio envio, já que a
 * cadeia compartilhada `sendReplyWired` deixou de existir.
 */
import {
  workflow,
  node,
  trigger,
  ifElse,
  switchCase,
  newCredential,
  memory,
  splitInBatches,
  nextBatch,
  languageModel,
  tool,
  fromAi,
  expr,
} from "@n8n/workflow-sdk";

// IDs reais dos sub-workflows publicados como draft via MCP (T7/T8, mesmo
// projeto pessoal tTVoFkYzH7IEInaG) — nunca inventados, copiados da resposta
// do MCP na criação. `crivo-tool-responder-lead` e `crivo-tool-agendar-reuniao`.
const TOOL_RESPONDER_LEAD_WORKFLOW_ID = "Li2hgCX943zKmDXf";
const TOOL_AGENDAR_REUNIAO_WORKFLOW_ID = "2qCs6rPzmeOqan65";

const CRM_BASE_URL = "https://crivo-arthur1050s-projects.vercel.app/api/v1";

// IDs reais das Data Tables — criadas via MCP `create_data_table` na
// instância nova (re-hospedagem, projeto pessoal tTVoFkYzH7IEInaG). Nunca um
// valor inventado: cada id abaixo veio direto da resposta do MCP na criação.
const TENANT_CONFIG_TABLE_ID = "xRHckWWd6fxGeNta";
const CONVERSA_ESTADO_TABLE_ID = "ZsplBxJjXv3kwKZ8";

// ---------------------------------------------------------------------
// 1. Entrada: WhatsApp Trigger -> Filter -> Code normalizeEvent
// ---------------------------------------------------------------------

const whatsAppInboundTrigger = trigger({
  type: "n8n-nodes-base.whatsAppTrigger",
  version: 1,
  config: {
    name: "WhatsApp Trigger",
    position: [0, 0],
    parameters: { updates: ["messages"] },
    credentials: {
      // Credencial WhatsApp Trigger criada pelo usuário (runbook README §2.1,
      // human gate) — id copiado exatamente de `list_credentials`, nunca
      // inventado (mesma regra da credencial Gemini/Gmail). Nome real na
      // instância é "WhatsApp OAuth account" (o placeholder original
      // "WhatsApp Trigger — Crivo" nunca resolveu — ficou sem credencial até
      // este fix, achado ao tentar ativar o workflow em T12/T13 prep).
      whatsAppTriggerApi: newCredential("WhatsApp OAuth account"),
    },
  },
  output: [
    {
      messages: [
        {
          from: "5534999990001",
          id: "wamid.EXEMPLO",
          timestamp: "1754395800",
          type: "text",
          text: { body: "Oi, vi o anúncio do apartamento" },
        },
      ],
      contacts: [{ profile: { name: "Lead Exemplo" }, wa_id: "5534999990001" }],
      metadata: { display_phone_number: "15550001111", phone_number_id: "109876543210001" },
    },
  ],
});

const onlyMessageEvents = node({
  type: "n8n-nodes-base.filter",
  version: 2.3,
  config: {
    name: "Somente Mensagens (descarta statuses)",
    position: [260, 0],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "loose" },
        conditions: [
          {
            leftValue:
              "={{ ($json.messages || $json.entry?.[0]?.changes?.[0]?.value?.messages || []).length }}",
            operator: { type: "number", operation: "gt" },
            rightValue: 0,
          },
        ],
      },
      looseTypeValidation: true,
    },
  },
  output: [
    { messages: [{ from: "5534999990001", id: "wamid.EXEMPLO", timestamp: "1754395800", type: "text", text: { body: "Oi" } }] },
  ],
});

const normalizeEventCode = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: normalizeEvent",
    position: [520, 0],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        '__INLINE(normalize-event.mjs)__' +
        "\n\n" +
        "const metaPayload = ($json && Array.isArray($json.entry))\n" +
        "  ? $json\n" +
        "  : { entry: [{ changes: [{ value: $json }] }] };\n" +
        "const event = normalizeEvent(metaPayload);\n" +
        "if (!event) {\n" +
        "  return null;\n" +
        "}\n" +
        "const value = metaPayload.entry?.[0]?.changes?.[0]?.value ?? {};\n" +
        "const contactName = value.contacts?.[0]?.profile?.name || event.waId;\n" +
        "return { json: { ...event, contactName } };\n",
    },
  },
  output: [
    {
      waId: "5534999990001",
      phoneNumberId: "109876543210001",
      messageId: "wamid.EXEMPLO",
      text: "Oi, vi o anúncio do apartamento",
      sentAt: "2026-08-05T12:10:00.000Z",
      hasMedia: false,
      contactName: "Lead Exemplo",
    },
  ],
});

// ---------------------------------------------------------------------
// 2. Lookup de tenant (Data Table `tenant_config`) — sem match => fim
//    silencioso (AGT-01 AC4): 0 linhas casadas -> 0 itens -> nós seguintes
//    simplesmente não rodam para este item (padrão "zero item safety" do
//    SDK; nenhum IF explícito é necessário para esse caso).
// ---------------------------------------------------------------------

const tenantConfigLookup = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: lookup tenant_config",
    position: [780, 0],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: TENANT_CONFIG_TABLE_ID },
      filters: {
        conditions: [
          { keyName: "phoneNumberId", condition: "eq", keyValue: expr("{{ $json.phoneNumberId }}") },
        ],
      },
      returnAll: false,
      limit: 1,
    },
  },
  output: [{ id: 1, phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", calendarId: "exemplo@group.calendar.google.com" }],
});

const combineEventAndTenant = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: combinar evento e tenant",
    position: [1040, 0],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "const event = $('Code: normalizeEvent').item.json;\n" +
        "const tenant = $json;\n" +
        "return { json: {\n" +
        "  waId: event.waId, phoneNumberId: event.phoneNumberId, messageId: event.messageId,\n" +
        "  text: event.text, sentAt: event.sentAt, hasMedia: event.hasMedia, contactName: event.contactName,\n" +
        "  tenantSlug: tenant.tenantSlug, apiKey: tenant.apiKey, calendarId: tenant.calendarId,\n" +
        "} };\n",
    },
  },
  output: [
    { waId: "5534999990001", phoneNumberId: "109876543210001", messageId: "wamid.EXEMPLO", text: "Oi", sentAt: "2026-08-05T12:10:00.000Z", hasMedia: false, contactName: "Lead Exemplo", tenantSlug: "imobiliaria-a", apiKey: "exemplo", calendarId: "exemplo@group.calendar.google.com" },
  ],
});

// ---------------------------------------------------------------------
// 3. Debounce: acrescenta ao buffer, espera 10s, só a execução cujo
//    messageId ainda é o mais recente do buffer segue adiante
//    (design.md — pipeline passo 5; AGT-02 AC6).
// ---------------------------------------------------------------------

const conversaEstadoBeforeBuffer = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: conversa_estado (antes do buffer)",
    position: [1300, 0],
    // Conversa nova (primeiro contato) não tem linha ainda — o caso "sem
    // match" aqui PRECISA de um branch (diferente do lookup de tenant):
    // alwaysOutputData garante um item sintético vazio, e o Code seguinte
    // trata bufferJson/leadId ausentes defensivamente (nunca lê campo cego
    // — respeita a regra do SDK para alwaysOutputData).
    alwaysOutputData: true,
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: combinar evento e tenant').item.json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: combinar evento e tenant').item.json.waId }}") },
        ],
      },
      returnAll: false,
      limit: 1,
    },
  },
  output: [{ tenantSlug: "imobiliaria-a", waId: "5534999990001", bufferJson: "[]", leadId: "", camposJson: "{}", fase: "qualificando", reengaged: false }],
});

const appendToBuffer = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: acrescentar ao buffer",
    position: [1560, 0],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: combinar evento e tenant').item.json;\n" +
        "const existing = $json.bufferJson ? JSON.parse($json.bufferJson) : [];\n" +
        "const bufferArray = [...existing, { messageId: ctx.messageId, text: ctx.text, sentAt: ctx.sentAt }];\n" +
        "return { json: { tenantSlug: ctx.tenantSlug, waId: ctx.waId, messageId: ctx.messageId, bufferArray, bufferJson: JSON.stringify(bufferArray) } };\n",
    },
  },
  output: [{ tenantSlug: "imobiliaria-a", waId: "5534999990001", messageId: "wamid.EXEMPLO", bufferArray: [{ messageId: "wamid.EXEMPLO", text: "Oi", sentAt: "2026-08-05T12:10:00.000Z" }], bufferJson: "[...]" }],
});

const conversaEstadoUpsertBuffer = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: gravar buffer",
    position: [1820, 0],
    parameters: {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          tenantSlug: expr("{{ $json.tenantSlug }}"),
          waId: expr("{{ $json.waId }}"),
          bufferJson: expr("{{ $json.bufferJson }}"),
          lastInboundAt: expr("{{ $now.toISO() }}"),
        },
        schema: [
          { id: "tenantSlug", displayName: "tenantSlug", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "waId", displayName: "waId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "bufferJson", displayName: "bufferJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "lastInboundAt", displayName: "lastInboundAt", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
        ],
      },
    },
  },
  output: [{ id: 1 }],
});

const waitForDebounce = node({
  type: "n8n-nodes-base.wait",
  version: 1.1,
  config: {
    name: "Aguardar 10s (debounce)",
    position: [2080, 0],
    parameters: { resume: "timeInterval", amount: 10, unit: "seconds" },
  },
  output: [{}],
});

const conversaEstadoAfterWait = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: conversa_estado (depois do wait)",
    position: [2340, 0],
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: acrescentar ao buffer').item.json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: acrescentar ao buffer').item.json.waId }}") },
        ],
      },
      returnAll: false,
      limit: 1,
    },
  },
  output: [{ bufferJson: "[]" }],
});

const checkStillLatest = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: ainda sou a mensagem mais recente?",
    position: [2600, 0],
    parameters: {
      mode: "runOnceForEachItem",
      language: "javaScript",
      jsCode:
        "const myMessageId = $('Code: acrescentar ao buffer').item.json.messageId;\n" +
        "const currentBuffer = $json.bufferJson ? JSON.parse($json.bufferJson) : [];\n" +
        "const newestInBuffer = currentBuffer.length > 0 ? currentBuffer[currentBuffer.length - 1].messageId : null;\n" +
        "return { json: { stillLatest: newestInBuffer === myMessageId } };\n",
    },
  },
  output: [{ stillLatest: true }],
});

const isStillLatest = ifElse({
  version: 2.3,
  config: {
    name: "Sou a execução mais recente?",
    position: [2860, 0],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.stillLatest }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

// ---------------------------------------------------------------------
// 4. Sync CRM: POST /leads (idempotente) -> registra cada mensagem do
//    buffer -> Code gate decide a rota (design.md passos 6-7).
// ---------------------------------------------------------------------

const postLeadIdempotent = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: POST /leads (idempotente)",
    position: [3120, 0],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: `${CRM_BASE_URL}/leads`,
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: combinar evento e tenant').item.json.apiKey }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { name: $('Code: combinar evento e tenant').item.json.contactName, phone: $('Code: combinar evento e tenant').item.json.waId, externalId: $('Code: combinar evento e tenant').item.json.waId, firstContactAt: $('Code: combinar evento e tenant').item.json.sentAt } }}"
      ),
    },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "em_qualificacao", optedOutAt: null, modality: null, region: null, budgetCents: null, propertyType: null, purchaseHorizon: null, motivation: null, creditStatus: null, chainedOperation: null }],
});

const attachTenantToLeadResponse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: contexto do lead",
    position: [3380, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const lead = $input.first().json;\n" +
        "const ctx = $('Code: combinar evento e tenant').first().json;\n" +
        "const buffer = $('Code: acrescentar ao buffer').first().json.bufferArray;\n" +
        "return [{ json: { ...lead, tenantSlug: ctx.tenantSlug, apiKey: ctx.apiKey, calendarId: ctx.calendarId, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, contactName: ctx.contactName, text: ctx.text, hasMedia: ctx.hasMedia, sentAt: ctx.sentAt, bufferArray: buffer } }];\n",
    },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "em_qualificacao", optedOutAt: null, tenantSlug: "imobiliaria-a", apiKey: "exemplo", calendarId: "exemplo@group.calendar.google.com", waId: "5534999990001", phoneNumberId: "109876543210001", contactName: "Lead Exemplo", text: "Oi", hasMedia: false, sentAt: "2026-08-05T12:10:00.000Z", bufferArray: [{ messageId: "wamid.EXEMPLO", text: "Oi", sentAt: "2026-08-05T12:10:00.000Z" }] }],
});

const splitBufferedMessages = node({
  type: "n8n-nodes-base.splitOut",
  version: 1,
  config: {
    name: "Split: mensagens do buffer",
    position: [3640, 0],
    parameters: { fieldToSplitOut: "bufferArray", include: "allOtherFields" },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", apiKey: "exemplo", bufferArray: { messageId: "wamid.EXEMPLO", text: "Oi", sentAt: "2026-08-05T12:10:00.000Z" } }],
});

const postBufferedMessage = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: POST /leads/{id}/messages (lead)",
    position: [3900, 0],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $json.id }}/messages`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: $json.bufferArray.messageId, sender: 'lead', content: $json.bufferArray.text, sentAt: $json.bufferArray.sentAt } }}"
      ),
    },
  },
  output: [{ id: "4fa85f64-5717-4562-b3fc-2c963f66afa7", externalId: "wamid.EXEMPLO", sender: "lead", content: "Oi", sentAt: "2026-08-05T12:10:00.000Z" }],
});

const decideRoute = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: gate",
    position: [4160, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(gate.mjs)__' +
        "\n\n" +
        "const ctx = $('Code: contexto do lead').first().json;\n" +
        "const route = gate({ optedOutAt: ctx.optedOutAt, status: ctx.status, hasMedia: ctx.hasMedia, text: ctx.text });\n" +
        "return [{ json: { ...ctx, route } }];\n",
    },
  },
  output: [{ route: "conversa", id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "em_qualificacao", optedOutAt: null, tenantSlug: "imobiliaria-a", apiKey: "exemplo", calendarId: "exemplo@group.calendar.google.com", waId: "5534999990001", phoneNumberId: "109876543210001" }],
});

const routeSwitch = switchCase({
  version: 3.4,
  config: {
    name: "Switch: rota (gate)",
    position: [4420, 0],
    parameters: {
      rules: {
        values: [
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.route }}"), operator: { type: "string", operation: "equals" }, rightValue: "opt-out" }], combinator: "and" } },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.route }}"), operator: { type: "string", operation: "equals" }, rightValue: "somente-registrar" }], combinator: "and" } },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.route }}"), operator: { type: "string", operation: "equals" }, rightValue: "midia" }], combinator: "and" } },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.route }}"), operator: { type: "string", operation: "equals" }, rightValue: "conversa" }], combinator: "and" } },
        ],
      },
      // Fallback deliberadamente 'none' (padrão): gate() é função pura
      // exaustivamente testada (n8n/src/__tests__/gate.test.ts) com tipo de
      // retorno fechado — uma 5a rota não pode ocorrer. Se ocorrer mesmo
      // assim (bug alhures), o item é descartado (nenhuma resposta
      // incorreta é melhor que uma resposta para uma rota desconhecida).
      options: {},
    },
  },
});

// ---------------------------------------------------------------------
// 5. Rota opt-out (LGPD-03 AC1)
// ---------------------------------------------------------------------

const postOptOut = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: POST /leads/{id}/opt-out",
    position: [4700, -400],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: gate').first().json.id }}/opt-out`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }] },
    },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", optedOutAt: "2026-08-05T12:11:00.000Z" }],
});

const finalizeOptOut = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar opt-out",
    position: [4960, -400],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        // PER-02 AC4: rota de resposta fixa usa o mesmo caminho de envio das
        // demais — sempre `mensagens` (array de 1 item aqui).
        "const mensagens = ['Você pediu para não receber mais mensagens automáticas. A partir de agora, não vamos mais te contatar por aqui. Se mudar de ideia, é só nos chamar novamente. Até mais!'];\n" +
        "return [{ json: { mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, apiKey: ctx.apiKey, leadId: ctx.id, fase: 'encerrada' } }];\n",
    },
  },
  output: [{ mensagens: ["confirmação de opt-out"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "encerrada" }],
});

// ---------------------------------------------------------------------
// 6. Rota somente-registrar (opt-out anterior OU escalado_humano — AGT-05
//    AC3, LGPD-03 AC3). A mensagem já foi registrada no passo 4; aqui
//    NENHUMA resposta é enviada — vai direto para o clear de buffer.
// ---------------------------------------------------------------------

const finalizeSomenteRegistrar = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar somente-registrar (sem envio)",
    position: [4700, -200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "return [{ json: { tenantSlug: ctx.tenantSlug, waId: ctx.waId, fase: 'encerrada' } }];\n",
    },
  },
  output: [{ tenantSlug: "imobiliaria-a", waId: "5534999990001", fase: "encerrada" }],
});

// ---------------------------------------------------------------------
// 7. Rota mídia (edge case — resposta fixa, sem LLM)
// ---------------------------------------------------------------------

const finalizeMedia = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar mídia (resposta fixa)",
    position: [4700, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "const mensagens = ['Recebi seu arquivo, mas por aqui eu sigo só por mensagens de texto — pode me contar em palavras o que você gostaria de saber?'];\n" +
        "return [{ json: { mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, apiKey: ctx.apiKey, leadId: ctx.id, fase: ctx.fase || 'qualificando' } }];\n",
    },
  },
  output: [{ mensagens: ["sigo por texto"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
});

// ---------------------------------------------------------------------
// 8. Rota conversa: settings -> bloco de memória (T10 — purga condicional
//    por sessão expirada, load, semeadura em cold start a partir do CRM).
//    T11 anexa o nó AI Agent depois de `memoryReadyCheckpoint`, na mesma
//    cadeia (nunca uma reconexão do zero).
// ---------------------------------------------------------------------

const getSettings = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: GET /settings",
    position: [4700, 300],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "GET",
      url: `${CRM_BASE_URL}/settings`,
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }] },
    },
  },
  output: [{ realEstateName: "Imobiliária A", agentName: "Ana", supportedModality: "ambos", agentPresentationMessage: "Oi! Sou a Ana.", meetingDays: null, meetingHoursStart: null, meetingHoursEnd: null }],
});

// `sessionKey` composto (tenantSlug:waId) — mesma chave que `conversa_estado`
// já usa (MEM-01 AC1/AC2). Referenciado por nome ('Code: gate'), nunca por
// $json cego: memoryPostgresChat é um SUBNODE (de memoryManager e, no T11,
// do AI Agent) — subnodes não compartilham o contexto do predecessor
// principal (get_sdk_reference — "When $json is unsafe").
const conversationMemory = memory({
  type: "@n8n/n8n-nodes-langchain.memoryPostgresChat",
  version: 1.4,
  config: {
    name: "Postgres Chat Memory",
    position: [4960, 500],
    parameters: {
      sessionIdType: "customKey",
      sessionKey: expr("{{ $('Code: gate').first().json.tenantSlug }}:{{ $('Code: gate').first().json.waId }}"),
      contextWindowLength: 50,
    },
    credentials: { postgres: newCredential("Postgres n8n local") },
  },
});

const checkSessionExpired = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: sessão expirada?",
    position: [4960, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(session.mjs)__' +
        "\n\n" +
        "const lastInboundAt = $('Data Table: conversa_estado (antes do buffer)').first().json.lastInboundAt || null;\n" +
        "const now = $('Code: combinar evento e tenant').first().json.sentAt;\n" +
        "const expired = isSessionExpired(lastInboundAt, now);\n" +
        "return [{ json: { expired } }];\n",
    },
  },
  output: [{ expired: false }],
});

const isSessionExpiredIf = ifElse({
  version: 2.3,
  config: {
    name: "Sessão expirada (gap > 12h)?",
    position: [5220, 300],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.expired }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

const purgeMemoryOnExpiry = node({
  type: "@n8n/n8n-nodes-langchain.memoryManager",
  version: 1.1,
  config: {
    name: "Chat Memory Manager: purgar sessão expirada",
    position: [5480, 200],
    parameters: { mode: "delete", deleteMode: "all" },
    subnodes: { memory: conversationMemory },
  },
  output: [{ success: true }],
});

const purgeConversaEstadoOnExpiry = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: purgar qualificação e persona (sessão expirada)",
    position: [5740, 200],
    parameters: {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: gate').first().json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: gate').first().json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          tenantSlug: expr("{{ $('Code: gate').first().json.tenantSlug }}"),
          waId: expr("{{ $('Code: gate').first().json.waId }}"),
          perguntadosJson: "[]",
          aberturasJson: "[]",
        },
        schema: [
          { id: "tenantSlug", displayName: "tenantSlug", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "waId", displayName: "waId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "perguntadosJson", displayName: "perguntadosJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "aberturasJson", displayName: "aberturasJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
        ],
      },
    },
  },
  output: [{ id: 1 }],
});

const loadMemory = node({
  type: "@n8n/n8n-nodes-langchain.memoryManager",
  version: 1.1,
  config: {
    name: "Chat Memory Manager: carregar sessão",
    position: [6000, 300],
    parameters: { mode: "load", simplifyOutput: true, options: { groupMessages: true } },
    subnodes: { memory: conversationMemory },
  },
  // Formato real confirmado via execução MCP nesta sessão (nunca adivinhado
  // — get_node_types não expõe o shape de saída do memoryManager):
  // `{ messages: [...], messagesCount: N }` com groupMessages:true.
  output: [{ messages: [], messagesCount: 0 }],
});

const isMemoryEmptyIf = ifElse({
  version: 2.3,
  config: {
    name: "Memória da sessão está vazia?",
    position: [6260, 300],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.messagesCount }}"), operator: { type: "number", operation: "equals" }, rightValue: 0 }],
      },
    },
  },
});

// MEM-03 AC5/AC6: cold start com histórico no CRM -> semeia; falha ou
// histórico vazio -> segue com memória vazia (onError: continueRegularOutput
// + alwaysOutputData), nunca aborta o turno.
const getMessagesForSeed = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: GET /leads/{id}/messages (semeadura)",
    position: [6520, 200],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueRegularOutput",
    alwaysOutputData: true,
    parameters: {
      method: "GET",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: gate').first().json.id }}/messages`),
      sendQuery: true,
      queryParameters: { parameters: [{ name: "limit", value: "100" }] },
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }] },
    },
  },
  output: [{ id: "4fa85f64-5717-4562-b3fc-2c963f66afa7", externalId: "wamid.EXEMPLO", sender: "lead", content: "Oi, vi o anúncio do apartamento", sentAt: "2026-08-05T12:10:00.000Z" }],
});

// Devolve UM ITEM POR MENSAGEM de semeadura (não um item com um array) —
// o nó de insert abaixo não aceita um array dinâmico em
// `messages.messageValues` (confirmado via `validate_workflow`:
// `INVALID_PARAMETER`, "expected array, got string" ao tentar um único
// `expr()` cobrindo o campo inteiro). Refanar em N itens e deixar o loop
// de `splitInBatches` abaixo inserir um de cada vez é o padrão real do SDK
// para "quantidade dinâmica de itens" (get_sdk_reference — batch_processing).
const buildSeedMessages = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: selecionar mensagens de semeadura",
    position: [6780, 200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(session.mjs)__' +
        "\n\n" +
        // Degradação defensiva (MEM-03 AC6): `HTTP: GET /leads/{id}/messages
        // (semeadura)` roda com onError:continueRegularOutput +
        // alwaysOutputData — em falha, o item resultante não tem o formato
        // de `SerializedMessage`. Filtrar aqui garante lista vazia no lugar
        // de lixo, sem nunca abortar o turno.
        "const rawHistory = $input.all()\n" +
        "  .map((item) => item.json)\n" +
        "  .filter((m) => m && typeof m.sender === 'string' && typeof m.content === 'string' && typeof m.sentAt === 'string');\n" +
        "const now = $('Code: combinar evento e tenant').first().json.sentAt;\n" +
        "const session = selectSeedMessages(rawHistory, now);\n" +
        "return session.map((m) => ({ json: { type: m.sender === 'agente' ? 'ai' : 'user', message: m.content } }));\n",
    },
  },
  output: [{ type: "user", message: "Oi, vi o anúncio do apartamento" }],
});

// Loop 1-a-1 (get_sdk_reference — "Trust empty item lists"): com 0 mensagens
// de semeadura, o loop simplesmente não itera e `onDone` dispara na hora —
// é assim, sem IF de guarda, que `memoryReadyCheckpoint` é sempre alcançado
// (MEM-03 AC6, cold start genuíno inclusive).
const seedMessageBatches = splitInBatches({
  version: 3,
  config: { name: "Loop: mensagens de semeadura", position: [7040, 200], parameters: { batchSize: 1 } },
});

const insertOneSeedMessage = node({
  type: "@n8n/n8n-nodes-langchain.memoryManager",
  version: 1.1,
  config: {
    name: "Chat Memory Manager: semear memória",
    position: [7300, 100],
    parameters: {
      mode: "insert",
      insertMode: "insert",
      messages: {
        messageValues: [
          { type: expr("{{ $json.type }}"), message: expr("{{ $json.message }}"), hideFromUI: false },
        ],
      },
    },
    subnodes: { memory: conversationMemory },
  },
  output: [{ success: true }],
});

const memoryReadyCheckpoint = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: memória pronta",
    position: [7300, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return [{ json: { memoryReady: true } }];\n",
    },
  },
  output: [{ memoryReady: true }],
});

// ---------------------------------------------------------------------
// 11. Nó AI Agent (T11) — modelo, memória (T10) e as 5 tools. QLF-02 (não
//     atribuída a nenhuma task deste lote — gap real do tasks.md, ver nota
//     do Handoff) é fechada aqui, no único ponto do fluxo onde "qual campo
//     será perguntado neste turno" é conhecido: `nextFieldToAsk` é
//     calculado ANTES do agente rodar, e o campo já é gravado em
//     `perguntadosJson` nesse instante — QLF-02 AC2 exige registrar o
//     campo como perguntado "independentemente de o lead responder ou
//     não", e não há mecanismo determinístico de inspecionar a fala do
//     agente depois do fato para confirmar que ele obedeceu a instrução
//     do system message.
// ---------------------------------------------------------------------

const buildAgentSystemMessage = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: montar system message e marcar campo perguntado",
    position: [7560, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(business-hours.mjs)__' +
        "\n" +
        '__INLINE(phase.mjs)__' +
        "\n" +
        '__INLINE(system-message.mjs)__' +
        "\n\n" +
        "const settings = $('HTTP: GET /settings').first().json;\n" +
        "const wasExpired = $('Code: sessão expirada?').first().json.expired;\n" +
        "let perguntados = [];\n" +
        "try { perguntados = wasExpired ? [] : JSON.parse($('Data Table: conversa_estado (antes do buffer)').first().json.perguntadosJson || '[]'); } catch (e) { perguntados = []; }\n" +
        "if (!Array.isArray(perguntados)) perguntados = [];\n" +
        "const phaseBefore = resolveConversationPhase(perguntados);\n" +
        "const nextField = nextFieldToAsk(perguntados);\n" +
        "const updatedPerguntados = (phaseBefore === 'qualificando' && nextField) ? [...perguntados, nextField] : perguntados;\n" +
        "const phase = resolveConversationPhase(updatedPerguntados);\n" +
        "const businessHours = resolveBusinessHours(settings);\n" +
        "const systemMessage = buildSystemMessage({ settings, phase, perguntados: updatedPerguntados, businessHours });\n" +
        "const buffer = $('Code: contexto do lead').first().json.bufferArray || [];\n" +
        "const userMessage = buffer.map((m) => m.text).join('\\n');\n" +
        "return [{ json: { systemMessage, userMessage, phase, perguntadosJson: JSON.stringify(updatedPerguntados) } }];\n",
    },
  },
  output: [{ systemMessage: "Você é Ana, agente de atendimento...", userMessage: "Oi, vi o anúncio do apartamento", phase: "qualificando", perguntadosJson: "[\"modality\"]" }],
});

const persistPerguntados = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: marcar campo perguntado",
    position: [7820, 300],
    parameters: {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: gate').first().json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: gate').first().json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          tenantSlug: expr("{{ $('Code: gate').first().json.tenantSlug }}"),
          waId: expr("{{ $('Code: gate').first().json.waId }}"),
          perguntadosJson: expr("{{ $('Code: montar system message e marcar campo perguntado').first().json.perguntadosJson }}"),
        },
        schema: [
          { id: "tenantSlug", displayName: "tenantSlug", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "waId", displayName: "waId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "perguntadosJson", displayName: "perguntadosJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
        ],
      },
    },
  },
  output: [{ id: 1 }],
});

// Tools nativas (design.md — "Por que 3 tools nativas e 2 sub-workflows"):
// a barreira já é server-side no CRM. `leadId` das 3 SEMPRE vem de
// expressão do fluxo ('Code: gate'), NUNCA de $fromAI (design.md — Risks &
// Concerns: leadId vindo do modelo permitiria escrita cross-lead).
//
// `registrar_qualificacao` — padrão {campo, valor} de UM campo por chamada,
// não um objeto com os 8 campos como parâmetros fromAI independentes.
// Achado real (não hipótese — execução MCP nesta sessão, workflow scratch
// `Q22aiVuQNj1FGU3r`, arquivado): com os 8 campos expostos como parâmetros
// fromAI separados na MESMA chamada, o Gemini populou `modality` e
// `chainedOperation` com valores fabricados mesmo quando o prompt dizia
// explicitamente "registre APENAS a região, não registre mais nada" — o
// modelo "ajuda" preenchendo campos vizinhos disponíveis no schema da tool.
// Com {campo, valor} como par único, o corpo enviado ficou estruturalmente
// limitado a UMA chave (confirmado na 2ª execução: `{"region":"Uberaba"}`,
// nada mais) — o mesmo princípio de "estruturalmente incapaz" que
// `phase.mjs` já usa. A coerção de tipo (chainedOperation vira boolean,
// budgetCents vira number) é feita por código determinístico dentro da
// expressão, nunca pelo modelo.
const registrarQualificacaoTool = tool({
  type: "n8n-nodes-base.httpRequestTool",
  version: 4.5,
  config: {
    name: "registrar_qualificacao",
    position: [7560, 500],
    parameters: {
      toolDescription:
        "Registra UM campo de qualificação que o lead revelou espontaneamente (modality, region, budgetCents, propertyType, purchaseHorizon, motivation, creditStatus ou chainedOperation). Uma chamada por campo — nunca invente valor para campo que o lead não mencionou.",
      method: "PATCH",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: gate').first().json.id }}`),
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ (() => {\n" +
          "  const campo = $fromAI('campo', 'Nome do campo de qualificacao a registrar: modality, region, budgetCents, propertyType, purchaseHorizon, motivation, creditStatus ou chainedOperation. Um campo por chamada.', 'string');\n" +
          "  const valorBruto = $fromAI('valor', 'Valor a gravar nesse campo, como texto. Para chainedOperation use literalmente \"true\" ou \"false\".', 'string');\n" +
          "  let valor = valorBruto;\n" +
          "  if (campo === 'chainedOperation') valor = valorBruto === 'true';\n" +
          "  if (campo === 'budgetCents') valor = Number(valorBruto);\n" +
          "  return { [campo]: valor };\n" +
          "})() }}"
      ),
      options: { response: { response: { neverError: true } } },
    },
  },
  output: [{}],
});

// `escalar_para_humano` — `status` é constante (nunca vem do modelo); só
// `motivo` (single string field, sem risco de campo cruzado) é fromAI.
// `neverError:true` garante que um 409 (transicao-invalida /
// lead-travado-por-humano, AD-013) chegue ao agente com o `code` intacto
// no corpo — sem isso, `httpRequestTool` lançaria um erro genérico do n8n
// ("Authorization failed"-like summary) que perde o `code`, o canal de
// correção que a Done-when desta task exige.
const escalarParaHumanoTool = tool({
  type: "n8n-nodes-base.httpRequestTool",
  version: 4.5,
  config: {
    name: "escalar_para_humano",
    position: [7560, 700],
    parameters: {
      toolDescription:
        "Transfere a conversa para um atendente humano. Use quando o lead pedir explicitamente por um humano, ou quando o pedido dele for algo que só um humano resolve. Sempre informe o motivo.",
      method: "PATCH",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: gate').first().json.id }}`),
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { status: 'escalado_humano', escalationReason: $fromAI('motivo', 'Motivo pelo qual a conversa esta sendo escalada para um humano', 'string') } }}"
      ),
      options: { response: { response: { neverError: true } } },
    },
  },
  output: [{}],
});

// `consultar_documentos` — sem nenhum parâmetro fromAI: `modality` vem do
// lead já conhecido pelo fluxo (mesmo fallback usado pelo antigo
// `getContext` de `principal.ts`: sem modalidade revelada ainda, assume
// 'novo'). O agente só decide QUANDO chamar, nunca inventa argumento.
const consultarDocumentosTool = tool({
  type: "n8n-nodes-base.httpRequestTool",
  version: 4.5,
  config: {
    name: "consultar_documentos",
    position: [7560, 900],
    parameters: {
      toolDescription: "Consulta a lista de documentos e materiais de apoio do tenant. Use somente quando precisar dessa informação para responder ao lead — não chame em todo turno.",
      method: "GET",
      url: `${CRM_BASE_URL}/context`,
      sendQuery: true,
      queryParameters: {
        parameters: [{ name: "modality", value: expr("{{ $('Code: gate').first().json.modality === 'usado' ? 'usado' : 'novo' }}") }],
      },
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }],
      },
      retryOnFail: true,
      maxTries: 2,
      options: { response: { response: { neverError: true } } },
    },
  },
  output: [{}],
});

// Sub-workflows (T7/T8) — compõem múltiplos efeitos, expostos como tool via
// `toolWorkflow`. `leadId` sempre de expressão do fluxo aqui também, pela
// mesma razão das tools nativas.
const responderLeadTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolWorkflow",
  version: 2.2,
  config: {
    name: "responder_lead",
    position: [7560, 1100],
    parameters: {
      description:
        "ÚNICA forma de enviar mensagem ao lead. Toda resposta sua passa por aqui, mesmo que seja só uma reação — no máximo 3 vezes por turno.",
      source: "database",
      workflowId: { __rl: true, mode: "id", value: TOOL_RESPONDER_LEAD_WORKFLOW_ID },
      workflowInputs: {
        mappingMode: "defineBelow",
        value: {
          mensagem: fromAi("mensagem", "A mensagem a enviar ao lead agora, em pt-BR, sem emoji, sem abrir com interjeição de aprovação isolada"),
          tenantSlug: expr("{{ $('Code: gate').first().json.tenantSlug }}"),
          waId: expr("{{ $('Code: gate').first().json.waId }}"),
          leadId: expr("{{ $('Code: gate').first().json.id }}"),
          apiKey: expr("{{ $('Code: gate').first().json.apiKey }}"),
          phoneNumberId: expr("{{ $('Code: gate').first().json.phoneNumberId }}"),
        },
        // ACHADO REAL (T12 — execução MCP, não hipótese): sem `schema` aqui, o
        // resourceMapper de `workflowInputs` não mapeia NENHUM campo — nem os
        // estáticos (expr()) nem o dinâmico (fromAi()). Confirmado via
        // execução real do sub-workflow (crivo-tool-responder-lead, execução
        // 454-461): `Execute Workflow Trigger` chegava com TODOS os 6 campos
        // `null`, inclusive os 5 que nunca dependem do modelo — o envio
        // falhava na Meta com corpo vazio. `schema` é obrigatório em todo
        // outro resourceMapper deste arquivo (Data Table); só estes 2 nós
        // `toolWorkflow` (T11) tinham ficado sem, porque `validate_workflow`
        // (checagem estática) não pega esse tipo de erro de runtime.
        schema: [
          { id: "mensagem", displayName: "mensagem", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "tenantSlug", displayName: "tenantSlug", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "waId", displayName: "waId", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "leadId", displayName: "leadId", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "apiKey", displayName: "apiKey", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
          { id: "phoneNumberId", displayName: "phoneNumberId", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
        ],
      },
    },
  },
  output: [{}],
});

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
          apiKey: expr("{{ $('Code: gate').first().json.apiKey }}"),
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
          { id: "apiKey", displayName: "apiKey", required: true, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: false },
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

// Trocar de modelo é trocar este 1 nó (T16 eleva para flash — isolado,
// deliberadamente ainda flash-lite aqui, ver tasks.md T16).
const agentModel = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
  version: 1.1,
  config: {
    name: "Gemini Chat Model",
    position: [7560, 1500],
    parameters: { modelName: "models/gemini-3.1-flash-lite", options: { temperature: 0.4 } },
    credentials: { googlePalmApi: newCredential("Google Gemini(PaLM) Api account") },
  },
});

const aiAgent = node({
  type: "@n8n/n8n-nodes-langchain.agent",
  version: 3.1,
  config: {
    name: "AI Agent",
    position: [7820, 500],
    parameters: {
      promptType: "define",
      text: expr("{{ $('Code: montar system message e marcar campo perguntado').first().json.userMessage }}"),
      hasOutputParser: false,
      options: {
        systemMessage: expr("{{ $('Code: montar system message e marcar campo perguntado').first().json.systemMessage }}"),
        maxIterations: 8,
        returnIntermediateSteps: true,
      },
    },
    subnodes: {
      model: agentModel,
      memory: conversationMemory,
      tools: [registrarQualificacaoTool, escalarParaHumanoTool, consultarDocumentosTool, responderLeadTool, agendarReuniaoTool],
    },
  },
  output: [{ output: "Beleza, e qual a região que você procura?" }],
});

// OBS-01: turno sem nenhuma chamada de `responder_lead` (maxIterations
// estourado, ou o modelo simplesmente não chamou a tool) é registrado nos
// dados da execução (`turnoSemResposta`) e o turno encerra normalmente —
// nunca em erro de execução (Done-when).
const finalizeAgentTurn = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar turno do agente",
    position: [8080, 500],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "const agentOutput = $json;\n" +
        "const steps = Array.isArray(agentOutput.intermediateSteps) ? agentOutput.intermediateSteps : [];\n" +
        "const calledResponder = steps.some((s) => s && s.action && s.action.tool === 'responder_lead');\n" +
        "const fase = $('Code: montar system message e marcar campo perguntado').first().json.phase;\n" +
        "return [{ json: { tenantSlug: ctx.tenantSlug, waId: ctx.waId, fase, turnoSemResposta: !calledResponder } }];\n",
    },
  },
  output: [{ tenantSlug: "imobiliaria-a", waId: "5534999990001", fase: "qualificando", turnoSemResposta: false }],
});

// MEM-04: ramo de opt-out também purga a memória e as duas colunas de
// estado (mesma unidade atômica da purga por sessão expirada, T10) — um
// lead que optou por sair nunca mais gera um novo turno (gate roteia para
// somente-registrar a partir da 2ª mensagem), então isso é inócuo em
// termos de comportamento futuro, mas fecha o mesmo invariante de
// "memória + conversa_estado sempre purgadas juntas" descrito no design.md
// (Risks & Concerns).
const purgeMemoryOnOptOut = node({
  type: "@n8n/n8n-nodes-langchain.memoryManager",
  version: 1.1,
  config: {
    name: "Chat Memory Manager: purgar memória (opt-out)",
    position: [4960, -500],
    parameters: { mode: "delete", deleteMode: "all" },
    subnodes: { memory: conversationMemory },
  },
  output: [{ success: true }],
});

const purgeConversaEstadoOnOptOut = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: purgar qualificação e persona (opt-out)",
    position: [5220, -500],
    parameters: {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: gate').first().json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: gate').first().json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          tenantSlug: expr("{{ $('Code: gate').first().json.tenantSlug }}"),
          waId: expr("{{ $('Code: gate').first().json.waId }}"),
          perguntadosJson: "[]",
          aberturasJson: "[]",
        },
        schema: [
          { id: "tenantSlug", displayName: "tenantSlug", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "waId", displayName: "waId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "perguntadosJson", displayName: "perguntadosJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "aberturasJson", displayName: "aberturasJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
        ],
      },
    },
  },
  output: [{ id: 1 }],
});

// ---------------------------------------------------------------------
// 9. Envio fixo (opt-out / mídia) — únicas 2 rotas que nunca passam pelo
//    agente (AGN-05). `normalizeFixedReplyRecipient` é o entroncamento
//    compartilhado das duas (fan-in — mesma convenção de wiring do resto
//    do arquivo: um único `.to(...)` nomeado, nunca declarado 2 vezes).
// ---------------------------------------------------------------------

const normalizeFixedReplyRecipient = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: destinatário do envio fixo",
    position: [4960, -300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(phone.mjs)__' +
        "\n\n" +
        "const ctx = $input.first().json;\n" +
        "return [{ json: { ...ctx, recipientMsisdn: toWhatsAppMsisdn(ctx.waId) } }];\n",
    },
  },
  output: [{ mensagens: ["resposta fixa"], waId: "553499532444", recipientMsisdn: "5534999532444", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
});

const sendFixedReply = node({
  type: "n8n-nodes-base.whatsApp",
  version: 1.1,
  config: {
    name: "WhatsApp: enviar mensagem fixa",
    position: [5220, -300],
    parameters: {
      resource: "message",
      operation: "send",
      phoneNumberId: expr("{{ $json.phoneNumberId }}"),
      recipientPhoneNumber: expr("{{ $json.recipientMsisdn }}"),
      messageType: "text",
      textBody: expr("{{ $json.mensagens[0] }}"),
    },
    credentials: { whatsAppApi: newCredential("WhatsApp account") },
  },
  output: [{ messages: [{ id: "wamid.RESPOSTA_FIXA" }] }],
});

const registerFixedReply = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: registrar mensagem fixa",
    position: [5480, -300],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: destinatário do envio fixo').first().json.leadId }}/messages`),
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: destinatário do envio fixo').first().json.apiKey }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: $json.messages[0].id, sender: 'agente', content: $('Code: destinatário do envio fixo').first().json.mensagens[0], sentAt: $now.toISO() } }}"
      ),
    },
  },
  output: [{ id: "6fa85f64-5717-4562-b3fc-2c963f66afa9", sender: "agente" }],
});

// ---------------------------------------------------------------------
// 10. Convergência final: limpar buffer (AGT-01 AC5). Único nó que TODAS
//     as rotas alcançam — opt-out/mídia via `registerFixedReply`, a rota
//     `conversa` via o que T10/T11 anexarem depois de `getSettings`.
// ---------------------------------------------------------------------

const prepBufferClearAfterSend = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: preparar clear de buffer (envio fixo)",
    position: [5740, -300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      // Mesmo defeito de classe já corrigido antes: `WhatsApp: enviar
      // mensagem fixa` devolve a resposta da Cloud API, que não tem
      // `tenantSlug`/`waId`/`fase` — os três resolveriam `undefined` e o
      // `Data Table: limpar buffer` faria upsert com chave vazia.
      // `Code: destinatário do envio fixo` é a referência robusta.
      jsCode:
        "const ctx = $('Code: destinatário do envio fixo').first().json;\n" +
        "return [{ json: { tenantSlug: ctx.tenantSlug, waId: ctx.waId, fase: ctx.fase } }];\n",
    },
  },
  output: [{ tenantSlug: "imobiliaria-a", waId: "5534999990001", fase: "qualificando" }],
});

const clearBufferAndFinalize = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: limpar buffer",
    position: [6000, -100],
    parameters: {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          tenantSlug: expr("{{ $json.tenantSlug }}"),
          waId: expr("{{ $json.waId }}"),
          bufferJson: "[]",
          fase: expr("{{ $json.fase }}"),
          reengaged: false,
        },
        schema: [
          { id: "tenantSlug", displayName: "tenantSlug", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "waId", displayName: "waId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "bufferJson", displayName: "bufferJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "fase", displayName: "fase", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "reengaged", displayName: "reengaged", required: false, defaultMatch: false, display: true, type: "boolean", canBeUsedToMatch: true },
        ],
      },
    },
  },
  output: [{ id: 1 }],
});

// ---------------------------------------------------------------------
// Montagem do grafo
//
// Regra seguida aqui (evita o erro clássico de wiring do SDK): cada
// nó/condicional com MÚLTIPLOS predecessores (`normalizeFixedReplyRecipient`,
// porta de entrada compartilhada do envio fixo desde o T9; `actionSwitch`
// não existe mais) tem sua wiring de SAÍDA (`.to(...)`/`.onCase(...)`)
// definida em UMA única expressão nomeada — nunca duas vezes. Todo
// predecessor referencia essa MESMA variável como alvo (fan-in seguro,
// mesmo mecanismo do padrão "fan_in" da referência do SDK).
// ---------------------------------------------------------------------

const fixedReplyWired = normalizeFixedReplyRecipient.to(
  sendFixedReply.to(registerFixedReply.to(prepBufferClearAfterSend.to(clearBufferAndFinalize)))
);

const optOutBranch = postOptOut.to(
  finalizeOptOut.to(purgeMemoryOnOptOut.to(purgeConversaEstadoOnOptOut.to(fixedReplyWired)))
);
const somenteRegistrarBranch = finalizeSomenteRegistrar.to(clearBufferAndFinalize);
const midiaBranch = finalizeMedia.to(fixedReplyWired);

// T10: a rota `conversa` agora atravessa o bloco de memória inteiro (purga
// condicional -> load -> semeadura em cold start) e termina em
// `memoryReadyCheckpoint`. T11 anexa o nó AI Agent a partir dali, na mesma
// cadeia (nunca uma reconexão do zero). Wiring de fan-in em duas camadas
// (mesma regra do topo do arquivo): `afterLoadMemory` é o alvo único de
// `loadMemory` (ele mesmo bifurcando e reconvergindo em
// `memoryReadyCheckpoint`), e é esse builder — não os nós soltos — que as
// duas branches de `isSessionExpiredIf` apontam.
const afterLoadMemory = loadMemory.to(
  isMemoryEmptyIf
    .onTrue(
      getMessagesForSeed.to(
        buildSeedMessages.to(
          seedMessageBatches
            .onDone(memoryReadyCheckpoint)
            .onEachBatch(insertOneSeedMessage.to(nextBatch(seedMessageBatches)))
        )
      )
    )
    .onFalse(memoryReadyCheckpoint)
);

// T11: `memoryReadyCheckpoint` (T10's dangling tail) agora se estende até o
// nó AI Agent e a convergência final — única extensão feita aqui, nunca
// uma reconexão do zero (mesma disciplina de T9/T10).
memoryReadyCheckpoint.to(
  buildAgentSystemMessage.to(
    persistPerguntados.to(aiAgent.to(finalizeAgentTurn.to(clearBufferAndFinalize)))
  )
);

const conversaBranch = getSettings.to(
  checkSessionExpired.to(
    isSessionExpiredIf
      .onTrue(purgeMemoryOnExpiry.to(purgeConversaEstadoOnExpiry.to(afterLoadMemory)))
      .onFalse(afterLoadMemory)
  )
);

const routeSwitchRouted = routeSwitch
  .onCase(0, optOutBranch)
  .onCase(1, somenteRegistrarBranch)
  .onCase(2, midiaBranch)
  .onCase(3, conversaBranch);

const syncCrmAndGate = postLeadIdempotent.to(
  attachTenantToLeadResponse.to(
    splitBufferedMessages.to(postBufferedMessage.to(decideRoute.to(routeSwitchRouted)))
  )
);

const debounceChain = conversaEstadoBeforeBuffer.to(
  appendToBuffer.to(
    conversaEstadoUpsertBuffer.to(
      waitForDebounce.to(
        conversaEstadoAfterWait.to(checkStillLatest.to(isStillLatest.onTrue(syncCrmAndGate)))
      )
    )
  )
);

export default workflow("crivo-agente-principal", "crivo-agente-principal")
  .add(whatsAppInboundTrigger)
  .to(
    onlyMessageEvents.to(
      normalizeEventCode.to(tenantConfigLookup.to(combineEventAndTenant.to(debounceChain)))
    )
  );
