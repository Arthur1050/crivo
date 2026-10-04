import "server-only";

/**
 * Cliente da Cloud API do WhatsApp (lote-14 — design.md C4; AD-035): envia
 * texto ao lead pela Graph API, com o token de usuário do sistema em
 * `WHATSAPP_ACCESS_TOKEN`. Nunca lança: toda falha vira um código do union
 * `CloudApiFailure`, que o serviço de envio humano traduz para o corretor.
 * O `fetch` é injetável para que os testes nunca chamem a Meta de verdade.
 */

export const GRAPH_API_VERSION = "v25.0";

/** Tempo máximo de espera pela Meta (spec.md — Assumptions: 15 s). */
export const CLOUD_API_TIMEOUT_MS = 15_000;

// SPEC_DEVIATION: o union do design.md (C4) não lista `nao-configurado`.
// Reason: tasks.md T15 exige que o token ausente devolva `nao-configurado`
// sem chamar o `fetch` (L-030); o serviço o traduz para `envio-nao-configurado`.
export type CloudApiFailure =
  | "nao-configurado"
  | "janela-fechada"
  | "destinatario-invalido"
  | "credencial-invalida"
  | "tempo-esgotado"
  | "falha-meta";

export type CloudApiResult =
  | { ok: true; wamid: string }
  | { ok: false; failure: CloudApiFailure; metaCode?: number };

export interface SendWhatsAppTextInput {
  phoneNumberId: string;
  /** MSISDN do destinatário, já convertido por `toWhatsAppMsisdn`. */
  to: string;
  body: string;
  timeoutMs?: number;
}

export interface CloudApiDependencies {
  fetch?: typeof fetch;
}

const WINDOW_CLOSED_CODE = 131047;
const INVALID_RECIPIENT_CODES = new Set([131030, 131026]);
const INVALID_TOKEN_CODE = 190;

function readMetaCode(payload: unknown): number | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

function readWamid(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const list = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(list)) return null;
  const id = (list[0] as { id?: unknown } | undefined)?.id;
  return typeof id === "string" && id !== "" ? id : null;
}

function mapFailure(httpStatus: number, metaCode: number | undefined): CloudApiFailure {
  if (metaCode === WINDOW_CLOSED_CODE) return "janela-fechada";
  if (metaCode !== undefined && INVALID_RECIPIENT_CODES.has(metaCode)) {
    return "destinatario-invalido";
  }
  if (metaCode === INVALID_TOKEN_CODE || httpStatus === 401 || httpStatus === 403) {
    return "credencial-invalida";
  }
  return "falha-meta";
}

function withMetaCode(failure: CloudApiFailure, metaCode: number | undefined): CloudApiResult {
  return metaCode === undefined ? { ok: false, failure } : { ok: false, failure, metaCode };
}

/**
 * `POST https://graph.facebook.com/v25.0/{phoneNumberId}/messages` com o
 * corpo de texto da Cloud API. Sem token, falha fechada: não chama a rede.
 */
export async function sendWhatsAppText(
  input: SendWhatsAppTextInput,
  deps: CloudApiDependencies = {}
): Promise<CloudApiResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  if (!token) return { ok: false, failure: "nao-configurado" };

  const doFetch = deps.fetch ?? fetch;
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(input.phoneNumberId)}/messages`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "text",
        text: { preview_url: false, body: input.body },
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? CLOUD_API_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error || error instanceof DOMException ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, failure: "tempo-esgotado" };
    }
    return { ok: false, failure: "falha-meta" };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch (error) {
    const name = error instanceof Error || error instanceof DOMException ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, failure: "tempo-esgotado" };
    }
    payload = null;
  }

  if (!response.ok) {
    const metaCode = readMetaCode(payload);
    return withMetaCode(mapFailure(response.status, metaCode), metaCode);
  }

  const wamid = readWamid(payload);
  if (!wamid) return { ok: false, failure: "falha-meta" };
  return { ok: true, wamid };
}

export type ProactivePreflightFailure = "nao-configurado" | "texto-invalido" | "transporte-invalido";
export type ProactiveCloudApiResult =
  | { outcome: "not_called"; failure: ProactivePreflightFailure }
  | { outcome: "accepted"; wamid: string; acceptedAt: Date }
  | { outcome: "refused"; failure: CloudApiFailure; httpStatus: number; metaCode: number }
  | { outcome: "uncertain"; reason: "timeout" | "transport-failure" | "response-interrupted" | "ambiguous-http" | "missing-identity" | "invalid-acceptance-time"; httpStatus?: number; metaCode?: number };

/** Server-only preflight, also used before the permanent dispatch marker. */
export function validateProactiveWhatsAppText(input: SendWhatsAppTextInput):
  { ok: true } | { ok: false; failure: ProactivePreflightFailure } {
  if (!process.env.WHATSAPP_ACCESS_TOKEN?.trim()) return { ok: false, failure: "nao-configurado" };
  if (typeof input.body !== "string" || !input.body.trim() || input.body.length > 4096) {
    return { ok: false, failure: "texto-invalido" };
  }
  if (typeof input.phoneNumberId !== "string" || typeof input.to !== "string"
      || !/^\d{1,32}$/.test(input.phoneNumberId) || !/^\d{1,32}$/.test(input.to)
      || (input.timeoutMs !== undefined && (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0 || input.timeoutMs > 2_147_483_647))) {
    return { ok: false, failure: "transporte-invalido" };
  }
  return { ok: true };
}

/** One invocation only. Once fetch starts, every unproven outcome is uncertain. */
export async function sendProactiveWhatsAppText(
  input: SendWhatsAppTextInput,
  deps: CloudApiDependencies & { clock?: () => Date } = {}
): Promise<ProactiveCloudApiResult> {
  const preflight = validateProactiveWhatsAppText(input);
  if (!preflight.ok) return { outcome: "not_called", failure: preflight.failure };
  const { phoneNumberId, to, body, timeoutMs } = input;
  const token = process.env.WHATSAPP_ACCESS_TOKEN!.trim();
  const doFetch = deps.fetch ?? fetch;
  const clock = deps.clock ?? (() => new Date());
  const signal = AbortSignal.timeout(timeoutMs ?? CLOUD_API_TIMEOUT_MS);
  let response: Response;
  try {
    response = await doFetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to,
        type: "text", text: { preview_url: false, body } }),
      signal,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { outcome: "uncertain", reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "transport-failure" };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { outcome: "uncertain", reason: "response-interrupted", httpStatus: response.status };
  }
  const rawCode = readMetaCode(payload);
  const metaCode = rawCode !== undefined && Number.isSafeInteger(rawCode) && rawCode >= 0 ? rawCode : undefined;
  if (!response.ok) {
    if (response.status >= 400 && response.status < 500 && metaCode !== undefined) {
      return { outcome: "refused", failure: mapFailure(response.status, metaCode), httpStatus: response.status, metaCode };
    }
    return { outcome: "uncertain", reason: "ambiguous-http", httpStatus: response.status,
      ...(metaCode === undefined ? {} : { metaCode }) };
  }
  const wamid = readWamid(payload);
  if (!wamid?.trim()) return { outcome: "uncertain", reason: "missing-identity", httpStatus: response.status };
  try {
    const acceptedAt = clock();
    if (acceptedAt instanceof Date && Number.isFinite(acceptedAt.getTime())) return { outcome: "accepted", wamid, acceptedAt };
  } catch {
    // Acceptance identity exists, but a broken clock cannot fabricate its timestamp.
  }
  return { outcome: "uncertain", reason: "invalid-acceptance-time", httpStatus: response.status };
}
