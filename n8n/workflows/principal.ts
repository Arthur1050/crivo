/**
 * crivo-agente-principal — pipeline completo (T10).
 *
 * Fonte versionada do workflow n8n de qualificação conversacional
 * (design.md — "Pipeline do workflow principal (visão de nós)"; AD-014:
 * workflow-as-code). Texto de ENTRADA do inliner (`scripts/n8n-inline.mjs`)
 * — o publicável é `n8n/generated/principal.ts` (gerado, nunca editado à
 * mão). Requisitos: AGT-01, AGT-02, AGT-03, AGT-04, AGT-07 (AC1-2), AGT-08,
 * LGPD-03.
 *
 * SEM FUNÇÕES CUSTOMIZADAS (nem `function`, nem arrow function) NESTE
 * ARQUIVO — confirmado por `validate_workflow` durante o T10: o parser do
 * SDK rejeita tanto `FunctionDeclaration` quanto `ArrowFunctionExpression`
 * no nível do código de workflow ("Unsupported syntax"). Todo padrão
 * repetido (schema de coluna de Data Table, condição de Switch, os 4
 * finalize-de-branch, as 2 tentativas de LLM) está por isso ESCRITO POR
 * EXTENSO em cada local, em vez de extraído em um helper — verboso de
 * propósito, não um descuido. Arrow functions DENTRO de uma string de
 * `jsCode`/`expr()` continuam normais (são texto para o motor de expressão
 * do n8n ou o sandbox do Code node em runtime, não código deste arquivo).
 *
 * CONVENÇÃO DE CONVERGÊNCIA (lida antes de mexer neste arquivo): sempre que
 * um nó HTTP/Calendar/WhatsApp substitui `$json` pela SUA PRÓPRIA resposta
 * (perdendo os campos anteriores), o nó seguinte que precisa desses campos
 * originais os lê de volta via `$('Nome do nó ancestral').first().json...`,
 * nunca confiando em passthrough implícito. Dois "checkpoints" canônicos
 * carregam o contexto:
 *   - `Code: combinar evento e tenant` — evento normalizado + tenant_config
 *     (waId, phoneNumberId, tenantSlug, apiKey, calendarId, text, hasMedia,
 *     sentAt, messageId, contactName).
 *   - `Code: contexto do lead` — o checkpoint acima + a resposta do
 *     `POST /leads` (id, status, optedOutAt, campos de qualificação) + o
 *     buffer de mensagens da rajada.
 * Referenciar SEMPRE esses dois nós pelo nome ao invés de encadear $json
 * cego por um HTTP/Calendar node é a regra deste arquivo inteiro.
 *
 * NOTAS DE INCERTEZA GENUÍNA (não fabricadas — sinalizadas em vez de
 * adivinhadas, por instrução do skill):
 *   1. Formato exato do item emitido pelo nó `whatsAppTrigger` do n8n
 *      (envelope bruto da Meta vs. `value` achatado) — harness do
 *      `Code: normalizeEvent` aceita as duas formas defensivamente; T12
 *      reconcilia contra payload real.
 *   2. `conferenceSolution` do Google Calendar (`getConferenceSolutions`)
 *      não pôde ser aterrado via `explore_node_resources` — não existe
 *      credencial Google Calendar na instância nesta sessão (confirmado via
 *      `list_credentials`, T9/T10). Usado o valor `hangoutsMeet`, que é uma
 *      constante pública e estável da própria API do Google Calendar (não
 *      um id gerado pelo n8n) — precisa ser confirmado quando a credencial
 *      existir (T12).
 */
import {
  workflow,
  node,
  trigger,
  ifElse,
  switchCase,
  newCredential,
  languageModel,
  outputParser,
  expr,
} from "@n8n/workflow-sdk";

const CRM_BASE_URL = "https://crivo-arthur1050s-projects.vercel.app/api/v1";

// IDs reais das Data Tables — criadas via MCP `create_data_table` no T10
// (instância pessoal do usuário, projeto R8EhBkOjdyDLT02w). Nunca um valor
// inventado: cada id abaixo veio direto da resposta do MCP na criação.
const TENANT_CONFIG_TABLE_ID = "eqp0TUHvN9yQNvdY";
const CONVERSA_ESTADO_TABLE_ID = "6SLkn98QYKQsinFR";
const AGENDA_ENVIOS_TABLE_ID = "ARcM27JDL4F6o3oi";

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
      whatsAppTriggerApi: newCredential("WhatsApp OAuth account", "j82xS3mPwtiuhMlc"),
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
// 8. Rota conversa: settings + context -> buildPrompt -> Gemini
//    (1 retry) -> validateLlmOutput -> switch de ação (design.md
//    passos 8-9; AGT-02, AGT-04, AGT-08).
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

// lote-6b — CTX-01/PER-01: histórico da conversa (`n8n/src/history.mjs`,
// T5) alimenta o prompt (T6). `onError: continueRegularOutput` +
// `alwaysOutputData` degradam para histórico vazio quando a chamada falha
// (CTX-01 AC5) — nunca aborta o turno. `Code: montar prompt`, adiante, lê
// este nó por referência nomeada e filtra defensivamente qualquer item que
// não tenha o formato de `SerializedMessage`.
const getMessagesHistory = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: GET /leads/{id}/messages",
    position: [4830, 460],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueRegularOutput",
    alwaysOutputData: true,
    parameters: {
      method: "GET",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: gate').first().json.id }}/messages`),
      sendQuery: true,
      queryParameters: { parameters: [{ name: "limit", value: "20" }] },
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }] },
    },
  },
  output: [{ id: "4fa85f64-5717-4562-b3fc-2c963f66afa7", externalId: "wamid.EXEMPLO", sender: "lead", content: "Oi, vi o anúncio do apartamento", sentAt: "2026-08-05T12:10:00.000Z" }],
});

// SPEC_DEVIATION: GET /context exige `modality` em {novo, usado} (não
// aceita null nem "ambos" — ContextModality do openapi.yaml). Antes do
// lead revelar a modalidade, `modality` é null. design.md não define o
// fallback exato para esse caso; escolha documentada aqui: default
// 'novo' até a modalidade ser capturada (nunca bloqueia a chamada,
// nunca quebra o contrato) — auto-corrige assim que `atualizar_campos`
// grava a modalidade real.
const getContext = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: GET /context",
    position: [4960, 300],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "GET",
      url: `${CRM_BASE_URL}/context`,
      sendQuery: true,
      queryParameters: {
        parameters: [{ name: "modality", value: expr("{{ $('Code: gate').first().json.modality === 'usado' ? 'usado' : 'novo' }}") }],
      },
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }] },
    },
  },
  output: [{ id: "5fa85f64-5717-4562-b3fc-2c963f66afa8", name: "Tabela FGTS", modality: "usado", category: { name: "Financiamento", color: "blue" }, content: null }],
});

const buildPromptCode = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: montar prompt",
    position: [5220, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(business-hours.mjs)__' +
        "\n" +
        '__INLINE(history.mjs)__' +
        "\n" +
        '__INLINE(prompt.mjs)__' +
        "\n\n" +
        "const settings = $('HTTP: GET /settings').first().json;\n" +
        "const contextDocs = $input.all().map((item) => item.json);\n" +
        "const leadCtx = $('Code: gate').first().json;\n" +
        "const businessHours = resolveBusinessHours(settings);\n" +
        "const lead = {\n" +
        "  modality: leadCtx.modality, region: leadCtx.region, budgetCents: leadCtx.budgetCents,\n" +
        "  propertyType: leadCtx.propertyType, purchaseHorizon: leadCtx.purchaseHorizon,\n" +
        "  motivation: leadCtx.motivation, creditStatus: leadCtx.creditStatus, chainedOperation: leadCtx.chainedOperation,\n" +
        "};\n" +
        "const bufferArray = $('Code: contexto do lead').first().json.bufferArray || [];\n" +
        "const buffer = bufferArray.map((m) => ({ text: m.text }));\n" +
        // Degradação defensiva (CTX-01 AC5): `HTTP: GET /leads/{id}/messages`
        // roda com onError:continueRegularOutput + alwaysOutputData — em
        // falha, o item resultante não tem o formato de `SerializedMessage`
        // (sender/content ausentes). Filtrar aqui, em vez de confiar
        // cegamente no shape, garante histórico vazio no lugar de lixo no
        // prompt sem nunca abortar o turno.
        "const rawHistory = $('HTTP: GET /leads/{id}/messages').all()\n" +
        "  .map((item) => item.json)\n" +
        "  .filter((m) => m && typeof m.sender === 'string' && typeof m.content === 'string' && typeof m.sentAt === 'string');\n" +
        "const history = selectHistoryWindow(rawHistory);\n" +
        "const prompt = buildPrompt({ settings, context: contextDocs, lead, buffer, businessHours, history });\n" +
        // formatInstruction migrou para prompt.mjs (T6) — buildPrompt já
        // devolve o prompt completo, incluindo a seção de formato.
        "return [{ json: { prompt } }];\n",
    },
  },
  output: [{ prompt: "Você é Ana, agente de atendimento via WhatsApp..." }],
});

// -- Tentativa 1 do Gemini (Gemini Chat Model isolado num nó só — trocar de
//    modelo é trocar este 1 nó, design.md §Integration Points) --

const geminiModelAttempt1 = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
  version: 1.1,
  config: {
    name: "Gemini Chat Model (tentativa 1)",
    position: [5480, 180],
    parameters: { modelName: "models/gemini-3.1-flash-lite", options: { temperature: 0.4 } },
    credentials: { googlePalmApi: newCredential("Google Gemini(PaLM) Api account", "QzmtdaZUYah2yKJ5") },
  },
});

const outputParserAttempt1 = outputParser({
  type: "@n8n/n8n-nodes-langchain.outputParserStructured",
  version: 1.3,
  config: {
    name: "Structured Output Parser (tentativa 1)",
    position: [5480, 420],
    // schemaType: "manual" com enum explícito (não "fromJson") — descoberto
    // via execução real no T10 (execução 55): "fromJson" só INFERE tipos a
    // partir de um exemplo, sem enum e marcando TODAS as subchaves de
    // `campos` como obrigatórias. Isso causou 2 bugs reais observados: (1)
    // o Gemini devolveu `acao: "qualificacao"` (fora do whitelist,
    // corretamente rejeitado por validateLlmOutput — prova que a barreira
    // anti-alucinação funciona) porque nada no schema dizia quais 4 valores
    // são válidos; (2) `campos` obrigatório em TODAS as subchaves forçava o
    // modelo a inventar valores (budgetCents, propertyType etc.) mesmo
    // quando o lead não tinha revelado nada — violação direta de AGT-02
    // AC3/AC4. O schema manual abaixo corrige os dois: enum fechado em
    // `acao`/`modality`/`propertyType`/`motivation`/`creditStatus`, e
    // NENHUMA subchave de `campos` obrigatória (só inclui o que o lead
    // revelou).
    parameters: {
      schemaType: "manual",
      inputSchema: JSON.stringify({
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          output: {
            type: "object",
            properties: {
              acao: { type: "string", enum: ["responder", "atualizar_campos", "agendar", "escalar"] },
              campos: {
                type: "object",
                properties: {
                  modality: { type: "string", enum: ["novo", "usado", "ambos"] },
                  region: { type: "string" },
                  budgetCents: { type: "integer" },
                  propertyType: { type: "string", enum: ["casa", "apartamento"] },
                  purchaseHorizon: { type: "string" },
                  motivation: { type: "string", enum: ["investidor", "morador"] },
                  creditStatus: { type: "string", enum: ["pre_aprovado", "recurso_proprio", "fgts"] },
                  chainedOperation: { type: "boolean" },
                  leadEmail: { type: ["string", "null"] },
                  meetingAtProposto: { type: "string" },
                },
                additionalProperties: false,
              },
              mensagens: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
              motivoEscalonamento: { type: "string" },
            },
            required: ["acao", "campos", "mensagens"],
            additionalProperties: false,
          },
        },
        required: ["output"],
        additionalProperties: false,
      }),
    },
  },
});

const askGeminiAttempt1 = node({
  type: "@n8n/n8n-nodes-langchain.chainLlm",
  version: 1.9,
  config: {
    name: "Gemini: extrair campos e redigir resposta (tentativa 1)",
    position: [5480, 300],
    parameters: {
      promptType: "define",
      text: expr("{{ $('Code: montar prompt').first().json.prompt }}"),
      hasOutputParser: true,
    },
    subnodes: { model: geminiModelAttempt1, outputParser: outputParserAttempt1 },
  },
  output: [{ output: { acao: "atualizar_campos", campos: { region: "Uberaba" }, mensagens: ["Legal, região Uberaba anotada!", "E o orçamento, você já tem uma faixa em mente?"] } }],
});

const validateLlmAttempt1 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: validar saida llm (tentativa 1)",
    position: [5740, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(business-hours.mjs)__' +
        "\n" +
        '__INLINE(validate-llm.mjs)__' +
        "\n\n" +
        "const raw = $input.first().json.output;\n" +
        "const settings = $('HTTP: GET /settings').first().json;\n" +
        "const result = validateLlmOutput(raw, settings);\n" +
        "return [{ json: result }];\n",
    },
  },
  output: [{ ok: true, acao: "atualizar_campos", campos: { region: "Uberaba" }, mensagens: ["Legal, região Uberaba anotada!"], resposta: "Legal, região Uberaba anotada!" }],
});

const isValidAttempt1 = ifElse({
  version: 2.3,
  config: {
    name: "Saída válida (tentativa 1)?",
    position: [6000, 300],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.ok }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

// -- Tentativa 2 (mesmo prompt; AGT-02/08 exige 1 retry antes da pergunta
//    de esclarecimento — sem cycle no grafo, 2a instância física dos
//    mesmos 3 nós) --

const geminiModelAttempt2 = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
  version: 1.1,
  config: {
    name: "Gemini Chat Model (tentativa 2)",
    position: [6260, 480],
    parameters: { modelName: "models/gemini-3.1-flash-lite", options: { temperature: 0.4 } },
    credentials: { googlePalmApi: newCredential("Google Gemini(PaLM) Api account", "QzmtdaZUYah2yKJ5") },
  },
});

const outputParserAttempt2 = outputParser({
  type: "@n8n/n8n-nodes-langchain.outputParserStructured",
  version: 1.3,
  config: {
    name: "Structured Output Parser (tentativa 2)",
    position: [6260, 720],
    // Mesmo schema manual da tentativa 1 (ver comentário lá) — corrige o
    // mesmo problema encontrado na execução real (T10, execução 55).
    parameters: {
      schemaType: "manual",
      inputSchema: JSON.stringify({
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          output: {
            type: "object",
            properties: {
              acao: { type: "string", enum: ["responder", "atualizar_campos", "agendar", "escalar"] },
              campos: {
                type: "object",
                properties: {
                  modality: { type: "string", enum: ["novo", "usado", "ambos"] },
                  region: { type: "string" },
                  budgetCents: { type: "integer" },
                  propertyType: { type: "string", enum: ["casa", "apartamento"] },
                  purchaseHorizon: { type: "string" },
                  motivation: { type: "string", enum: ["investidor", "morador"] },
                  creditStatus: { type: "string", enum: ["pre_aprovado", "recurso_proprio", "fgts"] },
                  chainedOperation: { type: "boolean" },
                  leadEmail: { type: ["string", "null"] },
                  meetingAtProposto: { type: "string" },
                },
                additionalProperties: false,
              },
              mensagens: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
              motivoEscalonamento: { type: "string" },
            },
            required: ["acao", "campos", "mensagens"],
            additionalProperties: false,
          },
        },
        required: ["output"],
        additionalProperties: false,
      }),
    },
  },
});

const askGeminiAttempt2 = node({
  type: "@n8n/n8n-nodes-langchain.chainLlm",
  version: 1.9,
  config: {
    name: "Gemini: extrair campos e redigir resposta (tentativa 2)",
    position: [6260, 600],
    parameters: {
      promptType: "define",
      text: expr("{{ $('Code: montar prompt').first().json.prompt }}"),
      hasOutputParser: true,
    },
    subnodes: { model: geminiModelAttempt2, outputParser: outputParserAttempt2 },
  },
  output: [{ output: { acao: "responder", campos: {}, mensagens: ["Pode me contar um pouco mais sobre o que você procura?"] } }],
});

const validateLlmAttempt2 = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: validar saida llm (tentativa 2)",
    position: [6520, 600],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(business-hours.mjs)__' +
        "\n" +
        '__INLINE(validate-llm.mjs)__' +
        "\n\n" +
        "const raw = $input.first().json.output;\n" +
        "const settings = $('HTTP: GET /settings').first().json;\n" +
        "const result = validateLlmOutput(raw, settings);\n" +
        "return [{ json: result }];\n",
    },
  },
  output: [{ ok: true, acao: "responder", campos: {}, mensagens: ["Pode me contar um pouco mais?"], resposta: "Pode me contar um pouco mais?" }],
});

const isValidAttempt2 = ifElse({
  version: 2.3,
  config: {
    name: "Saída válida (tentativa 2)?",
    position: [6780, 600],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.ok }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

// AGT-02/AGT-08 edge case (spec.md): saída do LLM inválida mesmo após 1
// retry -> pergunta de esclarecimento, NADA é gravado no CRM (nunca uma
// alucinação vira PATCH/evento/envio).
const clarifyFallback = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: pergunta de esclarecimento (2 tentativas inválidas)",
    position: [7040, 700],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "return [{ json: { ok: true, acao: 'responder', campos: {}, mensagens: ['Desculpa, não entendi direito — você pode reformular sua última mensagem?'] } }];\n",
    },
  },
  output: [{ ok: true, acao: "responder", campos: {}, mensagens: ["Desculpa, não entendi direito — você pode reformular?"] }],
});

const actionSwitch = switchCase({
  version: 3.4,
  config: {
    name: "Switch: rota da ação (validado)",
    position: [7300, 400],
    parameters: {
      rules: {
        values: [
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.acao }}"), operator: { type: "string", operation: "equals" }, rightValue: "atualizar_campos" }], combinator: "and" } },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.acao }}"), operator: { type: "string", operation: "equals" }, rightValue: "agendar" }], combinator: "and" } },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.acao }}"), operator: { type: "string", operation: "equals" }, rightValue: "escalar" }], combinator: "and" } },
          { conditions: { options: { caseSensitive: true, leftValue: "", typeValidation: "strict" }, conditions: [{ leftValue: expr("{{ $json.acao }}"), operator: { type: "string", operation: "equals" }, rightValue: "responder" }], combinator: "and" } },
        ],
      },
      // Fallback 'none' pelo mesmo motivo do Switch de rota: acao é
      // whitelisted por validateLlmOutput (n8n/src/validate-llm.mjs,
      // ACAO_VALUES fechado) — testado exaustivamente, 5o valor não ocorre.
      options: {},
    },
  },
});

// -- atualizar_campos: PATCH só com as chaves extraídas (AGT-02 AC3) --

// Checkpoint (mesma convenção de "Code: destinatário do envio", ver topo do
// arquivo): único predecessor (a saída 0 do Switch, sempre presente quando
// este nó roda, porque só é alcançável por essa saída), então
// $input.first().json aqui é sempre a saída validada do LLM
// ({ ok, acao, campos, resposta }) — nunca ambíguo. Existe porque
// `Code: finalizar atualizar_campos`, adiante, tinha o mesmo defeito de
// classe já corrigido no envio/registro: lia $input.first().json depois de
// `HTTP: PATCH /leads/{id} (campos)` já ter sobrescrito $json com a resposta
// da API (`{id, status}`, sem `resposta`/`acao`) — `validated.resposta`
// resolvia undefined, e a mensagem enviada ao lead saía vazia. Diferente do
// bug do Switch por referência nomeada (`.first()` sempre lendo a saída 0):
// aqui o defeito é ler `$input` depois que um nó HTTP no meio do caminho já
// substituiu $json — mesma classe, mecanismo ligeiramente diferente.
const validatedFieldsCheckpoint = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: dados validados (atualizar_campos)",
    position: [7560, -200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return [{ json: $input.first().json }];\n",
    },
  },
  output: [{ ok: true, acao: "atualizar_campos", campos: { region: "Uberaba" }, mensagens: ["Legal, região Uberaba anotada!"], resposta: "Legal, região Uberaba anotada!" }],
});

const patchFields = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: PATCH /leads/{id} (campos)",
    position: [7820, -200],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    // AGT-07 AC1: 409 (transição inválida/trava humana) não deve travar a
    // execução — mas atualizar_campos nunca envia `status`, então um 409
    // aqui seria inesperado; neverError garante que, se ainda assim
    // acontecer (ex.: 404 recurso removido), a conversa segue mesmo assim
    // em vez de abortar a execução inteira.
    onError: "continueRegularOutput",
    parameters: {
      method: "PATCH",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: gate').first().json.id }}`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr("{{ (() => { const c = { ...$json.campos }; delete c.leadEmail; delete c.meetingAtProposto; return c; })() }}"),
    },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "em_qualificacao" }],
});

const finalizeFields = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar atualizar_campos",
    position: [8080, -200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "const validated = $('Code: dados validados (atualizar_campos)').first().json;\n" +
        "const fase = (validated.acao === 'agendar' ? 'agendando' : 'qualificando');\n" +
        "return [{ json: { mensagens: validated.mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, apiKey: ctx.apiKey, leadId: ctx.id, fase } }];\n",
    },
  },
  output: [{ mensagens: ["resposta do agente"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
});

// -- agendar: availability -> event.create (Meet) -> PATCH -> agenda_envios (AGT-04) --

// Mesmo checkpoint da branch atualizar_campos acima (ver comentário lá):
// único predecessor (saída 1 do Switch), sempre a saída validada do LLM
// quando este nó roda. Substitui as referências quebradas
// `$('Switch: rota da ação (validado)').first()` (sempre lê a saída 0,
// confirmado no mecanismo da execução 364 — aqui a saída 0 é
// atualizar_campos, então em toda execução da rota agendar essa leitura
// vinha vazia) usadas por `Google Calendar: criar evento (Meet)`,
// `HTTP: PATCH /leads/{id} (agendado)` e
// `Data Table: agendar lembrete (agenda_envios)`, e a referência `$input`
// quebrada (mesmo mecanismo do checkpoint acima) usada por
// `Code: finalizar agendado`.
const validatedAgendarCheckpoint = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: dados validados (agendar)",
    position: [7560, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return [{ json: $input.first().json }];\n",
    },
  },
  output: [{ ok: true, acao: "agendar", campos: { meetingAtProposto: "2026-08-10T12:00:00.000Z", leadEmail: null }, mensagens: ["Perfeito, agendado!"], resposta: "Perfeito, agendado!" }],
});

const checkAvailability = node({
  type: "n8n-nodes-base.googleCalendar",
  version: 1.3,
  config: {
    name: "Google Calendar: availability",
    position: [7820, 0],
    parameters: {
      resource: "calendar",
      operation: "availability",
      calendar: { __rl: true, mode: "id", value: expr("{{ $('Code: gate').first().json.calendarId }}") },
      timeMin: expr("{{ $json.campos.meetingAtProposto }}"),
      // Duração assumida de 30min por reunião de qualificação (não
      // especificada no design; escolha documentada aqui — spec/design não
      // definem duração, mantém-se um valor conservador e fácil de mudar).
      timeMax: expr("{{ DateTime.fromISO($json.campos.meetingAtProposto).plus({ minutes: 30 }).toISO() }}"),
    },
    // Credencial Google Calendar criada pelo usuário (runbook README §2.3,
    // human gate) — não existia nenhuma credencial Google Calendar quando
    // este arquivo foi originalmente escrito no T10 (ver nota de topo do
    // arquivo), então o nó nasceu sem `credentials` nenhum. Adicionado aqui
    // ao ativar o workflow em T12/T13 prep — id copiado exatamente de
    // `list_credentials`.
    credentials: { googleCalendarOAuth2Api: newCredential("Google Calendar account", "qVDBCmu934sXN39R") },
  },
  output: [{ available: true }],
});

const isAvailable = ifElse({
  version: 2.3,
  config: {
    name: "Horário disponível?",
    position: [8080, 0],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.available }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

const createCalendarEvent = node({
  type: "n8n-nodes-base.googleCalendar",
  version: 1.3,
  config: {
    name: "Google Calendar: criar evento (Meet)",
    position: [8340, -80],
    parameters: {
      resource: "event",
      operation: "create",
      calendar: { __rl: true, mode: "id", value: expr("{{ $('Code: gate').first().json.calendarId }}") },
      start: expr("{{ $('Code: dados validados (agendar)').first().json.campos.meetingAtProposto }}"),
      end: expr("{{ DateTime.fromISO($('Code: dados validados (agendar)').first().json.campos.meetingAtProposto).plus({ minutes: 30 }).toISO() }}"),
      additionalFields: {
        summary: expr("{{ 'Reunião com ' + $('Code: gate').first().json.contactName }}"),
        // conferenceSolution "hangoutsMeet": constante pública da API do
        // Google Calendar (não um id do n8n) — não pôde ser aterrada via
        // explore_node_resources nesta sessão (sem credencial Google
        // Calendar na instância, ver nota de topo do arquivo).
        conferenceDataUi: { conferenceDataValues: { conferenceSolution: "hangoutsMeet" } },
        attendees: expr("{{ $('Code: dados validados (agendar)').first().json.campos.leadEmail ? [$('Code: dados validados (agendar)').first().json.campos.leadEmail] : [] }}"),
      },
    },
    // Mesmo achado do nó de availability acima — id copiado exatamente de
    // `list_credentials`.
    credentials: { googleCalendarOAuth2Api: newCredential("Google Calendar account", "qVDBCmu934sXN39R") },
  },
  output: [{ id: "evt123", htmlLink: "https://calendar.google.com/event?eid=evt123", start: { dateTime: "2026-08-10T12:00:00.000Z" } }],
});

const patchScheduled = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: PATCH /leads/{id} (agendado)",
    position: [8600, -80],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: "continueRegularOutput",
    parameters: {
      method: "PATCH",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: gate').first().json.id }}`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { status: 'qualificado_agendado', meetingAt: $('Code: dados validados (agendar)').first().json.campos.meetingAtProposto, executiveSummary: 'Reunião agendada via WhatsApp: ' + $('Code: dados validados (agendar)').first().json.resposta } }}"
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
    position: [8860, -80],
    parameters: {
      resource: "row",
      operation: "insert",
      dataTableId: { __rl: true, mode: "id", value: AGENDA_ENVIOS_TABLE_ID },
      columns: {
        mappingMode: "defineBelow",
        value: {
          leadId: expr("{{ $('Code: gate').first().json.id }}"),
          tenantSlug: expr("{{ $('Code: gate').first().json.tenantSlug }}"),
          waId: expr("{{ $('Code: gate').first().json.waId }}"),
          meetingAt: expr("{{ $('Code: dados validados (agendar)').first().json.campos.meetingAtProposto }}"),
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

const finalizeScheduled = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar agendado",
    position: [9120, -80],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "const validated = $('Code: dados validados (agendar)').first().json;\n" +
        "const fase = (validated.acao === 'agendar' ? 'agendando' : 'qualificando');\n" +
        "return [{ json: { mensagens: validated.mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, apiKey: ctx.apiKey, leadId: ctx.id, fase } }];\n",
    },
  },
  output: [{ mensagens: ["resposta do agente"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "agendando" }],
});

// SPEC_DEVIATION: design.md não define o desfecho quando o horário
// escolhido pelo LLM deixa de estar livre entre a proposta e a checagem —
// escolha documentada aqui: nenhum efeito colateral (sem event.create, sem
// PATCH de status), resposta fixa pedindo outro horário, sem chamar o LLM
// de novo (mantém o mesmo princípio anti-alucinação: nenhuma escrita sem
// validação determinística).
const finalizeUnavailable = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar horário indisponível",
    position: [8340, 120],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "const mensagens = ['Esse horário acabou de ficar indisponível na minha agenda — podemos combinar outro horário dentro do nosso período de atendimento?'];\n" +
        "return [{ json: { mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, apiKey: ctx.apiKey, leadId: ctx.id, fase: 'agendando' } }];\n",
    },
  },
  output: [{ mensagens: ["horário indisponível, escolha outro"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "agendando" }],
});

// -- escalar: PATCH status=escalado_humano + motivo (AGT-05 AC1) --

// Mesmo checkpoint das branches acima (ver comentário em
// `validatedFieldsCheckpoint`): único predecessor (saída 2 do Switch).
// `Code: finalizar escalado` tinha o mesmo defeito de `$input` das outras
// duas branches — aqui, além disso, referenciar o Switch pelo nome NÃO
// seria uma correção coincidentemente válida (diferente da rota
// atualizar_campos, que é a saída 0): a saída 2 nunca é a que `.first()` lê.
const validatedEscalarCheckpoint = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: dados validados (escalar)",
    position: [7560, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return [{ json: $input.first().json }];\n",
    },
  },
  output: [{ ok: true, acao: "escalar", campos: {}, mensagens: ["Vou chamar um atendente humano."], resposta: "Vou chamar um atendente humano.", motivoEscalonamento: "pedido explícito de humano" }],
});

const patchEscalated = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: PATCH /leads/{id} (escalar)",
    position: [7820, 300],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    // AGT-07 AC1: 409 (`transicao-invalida`/`lead-travado-por-humano`) não
    // pode derrubar a execução — a conversa segue sem repetir a
    // transição; como não há retentativa da MESMA transição de status
    // depois disso (fluxo linear, sem loop-back), neverError sozinho já
    // satisfaz o AC.
    onError: "continueRegularOutput",
    parameters: {
      method: "PATCH",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: gate').first().json.id }}`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: gate').first().json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { status: 'escalado_humano', escalationReason: $json.motivoEscalonamento, executiveSummary: 'Escalonado via WhatsApp: ' + $json.motivoEscalonamento } }}"
      ),
    },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "escalado_humano" }],
});

const finalizeEscalated = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar escalado",
    position: [8080, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "const validated = $('Code: dados validados (escalar)').first().json;\n" +
        "const fase = 'encerrada';\n" +
        "return [{ json: { mensagens: validated.mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, apiKey: ctx.apiKey, leadId: ctx.id, fase } }];\n",
    },
  },
  output: [{ mensagens: ["resposta do agente"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "encerrada" }],
});

// -- responder: sem efeito colateral no CRM (AGT-02 default) --

const finalizeResponder = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: finalizar responder",
    position: [7560, 600],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "const validated = $input.first().json;\n" +
        "const fase = (validated.acao === 'agendar' ? 'agendando' : 'qualificando');\n" +
        "return [{ json: { mensagens: validated.mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, apiKey: ctx.apiKey, leadId: ctx.id, fase } }];\n",
    },
  },
  output: [{ mensagens: ["resposta do agente"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
});

// ---------------------------------------------------------------------
// 9. Convergência: enviar a resposta por WhatsApp, registrar como
//    mensagem do agente (AGT-01 AC5), limpar buffer.
// ---------------------------------------------------------------------

// Convergência de TODAS as rotas antes do envio: o `wa_id` que a Meta
// entrega para celular brasileiro vem no formato legado, sem o nono dígito
// (`553499532444`), e a Cloud API rejeita esse destinatário com o erro
// 131030 "Recipient phone number not in allowed list" — falha confirmada na
// execução 354. O `waId` cru continua sendo a chave das Data Tables e o
// `externalId` do lead no CRM; só o destinatário do envio é normalizado
// (n8n/src/phone.mjs).
const normalizeRecipient = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: destinatário do envio",
    position: [8840, 300],
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
  output: [{ mensagens: ["resposta do agente"], waId: "553499532444", recipientMsisdn: "5534999532444", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", apiKey: "exemplo", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
});

// lote-6b — PER-02 AC2/AC3: cadeia LINEAR de 3 estágios (send -> register ->
// IF existe próxima?), nunca um loop no grafo (mesma restrição que já forçou
// duas instâncias físicas do Gemini). Cada nó de envio/registro lê
// `mensagens[i]` de `Code: destinatário do envio` por REFERÊNCIA NOMEADA —
// nunca de `$json` encadeado — porque cada `WhatsApp: enviar mensagem N`
// substitui `$json` pela resposta da Cloud API (mesma classe de bug
// corrigida em `7041a78`/`006e789`). `mensagens[1]`/`mensagens[2]` só
// existem quando o modelo devolveu 2/3 mensagens (PER-02 AC1); os nós IF
// abaixo decidem isso pelo tamanho do array, nunca por acessar um índice
// ausente.

const sendReply1 = node({
  type: "n8n-nodes-base.whatsApp",
  version: 1.1,
  config: {
    name: "WhatsApp: enviar mensagem 1",
    position: [9100, 300],
    parameters: {
      resource: "message",
      operation: "send",
      phoneNumberId: expr("{{ $('Code: destinatário do envio').first().json.phoneNumberId }}"),
      recipientPhoneNumber: expr("{{ $('Code: destinatário do envio').first().json.recipientMsisdn }}"),
      messageType: "text",
      textBody: expr("{{ $('Code: destinatário do envio').first().json.mensagens[0] }}"),
    },
    // Mesmo achado do WhatsApp Trigger acima: placeholder "WhatsApp Send —
    // Crivo" nunca resolveu (nome real na instância é "WhatsApp account");
    // id copiado exatamente de `list_credentials`.
    credentials: { whatsAppApi: newCredential("WhatsApp account", "HB4RrjlPYBAIkaX8") },
  },
  output: [{ messages: [{ id: "wamid.RESPOSTA1" }] }],
});

const registerAgentReply1 = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: registrar mensagem 1",
    position: [9360, 300],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    // Duas referências quebradas corrigidas aqui originalmente (execução
    // 364, evidência direta — não hipótese), preservadas na nova cadeia de 3
    // estágios (lote-6b — T10):
    //   1. `$('Switch: rota (gate)').first()` lê SEMPRE a saída 0 do Switch
    //      (rota opt-out). Numa execução de rota `conversa` o item está na
    //      saída 3 e a saída 0 fica vazia — `id`/`apiKey` resolviam para
    //      string vazia. Vale para QUALQUER rota que não seja a de índice 0.
    //   2. Ler `resposta`/`mensagens` do nó WhatsApp não existe: a saída do
    //      nó WhatsApp é a resposta da Cloud API
    //      (`messaging_product`/`contacts`/`messages`), sem o texto enviado.
    // `Code: destinatário do envio` é a referência robusta: nó Code de saída
    // única por onde TODAS as rotas de envio convergem, carregando
    // `{ mensagens, waId, phoneNumberId, tenantSlug, apiKey, leadId, fase,
    // recipientMsisdn }`. `$json.messages[0].id` vem do nó WhatsApp que
    // precede DIRETAMENTE este (sem HTTP no meio) — é o wamid da mensagem 1,
    // e ali está correto.
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: destinatário do envio').first().json.leadId }}/messages`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: destinatário do envio').first().json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: $json.messages[0].id, sender: 'agente', content: $('Code: destinatário do envio').first().json.mensagens[0], sentAt: $now.toISO() } }}"
      ),
    },
  },
  output: [{ id: "6fa85f64-5717-4562-b3fc-2c963f66afa9", sender: "agente" }],
});

// PER-02 AC2: existe mensagem 2? Decide pelo TAMANHO do array (nunca por
// acessar `mensagens[1]` diretamente, que seria `undefined` quando o modelo
// devolveu só 1 mensagem).
const hasMessage2 = ifElse({
  version: 2.3,
  config: {
    name: "IF: existe mensagem 2?",
    position: [9620, 300],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            leftValue: expr("{{ $('Code: destinatário do envio').first().json.mensagens.length }}"),
            operator: { type: "number", operation: "gt" },
            rightValue: 1,
          },
        ],
      },
    },
  },
});

const waitMessage2 = node({
  type: "n8n-nodes-base.wait",
  version: 1.1,
  config: {
    name: "Aguardar 2s (mensagem 2)",
    position: [9880, 180],
    parameters: { resume: "timeInterval", amount: 2, unit: "seconds" },
  },
  output: [{}],
});

const sendReply2 = node({
  type: "n8n-nodes-base.whatsApp",
  version: 1.1,
  config: {
    name: "WhatsApp: enviar mensagem 2",
    position: [10140, 180],
    parameters: {
      resource: "message",
      operation: "send",
      phoneNumberId: expr("{{ $('Code: destinatário do envio').first().json.phoneNumberId }}"),
      recipientPhoneNumber: expr("{{ $('Code: destinatário do envio').first().json.recipientMsisdn }}"),
      messageType: "text",
      textBody: expr("{{ $('Code: destinatário do envio').first().json.mensagens[1] }}"),
    },
    credentials: { whatsAppApi: newCredential("WhatsApp account", "HB4RrjlPYBAIkaX8") },
  },
  output: [{ messages: [{ id: "wamid.RESPOSTA2" }] }],
});

const registerAgentReply2 = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: registrar mensagem 2",
    position: [10400, 180],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: destinatário do envio').first().json.leadId }}/messages`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: destinatário do envio').first().json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: $json.messages[0].id, sender: 'agente', content: $('Code: destinatário do envio').first().json.mensagens[1], sentAt: $now.toISO() } }}"
      ),
    },
  },
  output: [{ id: "7fa85f64-5717-4562-b3fc-2c963f66afaa", sender: "agente" }],
});

// PER-02 AC2: existe mensagem 3? Mesmo raciocínio de `hasMessage2`.
const hasMessage3 = ifElse({
  version: 2.3,
  config: {
    name: "IF: existe mensagem 3?",
    position: [10660, 180],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [
          {
            leftValue: expr("{{ $('Code: destinatário do envio').first().json.mensagens.length }}"),
            operator: { type: "number", operation: "gt" },
            rightValue: 2,
          },
        ],
      },
    },
  },
});

const waitMessage3 = node({
  type: "n8n-nodes-base.wait",
  version: 1.1,
  config: {
    name: "Aguardar 2s (mensagem 3)",
    position: [10920, 60],
    parameters: { resume: "timeInterval", amount: 2, unit: "seconds" },
  },
  output: [{}],
});

const sendReply3 = node({
  type: "n8n-nodes-base.whatsApp",
  version: 1.1,
  config: {
    name: "WhatsApp: enviar mensagem 3",
    position: [11180, 60],
    parameters: {
      resource: "message",
      operation: "send",
      phoneNumberId: expr("{{ $('Code: destinatário do envio').first().json.phoneNumberId }}"),
      recipientPhoneNumber: expr("{{ $('Code: destinatário do envio').first().json.recipientMsisdn }}"),
      messageType: "text",
      textBody: expr("{{ $('Code: destinatário do envio').first().json.mensagens[2] }}"),
    },
    credentials: { whatsAppApi: newCredential("WhatsApp account", "HB4RrjlPYBAIkaX8") },
  },
  output: [{ messages: [{ id: "wamid.RESPOSTA3" }] }],
});

const registerAgentReply3 = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: registrar mensagem 3",
    position: [11440, 60],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: destinatário do envio').first().json.leadId }}/messages`),
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "Authorization", value: expr("Bearer {{ $('Code: destinatário do envio').first().json.apiKey }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: $json.messages[0].id, sender: 'agente', content: $('Code: destinatário do envio').first().json.mensagens[2], sentAt: $now.toISO() } }}"
      ),
    },
  },
  output: [{ id: "8fa85f64-5717-4562-b3fc-2c963f66afab", sender: "agente" }],
});

const prepBufferClearAfterSend = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: preparar clear de buffer (pós-envio)",
    position: [11700, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      // Mesmo defeito dos nós de registro acima: `WhatsApp: enviar mensagem
      // N` devolve a resposta da Cloud API, que não tem `tenantSlug`/`waId`/
      // `fase` — os três resolviam `undefined` e o `Data Table: limpar buffer`
      // fazia upsert com chave vazia. Falha silenciosa (o nó "sucede"): o
      // buffer de debounce nunca era limpo, então as mensagens da rajada
      // anterior ficavam acumuladas e voltavam a ser reprocessadas no turno
      // seguinte. `waId` aqui é o CRU (chave das Data Tables), nunca o
      // `recipientMsisdn` normalizado.
      jsCode:
        "const ctx = $('Code: destinatário do envio').first().json;\n" +
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
    position: [11960, 100],
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
// nó/condicional com MÚLTIPLOS predecessores (`normalizeRecipient`, que é a
// porta de entrada do envio desde o fix do nono dígito; `actionSwitch`; e
// agora `prepClearWired`, alvo comum dos 3 desfechos da cadeia de envio
// sequencial — T10) tem sua wiring de SAÍDA (`.to(...)`/`.onCase(...)`)
// definida em UMA única expressão nomeada (`sendReplyWired`,
// `actionSwitchRouted`, `prepClearWired`) — nunca duas vezes. Todo
// predecessor referencia essa MESMA variável como alvo (fan-in seguro,
// mesmo mecanismo do padrão "fan_in" da referência do SDK: vários
// `.to(mesmoNo)` de origens diferentes, wiring de saída declarada 1 vez).
// ---------------------------------------------------------------------

// `prepClearWired` tem 3 predecessores (PER-02 AC2 — turno de 1, 2 ou 3
// mensagens termina aqui): a saída "não" de `hasMessage2`, a saída "não" de
// `hasMessage3`, e o fim da cadeia de envio da mensagem 3. Wiring de saída
// declarada UMA única vez, como a regra do topo do arquivo exige.
const prepClearWired = prepBufferClearAfterSend.to(clearBufferAndFinalize);

const stage3Wired = waitMessage3.to(sendReply3.to(registerAgentReply3.to(prepClearWired)));
const hasMessage3Wired = hasMessage3.onTrue!(stage3Wired).onFalse(prepClearWired);

const stage2Wired = waitMessage2.to(sendReply2.to(registerAgentReply2.to(hasMessage3Wired)));
const hasMessage2Wired = hasMessage2.onTrue!(stage2Wired).onFalse(prepClearWired);

const sendReplyWired = normalizeRecipient.to(
  sendReply1.to(registerAgentReply1.to(hasMessage2Wired))
);

const optOutBranch = postOptOut.to(finalizeOptOut.to(sendReplyWired));
const somenteRegistrarBranch = finalizeSomenteRegistrar.to(clearBufferAndFinalize);
const midiaBranch = finalizeMedia.to(sendReplyWired);

const agendarBranch = validatedAgendarCheckpoint.to(
  checkAvailability.to(
    isAvailable
      .onTrue!(createCalendarEvent.to(patchScheduled.to(insertAgendaEnvio.to(finalizeScheduled.to(sendReplyWired)))))
      .onFalse(finalizeUnavailable.to(sendReplyWired))
  )
);

const actionSwitchRouted = actionSwitch
  .onCase!(0, validatedFieldsCheckpoint.to(patchFields.to(finalizeFields.to(sendReplyWired))))
  .onCase(1, agendarBranch)
  .onCase(2, validatedEscalarCheckpoint.to(patchEscalated.to(finalizeEscalated.to(sendReplyWired))))
  .onCase(3, finalizeResponder.to(sendReplyWired));

const llmRetryChain = askGeminiAttempt1.to(
  validateLlmAttempt1.to(
    isValidAttempt1
      .onTrue!(actionSwitchRouted)
      .onFalse(
        askGeminiAttempt2.to(
          validateLlmAttempt2.to(
            isValidAttempt2.onTrue!(actionSwitchRouted).onFalse(clarifyFallback.to(actionSwitchRouted))
          )
        )
      )
  )
);

const conversaBranch = getSettings.to(
  getMessagesHistory.to(getContext.to(buildPromptCode.to(llmRetryChain)))
);

const routeSwitchRouted = routeSwitch
  .onCase!(0, optOutBranch)
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
        conversaEstadoAfterWait.to(checkStillLatest.to(isStillLatest.onTrue!(syncCrmAndGate)))
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
