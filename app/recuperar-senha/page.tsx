import type { Metadata } from "next";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { RequestPasswordResetForm } from "@/src/components/auth/request-password-reset-form";
import { ResetPasswordForm } from "@/src/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Recuperar senha — Crivo",
};

/**
 * Recuperação de senha (spec.md — AUTH-02). Uma rota, dois momentos do mesmo
 * fluxo, decididos pela presença do token:
 *
 * - sem `?token=`: o pedido, onde se informa o e-mail (AC1/AC2);
 * - com `?token=`: a redefinição, para quem chegou pelo link do e-mail (AC3/AC4).
 *
 * Rota pública no `proxy.ts`, como o login: quem esqueceu a senha, por
 * definição, não tem sessão.
 */
export default async function RecuperarSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <Center minHeight="100vh">
      <Card width={420} maxWidth="100%" padding={8}>
        {token ? <ResetPasswordForm token={token} /> : <RequestPasswordResetForm />}
      </Card>
    </Center>
  );
}
