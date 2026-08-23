"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogInIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading, Text } from "@astryxdesign/core/Text";
import { signIn } from "@/src/lib/auth-client";

/**
 * Mensagem única de falha (spec.md — AUTH-01 AC3): e-mail inexistente e senha
 * errada produzem EXATAMENTE o mesmo texto. Distinguir os dois casos entregaria
 * de graça a informação de quais e-mails existem na base.
 */
const GENERIC_FAILURE = "E-mail ou senha incorretos.";

/**
 * Recusa por excesso de tentativas (spec.md — AUTH-01 AC4). É a única falha de
 * login que ganha texto próprio: aqui a credencial não chegou a ser avaliada,
 * então dizer "e-mail ou senha incorretos" seria mentira — e deixaria o usuário
 * legítimo tentando de novo sem entender por que nada acontece.
 */
const RATE_LIMITED =
  "Muitas tentativas de login. Aguarde um minuto e tente novamente.";

/**
 * Formulário de login (spec.md — AUTH-01). Client component: o cliente do
 * better-auth cuida do cookie de sessão sozinho.
 *
 * Depois do login bem-sucedido vai para o Pipeline (AC2). `router.refresh()`
 * antes do `push` força o shell do CRM a remontar já com a sessão — sem isso, o
 * layout pode reaproveitar a árvore renderizada sem usuário.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);

    const result = await signIn.email({ email, password });

    if (result.error) {
      setError(result.error.status === 429 ? RATE_LIMITED : GENERIC_FAILURE);
      return;
    }

    router.refresh();
    router.push("/pipeline");
  }

  return (
    <Center minHeight="100vh">
      <VStack gap={4} width={400} maxWidth="100%">
        <Card padding={8}>
          <VStack gap={6}>
            <VStack gap={1}>
              <Heading level={1}>Entrar no Crivo</Heading>
              <Text type="supporting" color="secondary">
                Use o e-mail e a senha da sua imobiliária.
              </Text>
            </VStack>

            {error && <Banner status="error" title={error} />}

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
              <TextInput
                label="Senha"
                type="password"
                htmlName="password"
                value={password}
                onChange={setPassword}
                width="100%"
              />
            </FormLayout>

            <Button
              label="Entrar"
              variant="primary"
              type="submit"
              icon={<LogInIcon size={16} />}
              width="100%"
              clickAction={handleSubmit}
            />
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}
