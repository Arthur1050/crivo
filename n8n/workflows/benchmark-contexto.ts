/**
 * crivo-benchmark-contexto — mede o teto de contexto documental do agente
 * (lote-12 — T34, DOCLIM-01; design.md "Benchmark reproduzível").
 *
 * Reproduz a composição do agente publicado (`principal.ts`) no que pesa para
 * o teto: o MESMO nó de modelo (snapshot, `reasoningEffort`, timeout,
 * credencial), o MESMO system message (mesmos módulos inlined, mesma ordem, e
 * as configurações reais do tenant lidas de `GET /settings`), as MESMAS seis
 * tools com nome e descrição idênticos, `maxIterations` igual e um histórico
 * de 50 mensagens numa memória real do n8n.
 *
 * O que é deliberadamente diferente, e por quê:
 *
 * - As tools são stubs (`toolCode`). As reais escrevem no CRM e enviam
 *   WhatsApp; um benchmark não pode registrar qualificação, escalar lead ou
 *   mandar mensagem. Nome e descrição são byte a byte os de produção; os
 *   schemas reproduzem os parâmetros `$fromAI` que o modelo vê. O custo fixo
 *   que sobra de diferença é medido, não suposto: a faixa zero mede tudo o que
 *   não é corpus.
 * - `consultar_documentos` devolve o envelope canônico da faixa, gerado aqui
 *   por `benchmark-corpus.mjs` — provado byte a byte igual ao
 *   `buildCanonicalContext` do CRM (`n8n/src/__tests__/benchmark-corpus.test.ts`).
 *   O corpus nunca trafega pela entrada da execução: só faixa e seed.
 * - `observacoes: 2` devolve o envelope duas vezes numa só observação. É o
 *   custo em tokens de o agente consultar duas vezes no mesmo turno (design,
 *   margem 5), sem depender de o modelo decidir repetir a chamada.
 * - A memória é `memoryBufferWindow` (processo do n8n) com chave por execução:
 *   nada é gravado na memória Postgres das conversas reais.
 *
 * Nenhum lead, conversa ou mensagem real é tocado. A única chamada ao CRM é o
 * `GET /settings` do tenant `triangulo`, somente leitura.
 *
 * Fonte versionada (AD-014). O publicável é `n8n/generated/benchmark-contexto.ts`.
 */
import { workflow, node, trigger, memory, languageModel, tool, newCredential, expr } from "@n8n/workflow-sdk";

const CRM_BASE_URL = "https://crivo-arthur1050s-projects.vercel.app/api/v1";
const BENCHMARK_TENANT_SLUG = "triangulo";

// Descrições copiadas de `principal.ts`, byte a byte. Mudou lá, muda aqui —
// e o benchmark fica `stale` pelo hash da composição publicada.
const DESCRIPTIONS = {
  registrar_qualificacao:
    "Registra UM campo de qualificação que o lead revelou espontaneamente (modality, region, budgetCents, propertyType, purchaseHorizon, motivation, creditStatus ou chainedOperation). Uma chamada por campo — nunca invente valor para campo que o lead não mencionou.",
  escalar_para_humano:
    "Transfere a conversa para um atendente humano. Use quando o lead pedir explicitamente por um humano, ou quando o pedido dele for algo que só um humano resolve. Sempre informe o motivo.",
  consultar_documentos:
    "Consulta as políticas, regulamentos e materiais de apoio desta imobiliária e devolve o conteúdo dos documentos. Use quando precisar de uma informação do negócio para responder ao lead — não chame em todo turno. A pergunta do lead e a modalidade são enviadas automaticamente pelo fluxo; não há parâmetro a preencher.",
  buscar_imoveis:
    "Consulta o inventário real de imóveis disponíveis desta imobiliária pelos critérios que o lead informar. Todos os parâmetros são opcionais — inclua só os que o lead efetivamente mencionou. Preço em reais (nunca centavos). Omitir filtros desconhecidos: não enviar strings vazias ou números zero como preenchimento. Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada quando confirmada pelo lead; não inferir de imóvel apresentado. Bairro aceita um nome de bairro real, nunca expressões de proximidade. Para consultar alternativas sem um bairro específico, omita bairro. A tool não calcula distância ou adjacência. Uma falha técnica não é resultado vazio; não invente ausência de imóveis.",
  responder_lead:
    "ÚNICA forma de enviar mensagem ao lead. Toda resposta sua passa por aqui, mesmo que seja só uma reação — no máximo 3 vezes por turno.",
  agendar_reuniao:
    "Confirma um horário de reunião com o corretor. Só chame na fase de agendamento, com um horário específico (proposto pelo lead ou por você, dentro do horário comercial informado no system message).",
};

const webhookTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.1,
  config: {
    name: "Webhook: rodar faixa",
    position: [0, 300],
    parameters: { httpMethod: "POST", path: "crivo-benchmark-contexto", responseMode: "lastNode" },
  },
  output: [{ body: { faixaBytes: 64000, modalidade: "ambos", observacoes: 1, seed: 1 } }],
});

const getSettings = node({
  type: "n8n-nodes-base.httpRequest",
  version: 4.2,
  config: {
    name: "HTTP: GET /settings",
    position: [240, 300],
    parameters: {
      method: "GET",
      url: `${CRM_BASE_URL}/settings`,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: BENCHMARK_TENANT_SLUG }] },
    },
    credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") },
  },
  output: [{ realEstateName: "Imobiliária A", agentName: "Ana" }],
});

// Mesmo system message do agente: mesmos módulos, mesma ordem de inline que
// `Code: montar system message e marcar campo perguntado` em `principal.ts`.
// Fase `qualificando` com um campo já perguntado e fora do primeiro turno: o
// estado típico de uma conversa que chega a perguntar sobre regras.
const buildBand = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: gerar faixa",
    position: [480, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(business-hours.mjs)__' +
        "\n" +
        '__INLINE(phase.mjs)__' +
        "\n" +
        '__INLINE(system-message.mjs)__' +
        "\n" +
        '__INLINE(benchmark-corpus.mjs)__' +
        "\n\n" +
        "const input = $('Webhook: rodar faixa').first().json.body || {};\n" +
        "const faixaBytes = Math.max(0, Math.floor(Number(input.faixaBytes) || 0));\n" +
        "const modalidade = ['novo', 'usado', 'ambos'].includes(input.modalidade) ? input.modalidade : 'ambos';\n" +
        "const observacoes = Number(input.observacoes) === 2 ? 2 : 1;\n" +
        "const seed = Math.max(1, Math.floor(Number(input.seed) || 1));\n" +
        "const settings = $('HTTP: GET /settings').first().json;\n" +
        "const perguntados = ['modality'];\n" +
        "const phase = resolveConversationPhase(perguntados);\n" +
        "const businessHours = resolveBusinessHours(settings);\n" +
        "const systemMessage = buildSystemMessage({ settings, phase, perguntados, businessHours, now: new Date().toISOString(), meetingAt: null, firstTurn: false });\n" +
        "const corpus = buildBenchmarkCorpus({ targetBytes: faixaBytes, modality: modalidade, seed });\n" +
        "const history = buildBenchmarkHistory(50, seed);\n" +
        "const observation = Array.from({ length: observacoes }, () => corpus.envelope).join('\\n');\n" +
        "return [{ json: {\n" +
        "  faixaBytes, modalidade, observacoes, seed,\n" +
        "  envelopeBytes: corpus.envelopeBytes,\n" +
        "  observationBytes: Buffer.byteLength(observation, 'utf8'),\n" +
        "  documentCount: corpus.documents.length,\n" +
        "  facts: corpus.facts.map((f) => ({ position: f.position, value: f.value })),\n" +
        "  question: buildBenchmarkQuestion(corpus.facts),\n" +
        "  systemMessage, history, observation,\n" +
        "  sessionKey: 'benchmark:' + $execution.id,\n" +
        "} }];\n",
    },
  },
  output: [{ question: "?", systemMessage: "...", history: [], observation: "{}", sessionKey: "benchmark:1" }],
});

// Memória isolada por execução, fora do Postgres das conversas reais.
const benchmarkMemory = memory({
  type: "@n8n/n8n-nodes-langchain.memoryBufferWindow",
  version: 1.4,
  config: {
    name: "Memória do benchmark",
    position: [720, 520],
    parameters: {
      sessionIdType: "customKey",
      sessionKey: expr("{{ $('Code: gerar faixa').first().json.sessionKey }}"),
      contextWindowLength: 50,
    },
  },
});

const seedHistory = node({
  type: "@n8n/n8n-nodes-langchain.memoryManager",
  version: 1.1,
  config: {
    name: "Memória: semear histórico",
    position: [720, 300],
    parameters: {
      mode: "insert",
      insertMode: "override",
      messages: {
        // 50 entradas explícitas: o parser do MCP do n8n proíbe `Array` e
        // declaração de função, então o histórico não pode ser gerado em laço.
        messageValues: [
          { type: expr("{{ $('Code: gerar faixa').first().json.history[0].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[0].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[1].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[1].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[2].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[2].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[3].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[3].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[4].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[4].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[5].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[5].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[6].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[6].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[7].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[7].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[8].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[8].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[9].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[9].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[10].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[10].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[11].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[11].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[12].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[12].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[13].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[13].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[14].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[14].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[15].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[15].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[16].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[16].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[17].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[17].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[18].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[18].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[19].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[19].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[20].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[20].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[21].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[21].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[22].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[22].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[23].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[23].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[24].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[24].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[25].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[25].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[26].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[26].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[27].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[27].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[28].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[28].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[29].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[29].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[30].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[30].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[31].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[31].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[32].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[32].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[33].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[33].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[34].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[34].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[35].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[35].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[36].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[36].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[37].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[37].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[38].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[38].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[39].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[39].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[40].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[40].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[41].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[41].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[42].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[42].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[43].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[43].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[44].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[44].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[45].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[45].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[46].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[46].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[47].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[47].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[48].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[48].message }}") },
          { type: expr("{{ $('Code: gerar faixa').first().json.history[49].type }}"), message: expr("{{ $('Code: gerar faixa').first().json.history[49].message }}") },
        ],
      },
    },
    subnodes: { memory: benchmarkMemory },
  },
  output: [{}],
});

// Mesmo nó de modelo de `principal.ts` (lote-10, AD-026).
const benchmarkModel = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  version: 1.3,
  config: {
    name: "OpenAI Chat Model",
    position: [960, 520],
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

// Stubs declarados um a um, com o schema como texto: o parser do MCP do n8n
// proíbe declaração de função e chamadas como JSON.stringify no código SDK.
const registrarQualificacaoTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolCode",
  version: 1.3,
  config: {
    name: "registrar_qualificacao",
    position: [1100, 700],
    parameters: {
      description: DESCRIPTIONS.registrar_qualificacao,
      language: "javaScript",
      jsCode: "return JSON.stringify({ ok: true });",
      specifyInputSchema: true,
      schemaType: "manual",
      inputSchema: "{\"type\": \"object\", \"properties\": {\"campo\": {\"type\": \"string\", \"description\": \"Nome do campo de qualificacao a registrar: modality, region, budgetCents, propertyType, purchaseHorizon, motivation, creditStatus ou chainedOperation. Um campo por chamada.\"}, \"valor\": {\"type\": \"string\", \"description\": \"Valor a gravar nesse campo, como texto. Para chainedOperation use literalmente \\\"true\\\" ou \\\"false\\\".\"}}, \"required\": [\"campo\", \"valor\"]}",
    },
  },
});

const escalarParaHumanoTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolCode",
  version: 1.3,
  config: {
    name: "escalar_para_humano",
    position: [1200, 700],
    parameters: {
      description: DESCRIPTIONS.escalar_para_humano,
      language: "javaScript",
      jsCode: "return JSON.stringify({ ok: true });",
      specifyInputSchema: true,
      schemaType: "manual",
      inputSchema: "{\"type\": \"object\", \"properties\": {\"motivo\": {\"type\": \"string\", \"description\": \"Motivo pelo qual a conversa esta sendo escalada para um humano\"}}, \"required\": [\"motivo\"]}",
    },
  },
});

const consultarDocumentosTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolCode",
  version: 1.3,
  config: {
    name: "consultar_documentos",
    position: [1300, 700],
    parameters: {
      description: DESCRIPTIONS.consultar_documentos,
      language: "javaScript",
      jsCode: "return $('Code: gerar faixa').first().json.observation;",
    },
  },
});

const buscarImoveisTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolCode",
  version: 1.3,
  config: {
    name: "buscar_imoveis",
    position: [1400, 700],
    parameters: {
      description: DESCRIPTIONS.buscar_imoveis,
      language: "javaScript",
      jsCode: "return JSON.stringify({ data: [], total: 0 });",
      specifyInputSchema: true,
      schemaType: "manual",
      inputSchema: "{\"type\": \"object\", \"properties\": {\"modalidade\": {\"type\": \"string\", \"description\": \"Modalidade do imóvel: novo, usado ou ambos. Só inclua se o lead mencionou. Se desconhecido, omita; não enviar string vazia.\"}, \"tipo\": {\"type\": \"string\", \"description\": \"Tipo do imóvel: casa, apartamento, sobrado, cobertura, terreno, sala_comercial ou chacara. Só inclua se o lead mencionou. Se desconhecido, omita; não enviar string vazia.\"}, \"bairro\": {\"type\": \"string\", \"description\": \"Nome real do bairro que o lead procura. Só inclua se o lead mencionou. Nunca usar próximo, arredores ou bairros próximos como nome. Na busca alternativa sem bairro específico, omita bairro. Se desconhecido, omita; não enviar string vazia.\"}, \"cidade\": {\"type\": \"string\", \"description\": \"Nome da cidade confirmada pelo lead, sem /UF. Não inferir de imóvel apresentado. Se desconhecido, omita; não enviar string vazia.\"}, \"precoMin\": {\"type\": \"number\", \"description\": \"Preço mínimo em reais, inteiro maior que zero. Só inclua se o lead deu um valor mínimo. Se desconhecido, omita; não enviar zero.\"}, \"precoMax\": {\"type\": \"number\", \"description\": \"Preço máximo em reais, inteiro maior que zero. Só inclua se o lead deu um valor máximo. Se desconhecido, omita; não enviar zero.\"}, \"quartosMin\": {\"type\": \"number\", \"description\": \"Número mínimo de quartos/dormitórios, inteiro maior que zero. Só inclua se o lead mencionou. Se desconhecido, omita; não enviar zero.\"}}}",
    },
  },
});

const responderLeadTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolCode",
  version: 1.3,
  config: {
    name: "responder_lead",
    position: [1500, 700],
    parameters: {
      description: DESCRIPTIONS.responder_lead,
      language: "javaScript",
      jsCode: "return JSON.stringify({ enviado: true });",
      specifyInputSchema: true,
      schemaType: "manual",
      inputSchema: "{\"type\": \"object\", \"properties\": {\"mensagem\": {\"type\": \"string\", \"description\": \"A mensagem a enviar ao lead agora, em pt-BR, sem emoji, sem abrir com interjeição de aprovação isolada\"}}, \"required\": [\"mensagem\"]}",
    },
  },
});

const agendarReuniaoTool = tool({
  type: "@n8n/n8n-nodes-langchain.toolCode",
  version: 1.3,
  config: {
    name: "agendar_reuniao",
    position: [1600, 700],
    parameters: {
      description: DESCRIPTIONS.agendar_reuniao,
      language: "javaScript",
      jsCode: "return JSON.stringify({ ok: true });",
      specifyInputSchema: true,
      schemaType: "manual",
      inputSchema: "{\"type\": \"object\", \"properties\": {\"meetingAtProposto\": {\"type\": \"string\", \"description\": \"Horário da reunião proposto, ISO-8601 com timezone, ex: 2026-08-17T13:00:00-03:00\"}}, \"required\": [\"meetingAtProposto\"]}",
    },
  },
});
const tools = [registrarQualificacaoTool, escalarParaHumanoTool, consultarDocumentosTool, buscarImoveisTool, responderLeadTool, agendarReuniaoTool];

const benchmarkAgent = node({
  type: "@n8n/n8n-nodes-langchain.agent",
  version: 3.1,
  config: {
    name: "AI Agent",
    position: [960, 300],
    parameters: {
      promptType: "define",
      text: expr("{{ $('Code: gerar faixa').first().json.question }}"),
      hasOutputParser: false,
      options: {
        systemMessage: expr("{{ $('Code: gerar faixa').first().json.systemMessage }}"),
        maxIterations: 8,
        returnIntermediateSteps: true,
      },
    },
    subnodes: { model: benchmarkModel, memory: benchmarkMemory, tools },
  },
  output: [{ output: "", intermediateSteps: [] }],
});

// A resposta ao lead sai por `responder_lead`, como em produção: a pontuação
// lê as mensagens passadas a essa tool, e só usa a saída final se não houver.
// A saída leva métricas e as mensagens (curtas, sintéticas); nunca o corpus.
const scoreBand = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: pontuar faixa",
    position: [1200, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        '__INLINE(benchmark-score.mjs)__' +
        "\n\n" +
        "const band = $('Code: gerar faixa').first().json;\n" +
        "const agent = $json;\n" +
        "const steps = Array.isArray(agent.intermediateSteps) ? agent.intermediateSteps : [];\n" +
        "const calls = steps.map((s) => s && s.action && s.action.tool).filter(Boolean);\n" +
        "const mensagens = steps\n" +
        "  .filter((s) => s && s.action && s.action.tool === 'responder_lead')\n" +
        "  .map((s) => { const i = s.action.toolInput; return typeof i === 'string' ? i : (i && i.mensagem) || ''; });\n" +
        "const resposta = mensagens.length ? mensagens.join('\\n') : String(agent.output || '');\n" +
        "const score = scoreBenchmarkAnswer(resposta, band.facts);\n" +
        "return [{ json: {\n" +
        "  faixaBytes: band.faixaBytes, modalidade: band.modalidade, observacoes: band.observacoes, seed: band.seed,\n" +
        "  envelopeBytes: band.envelopeBytes, observationBytes: band.observationBytes, documentCount: band.documentCount,\n" +
        "  consultouDocumentos: calls.includes('consultar_documentos'),\n" +
        "  chamadas: calls,\n" +
        "  fatosEncontrados: score.found, fatosPerdidos: score.missing,\n" +
        "  aprovado: score.missing.length === 0 && calls.includes('consultar_documentos'),\n" +
        "  resposta,\n" +
        "} }];\n",
    },
  },
  output: [{ aprovado: true }],
});

export default workflow("crivo-benchmark-contexto", "crivo-benchmark-contexto")
  .add(webhookTrigger)
  .to(getSettings)
  .to(buildBand)
  .to(seedHistory)
  .to(benchmarkAgent)
  .to(scoreBand);
