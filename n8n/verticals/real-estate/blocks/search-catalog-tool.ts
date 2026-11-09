// `buscar_imoveis` (lote-11 — BUSCA-04): consulta o inventário real de
// imóveis. Todo critério é um parâmetro de query próprio e opcional
// (`$fromAI`) — BUSCA-04 AC4, um parâmetro por critério, nunca um blob único.
// `X-Krivo-Tenant` vem de `Code: gate` por expressão do fluxo, igual às
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
        "Consulta o inventário real de imóveis disponíveis desta imobiliária pelos critérios que o lead informar. Todos os parâmetros são opcionais — inclua só os que o lead efetivamente mencionou. Preço em reais (nunca centavos). Omitir filtros desconhecidos: não enviar strings vazias ou números zero como preenchimento. Cidade é apenas o nome da cidade, sem /UF, e só deve ser filtrada quando confirmada pelo lead; não inferir de imóvel apresentado. Bairro aceita um nome de bairro real, nunca expressões de proximidade. Para consultar alternativas sem um bairro específico, omita bairro. A tool não calcula distância ou adjacência. Uma falha técnica não é resultado vazio; não invente ausência de imóveis.",
      method: "GET",
      url: `${CRM_BASE_URL}/properties`,
      sendQuery: true,
      queryParameters: {
        parameters: [
          { name: "modalidade", value: fromAi("modalidade", "Modalidade do imóvel: novo, usado ou ambos. Só inclua se o lead mencionou. Se desconhecido, omita; não enviar string vazia.", "string") },
          { name: "tipo", value: fromAi("tipo", "Tipo do imóvel: casa, apartamento, sobrado, cobertura, terreno, sala_comercial ou chacara. Só inclua se o lead mencionou. Se desconhecido, omita; não enviar string vazia.", "string") },
          { name: "bairro", value: fromAi("bairro", "Nome real do bairro que o lead procura. Só inclua se o lead mencionou. Nunca usar próximo, arredores ou bairros próximos como nome. Na busca alternativa sem bairro específico, omita bairro. Se desconhecido, omita; não enviar string vazia.", "string") },
          { name: "cidade", value: fromAi("cidade", "Nome da cidade confirmada pelo lead, sem /UF. Não inferir de imóvel apresentado. Se desconhecido, omita; não enviar string vazia.", "string") },
          { name: "precoMin", value: fromAi("precoMin", "Preço mínimo em reais, inteiro maior que zero. Só inclua se o lead deu um valor mínimo. Se desconhecido, omita; não enviar zero.", "number") },
          { name: "precoMax", value: fromAi("precoMax", "Preço máximo em reais, inteiro maior que zero. Só inclua se o lead deu um valor máximo. Se desconhecido, omita; não enviar zero.", "number") },
          { name: "quartosMin", value: fromAi("quartosMin", "Número mínimo de quartos/dormitórios, inteiro maior que zero. Só inclua se o lead mencionou. Se desconhecido, omita; não enviar zero.", "number") },
        ],
      },
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [{ name: "X-Krivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }],
      },
      options: { response: { response: { neverError: true } } },
    },
    credentials: { httpHeaderAuth: newCredential("Krivo - chave de servico") },
  },
  output: [{}],
});

