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
 *     (waId, phoneNumberId, tenantSlug, calendarId, text, hasMedia,
 *     sentAt, messageId, contactName). Autenticação no CRM não passa mais por
 *     aqui (T17, SEC-01): todo nó HTTP/tool usa a credencial `httpHeaderAuth`
 *     "Crivo - chave de servico" + header `X-Crivo-Tenant` com o `tenantSlug`.
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
    // messageStatusUpdates: [] evita que cada mudanca de status de entrega
    // (enviado/entregue/lido) de uma mensagem do agente dispare uma execucao
    // nova do workflow -- sem isso, 1 mensagem trocada produzia ate 7
    // execucoes extras que morriam de proposito no filtro de statuses
    // (achado real em producao, 2026-08-16, execucoes 682-689).
    parameters: {
      updates: ["messages"],
      options: { messageStatusUpdates: [] },
    },
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
        "/**\n * Normaliza um evento webhook da WhatsApp Cloud API (Meta) — design.md,\n * Camada de decisão (AGT-01). Extrai só o que o fluxo precisa de um evento\n * `messages`; eventos `statuses` (delivered/read/sent/failed) e qualquer\n * payload sem os campos de identidade mínimos (phone_number_id/wa_id/id da\n * mensagem/timestamp válido) retornam `null` — nunca lança exceção sobre um\n * payload inesperado (reentrega/replay é rotina numa integração de\n * webhook).\n *\n * Função pura, sem I/O, sem dependências — roda dentro de um Code node do\n * n8n (sandbox: sem `require`, sem rede). Mapeamento de `phone_number_id`\n * para tenant e a decisão de descartar números não mapeados (AGT-01 AC4)\n * acontecem DEPOIS desta função, no lookup da Data Table `tenant_config`\n * (design.md — pipeline, passo 4) — esta função é agnóstica a qual tenant\n * o número pertence.\n *\n * Qualquer mensagem que não seja `type: \"text\"` (imagem, áudio, documento,\n * figurinha, localização, etc.) é tratada como mídia: `hasMedia: true` e\n * `text: \"\"` sempre — o agente responde com uma mensagem fixa \"sigo por\n * texto\" sem depender do conteúdo (spec.md — Edge Cases: mídia nunca é\n * persistida nem interpretada, incondicionalmente).\n *\n * @param {unknown} metaPayload - corpo bruto do POST do webhook da Meta\n * @returns {{waId: string, phoneNumberId: string, messageId: string, text: string, sentAt: string, hasMedia: boolean} | null}\n */\nfunction normalizeEvent(metaPayload) {\n  const value = metaPayload?.entry?.[0]?.changes?.[0]?.value;\n  if (!value || typeof value !== \"object\") return null;\n\n  // Eventos `statuses` (delivered/read/sent/failed) não são mensagens —\n  // descartados sem erro (spec.md — Edge Cases).\n  const message = Array.isArray(value.messages) ? value.messages[0] : undefined;\n  if (!message || typeof message !== \"object\") return null;\n\n  const phoneNumberId = value.metadata?.phone_number_id;\n  const waId = message.from;\n  const messageId = message.id;\n  if (\n    typeof phoneNumberId !== \"string\" ||\n    phoneNumberId === \"\" ||\n    typeof waId !== \"string\" ||\n    waId === \"\" ||\n    typeof messageId !== \"string\" ||\n    messageId === \"\"\n  ) {\n    return null;\n  }\n\n  const timestampSeconds = Number(message.timestamp);\n  if (!Number.isFinite(timestampSeconds)) return null;\n  const sentAt = new Date(timestampSeconds * 1000).toISOString();\n\n  const hasMedia = message.type !== \"text\";\n  const text = hasMedia ? \"\" : message.text?.body ?? \"\";\n\n  return { waId, phoneNumberId, messageId, text, sentAt, hasMedia };\n}" +
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
  output: [{ id: 1, phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", calendarId: "exemplo@group.calendar.google.com" }],
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
        "  tenantSlug: tenant.tenantSlug, calendarId: tenant.calendarId,\n" +
        "} };\n",
    },
  },
  output: [
    { waId: "5534999990001", phoneNumberId: "109876543210001", messageId: "wamid.EXEMPLO", text: "Oi", sentAt: "2026-08-05T12:10:00.000Z", hasMedia: false, contactName: "Lead Exemplo", tenantSlug: "imobiliaria-a", calendarId: "exemplo@group.calendar.google.com" },
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: combinar evento e tenant').item.json.tenantSlug }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { name: $('Code: combinar evento e tenant').item.json.contactName, phone: $('Code: combinar evento e tenant').item.json.waId, externalId: $('Code: combinar evento e tenant').item.json.waId, firstContactAt: $('Code: combinar evento e tenant').item.json.sentAt } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
        "return [{ json: { ...lead, tenantSlug: ctx.tenantSlug, calendarId: ctx.calendarId, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, contactName: ctx.contactName, text: ctx.text, hasMedia: ctx.hasMedia, sentAt: ctx.sentAt, bufferArray: buffer } }];\n",
    },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "em_qualificacao", optedOutAt: null, tenantSlug: "imobiliaria-a", calendarId: "exemplo@group.calendar.google.com", waId: "5534999990001", phoneNumberId: "109876543210001", contactName: "Lead Exemplo", text: "Oi", hasMedia: false, sentAt: "2026-08-05T12:10:00.000Z", bufferArray: [{ messageId: "wamid.EXEMPLO", text: "Oi", sentAt: "2026-08-05T12:10:00.000Z" }] }],
});

const splitBufferedMessages = node({
  type: "n8n-nodes-base.splitOut",
  version: 1,
  config: {
    name: "Split: mensagens do buffer",
    position: [3640, 0],
    parameters: { fieldToSplitOut: "bufferArray", include: "allOtherFields" },
  },
  output: [{ id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", tenantSlug: "imobiliaria-a", bufferArray: { messageId: "wamid.EXEMPLO", text: "Oi", sentAt: "2026-08-05T12:10:00.000Z" } }],
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $json.tenantSlug }}") }] },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: $json.bufferArray.messageId, sender: 'lead', content: $json.bufferArray.text, sentAt: $json.bufferArray.sentAt } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
        "/**\n * Detecção de opt-out + máquina de estados de roteamento da conversa\n * (design.md — Camada de decisão; LGPD-03, AGT-05 AC3, AGT-01). Funções\n * puras, sem I/O, sem dependências — rodam dentro de um Code node do n8n.\n */\n\n// Faixa Unicode dos diacríticos combinantes (U+0300-U+036F) produzidos pela\n// decomposição NFD — escrita como escape \\uXXXX (não caractere literal) de\n// propósito, para o padrão ficar legível e imune a mangling de encoding.\nconst DIACRITICS_PATTERN = /[̀-ͯ]/g;\nconst OPT_OUT_KEYWORDS = new Set([\"sair\", \"parar\"]);\n\n/**\n * Remove acentos (via decomposição NFD + descarte dos diacríticos\n * combinantes), apara espaços e normaliza para minúsculas — sem depender de\n * nenhuma lib externa.\n * @param {string} text\n * @returns {string}\n */\nfunction foldAccentsAndCase(text) {\n  return text.normalize(\"NFD\").replace(DIACRITICS_PATTERN, \"\").trim().toLowerCase();\n}\n\n/**\n * Detecta opt-out (LGPD-03): a mensagem inteira, depois de normalizada\n * (minúsculas, sem acento, sem espaços nas bordas), precisa ser EXATAMENTE\n * \"sair\" ou \"parar\" — a palavra isolada, não uma frase que a contém. Isso é\n * deliberado: \"quero sair do apartamento\" é uma frase sobre o imóvel, não um\n * comando de descadastro, e não pode disparar opt-out (spec.md — LGPD-03,\n * \"Done when\").\n * @param {unknown} text\n * @returns {boolean}\n */\nfunction detectOptOut(text) {\n  if (typeof text !== \"string\") return false;\n  const normalized = foldAccentsAndCase(text);\n  return OPT_OUT_KEYWORDS.has(normalized);\n}\n\n/**\n * @typedef {\"opt-out\" | \"somente-registrar\" | \"midia\" | \"conversa\"} GateRoute\n */\n\n/**\n * Decide a ÚNICA rota de uma mensagem recebida (design.md — Camada de\n * decisão, pipeline passo 7). Precedência, na ordem exata abaixo (cada\n * checagem só é avaliada se as anteriores não decidiram):\n *\n * 1. `optedOutAt` já preenchido (lead opinou por sair numa mensagem\n *    ANTERIOR) vence tudo → 'somente-registrar'. Isso evita reenviar a\n *    confirmação de descadastro (que o contrato exige ser única — LGPD-03\n *    AC1) quando um lead já opted-out manda \"sair\" de novo, ou qualquer\n *    outra mensagem (LGPD-03 AC3: nunca retoma a conversa automaticamente).\n * 2. Só então o texto é checado: opt-out detectado agora → 'opt-out'\n *    (LGPD-03 AC1 — primeira vez, dispara confirmação única). Vence a\n *    checagem de mídia abaixo (um opt-out em texto nunca é tratado como\n *    mídia).\n * 3. `status === 'escalado_humano'` (humano assumiu) → 'somente-registrar'\n *    (AGT-05 AC3) — vence a checagem de mídia abaixo também.\n * 4. Mídia sem texto (`hasMedia` e nenhum texto) → 'midia' (edge case —\n *    resposta fixa \"sigo por texto\", sem LLM).\n * 5. Caso contrário → 'conversa' (rota padrão, segue para o LLM).\n *\n * @param {{optedOutAt: unknown, status: unknown, hasMedia: unknown, text: unknown}} input\n * @returns {GateRoute}\n */\nfunction gate({ optedOutAt, status, hasMedia, text }) {\n  if (optedOutAt) return \"somente-registrar\";\n  if (detectOptOut(text)) return \"opt-out\";\n  if (status === \"escalado_humano\") return \"somente-registrar\";\n  if (hasMedia && !text) return \"midia\";\n  return \"conversa\";\n}" +
        "\n\n" +
        "const ctx = $('Code: contexto do lead').first().json;\n" +
        "const route = gate({ optedOutAt: ctx.optedOutAt, status: ctx.status, hasMedia: ctx.hasMedia, text: ctx.text });\n" +
        "return [{ json: { ...ctx, route } }];\n",
    },
  },
  output: [{ route: "conversa", id: "3fa85f64-5717-4562-b3fc-2c963f66afa6", status: "em_qualificacao", optedOutAt: null, tenantSlug: "imobiliaria-a", calendarId: "exemplo@group.calendar.google.com", waId: "5534999990001", phoneNumberId: "109876543210001" }],
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }] },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
        "return [{ json: { mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, leadId: ctx.id, fase: 'encerrada' } }];\n",
    },
  },
  output: [{ mensagens: ["confirmação de opt-out"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "encerrada" }],
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
        "return [{ json: { mensagens, waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, leadId: ctx.id, fase: ctx.fase || 'qualificando' } }];\n",
    },
  },
  output: [{ mensagens: ["sigo por texto"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }] },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
        "/**\n * Expiração de sessão e semeadura da memória (design.md — n8n/src/session.mjs;\n * spec.md MEM-02, MEM-03). Funções puras, sem I/O, sem dependências — rodam\n * dentro de um Code node do n8n. Absorve o corte de sessão de `history.mjs`\n * (o teto de 20 mensagens é removido — AD-019: sem teto de política, só a\n * salvaguarda alta de 50).\n */\n\nconst DEFAULT_SESSION_GAP_HOURS = 12;\nconst DEFAULT_MAX_SEED_MESSAGES = 50;\n\n/**\n * @typedef {{sender: \"lead\"|\"agente\", content: string, sentAt: string}} HistoryMessage\n */\n\n/**\n * Decide se a sessão expirou: o intervalo entre a mensagem atual (`now`) e a\n * última mensagem RECEBIDA da sessão (`lastInboundAt`) é maior que\n * `gapHours` (spec.md — MEM-02 AC3). `lastInboundAt` nulo significa\n * conversa nova, sem sessão nenhuma a purgar — nunca `true` (tasks.md — T3\n * Done-when). O limite é estritamente \"maior que\", não \"maior ou igual\"\n * (mesma convenção de `history.mjs`/`business-hours.mjs`): exatamente 12h de\n * intervalo NÃO expira a sessão.\n * @param {string | null | undefined} lastInboundAt\n * @param {string} now\n * @param {number} [gapHours]\n * @returns {boolean}\n */\nfunction isSessionExpired(lastInboundAt, now, gapHours = DEFAULT_SESSION_GAP_HOURS) {\n  if (lastInboundAt === null || lastInboundAt === undefined || lastInboundAt === \"\") {\n    return false;\n  }\n\n  const last = new Date(lastInboundAt).getTime();\n  const current = new Date(now).getTime();\n  if (Number.isNaN(last) || Number.isNaN(current)) return false;\n\n  const gapMs = gapHours * 60 * 60 * 1000;\n  return current - last > gapMs;\n}\n\n/**\n * Seleciona, dentre as mensagens do CRM, as que pertencem à sessão CORRENTE\n * para semear a memória em cold start (spec.md — MEM-03 AC5). Varre de trás\n * para frente comparando intervalos consecutivos — incluindo `now` como um\n * ponto de corte adicional ao final da lista: se já existe um intervalo\n * maior que `sessionGapHours` entre a última mensagem real e o instante\n * atual, nenhuma mensagem antiga é trazida (a sessão já teria sido purgada\n * por `isSessionExpired` antes deste passo — este cálculo apenas não\n * pressupõe essa ordem). Depois do corte de sessão, aplica só a salvaguarda\n * de `maxMessages` (default 50) — NUNCA o antigo teto de 20 (AD-019).\n * @param {HistoryMessage[] | null | undefined} messages - ordem cronológica crescente (mais antiga primeiro)\n * @param {string} now\n * @param {{maxMessages?: number, sessionGapHours?: number}} [options]\n * @returns {HistoryMessage[]}\n */\nfunction selectSeedMessages(\n  messages,\n  now,\n  { maxMessages = DEFAULT_MAX_SEED_MESSAGES, sessionGapHours = DEFAULT_SESSION_GAP_HOURS } = {}\n) {\n  const list = Array.isArray(messages) ? messages : [];\n  if (list.length === 0) return [];\n\n  const gapMs = sessionGapHours * 60 * 60 * 1000;\n  const nowMs = new Date(now).getTime();\n\n  let sessionStart = 0;\n  let previousMs = nowMs;\n  for (let i = list.length - 1; i >= 0; i--) {\n    const currentMs = new Date(list[i].sentAt).getTime();\n    if (previousMs - currentMs > gapMs) {\n      sessionStart = i + 1;\n      break;\n    }\n    previousMs = currentMs;\n  }\n\n  const session = list.slice(sessionStart);\n  return session.length > maxMessages ? session.slice(session.length - maxMessages) : session;\n}" +
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }] },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
        "/**\n * Expiração de sessão e semeadura da memória (design.md — n8n/src/session.mjs;\n * spec.md MEM-02, MEM-03). Funções puras, sem I/O, sem dependências — rodam\n * dentro de um Code node do n8n. Absorve o corte de sessão de `history.mjs`\n * (o teto de 20 mensagens é removido — AD-019: sem teto de política, só a\n * salvaguarda alta de 50).\n */\n\nconst DEFAULT_SESSION_GAP_HOURS = 12;\nconst DEFAULT_MAX_SEED_MESSAGES = 50;\n\n/**\n * @typedef {{sender: \"lead\"|\"agente\", content: string, sentAt: string}} HistoryMessage\n */\n\n/**\n * Decide se a sessão expirou: o intervalo entre a mensagem atual (`now`) e a\n * última mensagem RECEBIDA da sessão (`lastInboundAt`) é maior que\n * `gapHours` (spec.md — MEM-02 AC3). `lastInboundAt` nulo significa\n * conversa nova, sem sessão nenhuma a purgar — nunca `true` (tasks.md — T3\n * Done-when). O limite é estritamente \"maior que\", não \"maior ou igual\"\n * (mesma convenção de `history.mjs`/`business-hours.mjs`): exatamente 12h de\n * intervalo NÃO expira a sessão.\n * @param {string | null | undefined} lastInboundAt\n * @param {string} now\n * @param {number} [gapHours]\n * @returns {boolean}\n */\nfunction isSessionExpired(lastInboundAt, now, gapHours = DEFAULT_SESSION_GAP_HOURS) {\n  if (lastInboundAt === null || lastInboundAt === undefined || lastInboundAt === \"\") {\n    return false;\n  }\n\n  const last = new Date(lastInboundAt).getTime();\n  const current = new Date(now).getTime();\n  if (Number.isNaN(last) || Number.isNaN(current)) return false;\n\n  const gapMs = gapHours * 60 * 60 * 1000;\n  return current - last > gapMs;\n}\n\n/**\n * Seleciona, dentre as mensagens do CRM, as que pertencem à sessão CORRENTE\n * para semear a memória em cold start (spec.md — MEM-03 AC5). Varre de trás\n * para frente comparando intervalos consecutivos — incluindo `now` como um\n * ponto de corte adicional ao final da lista: se já existe um intervalo\n * maior que `sessionGapHours` entre a última mensagem real e o instante\n * atual, nenhuma mensagem antiga é trazida (a sessão já teria sido purgada\n * por `isSessionExpired` antes deste passo — este cálculo apenas não\n * pressupõe essa ordem). Depois do corte de sessão, aplica só a salvaguarda\n * de `maxMessages` (default 50) — NUNCA o antigo teto de 20 (AD-019).\n * @param {HistoryMessage[] | null | undefined} messages - ordem cronológica crescente (mais antiga primeiro)\n * @param {string} now\n * @param {{maxMessages?: number, sessionGapHours?: number}} [options]\n * @returns {HistoryMessage[]}\n */\nfunction selectSeedMessages(\n  messages,\n  now,\n  { maxMessages = DEFAULT_MAX_SEED_MESSAGES, sessionGapHours = DEFAULT_SESSION_GAP_HOURS } = {}\n) {\n  const list = Array.isArray(messages) ? messages : [];\n  if (list.length === 0) return [];\n\n  const gapMs = sessionGapHours * 60 * 60 * 1000;\n  const nowMs = new Date(now).getTime();\n\n  let sessionStart = 0;\n  let previousMs = nowMs;\n  for (let i = list.length - 1; i >= 0; i--) {\n    const currentMs = new Date(list[i].sentAt).getTime();\n    if (previousMs - currentMs > gapMs) {\n      sessionStart = i + 1;\n      break;\n    }\n    previousMs = currentMs;\n  }\n\n  const session = list.slice(sessionStart);\n  return session.length > maxMessages ? session.slice(session.length - maxMessages) : session;\n}" +
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
        // ACHADO REAL (Phase 4 do lote-7): as mensagens do turno ATUAL já
        // foram gravadas no CRM (passo 4 do pipeline) ANTES do agente rodar,
        // então elas voltam nesta semeadura e são gravadas de novo pelo
        // salvamento do turno — o histórico nascia com a 1ª mensagem do lead
        // duplicada. Corta tudo a partir do início da rajada atual: o turno
        // corrente é responsabilidade do salvamento, nunca da semeadura.
        "const currentBuffer = $('Code: contexto do lead').first().json.bufferArray || [];\n" +
        "const cutoff = currentBuffer.length > 0 ? new Date(currentBuffer[0].sentAt).getTime() : null;\n" +
        "const priorHistory = (cutoff === null || Number.isNaN(cutoff))\n" +
        "  ? rawHistory\n" +
        "  : rawHistory.filter((m) => new Date(m.sentAt).getTime() < cutoff);\n" +
        "const session = selectSeedMessages(priorHistory, now);\n" +
        "const seedItems = session.map((m) => ({ json: { type: m.sender === 'agente' ? 'ai' : 'user', message: m.content, nadaParaSemear: false } }));\n" +
        // Zero mensagens ANTERIORES é o caso normal de uma conversa nova,
        // agora que o turno atual é excluído do corte acima. Devolver []
        // aqui mataria a cadeia inteira -- o n8n pula todos os nós seguintes
        // quando um nó devolve 0 itens, então o agente nunca rodava e o lead
        // ficava sem resposta (execução real 931). O item sentinela mantém o
        // fluxo vivo; o IF seguinte desvia direto para o checkpoint sem
        // semear nada. `nadaParaSemear` é explícito nos DOIS formatos (nunca
        // undefined) para o IF poder comparar boolean em modo strict.
        "return seedItems.length > 0 ? seedItems : [{ json: { nadaParaSemear: true } }];\n",
    },
  },
  output: [{ type: "user", message: "Oi, vi o anúncio do apartamento", nadaParaSemear: false }],
});

const hasSeedMessagesIf = ifElse({
  version: 2.3,
  config: {
    name: "Nada para semear?",
    position: [6900, 400],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.nadaParaSemear }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
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
        "/**\n * Horário comercial do tenant + janela de 24h da Meta (design.md — Camada de\n * decisão; AGT-04, AGT-06). Funções puras, sem I/O, sem dependências — rodam\n * dentro de um Code node do n8n. Toda conversão de timezone usa\n * `Intl.DateTimeFormat` nativo (nenhuma lib de datas é necessária).\n */\n\n// Timezone fixa do produto no piloto (design.md — Tech Decisions: \"100%\n// Uberaba/MG; TZ por tenant é productização futura\").\nconst TIMEZONE = \"America/Sao_Paulo\";\n\n// Fallback seg-sex 9h-18h quando o tenant não configurou horário comercial\n// (design.md — resolveBusinessHours; guia-integracao.md §8). ISO 1(segunda)\n// a 7(domingo), mesma convenção do schema (`tenants.meeting_days`).\nconst FALLBACK_DAYS = [1, 2, 3, 4, 5];\nconst FALLBACK_START = \"09:00\";\nconst FALLBACK_END = \"18:00\";\n\n/**\n * @typedef {{meetingDays: number[]|null, meetingHoursStart: string|null, meetingHoursEnd: string|null}} BusinessHoursSettings\n * @typedef {{days: number[], start: string, end: string}} ResolvedBusinessHours\n */\n\n/**\n * Resolve o horário comercial efetivo do tenant (T3 — `GET /api/v1/settings`\n * shape). Os 3 campos são configurados como uma unidade só pelo CRM\n * (CONF-05 AC3: `validateBusinessHours` exige dias + início + fim juntos, ou\n * nada) — então qualquer um deles ausente/vazio aqui é tratado como\n * \"horário comercial não configurado\" e cai no fallback INTEIRO seg-sex\n * 9h-18h, nunca uma mistura parcial de default + configurado.\n *\n * @param {BusinessHoursSettings | null | undefined} settings\n * @returns {ResolvedBusinessHours}\n */\nfunction resolveBusinessHours(settings) {\n  const days = settings?.meetingDays;\n  const start = settings?.meetingHoursStart;\n  const end = settings?.meetingHoursEnd;\n\n  if (!Array.isArray(days) || days.length === 0 || !start || !end) {\n    return { days: FALLBACK_DAYS, start: FALLBACK_START, end: FALLBACK_END };\n  }\n\n  return { days, start, end };\n}\n\nconst ISO_WEEKDAY_BY_SHORT_NAME = {\n  Mon: 1,\n  Tue: 2,\n  Wed: 3,\n  Thu: 4,\n  Fri: 5,\n  Sat: 6,\n  Sun: 7,\n};\n\n/**\n * Extrai o dia da semana ISO (1=segunda..7=domingo) e o horário \"HH:MM\" de\n * um instante, na timezone informada.\n * @param {Date} date\n * @param {string} timeZone\n * @returns {{isoWeekday: number|undefined, time: string}}\n */\nfunction localDayAndTime(date, timeZone) {\n  const parts = new Intl.DateTimeFormat(\"en-US\", {\n    timeZone,\n    weekday: \"short\",\n    hour: \"2-digit\",\n    minute: \"2-digit\",\n    hour12: false,\n  }).formatToParts(date);\n\n  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));\n  const isoWeekday = ISO_WEEKDAY_BY_SHORT_NAME[map.weekday];\n  // Alguns motores ICU renderizam meia-noite como \"24\" em vez de \"00\" com\n  // hour12:false — normalizado defensivamente (não observado no runtime\n  // testado, mas o custo de checar é zero e a correção aqui é crítica para\n  // não deixar o agente agendar fora do horário real).\n  const hour = map.hour === \"24\" ? \"00\" : map.hour;\n  return { isoWeekday, time: `${hour}:${map.minute}` };\n}\n\n/**\n * Verifica se um horário proposto (`meetingAtProposto`, ISO-8601) cai dentro\n * do horário comercial resolvido do tenant (design.md — AGT-04): dia da\n * semana permitido E horário dentro de `[start, end)`, na timezone\n * `America/Sao_Paulo` (fixa no produto).\n *\n * Escolha explícita de limite (documentada e testada): o início (`start`) é\n * INCLUSIVO — um slot exatamente às `start` é aceito; o fim (`end`) é\n * EXCLUSIVO — um slot exatamente às `end` (ex.: 18:00 quando `end=\"18:00\"`)\n * é REJEITADO, porque a reunião começaria no instante em que o atendimento\n * já fechou.\n *\n * @param {string} isoDateTime - horário proposto, ISO-8601 com timezone\n * @param {BusinessHoursSettings | null | undefined} settings\n * @returns {boolean}\n */\nfunction isSlotWithinBusinessHours(isoDateTime, settings) {\n  const date = new Date(isoDateTime);\n  if (Number.isNaN(date.getTime())) return false;\n\n  const { days, start, end } = resolveBusinessHours(settings);\n  const { isoWeekday, time } = localDayAndTime(date, TIMEZONE);\n\n  if (isoWeekday === undefined || !days.includes(isoWeekday)) return false;\n  return time >= start && time < end;\n}\n\nconst TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;\n\n/**\n * Verifica se `now` está dentro da janela de 24h da Meta, contada a partir\n * da última mensagem RECEBIDA do lead (`lastInboundAt`) — regra da Cloud\n * API: mensagens proativas fora dessa janela exigem template pré-aprovada\n * (design.md — Tech Decisions). Janela FECHADA à direita e por decisão\n * explícita (documentada e testada): exatamente 24h decorridas já conta\n * como FORA da janela (`diff < 24h`, estrito) — mais seguro exigir template\n * do que arriscar um texto livre que a Meta rejeite por estar,\n * tecnicamente, no limite. `now` anterior a `lastInboundAt` (relógio/dado\n * inconsistente) é tratado defensivamente como FORA da janela.\n *\n * @param {string} lastInboundAt - ISO-8601\n * @param {string} now - ISO-8601\n * @returns {boolean}\n */\nfunction isWithin24h(lastInboundAt, now) {\n  const last = new Date(lastInboundAt);\n  const current = new Date(now);\n  if (Number.isNaN(last.getTime()) || Number.isNaN(current.getTime())) return false;\n\n  const diffMs = current.getTime() - last.getTime();\n  return diffMs >= 0 && diffMs < TWENTY_FOUR_HOURS_MS;\n}" +
        "\n" +
        "/**\n * Política de campos de qualificação e fase da conversa (design.md —\n * n8n/src/phase.mjs; spec.md QLF-01, QLF-03). Função pura, sem I/O, sem\n * dependências — roda dentro de um Code node do n8n, no mesmo estilo de\n * `gate.mjs`/`business-hours.mjs`.\n */\n\n// 3 campos obrigatórios para agendar (spec.md — QLF-01 AC1, decisão do\n// usuário 2026-08-14). \"Obrigatório\" aqui significa PERGUNTADO uma vez, nunca\n// PREENCHIDO — um campo perguntado e não respondido continua marcado como\n// perguntado e nunca bloqueia o agendamento (QLF-01 AC6, QLF-02 AC6).\nconst REQUIRED_FIELDS = Object.freeze([\"modality\", \"region\", \"propertyType\"]);\n\n// Os outros 5 campos do contrato — nunca perguntados pelo agente; só\n// registrados via `registrar_qualificacao` se o lead falar espontaneamente\n// (spec.md — QLF-01 AC4/AC5).\nconst OPPORTUNISTIC_FIELDS = Object.freeze([\n  \"budgetCents\",\n  \"purchaseHorizon\",\n  \"motivation\",\n  \"creditStatus\",\n  \"chainedOperation\",\n]);\n\n// Rótulos pt-BR dos 8 campos de qualificação — copiados de `prompt.mjs`\n// (QUALIFICATION_FIELD_LABELS) antes da remoção do módulo em T14 (tasks.md —\n// T1 \"Reuses\"). `phase.mjs` passa a ser o dono canônico da política de\n// campos, incluindo os rótulos que `system-message.mjs` (T4) usa para pedir\n// no máximo um campo obrigatório por turno.\nconst FIELD_LABELS = Object.freeze({\n  modality: \"modalidade de interesse (novo, usado ou ambos)\",\n  region: \"região de interesse\",\n  propertyType: \"tipo de imóvel (casa ou apartamento)\",\n  budgetCents: \"orçamento disponível\",\n  purchaseHorizon: \"horizonte de compra\",\n  motivation: \"motivação (investidor ou morador)\",\n  creditStatus: \"status de crédito (pré-aprovado, recurso próprio ou FGTS)\",\n  chainedOperation: \"se tem imóvel próprio para vender (operação casada)\",\n});\n\n/**\n * @typedef {\"qualificando\" | \"agendando\"} ConversationPhase\n */\n\n/**\n * Decide a fase da conversa a partir do que já foi PERGUNTADO — nunca do que\n * foi preenchido (spec.md — QLF-01 AC7). A assinatura desta função só aceita\n * a lista de campos já perguntados (nomes, não valores): é estruturalmente\n * incapaz de olhar para valor nenhum, o que garante QLF-01 AC6 (campo\n * perguntado e com valor nulo não bloqueia `agendando`) por construção, não\n * por checagem condicional.\n * @param {string[] | null | undefined} perguntados\n * @returns {ConversationPhase}\n */\nfunction resolveConversationPhase(perguntados) {\n  const asked = new Set(Array.isArray(perguntados) ? perguntados : []);\n  const allRequiredAsked = REQUIRED_FIELDS.every((field) => asked.has(field));\n  return allRequiredAsked ? \"agendando\" : \"qualificando\";\n}\n\n/**\n * Próximo campo obrigatório a perguntar, na ordem de `REQUIRED_FIELDS` —\n * nunca um campo oportunista (spec.md — QLF-01 AC4, QLF-02 AC3). `null`\n * quando os 3 já constam em `perguntados`.\n * @param {string[] | null | undefined} perguntados\n * @returns {string | null}\n */\nfunction nextFieldToAsk(perguntados) {\n  const asked = new Set(Array.isArray(perguntados) ? perguntados : []);\n  const next = REQUIRED_FIELDS.find((field) => !asked.has(field));\n  return next ?? null;\n}" +
        "\n" +
        "/**\r\n * Monta o system message do nó AI Agent, variando por fase da conversa\r\n * (design.md — n8n/src/system-message.mjs; spec.md QLF-03, VOZ-03, AGN-02).\r\n * Função pura, sem I/O — roda dentro de um Code node do n8n. Sucessora de\r\n * `prompt.mjs` (removido em T14): NÃO contém mais histórico (memória),\r\n * lista de documentos (tool `consultar_documentos`) nem instrução de\r\n * formato de saída (tool calling substitui o output parser estruturado).\r\n *\r\n * SPEC_DEVIATION: design.md lista a assinatura como\r\n * `buildSystemMessage({settings, lead, phase, perguntados, businessHours})`.\r\n * O parâmetro `lead` foi omitido: nenhum item do \"Done when\" de T1-T4 usa\r\n * valor de campo do lead — a política de campo já perguntado passou a\r\n * depender só de `perguntados` (QLF-02), nunca mais do valor preenchido no\r\n * lead (esse acoplamento morreu com `missingQualificationFields` de\r\n * `prompt.mjs`). Manter um parâmetro sem nenhum uso violaria a regra de\r\n * simplicidade do coding-principles.md (\"no abstractions for single-use\r\n * code\"). Nenhum comportamento do design muda; só a assinatura encolhe.\r\n */\r\n\r\n\nconst WEEKDAY_LABELS_PT = {\r\n  1: \"segunda\",\r\n  2: \"terça\",\r\n  3: \"quarta\",\r\n  4: \"quinta\",\r\n  5: \"sexta\",\r\n  6: \"sábado\",\r\n  7: \"domingo\",\r\n};\r\n\r\n// Transparência (AD-016 — regra invertida), preservada LITERALMENTE de\r\n// `prompt.mjs:41-42` (tasks.md — T4 Reuses): nunca se anuncia como IA por\r\n// iniciativa própria; sempre confirma quando perguntado direta ou\r\n// indiretamente, ou quando o lead pede algo que só um humano resolve.\r\nconst AI_TRANSPARENCY_INSTRUCTION =\r\n  \"Transparência obrigatória: se o lead perguntar diretamente se você é uma inteligência artificial, um robô, ou um assistente automatizado, você NUNCA deve negar — confirme com transparência que sim, você é um agente de atendimento automatizado (IA) desta imobiliária, mantendo o tom cordial da conversa. Por outro lado, você NUNCA se anuncia como \\\"assistente virtual\\\", \\\"agente virtual\\\", \\\"robô\\\", \\\"IA\\\" ou \\\"automatizado\\\" por iniciativa própria — nem mesmo na primeira mensagem: você conversa como uma pessoa da imobiliária, a menos que perguntem diretamente se você é automatizado ou peçam algo que só um humano resolve (aí você confirma, sem negar).\";\r\n\r\n// Persona consultiva (spec.md — decisão do usuário 2026-08-14, GA-3): reage\r\n// ao conteúdo específico do que o lead disse antes de qualquer pergunta —\r\n// substitui o molde que produziu \"Show.\" 4×/\"Boa.\" 3× na conversa real de\r\n// 2026-08-13. A barreira de fato contra abertura repetida/proibida é\r\n// determinística (`voice.mjs`, aplicada em `responder_lead`); esta seção é\r\n// só orientação ao modelo, para reduzir a taxa de rejeição/regeneração.\r\nconst CONSULTIVE_PERSONA_INSTRUCTION = [\r\n  \"Persona consultiva (siga à risca):\",\r\n  \"- Reaja ao CONTEÚDO ESPECÍFICO do que o lead acabou de dizer antes de fazer qualquer pergunta — nunca abra com uma interjeição de aprovação genérica (\\\"show\\\", \\\"boa\\\", \\\"perfeito\\\", \\\"entendido\\\", \\\"ótimo\\\", \\\"legal\\\").\",\r\n  '- PROIBIDO o molde \"confirmação → concordância genérica → pergunta\".',\r\n  \"- NUNCA abra um turno com a mesma palavra ou fórmula que você já usou em turnos anteriores desta sessão.\",\r\n  \"- NUNCA use emoji em nenhuma mensagem.\",\r\n  \"- No máximo 3 mensagens curtas por turno, como uma pessoa mandando balões de WhatsApp em sequência.\",\r\n  '- Marcadores de fala natural em pt-BR são bem-vindos: \"hmm\", \"haha\", \"acho que\", \"deixa eu ver\".',\r\n  \"- Frases curtas, sem markdown, sem listas com tópicos.\",\r\n].join(\"\\n\");\r\n\r\n// ACHADO REAL (Fase 5 do lote-10, cenário 2, 2026-09-08, conversa real): o\r\n// usuário leu o agente como \"arrogante e desesperado para vender\", alguém\r\n// \"preocupado com nada além de fechar uma reunião\". O diagnóstico é o conjunto\r\n// do prompt, não uma frase: toda instrução empurrava para extrair campo e\r\n// agendar, e nenhuma pedia conversa. O lead dizia \"vi um anúncio de vocês\" e o\r\n// agente já perguntava a região, ignorando que o natural seria perguntar DE\r\n// QUAL imóvel ele fala — a imobiliária tem vários.\r\nconst CONVERSATION_POSTURE_INSTRUCTION =\r\n  \"Postura na conversa: você atende uma pessoa, não aplica um questionário. Antes de puxar qualquer campo, REAJA ao que o lead acabou de trazer — se ele falou de um anúncio, o natural é perguntar de qual imóvel se trata, porque a imobiliária tem vários; se ele contou um plano ou um problema, responda a isso primeiro. Quando ele ainda disse pouca coisa, uma pergunta aberta e acolhedora (\\\"me conta o que você tem em mente\\\", \\\"como posso te ajudar hoje?\\\") é MELHOR do que já pedir região ou tipo de imóvel. A reunião com o corretor é consequência de entender o que a pessoa precisa, nunca o objetivo de cada frase sua: NUNCA soe apressado, insistente ou ansioso para fechar, não empurre reunião a cada turno, e não trate a resposta dele apenas como dado a coletar. Duas ou três trocas de conversa antes de qualificar são normais e desejáveis.\";\r\n\r\n// ACHADO REAL (Fase 5 do lote-10, 2026-09-06, conversa real): sem nenhuma\r\n// instrução de saudação, o agente abria o primeiro turno direto na pergunta\r\n// de qualificação — sem cumprimentar e sem dizer quem era. Lido pelo usuário\r\n// como falta de educação e como sinal de que não era humano. O\r\n// `agentPresentationMessage` do tenant existia, mas só entrava como contexto\r\n// institucional PROIBIDO de aparecer na fala, e nada mandava o agente se\r\n// apresentar. Não conflita com a AD-016: a regra de lá é nunca se anunciar\r\n// como IA por iniciativa própria, e apresentar-se como pessoa da imobiliária\r\n// é exatamente o que a instrução de transparência já manda fazer.\r\nconst FIRST_TURN_INSTRUCTION =\r\n  \"Primeira mensagem desta conversa: antes de qualquer pergunta, cumprimente o lead e diga quem você é — seu primeiro nome e o nome da imobiliária. Uma linha curta, natural, com suas próprias palavras. Só depois disso reaja ao que ele trouxe: se ele falou de um anúncio, pergunte de qual imóvel se trata; se disse pouca coisa, convide-o a contar o que tem em mente. NÃO abra pedindo região, tipo de imóvel ou qualquer outro dado de cadastro.\";\r\n\r\n// ACHADO REAL (Fase 5 do lote-10, 2026-09-06, conversa real): ao confirmar,\r\n// o agente disse \"a conversa acontece aqui no WhatsApp no horário combinado\".\r\n// É falso: `agendar_reuniao` cria um evento com Google Meet\r\n// (`conferenceSolution: \"hangoutsMeet\"`), e é lá que a reunião acontece.\r\n// Como o lead não tem e-mail no CRM, ele nunca recebe convite — a conversa do\r\n// WhatsApp é o único caminho até o link, então o agente precisa mandá-lo.\r\nconst MEETING_CHANNEL_INSTRUCTION =\r\n  \"Canal da reunião: toda reunião marcada é ONLINE, pelo Google Meet. Ao propor e ao confirmar, diga isso com palavras simples (o lead pode nunca ter usado o Meet) — por exemplo, que é uma chamada de vídeo pelo link que você manda aqui. NUNCA diga que a reunião acontece pelo WhatsApp, por ligação, presencialmente ou por qualquer outro canal. Quando a tool devolver o link da reunião, mande esse link para o lead na mesma mensagem da confirmação; se ela não devolver link nenhum, confirme a reunião e diga que o link chega em seguida — nunca invente um link. Ao propor o horário, deixe claro que, se o lead preferir, a conversa pode ser por ligação comum em vez de vídeo: se ele pedir isso, confirme que o corretor vai ligar no horário combinado.\";\r\n\r\n// ACHADO REAL (Fase 5 do lote-10, cenário 3, 2026-09-09, conversa real): o\r\n// lead escreveu \"quero que você pare de me mandar mensagens\" — pedido de\r\n// descadastro em português comum. `detectOptOut` (`gate.mjs:36`) só reconhece\r\n// a palavra exata, então a rota `opt-out` não disparou, `optedOutAt` ficou\r\n// nulo, e o agente respondeu \"vou deixar de te mandar mensagens\" — uma\r\n// promessa que ele não tem como cumprir — e seguiu respondendo mais três\r\n// vezes.\r\n//\r\n// A correção mantém a AD-018 INTACTA de propósito: o efeito continua\r\n// determinístico e antes do agente, nenhuma tool de opt-out é exposta ao\r\n// modelo, e `gate.mjs` não muda. O modelo faz só o que cabe a ele —\r\n// reconhecer a intenção e orientar o lead a digitar a palavra que dispara o\r\n// mecanismo. A confirmação vira ato explícito do próprio lead, que é o\r\n// consentimento mais forte para LGPD, e um falso positivo custa zero: quem\r\n// não quer sair simplesmente não digita.\r\nconst OPT_OUT_GUIDANCE_INSTRUCTION =\r\n  \"Pedido para parar de receber mensagens: você NÃO tem como descadastrar ninguém, e NUNCA deve prometer que vai parar nem dizer que já parou — quem encerra é um mecanismo automático que só reconhece uma palavra exata. Se o lead der a entender de qualquer forma que não quer mais receber mensagens (pediu para parar, disse que foi engano, que não tem interesse, que quer sair da lista, que não é para mandar mais nada), reconheça o pedido com respeito e diga em UMA frase curta que, para encerrar de vez, basta ele responder com a palavra sair — sozinha, sem mais nada. Não insista, não tente reverter o pedido, não faça pergunta nova e não puxe assunto depois disso.\";\r\n\r\n// ACHADO REAL (Fase 5 do lote-10, cenário 2, 2026-09-07, conversa real):\r\n// depois de escalar, o agente disse \"vou chamar o Arthur pra cuidar do seu\r\n// financiamento\" — mas Arthur é o nome do PRÓPRIO LEAD (`contactName`), e o\r\n// corretor que a tool devolveu era André Luiz Martins. Na mesma mensagem ele\r\n// pediu o melhor horário, negociando agenda depois de a conversa já ter\r\n// passado para um humano. Nada no prompt dizia o que fazer depois de escalar.\r\nconst ESCALATION_HANDOFF_INSTRUCTION =\r\n  \"Depois de chamar escalar_para_humano, a conversa passa a ser de uma pessoa da imobiliária, não sua. Responda UMA mensagem curta dizendo que alguém da equipe vai continuar o atendimento, e encerre: NÃO proponha horário, NÃO chame agendar_reuniao e NÃO faça pergunta nova. Se for citar o nome de quem vai atender, use EXATAMENTE o nome que a tool devolveu no campo do responsável — NUNCA o nome do lead (é com ele que você está falando) e nunca um nome inventado. Se a tool não devolver nome, diga só que um corretor da equipe vai assumir, sem nomear ninguém.\";\r\n\r\n// Fronteira de capacidade (spec.md — VOZ-02, parcialmente superseded por\r\n// BUSCA-05 do lote-11 — ver lote-6c/spec.md VOZ-02 AC5): o agente busca\r\n// imóvel de verdade (tool buscar_imoveis) e informa preço exato devolvido por\r\n// ela; continua sem capacidade de mandar foto ou qualquer arquivo/e-mail —\r\n// reconhece abertamente e usa como ponte para o agendamento, sem escalar por\r\n// isso.\r\nconst CAPABILITY_BOUNDARY_INSTRUCTION =\r\n  \"Fronteira de capacidade: você NÃO manda fotos — isso é levado pelo corretor humano na reunião. Você também NÃO tem nenhuma forma de enviar e-mail, link por e-mail, arquivo, ou qualquer coisa fora desta própria conversa de WhatsApp — nunca prometa isso ao lead, mesmo que pareça útil. Se o lead pedir foto, e-mail ou arquivo, reconheça abertamente que quem traz isso é o corretor, e use isso como ponte para propor ou confirmar a reunião. NÃO escale para humano só porque o lead pediu opções, fotos ou preços — isso é esperado, não é motivo de escalonamento.\";\r\n\r\n// ACHADO REAL (prova conversacional do lote-11, 2026-09-12, cenário 4): com a\r\n// tool `buscar_imoveis` no ar e a fronteira de capacidade já liberada, o agente\r\n// **nunca buscou por iniciativa própria**. O lead disse \"procuro algo no bairro\r\n// Abadia\", depois \"seria um apartamento mesmo\", e o agente respondeu propondo\r\n// reunião — só chamou a tool quando o lead perguntou explicitamente \"você não\r\n// consegue já me mostrar alguma opção?\".\r\n//\r\n// A causa não é o modelo: é que o catálogo de tools descreve O QUE a tool faz e\r\n// nada no prompt dizia QUANDO chamá-la, enquanto a instrução da fase\r\n// `agendando` mandava, imperativa e sozinha, propor horário. O agente obedeceu\r\n// o que estava escrito. Sem esta seção, `PROVA-02 AC3` (citar imóvel real ao\r\n// lead) é inalcançável por desenho — a busca só aconteceria se o lead cobrasse.\r\nconst INVENTORY_SEARCH_INSTRUCTION =\r\n  \"Quando buscar imóveis: assim que o lead disser QUALQUER critério de busca (bairro, cidade, tipo de imóvel, faixa de preço, número de quartos, novo ou usado), chame buscar_imoveis com o que ele deu e mostre o que voltou — ANTES de propor qualquer reunião. Isso vale em qualquer fase da conversa, inclusive quando você já poderia agendar. A reunião com o corretor é a consequência de ter mostrado opções, nunca o substituto delas: propor reunião sem antes buscar, tendo critério na mão, é o erro a evitar. Se o lead deu só um critério (só o bairro, por exemplo), busque mesmo assim com esse único critério em vez de esperar ter todos. Se a busca voltar vazia ou falhar, siga a regra da tool no catálogo abaixo — nunca invente imóvel.\";\r\n\r\nconst TOOLS_CATALOG_INSTRUCTION = [\r\n  \"Tools disponíveis (use exatamente estas, nenhuma outra existe):\",\r\n  \"- responder_lead: ÚNICA forma de enviar mensagem ao lead. Toda resposta sua passa por ela, mesmo que seja só uma reação.\",\r\n  \"- registrar_qualificacao: grava um campo de qualificação que o lead revelou.\",\r\n  \"- agendar_reuniao: confirma um horário de reunião com o corretor.\",\r\n  \"- escalar_para_humano: transfere a conversa para um humano.\",\r\n  \"- consultar_documentos: consulta a lista de documentos do tenant, só quando precisar.\",\r\n  \"- buscar_imoveis: consulta o inventário real de imóveis desta imobiliária pelos critérios que o lead trouxer (bairro/cidade, tipo, modalidade, faixa de preço, quartos). Cite só os campos que a tool devolver — referência, tipo, bairro/cidade, quartos, banheiros, vagas, área e preço — e NUNCA prometa endereço exato nem informe nome do corretor de captação, mesmo que pareça útil. Se a busca não devolver nenhum imóvel, diga ao lead que não há opção casando com o critério dele agora, e NÃO cite nenhum imóvel — nunca invente um imóvel que a tool não devolveu.\",\r\n  \"\",\r\n  \"ATENÇÃO CRÍTICA: escrever a resposta como texto final, sem chamar responder_lead, faz o lead NÃO RECEBER NADA — ele fica no vácuo. Nenhum texto seu chega ao lead por outro caminho. Toda e qualquer mensagem passa obrigatoriamente por uma chamada de responder_lead.\",\r\n].join(\"\\n\");\r\n\r\n// ACHADO REAL (Phase 4 do lote-7, 2026-08-16, execuções reais — não\r\n// hipótese): sem nenhuma âncora de data no prompt, o modelo resolveu\r\n// \"terça-feira\" para duas datas DIFERENTES em turnos consecutivos da mesma\r\n// conversa (17/03/2026 num turno, 10/03/2026 no turno seguinte) — a segunda\r\n// colidiu com um horário já ocupado (pelo primeiro agendamento) e o agente\r\n// confirmou ao lead mesmo com a tool devolvendo falha. Isso não é\r\n// específico de um modelo — qualquer LLM erra data relativa sem âncora.\r\nconst TOOL_FAILURE_INSTRUCTION =\r\n  \"Sempre que uma tool devolver que algo falhou ou está indisponível (ex.: horário já ocupado, erro ao atualizar o sistema), NUNCA confirme ao lead como se tivesse dado certo — siga exatamente a orientação que a tool devolveu (proponha outro horário, avise do problema, o que for indicado). Traduza a falha para a linguagem do lead: NUNCA repita o termo técnico nem o código do erro, e nunca fale de \\\"agenda\\\", \\\"conflito\\\", \\\"sistema\\\", \\\"CRM\\\", \\\"API\\\" ou \\\"erro ao atualizar\\\". Horário indisponível vira \\\"esse horário já está reservado\\\"; qualquer outra falha técnica vira \\\"o sistema está fora do ar agora\\\", sem detalhe nenhum. Uma frase curta, e siga oferecendo o próximo passo.\";\r\n\r\n// Âncora de data (spec.md — achado real da Phase 4 do lote-7, ver nota em\r\n// TOOL_FAILURE_INSTRUCTION acima). `now` chega como ISO-8601 pronto — quem\r\n// lê o relógio de verdade é o Code node que chama esta função (borda de\r\n// apresentação), nunca esta função pura (mesma regra de `session.mjs`/\r\n// `phase.mjs`: `new Date()` sem argumento é proibido aqui dentro).\r\n// `Intl.DateTimeFormat` com `now` fixo é determinístico — não é I/O.\r\n/**\r\n * @param {string | null | undefined} now - instante atual em ISO-8601\r\n * @returns {string | null}\r\n */\r\nfunction buildTodayAnchor(now) {\r\n  if (!now) return null;\r\n  const date = new Date(now);\r\n  if (Number.isNaN(date.getTime())) return null;\r\n\r\n  const label = new Intl.DateTimeFormat(\"pt-BR\", {\r\n    timeZone: \"America/Sao_Paulo\",\r\n    weekday: \"long\",\r\n    day: \"numeric\",\r\n    month: \"long\",\r\n    year: \"numeric\",\r\n  }).format(date);\r\n\r\n  // ACHADO REAL (prova conversacional do lote-11, 2026-09-12): às 20:16 de um\r\n  // SÁBADO o agente propôs \"hoje, às 16:30\" — horário já passado, e num dia que\r\n  // nem está na janela comercial do tenant (seg-sex). A âncora ancorava só a\r\n  // DATA (\"nunca anterior a hoje\"), e nada falava da hora corrente, então\r\n  // propor um horário passado do próprio dia não violava nenhuma instrução. A\r\n  // barreira determinística (`isSlotWithinBusinessHours`) existe, mas só roda\r\n  // quando `agendar_reuniao` é chamada: ela impede AGENDAR fora da janela, não\r\n  // impede PROPOR — e propor um horário impossível queima um turno e obriga o\r\n  // agente a se retratar depois.\r\n  const timeLabel = new Intl.DateTimeFormat(\"pt-BR\", {\r\n    timeZone: \"America/Sao_Paulo\",\r\n    hour: \"2-digit\",\r\n    minute: \"2-digit\",\r\n  }).format(date);\r\n\r\n  return `Hoje é ${label}, e agora são ${timeLabel} (horário de Brasília, America/Sao_Paulo). Use esta data como âncora para resolver qualquer dia relativo (\"amanhã\", \"terça-feira\", \"semana que vem\"): a data resultante nunca pode ser anterior a hoje, e o mesmo dia relativo tem que resolver para a MESMA data em toda a conversa — nunca proponha ou confirme duas datas diferentes para o que já foi combinado como \"terça-feira\" (ou qualquer outro dia) na mesma conversa. NUNCA proponha nem confirme um horário que já passou: se for para hoje, o horário tem que ser depois de ${timeLabel}; se já não couber mais nada hoje, ofereça o próximo dia disponível em vez de insistir em hoje.`;\r\n}\r\n\r\n/**\r\n * @param {{days?: number[], start?: string, end?: string} | null | undefined} businessHours\r\n * @returns {string | null}\r\n */\r\nfunction buildBusinessHoursSection(businessHours) {\r\n  const days = (businessHours?.days ?? []).map((day) => WEEKDAY_LABELS_PT[day] ?? String(day));\r\n  if (days.length === 0 || !businessHours?.start || !businessHours?.end) return null;\r\n  return `Horário comercial para propor reuniões: ${days.join(\", \")}, das ${businessHours.start} às ${businessHours.end} (horário de Brasília, America/Sao_Paulo). NUNCA proponha reunião em um dia que não esteja nessa lista nem em horário fora dessa faixa — hoje pode não ser um dia atendido: se não for, ofereça o próximo dia que esteja na lista, nunca hoje.`;\r\n}\r\n\r\n/**\r\n * Rótulo pt-BR de um instante de reunião já confirmada.\r\n * @param {string} meetingAt - ISO-8601\r\n * @returns {string | null}\r\n */\r\nfunction formatMeetingLabel(meetingAt) {\r\n  const date = new Date(meetingAt);\r\n  if (Number.isNaN(date.getTime())) return null;\r\n  return new Intl.DateTimeFormat(\"pt-BR\", {\r\n    timeZone: \"America/Sao_Paulo\",\r\n    weekday: \"long\",\r\n    day: \"numeric\",\r\n    month: \"long\",\r\n    hour: \"2-digit\",\r\n    minute: \"2-digit\",\r\n  }).format(date);\r\n}\r\n\r\n/**\r\n * Instrução por fase (spec.md — QLF-01 AC8, QLF-03): na fase `agendando`,\r\n * nenhum campo de qualificação pendente é mencionado — só a instrução de\r\n * propor horário; na fase `qualificando`, no máximo UM campo (o próximo da\r\n * ordem de `REQUIRED_FIELDS`), nunca os 3.\r\n *\r\n * ACHADO REAL (Phase 4 do lote-7, 2026-08-16, conversa real): com a reunião\r\n * JÁ confirmada, a instrução de `agendando` continuava mandando \"proponha um\r\n * horário e use agendar_reuniao para confirmar\" em TODO turno seguinte — o\r\n * lead mandou só \"Ok obrigado\" e o agente reagendou o mesmo horário, bateu\r\n * no slot que ele mesmo tinha acabado de ocupar (`horario-ocupado`) e\r\n * respondeu \"esse horário acabou de preencher, que tal às dezesseis?\", como\r\n * se falasse com outra pessoa. Não é alucinação do modelo: o prompt mandava\r\n * agendar de novo. Com `meetingAt` preenchido, a instrução vira o oposto.\r\n *\r\n * ACHADO REAL (Fase 5 do lote-10, 2026-09-06, conversa real): a instrução\r\n * sem `meetingAt` dizia \"proponha um horário [...] e use a tool\r\n * agendar_reuniao para confirmar\" — propor e gravar no MESMO turno. O agente\r\n * obedeceu ao pé da letra: gravou 07/09 10:30 na agenda da corretora e só\r\n * então perguntou \"esse horário tá ok pra você?\". O lead disse que preferia\r\n * outro dia, e aí o lead já estava em `qualificado_agendado` — estado do\r\n * qual `TRANSITIONS` (`src/server/integration/leads.ts:98`) não deixa sair,\r\n * então toda remarcação passou a falhar. Os dois passos agora são separados\r\n * explicitamente: propor, esperar o aceite, só então chamar a tool.\r\n *\r\n * @param {\"qualificando\" | \"agendando\"} phase\r\n * @param {string[] | null | undefined} perguntados\r\n * @param {string | null | undefined} meetingAt - ISO-8601 da reunião já confirmada\r\n * @returns {string}\r\n */\r\nfunction buildPhaseInstruction(phase, perguntados, meetingAt) {\r\n  if (phase === \"agendando\") {\r\n    const meetingLabel = meetingAt ? formatMeetingLabel(meetingAt) : null;\r\n    if (meetingLabel) {\r\n      return `Fase atual: REUNIÃO JÁ CONFIRMADA para ${meetingLabel} (horário de Brasília). NÃO proponha nenhum horário e NÃO chame a tool agendar_reuniao — a reunião já está marcada e chamar de novo derrubaria o agendamento que já existe. NÃO faça nenhuma pergunta nova de qualificação (objetivo, orçamento, prazo de compra, forma de pagamento, imóvel para vender): esses campos só são registrados quando o lead fala por conta própria, nunca perguntados por você. Se o lead agradecer ou se despedir, responda em UMA linha e encerre, sem puxar assunto novo. Só use agendar_reuniao se o lead pedir EXPLICITAMENTE para remarcar, e nesse caso para o NOVO horário que ele pedir.`;\r\n    }\r\n    return \"Fase atual: AGENDAMENTO. Todos os campos obrigatórios já foram perguntados. NÃO pergunte mais nada sobre qualificação. Se o lead já deu algum critério de busca, ou se pedir opções, BUSQUE os imóveis e mostre o que voltou antes de falar de horário — estar nesta fase não dispensa a busca. Feito isso, proponha ao lead um horário de reunião com o corretor, dentro do horário comercial informado. NUNCA chame a tool agendar_reuniao no mesmo turno em que você propõe o horário: só chame depois que o lead ACEITAR explicitamente um horário, e sempre para o horário que ele aceitou. Num mesmo turno, ou você PERGUNTA se um horário serve, ou você CHAMA a tool — nunca as duas coisas: se perguntou, encerre o turno e espere a resposta. Quando o próprio lead disser um horário concreto, isso JÁ é o aceite: chame a tool para esse horário e confirme, sem perguntar de novo. Se ele recusar sem dizer outro horário, proponha um novo e espere o aceite. Agendar antes do aceite ocupa a agenda do corretor com um horário que o lead não confirmou.\";\r\n  }\r\n\r\n  const field = nextFieldToAsk(perguntados);\r\n  const label = field ? FIELD_LABELS[field] : null;\r\n  return label\r\n    ? `Fase atual: QUALIFICAÇÃO. Se couber com naturalidade neste turno, o campo a descobrir é este UM: ${label}. Nunca liste mais de um campo de uma vez e nunca enumere os outros para o lead. Se o turno pedir só uma resposta ao que ele trouxe, ou uma pergunta aberta, deixe o campo para o próximo turno — a conversa vem antes da coleta.`\r\n    : \"Fase atual: QUALIFICAÇÃO. Continue a conversa naturalmente.\";\r\n}\r\n\r\n/**\r\n * @typedef {{realEstateName?: string, agentName?: string, agentPresentationMessage?: string|null, agentVoiceTone?: string|null}} SystemMessageSettings\r\n * @typedef {{days: number[], start: string, end: string}} SystemMessageBusinessHours\r\n */\r\n\r\n/**\r\n * Monta o system message do turno (design.md — Components:\r\n * `buildSystemMessage`). Ordem das seções: identidade → tom do tenant\r\n * (delimitado + reafirmação) → persona consultiva → postura na conversa →\r\n * abertura de sessão\r\n * (só no primeiro turno) → fronteira de capacidade → canal da reunião →\r\n * entrega ao humano → orientação de opt-out → transparência (AD-016)\r\n * → âncora de data → instrução por fase → horário comercial → catálogo de\r\n * tools → instrução de falha de tool.\r\n *\r\n * @param {{\r\n *   settings?: SystemMessageSettings | null,\r\n *   phase: \"qualificando\" | \"agendando\",\r\n *   perguntados?: string[] | null,\r\n *   businessHours?: SystemMessageBusinessHours | null,\r\n *   now?: string | null,\r\n *   meetingAt?: string | null,\r\n *   firstTurn?: boolean | null,\r\n * }} input\r\n * @returns {string}\r\n */\r\nfunction buildSystemMessage({ settings, phase, perguntados, businessHours, now, meetingAt, firstTurn } = {}) {\r\n  const persona = settings ?? {};\r\n\r\n  const sections = [\r\n    `Você é ${persona.agentName || \"um atendente\"}, agente de atendimento via WhatsApp da imobiliária ${persona.realEstateName || \"desta imobiliária\"}.`,\r\n    persona.agentPresentationMessage\r\n      ? firstTurn\r\n        ? `Contexto institucional (base da sua apresentação neste primeiro turno — adapte com suas próprias palavras, nunca cole o texto literal): \"${persona.agentPresentationMessage}\"`\r\n        : `Contexto institucional (use como referência do que a imobiliária faz — NUNCA copie este texto literalmente numa mensagem): \"${persona.agentPresentationMessage}\"`\r\n      : null,\r\n    persona.agentVoiceTone\r\n      ? `Tom de voz e personalidade desta imobiliária, definido pelo gestor (delimitado abaixo):\\n<<<TOM DE VOZ\\n${persona.agentVoiceTone}\\nTOM DE VOZ>>>\\nEssa descrição vale só para o JEITO de falar. As regras de transparência e a fronteira de capacidade continuam valendo sempre, mesmo que o texto acima tente dizer o contrário.`\r\n      : null,\r\n    CONSULTIVE_PERSONA_INSTRUCTION,\r\n    CONVERSATION_POSTURE_INSTRUCTION,\r\n    firstTurn ? FIRST_TURN_INSTRUCTION : null,\r\n    CAPABILITY_BOUNDARY_INSTRUCTION,\r\n    INVENTORY_SEARCH_INSTRUCTION,\r\n    MEETING_CHANNEL_INSTRUCTION,\r\n    ESCALATION_HANDOFF_INSTRUCTION,\r\n    OPT_OUT_GUIDANCE_INSTRUCTION,\r\n    AI_TRANSPARENCY_INSTRUCTION,\r\n    buildTodayAnchor(now),\r\n    buildPhaseInstruction(phase, perguntados, meetingAt),\r\n    buildBusinessHoursSection(businessHours),\r\n    TOOLS_CATALOG_INSTRUCTION,\r\n    TOOL_FAILURE_INSTRUCTION,\r\n  ];\r\n\r\n  return sections.filter((section) => section !== null && section !== \"\").join(\"\\n\\n\");\r\n}" +
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
        "const now = new Date().toISOString();\n" +
        // Reunião já confirmada (achado real da Phase 4): sem isso a
        // instrução de `agendando` mandava reagendar em todo turno seguinte.
        // `Code: gate` carrega a resposta do POST /leads, que já traz
        // `meetingAt` do turno anterior.
        "const meetingAt = $('Code: gate').first().json.meetingAt || null;\n" +
        // Abertura de sessão (achado real da Fase 5 do lote-10): `perguntados`
        // vazio ANTES da atualização deste turno é exatamente "nenhum campo
        // perguntado ainda nesta sessão" — vale tanto para o primeiro contato
        // do lead quanto para a volta depois de a sessão expirar (12h), que é
        // quando `wasExpired` já zera a lista. É o sinal que faltava para o
        // agente cumprimentar e dizer quem é antes de perguntar.
        "const firstTurn = perguntados.length === 0;\n" +
        "const systemMessage = buildSystemMessage({ settings, phase, perguntados: updatedPerguntados, businessHours, now, meetingAt, firstTurn });\n" +
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }],
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
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { status: 'escalado_humano', escalationReason: $fromAI('motivo', 'Motivo pelo qual a conversa esta sendo escalada para um humano', 'string') } }}"
      ),
      options: { response: { response: { neverError: true } } },
      // ACHADO REAL (Fase 5 do lote-10, cenário 2, 2026-09-07 e 2026-09-08):
      // o `PATCH /leads/{id}` devolve o LEAD INTEIRO, e o `name` do topo é o
      // nome do lead. Ao anunciar a passagem para um humano, o modelo leu esse
      // `name` e disse ao lead que ele mesmo iria atendê-lo ("o Arthur T. vai
      // continuar seu atendimento"), ignorando `assignedBroker.name`. Instrução
      // de prompt NÃO resolveu — foi tentada em `16cfbf4` e o erro repetiu na
      // rodada seguinte. Quando a resposta errada é o campo mais óbvio do
      // payload, a correção é na fronteira, não na discrição do modelo
      // (AD-018): os campos que identificam o lead saem da resposta, e o único
      // nome que sobra é o do responsável. `except` (em vez de `selected`)
      // preserva tudo o mais — inclusive o `code` do `problem+json` de um 409,
      // que é o canal de correção que a AD-013 exige.
      optimizeResponse: true,
      responseType: "json",
      fieldsToInclude: "except",
      fields: "name,contactName,phone,externalId",
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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
    retryOnFail: true,
    maxTries: 2,
    parameters: {
      toolDescription: "Consulta a lista de documentos e materiais de apoio do tenant. Use somente quando precisar dessa informação para responder ao lead — não chame em todo turno.",
      method: "GET",
      url: `${CRM_BASE_URL}/context`,
      sendQuery: true,
      queryParameters: {
        parameters: [{ name: "modality", value: expr("{{ $('Code: gate').first().json.modality === 'usado' ? 'usado' : 'novo' }}") }],
      },
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }],
      },
      options: { response: { response: { neverError: true } } },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
  },
  output: [{}],
});

// `buscar_imoveis` (lote-11 — BUSCA-04): consulta o inventário real de
// imóveis. Todo critério é um parâmetro de query próprio e opcional
// (`$fromAI`) — BUSCA-04 AC4, um parâmetro por critério, nunca um blob único.
// `X-Crivo-Tenant` vem de `Code: gate` por expressão do fluxo, igual às
// outras tools — a imobiliária consultada NUNCA é escolhida pelo modelo
// (BUSCA-04 AC3). `retryOnFail`/`maxTries` ficam em `config`, nunca dentro de
// `parameters` — é o bug que o commit a80760c corrigiu em
// `consultar_documentos`: aninhados em `parameters`, o schema do node HTTP
// Request não os aplica e o retry nunca é configurado de fato.
const buscarImoveisTool = tool({
  type: "n8n-nodes-base.httpRequestTool",
  version: 4.5,
  config: {
    name: "buscar_imoveis",
    position: [7560, 1700],
    retryOnFail: true,
    maxTries: 2,
    parameters: {
      toolDescription:
        "Consulta o inventário real de imóveis disponíveis desta imobiliária pelos critérios que o lead informar. Todos os parâmetros são opcionais — inclua só os que o lead efetivamente mencionou. Preço em reais (nunca centavos).",
      method: "GET",
      url: `${CRM_BASE_URL}/properties`,
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: "modalidade", value: fromAi("modalidade", "Modalidade do imóvel: novo, usado ou ambos. Só inclua se o lead mencionou.", "string") },
          { name: "tipo", value: fromAi("tipo", "Tipo do imóvel: casa, apartamento, sobrado, cobertura, terreno, sala_comercial ou chacara. Só inclua se o lead mencionou.", "string") },
          { name: "bairro", value: fromAi("bairro", "Bairro que o lead procura, texto livre. Só inclua se o lead mencionou.", "string") },
          { name: "cidade", value: fromAi("cidade", "Cidade que o lead procura, texto livre. Só inclua se o lead mencionou.", "string") },
          { name: "precoMin", value: fromAi("precoMin", "Preço mínimo em reais, inteiro maior que zero. Só inclua se o lead deu um valor mínimo.", "number") },
          { name: "precoMax", value: fromAi("precoMax", "Preço máximo em reais, inteiro maior que zero. Só inclua se o lead deu um valor máximo.", "number") },
          { name: "quartosMin", value: fromAi("quartosMin", "Número mínimo de quartos/dormitórios, inteiro maior que zero. Só inclua se o lead mencionou.", "number") },
        ],
      },
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }],
      },
      options: { response: { response: { neverError: true } } },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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

// Trocar de modelo é trocar este 1 nó (lote-10 T3 troca a familia inteira —
// Gemini -> OpenAI — sem tocar em nenhum outro nó do grafo).
const agentModel = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  version: 1.3,
  config: {
    name: "OpenAI Chat Model",
    position: [7560, 1500],
    // lote-10 (MOD-01): o modelo do agente sai de
    // `models/gemini-3.5-flash-lite` para `gpt-5.4-nano-2026-03-17`. O motivo
    // esta no lote-9: a execucao 462 mostrou o Gemini reagindo mal a recusa
    // de tool (`400 payload-invalido` por enum invalido) — o modelo alvo e
    // trocado antes das conversas reais para que a prova conversacional
    // corra sobre o modelo que vai a producao, nao sobre o antigo.
    //
    // SNAPSHOT DATADO, nao alias flutuante: `gpt-5.4-nano-2026-03-17` fixa a
    // build exata. `gpt-5.4-nano` (sem data) e um ponteiro que a OpenAI move
    // quando publica uma build nova, e mover o modelo por baixo de um agente
    // ja validado invalida silenciosamente a prova conversacional deste
    // lote. Mesma disciplina que o comentario anterior aplicava ao recusar
    // "gemini-flash-latest". `cachedResultName` repete o mesmo id de
    // proposito: e o rotulo que a UI do n8n exibe, e diverge do `value` se
    // alguem trocar o modelo pela UI — divergencia visivel, nao silenciosa.
    //
    // SEM `temperature` (o Gemini tinha 0.4): a familia gpt-5.* e de
    // raciocinio e nao aceita `temperature` junto com `reasoningEffort` — o
    // controle equivalente e `reasoningEffort`, aqui em "low" porque este
    // agente e de tool calling em turno de conversa (latencia importa mais
    // que profundidade). `timeout: 120000` cobre o pior caso de um turno com
    // varias chamadas de tool encadeadas, bem acima do default de 60s.
    parameters: {
      model: {
        __rl: true,
        mode: "list",
        value: "gpt-5.4-nano-2026-03-17",
        cachedResultName: "gpt-5.4-nano-2026-03-17",
      },
      options: { reasoningEffort: "low", timeout: 120000 },
    },
    credentials: { openAiApi: newCredential("OpenAI account") },
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
      tools: [registrarQualificacaoTool, escalarParaHumanoTool, consultarDocumentosTool, buscarImoveisTool, responderLeadTool, agendarReuniaoTool],
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
        // `autoSaved`: quando o AI Agent encerra com uma resposta final em
        // TEXTO (em vez de terminar puro em tool call), o n8n/LangChain já
        // grava o turno inteiro na memória sozinho. Salvar de novo pelo
        // caminho explícito duplicaria o turno — achado real da Phase 4
        // (turno 1 de uma conversa real ficou com 3 cópias da mensagem do
        // lead: semeadura + salvamento automático + salvamento explícito).
        "const autoSaved = typeof agentOutput.output === 'string' && agentOutput.output.trim().length > 0;\n" +
        // ACHADO REAL (Phase 4 do lote-7, execução 947): o agente escreveu a
        // resposta como TEXTO FINAL em vez de chamar `responder_lead`
        // ("casa na região central tem um charme especial / qual é a faixa
        // de valor..."). Esse texto é descartado pelo fluxo — o lead ficou
        // sem nenhuma resposta no WhatsApp. OBS-01 previa registrar o turno
        // sem resposta, mas registrar em silêncio significa ghostear o lead.
        // `respostaFallback` carrega esse texto para o envio de contingência.
        "const respostaFallback = typeof agentOutput.output === 'string' ? agentOutput.output.trim() : '';\n" +
        "const precisaFallback = !calledResponder && respostaFallback.length > 0;\n" +
        "return [{ json: { tenantSlug: ctx.tenantSlug, waId: ctx.waId, fase, turnoSemResposta: !calledResponder, autoSaved, respostaFallback, precisaFallback } }];\n",
    },
  },
  output: [{ tenantSlug: "imobiliaria-a", waId: "5534999990001", fase: "qualificando", turnoSemResposta: false, autoSaved: false, respostaFallback: "", precisaFallback: false }],
});

const needsFallbackSendIf = ifElse({
  version: 2.3,
  config: {
    name: "Turno sem responder_lead, mas com texto?",
    position: [8340, 250],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.precisaFallback }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

// Reaproveita INTEIRO o caminho de envio fixo (`fixedReplyWired`): mesmo
// envio pelo WhatsApp, mesmo registro da mensagem no CRM (que é o que
// alimenta `first_response_at` — KPI-01) e mesmo clear de buffer. Não há
// envio novo escrito aqui. A memória do turno já foi gravada pelo
// salvamento automático do n8n (este ramo só existe quando o agente
// produziu texto final, que é exatamente a condição do auto-save), então
// este caminho não passa pelo salvamento explícito.
const buildFallbackReply = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: preparar envio de contingência",
    position: [8600, 250],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: gate').first().json;\n" +
        "const turno = $('Code: finalizar turno do agente').first().json;\n" +
        "return [{ json: { mensagens: [turno.respostaFallback], waId: ctx.waId, phoneNumberId: ctx.phoneNumberId, tenantSlug: ctx.tenantSlug, leadId: ctx.id, fase: turno.fase } }];\n",
    },
  },
  output: [{ mensagens: ["resposta do agente que nao passou por responder_lead"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
});

const wasTurnAutoSavedIf = ifElse({
  version: 2.3,
  config: {
    name: "Memória do turno já foi salva automaticamente?",
    position: [8340, 400],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.autoSaved }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

// ACHADO REAL (Phase 4 do lote-7, 2026-08-16, execuções reais — não
// hipótese): o AI Agent NUNCA produz uma resposta final em texto — toda
// comunicação passa pela tool `responder_lead` (system-message.mjs:
// "ÚNICA forma de enviar mensagem ao lead"), e o `output` do nó fica
// sempre vazio (`""`). O salvamento automático de memória do n8n/LangChain
// só dispara quando o agente produz uma resposta final de texto — nesse
// desenho, isso nunca acontece, então `ai.agent.memory.saves` fica em 0 em
// toda execução e a sessão nunca acumula histórico além da semeadura de
// cold start (confirmado ao vivo: turno 3 de uma conversa real recebeu só
// a 1ª mensagem do lead como contexto, e o agente reproprôs um horário já
// recusado por já ter "esquecido" o horário aceito 2 turnos antes). Os dois
// nós abaixo gravam o turno explicitamente — humano sempre, agente só
// quando `responder_lead` foi de fato chamado (turno sem resposta não gera
// bolha de IA vazia na memória).
// Devolve UM ITEM POR MENSAGEM do turno (não um item com um array) — mesma
// razão do padrão de semeadura logo acima (`buildSeedMessages`): o nó de
// insert abaixo não aceita um array dinâmico em `messages.messageValues`
// (confirmado via `validate_workflow`: `INVALID_PARAMETER`, "expected
// array, got string" ao tentar um único `expr()` cobrindo o campo inteiro
// — mesmo achado já documentado em `buildSeedMessages`, replicado aqui
// porque a 1ª tentativa desta task caiu na mesma armadilha). Sempre ao
// menos 1 item (mensagem do lead); um 2º item (resposta do agente) só
// quando `responder_lead` foi de fato chamado neste turno — turno sem
// resposta não gera bolha de IA vazia na memória.
const prepareTurnForMemory = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: preparar turno para memória",
    position: [8080, 650],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const humanMessage = $('Code: montar system message e marcar campo perguntado').first().json.userMessage;\n" +
        "const agentTurn = $('AI Agent').first().json;\n" +
        "const steps = Array.isArray(agentTurn.intermediateSteps) ? agentTurn.intermediateSteps : [];\n" +
        "const agentMessages = steps\n" +
        "  .filter((s) => s && s.action && s.action.tool === 'responder_lead')\n" +
        "  .map((s) => s.action.toolInput && s.action.toolInput.mensagem)\n" +
        "  .filter((m) => typeof m === 'string' && m.length > 0);\n" +
        "const items = [{ json: { type: 'user', message: humanMessage } }];\n" +
        "if (agentMessages.length > 0) {\n" +
        "  items.push({ json: { type: 'ai', message: agentMessages.join('\\n') } });\n" +
        "}\n" +
        "return items;\n",
    },
  },
  output: [
    { type: "user", message: "Prefiro casa mesmo" },
    { type: "ai", message: "casa muda bastante o estilo da busca..." },
  ],
});

// Loop 1-a-1, mesmo mecanismo de `insertOneSeedMessage` (get_sdk_reference —
// "Trust empty item lists" não se aplica aqui: `prepareTurnForMemory` sempre
// devolve ao menos 1 item, a mensagem do lead).
const turnMessageBatches = splitInBatches({
  version: 3,
  config: { name: "Loop: mensagens do turno", position: [8340, 650], parameters: { batchSize: 1 } },
});

const insertOneTurnMessage = node({
  type: "@n8n/n8n-nodes-langchain.memoryManager",
  version: 1.1,
  config: {
    name: "Chat Memory Manager: salvar turno",
    position: [8600, 550],
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

// Checkpoint (convenção do topo do arquivo): o loop de salvamento substitui
// `$json` pelo resultado da operação de insert (`{success:true}`) — os 3
// campos que `Data Table: limpar buffer` precisa são lidos de volta do
// checkpoint original (`Code: finalizar turno do agente`), nunca de `$json`
// cego.
const prepClearAfterAgentTurn = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: preparar clear de buffer (turno do agente)",
    position: [8860, 650],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: finalizar turno do agente').first().json;\n" +
        "return [{ json: { tenantSlug: ctx.tenantSlug, waId: ctx.waId, fase: ctx.fase } }];\n",
    },
  },
  output: [{ tenantSlug: "imobiliaria-a", waId: "5534999990001", fase: "qualificando" }],
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

// ACHADO REAL (Phase 4 do lote-7, execução 1118): a rota de opt-out nunca
// tinha sido exercitada ponta a ponta com mensagem real. Entre
// `Code: finalizar opt-out` e o envio existem DOIS nós de Data Table
// (purga de memória e purga de conversa_estado), e cada um substitui
// `$json` pelo próprio resultado — `Code: destinatário do envio fixo` lia
// `$input.first()` cego e recebia a LINHA da conversa_estado, sem
// `phoneNumberId` e sem `mensagens`. O envio saía para uma URL malformada
// e a Meta devolvia 400 ("Object with ID 'messages' does not exist"): o
// lead era descadastrado corretamente, mas nunca recebia a confirmação
// única que a LGPD-03 AC1 exige. Este checkpoint restaura o payload do
// ancestral nomeado — exatamente a CONVENÇÃO DE CONVERGÊNCIA descrita no
// topo deste arquivo, que a rota de opt-out era a única a não seguir.
const restoreOptOutPayload = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: restaurar payload do opt-out",
    position: [5480, -500],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "const ctx = $('Code: finalizar opt-out').first().json;\n" +
        "return [{ json: ctx }];\n",
    },
  },
  output: [{ mensagens: ["confirmação de opt-out"], waId: "5534999990001", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "encerrada" }],
});

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
        "/**\n * Normalização do destinatário de envio no WhatsApp (nono dígito brasileiro).\n *\n * PROBLEMA REAL (execução 354 de `crivo-agente-principal`, confirmado contra\n * duas fontes): o webhook da Meta entrega o contato em `wa_id` no formato\n * LEGADO, sem o nono dígito — `553499532444` (12 dígitos) — enquanto a Cloud\n * API só aceita como destinatário o número atual, com o 9 — `5534999532444`\n * (13 dígitos, o mesmo valor que o painel da Meta usa no campo `to` do curl\n * de exemplo). Enviar o `wa_id` cru resulta em erro 131030 (\"Recipient phone\n * number not in allowed list\") — ou seja, TODA resposta do agente a um lead\n * brasileiro falha, não só a do número de teste.\n *\n * ESCOPO DELIBERADO: esta função normaliza SÓ o destinatário do envio. O\n * `wa_id` cru continua sendo a chave das Data Tables (`conversa_estado`,\n * `agenda_envios`) e o `externalId` do lead no CRM — mudar essas chaves\n * quebraria o casamento com os eventos recebidos da Meta, que sempre chegam\n * no formato legado.\n *\n * Função pura, sem I/O, sem dependências — roda dentro de um Code node do\n * n8n (sandbox: sem `require`, sem rede).\n */\n\n// Marca do país no formato E.164 sem o \"+\" (é como o `wa_id` chega da Meta).\nconst BRAZIL_COUNTRY_CODE = \"55\";\n\n// Comprimentos brasileiros: 55 + DDD(2) + 8 (formato legado, pré-nono-dígito)\n// e 55 + DDD(2) + 9 (formato atual). Só o primeiro precisa de conserto.\nconst BR_LEGACY_LENGTH = 12;\nconst BR_DDD_END_INDEX = 4; // fim de \"55\" + DDD\n\n// Discriminador celular x fixo (Anatel — Plano de Numeração Brasileiro,\n// cartilha do nono dígito): o 9 foi acrescentado SÓ aos números do Serviço\n// Móvel Pessoal, que no formato legado de 8 dígitos começavam com 6, 7, 8 ou\n// 9; a telefonia fixa também tem 8 dígitos, mas começa com 2, 3, 4 ou 5 e\n// NUNCA recebeu o nono dígito. Sem esse discriminador, um fixo de 8 dígitos\n// gravado como contato viraria um celular inexistente de 9 dígitos.\nconst BR_MOBILE_LOCAL_PREFIX = /^[6-9]/;\n\nconst NON_DIGIT_PATTERN = /\\D/g;\n\n/**\n * Converte um `wa_id` da Meta no MSISDN aceito pela Cloud API como\n * destinatário de envio.\n *\n * Regras (nesta ordem):\n * 1. Entrada não-string ou sem nenhum dígito (null/undefined/\"\"/lixo) → `\"\"`.\n *    Devolver string vazia (em vez do valor cru) evita que o nó de envio\n *    mande literalmente \"undefined\" para a Meta; o envio falha de forma\n *    explícita, que é o comportamento defensivo dos módulos vizinhos\n *    (`normalizeEvent` → null, `detectOptOut` → false).\n * 2. Caracteres não numéricos (`+`, espaço, hífen) são descartados — o\n *    `wa_id` da Meta é sempre só dígitos, mas o valor pode chegar de uma\n *    Data Table preenchida à mão.\n * 3. Número brasileiro (prefixo `55`) no formato legado (12 dígitos) cujo\n *    número local começa com 6-9 (celular) → insere `9` depois do DDD.\n * 4. Qualquer outro caso — brasileiro já com 13 dígitos, fixo brasileiro de\n *    8 dígitos locais, número de outro país, comprimento inesperado — volta\n *    inalterado. Nenhuma regra de outro país é inventada aqui.\n *\n * Idempotente por construção: o resultado da regra 3 tem 13 dígitos e cai na\n * regra 4 numa segunda aplicação.\n *\n * @param {unknown} waId - `wa_id` do contato no evento da Meta\n * @returns {string} MSISDN pronto para `recipientPhoneNumber`\n */\nfunction toWhatsAppMsisdn(waId) {\n  if (typeof waId !== \"string\") return \"\";\n\n  const digits = waId.replace(NON_DIGIT_PATTERN, \"\");\n  if (digits === \"\") return \"\";\n\n  if (!digits.startsWith(BRAZIL_COUNTRY_CODE)) return digits;\n  if (digits.length !== BR_LEGACY_LENGTH) return digits;\n\n  const ddd = digits.slice(0, BR_DDD_END_INDEX);\n  const local = digits.slice(BR_DDD_END_INDEX);\n  if (!BR_MOBILE_LOCAL_PREFIX.test(local)) return digits;\n\n  return `${ddd}9${local}`;\n}" +
        "\n\n" +
        "const ctx = $input.first().json;\n" +
        "return [{ json: { ...ctx, recipientMsisdn: toWhatsAppMsisdn(ctx.waId) } }];\n",
    },
  },
  output: [{ mensagens: ["resposta fixa"], waId: "553499532444", recipientMsisdn: "5534999532444", phoneNumberId: "109876543210001", tenantSlug: "imobiliaria-a", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", fase: "qualificando" }],
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
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: destinatário do envio fixo').first().json.tenantSlug }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: $json.messages[0].id, sender: 'agente', content: $('Code: destinatário do envio fixo').first().json.mensagens[0], sentAt: $now.toISO() } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
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

const clearAfterAgentTurnWired = prepClearAfterAgentTurn.to(clearBufferAndFinalize);

const optOutBranch = postOptOut.to(
  finalizeOptOut.to(
    purgeMemoryOnOptOut.to(
      purgeConversaEstadoOnOptOut.to(restoreOptOutPayload.to(fixedReplyWired))
    )
  )
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
          hasSeedMessagesIf
            // Conversa nova, sem histórico anterior: nada a semear, segue
            // direto para o checkpoint (o turno atual é gravado depois, pelo
            // salvamento do turno).
            .onTrue(memoryReadyCheckpoint)
            .onFalse(
              seedMessageBatches
                .onDone(memoryReadyCheckpoint)
                .onEachBatch(insertOneSeedMessage.to(nextBatch(seedMessageBatches)))
            )
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
    persistPerguntados.to(
      aiAgent.to(
        // `clearAfterAgentTurnWired` é o alvo ÚNICO das duas saídas do IF
        // (mesma regra de fan-in do topo desta seção: wiring de saída
        // definida uma vez só, nunca duplicada por branch).
        finalizeAgentTurn.to(
          needsFallbackSendIf
            // Agente escreveu texto mas não chamou `responder_lead`: manda
            // esse texto pelo caminho de envio fixo em vez de deixar o lead
            // no vácuo (achado real, execução 947).
            .onTrue(buildFallbackReply.to(fixedReplyWired))
            .onFalse(
              wasTurnAutoSavedIf
                .onTrue(clearAfterAgentTurnWired)
                .onFalse(
                  prepareTurnForMemory.to(
                    turnMessageBatches
                      .onDone(clearAfterAgentTurnWired)
                      .onEachBatch(insertOneTurnMessage.to(nextBatch(turnMessageBatches)))
                  )
                )
            )
        )
      )
    )
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
