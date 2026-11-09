// `consultar_documentos` — sem nenhum parâmetro `$fromAI`: modalidade e
// pergunta saem do próprio fluxo. O agente decide QUANDO chamar, nunca inventa
// argumento (AD-018).
//
// Desde o lote-12 (T21/T28) a chamada é POST com corpo `{modality, question}`.
// Duas razões: a pergunta do lead é dado pessoal e em query string terminaria
// em log de acesso, histórico e referer; e o contrato passou a aceitar
// `ambos`, que o GET anterior recusava — por isso o fallback deixou de ser
// 'novo', que escondia documentos de usado, e passou a ser o corpus inteiro,
// que é a resposta certa quando a modalidade do lead ainda é desconhecida.
//
// A pergunta é o buffer da vez, o mesmo texto que vira `userMessage` no
// prompt. O corte em 4.096 caracteres e o fallback existem para nunca produzir
// um 400 do contrato: `question` vazia é recusada por definição (DOCCTX-01 AC9).
const consultarDocumentosTool = tool({
  type: "n8n-nodes-base.httpRequestTool",
  version: 4.5,
  config: {
    name: "consultar_documentos",
    position: [7560, 900],
    retryOnFail: true,
    maxTries: 2,
    parameters: {
      toolDescription: "Consulta as políticas, regulamentos e materiais de apoio desta imobiliária e devolve o conteúdo dos documentos. Use quando precisar de uma informação do negócio para responder ao lead — não chame em todo turno. A pergunta do lead e a modalidade são enviadas automaticamente pelo fluxo; não há parâmetro a preencher.",
      method: "POST",
      url: `${CRM_BASE_URL}/context`,
      sendBody: true,
      contentType: "json",
      specifyBody: "json",
      jsonBody: expr(
        "{{ (() => {" +
          "  const ctx = $('Code: gate').first().json;" +
          "  const modality = ['novo', 'usado', 'ambos'].includes(ctx.modality) ? ctx.modality : 'ambos';" +
          "  const buffer = Array.isArray(ctx.bufferArray) ? ctx.bufferArray : [];" +
          "  const texto = buffer.map((m) => m && m.text).filter(Boolean).join(String.fromCharCode(10)).trim();" +
          "  const question = (texto || String(ctx.text || '').trim() || 'Informacoes gerais desta imobiliaria').slice(0, 4096);" +
          "  return { modality, question };" +
          "})() }}"
      ),
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

