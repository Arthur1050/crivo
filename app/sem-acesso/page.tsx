import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlertIcon } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { resolveAuthContext } from "@/src/server/auth/session";
import { SignOutButton } from "@/src/components/auth/sign-out-button";

export const metadata: Metadata = {
  title: "Sem acesso — Crivo",
};

/**
 * Tela do usuário autenticado que não pertence a nenhuma imobiliária
 * (spec.md — TENANT-01 AC6).
 *
 * Usa `resolveAuthContext` diretamente, e NÃO `verifySession()`: a guarda
 * manda justamente para cá quem está sem vínculo, então chamá-la aqui criaria
 * um laço de redirecionamento com ela mesma. Os três desfechos são explícitos:
 *
 * - sem sessão  → `/login` (não é esta a tela do problema dele)
 * - com vínculo → `/pipeline` (chegou aqui por engano; tem para onde ir)
 * - sem vínculo → esta tela
 *
 * Nenhum dado de imobiliária é lido nem renderizado: a página não toca na DAL
 * de leads, documentos ou configurações, e o único dado exibido é o e-mail do
 * próprio usuário — que é dele, não de uma imobiliária.
 */
export default async function SemAcessoPage() {
  const resolution = await resolveAuthContext(await headers());

  if (resolution.ok) redirect("/pipeline");
  if (resolution.reason === "sem-sessao") redirect("/login");

  return (
    <Center minHeight="100vh">
      <VStack gap={4} width={520} maxWidth="100%">
        <Card padding={8}>
          <VStack gap={4}>
            <EmptyState
              headingLevel={1}
              icon={<ShieldAlertIcon size={32} />}
              title="Sua conta ainda não está em nenhuma imobiliária"
              description="Peça a um administrador da imobiliária que vincule o seu e-mail. Assim que o vínculo existir, é só entrar de novo — a conta já está criada."
              actions={<SignOutButton label="Sair" variant="primary" />}
            />
            <Text type="supporting" color="secondary" justify="center">
              Você está conectado como {resolution.user.email}.
            </Text>
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}
