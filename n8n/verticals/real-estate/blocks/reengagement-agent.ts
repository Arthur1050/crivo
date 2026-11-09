const agent = node({ type: "@n8n/n8n-nodes-langchain.agent", version: 3.1,
  config: { name: "Agente proativo somente leitura", position: [980, 0], onError: "continueRegularOutput", parameters: { promptType: "define", text: expr("{{ $('Code: tarefa proativa').first().json.prompt }}"), hasOutputParser: false,
    options: { systemMessage: expr("{{ $('Code: tarefa proativa').first().json.systemMessage }}"), maxIterations: 8, returnIntermediateSteps: true } }, subnodes: { model, tools: [docs, properties] } }, output: [{ output: "Texto gerado pelo modelo" }] });
