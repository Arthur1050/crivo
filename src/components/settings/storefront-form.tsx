"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, StoreIcon } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Link } from "@astryxdesign/core/Link";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { saveStorefrontAction } from "@/src/server/actions/storefront";
import {
  ACTIVATION_BLOCKER_LABELS,
  STOREFRONT_LIMITS,
  activationBlockers,
  validateStorefrontInput,
  type ActivationBlocker,
  type StorefrontField,
  type StorefrontValue,
} from "@/src/lib/storefront";
import type { StorefrontFont, StorefrontLayout } from "@/src/lib/storefront-contract";

const LAYOUT_OPTIONS: { value: StorefrontLayout; label: string }[] = [
  { value: "grade", label: "Grade" },
  { value: "editorial", label: "Editorial" },
];

const FONT_OPTIONS: { value: StorefrontFont; label: string }[] = [
  { value: "inter", label: "Inter" },
  { value: "montserrat", label: "Montserrat" },
  { value: "lora", label: "Lora" },
  { value: "playfair", label: "Playfair Display" },
];

const SECTION_DESCRIPTION =
  "Página pública com o catálogo de imóveis disponíveis da imobiliária. O CRECI e a razão social aparecem no rodapé de todas as páginas.";

type FieldKey = StorefrontField | ActivationBlocker;
type FieldErrors = Partial<Record<FieldKey, string>>;

export interface StorefrontFormProps {
  storefront: StorefrontValue;
  slug: string;
  /** WhatsApp do agente da imobiliária (uma das pré-condições de ativação). */
  agentWhatsapp: string | null;
  /** `VITRINE_PUBLIC_URL`, ou nulo quando a vitrine ainda não está configurada. */
  publicUrl: string | null;
  /** Falso para quem tem `configuracoes:ler` sem `configuracoes:escrever`. */
  canWrite: boolean;
}

/**
 * Card "Vitrine" de Configurações (lote-16a — VUI-01). A validação do cliente
 * é só cortesia (feedback imediato, com a mesma função pura da action);
 * `saveStorefrontAction` é sempre a autoridade, e toda recusa dela aparece junto
 * ao campo, mantendo os valores digitados. A lista de pré-condições de ativação
 * acompanha o formulário em tempo real (VUI AC3).
 */
export function StorefrontForm({
  storefront,
  slug,
  agentWhatsapp,
  publicUrl,
  canWrite,
}: StorefrontFormProps) {
  const router = useRouter();
  const [active, setActive] = useState(storefront.active);
  const [layout, setLayout] = useState<StorefrontLayout>(storefront.layout);
  const [accentColor, setAccentColor] = useState(storefront.accentColor ?? "");
  const [font, setFont] = useState<StorefrontFont>(storefront.font);
  const [creci, setCreci] = useState(storefront.creci ?? "");
  const [legalName, setLegalName] = useState(storefront.legalName ?? "");
  const [headline, setHeadline] = useState(storefront.headline ?? "");
  const [about, setAbout] = useState(storefront.about ?? "");
  const [instagram, setInstagram] = useState(storefront.instagram ?? "");
  const [phone, setPhone] = useState(storefront.phone ?? "");
  const [address, setAddress] = useState(storefront.address ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const blockers = activationBlockers({ storefront: { creci, legalName }, agentWhatsapp });
  const liveUrl = storefront.active && publicUrl ? `${publicUrl.replace(/\/+$/, "")}/c/${slug}` : null;

  function clear(field: FieldKey) {
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  function statusOf(field: FieldKey) {
    return errors[field] ? { type: "error" as const, message: errors[field] } : undefined;
  }

  async function handleSave() {
    setBanner(null);
    const input = { active, layout, accentColor, font, creci, legalName, headline, about, instagram, phone, address };

    const check = validateStorefrontInput(input);
    if (!check.ok) {
      setErrors({ [check.field]: check.message });
      return;
    }
    setErrors({});

    const result = await saveStorefrontAction(input);
    if (!result.ok) {
      if (result.errors.length === 0) {
        setBanner({ type: "error", message: result.error });
        return;
      }
      setErrors(Object.fromEntries(result.errors.map((entry) => [entry.field, entry.message])));
      return;
    }

    setBanner({ type: "success", message: "Vitrine salva com sucesso." });
    router.refresh();
  }

  return (
    <Card>
      <VStack gap={4}>
        <VStack gap={1}>
          <HStack gap={2}>
            <StoreIcon size={20} />
            <Heading level={3}>Vitrine</Heading>
          </HStack>
          <Text type="supporting" color="secondary">
            {SECTION_DESCRIPTION}
          </Text>
        </VStack>
        <Divider />

        {banner && (
          <Banner
            status={banner.type}
            title={banner.message}
            isDismissable
            onDismiss={() => setBanner(null)}
          />
        )}

        <VStack gap={3}>
          <Switch
            label="Vitrine publicada"
            description="Quando ligada, o catálogo da imobiliária fica público."
            value={active}
            onChange={(checked) => {
              setActive(checked);
              clear("whatsappAgente");
            }}
            isDisabled={!canWrite}
            status={statusOf("whatsappAgente")}
          />

          {blockers.length > 0 && (
            <Banner
              status="warning"
              title="Para publicar a vitrine, falta:"
              description={
                <VStack gap={1}>
                  {blockers.map((blocker) => (
                    <Text key={blocker} type="body">
                      {ACTIVATION_BLOCKER_LABELS[blocker]}
                    </Text>
                  ))}
                </VStack>
              }
            />
          )}

          {liveUrl && (
            <Link href={liveUrl} isExternalLink isStandalone>
              Abrir vitrine
            </Link>
          )}
        </VStack>

        <Divider />

        <FormLayout>
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              Layout do catálogo
            </Text>
            <SegmentedControl
              label="Layout do catálogo"
              value={layout}
              onChange={(value) => {
                setLayout(value as StorefrontLayout);
                clear("layout");
              }}
              isDisabled={!canWrite}
            >
              {LAYOUT_OPTIONS.map((option) => (
                <SegmentedControlItem key={option.value} value={option.value} label={option.label} />
              ))}
            </SegmentedControl>
          </VStack>

          <FormLayout direction="horizontal">
            <TextInput
              label="Cor de destaque"
              description="Formato #rrggbb. Em branco usa a cor padrão."
              placeholder="#1a73e8"
              value={accentColor}
              onChange={(value) => {
                setAccentColor(value);
                clear("cor");
              }}
              hasClear
              isDisabled={!canWrite}
              status={statusOf("cor")}
            />
            <Selector
              label="Fonte"
              value={font}
              onChange={(value) => {
                setFont(value as StorefrontFont);
                clear("fonte");
              }}
              options={FONT_OPTIONS}
              isDisabled={!canWrite}
              status={statusOf("fonte")}
            />
          </FormLayout>
        </FormLayout>

        <Divider />

        <FormLayout>
          <FormLayout direction="horizontal">
            <TextInput
              label="CRECI *"
              description="Obrigatório para publicar. Aparece no rodapé."
              value={creci}
              onChange={(value) => {
                setCreci(value);
                clear("creci");
              }}
              isDisabled={!canWrite}
              status={statusOf("creci")}
            />
            <TextInput
              label="Razão social *"
              description="Obrigatória para publicar. Aparece no rodapé."
              value={legalName}
              onChange={(value) => {
                setLegalName(value);
                clear("razaoSocial");
              }}
              isDisabled={!canWrite}
              status={statusOf("razaoSocial")}
            />
          </FormLayout>

          <TextInput
            label="Título"
            value={headline}
            onChange={(value) => {
              setHeadline(value);
              clear("titulo");
            }}
            hasClear
            isDisabled={!canWrite}
            status={statusOf("titulo")}
          />

          <TextArea
            label="Sobre a imobiliária"
            value={about}
            onChange={(value) => {
              setAbout(value);
              clear("sobre");
            }}
            rows={4}
            maxLength={STOREFRONT_LIMITS.sobre}
            isDisabled={!canWrite}
            status={statusOf("sobre")}
          />

          <FormLayout direction="horizontal">
            <TextInput
              label="Instagram"
              description="Sem o @."
              value={instagram}
              onChange={(value) => {
                setInstagram(value);
                clear("instagram");
              }}
              hasClear
              isDisabled={!canWrite}
              status={statusOf("instagram")}
            />
            <TextInput
              label="Telefone"
              description="Com DDD, de 10 a 13 dígitos."
              value={phone}
              onChange={(value) => {
                setPhone(value);
                clear("telefone");
              }}
              hasClear
              isDisabled={!canWrite}
              status={statusOf("telefone")}
            />
          </FormLayout>

          <TextInput
            label="Endereço"
            value={address}
            onChange={(value) => {
              setAddress(value);
              clear("endereco");
            }}
            hasClear
            isDisabled={!canWrite}
            status={statusOf("endereco")}
          />
        </FormLayout>

        {canWrite ? (
          <HStack hAlign="between" vAlign="center" gap={3}>
            <Text type="supporting" color="secondary">
              * Obrigatório para publicar
            </Text>
            <Button
              label="Salvar vitrine"
              variant="primary"
              icon={<CheckIcon size={16} />}
              clickAction={handleSave}
            />
          </HStack>
        ) : (
          <Text type="supporting" color="secondary">
            Você pode ver a configuração da vitrine, mas não editá-la.
          </Text>
        )}
      </VStack>
    </Card>
  );
}
