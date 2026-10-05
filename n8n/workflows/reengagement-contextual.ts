import { workflow, node, trigger, languageModel, tool, newCredential, expr } from "@n8n/workflow-sdk";

const CRM_BASE_URL = "https://crivo-arthur1050s-projects.vercel.app/api/v1";
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
    headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: identidade fixa').first().json.tenantSlug }}") }] }, options: { timeout: expr("{{ " + remaining + " }}") } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const prepare = node({ type: "n8n-nodes-base.code", version: 2,
  config: { name: "Code: tarefa proativa", position: [720, 0], parameters: { mode: "runOnceForEachItem", jsCode:
    '__INLINE(phase.mjs)__' + '\n\n' + '__INLINE(session.mjs)__' + '\n\n' + '__INLINE(system-message.mjs)__' + '\n\n' + '__INLINE(business-hours.mjs)__' + '\n\n' + '__INLINE(reengagement-prompt.mjs)__' +
    "\n\nconst fixed = $('Code: identidade fixa').first().json; if (Date.now() >= fixed.deadline) throw new Error('generation-timeout');\n" +
    "const built = buildReengagementPrompt({ frame: fixed.frame, settings: $json, businessHours: resolveBusinessHours($json) });\n" +
    "if (!built.ok) throw new Error('context-read-failed');\n" +
    "return { json: { ...fixed, systemMessage: built.systemMessage, prompt: built.prompt, overheadBytes: built.overheadBytes } };" } }, output: [{}] });
const docs = tool({ type: "n8n-nodes-base.httpRequestTool", version: 4.5,
  config: { name: "consultar_documentos", position: [920, 240], parameters: { toolDescription: "Consulta documentos completos do tenant quando necessários. Identidade, modalidade, pergunta factual e reserva proativa são fixadas pelo fluxo. Uma falha técnica não autoriza inventar informação.", method: "POST", url: CRM_BASE_URL + "/context", sendBody: true, contentType: "json", specifyBody: "json",
    jsonBody: expr("{{ (() => { const fixed = $('Code: tarefa proativa').first().json; const facts = fixed.frame.facts; const question = fixed.frame.history.filter(m => m.sender === 'lead').at(-1)?.content; if (typeof question !== 'string' || !question.trim()) throw new Error('context-read-failed'); return { modality: ['novo','usado','ambos'].includes(facts.modality) ? facts.modality : 'ambos', question: question.trim().slice(0,4096), reservedContextBytes: fixed.overheadBytes }; })() }}"),
    authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: tarefa proativa').first().json.tenantSlug }}") }] }, options: { timeout: expr("{{ " + remaining + " }}"), response: { response: { neverError: false } } } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const properties = tool({ type: "n8n-nodes-base.httpRequestTool", version: 4.5,
  config: { name: "buscar_imoveis", position: [1120, 240], parameters: { toolDescription: "Busca o inventário real somente pelos fatos de modalidade/tipo já confirmados no frame. Não inventa ausência de imóveis após falha técnica.", method: "GET", url: CRM_BASE_URL + "/properties", sendQuery: true,
    specifyQuery: "json", jsonQuery: expr("{{ (() => { const facts = $('Code: tarefa proativa').first().json.frame.facts; return { modalidade: ['novo','usado','ambos'].includes(facts.modality) ? facts.modality : 'ambos', ...(['casa','apartamento'].includes(facts.propertyType) ? { tipo: facts.propertyType } : {}) }; })() }}"),
    authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth", sendHeaders: true, headerParameters: { parameters: [{ name: "X-Crivo-Tenant", value: expr("{{ $('Code: tarefa proativa').first().json.tenantSlug }}") }] }, options: { timeout: expr("{{ " + remaining + " }}"), response: { response: { neverError: false } } } }, credentials: { httpHeaderAuth: newCredential("Crivo - chave de servico") } }, output: [{}] });
const model = languageModel({ type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", version: 1.3,
  config: { name: "OpenAI Chat Model", position: [920, 440], parameters: { model: { __rl: true, mode: "list", value: "gpt-5.4-nano-2026-03-17", cachedResultName: "gpt-5.4-nano-2026-03-17" }, options: { reasoningEffort: "low", timeout: expr("{{ (() => { const remaining = $('Code: identidade fixa').first().json.deadline - Date.now(); if (remaining <= 0) throw new Error('generation-timeout'); return remaining; })() }}") } }, credentials: { openAiApi: newCredential("OpenAI account") } } });
const agent = node({ type: "@n8n/n8n-nodes-langchain.agent", version: 3.1,
  config: { name: "Agente proativo somente leitura", position: [980, 0], onError: "continueRegularOutput", parameters: { promptType: "define", text: expr("{{ $('Code: tarefa proativa').first().json.prompt }}"), hasOutputParser: false,
    options: { systemMessage: expr("{{ $('Code: tarefa proativa').first().json.systemMessage }}"), maxIterations: 8, returnIntermediateSteps: true } }, subnodes: { model, tools: [docs, properties] } }, output: [{ output: "Texto gerado pelo modelo" }] });
const finish = node({ type: "n8n-nodes-base.code", version: 2,
  config: { name: "Code: validar texto e leituras", position: [1240, 0], parameters: { mode: "runOnceForEachItem", jsCode:
    '__INLINE(phase.mjs)__' + '\n\n' + '__INLINE(session.mjs)__' + '\n\n' + '__INLINE(system-message.mjs)__' + '\n\n' + '__INLINE(reengagement-prompt.mjs)__' +
    "\n\nconst fixed = $('Code: tarefa proativa').first().json; if (Date.now() >= fixed.deadline) return { json: { ok: false, code: 'generation-timeout' } };\n" +
    "if ($json.error) return { json: { ok: false, code: 'generation-failed' } };\n" +
    "const steps = $json.intermediateSteps ?? []; if (!Array.isArray(steps)) return { json: { ok: false, code: 'context-read-failed' } };\n" +
    "for (const step of steps) { const name = step?.action?.tool; if (!REENGAGEMENT_READ_ONLY_TOOLS.includes(name)) return { json: { ok: false, code: 'context-read-failed' } }; let observation = step.observation; try { if (typeof observation === 'string') observation = JSON.parse(observation); } catch { return { json: { ok: false, code: 'context-read-failed' } }; } if (Array.isArray(observation) && observation.length === 1) observation = observation[0]; if (observation?.error || observation?.status >= 400 || observation?.statusCode >= 400) return { json: { ok: false, code: 'context-read-failed' } }; observation = observation?.json ?? observation?.body ?? observation; const valid = observation && !observation.error && !(observation.status >= 400) && (name === 'consultar_documentos' ? observation.retrievalMode === 'direct' && Array.isArray(observation.documents) && observation.documents.every(d => d.contentMode === 'full' && typeof d.content === 'string') : Array.isArray(observation.imoveis) && Number.isSafeInteger(observation.total) && observation.total >= 0); if (!valid) return { json: { ok: false, code: 'context-read-failed' } }; }\n" +
    "const text = validateReengagementText($json.output); return { json: text.ok ? { ok: true, text: text.text } : { ok: false, code: 'invalid-text' } };" } }, output: [{}] });

const generationWorkflow = workflow("crivo-reengagement-contextual", "crivo-reengagement-contextual")
  .settings({ executionTimeout: 120, callerPolicy: "workflowsFromSameOwner", saveDataSuccessExecution: "none", saveDataErrorExecution: "none", saveManualExecutions: false, saveExecutionProgress: false })
  .add(input).to(identity).to(settings).to(prepare).to(agent).to(finish);
generationWorkflow.regenerateNodeIds(new Map([
  "Frame verificado", "Code: identidade fixa", "HTTP: persona do tenant", "Code: tarefa proativa",
  "consultar_documentos", "buscar_imoveis", "OpenAI Chat Model", "Agente proativo somente leitura", "Code: validar texto e leituras",
].map((name, index) => [name, `140b0047-0000-4000-8000-${String(index + 1).padStart(12, "0")}`])));
export default generationWorkflow;
