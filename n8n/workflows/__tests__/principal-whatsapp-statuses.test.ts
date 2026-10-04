import { describe, expect, it } from "vitest";
import source from "../principal";
import generated from "../../generated/principal";
import { preparePrincipalStatusPublication, type StatusPublicationEvidence } from "../../../scripts/n8n-status-publication";

type Node = { name: string; type: string; typeVersion: number; parameters: Record<string, unknown>; onError?: string; retryOnFail?: boolean; maxTries?: number; credentials?: unknown };
type Edge = { node: string; type: string; index: number };
type Graph = { nodes: Node[]; connections: Record<string, { main?: (Edge[] | null)[] }> };
const graph = generated.toJSON() as unknown as Graph;
const SPLIT = "Code: separar WhatsApp messages/statuses", ROUTE = "WhatsApp: tipo de evento", LOOKUP = "Data Table: tenant do status", PREPARE = "Code: preparar status CRM", POST = "HTTP: POST /whatsapp/statuses", RESULT = "Code: resultado status sanitizado";
function node(name: string, data = graph) { const found = data.nodes.find((entry) => entry.name === name); if (!found) throw new Error(name); return found; }
function targets(name: string, index = 0) { return graph.connections[name]?.main?.[index] ?? []; }
function reachable(start: string) { const seen = new Set([start]), queue = [start]; while (queue.length) { for (const list of graph.connections[queue.shift()!]?.main ?? []) for (const edge of list ?? []) if (!seen.has(edge.node)) { seen.add(edge.node); queue.push(edge.node); } } return [...seen].sort(); }
function run(name: string, input: unknown, contexts: Record<string, unknown> = {}) { const $ = (key: string) => ({ item: { json: contexts[key] }, first: () => ({ json: contexts[key] }) }); return new Function("$json", "$input", "$", node(name).parameters.jsCode as string)(input, { all: () => (Array.isArray(input) ? input : [input]).map((json) => ({ json })) }, $); }
function expression(raw: unknown, input: unknown, contexts: Record<string, unknown> = {}) { return new Function("$json", "$", "return (" + String(raw).replace(/^=\{\{/, "").replace(/\}\}$/, "") + ");")(input, (key: string) => ({ item: { json: contexts[key] } })); }
const value = (phone = "n1", state = "delivered") => ({ metadata: { phone_number_id: phone }, statuses: [{ id: "wamid-1", status: state, timestamp: "1754395800" }] });
const dto = { phoneNumberId: "n1", statuses: [{ wamid: "wamid-1", status: "delivered", timestamp: "2025-08-05T12:10:00.000Z" }] };
const routed = { kind: "status", ...dto };
const tenant = { phoneNumberId: "n1", tenantSlug: "fixture", apiKey: "private-ignored" };
const target = { workflowId: "fixture-workflow", activeVersionId: "00000000-0000-4000-8000-000000000001" };
const evidence: StatusPublicationEvidence = { ...target, triggerVersion: 1, signatureAlgorithm: "hmac-sha256", signatureInput: "raw-body", rejectsInvalidSignatures: true, acceptsValidSignatures: true, credentialSha256: "a".repeat(64), verifiedAt: "2026-10-02T12:00:00Z" };

describe("T49 — status separado do pipeline conversacional", () => {
  it("trigger→splitter→switch e status só alcança lookup/DTO/POST/resultado", () => {
    expect(targets("WhatsApp Trigger")).toEqual([{ node: SPLIT, type: "main", index: 0 }]);
    expect(targets(SPLIT)).toEqual([{ node: ROUTE, type: "main", index: 0 }]);
    expect(targets(ROUTE, 0)).toEqual([{ node: "Somente Mensagens (descarta statuses)", type: "main", index: 0 }]);
    expect(targets(ROUTE, 1)).toEqual([{ node: LOOKUP, type: "main", index: 0 }]);
    expect(reachable(LOOKUP)).toEqual([PREPARE, RESULT, LOOKUP, POST].sort());
    expect(targets(POST, 1)).toEqual([]);
  });
  it("mixed emite inbound real unitário e status sem mensagens", () => {
    const message = { id: "in-1", from: "5534990000000", type: "text", text: { body: "Oi" }, timestamp: "1754395800" };
    expect(run(SPLIT, { ...value(), messages: [message] })).toEqual([{ json: { kind: "message", metadata: { phone_number_id: "n1" }, messages: [message] } }, { json: routed }]);
  });
  it("status-only/sent/read preservam eventos sem caminho para inbound", () => {
    for (const state of ["delivered", "failed", "sent", "read"]) expect(run(SPLIT, value("n1", state))).toEqual([{ json: { kind: "status", phoneNumberId: "n1", statuses: [{ ...dto.statuses[0], status: state }] } }]);
    const rules = node(ROUTE).parameters.rules as { values: { conditions: { conditions: { leftValue: string; rightValue: string }[] } }[] };
    expect(rules.values.map((rule) => expression(rule.conditions.conditions[0].leftValue, routed) === rule.conditions.conditions[0].rightValue)).toEqual([false, true]);
  });
  it("batching101 e dois números não perdem status", () => {
    const result = run(SPLIT, [{ ...value(), statuses: Array.from({ length: 101 }, (_, i) => ({ ...value().statuses[0], id: `id-${i}` })) }, value("n2")]);
    expect(result.map((entry: { json: { phoneNumberId: string; statuses: unknown[] } }) => [entry.json.phoneNumberId, entry.json.statuses.length])).toEqual([["n1", 100], ["n1", 1], ["n2", 1]]);
    expect(result.flatMap((entry: { json: { statuses: { wamid: string }[] } }) => entry.json.statuses.map((status) => status.wamid))).toEqual([...Array.from({ length: 101 }, (_, i) => `id-${i}`), "wamid-1"]);
  });
  it("lookup por phoneNumberId e POST usa tenant configurado, sem identidade do lead", () => {
    const filters = node(LOOKUP).parameters.filters as { conditions: { keyName: string; keyValue: string }[] };
    expect(filters.conditions.map((condition) => [condition.keyName, expression(condition.keyValue, routed)])).toEqual([["phoneNumberId", "n1"]]);
    const prepared = run(PREPARE, tenant, { [ROUTE]: routed }); expect(prepared).toEqual({ json: { tenantSlug: "fixture", batch: dto } });
    expect(expression(node(POST).parameters.jsonBody, prepared.json)).toEqual(dto);
    const headers = node(POST).parameters.headerParameters as { parameters: { name: string; value: string }[] };
    expect(headers.parameters.map((header) => [header.name, expression(header.value, prepared.json)])).toEqual([["X-Crivo-Tenant", "fixture"]]);
  });
  it.each([{ ...tenant, phoneNumberId: "n2" }, { ...tenant, tenantSlug: "" }, { error: "private" }])("vínculo errado/lookup falhou não produz POST %#", (input) => {
    expect(run(PREPARE, input, { [ROUTE]: routed })).toBeNull();
  });
  it("erro de status isolado conserva inbound e resultado nunca expõe body/credenciais", () => {
    const messages = [{ id: "real" }]; const result = run(SPLIT, { ...value(), messages, statuses: [{ ...value().statuses[0], timestamp: "bad" }] });
    expect(result).toEqual([{ json: { kind: "message", metadata: { phone_number_id: "n1" }, messages } }, { json: { kind: "status-error", phoneNumberId: "n1", reason: "invalid-status" } }]);
    expect(run(RESULT, { error: { message: "Bearer private-token conversa" }, body: "private" })).toEqual({ json: { statusForwarded: false, code: "status-forwarding-failed" } });
    expect(run(RESULT, { processed: 1, credential: "private" })).toEqual({ json: { statusForwarded: true, processed: 1 } });
    expect(node(POST).onError).toBe("continueRegularOutput"); expect(node(LOOKUP).onError).toBe("continueRegularOutput");
  });
  it("retry só POST idempotente de status, sem retry/ramo de agente", () => {
    expect(node(POST)).toMatchObject({ retryOnFail: true, maxTries: 3, parameters: { method: "POST", url: "https://crivo-arthur1050s-projects.vercel.app/api/v1/whatsapp/statuses", authentication: "genericCredentialType", genericAuthType: "httpHeaderAuth" } });
    for (const name of [SPLIT, ROUTE, LOOKUP, PREPARE, RESULT]) expect(node(name).retryOnFail).not.toBe(true);
    expect(JSON.stringify(node(POST).parameters)).not.toMatch(/Authorization|apiKey|Bearer/);
  });
  it("replay retorna mesmo lote e sem classificação/consumo inferidos", () => {
    expect(run(SPLIT, value())).toEqual([{ json: routed }]); expect(run(SPLIT, value())).toEqual([{ json: routed }]);
    expect(run(PREPARE, tenant, { [ROUTE]: routed })).toEqual({ json: { tenantSlug: "fixture", batch: dto } });
  });
  it("serializer gerado seleciona delivered/failed explicitamente e espelha wiring", () => {
    expect(node("WhatsApp Trigger").parameters).toEqual({ updates: ["messages"], options: { messageStatusUpdates: ["delivered", "failed"] } });
    const original = source.toJSON() as unknown as Graph; expect(graph.connections).toEqual(original.connections);
    for (const name of ["WhatsApp Trigger", ROUTE, LOOKUP, PREPARE, POST, RESULT]) expect(node(name)).toEqual(node(name, original));
    expect(node(SPLIT).parameters.jsCode).not.toContain("__INLINE");
  });
  it("ausência de prova impede payload publicável; prova fixture válida aceita JSON exato", () => {
    expect(() => preparePrincipalStatusPublication(graph, target)).toThrow("status-origin-unverified");
    expect(preparePrincipalStatusPublication(graph, target, evidence)).toBe(graph);
  });
  it.each([{ activeVersionId: "00000000-0000-4000-8000-000000000099" }, { triggerVersion: 2 }, { rejectsInvalidSignatures: false }, { signatureInput: "parsed-body" }, { acceptsValidSignatures: false }])("HMAC/versão instalados ausentes/divergentes não permitem publicar %#", (patch) => {
    expect(() => preparePrincipalStatusPublication(graph, target, { ...evidence, ...patch } as StatusPublicationEvidence)).toThrow("status-origin-unverified");
  });
  it("guarda também rejeita serializer default all", () => {
    const wrong = structuredClone(graph); node("WhatsApp Trigger", wrong).parameters.options = { messageStatusUpdates: ["all"] };
    expect(() => preparePrincipalStatusPublication(wrong, target, evidence)).toThrow("status-trigger-config-unverified");
  });
});
