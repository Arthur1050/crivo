import { describe, expect, it } from "vitest";
import { splitWhatsappEvents } from "../whatsapp-events.mjs";
import { normalizeEvent } from "../normalize-event.mjs";

const message = (id = "inbound-1") => ({ id, from: "5534999990001", timestamp: "1754395800", type: "text", text: { body: "Oi" } });
const status = (id = "wamid-1", state = "delivered") => ({ id, status: state, timestamp: "1754395800", recipient_id: "5534999990001" });
const value = (phone = "109876543210001", patch: Record<string, unknown> = {}) => ({ metadata: { phone_number_id: phone }, ...patch });
const normalized = (wamid = "wamid-1", state = "delivered") => ({ wamid, status: state, timestamp: "2025-08-05T12:10:00.000Z" });
const wrap = (...values: unknown[]) => ({ entry: [{ id: "waba-do-envelope", changes: values.map((v) => ({ field: "messages", value: v })) }] });

describe("splitWhatsappEvents (T48 / PRECO-02 AC7)", () => {
  it("inbound puro preserva cada mensagem real em envelope unitário", () => {
    const first = message(), second = message("inbound-2");
    const result = splitWhatsappEvents(value(undefined, { messages: [first, second] }));
    expect(result).toEqual({ messages: [value(undefined, { messages: [first] }), value(undefined, { messages: [second] })], statusBatches: [], statusErrors: [] });
    expect(result.messages.map((event: unknown) => normalizeEvent(wrap(event))?.messageId)).toEqual(["inbound-1", "inbound-2"]);
  });

  it("status puro nunca cria inbound sintético", () => {
    expect(splitWhatsappEvents(value(undefined, { statuses: [status()] }))).toEqual({ messages: [], statusBatches: [{ phoneNumberId: "109876543210001", statuses: [normalized()] }], statusErrors: [] });
  });

  it("mixed conserva inbound e status separados", () => {
    expect(splitWhatsappEvents(wrap(value(undefined, { messages: [message()], statuses: [status()] })))).toEqual({
      messages: [value(undefined, { messages: [message()] })], statusBatches: [{ phoneNumberId: "109876543210001", statuses: [normalized()] }], statusErrors: [],
    });
  });

  it("percorre todos os entries/changes e agrupa por número sem usar destinatário", () => {
    const payload = { entry: [wrap(value("n1", { messages: [message()], statuses: [status("a")] })).entry[0], wrap(value("n2", { statuses: [status("b")] }), value("n1", { statuses: [status("c")] })).entry[0]] };
    expect(splitWhatsappEvents(payload)).toEqual({ messages: [value("n1", { messages: [message()] })], statusBatches: [
      { phoneNumberId: "n1", statuses: [normalized("a"), normalized("c")] }, { phoneNumberId: "n2", statuses: [normalized("b")] },
    ], statusErrors: [] });
  });

  it("itens n8n achatados conservam cada número e todos os inbounds", () => {
    expect(splitWhatsappEvents([{ json: value("n1", { messages: [message("a")] }) }, { json: wrap(value("n2", { messages: [message("b")] })) }]).messages).toEqual([
      value("n1", { messages: [message("a")] }), value("n2", { messages: [message("b")] }),
    ]);
  });

  it("delivered e failed preservam pricing e código sem conversa ou payload bruto", () => {
    const paid = { pricing_model: "PMP", category: "service", type: "regular", billable: true };
    expect(splitWhatsappEvents(value(undefined, { statuses: [{ ...status(), pricing: paid, conversation: { id: "privado" } }, { ...status("failed", "failed"), errors: [{ code: 131026, message: "privado" }] }] })).statusBatches).toEqual([
      { phoneNumberId: "109876543210001", statuses: [{ ...normalized(), pricing: { pricingModel: "PMP", category: "service", pricingType: "regular", billable: true } }, { ...normalized("failed", "failed"), failureCode: 131026 }] },
    ]);
  });

  it("sent/read em replay conservam ordem e identidade sem fabricar pricing", () => {
    const payload = value(undefined, { statuses: [status("a", "read"), status("a", "sent"), status("a", "read")] });
    const expected = { messages: [], statusBatches: [{ phoneNumberId: "109876543210001", statuses: [normalized("a", "read"), normalized("a", "sent"), normalized("a", "read")] }], statusErrors: [] };
    expect(splitWhatsappEvents(payload)).toEqual(expected);
    expect(splitWhatsappEvents(payload)).toEqual(expected);
  });

  it("101 status geram batches 100/1 sem perda", () => {
    const items = Array.from({ length: 101 }, (_, i) => status(`id-${i}`));
    const result = splitWhatsappEvents(value(undefined, { statuses: items }));
    expect(result.statusBatches.map((batch: { statuses: unknown[] }) => batch.statuses.length)).toEqual([100, 1]);
    expect(result.statusBatches.flatMap((batch: { statuses: unknown[] }) => batch.statuses)).toEqual(items.map((item) => normalized(item.id)));
  });

  it("divide mais de100KiB pelo JSON codificado UTF-8, preservando todos status", () => {
    const items = Array.from({ length: 40 }, (_, i) => status(`${i}-${"界".repeat(1800)}`));
    const result = splitWhatsappEvents(value(undefined, { statuses: items }));
    expect(result.statusBatches.length).toBeGreaterThan(1);
    expect(result.statusBatches.every((batch: unknown) => Buffer.byteLength(JSON.stringify(batch), "utf8") <= 100 * 1024)).toBe(true);
    expect(result.statusBatches.flatMap((batch: { statuses: unknown[] }) => batch.statuses)).toEqual(items.map((item) => normalized(item.id)));
    expect(result.statusErrors).toEqual([]);
  });

  it("campos desconhecidos não vazam para o contrato e pricing desconhecido não vira gratuito", () => {
    expect(splitWhatsappEvents(value(undefined, { extra: "envelope", statuses: [{ ...status(), extra: "privado", pricing: { pricing_model: "futuro", category: "outra", billable: false, extra: true } }] })).statusBatches).toEqual([
      { phoneNumberId: "109876543210001", statuses: [{ ...normalized(), pricing: { pricingModel: "futuro", category: "outra", pricingType: null, billable: false } }] },
    ]);
  });

  it("WABA e tenant nunca são inventados do envelope achatado ou completo", () => {
    expect(splitWhatsappEvents(wrap(value(undefined, { statuses: [status()] })))).toEqual(splitWhatsappEvents(value(undefined, { statuses: [status()] })));
    expect(Object.keys(splitWhatsappEvents(value(undefined, { statuses: [status()] })).statusBatches[0])).toEqual(["phoneNumberId", "statuses"]);
  });

  it("status malformado não elimina inbound nem status válido do mixed", () => {
    expect(splitWhatsappEvents(value(undefined, { messages: [message()], statuses: [{ ...status(), timestamp: "incerto", raw: "privado" }, status("ok")] }))).toEqual({
      messages: [value(undefined, { messages: [message()] })], statusBatches: [{ phoneNumberId: "109876543210001", statuses: [normalized("ok")] }], statusErrors: [{ phoneNumberId: "109876543210001", reason: "invalid-status" }],
    });
  });

  it("número ausente rejeita status e não infere canal do recipient_id", () => {
    expect(splitWhatsappEvents({ messages: [message()], statuses: [status()] })).toEqual({ messages: [{ messages: [message()] }], statusBatches: [], statusErrors: [{ phoneNumberId: null, reason: "missing-phone-number" }] });
  });

  it.each([{ status: "future" }, { id: "x".repeat(2049) }, { timestamp: "999999999999999999" }, { pricing: { billable: "false" } }, { errors: [{ code: -1 }] }])("erro de status isolado preserva inbound %#", (patch) => {
    expect(splitWhatsappEvents(value(undefined, { messages: [message()], statuses: [{ ...status(), ...patch }] }))).toEqual({ messages: [value(undefined, { messages: [message()] })], statusBatches: [], statusErrors: [{ phoneNumberId: "109876543210001", reason: "invalid-status" }] });
  });

  it("array statuses inválido e entradas desconhecidas não criam mensagem", () => {
    expect(splitWhatsappEvents([{ json: value(undefined, { statuses: "privado", messages: [message()] }) }, { json: {} }, { json: null }])).toEqual({ messages: [value(undefined, { messages: [message()] })], statusBatches: [], statusErrors: [{ phoneNumberId: "109876543210001", reason: "invalid-statuses" }] });
  });
});
