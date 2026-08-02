"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { updateTenantSettingsAction } from "@/src/server/actions/settings";
import type { Modality, Tenant } from "@/src/server/data";
import { validateModality, validateName } from "@/src/server/validation";

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "usado", label: "Usado" },
  { value: "ambos", label: "Ambos" },
];

interface FieldErrors {
  name?: string;
  agentName?: string;
  modality?: string;
}

interface SettingsFormProps {
  tenant: Tenant;
}

/**
 * Formulário de edição das configurações do tenant ativo (lote-2 — CONF-01
 * a CONF-04). Validação client-side é apenas cortesia (feedback imediato);
 * `updateTenantSettingsAction` é sempre a autoridade — qualquer erro que ela
 * retorne é exibido, mesmo que a validação local tenha passado.
 */
export function SettingsForm({ tenant }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [agentName, setAgentName] = useState(tenant.agentName);
  const [modality, setModality] = useState<Modality>(tenant.supportedModality);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  function mapActionError(error: string): FieldErrors | null {
    if (error.startsWith("Nome do agente")) return { agentName: error };
    if (error.startsWith("Nome do tenant")) return { name: error };
    if (error.startsWith("Modalidade")) return { modality: error };
    return null;
  }

  async function handleSave() {
    setBanner(null);

    const nameCheck = validateName(name, "Nome do tenant");
    const agentNameCheck = validateName(agentName, "Nome do agente");
    const modalityCheck = validateModality(modality);

    const nextErrors: FieldErrors = {
      name: nameCheck.ok ? undefined : nameCheck.error,
      agentName: agentNameCheck.ok ? undefined : agentNameCheck.error,
      modality: modalityCheck.ok ? undefined : modalityCheck.error,
    };

    if (nextErrors.name || nextErrors.agentName || nextErrors.modality) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});

    const result = await updateTenantSettingsAction({
      name,
      agentName,
      supportedModality: modality,
    });

    if (!result.ok) {
      const fieldError = mapActionError(result.error);
      if (fieldError) {
        setErrors(fieldError);
      } else {
        setBanner({ type: "error", message: result.error });
      }
      return;
    }

    setBanner({
      type: "success",
      message: "Configurações salvas com sucesso.",
    });
    // Fallback documentado (design.md / Next 16): revalidatePath (na action)
    // pode não refletir no shell (header/switcher) sem um refresh explícito
    // do router no client — CONF-03 exige o novo nome sem novo login.
    router.refresh();
  }

  return (
    <VStack gap={4}>
      {banner && (
        <Banner
          status={banner.type}
          title={banner.message}
          isDismissable
          onDismiss={() => setBanner(null)}
        />
      )}

      <TextInput
        label="Nome da imobiliária"
        value={name}
        onChange={(value) => {
          setName(value);
          setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        status={errors.name ? { type: "error", message: errors.name } : undefined}
        isRequired
      />

      <TextInput
        label="Nome do agente"
        value={agentName}
        onChange={(value) => {
          setAgentName(value);
          setErrors((prev) => ({ ...prev, agentName: undefined }));
        }}
        status={
          errors.agentName ? { type: "error", message: errors.agentName } : undefined
        }
        isRequired
      />

      <Selector
        label="Modalidade suportada"
        value={modality}
        onChange={(value) => {
          setModality(value as Modality);
          setErrors((prev) => ({ ...prev, modality: undefined }));
        }}
        options={MODALITY_OPTIONS}
        status={
          errors.modality ? { type: "error", message: errors.modality } : undefined
        }
        isRequired
      />

      <HStack hAlign="end">
        <Button label="Salvar" variant="primary" clickAction={handleSave} />
      </HStack>
    </VStack>
  );
}
