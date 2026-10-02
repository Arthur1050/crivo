import "server-only";

export type ReceiptClassification = "pending" | "paid_service" | "free_service" | "free_entry_point" | "unavailable" | "not_delivered";
export type ReceiptPricing = {
  pricingModel: string | null;
  category: string | null;
  pricingType: string | null;
  billable: boolean | null;
};
export type ReceiptEvidence = ReceiptPricing & {
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  failureCode: number | null;
  pricingConflict: boolean;
  classification: ReceiptClassification;
};
export type ReceiptStatus = {
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: Date;
  pricing?: ReceiptPricing;
  failureCode?: number;
};

export function emptyReceipt(): ReceiptEvidence {
  return {
    sentAt: null, deliveredAt: null, readAt: null, failedAt: null,
    pricingModel: null, category: null, pricingType: null, billable: null,
    pricingConflict: false, failureCode: null, classification: "pending",
  };
}

function confirmed(classification: ReceiptClassification): boolean {
  return classification === "paid_service" || classification === "free_service" || classification === "free_entry_point";
}

/** Só uma tupla efetivamente observada numa entrega pode confirmar cobrança. */
function classifyEvidence(
  receipt: ReceiptEvidence,
  completeDeliveryPricing: boolean,
): ReceiptClassification {
  if (receipt.pricingConflict) return "unavailable";
  if (!receipt.deliveredAt && !receipt.readAt) return receipt.failedAt ? "not_delivered" : "pending";
  if (!completeDeliveryPricing || receipt.pricingModel !== "PMP") return "unavailable";
  if (receipt.pricingType === "free_entry_point" && receipt.billable === false &&
    ["service", "utility", "marketing", "authentication"].includes(receipt.category ?? "")) return "free_entry_point";
  if (receipt.category !== "service") return "unavailable";
  if (receipt.pricingType === "regular" && receipt.billable === true) return "paid_service";
  if (receipt.pricingType === "free_customer_service" && receipt.billable === false) return "free_service";
  return "unavailable";
}

export function classifyReceipt(receipt: ReceiptEvidence): ReceiptClassification {
  return classifyEvidence(receipt, confirmed(receipt.classification));
}

function earliest(current: Date | null, incoming: Date): Date {
  return new Date(Math.min(current?.getTime() ?? Infinity, incoming.getTime()));
}

function observed<T extends string | boolean>(current: T | null, incoming: T | null): T | null {
  if (current === null) return incoming;
  if (incoming === null) return current;
  // Escolha canônica só para guardar evidência; nunca decide qual preço vence.
  return String(current) <= String(incoming) ? current : incoming;
}

/**
 * Redução pura: instantes mínimos por tipo; entrega/read sobrevivem a sent/failed.
 * Só delivery/read fornecem pricing. Campos parciais conservam contradições,
 * mas sua união não fabrica uma tupla de confirmação que a Meta não enviou.
 * Classificação confirmada anterior é a prova durável de uma tupla completa;
 * conflito é absorvente e torna a classificação indisponível para revisão.
 */
export function reduceReceipt(current: ReceiptEvidence, incoming: ReceiptStatus): ReceiptEvidence {
  const next = { ...current };
  const field = { sent: "sentAt", delivered: "deliveredAt", read: "readAt", failed: "failedAt" } as const;
  next[field[incoming.status]] = earliest(current[field[incoming.status]], incoming.timestamp);
  if (incoming.status === "failed" && incoming.failureCode !== undefined) {
    next.failureCode = Math.min(current.failureCode ?? Infinity, incoming.failureCode);
  }

  let completeDeliveryPricing = confirmed(current.classification);
  if ((incoming.status === "delivered" || incoming.status === "read") && incoming.pricing) {
    const pricing: ReceiptPricing = {
      pricingModel: incoming.pricing.pricingModel ?? null,
      category: incoming.pricing.category ?? null,
      pricingType: incoming.pricing.pricingType ?? null,
      billable: incoming.pricing.billable ?? null,
    };
    completeDeliveryPricing ||= pricing.pricingModel !== null && pricing.category !== null &&
      pricing.pricingType !== null && pricing.billable !== null;
    for (const key of ["pricingModel", "category", "pricingType", "billable"] as const) {
      if (current[key] !== null && pricing[key] !== null && current[key] !== pricing[key]) next.pricingConflict = true;
    }
    next.pricingModel = observed(current.pricingModel, pricing.pricingModel);
    next.category = observed(current.category, pricing.category);
    next.pricingType = observed(current.pricingType, pricing.pricingType);
    next.billable = observed(current.billable, pricing.billable);
  }
  next.classification = classifyEvidence(next, completeDeliveryPricing);
  return next;
}
