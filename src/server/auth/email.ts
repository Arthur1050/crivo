import "server-only";
import { Resend } from "resend";

/**
 * Adaptador de e-mail do produto (design.md — Adaptador de e-mail; spec.md
 * USER-01 AC4, AUTH-02).
 *
 * Duas regras dão forma a este módulo:
 *
 * 1. **Nunca lança.** Falha de envio é um caminho de RETORNO, não uma exceção.
 *    A `USER-01` AC4 exige que o usuário convidado continue criado quando o
 *    e-mail não sai — se este módulo estourasse, a server action perderia o
 *    controle depois de já ter escrito no banco e o convite viraria um usuário
 *    órfão sem aviso na tela.
 * 2. **A chave sai do ambiente.** `RESEND_API_KEY` é lida a cada envio, nunca
 *    escrita no repositório. Ambiente sem a chave é tratado como uma falha
 *    normal do provedor (retorno `ok: false`), e não como pré-condição de
 *    build: sem conta configurada o produto continua subindo, o administrador
 *    continua nascendo pelo bootstrap de linha de comando (SEED-01 AC5) e o
 *    convite fica pendente e reenviável.
 */

export type EmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

/** Remetente. Sobrescrevível por ambiente porque depende do domínio verificado. */
const DEFAULT_FROM = "Crivo <onboarding@resend.dev>";

export interface InvitationEmail {
  to: string;
  /** Nome de quem foi convidado, usado na saudação. */
  name: string;
  /** Nome da imobiliária que convidou. */
  tenantName: string;
  /** URL completa da tela de aceite, já com o token. */
  url: string;
}

export async function sendInvitationEmail(
  invitation: InvitationEmail
): Promise<EmailResult> {
  return send({
    to: invitation.to,
    subject: `Convite para o Crivo — ${invitation.tenantName}`,
    text: [
      `Olá, ${invitation.name}.`,
      "",
      `Você foi convidado para acessar o Crivo da imobiliária ${invitation.tenantName}.`,
      "Defina a sua senha e ative a conta por este link:",
      invitation.url,
      "",
      "O convite vale por 7 dias. Depois disso, peça um novo ao administrador.",
    ].join("\n"),
  });
}

export interface ResetPasswordEmail {
  to: string;
  name: string;
  /** URL completa da tela de redefinição, já com o token. */
  url: string;
}

export async function sendResetPasswordEmail(
  reset: ResetPasswordEmail
): Promise<EmailResult> {
  return send({
    to: reset.to,
    subject: "Redefinição de senha do Crivo",
    text: [
      `Olá, ${reset.name}.`,
      "",
      "Recebemos um pedido para redefinir a sua senha do Crivo.",
      "Se foi você, defina uma senha nova por este link:",
      reset.url,
      "",
      "Se não foi você, ignore este e-mail: a senha atual continua valendo.",
    ].join("\n"),
  });
}

async function send(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      error:
        "RESEND_API_KEY não configurada: o e-mail não foi enviado. Reenvie o convite quando a chave estiver no ambiente.",
    };
  }

  try {
    const { data, error } = await new Resend(apiKey).emails.send({
      from: process.env.RESEND_FROM ?? DEFAULT_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    // Rede fora, DNS, timeout: o SDK lança. Aqui vira retorno, como tudo mais.
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
