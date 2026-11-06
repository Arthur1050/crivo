import { beforeEach, describe, expect, it, vi } from "vitest";
import { runIntegrationAlert } from "../integration-alert";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";

const data = vi.hoisted(() => ({ getTenantHealthSnapshots: vi.fn(), claimIntegrationProblems: vi.fn(), recordTenantHealthStates: vi.fn(), releaseIntegrationProblems: vi.fn() }));
vi.mock("../../data/integration-health", () => data);
const now = new Date("2034-06-01T12:00:00Z");
const claimed = [{ tenantId: "tenant-acme", changedAt: now }];
beforeEach(() => {
  vi.resetAllMocks();
  data.getTenantHealthSnapshots.mockResolvedValue([{ tenantId: "tenant-acme", name: "Tenant Azul", slug: "tenant-blue", storedState: "saudavel", storedChangedAt: new Date("2034-01-02"), lastAgentMessageAt: new Date("2034-01-01"), refusals: [] }]);
  data.claimIntegrationProblems.mockResolvedValue(claimed);
});

describe("marca atravessa a avaliação e o envio do alerta", () => {
  it("entrega Acme ao envio após reivindicar a queda", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "sent-id" }));
    const result = await runIntegrationAlert(now, { brand: testVertical.brand, operatorEmail: "operator@fixture.test", send });
    expect(data.claimIntegrationProblems).toHaveBeenCalledWith(["tenant-acme"], now);
    expect(data.recordTenantHealthStates).toHaveBeenCalledWith([]);
    expect(send).toHaveBeenCalledExactlyOnceWith({ to: "operator@fixture.test", subject: "[acme] Integração com problema em 1 imobiliária(s)", text: expect.stringContaining("Tenant Azul (tenant-blue)") });
    expect(result).toEqual({ evaluated: 1, sent: 1, skipped: null, sendFailed: false });
    expect(data.releaseIntegrationProblems).not.toHaveBeenCalled();
  });
  it("libera a mesma reivindicação se o envio da outra marca falhar", async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: "provedor indisponível" }));
    const result = await runIntegrationAlert(now, { brand: testVertical.brand, operatorEmail: "operator@fixture.test", send });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: "[acme] Integração com problema em 1 imobiliária(s)" }));
    expect(data.releaseIntegrationProblems).toHaveBeenCalledExactlyOnceWith(claimed);
    expect(result).toEqual({ evaluated: 1, sent: 0, skipped: null, sendFailed: true });
  });
});
