import { describe, expect, it } from "vitest";
import source from "../principal";
import generated from "../../generated/principal";
import { parseMessageCreate } from "../../../src/server/integration/parsers";
import { readInlinedModule } from "../../../scripts/n8n-inline.mjs";

type Node = { name: string; retryOnFail?: boolean; maxTries?: number; onError?: string; parameters: Record<string, unknown> };
type Graph = { nodes: Node[]; connections: Record<string, { main?: ({ node: string; type: string; index: number }[] | null)[] }> };
const graph = generated.toJSON() as unknown as Graph;
const NORMALIZE = "Code: destinatário do envio fixo", SEND = "WhatsApp: enviar mensagem fixa", REGISTER = "HTTP: registrar mensagem fixa", GATE = "Code: gate", FINAL = "Code: finalizar opt-out", FALLBACK = "Code: preparar envio de contingência";
const gate = { id: "00000000-0000-4000-8000-000000000001", tenantSlug: "fixture-a", phoneNumberId: "430000000000001", waId: "553499532444" }, sentAt = "2026-10-04T20:00:00.000Z", accepted = { messages: [{ id: "wamid.fixed.fixture" }] };
function node(name: string, data = graph) { const found = data.nodes.find((row) => row.name === name); if (!found) throw new Error(name); return found; }
function targets(name: string, index = 0) { return graph.connections[name]?.main?.[index] ?? []; }
function run(name: string, input: unknown, contexts: Record<string, unknown> = {}) { return new Function("$json", "$input", "$", node(name).parameters.jsCode as string)(input, { first: () => ({ json: input }) }, (name: string) => ({ first: () => ({ json: contexts[name] }) }))[0].json; }
function expr(value: unknown, input: unknown, snapshot: unknown) { return new Function("$json", "$", "$now", "return (" + String(value).replace(/^=\{\{/, "").replace(/\}\}$/, "") + ");")(input, (name: string) => ({ first: () => ({ json: name === NORMALIZE ? snapshot : { whatsappPhoneNumberId: "430000000000099" } }) }), { toISO: () => sentAt }); }
function fixed(text = "Resposta fixa", phoneNumberId: string | undefined = gate.phoneNumberId) { return run(NORMALIZE, { mensagens: [text], waId: gate.waId, phoneNumberId, tenantSlug: gate.tenantSlug, leadId: gate.id }); }
function payload(snapshot = fixed(), response: unknown = accepted) { return expr(node(REGISTER).parameters.jsonBody, response, snapshot); }

describe("T53 — canal factual compartilhado pelas saídas fixas", () => {
  it("opt-out conserva confirmação única e registra o snapshot depois das purgas", () => {
    const finalized = run(FINAL, {}, { [GATE]: gate });
    expect(finalized.mensagens).toEqual(["Pronto, registramos seu pedido. Você não vai mais receber mensagens nossas por este número. Até mais!"]);
    const restored = run("Code: restaurar payload do opt-out", { id: 99 }, { [FINAL]: finalized }), snapshot = run(NORMALIZE, restored);
    expect(payload(snapshot)).toEqual({ externalId: accepted.messages[0].id, sender: "agente", content: finalized.mensagens[0], sentAt, whatsappPhoneNumberId: gate.phoneNumberId });
    expect(targets("Code: restaurar payload do opt-out")).toEqual([{ node: NORMALIZE, type: "main", index: 0 }]);
    expect(graph.nodes.filter((entry) => String(entry.parameters.jsCode).includes("const mensagens = [OPT_OUT_CONFIRMATION]")).map((entry) => entry.name)).toEqual([FINAL]);
  });
  it("contingência usa canal do gate, conteúdo factual e mesma cauda de envio/registro", () => {
    const prepared = run(FALLBACK, {}, { [GATE]: gate, "Code: finalizar turno do agente": { respostaFallback: "Em qual região você procura?", fase: "qualificando" } }), snapshot = run(NORMALIZE, prepared);
    expect(payload(snapshot)).toEqual({ externalId: accepted.messages[0].id, sender: "agente", content: "Em qual região você procura?", sentAt, whatsappPhoneNumberId: gate.phoneNumberId });
    expect(targets("Agente pode enviar no turno?", 0)).toEqual([{ node: FALLBACK, type: "main", index: 0 }]);
    expect(targets(FALLBACK)).toEqual([{ node: NORMALIZE, type: "main", index: 0 }]);
  });
  it("aceite mantém autoria agente e identidade wamid da Meta, sem campos da resposta/modelo", () => {
    const body = payload(fixed(), { ...accepted, phoneNumberId: "430000000000099", externalId: "invented", sender: "humano" });
    expect(body).toEqual({ externalId: "wamid.fixed.fixture", sender: "agente", content: "Resposta fixa", sentAt, whatsappPhoneNumberId: gate.phoneNumberId });
    expect(parseMessageCreate(body)).toEqual({ ok: true, dto: { ...body, sentAt: new Date(sentAt) } });
  });
  it("falha do registro repete só persistência e impede fechamento antes de gravar", () => {
    expect(node(REGISTER)).toMatchObject({ retryOnFail: true, maxTries: 3 }); expect(node(REGISTER).onError).toBeUndefined(); expect(node(SEND).retryOnFail).not.toBe(true);
    expect(targets(NORMALIZE)).toEqual([{ node: SEND, type: "main", index: 0 }]); expect(targets(SEND)).toEqual([{ node: REGISTER, type: "main", index: 0 }]);
    expect(targets(REGISTER)).toEqual([{ node: "Code: preparar clear de buffer (envio fixo)", type: "main", index: 0 }]);
  });
  it("número registrado é exatamente o usado no send, mesmo depois de troca no cadastro", () => {
    const snapshot = fixed(), body = payload(snapshot);
    expect(expr(node(SEND).parameters.phoneNumberId, snapshot, snapshot)).toBe(body.whatsappPhoneNumberId); expect(body.whatsappPhoneNumberId).toBe("430000000000001");
    expect(String(node(REGISTER).parameters.jsonBody)).toContain("$('Code: destinatário do envio fixo').first().json.phoneNumberId");
  });
  it("histórico/legado ausente nunca é enriquecido pelo número atual do lead", () => {
    const body = payload({ ...fixed("Legado"), phoneNumberId: undefined });
    expect(body.whatsappPhoneNumberId).toBeUndefined();
    expect(parseMessageCreate(JSON.parse(JSON.stringify(body)))).toEqual({ ok: true, dto: { externalId: "wamid.fixed.fixture", sender: "agente", content: "Legado", sentAt: new Date(sentAt) } });
  });
  it("receipt antecipado/replay conservam chave tenant/canal/wamid; saída não altera inbound/consumo", () => {
    const body = payload(), header = node(REGISTER).parameters.headerParameters as { parameters: { value: unknown }[] };
    expect({ tenantSlug: expr(header.parameters[0].value, accepted, fixed()), phoneNumberId: body.whatsappPhoneNumberId, wamid: body.externalId }).toEqual({ tenantSlug: "fixture-a", phoneNumberId: "430000000000001", wamid: "wamid.fixed.fixture" });
    expect(Object.keys(body).sort()).toEqual(["content", "externalId", "sender", "sentAt", "whatsappPhoneNumberId"]);
    expect(parseMessageCreate(payload(fixed(), { messages: [{ id: undefined }] })).ok).toBe(false);
  });
  it("todos ramos mantêm wiring e nós afetados integralmente equivalentes à fonte", () => {
    const original = source.toJSON() as unknown as Graph;
    expect(graph.connections).toEqual(original.connections);
    for (const name of [NORMALIZE, SEND, REGISTER, FINAL, FALLBACK]) {
      const expected = structuredClone(node(name, original));
      if (typeof expected.parameters.jsCode === "string") expected.parameters.jsCode = expected.parameters.jsCode.replace(/'?__INLINE\(([a-zA-Z0-9_.-]+)\)__'?/g, (_match, file: string) => readInlinedModule(file));
      expect(node(name)).toEqual(expected);
    }
  });
});
