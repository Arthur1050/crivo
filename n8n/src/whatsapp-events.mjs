/** Splitter puro para change.value do Trigger e corpos entry/changes da Meta.
 * Status saem no DTO estrito do CRM; não autentica origem nem resolve WABA/tenant.
 * Inbound unitário preserva metadata/contacts e nunca contém statuses.
 * Erros não carregam payload bruto e não interrompem o ramo inbound.
 */
export function splitWhatsappEvents(input) {
  const messages = [], statusBatches = [], statusErrors = [];
  const grouped = new Map();
  const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const bounded = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;

  function normalizeStatus(raw) {
    if (!record(raw) || !bounded(raw.id, 2048) || !["sent", "delivered", "read", "failed"].includes(raw.status)) return null;
    if ((typeof raw.timestamp !== "string" && typeof raw.timestamp !== "number") || !/^\d+$/.test(String(raw.timestamp))) return null;
    const date = new Date(Number(raw.timestamp) * 1000);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 0 || date.getUTCFullYear() > 9999) return null;
    const result = { wamid: raw.id, status: raw.status, timestamp: date.toISOString() };
    if (raw.pricing !== undefined && raw.pricing !== null) {
      if (!record(raw.pricing)) return null;
      const p = raw.pricing;
      for (const key of ["pricing_model", "category", "type"]) {
        if (p[key] !== undefined && p[key] !== null && !bounded(p[key], 128)) return null;
      }
      if (p.billable !== undefined && p.billable !== null && typeof p.billable !== "boolean") return null;
      result.pricing = { pricingModel: p.pricing_model ?? null, category: p.category ?? null, pricingType: p.type ?? null, billable: p.billable ?? null };
    }
    const code = raw.errors?.[0]?.code;
    if (code !== undefined) {
      if (!Number.isInteger(code) || code < 0 || code > 2147483647) return null;
      result.failureCode = code;
    }
    return result;
  }

  function consume(value) {
    if (!record(value)) return;
    if (Array.isArray(value.messages)) {
      const envelope = { ...value };
      delete envelope.statuses;
      delete envelope.messages;
      for (const message of value.messages) {
        if (record(message)) messages.push({ ...envelope, messages: [message] });
      }
    }
    if (value.statuses === undefined) return;
    const phoneNumberId = bounded(value.metadata?.phone_number_id, 128) ? value.metadata.phone_number_id : null;
    if (!Array.isArray(value.statuses)) {
      statusErrors.push({ phoneNumberId, reason: "invalid-statuses" });
      return;
    }
    if (!value.statuses.length) return;
    if (!phoneNumberId) {
      statusErrors.push({ phoneNumberId, reason: "missing-phone-number" });
      return;
    }
    for (const raw of value.statuses) {
      const status = normalizeStatus(raw);
      if (!status) {
        statusErrors.push({ phoneNumberId, reason: "invalid-status" });
        continue;
      }
      if (!grouped.has(phoneNumberId)) grouped.set(phoneNumberId, []);
      grouped.get(phoneNumberId).push(status);
    }
  }

  for (const item of Array.isArray(input) ? input : [input]) {
    const payload = record(item) && Object.hasOwn(item, "json") ? item.json : item;
    if (Array.isArray(payload?.entry)) {
      for (const entry of payload.entry) {
        if (Array.isArray(entry?.changes)) for (const change of entry.changes) consume(change?.value);
      }
    } else consume(payload);
  }

  // Sandbox Code node não precisa de Buffer/TextEncoder. JSON.stringify escapa
  // surrogates isolados; cada code point abaixo conta seus bytes UTF-8 reais.
  function bytes(batch) {
    let total = 0;
    for (const char of JSON.stringify(batch)) {
      const point = char.codePointAt(0);
      total += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    }
    return total;
  }
  for (const [phoneNumberId, statuses] of grouped) {
    let batch = { phoneNumberId, statuses: [] };
    for (const status of statuses) {
      const next = { phoneNumberId, statuses: [...batch.statuses, status] };
      if (batch.statuses.length && (next.statuses.length > 100 || bytes(next) > 100 * 1024)) {
        statusBatches.push(batch);
        batch = { phoneNumberId, statuses: [status] };
      } else batch = next;
    }
    if (batch.statuses.length) statusBatches.push(batch);
  }
  return { messages, statusBatches, statusErrors };
}
