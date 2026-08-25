import { notFound } from "next/navigation";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Stack";
import { Heading, Text } from "@astryxdesign/core/Text";
import { InviteUserDialog } from "@/src/components/usuarios/invite-user-dialog";
import { UsersTable } from "@/src/components/usuarios/users-table";
import {
  PermissionDeniedError,
  requirePermission,
} from "@/src/server/auth/session";
import { getTenantMembers } from "@/src/server/data";

/**
 * Gestão de usuários da imobiliária ativa (lote-8 — USER-01/USER-02).
 *
 * A página inteira é do administrador. Ocultar o item da navegação (PERM-01
 * AC7) é cosmético: digitar a URL cai aqui, a guarda recusa no servidor e o
 * desfecho é "recurso inexistente" — o mesmo de um recurso de outra
 * imobiliária (spec.md — Edge Cases), em vez de confirmar que a tela existe.
 */
export default async function UsuariosPage() {
  let context;
  try {
    context = await requirePermission("usuarios", "ler");
  } catch (error) {
    if (error instanceof PermissionDeniedError) notFound();
    throw error;
  }

  const members = await getTenantMembers(context.tenantId);

  return (
    <VStack gap={6}>
      <HStack vAlign="start" gap={4} wrap="wrap">
        <StackItem size="fill">
          <VStack gap={1}>
            <Heading level={1}>Usuários</Heading>
            <Text type="body" color="secondary">
              Quem acessa o CRM desta imobiliária, com que papel e em que
              horário atende
            </Text>
          </VStack>
        </StackItem>
        <InviteUserDialog />
      </HStack>

      {members.length === 0 ? (
        <EmptyState
          title="Nenhum usuário ainda"
          description="Convide o primeiro membro da equipe para que ele acesse o CRM."
        />
      ) : (
        <UsersTable
          members={members.map((member) => ({
            memberId: member.memberId,
            userId: member.userId,
            name: member.name,
            email: member.email,
            roles: member.roles,
            workDays: member.workDays,
            workHoursStart: member.workHoursStart,
            workHoursEnd: member.workHoursEnd,
            inviteState: member.inviteState,
            isDeactivated: member.deactivatedAt !== null,
          }))}
        />
      )}
    </VStack>
  );
}
