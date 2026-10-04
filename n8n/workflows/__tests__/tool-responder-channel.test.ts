import { describe, expect, it } from "vitest";
import source from "../tool-responder-lead";
import generated from "../../generated/tool-responder-lead";
import { parseMessageCreate } from "../../../src/server/integration/parsers";

type Node = { name: string; retryOnFail?: boolean; maxTries?: number; parameters: Record<string, unknown> };
type Graph = { nodes: Node[]; connections: Record<string, { main?: ({ node: string; type: string; index: number }[] | null)[] }> };
const graph = generated.toJSON() as unknown as Graph;
const NORMALIZE = "Code: normalizar destinatario do envio", SEND = "WhatsApp: enviar resposta do agente", REGISTER = "HTTP: registrar mensagem do agente", PERSIST = "Data Table: gravar abertura", ACCEPT = "Code: aceite (confirma envio ao agente)";
const snapshot = { leadId: "00000000-0000-4000-8000-000000000001", tenantSlug: "fixture-a", phoneNumberId: "430000000000001", mensagem: "Qual a região?", recipientMsisdn: "5534999532444" };
const accepted = { messages: [{ id: "wamid.accepted.fixture" }] }, sentAt = "2026-10-04T20:00:00.000Z";
function node(name: string, data = graph) { const found = data.nodes.find((row) => row.name === name); if (!found) throw new Error(name); return found; }
function targets(name: string) { return graph.connections[name]?.main?.[0] ?? []; }
function evaluate(expression: unknown, input: unknown = accepted, transport: unknown = snapshot, others: Record<string, unknown> = {}) {
  const $ = (name: string) => ({ first: () => ({ json: name === NORMALIZE ? transport : others[name] }) });
  return new Function("$json", "$", "$now", "return (" + String(expression).replace(/^=\{\{/, "").replace(/\}\}$/, "") + ");")(input, $, { toISO: () => sentAt });
}
function payload(input = accepted, transport = snapshot) { return evaluate(node(REGISTER).parameters.jsonBody, input, transport); }

describe("T52 — identidade factual da resposta normal aceita", () => {
  it("aceite registra texto, wamid e o mesmo número usado pelo transporte", () => {
    const body = payload();
    expect(body).toEqual({ externalId: "wamid.accepted.fixture", sender: "agente", content: "Qual a região?", sentAt, whatsappPhoneNumberId: "430000000000001" });
    expect(evaluate(node(SEND).parameters.phoneNumberId, snapshot)).toBe(body.whatsappPhoneNumberId);
    expect(parseMessageCreate(body)).toEqual({ ok: true, dto: { ...body, sentAt: new Date(sentAt) } });
  });
  it("status anterior ao registro possui a mesma chave tenant/canal/wamid, sem incluir receipt sintético", () => {
    const orphan = { tenantSlug: "fixture-a", phoneNumberId: "430000000000001", wamid: "wamid.accepted.fixture" };
    const body = payload(), header = node(REGISTER).parameters.headerParameters as { parameters: { name: string; value: unknown }[] };
    expect({ tenantSlug: evaluate(header.parameters[0].value), phoneNumberId: body.whatsappPhoneNumberId, wamid: body.externalId }).toEqual(orphan);
    expect(Object.keys(body).sort()).toEqual(["content", "externalId", "sender", "sentAt", "whatsappPhoneNumberId"]);
  });
  it("falha de registro repete só CRM, sem reenvio e sem confirmar antes da persistência", () => {
    expect(node(REGISTER)).toMatchObject({ retryOnFail: true, maxTries: 3 });
    expect(node(SEND).retryOnFail).not.toBe(true);
    expect(targets(SEND)).toEqual([{ node: REGISTER, type: "main", index: 0 }]);
    expect(targets(REGISTER)).toEqual([{ node: PERSIST, type: "main", index: 0 }]);
    expect(targets(PERSIST)).toEqual([{ node: ACCEPT, type: "main", index: 0 }]);
    expect(node(REGISTER)).not.toHaveProperty("onError");
  });
  it("troca do canal do lead depois do send não altera canal da mensagem aceita", () => {
    const body = evaluate(node(REGISTER).parameters.jsonBody, accepted, snapshot, { "HTTP: GET /leads/{id} (antes do envio)": { whatsappPhoneNumberId: "430000000000099" } });
    expect(body.whatsappPhoneNumberId).toBe("430000000000001");
    expect(String(node(REGISTER).parameters.url)).toContain("/leads/{{ $('Code: normalizar destinatario do envio').first().json.leadId }}/messages");
  });
  it("legado sem canal mantém ausência, nunca preenche com número atual ou inferido do wamid", () => {
    const body = payload(accepted, { ...snapshot, phoneNumberId: undefined } as unknown as typeof snapshot);
    expect(body.whatsappPhoneNumberId).toBeUndefined();
    const parsed = parseMessageCreate(JSON.parse(JSON.stringify(body)));
    expect(parsed).toEqual({ ok: true, dto: { externalId: accepted.messages[0].id, sender: "agente", content: snapshot.mensagem, sentAt: new Date(sentAt) } });
  });
  it("identidade deriva da invocação de transporte, não de campos sugeridos pelo modelo/resposta", () => {
    const body = payload({ ...accepted, phoneNumberId: "430000000000099", externalId: "invented", whatsappPhoneNumberId: "430000000000099" } as typeof accepted);
    expect(body.whatsappPhoneNumberId).toBe(snapshot.phoneNumberId); expect(body.externalId).toBe(accepted.messages[0].id);
    expect(String(node(REGISTER).parameters.jsonBody)).not.toMatch(/fromAI|fromAi/);
    expect(String(node(SEND).parameters.phoneNumberId)).toBe("={{ $json.phoneNumberId }}");
  });
  it("replay de persistência mantém identidade original sem fabricar aceite quando falta wamid", () => {
    const replay = evaluate(node(REGISTER).parameters.jsonBody, { messages: [{ id: accepted.messages[0].id }], phoneNumberId: "430000000000099" }, snapshot, { "HTTP: GET /leads/{id} (antes do envio)": { whatsappPhoneNumberId: "430000000000099" } });
    expect(replay).toEqual({ externalId: "wamid.accepted.fixture", sender: "agente", content: "Qual a região?", sentAt, whatsappPhoneNumberId: "430000000000001" });
    expect(parseMessageCreate(payload({ messages: [{ id: undefined }] } as unknown as typeof accepted)).ok).toBe(false);
  });
  it("não escreve lastInboundAt, consumo ou classificação de preço; fonte/gerado mantêm contrato e wiring", () => {
    expect(payload()).not.toHaveProperty("lastInboundAt"); expect(payload()).not.toHaveProperty("classification");
    expect(JSON.stringify(node(REGISTER).parameters)).not.toMatch(/usage|consumption|lastInboundAt|billable|pricing/);
    const original = source.toJSON() as unknown as Graph;
    expect(node(REGISTER).parameters).toEqual(node(REGISTER, original).parameters);
    expect(graph.connections).toEqual(original.connections);
  });
});
