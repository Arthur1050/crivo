import { afterEach, describe, expect, it, vi } from "vitest";
import source from "../scheduler";
import generated from "../../generated/scheduler";
import readonlyGeneration from "../../generated/reengagement-contextual";
import { reengagementFixtureFrame } from "../../src/__tests__/reengagement-fixtures";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";

type Edge = { node: string; type: string; index: number };
type Node = { name: string; type: string; retryOnFail?: boolean; onError?: string; parameters: Record<string, unknown> };
type Graph = { nodes: Node[]; connections: Record<string, { main?: (Edge[] | null)[] }> };
const graph = generated.toJSON() as unknown as Graph, readonly = readonlyGeneration.toJSON() as unknown as Graph;
const PAGE = "Code: página B pronta", CANDIDATE = "Code: candidato B", CLAIM = "Code: claim B", VALIDATE = "Code: geração B validada", RESULT = "Code: resultado B", SEND = "HTTP: enviar B uma vez", GENERATE = "Executar: geração B readonly";
const now = Date.parse("2026-10-02T12:00:00Z"), uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidate = { tenantSlug: "fixture-a", tenantId: uuid(1), leadId: uuid(2), anchorMessageId: uuid(4), anchorSentAt: new Date(now - 22 * 3600000).toISOString(), phoneNumberId: "430000000000001", action: "prepare", cursor: null, cutoffAt: null, nextCursor: null, pageStart: true };
const frame = { ...reengagementFixtureFrame(), tenantId: uuid(1), leadId: uuid(2), episodeId: uuid(3), phoneNumberId: candidate.phoneNumberId, anchor: { id: uuid(4), sentAt: candidate.anchorSentAt } };
const prepared = { episodeId: uuid(3), claimToken: uuid(5), claimExpiresAt: new Date(now + 300000).toISOString(), agentStateRevision: frame.agent.revision, frame };
function node(name: string, data = graph) { const found = data.nodes.find(row => row.name === name); if (!found) throw new Error(name); return found; }
function edges(name: string, index = 0, data = graph) { return data.connections[name]?.main?.[index] ?? []; }
function run(name: string, input: unknown, contexts: Record<string, unknown> = {}, data = graph) {
  const $ = (key: string) => { if (!(key in contexts)) throw new Error(key); return { item: { json: contexts[key] }, first: () => ({ json: contexts[key] }) }; };
  return new Function("$json", "$input", "$", node(name, data).parameters.jsCode as string)(input, { first: () => ({ json: Array.isArray(input) ? input[0] : input }), all: () => (Array.isArray(input) ? input : [input]).map(json => ({ json })) }, $);
}
function claim(patch: Record<string, unknown> = {}) { return run(CLAIM, { ...prepared, ...patch }, { [CANDIDATE]: candidate }).json; }
function validate(input: unknown, fixed = claim()) { return run(VALIDATE, input, { [CLAIM]: fixed }).json; }
function expression(raw: unknown, input: unknown, contexts: Record<string, unknown> = {}) { return new Function("$json", "$", "return (" + String(raw).replace(/^=\{\{/, "").replace(/\}\}$/, "") + ");")(input, (key: string) => ({ item: { json: contexts[key] } })); }
const critical: [string, number, string][] = [
  ["A cada 15min", 0, "Data Table: tenants B"], ["Data Table: tenants B", 0, "Code: tenants únicos B"], ["Code: tenants únicos B", 0, "Loop: tenants B"], ["Loop: tenants B", 1, "Code: cursor B"], ["Code: cursor B", 0, "HTTP: candidatos B"], ["HTTP: candidatos B", 0, PAGE], [PAGE, 0, "Loop: candidatos B"], ["Loop: candidatos B", 1, CANDIDATE], [CANDIDATE, 0, "Switch: ação B"], ["Switch: ação B", 0, "HTTP: GET /leads/{id} (reengajamento)"], ["HTTP: GET /leads/{id} (reengajamento)", 0, "Code: condução ao vivo (reengajamento)"], ["Code: condução ao vivo (reengajamento)", 0, "Filter: agente pode contatar (reengajamento)"], ["Filter: agente pode contatar (reengajamento)", 0, "HTTP: preparar B"], ["HTTP: preparar B", 0, CLAIM], [CLAIM, 0, "Claim B adquirida?"], ["Claim B adquirida?", 0, GENERATE], [GENERATE, 0, VALIDATE], [VALIDATE, 0, "Texto B válido no prazo?"], ["Texto B válido no prazo?", 0, SEND], [SEND, 0, RESULT], [RESULT, 0, "Aceite B precisa registro?"], ["Aceite B precisa registro?", 0, "HTTP: acknowledgement B"],
];
critical.push(
  ["Switch: ação B", 1, "HTTP: omitir B"], ["Switch: ação B", 2, "Code: concluir candidato B"],
  ["HTTP: GET /leads/{id} (reengajamento)", 1, "Code: concluir candidato B"], ["Filter: agente pode contatar (reengajamento)", 1, "Code: concluir candidato B"],
  ["Claim B adquirida?", 1, "Code: concluir candidato B"], ["Texto B válido no prazo?", 1, "HTTP: liberar preparação B"],
  ["HTTP: liberar preparação B", 0, "Code: concluir candidato B"], ["HTTP: omitir B", 0, "Code: concluir candidato B"],
  ["Aceite B precisa registro?", 1, "Code: concluir candidato B"], ["HTTP: acknowledgement B", 0, "Code: concluir candidato B"],
  ["Code: concluir candidato B", 0, "Loop: candidatos B"], ["Loop: candidatos B", 0, "Code: próxima página B"],
  ["Code: próxima página B", 0, "Há próxima página B?"], ["Há próxima página B?", 0, "Code: cursor B"], ["Há próxima página B?", 1, "Loop: tenants B"],
);
function completePath(data: Graph) { return critical.every(([from, output, to]) => edges(from, output, data).some(edge => edge.node === to)); }
afterEach(() => vi.useRealTimers());

describe("T54 — scheduler B candidates→claim→readonly→send único/ack", () => {
  it("usa candidatos CRM paginados e corte do servidor, sem buffer como relógio/horário", () => {
    const page = run(PAGE, { candidates: [candidate], cutoffAt: new Date(now).toISOString(), nextCursor: "opaque-next" }, { "Code: cursor B": { tenantSlug: "fixture-a", cursor: null, cutoffAt: null } });
    expect(page).toEqual([{ json: { tenantSlug: "fixture-a", cursor: null, cutoffAt: new Date(now).toISOString(), nextCursor: "opaque-next", leadId: uuid(2), anchorMessageId: uuid(4), anchorSentAt: candidate.anchorSentAt, phoneNumberId: candidate.phoneNumberId, action: "prepare", pageStart: true } }]);
    expect(JSON.stringify(node("HTTP: candidatos B").parameters)).not.toMatch(/lastInboundAt|reengaged|businessHours/);
  });
  it("página vazia COM cursor continua antes de completar tenant e preserva corte", () => {
    const page = run(PAGE, { candidates: [], cutoffAt: new Date(now).toISOString(), nextCursor: "opaque-next" }, { "Code: cursor B": { tenantSlug: "fixture-a", cursor: null, cutoffAt: null } });
    const next = run("Code: próxima página B", page.map((item: { json: object }) => item.json));
    expect(next).toEqual([{ json: { tenantSlug: "fixture-a", cursor: "opaque-next", cutoffAt: new Date(now).toISOString() } }]);
    expect(edges("Há próxima página B?", 0)).toEqual([{ node: "Code: cursor B", type: "main", index: 0 }]);
    expect(edges("Há próxima página B?", 1)).toEqual([{ node: "Loop: tenants B", type: "main", index: 0 }]);
  });
  it("campos extras de candidato não sobrescrevem autenticação, cursor ou corte", () => {
    const page = run(PAGE, { candidates: [{ ...candidate, tenantSlug: "foreign", cursor: "forged", cutoffAt: "forged", nextCursor: "forged" }], cutoffAt: new Date(now).toISOString(), nextCursor: null }, { "Code: cursor B": { tenantSlug: "fixture-a", cursor: "real", cutoffAt: null } });
    expect(page[0].json).toMatchObject({ tenantSlug: "fixture-a", cursor: "real", cutoffAt: new Date(now).toISOString(), nextCursor: null });
    const params = node("HTTP: preparar B").parameters.headerParameters as { parameters: { value: unknown }[] };
    expect(expression(params.parameters[0].value, {}, { [CANDIDATE]: page[0].json })).toBe("fixture-a");
  });
  it("deduplica tenants e processa batch1 sem contaminar próximo tenant", () => {
    expect(run("Code: tenants únicos B", [{ tenantSlug: "fixture-a" }, { tenantSlug: "fixture-b" }, { tenantSlug: "fixture-a" }])).toEqual([{ json: { tenantSlug: "fixture-a", cursor: null, cutoffAt: null } }, { json: { tenantSlug: "fixture-b", cursor: null, cutoffAt: null } }]);
    expect(node("Loop: tenants B").parameters.batchSize).toBe(1); expect(node("Loop: candidatos B").parameters.batchSize).toBe(1);
    const completed = run("Code: concluir candidato B", { recorded: true }, { [CANDIDATE]: { ...candidate, tenantSlug: "fixture-b", nextCursor: "next-b" } }).json;
    expect(expression((node("Loop: candidatos B").parameters.options as { reset: unknown }).reset, completed)).toBe(false);
    expect(run("Code: próxima página B", [completed])).toEqual([{ json: { tenantSlug: "fixture-b", cursor: "next-b", cutoffAt: null } }]);
  });
  it("24h/omit não gera ou manda template: expire recebe somente âncora", () => {
    expect(edges("Switch: ação B", 1)).toEqual([{ node: "HTTP: omitir B", type: "main", index: 0 }]);
    expect(expression(node("HTTP: omitir B").parameters.jsonBody, { ...candidate, action: "omit" })).toEqual({ anchorMessageId: uuid(4) });
    expect(graph.nodes.some(row => row.name === "WhatsApp: reengajamento (template)")).toBe(false);
  });
  it("claim disputa/409/frame divergente não concede geração ou envio", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    for (const patch of [{ error: { statusCode: 409 } }, { claimToken: null }, { frame: { ...frame, tenantId: uuid(99) } }, { frame: { ...frame, anchor: { ...frame.anchor, id: uuid(99) } } }]) expect(claim(patch)).toMatchObject({ claimed: false, outcome: "claim-unavailable" });
    expect(edges("Claim B adquirida?", 1)).toEqual([{ node: "Code: concluir candidato B", type: "main", index: 0 }]);
  });
  it("falha de geração libera somente preparação pelo token original", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); const failed = validate({ error: "private" });
    expect(failed).toMatchObject({ valid: false, failureCode: "generation-failed" });
    expect(expression(node("HTTP: liberar preparação B").parameters.jsonBody, failed)).toEqual({ claimToken: uuid(5), code: "generation-failed" });
    expect(edges("Texto B válido no prazo?", 1)).toEqual([{ node: "HTTP: liberar preparação B", type: "main", index: 0 }]);
  });
  it("120s total é compartilhado desde claim e não reinicia no readonly/tool", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); const fixed = claim(); expect(fixed.deadline).toBe(now + 120000);
    vi.setSystemTime(now + 30000); const child = run("Code: identidade fixa", fixed, {}, readonly).json; expect(child.deadline).toBe(now + 120000);
    vi.setSystemTime(now + 120000); expect(validate({ ok: true, text: "texto" }, fixed)).toMatchObject({ valid: false, failureCode: "generation-timeout" });
  });
  it("deadline recebido maior não estende orçamento próprio e passado/zero recusam antes tools/modelo", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    expect(run("Code: identidade fixa", { frame, tenantSlug: "fixture-a", deadline: now + 999999 }, {}, readonly).json.deadline).toBe(now + 120000);
    for (const deadline of [0, now - 1, now, Number.POSITIVE_INFINITY]) expect(() => run("Code: identidade fixa", { frame, tenantSlug: "fixture-a", deadline }, {}, readonly)).toThrow("generation-timeout");
  });
  it("trim e teto4096 preservam uma mensagem; vazio/4097 liberam sem dividir/fallback", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    const valid = validate({ ok: true, text: "  " + "x".repeat(4096) + "  " }); expect(valid.valid).toBe(true); expect(valid.text).toBe("x".repeat(4096));
    for (const text of ["   ", "x".repeat(4097)]) expect(validate({ ok: true, text })).toMatchObject({ valid: false, failureCode: "invalid-text" });
    expect(expression(node(SEND).parameters.jsonBody, valid)).toEqual({ claimToken: uuid(5), text: "x".repeat(4096) });
  });
  it("inbound durante geração recusado por sendCRM não concede retry ou ack", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); const valid = validate({ ok: true, text: "Resposta" });
    expect(run(RESULT, { error: { statusCode: 409, code: "contexto-alterado" } }, { [VALIDATE]: valid }).json).toMatchObject({ needsAck: false, outcome: "uncertain" });
    expect(node(SEND).retryOnFail).not.toBe(true); expect(node(GENERATE).retryOnFail).not.toBe(true);
  });
  it("replay send accepted/refused/uncertain nunca repete transporte nem fabrica ack", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); const valid = validate({ ok: true, text: "Resposta" });
    for (const state of ["accepted", "refused", "uncertain", "authorized"]) expect(run(RESULT, { episodeId: uuid(3), state, replay: true }, { [VALIDATE]: valid }).json).toMatchObject({ outcome: state, needsAck: false });
    expect(edges("Aceite B precisa registro?", 1)).toEqual([{ node: "Code: concluir candidato B", type: "main", index: 0 }]);
  });
  it("ack pending recebe só identidade de send real, retries limitados à persistência", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); const valid = validate({ ok: true, text: "Resposta", wamid: "model-forged" }), acceptedAt = new Date(now).toISOString();
    const result = run(RESULT, { episodeId: uuid(3), state: "accepted_pending_record", wamid: "wamid.real", acceptedAt }, { [VALIDATE]: valid }).json;
    expect(result.needsAck).toBe(true); expect(expression(node("HTTP: acknowledgement B").parameters.jsonBody, result)).toEqual({ wamid: "wamid.real", acceptedAt });
    expect(node("HTTP: acknowledgement B").retryOnFail).toBe(true);
    expect(run(RESULT, { episodeId: uuid(3), state: "accepted_pending_record" }, { [VALIDATE]: valid }).json.needsAck).toBe(false);
  });
  it("ExecuteWorkflow embute versão gerada completa com IDs, apenas readonly e sem memória", () => {
    expect(node(GENERATE).parameters).toMatchObject({ source: "parameter", mode: "each", options: { waitForSubWorkflow: true } });
    expect(JSON.parse(node(GENERATE).parameters.workflowJson as string)).toEqual(readonly);
    expect(readonly.nodes.filter(row => row.type.includes("httpRequestTool")).map(row => row.name).sort()).toEqual(["buscar_imoveis", "consultar_documentos"]);
    expect(readonly.nodes.some(row => /memory|whatsApp|dataTable|postgres/i.test(row.type))).toBe(false);
  });
  it("remover cada aresta crítica rompe prova do caminho completo e nenhum efeito é atalho", () => {
    expect(completePath(graph)).toBe(true);
    for (const [from, output, to] of critical) { const broken = structuredClone(graph); broken.connections[from].main![output] = edges(from, output, broken).filter(edge => edge.node !== to); expect(completePath(broken)).toBe(false); }
  });
  it("fonte/generated integral após inline e lembrete A/reset D preservam trigger/caminhos", () => {
    const original = source.toJSON() as unknown as Graph; expect(graph.connections).toEqual(original.connections);
    for (const name of [PAGE, CLAIM, GENERATE, VALIDATE, SEND, RESULT]) { const expected = structuredClone(node(name, original)); if (typeof expected.parameters.jsCode === "string") expected.parameters.jsCode = expected.parameters.jsCode.replace(/'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g, (_match, file: string) => readInlinedModule(file)); expect(node(name)).toEqual(expected); }
    expect(edges("A cada 15min")).toContainEqual({ node: "Data Table: lembretes devidos (agenda_envios)", type: "main", index: 0 });
    expect(edges("A cada 15min")).toContainEqual({ node: "Data Table: tenants (purga pedida pelo CRM)", type: "main", index: 0 });
  });
});
