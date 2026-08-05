/**
 * crivo-agente-principal — esqueleto (T9).
 *
 * Fonte versionada do workflow n8n de qualificação conversacional
 * (design.md — "Pipeline do workflow principal"; AD-014: workflow-as-code).
 * Este arquivo é texto de ENTRADA do inliner (`scripts/n8n-inline.mjs`), não
 * o que é publicado na instância — o publicável é `n8n/generated/principal.ts`
 * (gerado, nunca editado à mão).
 *
 * Estado nesta task (T9): esqueleto — só os 3 primeiros passos do pipeline
 * (WhatsApp Trigger -> Filter -> Code normalizeEvent), o suficiente para
 * provar o mecanismo de marcador `__INLINE(...)__` de ponta a ponta com um
 * módulo real de `n8n/src/`. T10 estende este arquivo para o pipeline
 * completo (lookup de tenant, debounce, sync CRM, gate, LLM, efeitos,
 * resposta) e faz a publicação via MCP.
 *
 * NOTA (fronteira n8n <> normalizeEvent, a resolver/confirmar no T12):
 * `normalizeEvent` (n8n/src/normalize-event.mjs, testado contra o payload
 * bruto documentado pela Meta: `{ entry: [{ changes: [{ value: {...} }] }] }`)
 * foi escrito e testado contra o formato oficial do webhook. O node
 * `whatsAppTrigger` do n8n pode entregar esse envelope bruto OU já entregar
 * o objeto `value` "achatado" no topo do item (temos evidência indireta
 * disso: o guia de best-practices de chatbot do MCP usa
 * `nodeJson(whatsAppTrigger, 'messages.0.from')`, ou seja, `messages` no
 * topo). O harness abaixo aceita as duas formas defensivamente. T12
 * ("Capturar 1 payload real da Meta e reconciliar com as fixtures do T5")
 * é o passo que confirma contra um payload real e corrige se necessário.
 */
import { workflow, node, trigger, newCredential } from "@n8n/workflow-sdk";

const whatsAppInboundTrigger = trigger({
  type: "n8n-nodes-base.whatsAppTrigger",
  version: 1,
  config: {
    name: "WhatsApp Trigger",
    position: [0, 0],
    parameters: {
      // Único campo do webhook Meta relevante ao produto — mensagens
      // inbound. Eventos de status (delivered/read) chegam sob o MESMO
      // campo `messages` (ver meta-statuses.json) e são descartados a
      // jusante (Filter + normalizeEvent retornando null), não por uma
      // subscription separada.
      updates: ["messages"],
    },
    credentials: {
      whatsAppTriggerApi: newCredential("WhatsApp Trigger — Crivo"),
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
      metadata: {
        display_phone_number: "15550001111",
        phone_number_id: "109876543210001",
      },
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
            // Cobre as duas formas possíveis do item (ver nota de topo):
            // envelope bruto (`entry[0].changes[0].value.messages`) ou
            // já achatado (`messages` no topo do item).
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
    {
      messages: [{ from: "5534999990001", id: "wamid.EXEMPLO", timestamp: "1754395800", type: "text", text: { body: "Oi" } }],
      metadata: { phone_number_id: "109876543210001" },
    },
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
        "return { json: event };\n",
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
    },
  ],
});

export default workflow("crivo-agente-principal", "crivo-agente-principal")
  .add(whatsAppInboundTrigger)
  .to(onlyMessageEvents)
  .to(normalizeEventCode);
