import { afterEach, describe, expect, it, vi } from "vitest";
import vitestConfig from "../../../../vitest.config";
import { requestStorefrontRevalidation, type RevalidationDeps } from "../revalidation";

const SECRET = "segredo-super-secreto-123";
const CONFIG = { VITRINE_PUBLIC_URL: "https://vitrine.example.test", VITRINE_REVALIDATE_SECRET: SECRET };

function setup(fetchImpl: (...args: Parameters<typeof fetch>) => Promise<Response> | Response) {
  const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => fetchImpl(...args));
  const logger = { info: vi.fn(), warn: vi.fn() };
  const deps: RevalidationDeps = { fetch: fetchMock as unknown as typeof fetch, config: CONFIG, logger };
  return { fetchMock, logger, deps };
}

function allLogged(logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> }): string {
  return [...logger.info.mock.calls, ...logger.warn.mock.calls].map((call) => String(call[0])).join("\n");
}

afterEach(() => {
  vi.useRealTimers();
});

describe("L16a T11 — cliente de revalidação (VREV-01)", () => {
  describe("AC1: o pedido enviado", () => {
    it("POST para <URL>/api/revalidar com Authorization Bearer e corpo exatamente {\"slug\":\"imob-x\"}", async () => {
      const { fetchMock, deps } = setup(() => new Response(null, { status: 200 }));
      const outcome = await requestStorefrontRevalidation("imob-x", deps);

      expect(outcome).toBe("enviado");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://vitrine.example.test/api/revalidar");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
      expect(init?.body).toBe('{"slug":"imob-x"}');
    });

    it("barra final na URL configurada não duplica a barra do caminho", async () => {
      const { fetchMock, deps } = setup(() => new Response(null, { status: 204 }));
      await requestStorefrontRevalidation("imob-x", {
        ...deps,
        config: { ...CONFIG, VITRINE_PUBLIC_URL: "https://vitrine.example.test/" },
      });
      expect(fetchMock.mock.calls[0][0]).toBe("https://vitrine.example.test/api/revalidar");
    });
  });

  describe("AC2: sem configuração não envia nada", () => {
    const cases: Array<[string, RevalidationDeps["config"]]> = [
      ["URL vazia", { ...CONFIG, VITRINE_PUBLIC_URL: "" }],
      ["segredo vazio", { ...CONFIG, VITRINE_REVALIDATE_SECRET: "" }],
      ["as duas ausentes", {}],
    ];
    it.each(cases)("%s → ignorado, zero chamadas e um log info com prefixo e slug", async (_name, config) => {
      const { fetchMock, logger, deps } = setup(() => new Response(null, { status: 200 }));
      const outcome = await requestStorefrontRevalidation("imob-x", { ...deps, config });

      expect(outcome).toBe("ignorado");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info.mock.calls[0][0]).toContain("[vitrine]");
      expect(logger.info.mock.calls[0][0]).toContain("imob-x");
      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("AC3: status fora de 2xx", () => {
    it.each([500, 401, 302])("status %i → falhou e um warn com prefixo, slug e status", async (status) => {
      const { logger, deps } = setup(() => new Response(null, { status }));
      const outcome = await requestStorefrontRevalidation("imob-x", deps);

      expect(outcome).toBe("falhou");
      expect(logger.warn).toHaveBeenCalledTimes(1);
      const message = String(logger.warn.mock.calls[0][0]);
      expect(message).toContain("[vitrine]");
      expect(message).toContain("imob-x");
      expect(message).toContain(String(status));
    });
  });

  describe("AC4: erro de envio e timeout de 3 s", () => {
    it("fetch rejeitado → falhou e um warn com prefixo, slug e o nome do erro", async () => {
      const { logger, deps } = setup(() => {
        throw Object.assign(new TypeError(`fetch failed ${SECRET}`), {});
      });
      const outcome = await requestStorefrontRevalidation("imob-x", deps);

      expect(outcome).toBe("falhou");
      const message = String(logger.warn.mock.calls[0][0]);
      expect(message).toContain("[vitrine]");
      expect(message).toContain("imob-x");
      expect(message).toContain("TypeError");
    });

    it("resposta que não chega em 3 s → falhou, com o sinal abortado e o nome TimeoutError no warn", async () => {
      vi.useFakeTimers();
      const { fetchMock, logger, deps } = setup(() => new Promise<Response>(() => {}));
      const pending = requestStorefrontRevalidation("imob-x", deps);

      await vi.advanceTimersByTimeAsync(2999);
      expect(logger.warn).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(await pending).toBe("falhou");
      expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
      const message = String(logger.warn.mock.calls[0][0]);
      expect(message).toContain("[vitrine]");
      expect(message).toContain("imob-x");
      expect(message).toContain("TimeoutError");
    });
  });

  describe("AC5: nunca repete um envio que falhou", () => {
    it("exatamente uma chamada em 500, em rejeição e em timeout", async () => {
      const status = setup(() => new Response(null, { status: 500 }));
      await requestStorefrontRevalidation("imob-x", status.deps);
      expect(status.fetchMock).toHaveBeenCalledTimes(1);

      const rejected = setup(() => { throw new Error("rede"); });
      await requestStorefrontRevalidation("imob-x", rejected.deps);
      expect(rejected.fetchMock).toHaveBeenCalledTimes(1);

      vi.useFakeTimers();
      const slow = setup(() => new Promise<Response>(() => {}));
      const pending = requestStorefrontRevalidation("imob-x", slow.deps);
      await vi.advanceTimersByTimeAsync(10_000);
      await pending;
      expect(slow.fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("AC6: nenhum caso lança", () => {
    it("fetch que lança de forma síncrona, rejeição com valor não-Error e logger que lança resolvem em falhou", async () => {
      const sync = setup(() => { throw new Error("falha síncrona"); });
      await expect(requestStorefrontRevalidation("imob-x", sync.deps)).resolves.toBe("falhou");

      const odd = setup(() => Promise.reject("texto solto"));
      await expect(requestStorefrontRevalidation("imob-x", odd.deps)).resolves.toBe("falhou");

      const brokenLogger = setup(() => new Response(null, { status: 500 }));
      brokenLogger.logger.warn.mockImplementation(() => { throw new Error("logger quebrado"); });
      await expect(requestStorefrontRevalidation("imob-x", brokenLogger.deps)).resolves.toBe("falhou");

      const brokenInfo = setup(() => new Response(null, { status: 200 }));
      brokenInfo.logger.info.mockImplementation(() => { throw new Error("logger quebrado"); });
      await expect(
        requestStorefrontRevalidation("imob-x", { ...brokenInfo.deps, config: {} })
      ).resolves.toBe("ignorado");
    });
  });

  describe("AC7: o segredo nunca vai para um log", () => {
    it("nem no sucesso, nem no ignorado, nem em qualquer falha (inclusive erro cuja mensagem traz o segredo)", async () => {
      const outputs: string[] = [];
      const run = async (fetchImpl: Parameters<typeof setup>[0], config: RevalidationDeps["config"] = CONFIG) => {
        const { logger, deps } = setup(fetchImpl);
        await requestStorefrontRevalidation("imob-x", { ...deps, config });
        outputs.push(allLogged(logger));
      };
      await run(() => new Response(null, { status: 200 }));
      await run(() => new Response(null, { status: 500 }));
      await run(() => { throw new Error(`Bearer ${SECRET} recusado`); });
      await run(() => new Response(null, { status: 200 }), { VITRINE_PUBLIC_URL: "https://x.test", VITRINE_REVALIDATE_SECRET: "" });
      vi.useFakeTimers();
      const { logger, deps } = setup(() => new Promise<Response>(() => {}));
      const pending = requestStorefrontRevalidation("imob-x", deps);
      await vi.advanceTimersByTimeAsync(3000);
      await pending;
      outputs.push(allLogged(logger));

      expect(outputs.filter((text) => text.length > 0).length).toBeGreaterThanOrEqual(4);
      for (const text of outputs) {
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain("Bearer");
      }
    });
  });

  describe("AC11: nenhum teste chama a vitrine real", () => {
    it("a config do Vitest define VITRINE_PUBLIC_URL e VITRINE_REVALIDATE_SECRET vazios (L-037)", () => {
      const env = (vitestConfig as { test?: { env?: Record<string, string> } }).test?.env;
      expect(env).toBeDefined();
      expect(env!.VITRINE_PUBLIC_URL).toBe("");
      expect(env!.VITRINE_REVALIDATE_SECRET).toBe("");
    });

    it("no ambiente do teste as duas variáveis estão vazias, então o padrão do cliente é ignorar sem tocar a rede", async () => {
      expect(process.env.VITRINE_PUBLIC_URL).toBe("");
      expect(process.env.VITRINE_REVALIDATE_SECRET).toBe("");
      const networkSpy = vi.spyOn(globalThis, "fetch");
      const logger = { info: vi.fn(), warn: vi.fn() };
      expect(await requestStorefrontRevalidation("imob-x", { logger })).toBe("ignorado");
      expect(networkSpy).not.toHaveBeenCalled();
      networkSpy.mockRestore();
    });
  });
});
