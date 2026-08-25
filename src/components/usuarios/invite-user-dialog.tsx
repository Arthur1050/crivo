"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { ROLE_OPTIONS } from "@/src/components/usuarios/role-options";
import type { Role } from "@/src/lib/permissions";
import { inviteUserAction } from "@/src/server/actions/users";

/**
 * Convite de um novo membro (USER-01 AC1). O e-mail que já pertence à
 * imobiliária é recusado pelo servidor com mensagem própria (AC3), e falha de
 * envio não desfaz a criação (AC4) — os dois desfechos aparecem no banner.
 */
export function InviteUserDialog() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        label="Convidar usuário"
        variant="primary"
        icon={<UserPlusIcon size={16} />}
        onClick={() => setIsOpen(true)}
      />
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        purpose="form"
        width={480}
      >
        {isOpen && <InviteUserForm onClose={() => setIsOpen(false)} />}
      </Dialog>
    </>
  );
}

interface FieldErrors {
  name?: string;
  email?: string;
  roles?: string;
}

function InviteUserForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>(["corretor"]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<
    { status: "error" | "warning"; title: string } | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setBanner(null);
    setErrors({});
    setIsSubmitting(true);

    const result = await inviteUserAction({
      name,
      email,
      roles: roles as Role[],
    });

    setIsSubmitting(false);

    if (!result.ok) {
      if (result.error.startsWith("Nome")) setErrors({ name: result.error });
      else if (result.error.startsWith("E-mail"))
        setErrors({ email: result.error });
      else if (result.error.startsWith("Escolha"))
        setErrors({ roles: result.error });
      else setBanner({ status: "error", title: result.error });
      return;
    }

    router.refresh();

    if (!result.emailSent) {
      // AC4: o usuário existe; o que faltou foi o e-mail. O aviso fica na tela
      // em vez de fechar como se tudo tivesse dado certo.
      setBanner({
        status: "warning",
        title: result.warning ?? "Convite criado, mas o e-mail não foi enviado.",
      });
      return;
    }

    onClose();
  }

  return (
    <Layout
      header={<DialogHeader title="Convidar usuário" onOpenChange={onClose} />}
      content={
        <LayoutContent>
          <VStack gap={4}>
            {banner && <Banner status={banner.status} title={banner.title} />}

            <TextInput
              label="Nome"
              value={name}
              onChange={(value) => {
                setName(value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              status={
                errors.name ? { type: "error", message: errors.name } : undefined
              }
              isRequired
            />

            <TextInput
              label="E-mail"
              type="email"
              value={email}
              onChange={(value) => {
                setEmail(value);
                setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              status={
                errors.email
                  ? { type: "error", message: errors.email }
                  : undefined
              }
              isRequired
            />

            <CheckboxList
              label="Papéis"
              description="Papéis acumulados somam permissões."
              value={roles}
              onChange={(values) => {
                setRoles(values);
                setErrors((prev) => ({ ...prev, roles: undefined }));
              }}
              status={
                errors.roles
                  ? { type: "error", message: errors.roles }
                  : undefined
              }
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
              label="Enviar convite"
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
