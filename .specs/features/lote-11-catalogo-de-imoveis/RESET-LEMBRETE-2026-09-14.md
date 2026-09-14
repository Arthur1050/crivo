# Limpeza pontual do lembrete da sessão de teste

Autorização: reset solicitado pelo usuário em 2026-09-14.
Alvo: linha 16 de agenda_envios, tenant triangulo, waId 553499532444,
lead b639766a-f273-4c30-aa39-695226141bed. Quatro condições conjuntas.
O scheduler reconsulta/cria lead pelo waId; deixar o lembrete após apagar o CRM
permitiria enviar o link antigo e recriar a sessão. Remover este resíduo faz parte
do reset. Evento Calendar preservado. Nenhum workflow operacional muda.

Workflow administrativo temporário, somente manual, sem publicação ou envio.
Executar dryRun=true e conferir a linha; depois alterar somente options.dryRun
para false, executar, conferir get sem linhas e arquivar o helper.
Este código registra a operação reproduzível; não cria comportamento de produto.

```ts
import { workflow, node, trigger } from "@n8n/workflow-sdk";
const target = {
  dataTableId: { __rl: true, mode: "list", value: "m83dxX8YZYg1NDYq", cachedResultName: "agenda_envios" },
  matchType: "allConditions",
  filters: { conditions: [
    { keyName: "id", condition: "eq", keyValue: "16" },
    { keyName: "tenantSlug", condition: "eq", keyValue: "triangulo" },
    { keyName: "waId", condition: "eq", keyValue: "553499532444" },
    { keyName: "leadId", condition: "eq", keyValue: "b639766a-f273-4c30-aa39-695226141bed" }
  ] }
};
const start = trigger({type:"n8n-nodes-base.manualTrigger",version:1,config:{name:"Limpar lembrete da sessão de teste",position:[0,0],parameters:{}},output:[{}]});
const remove = node({type:"n8n-nodes-base.dataTable",version:1.1,config:{name:"Apagar somente lembrete 16 do smoke",position:[260,0],parameters:{resource:"row",operation:"deleteRows",...target,options:{dryRun:true}}},output:[{id:16}]});
const check = node({type:"n8n-nodes-base.dataTable",version:1.1,config:{name:"Conferir ausência do lembrete 16",position:[520,0],parameters:{resource:"row",operation:"get",...target,returnAll:true}},output:[]});
export default workflow("reset-lembrete-smoke-2026-09-14","reset-lembrete-smoke-2026-09-14").add(start).to(remove.to(check));
```
