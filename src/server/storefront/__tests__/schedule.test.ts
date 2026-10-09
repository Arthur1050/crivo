import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  after: vi.fn<(callback: () => Promise<void>) => void>(),
  getTenantSlug: vi.fn<(tenantId: string) => Promise<string | null>>(),
  request: vi.fn<(slug: string) => Promise<string>>(),
}));

vi.mock("next/server", () => ({ after: hoisted.after }));
vi.mock("../../data/storefront", () => ({ getTenantSlug: hoisted.getTenantSlug }));
vi.mock("../revalidation", () => ({ requestStorefrontRevalidation: hoisted.request }));

import { scheduleStorefrontRevalidation } from "../schedule";

const TENANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.after.mockImplementation(() => {});
  hoisted.getTenantSlug.mockResolvedValue("imob-x");
  hoisted.request.mockResolvedValue("enviado");
});

/** Callback que o `after` recebeu; o teste o dispara depois do retorno, como o Next faria. */
function scheduledCallback(): () => Promise<void> {
  expect(hoisted.after).toHaveBeenCalledTimes(1);
  return hoisted.after.mock.calls[0][0];
}

describe("L16a T12 — agendamento da revalidação (VREV-02)", () => {
  it("registra o callback no after() e não faz nada antes de a resposta sair", () => {
    scheduleStorefrontRevalidation(TENANT);

    expect(hoisted.after).toHaveBeenCalledTimes(1);
    expect(hoisted.getTenantSlug).not.toHaveBeenCalled();
    expect(hoisted.request).not.toHaveBeenCalled();
  });

  it("quando o callback roda, resolve o slug do tenant e chama o cliente com ele", async () => {
    scheduleStorefrontRevalidation(TENANT);
    await scheduledCallback()();

    expect(hoisted.getTenantSlug).toHaveBeenCalledWith(TENANT);
    expect(hoisted.request).toHaveBeenCalledTimes(1);
    expect(hoisted.request).toHaveBeenCalledWith("imob-x");
  });

  it("Edge Case: slug ilegível (nulo) → warn e nada enviado", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    hoisted.getTenantSlug.mockResolvedValue(null);
    scheduleStorefrontRevalidation(TENANT);
    await scheduledCallback()();

    expect(hoisted.request).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("[vitrine]");
    warn.mockRestore();
  });

  it("Edge Case: a leitura do slug falha → warn, zero envios e o callback não rejeita", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    hoisted.getTenantSlug.mockRejectedValue(new Error("banco fora"));
    scheduleStorefrontRevalidation(TENANT);

    await expect(scheduledCallback()()).resolves.toBeUndefined();
    expect(hoisted.request).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("[vitrine]");
    warn.mockRestore();
  });

  it("fora de um escopo de requisição o after() lança: o agendamento vira warn e não lança", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    hoisted.after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });

    expect(() => scheduleStorefrontRevalidation(TENANT)).not.toThrow();
    expect(hoisted.request).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("[vitrine]");
    warn.mockRestore();
  });
});
