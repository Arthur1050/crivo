import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { AcceptInvitationForm } from "@/src/components/auth/accept-invitation-form";
import { getInvitation, getTenant } from "@/src/server/data";

/**
 * Aceite de convite (spec.md — USER-01 AC6/AC7). Rota pública: o convidado
 * ainda não tem sessão, e é por aqui que ele passa a ter uma.
 *
 * A recusa (token inexistente, já usado ou expirado) é decidida no servidor e
 * instrui a pedir um convite novo, sem revelar em qual dos três casos caiu.
 */
export default async function ConvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await getInvitation(token);

  // A validade é decidida na camada de dados (`isUsable`), não aqui: ler o
  // relógio durante o render é chamada impura.
  const usable = invitation?.isUsable ? invitation : null;
  const tenant = usable ? await getTenant(usable.tenantId) : null;

  return (
    <Center minHeight="100vh">
      <Card width={420} maxWidth="100%" padding={8}>
        {usable ? (
          <VStack gap={5}>
            <VStack gap={1}>
              <Heading level={1}>Ativar sua conta</Heading>
              <Text type="body" color="secondary">
                {tenant
                  ? `Você foi convidado para o Crivo da ${tenant.name}. Defina uma senha para entrar.`
                  : "Defina uma senha para entrar no Crivo."}
              </Text>
            </VStack>
            <AcceptInvitationForm token={token} email={usable.email} />
          </VStack>
        ) : (
          <EmptyState
            title="Convite indisponível"
            description="Este convite não vale mais, porque já foi usado ou expirou. Peça um novo convite ao administrador da imobiliária."
          />
        )}
      </Card>
    </Center>
  );
}
