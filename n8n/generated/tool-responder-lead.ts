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
        "/**\n * Barreiras determinísticas de persona (design.md — n8n/src/voice.mjs;\n * spec.md VOZ-01, VOZ-02). Funções puras, sem I/O, sem dependências — rodam\n * dentro de um Code node do n8n, aplicadas pelo sub-workflow\n * `tool-responder-lead` ANTES de qualquer envio ao lead.\n */\n\n// Faixa Unicode dos diacríticos combinantes (U+0300-U+036F) produzidos pela\n// decomposição NFD — mesma técnica de `gate.mjs:10`, reimplementada aqui de\n// propósito (tasks.md — T2 \"Reuses\": `n8n/src/` já adota duplicação\n// deliberada entre módulos, para manter cada arquivo independente dentro do\n// Code node em que roda).\nconst DIACRITICS_PATTERN = /[̀-ͯ]/g;\n\n/**\n * Remove acentos, apara espaços e normaliza para minúsculas.\n * @param {string} text\n * @returns {string}\n */\nfunction foldAccentsAndCase(text) {\n  return text.normalize(\"NFD\").replace(DIACRITICS_PATTERN, \"\").trim().toLowerCase();\n}\n\n// Interjeições de aprovação isoladas que abriram quase todo turno na\n// conversa real de 2026-08-13 (\"Show.\" 4×, \"Boa.\" 3×, \"Entendido.\") — spec.md\n// VOZ-01 AC1.\nconst BANNED_OPENINGS = new Set([\"show\", \"boa\", \"perfeito\", \"entendido\", \"otimo\", \"legal\"]);\n\n// Primeiro caractere de pontuação forte que delimita a \"abertura\" de uma\n// mensagem — o que vem antes dele é a interjeição/locução de abertura; o\n// resto é o conteúdo da mensagem.\nconst OPENING_PUNCTUATION_PATTERN = /[.,!?;:]/;\n\n/**\n * Extrai e normaliza a abertura de uma mensagem: tudo antes da primeira\n * pontuação forte (ou a mensagem inteira, se não houver pontuação), sem\n * acento, minúscula, aparada (design.md — `extractOpening`). \"Show.\" e\n * \"show\" colidem no mesmo valor normalizado (tasks.md — T2 Done-when).\n * @param {unknown} mensagem\n * @returns {string}\n */\nfunction extractOpening(mensagem) {\n  if (typeof mensagem !== \"string\") return \"\";\n  const punctuationIndex = mensagem.search(OPENING_PUNCTUATION_PATTERN);\n  const head = punctuationIndex === -1 ? mensagem : mensagem.slice(0, punctuationIndex);\n  return foldAccentsAndCase(head);\n}\n\n/**\n * @typedef {{ok: true}} VoiceCheckOk\n * @typedef {{ok: false, reason: \"abertura-proibida\" | \"abertura-repetida\"}} OpeningCheckFail\n * @typedef {{ok: false, reason: \"promessa-fora-de-capacidade\"}} CapabilityCheckFail\n */\n\n/**\n * Rejeita a abertura da PRIMEIRA mensagem do turno se ela for uma\n * interjeição de aprovação isolada (VOZ-01 AC1) ou se coincidir com a\n * abertura de qualquer turno anterior da mesma sessão (VOZ-01 AC2). Turno\n * sem mensagem alguma passa (nada para checar).\n * @param {string[] | null | undefined} mensagens\n * @param {string[] | null | undefined} aberturasAnteriores\n * @returns {VoiceCheckOk | OpeningCheckFail}\n */\nfunction checkOpening(mensagens, aberturasAnteriores) {\n  const list = Array.isArray(mensagens) ? mensagens : [];\n  const first = list[0];\n  if (typeof first !== \"string\" || first.length === 0) {\n    return { ok: true };\n  }\n\n  const opening = extractOpening(first);\n\n  if (BANNED_OPENINGS.has(opening)) {\n    return { ok: false, reason: \"abertura-proibida\" };\n  }\n\n  const previous = Array.isArray(aberturasAnteriores) ? aberturasAnteriores : [];\n  if (previous.includes(opening)) {\n    return { ok: false, reason: \"abertura-repetida\" };\n  }\n\n  return { ok: true };\n}\n\n// Verbos de intenção futura que, combinados com \"vou\" e um alvo da lista\n// abaixo, caracterizam a promessa de uma capacidade que o agente nunca teve\n// (spec.md — VOZ-02 AC3: buscar/enviar/mandar/puxar/separar imóvel, opção,\n// foto ou valor). Deliberadamente NÃO inclui verbos neutros como\n// \"anotar\"/\"confirmar\" — \"vou anotar aqui\" e \"vou confirmar com o corretor\"\n// são exatamente os dois contraexemplos do T2 Done-when que NÃO podem ser\n// rejeitados (discriminação — não pode ser um regex guloso).\nconst CAPABILITY_VERBS = [\"buscar\", \"enviar\", \"mandar\", \"puxar\", \"separar\"];\n\n// Alvos que, junto de um verbo de intenção acima, fecham a promessa de\n// capacidade inexistente.\nconst CAPABILITY_TARGETS = [\n  \"imovel\",\n  \"imoveis\",\n  \"opcao\",\n  \"opcoes\",\n  \"foto\",\n  \"fotos\",\n  \"valor\",\n  \"valores\",\n  \"apartamento\",\n  \"apartamentos\",\n  \"casa\",\n  \"casas\",\n  \"preco\",\n  \"precos\",\n];\n\n/**\n * @param {string} mensagem\n * @returns {boolean}\n */\nfunction promisesCapability(mensagem) {\n  const folded = foldAccentsAndCase(mensagem);\n  const hasIntentVerb = CAPABILITY_VERBS.some((verb) => {\n    // Até 40 caracteres entre \"vou\" e o verbo cobrem modificadores como \"te\",\n    // \"aqui\", \"agora mesmo\" sem deixar o regex casar frases longas demais.\n    const pattern = new RegExp(`\\\\bvou\\\\b[^.!?]{0,40}?\\\\b${verb}\\\\b`);\n    return pattern.test(folded);\n  });\n  if (!hasIntentVerb) return false;\n\n  return CAPABILITY_TARGETS.some((target) => folded.includes(target));\n}\n\n/**\n * Rejeita o turno inteiro se QUALQUER uma das mensagens prometer buscar,\n * enviar, mandar, puxar ou separar imóveis, opções, fotos ou valores\n * (spec.md — VOZ-02 AC3) — capacidade que o agente nunca teve.\n * @param {string[] | null | undefined} mensagens\n * @returns {VoiceCheckOk | CapabilityCheckFail}\n */\nfunction checkCapabilityPromise(mensagens) {\n  const list = Array.isArray(mensagens) ? mensagens : [];\n  const violated = list.some(\n    (mensagem) => typeof mensagem === \"string\" && promisesCapability(mensagem)\n  );\n\n  if (violated) {\n    return { ok: false, reason: \"promessa-fora-de-capacidade\" };\n  }\n\n  return { ok: true };\n}" +
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
        "/**\n * Normalização do destinatário de envio no WhatsApp (nono dígito brasileiro).\n *\n * PROBLEMA REAL (execução 354 de `crivo-agente-principal`, confirmado contra\n * duas fontes): o webhook da Meta entrega o contato em `wa_id` no formato\n * LEGADO, sem o nono dígito — `553499532444` (12 dígitos) — enquanto a Cloud\n * API só aceita como destinatário o número atual, com o 9 — `5534999532444`\n * (13 dígitos, o mesmo valor que o painel da Meta usa no campo `to` do curl\n * de exemplo). Enviar o `wa_id` cru resulta em erro 131030 (\"Recipient phone\n * number not in allowed list\") — ou seja, TODA resposta do agente a um lead\n * brasileiro falha, não só a do número de teste.\n *\n * ESCOPO DELIBERADO: esta função normaliza SÓ o destinatário do envio. O\n * `wa_id` cru continua sendo a chave das Data Tables (`conversa_estado`,\n * `agenda_envios`) e o `externalId` do lead no CRM — mudar essas chaves\n * quebraria o casamento com os eventos recebidos da Meta, que sempre chegam\n * no formato legado.\n *\n * Função pura, sem I/O, sem dependências — roda dentro de um Code node do\n * n8n (sandbox: sem `require`, sem rede).\n */\n\n// Marca do país no formato E.164 sem o \"+\" (é como o `wa_id` chega da Meta).\nconst BRAZIL_COUNTRY_CODE = \"55\";\n\n// Comprimentos brasileiros: 55 + DDD(2) + 8 (formato legado, pré-nono-dígito)\n// e 55 + DDD(2) + 9 (formato atual). Só o primeiro precisa de conserto.\nconst BR_LEGACY_LENGTH = 12;\nconst BR_DDD_END_INDEX = 4; // fim de \"55\" + DDD\n\n// Discriminador celular x fixo (Anatel — Plano de Numeração Brasileiro,\n// cartilha do nono dígito): o 9 foi acrescentado SÓ aos números do Serviço\n// Móvel Pessoal, que no formato legado de 8 dígitos começavam com 6, 7, 8 ou\n// 9; a telefonia fixa também tem 8 dígitos, mas começa com 2, 3, 4 ou 5 e\n// NUNCA recebeu o nono dígito. Sem esse discriminador, um fixo de 8 dígitos\n// gravado como contato viraria um celular inexistente de 9 dígitos.\nconst BR_MOBILE_LOCAL_PREFIX = /^[6-9]/;\n\nconst NON_DIGIT_PATTERN = /\\D/g;\n\n/**\n * Converte um `wa_id` da Meta no MSISDN aceito pela Cloud API como\n * destinatário de envio.\n *\n * Regras (nesta ordem):\n * 1. Entrada não-string ou sem nenhum dígito (null/undefined/\"\"/lixo) → `\"\"`.\n *    Devolver string vazia (em vez do valor cru) evita que o nó de envio\n *    mande literalmente \"undefined\" para a Meta; o envio falha de forma\n *    explícita, que é o comportamento defensivo dos módulos vizinhos\n *    (`normalizeEvent` → null, `detectOptOut` → false).\n * 2. Caracteres não numéricos (`+`, espaço, hífen) são descartados — o\n *    `wa_id` da Meta é sempre só dígitos, mas o valor pode chegar de uma\n *    Data Table preenchida à mão.\n * 3. Número brasileiro (prefixo `55`) no formato legado (12 dígitos) cujo\n *    número local começa com 6-9 (celular) → insere `9` depois do DDD.\n * 4. Qualquer outro caso — brasileiro já com 13 dígitos, fixo brasileiro de\n *    8 dígitos locais, número de outro país, comprimento inesperado — volta\n *    inalterado. Nenhuma regra de outro país é inventada aqui.\n *\n * Idempotente por construção: o resultado da regra 3 tem 13 dígitos e cai na\n * regra 4 numa segunda aplicação.\n *\n * @param {unknown} waId - `wa_id` do contato no evento da Meta\n * @returns {string} MSISDN pronto para `recipientPhoneNumber`\n */\nfunction toWhatsAppMsisdn(waId) {\n  if (typeof waId !== \"string\") return \"\";\n\n  const digits = waId.replace(NON_DIGIT_PATTERN, \"\");\n  if (digits === \"\") return \"\";\n\n  if (!digits.startsWith(BRAZIL_COUNTRY_CODE)) return digits;\n  if (digits.length !== BR_LEGACY_LENGTH) return digits;\n\n  const ddd = digits.slice(0, BR_DDD_END_INDEX);\n  const local = digits.slice(BR_DDD_END_INDEX);\n  if (!BR_MOBILE_LOCAL_PREFIX.test(local)) return digits;\n\n  return `${ddd}9${local}`;\n}" +
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
