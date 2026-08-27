"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRoundIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Link } from "@astryxdesign/core/Link";
import { VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading, Text } from "@astryxdesign/core/Text";
import { resetPassword } from "@/src/lib/auth-client";

/**
 * Recusa de link usado ou expirado (spec.md — AUTH-02 AC4). Os dois casos são
 * indistinguíveis do lado do servidor por construção: o token é consumido ao
 * ser usado, então "já usado" e "expirado" chegam aqui como o mesmo
 * `INVALID_TOKEN`. A mensagem diz o que fazer em vez de qual dos dois foi.
 */
const LINK_INVALIDO =
  "Este link não vale mais: ou já foi usado, ou passou de 1 hora. Peça um novo abaixo.";

const SENHA_CURTA = "A senha precisa ter ao menos 8 caracteres.";
const SENHAS_DIFERENTES = "As duas senhas não são iguais.";

/**
 * Redefinição de senha com o token do e-mail (spec.md — AUTH-02 AC3/AC4).
 *
 * A validade do token só pode ser sabida no envio: ele é opaco até o servidor
 * tentar consumi-lo. Por isso a tela abre no formulário e a recusa aparece
 * depois do submit — sempre acompanhada do caminho de saída (pedir outro link),
 * que é o que a AC4 exige.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkInvalido, setLinkInvalido] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit() {
    setError(null);

    if (password.length < 8) {
      setError(SENHA_CURTA);
      return;
    }
    if (password !== confirmacao) {
      setError(SENHAS_DIFERENTES);
      return;
    }

    setEnviando(true);
    const result = await resetPassword({ token, newPassword: password });
    setEnviando(false);

    if (result.error) {
      setLinkInvalido(true);
      return;
    }

    // A senha nova já está gravada e as demais sessões caíram (AC3). O login é
    // o próximo passo natural: esta tela é pública e não cria sessão sozinha.
    router.push("/login");
  }

  if (linkInvalido) {
    return (
      <VStack gap={5}>
        <Banner status="error" title={LINK_INVALIDO} />
        <Link href="/recuperar-senha" isStandalone>
          Pedir um novo link
        </Link>
        <Link href="/login" isStandalone>
          Voltar para o login
        </Link>
      </VStack>
    );
  }

  return (
    <VStack gap={6}>
      <VStack gap={1}>
        <Heading level={1}>Definir senha nova</Heading>
        <Text type="supporting" color="secondary">
          Escolha uma senha de ao menos 8 caracteres. As outras sessões abertas
          nesta conta serão encerradas.
        </Text>
      </VStack>

      {error && <Banner status="error" title={error} />}

      <FormLayout>
        <TextInput
          label="Senha nova"
          type="password"
          htmlName="password"
          value={password}
          onChange={setPassword}
          hasAutoFocus
          width="100%"
        />
        <TextInput
          label="Repita a senha nova"
          type="password"
          htmlName="confirmacao"
          value={confirmacao}
          onChange={setConfirmacao}
          width="100%"
        />
      </FormLayout>

      <Button
        label={enviando ? "Salvando..." : "Salvar senha"}
        variant="primary"
        type="submit"
        icon={<KeyRoundIcon size={16} />}
        width="100%"
        isDisabled={enviando}
        clickAction={handleSubmit}
      />
    </VStack>
  );
}
