import "dotenv/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adaptador de e-mail (tasks.md — T19; spec.md USER-01 AC4).
 *
 * O SDK do Resend é mockado em TODOS os casos: nenhum teste desta suíte pode
 * bater na API real (não há conta configurada, e um teste que dependesse de
 * rede externa deixaria de ser determinístico). O que se prova aqui é o
 * contrato do adaptador — devolve resultado, nunca lança, e a chave vem do
 * ambiente.
 */

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  constructedWith: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
    constructor(apiKey: string) {
      mocks.constructedWith(apiKey);
    }
  },
}));

import {
  sendIntegrationAlertEmail,
  sendInvitationEmail,
  sendResetPasswordEmail,
} from "../email";

const INVITE = {
  to: "convidado@fixture.test",
  name: "Convidado de Teste",
  tenantName: "Imobiliária Fixture",
  url: "http://localhost:3000/convite/00000000-0000-4000-8000-00000000e001",
};

const RESET = {
  to: "usuario@fixture.test",
  name: "Usuário de Teste",
  url: "http://localhost:3000/recuperar-senha/00000000-0000-4000-8000-00000000e002",
};

const originalKey = process.env.RESEND_API_KEY;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_chave_de_teste";
  mocks.send.mockReset();
  mocks.constructedWith.mockReset();
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = originalKey;
});

describe("sendInvitationEmail", () => {
  it("devolve resultado de sucesso com o id do provedor e envia para o convidado com o link", async () => {
    mocks.send.mockResolvedValue({ data: { id: "email_123" }, error: null });

    const result = await sendInvitationEmail(INVITE);

    expect(result).toEqual({ ok: true, id: "email_123" });

    const payload = mocks.send.mock.calls[0][0];
    expect(payload.to).toBe(INVITE.to);
    expect(payload.text).toContain(INVITE.url);
    expect(payload.subject).toContain(INVITE.tenantName);
  });

  it("falha do provedor vira retorno com a mensagem do erro, sem lançar", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Domínio não verificado" },
    });

    const result = await sendInvitationEmail(INVITE);

    expect(result).toEqual({ ok: false, error: "Domínio não verificado" });
  });

  it("exceção do SDK (rede fora) vira retorno de falha, sem lançar", async () => {
    mocks.send.mockRejectedValue(new Error("fetch failed"));

    await expect(sendInvitationEmail(INVITE)).resolves.toEqual({
      ok: false,
      error: "fetch failed",
    });
  });

  it("ambiente sem RESEND_API_KEY é falha de retorno, não exceção, e nada é enviado", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendInvitationEmail(INVITE);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("RESEND_API_KEY");
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("a chave usada é a do ambiente, nunca um valor fixo no código", async () => {
    process.env.RESEND_API_KEY = "re_chave_vinda_do_ambiente";
    mocks.send.mockResolvedValue({ data: { id: "email_env" }, error: null });

    await sendInvitationEmail(INVITE);

    expect(mocks.constructedWith).toHaveBeenCalledWith(
      "re_chave_vinda_do_ambiente"
    );
  });
});

describe("sendResetPasswordEmail", () => {
  it("devolve resultado de sucesso e envia o link de redefinição ao usuário", async () => {
    mocks.send.mockResolvedValue({ data: { id: "email_456" }, error: null });

    const result = await sendResetPasswordEmail(RESET);

    expect(result).toEqual({ ok: true, id: "email_456" });

    const payload = mocks.send.mock.calls[0][0];
    expect(payload.to).toBe(RESET.to);
    expect(payload.text).toContain(RESET.url);
  });

  it("falha do provedor vira retorno com a mensagem do erro, sem lançar", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "rate_limit_exceeded", message: "Limite excedido" },
    });

    await expect(sendResetPasswordEmail(RESET)).resolves.toEqual({
      ok: false,
      error: "Limite excedido",
    });
  });

  it("ambiente sem RESEND_API_KEY é falha de retorno, não exceção", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendResetPasswordEmail(RESET);

    expect(result.ok).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("sendIntegrationAlertEmail (L15 — ALERTA-02 AC1)", () => {
  const ALERT = {
    to: "operador@fixture.test",
    subject: "[crivo] Integração com problema em 1 imobiliária(s)",
    text: "corpo do alerta",
  };
  const originalFrom = process.env.RESEND_FROM;

  afterEach(() => {
    if (originalFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = originalFrom;
  });

  it("envia ao destinatário recebido, com assunto e corpo, e remetente de RESEND_FROM", async () => {
    process.env.RESEND_FROM = "Crivo <alertas@fixture.test>";
    mocks.send.mockResolvedValue({ data: { id: "email_alert" }, error: null });

    const result = await sendIntegrationAlertEmail(ALERT);

    expect(result).toEqual({ ok: true, id: "email_alert" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const payload = mocks.send.mock.calls[0][0];
    expect(payload.to).toBe(ALERT.to);
    expect(payload.subject).toBe(ALERT.subject);
    expect(payload.text).toBe(ALERT.text);
    expect(payload.from).toBe("Crivo <alertas@fixture.test>");
  });

  it("sem RESEND_FROM usa o remetente padrão do adaptador", async () => {
    delete process.env.RESEND_FROM;
    mocks.send.mockResolvedValue({ data: { id: "email_default" }, error: null });

    await sendIntegrationAlertEmail(ALERT);

    expect(mocks.send.mock.calls[0][0].from).toBe("Crivo <onboarding@resend.dev>");
  });

  it("erro do provedor vira ok: false sem lançar", async () => {
    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Domínio não verificado" },
    });

    await expect(sendIntegrationAlertEmail(ALERT)).resolves.toEqual({
      ok: false,
      error: "Domínio não verificado",
    });
  });

  it("exceção do SDK vira ok: false sem lançar", async () => {
    mocks.send.mockRejectedValue(new Error("fetch failed"));

    await expect(sendIntegrationAlertEmail(ALERT)).resolves.toEqual({
      ok: false,
      error: "fetch failed",
    });
  });
});
