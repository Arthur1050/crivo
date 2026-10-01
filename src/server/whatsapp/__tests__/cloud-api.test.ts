import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_API_TIMEOUT_MS,
  GRAPH_API_VERSION,
  sendWhatsAppText,
} from "../cloud-api";

/**
 * Cliente da Cloud API (lote-14, T15 — ENVIO-01, JANELA-01; design.md C4).
 * A Meta nunca é chamada de verdade: todo `fetch` é falso e injetado, e o
 * token é um valor sintético posto no ambiente pelo teste.
 */

const SYNTHETIC_TOKEN = "token-sintetico-de-teste";
const INPUT = {
  phoneNumberId: "1234567890",
  to: "5534999990000",
  body: "Oi, aqui é a Ana, corretora",
};

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function metaError(status: number, code: number): Response {
  return jsonResponse(status, { error: { message: "erro sintético", type: "OAuthException", code } });
}

beforeEach(() => {
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", SYNTHETIC_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendWhatsAppText — sucesso e formato do pedido", () => {
  it("devolve messages[0].id como wamid e chama a URL, o header e o corpo exatos", async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse(200, {
        messaging_product: "whatsapp",
        contacts: [{ input: INPUT.to, wa_id: INPUT.to }],
        messages: [{ id: "wamid.SINTETICO" }],
      })
    );

    const result = await sendWhatsAppText(INPUT, { fetch: fakeFetch });

    expect(result).toEqual({ ok: true, wamid: "wamid.SINTETICO" });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v25.0/1234567890/messages");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${SYNTHETIC_TOKEN}`);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5534999990000",
      type: "text",
      text: { preview_url: false, body: "Oi, aqui é a Ana, corretora" },
    });
  });
});

describe("sendWhatsAppText — mapeamento de erros da Meta", () => {
  it("131047 → janela-fechada", async () => {
    const result = await sendWhatsAppText(INPUT, { fetch: async () => metaError(400, 131047) });
    expect(result).toEqual({ ok: false, failure: "janela-fechada", metaCode: 131047 });
  });

  it("131030 → destinatario-invalido", async () => {
    const result = await sendWhatsAppText(INPUT, { fetch: async () => metaError(400, 131030) });
    expect(result).toEqual({ ok: false, failure: "destinatario-invalido", metaCode: 131030 });
  });

  it("131026 → destinatario-invalido", async () => {
    const result = await sendWhatsAppText(INPUT, { fetch: async () => metaError(400, 131026) });
    expect(result).toEqual({ ok: false, failure: "destinatario-invalido", metaCode: 131026 });
  });

  it("190 → credencial-invalida", async () => {
    const result = await sendWhatsAppText(INPUT, { fetch: async () => metaError(400, 190) });
    expect(result).toEqual({ ok: false, failure: "credencial-invalida", metaCode: 190 });
  });

  it("HTTP 401 → credencial-invalida", async () => {
    const result = await sendWhatsAppText(INPUT, { fetch: async () => metaError(401, 1) });
    expect(result).toEqual({ ok: false, failure: "credencial-invalida", metaCode: 1 });
  });

  it("HTTP 403 → credencial-invalida", async () => {
    const result = await sendWhatsAppText(INPUT, { fetch: async () => metaError(403, 10) });
    expect(result).toEqual({ ok: false, failure: "credencial-invalida", metaCode: 10 });
  });

  it("outro código → falha-meta com metaCode", async () => {
    const result = await sendWhatsAppText(INPUT, { fetch: async () => metaError(400, 131056) });
    expect(result).toEqual({ ok: false, failure: "falha-meta", metaCode: 131056 });
  });

  it("erro de rede → falha-meta", async () => {
    const result = await sendWhatsAppText(INPUT, {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(result).toEqual({ ok: false, failure: "falha-meta" });
  });
});

describe("sendWhatsAppText — tempo e versão (L-037)", () => {
  it("timeout aborta o pedido e devolve tempo-esgotado", async () => {
    let aborted = false;
    const hangingFetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(init.signal!.reason);
          });
        })
    );

    const result = await sendWhatsAppText({ ...INPUT, timeoutMs: 20 }, { fetch: hangingFetch });

    expect(result).toEqual({ ok: false, failure: "tempo-esgotado" });
    expect(aborted).toBe(true);
  });

  it("o default de produção é 15.000 ms e a versão é v25.0", async () => {
    expect(CLOUD_API_TIMEOUT_MS).toBe(15_000);
    expect(GRAPH_API_VERSION).toBe("v25.0");

    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    await sendWhatsAppText(INPUT, {
      fetch: async () => jsonResponse(200, { messages: [{ id: "wamid.X" }] }),
    });
    expect(timeoutSpy).toHaveBeenCalledWith(15_000);
  });
});

describe("sendWhatsAppText — falha fechada sem token (L-030)", () => {
  it("token ausente → nao-configurado, sem chamar o fetch", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const fakeFetch = vi.fn(async () => jsonResponse(200, { messages: [{ id: "wamid.X" }] }));

    const result = await sendWhatsAppText(INPUT, { fetch: fakeFetch });

    expect(result).toEqual({ ok: false, failure: "nao-configurado" });
    expect(fakeFetch).toHaveBeenCalledTimes(0);
  });
});
