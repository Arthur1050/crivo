/**
 * crivo-agente-erros — Error Trigger -> Gmail (design.md — Error Handling
 * Strategy; padrão espelhado do workflow existente na instância
 * "tosta.log — Workflow de erro", confirmado via MCP
 * `search_workflows`/`get_workflow_details` no T9: Error Trigger -> ação de
 * recuperação especifica do outro produto -> Gmail send). Não depende de
 * `n8n/src/` (nenhum marcador `__INLINE(...)__` — é só orquestração de
 * nós nativos), então já nasce completo aqui; T11 só publica via MCP e liga
 * `crivo-agente-principal`/`crivo-agente-scheduler` a ele
 * (`settings.errorWorkflow`).
 */
import { workflow, trigger, node, newCredential } from "@n8n/workflow-sdk";

const pipelineFailed = trigger({
  type: "n8n-nodes-base.errorTrigger",
  version: 1,
  config: {
    name: "Falha em crivo-agente-*",
    position: [0, 0],
  },
  output: [
    {
      execution: {
        id: "12345",
        error: { message: "Exemplo de erro" },
        lastNodeExecuted: "HTTP Request",
        url: "https://n8n.example.com/workflow/abc/executions/12345",
      },
      workflow: { id: "abc", name: "crivo-agente-principal" },
    },
  ],
});

const notifyByEmail = node({
  type: "n8n-nodes-base.gmail",
  version: 2.2,
  config: {
    name: "Avisar erro por e-mail",
    position: [260, 0],
    parameters: {
      resource: "message",
      operation: "send",
      sendTo: "tostamatias@gmail.com",
      subject: "={{ '[crivo] Falha em ' + (($json.workflow && $json.workflow.name) || 'workflow do agente') }}",
      emailType: "text",
      message:
        "={{ [ 'Uma execução do agente crivo falhou.', '', 'Workflow: ' + (($json.workflow && $json.workflow.name) || '-'), 'Execução: ' + (($json.execution && $json.execution.id) || '-'), 'Último nó executado: ' + (($json.execution && $json.execution.lastNodeExecuted) || '-'), '', 'Mensagem:', (($json.execution && $json.execution.error && $json.execution.error.message) || 'sem mensagem'), '', 'Abrir execução:', (($json.execution && $json.execution.url) || '-') ].join('\\n') }}",
      options: {},
    },
    credentials: {
      // Credencial Gmail já existente na instância (list_credentials, T9) —
      // id copiado exatamente, nunca inventado (regra do SDK).
      gmailOAuth2: newCredential("Gmail account"),
    },
  },
  output: [{ id: "18abc", threadId: "18abc" }],
});

export default workflow("crivo-agente-erros", "crivo-agente-erros")
  .add(pipelineFailed)
  .to(notifyByEmail);
