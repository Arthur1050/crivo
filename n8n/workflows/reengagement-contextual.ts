import { workflow, node, trigger, languageModel, tool, newCredential, expr } from "@n8n/workflow-sdk";

const CRM_BASE_URL = "__VALUE(crmBaseUrl)__";
const input = trigger({ type: "n8n-nodes-base.executeWorkflowTrigger", version: 1.2,
  config: { name: "Frame verificado", position: [0, 0], parameters: { inputSource: "workflowInputs", workflowInputs: { values: [{ name: "frame", type: "object" }, { name: "tenantSlug", type: "string" }, { name: "deadline", type: "number" }] } } }, output: [{}] });
const identity = node({ type: "n8n-nodes-base.code", version: 2,
  config: { name: "Code: identidade fixa", position: [240, 0], parameters: { mode: "runOnceForEachItem", jsCode:
    "const input = $json; const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;\n" +
    "if (!input.frame || !['tenantId','leadId','episodeId'].every(key => typeof input.frame[key] === 'string' && uuid.test(input.frame[key])) || typeof input.tenantSlug !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(input.tenantSlug)) throw new Error('context-read-failed');\n" +
    "if (input.deadline !== undefined && (typeof input.deadline !== 'number' || !Number.isFinite(input.deadline))) throw new Error('generation-timeout'); const deadline = input.deadline === undefined ? Date.now() + 120000 : Math.min(input.deadline, Date.now() + 120000); if (deadline <= Date.now()) throw new Error('generation-timeout');\n" +
    "return { json: { frame: input.frame, tenantSlug: input.tenantSlug, leadId: input.frame.leadId, episodeId: input.frame.episodeId, deadline } };" } }, output: [{}] });
const remaining = "(() => { const remaining = $('Code: identidade fixa').first().json.deadline - Date.now(); if (remaining <= 0) throw new Error('generation-timeout'); return Math.min(15000, remaining); })()";
const settings = node({ type: "n8n-nodes-base.httpRequest", version: 4.5,
  config: { name: "HTTP: persona do tenant", position: [480, 0], parameters: { method: "GET", url: CRM_BASE_URL + "/settings", authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true,
    headerParameters: { parameters: [{ name: "X-Krivo-Tenant", value: expr("{{ $('Code: identidade fixa').first().json.tenantSlug }}") }] }, options: { timeout: expr("{{ " + remaining + " }}") } }, credentials: { httpHeaderAuth: newCredential("Krivo - chave de servico") } }, output: [{}] });
const prepare = node({ type: "n8n-nodes-base.code", version: 2,
  config: { name: "Code: tarefa proativa", position: [720, 0], parameters: { mode: "runOnceForEachItem", jsCode:
    '__INLINE(phase.mjs)__' + '\n\n' + '__INLINE(__VALUE(sessionModule)__)__' + '\n\n' + '__INLINE(system-message.mjs)__' + '\n\n' + '__INLINE(business-hours.mjs)__' + '\n\n' + '__INLINE(reengagement-prompt.mjs)__' +
    "\n\nconst fixed = $('Code: identidade fixa').first().json; if (Date.now() >= fixed.deadline) throw new Error('generation-timeout');\n" +
    "const built = buildReengagementPrompt({ frame: fixed.frame, settings: $json, businessHours: resolveBusinessHours($json) });\n" +
    "if (!built.ok) throw new Error('context-read-failed');\n" +
    "return { json: { ...fixed, systemMessage: built.systemMessage, prompt: built.prompt, overheadBytes: built.overheadBytes } };" } }, output: [{}] });
// __BLOCK(reengagement-documents-tool)__
// __BLOCK(reengagement-catalog-tool)__
const model = languageModel({ type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", version: 1.3,
  config: { name: "OpenAI Chat Model", position: [920, 440], parameters: { model: { __rl: true, mode: "list", value: "gpt-5.4-nano-2026-03-17", cachedResultName: "gpt-5.4-nano-2026-03-17" }, options: { reasoningEffort: "low", timeout: expr("{{ (() => { const remaining = $('Code: identidade fixa').first().json.deadline - Date.now(); if (remaining <= 0) throw new Error('generation-timeout'); return remaining; })() }}") } }, credentials: { openAiApi: newCredential("OpenAI account") } } });
// __BLOCK(reengagement-agent)__
const finish = node({ type: "n8n-nodes-base.code", version: 2,
  config: { name: "Code: validar texto e leituras", position: [1240, 0], parameters: { mode: "runOnceForEachItem", jsCode:
    '__INLINE(phase.mjs)__' + '\n\n' + '__INLINE(__VALUE(sessionModule)__)__' + '\n\n' + '__INLINE(system-message.mjs)__' + '\n\n' + '__INLINE(reengagement-prompt.mjs)__' +
    "\n\nconst fixed = $('Code: tarefa proativa').first().json; if (Date.now() >= fixed.deadline) return { json: { ok: false, code: 'generation-timeout' } };\n" +
    "if ($json.error) return { json: { ok: false, code: 'generation-failed' } };\n" +
    "const steps = $json.intermediateSteps ?? []; if (!Array.isArray(steps)) return { json: { ok: false, code: 'context-read-failed' } };\n" +
// __BLOCK(reengagement-read-validation)__
    "const text = validateReengagementText($json.output); return { json: text.ok ? { ok: true, text: text.text } : { ok: false, code: 'invalid-text' } };" } }, output: [{}] });

const generationWorkflow = workflow("krivo-reengagement-contextual", "krivo-reengagement-contextual")
  .settings({ executionTimeout: 120, callerPolicy: "workflowsFromSameOwner", saveDataSuccessExecution: "none", saveDataErrorExecution: "none", saveManualExecutions: false, saveExecutionProgress: false })
  .add(input).to(identity).to(settings).to(prepare).to(agent).to(finish);
generationWorkflow.regenerateNodeIds(new Map([
  "Frame verificado", "Code: identidade fixa", "HTTP: persona do tenant", "Code: tarefa proativa",
// __BLOCK(reengagement-tool-node-ids)__
].map((name, index) => [name, `140b0047-0000-4000-8000-${String(index + 1).padStart(12, "0")}`])));
export default generationWorkflow;
