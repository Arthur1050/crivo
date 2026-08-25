"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { ROLE_OPTIONS } from "@/src/components/usuarios/role-options";
import type { MemberRow } from "@/src/components/usuarios/users-table";
import type { Role } from "@/src/lib/permissions";
import { updateMemberRolesAction } from "@/src/server/actions/users";

/**
 * Alteração dos papéis de um vínculo (USER-01 AC8/AC9). A recusa por
 * "imobiliária sem administrador" vem do servidor e aparece no banner: a tela
 * não tenta adivinhar a regra, só mostra o que o servidor decidiu.
 */
export function MemberRolesDialog({
  member,
  onClose,
}: {
  member: MemberRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      isOpen={member !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      purpose="form"
      width={480}
    >
      {member && (
        <MemberRolesForm
          key={member.memberId}
          member={member}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function MemberRolesForm({
  member,
  onClose,
}: {
  member: MemberRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState<string[]>(member.roles);
  const [banner, setBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setBanner(null);
    setIsSubmitting(true);

    const result = await updateMemberRolesAction({
      memberId: member.memberId,
      roles: roles as Role[],
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setBanner(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Layout
      header={<DialogHeader title="Alterar papéis" onOpenChange={onClose} />}
      content={
        <LayoutContent>
          <VStack gap={4}>
            {banner && <Banner status="error" title={banner} />}

            <Text type="body" color="secondary">
              {member.name} · {member.email}
            </Text>

            <CheckboxList
              label="Papéis"
              description="Papéis acumulados somam permissões e valem já na próxima requisição."
              value={roles}
              onChange={setRoles}
            >
              {ROLE_OPTIONS.map((option) => (
                <CheckboxListItem
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  description={option.description}
                />
              ))}
            </CheckboxList>
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter>
          <HStack gap={2} hAlign="end">
            <Button label="Cancelar" variant="secondary" onClick={onClose} />
            <Button
              label="Salvar"
              variant="primary"
              isLoading={isSubmitting}
              clickAction={handleSubmit}
            />
          </HStack>
        </LayoutFooter>
      }
    />
  );
}
