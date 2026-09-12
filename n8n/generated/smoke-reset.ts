/**
 * crivo-smoke-reset — limpeza dos alvos do n8n entre cenários da prova
 * conversacional (`n8n/smoke/roteiro.md` §9, alvos 1 e 2).
 *
 * O checklist de limpeza da AD-027 tem três alvos em dois sistemas. Este
 * workflow cobre os dois que moram no n8n:
 *
 *   1. Sessão de memória em `n8n_chat_histories` (Postgres da própria
 *      instância) — o nó `memoryManager` em `mode: delete` / `deleteMode: all`
 *      apaga as mensagens da sessão apontada pelo subnode de memória, que é
 *      exatamente o mecanismo que `principal.ts` já usa nas purgas por sessão
 *      expirada e por opt-out.
 *   2. Linha de `conversa_estado` na Data Table — `dataTable` v1.1 em
 *      `operation: deleteRows`. O `roteiro.md` §9 registrava que a remoção
 *      dessa linha só era possível pela UI da Data Table; isso vale para a
 *      ferramenta MCP, não para o NÓ dentro de um workflow, que suporta
 *      exclusão por filtro (confirmado em `get_node_types` antes de escrever
 *      este arquivo, nunca suposto).
 *
 * O terceiro alvo (lead + conversa + mensagens no CRM) NÃO sai daqui: sai de
 * `npm run smoke:reset` (`src/db/smoke-reset.ts`). A separação é deliberada —
 * para este workflow alcançar o CRM ele precisaria de uma rota destrutiva no
 * contrato `/api/v1`, que não existe e cuja criação seria uma decisão de
 * produto (uma rota que apaga lead em produção), não conveniência de smoke.
 * Cada sistema limpa o próprio estado.
 *
 * ALVO FIXO, sem parâmetro de entrada: o trigger é manual e os dois nós
 * apontam para o par `triangulo` / `553499532444` do `roteiro.md` §1. Um
 * workflow destrutivo parametrizável pelo chamador poderia, com o argumento
 * errado, apagar a memória de uma conversa real de produção — este é
 * estruturalmente incapaz disso. Trocar de alvo é editar as constantes abaixo
 * e republicar, deliberadamente.
 *
 * Fonte versionada (AD-014: workflow-as-code). Texto de entrada do inliner
 * (`scripts/n8n-inline.mjs`); o publicável é `n8n/generated/smoke-reset.ts`,
 * gerado, nunca editado à mão — e a UI do n8n nunca é editada à mão.
 */
import { workflow, node, trigger, memory, newCredential } from "@n8n/workflow-sdk";

// Alvo do smoke (`n8n/smoke/roteiro.md` §1) — mesmo par que `principal.ts`
// compõe como `sessionKey` (`<tenantSlug>:<waId>`, `principal.ts:679`).
const SMOKE_TENANT_SLUG = "triangulo";
const SMOKE_WA_ID = "553499532444";
const SMOKE_SESSION_KEY = `${SMOKE_TENANT_SLUG}:${SMOKE_WA_ID}`;

// Id real da Data Table `conversa_estado`, o mesmo de `principal.ts:83` —
// copiado, nunca inventado.
const CONVERSA_ESTADO_TABLE_ID = "ZsplBxJjXv3kwKZ8";

const manualTrigger = trigger({
  type: "n8n-nodes-base.manualTrigger",
  version: 1,
  config: {
    name: "Executar limpeza do smoke",
    position: [0, 0],
    parameters: {},
  },
  output: [{}],
});

// `sessionKey` literal (não expressão): o alvo é fixo, então não há nada a
// resolver em runtime. `sessionIdType: customKey` é o mesmo modo que
// `principal.ts` usa — o que muda é só a origem do valor.
const smokeSessionMemory = memory({
  type: "@n8n/n8n-nodes-langchain.memoryPostgresChat",
  version: 1.4,
  config: {
    name: "Postgres Chat Memory (alvo do smoke)",
    position: [260, 200],
    parameters: {
      sessionIdType: "customKey",
      sessionKey: SMOKE_SESSION_KEY,
      contextWindowLength: 50,
    },
    credentials: { postgres: newCredential("Postgres n8n local") },
  },
});

const purgeMemory = node({
  type: "@n8n/n8n-nodes-langchain.memoryManager",
  version: 1.1,
  config: {
    name: "Chat Memory Manager: purgar sessão do smoke",
    position: [260, 0],
    parameters: { mode: "delete", deleteMode: "all" },
    subnodes: { memory: smokeSessionMemory },
  },
  output: [{ success: true }],
});

// `matchType: allConditions` — as duas condições juntas identificam a linha.
// Com `anyCondition` (o default do nó), um `waId` igual em outro tenant
// também seria apagado.
const deleteConversaEstadoRow = node({
  type: "n8n-nodes-base.dataTable",
  version: 1.1,
  config: {
    name: "Data Table: apagar linha de conversa_estado",
    position: [520, 0],
    parameters: {
      resource: "row",
      operation: "deleteRows",
      dataTableId: { __rl: true, mode: "id", value: CONVERSA_ESTADO_TABLE_ID },
      matchType: "allConditions",
      filters: {
        conditions: [
          { keyName: "tenantSlug", condition: "eq", keyValue: SMOKE_TENANT_SLUG },
          { keyName: "waId", condition: "eq", keyValue: SMOKE_WA_ID },
        ],
      },
    },
  },
  output: [{ id: 1 }],
});

export default workflow("crivo-smoke-reset", "crivo-smoke-reset")
  .add(manualTrigger)
  .to(purgeMemory.to(deleteConversaEstadoRow));
