import { describe, expect, it } from "vitest";
import source from "../scheduler";
import generated from "../../generated/scheduler";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
type Edge = { node: string; type: string; index: number };
type Node = { name: string; type: string; retryOnFail?: boolean; parameters: Record<string, unknown> };
type Graph = { nodes: Node[]; connections: Record<string, { main?: (Edge[] | null)[] }> };
const graph = generated.toJSON() as unknown as Graph;
const CANDIDATE = "Code: candidato C", EXPIRE = "HTTP: expirar C", CONFIRM = "Code: expiração C confirmada", MIRROR = "Data Table: marcar escalado localmente";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidate = { tenantSlug: "fixture-a", leadId: uuid(1), anchorMessageId: uuid(2), anchorSentAt: "2026-10-02T00:00:00.000Z", phoneNumberId: "430000000000001", action: "escalate", cursor: null, cutoffAt: "2026-10-04T00:00:00.000Z", nextCursor: null, pageStart: true };
const committed = { action: "escalated", episodeId: uuid(3), brokerId: uuid(4), result: "accepted" };
function node(name: string, data = graph) { const found = data.nodes.find(row => row.name === name); if (!found) throw new Error(name); return found; }
function edges(name: string, index = 0, data = graph) { return data.connections[name]?.main?.[index] ?? []; }
function run(name: string, input: unknown, contexts: Record<string, unknown> = {}) { return new Function("$json", "$input", "$", node(name).parameters.jsCode as string)(input, { first: () => ({ json: Array.isArray(input) ? input[0] : input }), all: () => (Array.isArray(input) ? input : [input]).map(json => ({ json })) }, (key: string) => ({ item: { json: contexts[key] } })); }
function confirm(input: unknown) { return run(CONFIRM, input, { [CANDIDATE]: candidate }).json; }
function expression(raw: unknown, input: unknown, contexts: Record<string, unknown> = {}) { return new Function("$json", "$", "return (" + String(raw).replace(/^=\{\{/, "").replace(/\}\}$/, "") + ");")(input, (key: string) => ({ item: { json: contexts[key] } })); }
function reachable(start: string) { const seen = new Set([start]), queue = [start]; while (queue.length) { for (const branch of graph.connections[queue.shift()!]?.main ?? []) for (const edge of branch ?? []) if (!seen.has(edge.node)) { seen.add(edge.node); queue.push(edge.node); } } return seen; }

describe("T55 — expire de âncora e espelhamento após commit", () => {
  it(">=48h espelha fechamento com resultados aceita/omitida/recusada/incerta", () => {
    for (const result of ["accepted", "omitted", "refused", "uncertain"]) expect(confirm({ ...committed, result })).toEqual({ ...candidate, committed: true, episodeId: uuid(3), brokerId: uuid(4), result, outcome: "escalated" });
    expect(expression(node(EXPIRE).parameters.jsonBody, candidate)).toEqual({ anchorMessageId: uuid(2) });
  });
  it("fora de horário e sem reengaged, C consulta CRM e seleciona action=escalate", () => {
    expect(JSON.stringify(node("HTTP: candidatos C").parameters)).not.toMatch(/lastInboundAt|reengaged|meetingHours|businessHours/);
    expect((node("Switch: ação C").parameters.rules as { values: { conditions: { conditions: { rightValue: string }[] } }[] }).values[0].conditions.conditions[0].rightValue).toBe("escalate");
    expect(graph.nodes.some(row => row.name === "Data Table: reengajadas silenciosas 48h (conversa_estado)")).toBe(false);
  });
  it("replay do espelhamento usa mesmo DTO confirmado; unchanged ambíguo não autoriza cache", () => {
    const first = confirm(committed), replay = confirm({ ...committed });
    expect(replay).toEqual(first); expect(node(EXPIRE).retryOnFail).toBe(true);
    expect(confirm({ action: "unchanged", episodeId: uuid(3) })).toMatchObject({ committed: false, outcome: "expiry-unconfirmed" });
    expect((node(MIRROR).parameters.columns as { value: object }).value).toEqual({ fase: "encerrada" });
  });
  it("409 contexto mudou não fecha cache nem envia e conclui candidato", () => {
    expect(confirm({ error: { statusCode: 409, code: "contexto-alterado" } })).toMatchObject({ committed: false });
    expect(edges("Escalada C confirmada?", 1)).toEqual([{ node: "Code: concluir candidato C", type: "main", index: 0 }]);
  });
  it("responsável existente ou null é factual do CRM; caller não escolhe ou sobrescreve responsável", () => {
    expect(confirm({ ...committed, brokerId: null })).toMatchObject({ committed: true, brokerId: null });
    expect(confirm({ ...committed, brokerId: uuid(9) })).toMatchObject({ committed: true, brokerId: uuid(9) });
    expect(expression(node(EXPIRE).parameters.jsonBody, { ...candidate, brokerId: uuid(99) })).toEqual({ anchorMessageId: uuid(2) });
    expect((node(MIRROR).parameters.columns as { value: object }).value).toEqual({ fase: "encerrada" });
  });
  it("statusChangedBy humano/takeover/optout recusam; GET vivo permanece antes do expire", () => {
    expect(confirm({ error: { statusCode: 409, code: "lead-travado-por-humano" } }).committed).toBe(false);
    for (const lead of [{ status: "em_qualificacao", humanTakeoverAt: "2026-10-03T00:00:00Z", optedOutAt: null }, { status: "em_qualificacao", humanTakeoverAt: null, optedOutAt: "2026-10-03T00:00:00Z" }]) expect(run("Code: condução ao vivo (escalonamento)", lead, { [CANDIDATE]: candidate }).json.podeContatar).toBe(false);
    expect(edges("Filter: agente pode contatar (escalonamento)", 0)).toEqual([{ node: EXPIRE, type: "main", index: 0 }]);
    expect(edges("HTTP: GET /leads/{id} (escalonamento)", 1)).toEqual([{ node: "Code: concluir candidato C", type: "main", index: 0 }]);
  });
  it("cache só alcançável após DTO escalated confirmado e filtros tenant/lead original", () => {
    expect(edges(EXPIRE)).toEqual([{ node: CONFIRM, type: "main", index: 0 }]); expect(edges(CONFIRM)).toEqual([{ node: "Escalada C confirmada?", type: "main", index: 0 }]);
    expect(edges("Escalada C confirmada?", 0)).toEqual([{ node: MIRROR, type: "main", index: 0 }]);
    for (const input of [{}, { ...committed, result: "invented" }, { ...committed, episodeId: "missing" }, { action: "omitted", episodeId: uuid(3) }]) expect(confirm(input).committed).toBe(false);
    const filters = node(MIRROR).parameters.filters as { conditions: { keyName: string; keyValue: unknown }[] };
    expect(filters.conditions.map(filter => [filter.keyName, expression(filter.keyValue, confirm(committed))])).toEqual([["tenantSlug", "fixture-a"], ["leadId", uuid(1)]]);
  });
  it("C não alcança envio ao lead, geração B ou PATCH cliente de status", () => {
    const effects = [...reachable("Data Table: tenants C")].map(name => node(name));
    expect(effects.some(row => row.type.includes("whatsApp") || row.type.includes("executeWorkflow"))).toBe(false);
    expect(effects.some(row => row.name === "HTTP: enviar B uma vez" || row.parameters.method === "PATCH")).toBe(false);
  });
  it("página vazia continua cursor do tenant, sem confiar em extras de candidato", () => {
    const checkpoint = { tenantSlug: "fixture-a", cursor: null, cutoffAt: null };
    const empty = run("Code: página C pronta", { candidates: [], cutoffAt: candidate.cutoffAt, nextCursor: "opaque-next" }, { "Code: cursor C": checkpoint });
    expect(run("Code: próxima página C", empty.map((item: { json: object }) => item.json))).toEqual([{ json: { tenantSlug: "fixture-a", cursor: "opaque-next", cutoffAt: candidate.cutoffAt } }]);
    const rows = run("Code: página C pronta", { candidates: [{ ...candidate, tenantSlug: "foreign" }], cutoffAt: candidate.cutoffAt, nextCursor: null }, { "Code: cursor C": checkpoint });
    expect(rows[0].json.tenantSlug).toBe("fixture-a");
  });
  it("fonte/generated integral, A/D/B intactos e arestas de commit não podem ser removidas", () => {
    const original = source.toJSON() as unknown as Graph; expect(graph.connections).toEqual(original.connections);
    for (const name of [EXPIRE, CONFIRM, MIRROR]) { const expected = structuredClone(node(name, original)); if (typeof expected.parameters.jsCode === "string") expected.parameters.jsCode = expected.parameters.jsCode.replace(/'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g, (_match, file: string) => readInlinedModule(file)); expect(node(name)).toEqual(expected); }
    const critical: [string, number, string][] = [[EXPIRE, 0, CONFIRM], [CONFIRM, 0, "Escalada C confirmada?"], ["Escalada C confirmada?", 0, MIRROR]];
    const proved = (data: Graph) => critical.every(([from, output, to]) => edges(from, output, data).some(edge => edge.node === to)); expect(proved(graph)).toBe(true);
    for (const [from, output, to] of critical) { const broken = structuredClone(graph); broken.connections[from].main![output] = edges(from, output, broken).filter(edge => edge.node !== to); expect(proved(broken)).toBe(false); }
    expect(edges("A cada 15min")).toContainEqual({ node: "Data Table: lembretes devidos (agenda_envios)", type: "main", index: 0 });
    expect(edges("A cada 15min")).toContainEqual({ node: "Data Table: tenants (purga pedida pelo CRM)", type: "main", index: 0 });
    expect(edges("A cada 15min")).toContainEqual({ node: "Data Table: tenants B", type: "main", index: 0 });
  });
});
