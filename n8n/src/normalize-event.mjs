/**
 * Normaliza um evento webhook da WhatsApp Cloud API (Meta) — design.md,
 * Camada de decisão (AGT-01). Extrai só o que o fluxo precisa de um evento
 * `messages`; eventos `statuses` (delivered/read/sent/failed) e qualquer
 * payload sem os campos de identidade mínimos (phone_number_id/wa_id/id da
 * mensagem/timestamp válido) retornam `null` — nunca lança exceção sobre um
 * payload inesperado (reentrega/replay é rotina numa integração de
 * webhook).
 *
 * Função pura, sem I/O, sem dependências — roda dentro de um Code node do
 * n8n (sandbox: sem `require`, sem rede). Mapeamento de `phone_number_id`
 * para tenant e a decisão de descartar números não mapeados (AGT-01 AC4)
 * acontecem DEPOIS desta função, no lookup da Data Table `tenant_config`
 * (design.md — pipeline, passo 4) — esta função é agnóstica a qual tenant
 * o número pertence.
 *
 * Qualquer mensagem que não seja `type: "text"` (imagem, áudio, documento,
 * figurinha, localização, etc.) é tratada como mídia: `hasMedia: true` e
 * `text: ""` sempre — o agente responde com uma mensagem fixa "sigo por
 * texto" sem depender do conteúdo (spec.md — Edge Cases: mídia nunca é
 * persistida nem interpretada, incondicionalmente).
 *
 * @param {unknown} metaPayload - corpo bruto do POST do webhook da Meta
 * @returns {{waId: string, phoneNumberId: string, messageId: string, text: string, sentAt: string, hasMedia: boolean} | null}
 */
export function normalizeEvent(metaPayload) {
  const value = metaPayload?.entry?.[0]?.changes?.[0]?.value;
  if (!value || typeof value !== "object") return null;

  // Eventos `statuses` (delivered/read/sent/failed) não são mensagens —
  // descartados sem erro (spec.md — Edge Cases).
  const message = Array.isArray(value.messages) ? value.messages[0] : undefined;
  if (!message || typeof message !== "object") return null;

  const phoneNumberId = value.metadata?.phone_number_id;
  const waId = message.from;
  const messageId = message.id;
  if (
    typeof phoneNumberId !== "string" ||
    phoneNumberId === "" ||
    typeof waId !== "string" ||
    waId === "" ||
    typeof messageId !== "string" ||
    messageId === ""
  ) {
    return null;
  }

  const timestampSeconds = Number(message.timestamp);
  if (!Number.isFinite(timestampSeconds)) return null;
  const sentAt = new Date(timestampSeconds * 1000).toISOString();

  const hasMedia = message.type !== "text";
  const text = hasMedia ? "" : message.text?.body ?? "";

  return { waId, phoneNumberId, messageId, text, sentAt, hasMedia };
}
