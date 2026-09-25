/**
 * crivo-smoke-memoria — confere, sem ler conteúdo, se a memória persistente do
 * agente guardou a observação integral de `consultar_documentos` (lote-12 —
 * T35, DOCPROVA-01: "Memória persistente não contém observação integral da
 * tool").
 *
 * A tool devolve o corpus inteiro da imobiliária. Se o nó de memória gravasse
 * a observação, cada conversa passaria a carregar o corpus — custo em todo
 * turno e cópia do documento fora do CRM. Esta consulta responde só com
 * contagens e booleanos: nenhuma mensagem, nenhum trecho, nenhum fato sai da
 * execução. As marcas procuradas são as chaves do envelope canônico
 * (`retrievalMode`, `contentMode`), que só existem na observação da tool.
 *
 * SOMENTE LEITURA e ALVO FIXO — a mesma sessão do smoke (`roteiro.md` §1), a
 * mesma chave que `principal.ts` compõe como `sessionKey`. Trocar de alvo é
 * editar a constante e republicar, deliberadamente.
 *
 * Fonte versionada (AD-014). O publicável é `n8n/generated/smoke-memoria.ts`.
 */
import { workflow, node, trigger, newCredential } from "@n8n/workflow-sdk";

const SMOKE_SESSION_KEY = "triangulo:553499532444";

const manualTrigger = trigger({
  type: "n8n-nodes-base.manualTrigger",
  version: 1,
  config: { name: "Conferir memória do smoke", position: [0, 0], parameters: {} },
  output: [{}],
});

const inspectMemory = node({
  type: "n8n-nodes-base.postgres",
  version: 2.7,
  config: {
    name: "Postgres: medir sessão",
    position: [240, 0],
    parameters: {
      operation: "executeQuery",
      query:
        "select count(*)::int as mensagens, " +
        "coalesce(max(length(message::text)), 0)::int as maior_mensagem_chars, " +
        "count(*) filter (where message::text like '%retrievalMode%' or message::text like '%contentMode%')::int as com_envelope_da_tool, " +
        "count(*) filter (where message->>'type' = 'tool')::int as mensagens_do_tipo_tool, " +
        "count(*) filter (where message->>'type' = 'human')::int as humanas, " +
        "count(*) filter (where message->>'type' = 'ai')::int as do_agente " +
        "from n8n_chat_histories where session_id = $1",
      options: { queryReplacement: SMOKE_SESSION_KEY },
    },
    credentials: { postgres: newCredential("Postgres n8n local") },
  },
  output: [{ mensagens: 0, maior_mensagem_chars: 0, com_envelope_da_tool: 0, mensagens_do_tipo_tool: 0 }],
});

export default workflow("crivo-smoke-memoria", "crivo-smoke-memoria")
  .add(manualTrigger)
  .to(inspectMemory);
