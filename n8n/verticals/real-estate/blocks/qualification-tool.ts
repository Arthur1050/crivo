// Tools nativas (design.md — "Por que 3 tools nativas e 2 sub-workflows"):
// a barreira já é server-side no CRM. `leadId` das 3 SEMPRE vem de
// expressão do fluxo ('Code: gate'), NUNCA de $fromAI (design.md — Risks &
// Concerns: leadId vindo do modelo permitiria escrita cross-lead).
//
// `registrar_qualificacao` — padrão {campo, valor} de UM campo por chamada,
// não um objeto com os 8 campos como parâmetros fromAI independentes.
// Achado real (não hipótese — execução MCP nesta sessão, workflow scratch
// `__VALUE(archivedQualificationWorkflowId)__`, arquivado): com os 8 campos expostos como parâmetros
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
        parameters: [{ name: "X-Krivo-Tenant", value: expr("{{ $('Code: gate').first().json.tenantSlug }}") }],
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
    credentials: { httpHeaderAuth: newCredential("Krivo - chave de servico") },
  },
  output: [{}],
});

