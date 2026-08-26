"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Text } from "@astryxdesign/core/Text";
import { acceptInvitationAction } from "@/src/server/actions/invitations";

const MISMATCH = "As duas senhas precisam ser iguais.";

/**
 * Definição de senha do convidado (USER-01 AC6). A ativação inteira acontece
 * na server action: ela encerra a sessão de outra conta que porventura esteja
 * aberta, grava a credencial e cria a sessão do convidado.
 */
export function AcceptInvitationForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (password !== confirmation) {
      setError(MISMATCH);
      return;
    }

    setIsSubmitting(true);
    const result = await acceptInvitationAction({ token, password });
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.refresh();
    // Quem já tinha senha (convidado para uma segunda imobiliária) entra pelo
    // login normal; quem acabou de definir a senha já sai com sessão.
    router.push(result.needsLogin ? "/login" : "/pipeline");
  }

  return (
    <VStack gap={5}>
      {error && <Banner status="error" title={error} />}

      <Text type="supporting" color="secondary">
        {email}
      </Text>

      <FormLayout>
        <TextInput
          label="Senha"
          type="password"
          htmlName="password"
          value={password}
          onChange={setPassword}
          description="Ao menos 8 caracteres."
          hasAutoFocus
          width="100%"
        />
        <TextInput
          label="Confirme a senha"
          type="password"
          htmlName="password-confirmation"
          value={confirmation}
          onChange={setConfirmation}
          width="100%"
        />
      </FormLayout>

      <Button
        label="Ativar conta"
        variant="primary"
        type="submit"
        icon={<CheckIcon size={16} />}
        width="100%"
        isLoading={isSubmitting}
        clickAction={handleSubmit}
      />
    </VStack>
  );
}
