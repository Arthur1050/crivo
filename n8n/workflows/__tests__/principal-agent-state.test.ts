import { describe, expect, it } from "vitest";
import source from "../principal";
import generated from "../../generated/principal";
type Edge = { node: string; type: string; index: number };
type Node = { name: string; type: string; parameters: Record<string, unknown>; onError?: string };
type Graph = { nodes: Node[]; connections: Record<string, { main?: (Edge[] | null)[] }> };
const graph = generated.toJSON() as unknown as Graph;
const CAPTURE = "Code: estado CRM após buffer", PREP = "Code: preparar agent-state perguntados", POST = "HTTP: publicar agent-state perguntados", RESULT = "Code: agent-state perguntados confirmado", VALID = "Agent-state perguntados confirmado?", READ = "HTTP: metadados CRM no fechamento", FINAL = "Code: preparar agent-state final", SEND = "HTTP: publicar agent-state final", CONFIRM = "Code: agent-state final confirmado";
function node(name: string, data = graph) { const found = data.nodes.find((entry) => entry.name === name); if (!found) throw new Error(name); return found; }
function targets(name: string, output = 0) { return graph.connections[name]?.main?.[output] ?? []; }
function run(name: string, input: unknown, contexts: Record<string, unknown> = {}) { const $ = (name: string) => { if (!(name in contexts)) throw new Error(`not executed: ${name}`); return { first: () => ({ json: contexts[name] }) }; }; return new Function("$json", "$input", "$", node(name).parameters.jsCode as string)(input, { all: () => (Array.isArray(input) ? input : [input]).map((json) => ({ json })) }, $); }
function expr(raw: unknown, input: unknown, contexts: Record<string, unknown> = {}) { return new Function("$json", "$", "return (" + String(raw).replace(/^=\{\{/, "").replace(/\}\}$/, "") + ");")(input, (name: string) => ({ first: () => ({ json: contexts[name] }) })); }
const anchor = "00000000-0000-4000-8000-000000000001", other = "00000000-0000-4000-8000-000000000002";
const ctx = { id: other, tenantSlug: "fixture", waId: "5534990000000", memoryResetRequestedAt: null, bufferArray: [{ messageId: "new" }, { messageId: "old" }] };
const cache = { fase: "agendando", perguntadosJson: '["modality","region","propertyType"]', aberturasJson: '["Olá"]' };
const posted = [{ id: anchor, externalId: "new", sender: "lead", anchorMessageId: anchor, agentStateRevision: 4 }, { id: other, externalId: "old", sender: "lead", anchorMessageId: anchor, agentStateRevision: 4 }];
const captureContexts = { "Code: contexto do lead": ctx, "Data Table: conversa_estado (antes do buffer)": cache };
function captured() { return run(CAPTURE, posted, captureContexts)[0].json; }
const desired = { phase: "qualificando", perguntadosJson: '["modality"]', systemMessage: "texto", userMessage: "Oi" };
const payload = { anchorMessageId: anchor, resetObservedAt: null, expectedRevision: 4, phase: "qualificando", askedFields: ["modality"], openingHistory: ["Olá"] };
function prepared() { return run(PREP, desired, { [CAPTURE]: captured(), "Code: contexto do lead": ctx }).json; }
function metadata(id = anchor, revision: number | null = 5) { return { body: [], headers: { "x-crivo-anchor-message-id": id, "x-crivo-agent-state-revision": revision === null ? "null" : String(revision) } }; }
function confirmation(p = payload) { return { replay: false, state: { ...p, revision: p.expectedRevision + 1, updatedAt: "2026-10-02T12:00:00Z" } }; }

describe("T50 — publicação CRM de todos escritores de fase antes do cache", () => {
  it("ingestão da âncora liga o número do transporte real ao inbound persistido", () => {
    expect(expr(node("HTTP: POST /leads/{id}/messages (lead)").parameters.jsonBody, { phoneNumberId: "n1", bufferArray: { messageId: "real", text: "Oi", sentAt: "2026-10-02T12:00:00Z" } })).toEqual({ externalId: "real", sender: "lead", content: "Oi", sentAt: "2026-10-02T12:00:00Z", whatsappPhoneNumberId: "n1" });
  });
  it("captura após todo buffer usa anchor CRM comprovada, não último item processado", () => {
    expect(targets("HTTP: POST /leads/{id}/messages (lead)")).toEqual([{ node: CAPTURE, type: "main", index: 0 }]);
    expect(captured()).toEqual({ anchorMessageId: anchor, expectedRevision: 4, resetObservedAt: null, cache });
  });
  it("execução antiga não copia anchor de outro executor nem inventa revisão ausente", () => {
    expect(run(CAPTURE, posted.map((record) => ({ ...record, anchorMessageId: "00000000-0000-4000-8000-000000000099" })), captureContexts)[0].json.anchorMessageId).toBeNull();
    expect(run(CAPTURE, posted.map((record) => ({ ...record, agentStateRevision: undefined })), captureContexts)[0].json.anchorMessageId).toBeNull();
  });
  it("payload perguntados usa anchor/revisão/reset CRM e preserva aberturas observadas", () => {
    expect(prepared()).toEqual({ desired, payload, tenantSlug: "fixture", leadId: other });
    expect(expr(node(POST).parameters.jsonBody, prepared())).toEqual(payload);
  });
  it("nova fase e askedFields confirmados200/replay são os valores persistidos, antes cache", () => {
    expect(targets("Code: montar system message e marcar campo perguntado")).toEqual([{ node: PREP, type: "main", index: 0 }]);
    expect(targets(POST)).toEqual([{ node: RESULT, type: "main", index: 0 }]);
    expect(targets(VALID, 0)).toEqual([{ node: "Data Table: marcar campo perguntado", type: "main", index: 0 }]);
    expect(targets(VALID, 1)).toEqual([{ node: "AI Agent", type: "main", index: 0 }]);
    for (const replay of [false, true]) expect(run(RESULT, { ...confirmation(), replay }, { [PREP]: prepared() }).json).toEqual({ confirmed: true, phase: "qualificando", revision: 5 });
  });
  it("409/falha/estado errado mantém unknown e não grava perguntados do turno", () => {
    for (const response of [{ error: { statusCode: 409 } }, { error: "private" }, { ...confirmation(), state: { ...confirmation().state, anchorMessageId: other } }]) expect(run(RESULT, response, { [PREP]: prepared() }).json).toEqual({ confirmed: false, phase: null, revision: null });
  });
  it("final relê revisão mas recusa âncora nova; cache não reabre estado de outro turno", () => {
    const input = { tenantSlug: "fixture", waId: ctx.waId, fase: "qualificando" }, contexts = { [CAPTURE]: captured(), "Code: gate": ctx, [READ]: metadata(), [PREP]: prepared(), [RESULT]: { confirmed: true, phase: "qualificando", revision: 5 } };
    const final = run(FINAL, metadata(), { ...contexts, "Code: preparar clear de buffer (turno do agente)": input }).json;
    expect(final.payload).toEqual({ ...payload, expectedRevision: 5 });
    expect(run(FINAL, metadata(other), { ...contexts, "Code: preparar clear de buffer (turno do agente)": input }).json.payload).toBeNull();
  });
  it("encerramento usa fase encerrada e revision recém-lida sem rearmar anchor", () => {
    const input = { tenantSlug: "fixture", waId: ctx.waId, fase: "encerrada" };
    const final = run(FINAL, metadata(anchor, 4), { [CAPTURE]: captured(), "Code: gate": ctx, "Code: finalizar somente-registrar (sem envio)": input }).json;
    expect(final.payload).toEqual({ ...payload, expectedRevision: 4, phase: "encerrada", askedFields: ["modality", "region", "propertyType"] });
  });
  it("opt-out usa reset observado nessa própria resposta e fecha fase antes cache", () => {
    const reset = "2026-10-02T12:00:00Z", input = { tenantSlug: "fixture", waId: ctx.waId, fase: "encerrada" };
    const final = run(FINAL, metadata(anchor, 6), { [CAPTURE]: captured(), "Code: gate": ctx, "Code: preparar clear de buffer (envio fixo)": input, "HTTP: POST /leads/{id}/opt-out": { memoryResetRequestedAt: reset }, "Code: finalizar opt-out": { fase: "encerrada" } }).json;
    expect(final.payload).toEqual({ ...payload, expectedRevision: 6, phase: "encerrada", resetObservedAt: reset, askedFields: [], openingHistory: [] });
  });
  it("bootstrap é somente fase observada: ausência fica null e jamais qualificando presumido", () => {
    const input = { tenantSlug: "fixture", waId: ctx.waId, fase: "qualificando" }, contexts = { "Code: gate": ctx, "Code: preparar clear de buffer (envio fixo)": input };
    expect(run(FINAL, metadata(), { ...contexts, [CAPTURE]: captured() }).json.payload.phase).toBe("agendando");
    const state = { ...captured(), cache: {} }; expect(run(FINAL, metadata(anchor, 4), { ...contexts, [CAPTURE]: state }).json.payload).toEqual({ ...payload, expectedRevision: 4, phase: null, askedFields: [], openingHistory: [] });
  });
  it("revisão avançada por outro executor na mesma anchor não concede nova autoridade", () => {
    const desired = { tenantSlug: "fixture", waId: ctx.waId, fase: "qualificando" };
    const final = run(FINAL, metadata(anchor, 6), { [CAPTURE]: captured(), "Code: gate": ctx, [PREP]: prepared(), "Code: preparar clear de buffer (turno do agente)": desired }).json;
    expect(final.payload).toBeNull();
    expect(run(CONFIRM, final, { [FINAL]: final })).toEqual({ json: { tenantSlug: "fixture", waId: ctx.waId, fase: "unknown" } });
  });
  it("todos escritores clear passam por read→CAS→confirmação, erro cacheia unknown", () => {
    for (const name of ["Code: preparar clear de buffer (envio fixo)", "Code: preparar clear de buffer (turno do agente)", "Code: finalizar somente-registrar (sem envio)"]) expect(targets(name)).toEqual([{ node: READ, type: "main", index: 0 }]);
    expect(targets(READ)).toEqual([{ node: FINAL, type: "main", index: 0 }]);
    expect(targets(SEND)).toEqual([{ node: CONFIRM, type: "main", index: 0 }]);
    expect(targets(CONFIRM)).toEqual([{ node: "Data Table: limpar buffer", type: "main", index: 0 }]);
    const preparedFinal = { desired: { tenantSlug: "fixture", waId: ctx.waId, fase: "qualificando" }, payload, tenantSlug: "fixture", leadId: other };
    expect(run(CONFIRM, { error: { statusCode: 409, message: "private" } }, { [FINAL]: preparedFinal })).toEqual({ json: { tenantSlug: "fixture", waId: ctx.waId, fase: "unknown" } });
    expect(run(CONFIRM, confirmation(), { [FINAL]: preparedFinal })).toEqual({ json: { tenantSlug: "fixture", waId: ctx.waId, fase: "qualificando" } });
  });
  it("fonte/gerado espelham conexões e GET final limita leitura sem presumir reset novo", () => {
    expect(graph.connections).toEqual((source.toJSON() as unknown as Graph).connections);
    expect(node(READ)).toMatchObject({ onError: "continueRegularOutput", parameters: { method: "GET", sendQuery: true, queryParameters: { parameters: [{ name: "limit", value: "1" }] }, options: { response: { response: { fullResponse: true } } } } });
    expect(run(FINAL, { error: "private" }, { [CAPTURE]: captured(), "Code: gate": ctx, "Code: finalizar somente-registrar (sem envio)": { tenantSlug: "fixture", waId: ctx.waId, fase: "encerrada" } }).json.payload).toBeNull();
  });
});
