"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { BotIcon, CheckIcon, HomeIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Heading, Text } from "@astryxdesign/core/Text";
import { updateTenantSettingsAction } from "@/src/server/actions/settings";
import type { Modality, Tenant } from "@/src/server/data";
import { validateModality, validateName } from "@/src/server/validation";

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "usado", label: "Usado" },
  { value: "ambos", label: "Ambos" },
];

const AGENT_NAME_HELPER =
  "Este nome aparece nas saudações e nas mensagens do agente.";

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
 *
 * Recomposto em redesign-crm-astryx (RD-07, design.md § R4) em dois cards
 * seccionados — "Dados da Imobiliária" e "Persona do Agente SDR" — sobre o
 * MESMO estado e o mesmo save: salvar em qualquer uma das seções persiste o
 * formulário inteiro (RD-07 AC2).
 *
 * O payload enviado é sempre COMPLETO, com os 5 campos opcionais explícitos:
 * `updateTenantSettings` só grava null onde a chave está presente (chave
 * ausente deixa a coluna intocada), então omitir um campo limpo pelo usuário
 * silenciosamente não apagaria a coluna (RD-07 AC3).
 */
export function SettingsForm({ tenant }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [agentName, setAgentName] = useState(tenant.agentName);
  const [modality, setModality] = useState<Modality>(tenant.supportedModality);
  const [city, setCity] = useState(tenant.city ?? "");
  const [state, setState] = useState(tenant.state ?? "");
  const [agentWhatsapp, setAgentWhatsapp] = useState(tenant.agentWhatsapp ?? "");
  const [website, setWebsite] = useState(tenant.website ?? "");
  const [presentationMessage, setPresentationMessage] = useState(
    tenant.agentPresentationMessage ?? ""
  );
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
      city,
      state,
      agentWhatsapp,
      website,
      agentPresentationMessage: presentationMessage,
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

  /**
   * Legenda + ação da seção. O asterisco no rótulo marca obrigatoriedade em
   * pt-BR: o `isRequired`/`isOptional` da Astryx renderiza "Required" /
   * "Optional" cravados em inglês (`FieldLabel.js:90`), sem prop de locale
   * nem chave de catálogo, o que vazava inglês num produto todo em português.
   */
  const saveButton = (
    <HStack hAlign="between" vAlign="center" gap={3}>
      <Text type="supporting" color="secondary">
        * Campo obrigatório
      </Text>
      <Button
        label="Salvar"
        variant="primary"
        icon={<CheckIcon size={16} />}
        clickAction={handleSave}
      />
    </HStack>
  );

  return (
    <VStack gap={6}>
      {banner && (
        <Banner
          status={banner.type}
          title={banner.message}
          isDismissable
          onDismiss={() => setBanner(null)}
        />
      )}

      <SettingsSection
        icon={<HomeIcon size={20} />}
        title="Dados da Imobiliária"
        description="Informações institucionais usadas pelo agente e exibidas no painel."
      >
        <FormLayout>
          <FormLayout direction="horizontal">
            <TextInput
              label="Nome da imobiliária *"
              value={name}
              onChange={(value) => {
                setName(value);
                setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              status={
                errors.name ? { type: "error", message: errors.name } : undefined
              }
            />
            <Selector
              label="Modalidade suportada *"
              value={modality}
              onChange={(value) => {
                setModality(value as Modality);
                setErrors((prev) => ({ ...prev, modality: undefined }));
              }}
              options={MODALITY_OPTIONS}
              status={
                errors.modality
                  ? { type: "error", message: errors.modality }
                  : undefined
              }
            />
          </FormLayout>

          <FormLayout direction="horizontal">
            <TextInput
              label="Cidade"
              value={city}
              onChange={setCity}
              hasClear
            />
            <TextInput
              label="Estado (UF)"
              value={state}
              onChange={setState}
              hasClear
            />
          </FormLayout>

          <FormLayout direction="horizontal">
            <TextInput
              label="Número WhatsApp do agente"
              value={agentWhatsapp}
              onChange={setAgentWhatsapp}
              hasClear
            />
            <TextInput
              label="Website"
              value={website}
              onChange={setWebsite}
              hasClear
            />
          </FormLayout>
        </FormLayout>

        {saveButton}
      </SettingsSection>

      <SettingsSection
        icon={<BotIcon size={20} />}
        title="Persona do Agente SDR"
        description="Define como o agente se apresenta e se comporta nas conversas do WhatsApp."
      >
        <FormLayout>
          <TextInput
            label="Nome do agente *"
            description={AGENT_NAME_HELPER}
            value={agentName}
            onChange={(value) => {
              setAgentName(value);
              setErrors((prev) => ({ ...prev, agentName: undefined }));
            }}
            status={
              errors.agentName
                ? { type: "error", message: errors.agentName }
                : undefined
            }
          />
          <TextArea
            label="Mensagem de apresentação"
            value={presentationMessage}
            onChange={setPresentationMessage}
            rows={4}
          />
        </FormLayout>

        {saveButton}
      </SettingsSection>
    </VStack>
  );
}

/**
 * Card seccionado do R4: header com ícone + título + descrição, divider e
 * corpo. Os dois cards da página compartilham exatamente esta anatomia.
 */
function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} vAlign="start">
          {icon}
          <VStack gap={1}>
            <Heading level={3}>{title}</Heading>
            <Text type="supporting" color="secondary">
              {description}
            </Text>
          </VStack>
        </HStack>
        <Divider />
        {children}
      </VStack>
    </Card>
  );
}
