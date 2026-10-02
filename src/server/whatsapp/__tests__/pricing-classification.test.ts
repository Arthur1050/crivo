import { describe, expect, it } from "vitest";
import { classifyReceipt, emptyReceipt, reduceReceipt, type ReceiptPricing, type ReceiptStatus } from "../statuses";

// Contrato documental PRECO-01/Design; fixtures não comprovam a conta instalada.
const paid: ReceiptPricing = { pricingModel: "PMP", category: "service", pricingType: "regular", billable: true };
const free: ReceiptPricing = { pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false };
const fep: ReceiptPricing = { pricingModel: "PMP", category: "service", pricingType: "free_entry_point", billable: false };
const at = new Date("2026-10-02T12:00:00Z");
const earlier = new Date("2026-10-02T11:59:00Z");
function event(status: ReceiptStatus["status"], pricing?: ReceiptPricing, timestamp = at): ReceiptStatus {
  return { status, timestamp, pricing };
}

describe("T8 — PRECO-01 classificação por entrega, sem inferir franquia", () => {
  it("produção começa sem evidência, preço ou conflito presumido", () => {
    expect(emptyReceipt()).toEqual({
      sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
      pricingModel: null, category: null, pricingType: null, billable: null,
      pricingConflict: false, failureCode: null, classification: "pending",
    });
  });

  it("aceite sem recibo é pendente", () => {
    expect(classifyReceipt(emptyReceipt())).toBe("pending");
  });

  it("sent com pricing ainda é pendente e não confirma cobrança", () => {
    expect(reduceReceipt(emptyReceipt(), event("sent", paid))).toEqual({
      ...emptyReceipt(), sentAt: at,
    });
  });

  it("delivered PMP/service/regular/billable=true confirma tarifável", () => {
    expect(reduceReceipt(emptyReceipt(), event("delivered", paid))).toEqual({
      ...emptyReceipt(), deliveredAt: at, ...paid, classification: "paid_service",
    });
  });

  it("delivered PMP/service/free_customer_service/false confirma franquia", () => {
    expect(reduceReceipt(emptyReceipt(), event("delivered", free))).toEqual({
      ...emptyReceipt(), deliveredAt: at, ...free, classification: "free_service",
    });
  });

  it("FEP compatível é isenção separada da franquia", () => {
    expect(reduceReceipt(emptyReceipt(), event("delivered", fep))).toEqual({
      ...emptyReceipt(), deliveredAt: at, ...fep, classification: "free_entry_point",
    });
  });

  it.each(["utility", "marketing"])("FEP de categoria %s é isenção, sem consumir franquia de serviço", (category) => {
    expect(reduceReceipt(emptyReceipt(), event("delivered", { ...fep, category })).classification).toBe("free_entry_point");
  });

  it("FEP de formato/categoria desconhecida permanece indisponível", () => {
    expect(reduceReceipt(emptyReceipt(), event("delivered", { ...fep, category: "unknown" })).classification).toBe("unavailable");
  });

  it("delivered sem pricing é indisponível, inclusive quando sent tinha pricing", () => {
    const sent = reduceReceipt(emptyReceipt(), event("sent", free));
    const result = reduceReceipt(sent, event("delivered"));
    expect(result.classification).toBe("unavailable");
    expect(result.billable).toBeNull();
    expect(result.pricingType).toBeNull();
  });

  it("categoria de template não entra na franquia", () => {
    expect(reduceReceipt(emptyReceipt(), event("delivered", { ...free, category: "utility" })).classification).toBe("unavailable");
  });

  it("read sem pricing registra entrega sem fabricar preço", () => {
    expect(reduceReceipt(emptyReceipt(), event("read"))).toEqual({
      ...emptyReceipt(), readAt: at, classification: "unavailable",
    });
  });

  it("read conserva preço confirmado; delivered posterior completa read sem pricing", () => {
    const confirmed = reduceReceipt(emptyReceipt(), event("delivered", free, earlier));
    expect(reduceReceipt(confirmed, event("read"))).toEqual({ ...confirmed, readAt: at });
    const read = reduceReceipt(emptyReceipt(), event("read"));
    expect(reduceReceipt(read, event("delivered", free, earlier))).toEqual({ ...confirmed, readAt: at });
  });

  it("read com pricing realmente presente confirma entrega sem fabricar deliveredAt", () => {
    const read = reduceReceipt(emptyReceipt(), event("read", paid));
    expect(read).toEqual({ ...emptyReceipt(), readAt: at, ...paid, classification: "paid_service" });
    const conflict = reduceReceipt(read, event("delivered", free));
    expect(conflict.pricingConflict).toBe(true);
    expect(conflict.classification).toBe("unavailable");
  });

  it("sent atrasado não apaga delivered/read ou classificação", () => {
    const read = reduceReceipt(reduceReceipt(emptyReceipt(), event("delivered", paid)), event("read"));
    expect(reduceReceipt(read, event("sent", free, earlier))).toEqual({ ...read, sentAt: earlier });
  });

  it("failed sem entrega é não entregue sem cobrança confirmada", () => {
    expect(reduceReceipt(emptyReceipt(), { ...event("failed", paid), failureCode: 131047 })).toEqual({
      ...emptyReceipt(), failedAt: at, failureCode: 131047, classification: "not_delivered",
    });
  });

  it("failed posterior não apaga entrega comprovada", () => {
    const delivered = reduceReceipt(emptyReceipt(), event("delivered", paid, earlier));
    expect(reduceReceipt(delivered, { ...event("failed"), failureCode: 131026 })).toEqual({
      ...delivered, failedAt: at, failureCode: 131026,
    });
  });

  it("delivered posterior recupera classificação após failed", () => {
    const failed = reduceReceipt(emptyReceipt(), { ...event("failed", undefined, earlier), failureCode: 131026 });
    expect(reduceReceipt(failed, event("delivered", free))).toEqual({
      ...failed, deliveredAt: at, ...free, classification: "free_service",
    });
  });

  it("replay idêntico não muda evidência nem inventa campos de volume/inbound", () => {
    const first = reduceReceipt(emptyReceipt(), event("delivered", free));
    expect(reduceReceipt(first, event("delivered", free))).toEqual(first);
    expect(Object.keys(first).sort()).toEqual([
      "billable", "category", "classification", "deliveredAt", "failedAt", "failureCode",
      "pricingConflict", "pricingModel", "pricingType", "readAt", "sentAt",
    ].sort());
  });

  it("contradição de pricing persiste indisponível mesmo após novo replay válido", () => {
    const first = reduceReceipt(emptyReceipt(), event("delivered", paid));
    const conflict = reduceReceipt(first, event("delivered", free));
    expect(conflict.pricingConflict).toBe(true);
    expect(conflict.classification).toBe("unavailable");
    expect(reduceReceipt(conflict, event("delivered", paid)).classification).toBe("unavailable");
    expect(reduceReceipt(conflict, event("read")).pricingConflict).toBe(true);
  });

  it("modelo/type/billable desconhecido ou contraditório nunca vira gratuidade", () => {
    for (const pricing of [
      { ...free, pricingModel: "CBP" }, { ...free, pricingType: "unknown" },
      { ...free, billable: true }, { ...paid, billable: false },
      { ...free, billable: null }, { ...fep, pricingModel: null },
    ]) {
      expect(reduceReceipt(emptyReceipt(), event("delivered", pricing)).classification).toBe("unavailable");
    }
  });

  it("ordem invertida produz mesma evidência e conflito sem último evento vencer", () => {
    const events = [event("sent", undefined, earlier), event("delivered", paid), event("delivered", free, earlier), event("read"), event("failed")];
    const forward = events.reduce(reduceReceipt, emptyReceipt());
    const reverse = [...events].reverse().reduce(reduceReceipt, emptyReceipt());
    expect(forward).toEqual(reverse);
    expect(forward.classification).toBe("unavailable");
    expect(forward.deliveredAt).toEqual(earlier);
  });

  it("pricing parcial de eventos distintos não fabrica tupla confirmada", () => {
    const a = { pricingModel: "PMP", category: "service", pricingType: null, billable: null };
    const b = { pricingModel: null, category: null, pricingType: "free_customer_service", billable: false };
    const result = reduceReceipt(reduceReceipt(emptyReceipt(), event("delivered", a)), event("delivered", b));
    expect(result.classification).toBe("unavailable");
    expect(reduceReceipt(result, event("delivered", free)).classification).toBe("free_service");
  });

  it("permutações dos parciais e confirmação completa preservam mesmo estado", () => {
    const a = event("delivered", { ...free, pricingType: null, billable: null }, earlier);
    const b = event("read", { ...free, pricingModel: null, category: null });
    expect([a, b].reduce(reduceReceipt, emptyReceipt())).toEqual([b, a].reduce(reduceReceipt, emptyReceipt()));
    expect([a, b].reduce(reduceReceipt, emptyReceipt()).classification).toBe("unavailable");
    const complete = event("delivered", free);
    const expected = { ...emptyReceipt(), ...free, deliveredAt: earlier, readAt: at, classification: "free_service" };
    for (const order of [[a, b, complete], [b, a, complete], [complete, a, b], [a, complete, b], [b, complete, a], [complete, b, a]]) {
      expect(order.reduce(reduceReceipt, emptyReceipt())).toEqual(expected);
    }
  });

  it("objeto pricing vazio/incompleto não promove união de parciais em runtime", () => {
    const a = event("delivered", { ...free, pricingType: null, billable: null });
    const b = event("delivered", { ...free, pricingModel: null, category: null });
    const partial = [a, b].reduce(reduceReceipt, emptyReceipt());
    for (const pricing of [{}, { pricingModel: "PMP" }]) {
      expect(reduceReceipt(partial, event("delivered", pricing as ReceiptPricing))).toEqual(partial);
    }
  });

  it.each([
    [999, free, "free_service"], [1000, free, "free_service"], [1001, paid, "paid_service"],
  ] as const)("entrega %i segue pricing autêntico, sem contador local", (_ordinal, pricing, classification) => {
    expect(reduceReceipt(emptyReceipt(), event("delivered", pricing)).classification).toBe(classification);
  });
});
