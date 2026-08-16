/**
 * crivo-tool-responder-lead — sub-workflow tool `responder_lead` (T7).
 *
 * Única porta de saída de mensagem do agente para o lead (design.md —
 * Components: "Sub-workflow crivo-tool-responder-lead"). O nó AI Agent do
 * fluxo principal (T11) chama este sub-workflow uma vez por mensagem que
 * decide enviar (até 3 vezes por turno) via `toolWorkflow`. Requisitos:
 * AGN-03, AGN-04, VOZ-01, VOZ-02, VOZ-03.
 *
 * Contrato de entrada (`Execute Workflow Trigger`): `mensagem` é o único
 * campo preenchido pelo modelo (fromAi, no wiring do T11); `tenantSlug`,
 * `waId`, `leadId`, `phoneNumberId` vêm de expressão do fluxo no
 * nó que chama esta tool — NUNCA de `$fromAI` (mesmo risco de escrita
 * cross-lead do design.md — Risks & Concerns, aqui aplicado por simetria
 * mesmo essa tool não escrevendo campo de qualificação nenhum).
 *
 * Contador de turno (design.md não define um novo campo em
 * `conversa_estado` para isso — T6, já commitado, só adicionou
 * `perguntadosJson`/`aberturasJson`): cada chamada aceita grava
 * `{opening, sentAt}` em `aberturasJson`, não só a da 1ª mensagem do turno.
 * O "turno corrente" é inferido comparando `sentAt` de cada entrada contra
 * `conversa_estado.lastInboundAt` (a mensagem que disparou o turno) — sem
 * isso não haveria como distinguir "aberturas de turnos anteriores" (o que
 * VOZ-01 AC2 quer comparar) de "quantas mensagens já saíram neste turno"
 * (o que AGN-04 quer contar) usando só as colunas existentes. `checkOpening`
 * (voice.mjs) só é aplicado à 1ª mensagem do turno (`turnCount === 0`) —
 * mensagens seguintes do mesmo turno pulam a checagem de abertura (VOZ-01
 * AC1/AC2 falam de "a PRIMEIRA mensagem do turno") mas continuam passando
 * por `checkCapabilityPromise` (VOZ-02 AC3 não tem essa restrição — "alguma
 * mensagem do turno").
 *
 * SEM FUNÇÕES CUSTOMIZADAS no nível deste arquivo (mesma regra de
 * `principal.ts` — confirmada pelo `validate_workflow` do MCP).
 */
import { workflow, node, trigger, ifElse, newCredential, expr } from "@n8n/workflow-sdk";

const CRM_BASE_URL = "https://crivo-arthur1050s-projects.vercel.app/api/v1";
const CONVERSA_ESTADO_TABLE_ID = "ZsplBxJjXv3kwKZ8";

const respondTrigger = trigger({
  type: "n8n-nodes-base.executeWorkflowTrigger",
  version: 1.2,
  config: {
    name: "Execute Workflow Trigger",
    position: [0, 0],
    parameters: {
      inputSource: "workflowInputs",
      workflowInputs: {
        values: [
          { name: "mensagem", type: "string" },
          { name: "tenantSlug", type: "string" },
          { name: "waId", type: "string" },
          { name: "leadId", type: "string" },
          { name: "phoneNumberId", type: "string" },
        ],
      },
    },
  },
  output: [
    {
      mensagem: "Show, deixa eu te explicar melhor.",
      tenantSlug: "imobiliaria-a",
      waId: "553499532444",
      leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      phoneNumberId: "109876543210001",
    },
  ],
});

const conversaEstadoLookup = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: ler conversa_estado",
    position: [260, 0],
    // Defensivo: a linha deveria sempre existir a essa altura do turno (o
    // gate já upsertou o buffer antes do agente rodar), mas alwaysOutputData
    // evita abortar a tool inteira se, por algum motivo, a busca não casar.
    alwaysOutputData: true,
    parameters: {
      resource: "row",
      operation: "get",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Execute Workflow Trigger').first().json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Execute Workflow Trigger').first().json.waId }}") },
        ],
      },
      returnAll: false,
      limit: 1,
    },
  },
  output: [{ tenantSlug: "imobiliaria-a", waId: "553499532444", aberturasJson: "[]", lastInboundAt: "2026-08-14T12:00:00.000Z" }],
});

const applyVoiceBarriers = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: aplicar barreiras de persona",
    position: [520, 0],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(voice.mjs)__' +
        "\n\n" +
        "const trigger = $('Execute Workflow Trigger').first().json;\n" +
        "const row = $input.first().json;\n" +
        "const mensagem = typeof trigger.mensagem === 'string' ? trigger.mensagem : '';\n" +
        "const now = new Date().toISOString();\n" +
        "const lastInboundAt = row.lastInboundAt || null;\n" +
        "const lastInboundMs = lastInboundAt ? new Date(lastInboundAt).getTime() : 0;\n" +
        "let aberturas = [];\n" +
        "try { aberturas = row.aberturasJson ? JSON.parse(row.aberturasJson) : []; } catch (e) { aberturas = []; }\n" +
        "if (!Array.isArray(aberturas)) aberturas = [];\n" +
        "const turnEntries = aberturas.filter((a) => a && typeof a.sentAt === 'string' && new Date(a.sentAt).getTime() > lastInboundMs);\n" +
        "const turnCount = turnEntries.length;\n" +
        "let rejection = null;\n" +
        "if (turnCount >= 3) {\n" +
        "  rejection = 'limite-mensagens-turno';\n" +
        "} else {\n" +
        "  if (turnCount === 0) {\n" +
        "    const previousOpenings = aberturas\n" +
        "      .filter((a) => a && typeof a.sentAt === 'string' && new Date(a.sentAt).getTime() <= lastInboundMs)\n" +
        "      .map((a) => a.opening);\n" +
        "    const openingCheck = checkOpening([mensagem], previousOpenings);\n" +
        "    if (!openingCheck.ok) rejection = openingCheck.reason;\n" +
        "  }\n" +
        "  if (!rejection) {\n" +
        "    const capabilityCheck = checkCapabilityPromise([mensagem]);\n" +
        "    if (!capabilityCheck.ok) rejection = capabilityCheck.reason;\n" +
        "  }\n" +
        "}\n" +
        "const newAberturas = rejection ? aberturas : [...aberturas, { opening: extractOpening(mensagem), sentAt: now }];\n" +
        "return [{ json: {\n" +
        "  accepted: !rejection,\n" +
        "  reason: rejection,\n" +
        "  mensagem,\n" +
        "  tenantSlug: trigger.tenantSlug,\n" +
        "  waId: trigger.waId,\n" +
        "  leadId: trigger.leadId,\n" +
        "  phoneNumberId: trigger.phoneNumberId,\n" +
        "  aberturasJson: JSON.stringify(newAberturas),\n" +
        "} }];\n",
    },
  },
  output: [{ accepted: true, reason: null, mensagem: "Show, deixa eu te explicar melhor.", tenantSlug: "imobiliaria-a", waId: "553499532444", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", phoneNumberId: "109876543210001", aberturasJson: "[{\"opening\":\"show\",\"sentAt\":\"2026-08-14T12:00:05.000Z\"}]" }],
});

const isAccepted = ifElse({
  version: 2.3,
  config: {
    name: "Aceito pelas barreiras de persona?",
    position: [780, 0],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.accepted }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

const rejectResponse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: recusa (devolve motivo ao agente)",
    position: [1040, 200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return [{ json: { ok: false, reason: $json.reason } }];\n",
    },
  },
  output: [{ ok: false, reason: "abertura-proibida" }],
});

const normalizeRecipientCode = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: normalizar destinatario do envio",
    position: [1040, -200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(phone.mjs)__' +
        "\n\n" +
        "const ctx = $json;\n" +
        "return [{ json: { ...ctx, recipientMsisdn: toWhatsAppMsisdn(ctx.waId) } }];\n",
    },
  },
  output: [{ mensagem: "Show, deixa eu te explicar melhor.", tenantSlug: "imobiliaria-a", waId: "553499532444", recipientMsisdn: "5534999532444", leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", phoneNumberId: "109876543210001", aberturasJson: "[]" }],
});

const sendWhatsAppMessage = node({
  type: "n8n-nodes-base.whatsApp",
  version: 1.1,
  config: {
    name: "WhatsApp: enviar resposta do agente",
    position: [1300, -200],
    parameters: {
      resource: "message",
      operation: "send",
      phoneNumberId: expr("{{ $json.phoneNumberId }}"),
      recipientPhoneNumber: expr("{{ $json.recipientMsisdn }}"),
      messageType: "text",
      textBody: expr("{{ $json.mensagem }}"),
    },
    credentials: { whatsAppApi: newCredential("WhatsApp account") },
  },
  output: [{ messages: [{ id: "wamid.RESPOSTA" }] }],
});

const registerAgentMessage = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.4,
  config: {
    name: "HTTP: registrar mensagem do agente",
    position: [1560, -200],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    parameters: {
      method: "POST",
      url: expr(`${CRM_BASE_URL}/leads/{{ $('Code: normalizar destinatario do envio').first().json.leadId }}/messages`),
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: normalizar destinatario do envio').first().json.tenantSlug }}") }],
      },
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ { externalId: $json.messages[0].id, sender: 'agente', content: $('Code: normalizar destinatario do envio').first().json.mensagem, sentAt: $now.toISO() } }}"
      ),
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
  },
  output: [{ id: "6fa85f64-5717-4562-b3fc-2c963f66afa9", sender: "agente" }],
});

const persistAbertura = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: gravar abertura",
    position: [1820, -200],
    parameters: {
      resource: "row",
      operation: "upsert",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: expr("{{ $('Code: aplicar barreiras de persona').first().json.tenantSlug }}") },
          { keyName: "waId", condition: "eq", keyValue: expr("{{ $('Code: aplicar barreiras de persona').first().json.waId }}") },
        ],
      },
      columns: {
        mappingMode: "defineBelow",
        value: {
          tenantSlug: expr("{{ $('Code: aplicar barreiras de persona').first().json.tenantSlug }}"),
          waId: expr("{{ $('Code: aplicar barreiras de persona').first().json.waId }}"),
          aberturasJson: expr("{{ $('Code: aplicar barreiras de persona').first().json.aberturasJson }}"),
        },
        schema: [
          { id: "tenantSlug", displayName: "tenantSlug", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "waId", displayName: "waId", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
          { id: "aberturasJson", displayName: "aberturasJson", required: false, defaultMatch: false, display: true, type: "string", canBeUsedToMatch: true },
        ],
      },
    },
  },
  output: [{ id: 1 }],
});

const acceptResponse = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: aceite (confirma envio ao agente)",
    position: [2080, -200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return [{ json: { ok: true, leadId: $('Code: aplicar barreiras de persona').first().json.leadId } }];\n",
    },
  },
  output: [{ ok: true, leadId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" }],
});

const acceptedBranch = normalizeRecipientCode.to(
  sendWhatsAppMessage.to(registerAgentMessage.to(persistAbertura.to(acceptResponse)))
);

export default workflow("crivo-tool-responder-lead", "crivo-tool-responder-lead")
  .add(respondTrigger)
  .to(
    conversaEstadoLookup.to(
      applyVoiceBarriers.to(isAccepted.onTrue(acceptedBranch).onFalse(rejectResponse))
    )
  );
