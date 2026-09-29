/**
 * crivo-medicao-opt-out — mede o falso positivo do classificador de opt-out
 * antes de ele ir para o agente (lote-13 — T9, OPTMED-01; design.md
 * "Workflow de medição").
 *
 * Roda SÓ o classificador: o mesmo `Classificador: opt-out` e o mesmo
 * `OpenAI Chat Model (classificador)` de `principal.ts`, com os parâmetros
 * congelados na T2 escritos por extenso nos dois arquivos. O parser do MCP
 * não aceita import além do SDK, então a paridade não vem de uma constante
 * compartilhada: vem do teste de identidade
 * (`classifierIdentity(principal) === classifierIdentity(medicao)`,
 * `principal-classificador.test.ts`). Mudou um lado, muda o outro, e a
 * medição aprovada deixa de valer.
 *
 * Entrada (decidida aqui, para a T12): POST no webhook com o corpo
 *   { corpus: <conteúdo de n8n/fixtures/opt-out-corpus.json>, repeticoes?: 3 }
 * O corpus viaja no corpo, não fica embutido no workflow: a execução mede
 * exatamente o arquivo versionado que o teste estrutural confere, e a T12
 * pode dividir o corpus em lotes (por faixa, por exemplo) se o limite de
 * tokens por minuto da OpenAI apertar, sem republicar nada.
 *
 * Saída (resposta do webhook, `responseMode: lastNode`): o relatório de
 * `scoreMeasurement` (`porFrase`, `porFaixa`, `falsosPositivos`,
 * `taxaExplicita`, `veredito`) mais `repeticoes`, `execucoes` (itens
 * classificados) e `categorias` (contagem bruta por saída, inclusive `other`
 * e `erro`). `classifierHash`, `modelId`, `date` e `workflowVersion` são
 * carimbados depois (`scripts/opt-out-measurement.ts stamp`).
 *
 * Cuidados para a T12:
 * - Cada item do corpus vira 3 chamadas ao modelo (~190 no corpus inteiro,
 *   ~750 tokens cada). O classificador processa 5 itens em paralelo por
 *   padrão, e o limite de 200 mil tokens por minuto é da organização,
 *   compartilhado com o agente em produção (AD-031). O `batching` do nó não
 *   foi usado porque entra nas `options`, que fazem parte da identidade.
 * - Cada saída vazia do classificador não executa o seu marcador; o Merge
 *   (append, 5 entradas) depende da ordem de execução v1 do n8n para seguir
 *   com as entradas que receberam itens. Confirmar na primeira execução real.
 * - Os marcadores escrevem a categoria literal: `$node.name` falhou na T2
 *   com "Referenced node doesn't exist".
 *
 * Nenhum CRM, WhatsApp ou memória é tocado. Fonte versionada (AD-014); o
 * publicável é `n8n/generated/medicao-opt-out.ts`.
 */
import { workflow, node, trigger, merge, ifElse, languageModel, newCredential, expr } from "@n8n/workflow-sdk";

const webhookTrigger = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.1,
  config: {
    name: "Webhook: rodar medição",
    position: [0, 300],
    parameters: { httpMethod: "POST", path: "crivo-medicao-opt-out", responseMode: "lastNode" },
  },
  output: [{ body: { corpus: { abertura: "Oi! Aqui é da imobiliária.", itens: [{ id: "exp-01", faixa: "explicita", texto: "não me mande mais mensagens" }] }, repeticoes: 3 } }],
});

// Mesma entrada que `Code: entrada do classificador` monta no agente:
// `buildClassifierInput` com a última mensagem do item (ou a abertura fixa)
// e o texto do lead. `userMessage` viaja no item (o classificador repassa o
// JSON) para a trava da saída `explicita` (T12d).
const expandCorpus = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: expandir corpus",
    position: [240, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "/**\n * Opt-out em linguagem natural (lote-13 — design.md, módulo\n * `n8n/src/opt-out-intent.mjs`; spec.md OPTMSG-01, OPTREG-01, OPTAMB-01).\n * Funções puras, sem I/O, sem dependências — rodam dentro de um Code node do\n * n8n. Este arquivo inteiro entra na identidade do classificador\n * (`scripts/opt-out-measurement.ts`): mudar qualquer texto daqui exige nova\n * medição aprovada.\n */\n\n/** Confirmação única dos dois caminhos de opt-out (OPTMSG-01 AC1, AC2). */\nconst OPT_OUT_CONFIRMATION =\n  \"Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!\";\n\n/**\n * Falha do registro por linguagem natural (OPTREG-01 AC7): orienta a palavra\n * exata sem afirmar que as mensagens pararam (AC10).\n */\nconst OPT_OUT_REGISTRATION_FAILED =\n  \"Não consegui registrar seu pedido agora. Para encerrar, responda com a palavra sair, sozinha.\";\n\n/**\n * @param {unknown} value\n * @returns {value is string}\n */\nfunction isNonEmptyText(value) {\n  return typeof value === \"string\" && value.trim() !== \"\";\n}\n\n/**\n * Última mensagem de autoria do agente na sessão corrente.\n *\n * `loaded` é a saída de `Chat Memory Manager: carregar sessão`\n * (`{ messages, messagesCount }`, formato registrado na T1, execução 2598):\n * cada elemento agrupa mensagens consecutivas por autoria; `ai` string é a\n * fala do agente, `ai: []` é uma chamada de tool sem texto (ignorada),\n * `human` é o lead e `tool` é o resultado de tool.\n *\n * `seeded` são os itens de `Code: selecionar mensagens de semeadura`:\n * `{ type: 'user'|'ai', message, nadaParaSemear: false }` ou o sentinela\n * `{ nadaParaSemear: true }`.\n *\n * Precedência: uma carga não vazia É a sessão corrente, e a semeadura é\n * ignorada (mesmo que a carga não tenha fala do agente). A semeadura só vale\n * quando a carga veio vazia. Ausente (undefined/null) conta como vazio.\n * Sessão vazia → `null` (é o caso do \"sim\" depois do corte de 12h).\n *\n * @param {{ loaded?: { messages?: unknown } | null, seeded?: unknown }} input\n * @returns {string | null}\n */\nfunction lastAgentMessage({ loaded, seeded } = {}) {\n  const messages = Array.isArray(loaded?.messages) ? loaded.messages : [];\n  if (messages.length > 0) {\n    for (let i = messages.length - 1; i >= 0; i--) {\n      const ai = messages[i]?.ai;\n      if (isNonEmptyText(ai)) return ai;\n    }\n    return null;\n  }\n\n  const items = Array.isArray(seeded) ? seeded : [];\n  for (let i = items.length - 1; i >= 0; i--) {\n    const item = items[i];\n    if (item?.nadaParaSemear === true) continue;\n    if (item?.type === \"ai\" && isNonEmptyText(item.message)) return item.message;\n  }\n  return null;\n}\n\n/**\n * Texto que o classificador lê (OPTREG-01 AC2: só a mensagem do turno e a\n * última mensagem enviada). `userMessage` aceita o texto pronto ou a lista de\n * textos do buffer do turno, unida por quebra de linha, como o `userMessage`\n * do agente (`principal.ts`, `buffer.map((m) => m.text).join('\\n')`).\n *\n * @param {{ lastAgentMessage?: string | null, userMessage?: string | string[] | null }} input\n * @returns {string}\n */\nfunction buildClassifierInput({ lastAgentMessage, userMessage } = {}) {\n  const last = isNonEmptyText(lastAgentMessage) ? lastAgentMessage : \"(nenhuma)\";\n  const text = Array.isArray(userMessage) ? userMessage.join(\"\\n\") : (userMessage ?? \"\");\n  return `Última mensagem enviada ao lead: ${last}\\nMensagem do lead: ${text}`;\n}\n\n/**\n * Minúsculas, sem acento, espaços colapsados. A lista do buffer vira um texto\n * só, unido por quebra de linha, como em `buildClassifierInput`.\n *\n * @param {string | string[] | null | undefined} userMessage\n * @returns {string}\n */\nfunction normalizeUserMessage(userMessage) {\n  const text = Array.isArray(userMessage) ? userMessage.join(\"\\n\") : (userMessage ?? \"\");\n  return String(text)\n    .toLowerCase()\n    .normalize(\"NFD\")\n    .replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/\\s+/g, \" \")\n    .trim();\n}\n\n/** \"parar/para/pare/parem de [me/nos] mandar|enviar <objeto>\". */\nconst STOP_SENDING_OBJECT = /\\b(?:parar|para|pare|parem) de (?:(?:me|nos) )?(?:mandar|enviar) \\S/;\n\n/** Menção ao contato em si: com qualquer uma delas, o pedido não é só de conteúdo. */\nconst CONTACT_MENTION = /mensag|msg|contat|lista|descadastr|nada|whatsapp/;\n\n/** \"mensagem de voz\" é formato (como áudio), não o contato em si. */\nconst VOICE_MESSAGE = /mensage(?:m|ns) de (?:voz|audio)/g;\n\n/**\n * Pedido para parar de mandar só um conteúdo, formato ou filtro de busca\n * (\"para de mandar casa, eu quero apartamento\"), sem menção ao contato em si.\n * Trava determinística depois do classificador (T12d, decisão D3): a medição\n * v3 deixou falsos positivos aleatórios exatamente nesse formato.\n *\n * @param {string | string[] | null | undefined} userMessage\n * @returns {boolean}\n */\nfunction isContentOnlyStop(userMessage) {\n  const text = normalizeUserMessage(userMessage);\n  if (!STOP_SENDING_OBJECT.test(text)) return false;\n  return !CONTACT_MENTION.test(text.replace(VOICE_MESSAGE, \"\"));\n}\n\n/**\n * Categoria final do turno: `explicita` com pedido só de conteúdo vira\n * `ambigua` (o agente pergunta em vez de descadastrar). Qualquer outra\n * categoria passa inalterada.\n *\n * @param {{ categoria?: string, userMessage?: string | string[] | null }} input\n * @returns {string | undefined}\n */\nfunction refineOptOutCategory({ categoria, userMessage } = {}) {\n  if (categoria === \"explicita\" && isContentOnlyStop(userMessage)) return \"ambigua\";\n  return categoria;\n}" +
        "\n\n" +
        "const body = $('Webhook: rodar medição').first().json.body || {};\n" +
        "const corpus = body.corpus || {};\n" +
        "const itens = Array.isArray(corpus.itens) ? corpus.itens : [];\n" +
        "if (itens.length === 0) {\n" +
        "  throw new Error('Corpo sem corpus.itens: envie { corpus: <conteúdo de n8n/fixtures/opt-out-corpus.json>, repeticoes?: 3 }.');\n" +
        "}\n" +
        "const repeticoes = Math.max(1, Math.floor(Number(body.repeticoes) || 3));\n" +
        "const out = [];\n" +
        "for (const item of itens) {\n" +
        "  const classifierInput = buildClassifierInput({ lastAgentMessage: item.ultimaMensagem ?? corpus.abertura, userMessage: item.texto });\n" +
        "  for (let repeticao = 1; repeticao <= repeticoes; repeticao++) {\n" +
        "    out.push({ json: { id: item.id, faixa: item.faixa, repeticao, repeticoes, classifierInput, userMessage: item.texto } });\n" +
        "  }\n" +
        "}\n" +
        "return out;\n",
    },
  },
  output: [{ id: "exp-01", faixa: "explicita", repeticao: 1, repeticoes: 3, classifierInput: "Última mensagem enviada ao lead: Oi!\nMensagem do lead: não me mande mais mensagens" }],
});

// Parâmetros congelados na T2 (design.md, Tech Decisions). Idênticos aos de
// `principal.ts`, byte a byte; o teste de identidade decide.
const classifierModel = languageModel({
  type: "@n8n/n8n-nodes-langchain.lmChatOpenAi",
  version: 1.3,
  config: {
    name: "OpenAI Chat Model (classificador)",
    position: [480, 520],
    parameters: {
      model: {
        __rl: true,
        mode: "list",
        value: "gpt-5.4-nano-2026-03-17",
        cachedResultName: "gpt-5.4-nano-2026-03-17",
      },
      options: { reasoningEffort: "low", timeout: 20000 },
    },
    credentials: { openAiApi: newCredential("OpenAI account") },
  },
});

const optOutClassifier = node({
  type: "@n8n/n8n-nodes-langchain.textClassifier",
  version: 1.1,
  config: {
    name: "Classificador: opt-out",
    position: [480, 300],
    onError: "continueErrorOutput",
    parameters: {
      inputText: "={{ $json.classifierInput }}",
      categories: {
        categories: [
          {
            category: "fora",
            description:
              'A mensagem não pede para parar de receber mensagens nem para encerrar o contato. Inclui desinteresse num imóvel específico; pedido para parar de mandar só um tipo de conteúdo, formato ou filtro de busca (fotos, áudios, links, um tipo de imóvel, uma região, um número de quartos); usos de "parar" ou "sair" que se referem a outra coisa (o aluguel atual, o apartamento, a enrolação); e resposta negativa, como "não" ou "pode continuar", quando a última mensagem enviada perguntou se o lead quer parar de receber mensagens.',
          },
          {
            category: "ambigua",
            description:
              'Desinteresse geral sem pedido de parar de receber mensagens (por exemplo, "não tenho interesse, obrigado"), ou aviso de número errado ou pessoa errada. Também vale para uma resposta ambígua quando a última mensagem enviada perguntou se o lead quer parar de receber mensagens.',
          },
          {
            category: "explicita",
            description:
              "O lead pede para parar de receber mensagens desta imobiliária como um todo: parar de receber mensagens, não ser mais contatado, sair da lista ou não mandarem mais nada. Também vale para uma resposta afirmativa quando a última mensagem enviada perguntou se ele quer parar de receber mensagens. Não vale quando o que deve parar é só um tipo de conteúdo, formato ou filtro de busca.",
          },
        ],
      },
      options: {
        multiClass: false,
        fallback: "other",
        systemPromptTemplate:
          'Você classifica a mensagem de um lead de imobiliária no WhatsApp quanto a um pedido para parar de receber mensagens. Classifique o texto do usuário em uma destas categorias: {categories}. Use a última mensagem enviada ao lead só para entender respostas curtas, como "sim" ou "não". "Parar de mandar" seguido de um tipo de conteúdo, formato ou filtro de busca é fora; só é explicita quando o lead quer parar de receber as mensagens ou o contato em si. Se a última mensagem enviada perguntou se o lead quer parar de receber mensagens, "sim" é explicita e "não" ou um pedido para continuar é fora. Regra de desempate: na dúvida entre explicita e ambigua, escolha ambigua; na dúvida entre ambigua e fora, escolha fora. Não explique e responda somente o JSON, seguindo as instruções de formato abaixo.',
        enableAutoFixing: true,
      },
    },
    subnodes: { model: classifierModel },
  },
  output: [{ id: "exp-01", faixa: "explicita", repeticao: 1, repeticoes: 3, classifierInput: "..." }],
});

// Um marcador por saída: 0 fora, 1 ambigua, 2 explicita, 3 other, 4 erro.
const markFora = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: marcar fora",
    position: [760, 100],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return $input.all().map((item) => ({ json: { id: item.json.id, faixa: item.json.faixa, repeticao: item.json.repeticao, categoria: 'fora' } }));\n",
    },
  },
  output: [{ id: "fora-01", faixa: "fora", repeticao: 1, categoria: "fora" }],
});

const markAmbigua = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: marcar ambigua",
    position: [760, 200],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return $input.all().map((item) => ({ json: { id: item.json.id, faixa: item.json.faixa, repeticao: item.json.repeticao, categoria: 'ambigua' } }));\n",
    },
  },
  output: [{ id: "amb-01", faixa: "ambigua", repeticao: 1, categoria: "ambigua" }],
});

const markExplicita = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: marcar explicita",
    position: [760, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return $input.all().map((item) => ({ json: { id: item.json.id, faixa: item.json.faixa, repeticao: item.json.repeticao, categoria: 'explicita' } }));\n",
    },
  },
  output: [{ id: "exp-01", faixa: "explicita", repeticao: 1, categoria: "explicita" }],
});

const markOther = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: marcar other",
    position: [760, 400],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return $input.all().map((item) => ({ json: { id: item.json.id, faixa: item.json.faixa, repeticao: item.json.repeticao, categoria: 'other' } }));\n",
    },
  },
  output: [{ id: "fora-01", faixa: "fora", repeticao: 1, categoria: "other" }],
});

const markErro = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: marcar erro",
    position: [760, 500],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return $input.all().map((item) => ({ json: { id: item.json.id, faixa: item.json.faixa, repeticao: item.json.repeticao, categoria: 'erro' } }));\n",
    },
  },
  output: [{ id: "fora-01", faixa: "fora", repeticao: 1, categoria: "erro" }],
});

// Trava determinística da saída `explicita` (T12d, decisão D3), a mesma do
// agente: `refineOptOutCategory` sobre o texto do lead. Pedido só de conteúdo
// ("para de mandar casa") é marcado `ambigua`. Preserva o JSON do item para
// os marcadores.
const confirmExplicitOptOut = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: conferir pedido explícito",
    position: [600, 640],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "/**\n * Opt-out em linguagem natural (lote-13 — design.md, módulo\n * `n8n/src/opt-out-intent.mjs`; spec.md OPTMSG-01, OPTREG-01, OPTAMB-01).\n * Funções puras, sem I/O, sem dependências — rodam dentro de um Code node do\n * n8n. Este arquivo inteiro entra na identidade do classificador\n * (`scripts/opt-out-measurement.ts`): mudar qualquer texto daqui exige nova\n * medição aprovada.\n */\n\n/** Confirmação única dos dois caminhos de opt-out (OPTMSG-01 AC1, AC2). */\nconst OPT_OUT_CONFIRMATION =\n  \"Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!\";\n\n/**\n * Falha do registro por linguagem natural (OPTREG-01 AC7): orienta a palavra\n * exata sem afirmar que as mensagens pararam (AC10).\n */\nconst OPT_OUT_REGISTRATION_FAILED =\n  \"Não consegui registrar seu pedido agora. Para encerrar, responda com a palavra sair, sozinha.\";\n\n/**\n * @param {unknown} value\n * @returns {value is string}\n */\nfunction isNonEmptyText(value) {\n  return typeof value === \"string\" && value.trim() !== \"\";\n}\n\n/**\n * Última mensagem de autoria do agente na sessão corrente.\n *\n * `loaded` é a saída de `Chat Memory Manager: carregar sessão`\n * (`{ messages, messagesCount }`, formato registrado na T1, execução 2598):\n * cada elemento agrupa mensagens consecutivas por autoria; `ai` string é a\n * fala do agente, `ai: []` é uma chamada de tool sem texto (ignorada),\n * `human` é o lead e `tool` é o resultado de tool.\n *\n * `seeded` são os itens de `Code: selecionar mensagens de semeadura`:\n * `{ type: 'user'|'ai', message, nadaParaSemear: false }` ou o sentinela\n * `{ nadaParaSemear: true }`.\n *\n * Precedência: uma carga não vazia É a sessão corrente, e a semeadura é\n * ignorada (mesmo que a carga não tenha fala do agente). A semeadura só vale\n * quando a carga veio vazia. Ausente (undefined/null) conta como vazio.\n * Sessão vazia → `null` (é o caso do \"sim\" depois do corte de 12h).\n *\n * @param {{ loaded?: { messages?: unknown } | null, seeded?: unknown }} input\n * @returns {string | null}\n */\nfunction lastAgentMessage({ loaded, seeded } = {}) {\n  const messages = Array.isArray(loaded?.messages) ? loaded.messages : [];\n  if (messages.length > 0) {\n    for (let i = messages.length - 1; i >= 0; i--) {\n      const ai = messages[i]?.ai;\n      if (isNonEmptyText(ai)) return ai;\n    }\n    return null;\n  }\n\n  const items = Array.isArray(seeded) ? seeded : [];\n  for (let i = items.length - 1; i >= 0; i--) {\n    const item = items[i];\n    if (item?.nadaParaSemear === true) continue;\n    if (item?.type === \"ai\" && isNonEmptyText(item.message)) return item.message;\n  }\n  return null;\n}\n\n/**\n * Texto que o classificador lê (OPTREG-01 AC2: só a mensagem do turno e a\n * última mensagem enviada). `userMessage` aceita o texto pronto ou a lista de\n * textos do buffer do turno, unida por quebra de linha, como o `userMessage`\n * do agente (`principal.ts`, `buffer.map((m) => m.text).join('\\n')`).\n *\n * @param {{ lastAgentMessage?: string | null, userMessage?: string | string[] | null }} input\n * @returns {string}\n */\nfunction buildClassifierInput({ lastAgentMessage, userMessage } = {}) {\n  const last = isNonEmptyText(lastAgentMessage) ? lastAgentMessage : \"(nenhuma)\";\n  const text = Array.isArray(userMessage) ? userMessage.join(\"\\n\") : (userMessage ?? \"\");\n  return `Última mensagem enviada ao lead: ${last}\\nMensagem do lead: ${text}`;\n}\n\n/**\n * Minúsculas, sem acento, espaços colapsados. A lista do buffer vira um texto\n * só, unido por quebra de linha, como em `buildClassifierInput`.\n *\n * @param {string | string[] | null | undefined} userMessage\n * @returns {string}\n */\nfunction normalizeUserMessage(userMessage) {\n  const text = Array.isArray(userMessage) ? userMessage.join(\"\\n\") : (userMessage ?? \"\");\n  return String(text)\n    .toLowerCase()\n    .normalize(\"NFD\")\n    .replace(/[\\u0300-\\u036f]/g, \"\")\n    .replace(/\\s+/g, \" \")\n    .trim();\n}\n\n/** \"parar/para/pare/parem de [me/nos] mandar|enviar <objeto>\". */\nconst STOP_SENDING_OBJECT = /\\b(?:parar|para|pare|parem) de (?:(?:me|nos) )?(?:mandar|enviar) \\S/;\n\n/** Menção ao contato em si: com qualquer uma delas, o pedido não é só de conteúdo. */\nconst CONTACT_MENTION = /mensag|msg|contat|lista|descadastr|nada|whatsapp/;\n\n/** \"mensagem de voz\" é formato (como áudio), não o contato em si. */\nconst VOICE_MESSAGE = /mensage(?:m|ns) de (?:voz|audio)/g;\n\n/**\n * Pedido para parar de mandar só um conteúdo, formato ou filtro de busca\n * (\"para de mandar casa, eu quero apartamento\"), sem menção ao contato em si.\n * Trava determinística depois do classificador (T12d, decisão D3): a medição\n * v3 deixou falsos positivos aleatórios exatamente nesse formato.\n *\n * @param {string | string[] | null | undefined} userMessage\n * @returns {boolean}\n */\nfunction isContentOnlyStop(userMessage) {\n  const text = normalizeUserMessage(userMessage);\n  if (!STOP_SENDING_OBJECT.test(text)) return false;\n  return !CONTACT_MENTION.test(text.replace(VOICE_MESSAGE, \"\"));\n}\n\n/**\n * Categoria final do turno: `explicita` com pedido só de conteúdo vira\n * `ambigua` (o agente pergunta em vez de descadastrar). Qualquer outra\n * categoria passa inalterada.\n *\n * @param {{ categoria?: string, userMessage?: string | string[] | null }} input\n * @returns {string | undefined}\n */\nfunction refineOptOutCategory({ categoria, userMessage } = {}) {\n  if (categoria === \"explicita\" && isContentOnlyStop(userMessage)) return \"ambigua\";\n  return categoria;\n}" +
        "\n\n" +
        "return $input.all().map((item) => {\n" +
        "  const categoria = refineOptOutCategory({ categoria: 'explicita', userMessage: item.json.userMessage });\n" +
        "  return { json: { ...item.json, optOutExplicito: categoria === 'explicita' } };\n" +
        "});\n",
    },
  },
  output: [{ id: "exp-01", faixa: "explicita", repeticao: 1, repeticoes: 3, classifierInput: "...", userMessage: "não me mande mais mensagens", optOutExplicito: true }],
});

const isExplicitOptOutIf = ifElse({
  version: 2.3,
  config: {
    name: "Pedido explícito confirmado?",
    position: [760, 640],
    parameters: {
      conditions: {
        combinator: "and",
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{ leftValue: expr("{{ $json.optOutExplicito }}"), operator: { type: "boolean", operation: "true" }, rightValue: true }],
      },
    },
  },
});

const mergeRuns = merge({
  version: 3.2,
  config: {
    name: "Merge: execuções",
    position: [1000, 300],
    parameters: { mode: "append", numberInputs: 5 },
  },
});

const scoreRuns = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: pontuar",
    position: [1240, 300],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode:
        "/**\n * Pontuação da medição do classificador de opt-out (lote-13 — design.md,\n * módulo `n8n/src/opt-out-score.mjs`; spec.md OPTMED-01 AC5, AC6). Função\n * pura, sem I/O, sem dependências. É inlined só no workflow de medição\n * (`crivo-medicao-opt-out`) e fica FORA da identidade do classificador:\n * mudar a pontuação não muda o que é publicado no agente.\n *\n * Entrada: uma linha por EXECUÇÃO do classificador,\n *   `{ id, faixa, categoria }`\n * - `id`: id da frase no corpus (`n8n/fixtures/opt-out-corpus.json`);\n * - `faixa`: faixa esperada da frase (`explicita` | `ambigua` | `fora`);\n * - `categoria`: saída do classificador (`explicita` | `ambigua` | `fora` |\n *   `other` | `erro`). Qualquer valor diferente de `explicita` e `ambigua`\n *   (inclusive `other` e `erro`) conta como `fora` — nunca como explícita.\n *\n * Saída (`MeasurementReport` do design, parte calculada aqui; `date`,\n * `modelId`, `classifierHash`, `workflowVersion` e `repeticoes` são\n * carimbados por `scripts/opt-out-measurement.ts stamp`):\n *   {\n *     porFrase: { id, faixa, explicita, ambigua, fora }[],  // ordem de 1ª aparição\n *     porFaixa: { explicita|ambigua|fora: { explicita, ambigua, fora, total } },\n *     falsosPositivos,  // execuções de frases ambigua|fora classificadas explicita\n *     taxaExplicita,    // explícitas classificadas explicita / total explícitas (0 se não houver)\n *     veredito,         // \"APROVADO\" | \"REPROVADO\"\n *   }\n *\n * Barra (OPTMED-01 AC6): APROVADO só se `falsosPositivos === 0` E\n * `taxaExplicita >= minExplicitRate`. A fronteira exata aprova (L-023).\n */\n\nconst DEFAULT_MIN_EXPLICIT_RATE = 0.9;\n\nconst FAIXAS = [\"explicita\", \"ambigua\", \"fora\"];\n\n/**\n * @param {unknown} categoria\n * @returns {\"explicita\" | \"ambigua\" | \"fora\"}\n */\nfunction bucketOf(categoria) {\n  return categoria === \"explicita\" || categoria === \"ambigua\" ? categoria : \"fora\";\n}\n\n/**\n * @param {{ id: string, faixa: string, categoria: string }[]} results\n * @param {{ minExplicitRate?: number }} [options]\n */\nfunction scoreMeasurement(results, { minExplicitRate = DEFAULT_MIN_EXPLICIT_RATE } = {}) {\n  /** @type {Map<string, { id: string, faixa: string, explicita: number, ambigua: number, fora: number }>} */\n  const byPhrase = new Map();\n  /** @type {Record<string, { explicita: number, ambigua: number, fora: number, total: number }>} */\n  const porFaixa = {};\n  for (const faixa of FAIXAS) porFaixa[faixa] = { explicita: 0, ambigua: 0, fora: 0, total: 0 };\n\n  for (const { id, faixa, categoria } of results) {\n    const bucket = bucketOf(categoria);\n    if (!byPhrase.has(id)) byPhrase.set(id, { id, faixa, explicita: 0, ambigua: 0, fora: 0 });\n    byPhrase.get(id)[bucket] += 1;\n    if (porFaixa[faixa]) {\n      porFaixa[faixa][bucket] += 1;\n      porFaixa[faixa].total += 1;\n    }\n  }\n\n  const falsosPositivos = porFaixa.ambigua.explicita + porFaixa.fora.explicita;\n  const taxaExplicita = porFaixa.explicita.total === 0 ? 0 : porFaixa.explicita.explicita / porFaixa.explicita.total;\n  const veredito = falsosPositivos === 0 && taxaExplicita >= minExplicitRate ? \"APROVADO\" : \"REPROVADO\";\n\n  return { porFrase: [...byPhrase.values()], porFaixa, falsosPositivos, taxaExplicita, veredito };\n}" +
        "\n\n" +
        "const results = $input.all().map((item) => item.json).filter((r) => r && typeof r.id === 'string');\n" +
        "const report = scoreMeasurement(results);\n" +
        "const categorias = {};\n" +
        "for (const r of results) categorias[r.categoria] = (categorias[r.categoria] || 0) + 1;\n" +
        "const repeticoes = $('Code: expandir corpus').first().json.repeticoes;\n" +
        "return [{ json: { ...report, repeticoes, execucoes: results.length, categorias } }];\n",
    },
  },
  output: [{ veredito: "APROVADO", falsosPositivos: 0, taxaExplicita: 1, repeticoes: 3, execucoes: 3, categorias: { explicita: 3 } }],
});

// Saída de erro pelo índice 4, nunca por `.onError()`: o SDK liga
// `.onError()` à saída 1, que no classificador é `ambigua` (achado da T2).
// A saída 2 passa pela trava (T12d): verdadeiro marca `explicita`, falso marca
// `ambigua` (que já segue para a entrada 1 do Merge).
optOutClassifier.output(0).to(markFora.to(mergeRuns.input(0)));
optOutClassifier.output(1).to(markAmbigua.to(mergeRuns.input(1)));
optOutClassifier
  .output(2)
  .to(confirmExplicitOptOut.to(isExplicitOptOutIf.onTrue(markExplicita.to(mergeRuns.input(2))).onFalse(markAmbigua)));
optOutClassifier.output(3).to(markOther.to(mergeRuns.input(3)));
optOutClassifier.output(4).to(markErro.to(mergeRuns.input(4)));
mergeRuns.to(scoreRuns);

export default workflow("crivo-medicao-opt-out", "crivo-medicao-opt-out")
  .add(webhookTrigger)
  .to(expandCorpus)
  .to(optOutClassifier);
