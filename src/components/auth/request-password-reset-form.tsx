"use client";

import { useState } from "react";
import { MailIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading, Text } from "@astryxdesign/core/Text";
import { requestPasswordReset } from "@/src/lib/auth-client";

/**
 * Confirmação única (spec.md — AUTH-02 AC2): e-mail cadastrado e e-mail
 * inexistente produzem EXATAMENTE esta mensagem. Distinguir os dois casos
 * entregaria de graça quais e-mails existem na base — o mesmo raciocínio da
 * mensagem única de falha do login (AUTH-01 AC3).
 */
const CONFIRMACAO =
  "Se este e-mail estiver cadastrado, enviamos um link para redefinir a senha. O link vale por 1 hora.";

/**
 * Pedido de redefinição de senha (spec.md — AUTH-02 AC1/AC2). Client component:
 * o cliente do better-auth fala com o handler de `/api/auth` direto.
 *
 * O estado de sucesso não é "e-mail enviado" e sim "pedido registrado": a tela
 * nunca sabe (nem quer saber) se havia conta do outro lado.
 */
export function RequestPasswordResetForm() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit() {
    setEnviando(true);
    // O retorno é deliberadamente ignorado: o endpoint responde igual para
    // e-mail conhecido e desconhecido, e um erro de transporte não pode virar
    // uma mensagem diferente na tela — isso reintroduziria a distinção que a
    // AC2 proíbe.
    await requestPasswordReset({ email });
    setEnviando(false);
    setEnviado(true);
  }

  if (enviado) {
    return (
      <VStack gap={5}>
        <Banner status="success" title={CONFIRMACAO} />
        <Text type="supporting" color="secondary">
          Não recebeu? Confira a caixa de spam ou peça outro link em alguns
          minutos.
        </Text>
        <Link href="/login" isStandalone>
          Voltar para o login
        </Link>
      </VStack>
    );
  }

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Recuperar senha</Heading>
        <Text type="supporting" color="secondary">
          Informe o e-mail da sua conta. Enviamos um link para você definir uma
          senha nova.
        </Text>
      </VStack>

      <FormLayout>
        <TextInput
          label="E-mail"
          type="email"
          htmlName="email"
          value={email}
          onChange={setEmail}
          hasAutoFocus
          width="100%"
        />
      </FormLayout>

      <Button
        label={enviando ? "Enviando..." : "Enviar link"}
        variant="primary"
        type="submit"
        icon={<MailIcon size={16} />}
        width="100%"
        isDisabled={enviando}
        clickAction={handleSubmit}
      />

      <Link href="/login" isStandalone>
        Voltar para o login
      </Link>
    </VStack>
  );
}
