import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailSender } from "../email";
import { createIntegrationAlertFormatter } from "../../../lib/integration-alert";
import { realEstate } from "../../../verticals/real-estate";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
beforeEach(() => { vi.stubEnv("RESEND_API_KEY", "fixture-key"); vi.stubEnv("RESEND_FROM", undefined); send.mockReset().mockResolvedValue({ data: { id: "sent-id" }, error: null }); });
afterEach(() => vi.unstubAllEnvs());

describe("marca entregue ao alerta e a todos os envios", () => {
  for (const [vertical, name, tag, singular, plural] of [
    [realEstate, "Krivo", "krivo", "imobiliária", "imobiliárias"],
    [testVertical, "Acme", "acme", "empresa", "empresas"],
  ] as const) {
    it(`usa ${name} no remetente, convite, recuperação e alerta`, async () => {
      const sender = createEmailSender(vertical.brand);
      const invitation = { to: "invite@fixture.test", name: "Ana", tenantName: "Tenant distinto", url: "https://fixture.test/invite" };
      expect(await sender.sendInvitationEmail(invitation)).toEqual({ ok: true, id: "sent-id" });
      expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ from: `${name} <onboarding@resend.dev>`, to: "invite@fixture.test", subject: `Convite para o ${name} — Tenant distinto`, text: expect.stringContaining(`Você foi convidado para acessar o ${name} da ${singular} Tenant distinto.`) }));
      expect(await sender.sendResetPasswordEmail({ to: "reset@fixture.test", name: "Bia", url: "https://fixture.test/reset" })).toEqual({ ok: true, id: "sent-id" });
      expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ from: `${name} <onboarding@resend.dev>`, to: "reset@fixture.test", subject: `Redefinição de senha do ${name}`, text: expect.stringContaining(`Recebemos um pedido para redefinir a sua senha do ${name}.`) }));
      const format = createIntegrationAlertFormatter(vertical.brand);
      const snapshot = { tenantId: "id-one", name: "Tenant Azul", slug: "azul", storedState: null, storedChangedAt: null, lastAgentMessageAt: null, refusals: [] };
      const alert = format([snapshot]);
      expect(alert.subject).toBe(`[${tag}] Integração com problema em 1 ${singular}(s)`);
      expect(alert.text).toContain(`A integração do agente com o CRM passou a ter problema nas ${plural} abaixo.`);
      expect(format([snapshot], { test: true }).subject).toBe(`[teste] [${tag}] Integração com problema em 1 ${singular}(s)`);
      expect(await sender.sendIntegrationAlertEmail({ to: "operator@fixture.test", ...alert })).toEqual({ ok: true, id: "sent-id" });
      expect(send).toHaveBeenLastCalledWith({ from: `${name} <onboarding@resend.dev>`, to: "operator@fixture.test", subject: alert.subject, text: alert.text });
      expect(send).toHaveBeenCalledTimes(3);
      vi.stubEnv("RESEND_FROM", "Operação <custom@fixture.test>");
      await sender.sendIntegrationAlertEmail({ to: "custom@fixture.test", ...alert });
      expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ from: "Operação <custom@fixture.test>" }));
    });
  }
  it("separa o nome do produto da etiqueta do alerta", async () => {
    const brand = { ...realEstate.brand, name: "Produto Azul", alertTag: "operations-orange", problemUrn: "other-urn", tenantHeader: "X-Other-Tenant" };
    expect(createIntegrationAlertFormatter(brand)([]).subject).toBe("[operations-orange] Integração com problema em 0 imobiliária(s)");
    await createEmailSender(brand).sendResetPasswordEmail({ to: "a@fixture.test", name: "Nome", url: "https://fixture.test/reset" });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ subject: "Redefinição de senha do Produto Azul", from: "Produto Azul <onboarding@resend.dev>" }));
  });
});
