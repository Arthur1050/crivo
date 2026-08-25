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

import { sendInvitationEmail, sendResetPasswordEmail } from "../email";

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
