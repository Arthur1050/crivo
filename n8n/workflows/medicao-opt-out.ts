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
        '__INLINE(opt-out-intent.mjs)__' +
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

// A saída falsa da trava tem marcador e entrada de Merge próprios: se
// dividisse `Code: marcar ambigua` com a saída 1 do classificador, o nó rodaria
// uma vez por predecessor e o Merge poderia disparar de novo com um relatório
// parcial. A categoria gravada é a mesma (`ambigua`).
const markAmbiguaTrava = node({
  type: "n8n-nodes-base.code",
  version: 2,
  config: {
    name: "Code: marcar ambigua (trava)",
    position: [1000, 700],
    parameters: {
      mode: "runOnceForAllItems",
      language: "javaScript",
      jsCode: "return $input.all().map((item) => ({ json: { id: item.json.id, faixa: item.json.faixa, repeticao: item.json.repeticao, categoria: 'ambigua' } }));\n",
    },
  },
  output: [{ id: "fora-08", faixa: "fora", repeticao: 1, categoria: "ambigua" }],
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
        '__INLINE(opt-out-intent.mjs)__' +
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
    parameters: { mode: "append", numberInputs: 6 },
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
        '__INLINE(opt-out-score.mjs)__' +
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
  .to(confirmExplicitOptOut.to(isExplicitOptOutIf.onTrue(markExplicita.to(mergeRuns.input(2))).onFalse(markAmbiguaTrava.to(mergeRuns.input(5)))));
optOutClassifier.output(3).to(markOther.to(mergeRuns.input(3)));
optOutClassifier.output(4).to(markErro.to(mergeRuns.input(4)));
mergeRuns.to(scoreRuns);

export default workflow("crivo-medicao-opt-out", "crivo-medicao-opt-out")
  .add(webhookTrigger)
  .to(expandCorpus)
  .to(optOutClassifier);
