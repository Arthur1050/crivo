// `escalar_para_humano` — `status` é constante (nunca vem do modelo); só
// `motivo` (single string field, sem risco de campo cruzado) é fromAI.
// `neverError:true` garante que um 409 (transicao-invalida /
// lead-travado-por-humano, AD-013) chegue ao agente com o `code` intacto
// no corpo — sem isso, `httpRequestTool` lançaria um erro genérico do n8n
// ("Authorization failed"-like summary) que perde o `code`, o canal de
// correção que a Done-when desta task exige.
const escalarParaHumanoTool = tool({
  type: "n8n-nodes-base.httpRequestTool",
  version: 4.5,
  config: {
    name: "escalar_para_humano",
    position: [7560, 700],
    parameters: {
      toolDescription:
        "Transfere a conversa para um atendente humano. Use quando o lead pedir explicitamente por um humano, ou quando o pedido dele for algo que só um humano resolve. Sempre informe o motivo.",
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
        "{{ { status: 'escalado_humano', escalationReason: $fromAI('motivo', 'Motivo pelo qual a conversa esta sendo escalada para um humano', 'string') } }}"
      ),
      options: { response: { response: { neverError: true } } },
      // ACHADO REAL (Fase 5 do lote-10, cenário 2, 2026-09-07 e 2026-09-08):
      // o `PATCH /leads/{id}` devolve o LEAD INTEIRO, e o `name` do topo é o
      // nome do lead. Ao anunciar a passagem para um humano, o modelo leu esse
      // `name` e disse ao lead que ele mesmo iria atendê-lo ("o Arthur T. vai
      // continuar seu atendimento"), ignorando `assignedBroker.name`. Instrução
      // de prompt NÃO resolveu — foi tentada em `16cfbf4` e o erro repetiu na
      // rodada seguinte. Quando a resposta errada é o campo mais óbvio do
      // payload, a correção é na fronteira, não na discrição do modelo
      // (AD-018): os campos que identificam o lead saem da resposta, e o único
      // nome que sobra é o do responsável. `except` (em vez de `selected`)
      // preserva tudo o mais — inclusive o `code` do `problem+json` de um 409,
      // que é o canal de correção que a AD-013 exige.
      optimizeResponse: true,
      responseType: "json",
      fieldsToInclude: "except",
      fields: "name,contactName,phone,externalId",
    },
    credentials: { httpHeaderAuth: newCredential("Krivo - chave de servico") },
  },
  output: [{}],
});

