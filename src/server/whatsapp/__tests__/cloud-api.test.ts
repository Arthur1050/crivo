import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLOUD_API_TIMEOUT_MS,
  GRAPH_API_VERSION,
  sendWhatsAppText,
  sendProactiveWhatsAppText,
  validateProactiveWhatsAppText,
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

describe("transporte proativo — T33, evidência sem retry", () => {
  it("preflight sem credencial não invoca fetch nem expõe entrada", async () => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const fakeFetch = vi.fn();
    expect(validateProactiveWhatsAppText(INPUT)).toEqual({ ok: false, failure: "nao-configurado" });
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: fakeFetch })).toEqual({ outcome: "not_called", failure: "nao-configurado" });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it.each(["", " \n\t", "x".repeat(4097), "😀".repeat(2048) + "x"])("rejeita texto vazio ou >4096 unidades UTF-16 sem fetch (%#)", async (body) => {
    const fakeFetch = vi.fn();
    expect(await sendProactiveWhatsAppText({ ...INPUT, body }, { fetch: fakeFetch })).toEqual({ outcome: "not_called", failure: "texto-invalido" });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it.each([{ phoneNumberId: "../outro" }, { to: "+5534999990000" }, { timeoutMs: Infinity }, { timeoutMs: 0 }])("rejeita transporte inválido antes do fetch (%#)", async (override) => {
    const fakeFetch = vi.fn();
    expect(await sendProactiveWhatsAppText({ ...INPUT, ...override }, { fetch: fakeFetch })).toEqual({ outcome: "not_called", failure: "transporte-invalido" });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("aceita 4096 unidades UTF-16 com wamid factual e instante posterior à resposta", async () => {
    const acceptedAt = new Date("2026-10-04T13:00:00Z");
    const body = "😀".repeat(2048), fakeFetch = vi.fn(async () => jsonResponse(200, { messages: [{ id: "wamid.PROATIVO" }] }));
    const clock = vi.fn(() => {
      expect(fakeFetch).toHaveBeenCalledTimes(1);
      return acceptedAt;
    });
    expect(await sendProactiveWhatsAppText({ ...INPUT, body }, { fetch: fakeFetch, clock })).toEqual({ outcome: "accepted", wamid: "wamid.PROATIVO", acceptedAt });
    const [url, init] = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v25.0/1234567890/messages");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: INPUT.to,
      type: "text", text: { preview_url: false, body } });
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it.each([[131047, "janela-fechada"], [131030, "destinatario-invalido"], [190, "credencial-invalida"], [131056, "falha-meta"]])("recusa explícita preserva código humano %i", async (code, failure) => {
    const fakeFetch = vi.fn(async () => metaError(400, code as number));
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: fakeFetch })).toEqual({ outcome: "refused", failure, httpStatus: 400, metaCode: code });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("timeout real fica incerto depois de uma chamada", async () => {
    const fakeFetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
    }));
    expect(await sendProactiveWhatsAppText({ ...INPUT, timeoutMs: 10 }, { fetch: fakeFetch })).toEqual({ outcome: "uncertain", reason: "timeout" });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([new TypeError("synthetic interruption"), new DOMException("synthetic abort", "AbortError")])("interrupção após invocação não retorna a not_called (%#)", async (error) => {
    const fakeFetch = vi.fn(async () => { throw error; });
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: fakeFetch })).toEqual({ outcome: "uncertain", reason: error.name === "AbortError" ? "timeout" : "transport-failure" });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([500, 503])("HTTP %i permanece ambíguo mesmo com código Meta", async (status) => {
    const fakeFetch = vi.fn(async () => metaError(status, 131047));
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: fakeFetch })).toEqual({ outcome: "uncertain", reason: "ambiguous-http", httpStatus: status, metaCode: 131047 });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("redirect com código Meta não comprova recusa e não é repetido", async () => {
    const fakeFetch = vi.fn(async () => metaError(307, 131047));
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: fakeFetch })).toEqual({ outcome: "uncertain", reason: "ambiguous-http", httpStatus: 307, metaCode: 131047 });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, "190", -1, 1.5])("4xx sem código Meta verificável permanece incerto (%#)", async (code) => {
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: async () => jsonResponse(400, { error: { code } }) })).toEqual({ outcome: "uncertain", reason: "ambiguous-http", httpStatus: 400 });
  });

  it.each([NaN, Infinity, -Infinity])("código Meta não finito não comprova recusa (%#)", async (code) => {
    const response = jsonResponse(400, {});
    vi.spyOn(response, "json").mockResolvedValue({ error: { code } });
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: async () => response })).toEqual({ outcome: "uncertain", reason: "ambiguous-http", httpStatus: 400 });
  });

  it.each([{}, { messages: [] }, { messages: [{ id: "" }] }, { messages: [{ id: " " }] }, { messages: [{ id: 42 }] }])("2xx sem identidade factual é incerto (%#)", async (payload) => {
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: async () => jsonResponse(200, payload) })).toEqual({ outcome: "uncertain", reason: "missing-identity", httpStatus: 200 });
  });

  it.each([200, 400, 503])("JSON interrompido em HTTP %i não comprova aceite ou recusa", async (status) => {
    const response = jsonResponse(status, {});
    vi.spyOn(response, "json").mockRejectedValue(new DOMException("synthetic interruption", "AbortError"));
    const fakeFetch = vi.fn(async () => response);
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: fakeFetch })).toEqual({ outcome: "uncertain", reason: "response-interrupted", httpStatus: status });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([() => new Date(NaN), () => { throw new Error("synthetic clock failure"); }])("relógio inválido após aceite conserva incerteza sem lançar (%#)", async (clock) => {
    const fakeFetch = vi.fn(async () => jsonResponse(200, { messages: [{ id: "wamid.PROATIVO" }] }));
    expect(await sendProactiveWhatsAppText(INPUT, { fetch: fakeFetch, clock })).toEqual({ outcome: "uncertain", reason: "invalid-acceptance-time", httpStatus: 200 });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("usa canal/destino/texto capturados antes de awaits", async () => {
    const input = { ...INPUT }, acceptedAt = new Date("2026-10-04T13:00:00Z");
    const fakeFetch = vi.fn(async () => {
      input.phoneNumberId = "999";
      input.to = "888";
      input.body = "outro texto";
      return jsonResponse(200, { messages: [{ id: "wamid.PROATIVO" }] });
    });
    expect(await sendProactiveWhatsAppText(input, { fetch: fakeFetch, clock: () => acceptedAt })).toEqual({ outcome: "accepted", wamid: "wamid.PROATIVO", acceptedAt });
    const [url, init] = fakeFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v25.0/1234567890/messages");
    expect(JSON.parse(init.body as string)).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: INPUT.to,
      type: "text", text: { preview_url: false, body: INPUT.body } });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
