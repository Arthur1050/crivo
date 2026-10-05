import { describe, expect, it } from "vitest";
import source from "../scheduler";
import generated from "../../generated/scheduler";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";
type Edge = { node: string; type: string; index: number };
type Node = { name: string; type: string; onError?: string; retryOnFail?: boolean; parameters: Record<string, unknown> };
type Graph = { nodes: Node[]; connections: Record<string, { main?: (Edge[] | null)[] }> };
const graph = generated.toJSON() as unknown as Graph;
function node(name: string, data = graph) { const row = data.nodes.find(row => row.name === name); if (!row) throw new Error(name); return row; }
function edges(name: string, index = 0, data = graph) { return data.connections[name]?.main?.[index] ?? []; }
function run(name: string, input: unknown, context: Record<string, unknown> = {}) { return new Function("$json", "$input", "$", node(name).parameters.jsCode as string)(input, { first: () => ({ json: input }), all: () => (Array.isArray(input) ? input : [input]).map(json => ({ json })) }, (key: string) => ({ item: { json: context[key] } })); }
function expression(raw: unknown, input: unknown, context: Record<string, unknown> = {}) { return new Function("$json", "$", "return (" + String(raw).replace(/^=\{\{/, "").replace(/\}\}$/, "") + ");")(input, (key: string) => ({ item: { json: context[key] } })); }
const tenant = { tenantSlug: "fixture-a" };
const jobs = (input: unknown) => run("Code: canais E prontos", input, { "Code: tenant E": tenant });

describe("T56 — tick CRM de consumo e reconciliação", () => {
  it("200 unavailable não afirma sincronização; adapter produtivo ausente conserva gate factual", () => {
    const channel = { ...tenant, phoneNumberId: "430000000000001", enabled: true };
    expect(run("Code: concluir canal E", { result: "unavailable", reason: "contract-unverified", snapshot: { state: "unavailable", label: "Consumo indisponível" } }, { "Code: canal E": channel }).json).toEqual({ ...channel, outcome: "usage-unavailable", channelDone: true });
  });
  it("200 skipped conserva cadência/lease sem afirmar saldo ou consultar Graph novamente", () => {
    const channel = { ...tenant, phoneNumberId: "430000000000001", enabled: true };
    for (const reason of ["cadence", "lease-active"]) expect(run("Code: concluir canal E", { result: "skipped", reason, snapshot: { state: "available", used: 999 } }, { "Code: canal E": channel }).json).toEqual({ ...channel, outcome: "sync-skipped", channelDone: true });
    expect(node("HTTP: sincronizar consumo E").retryOnFail).not.toBe(true);
  });
  it("resposta malformed/resultado inventado falha conservadoramente e não vaza snapshot", () => {
    const channel = { ...tenant, phoneNumberId: "430000000000001", enabled: true };
    for (const input of [{}, null, { result: "invented", secret: "fixture-private" }, { result: "synced", error: "fixture-private" }]) expect(run("Code: concluir canal E", input, { "Code: canal E": channel }).json).toEqual({ ...channel, outcome: "usage-unavailable", channelDone: true });
    expect(jobs({ channels: [{ phoneNumberId: "missing" }] })[0].json).toEqual({ ...tenant, enabled: false, outcome: "channels-unavailable" });
  });
  it("tenant sem números conclui sentinel e avança próximo tenant sem reiniciar loop", () => {
    const empty = jobs({ channels: [] })[0].json;
    const done = run("Code: concluir canal E", empty, { "Code: canal E": empty }).json;
    expect(done).toEqual({ ...tenant, phoneNumberId: undefined, enabled: false, outcome: "no-enabled-channels", channelDone: true });
    expect(expression((node("Loop: canais E").parameters.options as { reset: unknown }).reset, done)).toBe(false);
    expect(edges("Loop: canais E", 0)).toEqual([{ node: "Loop: tenants E", type: "main", index: 0 }]);
  });
  it("headers sync e reconcile conservam tenant de invocação, nunca resposta/modelo", () => {
    const channel = { ...tenant, phoneNumberId: "430000000000001", enabled: true };
    for (const [name, checkpoint, value] of [["HTTP: sincronizar consumo E", "Code: canal E", channel], ["HTTP: reconciliar E sem transporte", "Code: tenant E", tenant]] as const) {
      const headers = node(name).parameters.headerParameters as { parameters: { name: string; value: unknown }[] };
      expect(headers.parameters[0].name).toBe("X-Crivo-Tenant"); expect(expression(headers.parameters[0].value, { tenantSlug: "foreign" }, { [checkpoint]: value })).toBe("fixture-a");
      expect(node(name).parameters.authentication).toBe("genericCredentialType"); expect(node(name).parameters.genericAuthType).toBe("httpHeaderAuth");
    }
  });
  it("cadência15min mantém A–D e liga operações E reais; remoção de aresta crítica falha", () => {
    expect(node("A cada 15min").parameters.rule).toEqual({ interval: [{ field: "minutes", minutesInterval: 15 }] });
    for (const target of ["Data Table: lembretes devidos (agenda_envios)", "Data Table: tenants B", "Data Table: tenants C", "Data Table: tenants (purga pedida pelo CRM)", "Data Table: tenants E"]) expect(edges("A cada 15min")).toContainEqual({ node: target, type: "main", index: 0 });
    const critical: [string, number, string][] = [["Data Table: tenants E", 0, "Code: tenants únicos E"], ["Code: tenants únicos E", 0, "Loop: tenants E"], ["Loop: tenants E", 1, "Code: tenant E"], ["Code: tenant E", 0, "HTTP: reconciliar E sem transporte"], ["Code: tenant E", 0, "HTTP: canais habilitados E"], ["HTTP: canais habilitados E", 0, "Code: canais E prontos"], ["Code: canais E prontos", 0, "Loop: canais E"], ["Loop: canais E", 1, "Code: canal E"], ["Code: canal E", 0, "Canal E habilitado?"], ["Canal E habilitado?", 0, "HTTP: sincronizar consumo E"], ["Canal E habilitado?", 1, "Code: concluir canal E"], ["HTTP: sincronizar consumo E", 0, "Code: concluir canal E"], ["Code: concluir canal E", 0, "Loop: canais E"], ["Loop: canais E", 0, "Loop: tenants E"], ["HTTP: reconciliar E sem transporte", 0, "Code: resultado reconciliação E"]];
    const valid = (data: Graph) => critical.every(([from, port, to]) => edges(from, port, data).some(edge => edge.node === to)); expect(valid(graph)).toBe(true);
    for (const [from, port, to] of critical) { const broken = structuredClone(graph); broken.connections[from].main![port] = edges(from, port, broken).filter(edge => edge.node !== to); expect(valid(broken)).toBe(false); }
    const original = source.toJSON() as unknown as Graph; expect(graph.connections).toEqual(original.connections);
    for (const expected of original.nodes) { const copy = structuredClone(expected); if (typeof copy.parameters.jsCode === "string") copy.parameters.jsCode = copy.parameters.jsCode.replace(/'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g, (_match, file: string) => readInlinedModule(file)); expect(node(copy.name)).toEqual(copy); }
  });
  it("canais habilitados sem leads são sincronizáveis; vazio/desabilitado não envia e auth vem do checkpoint", () => {
    expect(run("Code: tenants únicos E", [tenant, tenant, { tenantSlug: "fixture-b" }, { tenantSlug: "bad/slug" }])).toEqual([{ json: tenant }, { json: { tenantSlug: "fixture-b" } }]);
    const rows = jobs({ channels: [{ phoneNumberId: "430000000000001", tenantSlug: "foreign" }, { phoneNumberId: "430000000000001" }, { phoneNumberId: "430000000000002" }] });
    expect(rows.map((row: { json: object }) => row.json)).toEqual([{ ...tenant, phoneNumberId: "430000000000001", enabled: true }, { ...tenant, phoneNumberId: "430000000000002", enabled: true }]);
    expect(rows.every((row: { pairedItem: object }) => JSON.stringify(row.pairedItem) === '{"item":0}')).toBe(true);
    expect(jobs({ channels: [] })[0].json).toEqual({ ...tenant, enabled: false, outcome: "no-enabled-channels" });
    const headers = node("HTTP: canais habilitados E").parameters.headerParameters as { parameters: { value: unknown }[] };
    expect(expression(headers.parameters[0].value, { tenantSlug: "foreign" }, { "Code: tenant E": tenant })).toBe("fixture-a");
    expect(node("HTTP: canais habilitados E").parameters.url).toMatch(/\/automation\/channels$/);
  });
  it("falha de canal/tenant conserva próximos canais e reconciliação independente, sem erro bruto", () => {
    const channel = { ...tenant, phoneNumberId: "430000000000001", enabled: true };
    const failed = run("Code: concluir canal E", { error: "fixture-private" }, { "Code: canal E": channel }).json;
    expect(failed).toEqual({ ...channel, outcome: "usage-unavailable", channelDone: true });
    const reset = (node("Loop: canais E").parameters.options as { reset: unknown }).reset;
    expect(expression(reset, channel)).toBe(true); expect(expression(reset, failed)).toBe(false);
    const next = { ...channel, phoneNumberId: "430000000000002" };
    expect(run("Code: concluir canal E", { result: "synced" }, { "Code: canal E": next }).json).toEqual({ ...next, outcome: "sync-completed", channelDone: true });
    expect(jobs({ error: "fixture-private" })[0].json).toEqual({ ...tenant, enabled: false, outcome: "channels-unavailable" });
    for (const name of ["HTTP: canais habilitados E", "HTTP: sincronizar consumo E", "HTTP: reconciliar E sem transporte"]) expect(node(name).onError).toBe("continueRegularOutput");
    expect(run("Code: resultado reconciliação E", { error: "fixture-private" }, { "Code: tenant E": tenant }).json).toEqual({ ...tenant, outcome: "reconciliation-unavailable" });
  });
  it("mês/fuso/Graph são decididos no CRM; polling não alcança sync e reconciliação não envia identidade", () => {
    expect(node("HTTP: reconciliar E sem transporte").parameters.jsonBody).toBe("{}");
    expect(node("HTTP: reconciliar E sem transporte").parameters.url).toMatch(/\/automation\/reconcile$/);
    expect(node("HTTP: reconciliar E sem transporte").retryOnFail).not.toBe(true);
    const sync = node("HTTP: sincronizar consumo E"); expect(sync.parameters.url).toMatch(/\/usage\/sync$/);
    expect(expression(sync.parameters.jsonBody, { phoneNumberId: "430000000000001", month: "2099-01", timezone: "forged", wamid: "forged" })).toEqual({ phoneNumberId: "430000000000001" });
    expect(edges("Code: resultado reconciliação E")).toEqual([]);
    expect(run("Code: resultado reconciliação E", { recorded: 2, uncertain: 1, failed: 1, secret: "fixture-private" }, { "Code: tenant E": tenant }).json).toEqual({ ...tenant, outcome: "reconciled", recorded: 2, uncertain: 1, failed: 1 });
    const serialized = JSON.stringify(graph.nodes.filter(row => / E/.test(row.name)));
    expect(serialized).not.toMatch(/graph\.facebook|pricing_analytics|sendWhatsApp|\/reengagement\/send|\/candidates|access_token/);
  });
});
