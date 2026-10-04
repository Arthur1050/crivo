import { afterEach, describe, expect, it, vi } from "vitest";
import source from "../principal";
import generated from "../../generated/principal";
type Edge = { node: string; type: string; index: number };
type Node = { name: string; type: string; parameters: Record<string, unknown> };
type Graph = { nodes: Node[]; connections: Record<string, { main?: (Edge[] | null)[] }> };
const graph = generated.toJSON() as unknown as Graph;
const INIT = "Code: iniciar leitura session-context", READ = "HTTP: POST /leads/{id}/session-context", READY = "Code: session-context pronto", PENDING = "Aceite da retomada pendente?", WAIT = "Aguardar aceite da retomada", AVAILABLE = "Session-context disponível?", CHECK = "Code: sessão expirada?", REBUILD = "Reconstruir memória warm da ponte?", PURGE = "Chat Memory Manager: reconstruir ponte warm", SEED = "Code: selecionar mensagens de semeadura";
const STATE = "Data Table: conversa_estado (antes do buffer)", EVENT = "Code: combinar evento e tenant", GATE = "Code: gate";
function node(name: string, data = graph) { const found = data.nodes.find((entry) => entry.name === name); if (!found) throw new Error(name); return found; }
function targets(name: string, index = 0) { return graph.connections[name]?.main?.[index] ?? []; }
function run(name: string, input: unknown, contexts: Record<string, unknown> = {}) { const $ = (name: string) => { if (!(name in contexts)) throw new Error(name); return { first: () => ({ json: Array.isArray(contexts[name]) ? contexts[name][0] : contexts[name] }), all: () => (Array.isArray(contexts[name]) ? contexts[name] : [contexts[name]]).map((json) => ({ json })) }; }; return new Function("$json", "$input", "$", node(name).parameters.jsCode as string)(input, { first: () => ({ json: Array.isArray(input) ? input[0] : input }), all: () => (Array.isArray(input) ? input : [input]).map((json) => ({ json })) }, $); }
function expr(raw: unknown, input: unknown) { return new Function("$json", "return (" + String(raw).replace(/^=\{\{/, "").replace(/\}\}$/, "") + ");")(input); }
const zero = Date.parse("2026-10-02T00:00:00Z"), at = (hours: number, ms = 0) => new Date(zero + hours * 3600000 + ms).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bufferId = id(5), init = { deadline: zero + 40 * 3600000 + 120000, bufferMessageIds: [bufferId], tenantSlug: "fixture", leadId: id(20) };
const frame = { revision: 3, resetRequestedAt: null, bridge: { state: "accepted", bridgeRevision: 3, bridgeInvalidatedAt: null, resetObservedAt: null, anchorMessageId: id(2), anchorSentAt: at(0), originSessionStartMessageId: id(1), originSessionEndMessageId: id(3), messageId: id(4), firstInboundMessageId: bufferId, firstInboundSentAt: at(40), bridgeLastInboundAt: at(40) } };
const history = [{ id: id(1), sender: "humano", content: "Visita confirmada pela equipe", authorName: "Ana", sentAt: at(-1) }, { id: id(2), sender: "lead", content: "Quero casa", sentAt: at(0) }, { id: id(3), sender: "agente", content: "Em qual região?", sentAt: at(1) }, { id: id(4), sender: "agente", content: "Retomando sua busca", sentAt: at(22) }];
const response = { frame, history, requiresRebuild: true, pendingAcceptance: null, anchor: { id: bufferId, sentAt: at(40) }, agentStateRevision: 4 };
function ready(raw = response) { vi.setSystemTime(zero + 40 * 3600000); return run(READY, raw, { [INIT]: init }).json; }
function check(context = ready(), now = at(40), cache = { lastInboundAt: at(0), memoryResetAt: null }) { return run(CHECK, context, { [READY]: context, [STATE]: cache, [EVENT]: { sentAt: now }, [GATE]: { memoryResetRequestedAt: null } })[0].json; }
afterEach(() => vi.useRealTimers());

describe("T51 — frame único para expiração e semeadura warm/cold", () => {
  it("IDs de exclusão são internos do CRM, nunca wamid; POST usa buffer real", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(zero + 40 * 3600000);
    const initialized = run(INIT, {}, { [GATE]: { id: id(20), tenantSlug: "fixture", bufferArray: [{ messageId: "external" }] }, "HTTP: POST /leads/{id}/messages (lead)": [{ id: bufferId, externalId: "external", sender: "lead" }] }).json;
    expect(initialized).toEqual(init);
    expect(expr(node(READ).parameters.jsonBody, initialized)).toEqual({ bufferMessageIds: [bufferId] });
  });
  it("warm primeiro inbound força apagar memória e usa frame aceito, conservando qualificação/persona", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const state = ready();
    expect(check(state)).toMatchObject({ expired: false, sessionExpired: false, resetDue: false, bridgeRebuild: true });
    expect(targets(REBUILD, 0)).toEqual([{ node: PURGE, type: "main", index: 0 }]);
    expect(targets(PURGE)).toEqual([{ node: "Chat Memory Manager: carregar sessão", type: "main", index: 0 }]);
    expect(node(PURGE).parameters).toEqual({ mode: "delete", deleteMode: "all" });
  });
  it("cold mesma carga preserva origem/equipe/retomada sem repetir firstInbound excluído", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const state = ready();
    const warm = run(SEED, history, { [CHECK]: check(state) }), cold = run(SEED, history, { [CHECK]: check(state) });
    const expected = [
      { json: { type: "system", message: "Mensagem enviada ao lead por Ana, da equipe da imobiliária: Visita confirmada pela equipe", nadaParaSemear: false } },
      { json: { type: "user", message: "Quero casa", nadaParaSemear: false } },
      { json: { type: "ai", message: "Em qual região?", nadaParaSemear: false } },
      { json: { type: "ai", message: "Retomando sua busca", nadaParaSemear: false } },
    ];
    expect(warm).toEqual(expected); expect(cold).toEqual(expected);
  });
  it("pending aguarda apenas até deadline2min, sem frame de ponte ou histórico presumido", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(zero + 40 * 3600000);
    const pending = { ...response, frame: { revision: 3, resetRequestedAt: null, bridge: null }, history: [], requiresRebuild: false, pendingAcceptance: { episodeId: id(30), deadline: new Date(init.deadline).toISOString() } };
    const before = run(READY, pending, { [INIT]: init }).json;
    expect(before).toMatchObject({ available: true, pending: true, history: [], requiresRebuild: false, frame: { bridge: null } });
    vi.setSystemTime(init.deadline); const after = run(READY, pending, { [INIT]: init }).json;
    expect(after).toMatchObject({ available: true, pending: false, history: [], requiresRebuild: false, frame: { bridge: null } });
    expect(targets(PENDING, 0)).toEqual([{ node: WAIT, type: "main", index: 0 }]); expect(targets(WAIT)).toEqual([{ node: READ, type: "main", index: 0 }]);
  });
  it("aceite concluído antes deadline libera reconstrução, incerto mantém sem ponte", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); expect(ready()).toMatchObject({ pending: false, requiresRebuild: true, frame });
    const uncertain = ready({ ...response, frame: { ...frame, revision: 0, bridge: null } as typeof frame, history: [], requiresRebuild: false });
    expect(check(uncertain)).toMatchObject({ bridgeRebuild: false, sessionExpired: true, expired: true });
  });
  it("pending run0 não substitui frame aceito do run final em expiração e semeadura", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const accepted = ready(), earlier = { ...accepted, pending: true, frame: { ...frame, bridge: null }, history: [], requiresRebuild: false };
    const checked = run(CHECK, accepted, { [READY]: earlier, [STATE]: { lastInboundAt: at(0) }, [EVENT]: { sentAt: at(40) }, [GATE]: { memoryResetRequestedAt: null } })[0].json;
    expect(checked).toMatchObject({ bridgeRebuild: true, expired: false, sessionContext: accepted });
    expect(run("HTTP: GET /leads/{id}/messages (semeadura)", {}, { [CHECK]: checked, [READY]: earlier })).toEqual(history.map((entry) => ({ json: entry })));
    expect(run(SEED, history, { [CHECK]: checked, [READY]: earlier }).map((entry: { json: { message: string } }) => entry.json.message)).toEqual(["Mensagem enviada ao lead por Ana, da equipe da imobiliária: Visita confirmada pela equipe", "Quero casa", "Em qual região?", "Retomando sua busca"]);
  });
  it("flag de rebuild não autoriza frame com revisão divergente ou ponte invalidada", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const bridge of [{ ...frame.bridge, bridgeRevision: 2 }, { ...frame.bridge, bridgeInvalidatedAt: at(39) }]) {
      const state = ready({ ...response, frame: { ...frame, bridge } as typeof frame });
      expect(state).toMatchObject({ frame: { bridge: null }, history: [], requiresRebuild: false });
      expect(check(state)).toMatchObject({ bridgeRebuild: false, expired: true });
    }
  });
  it("48h exatas nunca ganham ponte nem histórico remoto", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const invalid = ready({ ...response, frame: { ...frame, bridge: { ...frame.bridge, firstInboundSentAt: at(48), bridgeLastInboundAt: at(48) } } });
    expect(invalid).toMatchObject({ frame: { bridge: null }, history: [], requiresRebuild: false });
  });
  it("depois da primeira resposta, 12h permanece ativa e +1ms volta ao corte normal", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const state = ready({ ...response, requiresRebuild: false });
    expect(check(state, at(52))).toMatchObject({ expired: false, bridgeRebuild: false, sessionExpired: false });
    expect(check(state, at(52, 1))).toMatchObject({ expired: true, bridgeRebuild: false, sessionExpired: true });
  });
  it("frame exclui buffer corrente por IDs e preserva ordem cronológica fornecida pelo CRM", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const state = ready({ ...response, history: [...history, { id: bufferId, sender: "lead", content: "Atual", sentAt: at(40) }] });
    expect(state.history.map((entry: { id: string }) => entry.id)).toEqual(history.map((entry) => entry.id));
    expect(run(SEED, state.history, { [CHECK]: check(state) })).toHaveLength(4);
  });
  it("reset CRM/purgaD invalidam bridge e forçam purga normal que honra reset", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const reset = at(39);
    const state = ready({ ...response, frame: { ...frame, resetRequestedAt: reset } as typeof frame });
    expect(state).toMatchObject({ frame: { bridge: null, resetRequestedAt: reset }, history: [], requiresRebuild: false });
    expect(check(state)).toMatchObject({ resetDue: true, expired: true, bridgeRebuild: false });
    expect(targets(REBUILD, 1)).toEqual([{ node: "Sessão expirada (gap > 12h)?", type: "main", index: 0 }]);
  });
  it("teto50 da carga pronta é respeitado e todos os valores são semeados", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const rows = Array.from({ length: 50 }, (_, n) => ({ id: id(n + 100), sender: "lead", content: `Mensagem${n}`, sentAt: at(30 + n / 10) }));
    const state = ready({ ...response, history: rows }); const seeded = run(SEED, rows, { [CHECK]: check(state) });
    expect(seeded).toEqual(rows.map((entry) => ({ json: { type: "user", message: entry.content, nadaParaSemear: false } })));
  });
  it("falha técnica/DTO ausente não inventa contexto e não libera agente", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const raw of [{ error: "private" }, {}, { ...response, history: null }]) expect(run(READY, raw, { [INIT]: init }).json).toMatchObject({ available: false, pending: false, frame: null, history: [], requiresRebuild: false });
    expect(targets(AVAILABLE, 0)).toEqual([{ node: CHECK, type: "main", index: 0 }]);
    expect(targets(AVAILABLE, 1)).toEqual([{ node: "Code: session-context indisponível", type: "main", index: 0 }]);
    expect(() => run("Code: session-context indisponível", { error: "private" })).toThrow(/^session-context-unavailable$/);
  });
  it("sem ponte segue normal12h e memória apagada carrega mesma history do snapshot", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); const state = ready({ ...response, frame: { revision: 0, resetRequestedAt: null, bridge: null } as typeof frame, requiresRebuild: false });
    expect(check(state)).toMatchObject({ expired: true, sessionExpired: true, bridgeRebuild: false });
    const accepted = ready(); expect(run("HTTP: GET /leads/{id}/messages (semeadura)", {}, { [CHECK]: check(accepted) })).toEqual(history.map((entry) => ({ json: entry })));
  });
  it("buffer>50 ou falta IDpersistido recusa antes POST sem truncar/limpar buffer", () => {
    const buffer = Array.from({ length: 51 }, (_, n) => ({ messageId: `e${n}` })), posted = buffer.map((message, n) => ({ id: id(n + 100), externalId: message.messageId, sender: "lead" }));
    const contexts = { [GATE]: { bufferArray: buffer }, "HTTP: POST /leads/{id}/messages (lead)": posted };
    expect(() => run(INIT, {}, contexts)).toThrow("session-buffer-invalid");
    expect(contexts[GATE].bufferArray).toEqual(buffer);
    expect(() => run(INIT, {}, { ...contexts, [GATE]: { bufferArray: [{ messageId: "missing" }] } })).toThrow("session-buffer-invalid");
  });
  it("fonte/gerado e fluxo read/pending/available entregam único frame a expiração/semeadura", () => {
    expect(graph.connections).toEqual((source.toJSON() as unknown as Graph).connections);
    expect(targets("HTTP: GET /settings")).toEqual([{ node: INIT, type: "main", index: 0 }]);
    expect(targets(INIT)).toEqual([{ node: READ, type: "main", index: 0 }]);
    expect(targets(READ)).toEqual([{ node: READY, type: "main", index: 0 }]);
    expect(targets(PENDING, 1)).toEqual([{ node: AVAILABLE, type: "main", index: 0 }]);
  });
});
