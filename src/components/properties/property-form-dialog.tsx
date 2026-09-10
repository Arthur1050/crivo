"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Switch } from "@astryxdesign/core/Switch";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  createPropertyAction,
  updatePropertyAction,
} from "@/src/server/actions/properties";
import type {
  Modality,
  Property,
  PropertyKind,
  PropertyStatus,
} from "@/src/server/data";
import { MAX_PHOTO_URLS } from "@/src/server/validation";

const KIND_OPTIONS: { value: PropertyKind; label: string }[] = [
  { value: "casa", label: "Casa" },
  { value: "apartamento", label: "Apartamento" },
  { value: "sobrado", label: "Sobrado" },
  { value: "cobertura", label: "Cobertura" },
  { value: "terreno", label: "Terreno" },
  { value: "sala_comercial", label: "Sala comercial" },
  { value: "chacara", label: "Chácara" },
];

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: "novo", label: "Novo" },
  { value: "usado", label: "Usado" },
  { value: "ambos", label: "Ambos" },
];

const STATUS_OPTIONS: { value: PropertyStatus; label: string }[] = [
  { value: "disponivel", label: "Disponível" },
  { value: "reservado", label: "Reservado" },
  { value: "vendido", label: "Vendido" },
];

export interface CaptadorOption {
  id: string;
  name: string;
}

interface PropertyFormDialogProps {
  isOpen: boolean;
  /** `null` = modo criação. Não-nulo = edição do imóvel dado. */
  property: Property | null;
  /** Já filtrada para membros ATIVOS da imobiliária (IMOV-02 AC4) pelo chamador. */
  captadores: CaptadorOption[];
  onOpenChange: (isOpen: boolean) => void;
}

/**
 * Diálogo único de cadastro e edição de imóvel (lote-11 — IMOV-02/06/07).
 * Molde de `upload-dialog.tsx`/`edit-document-dialog.tsx`: o formulário
 * interno remonta por `key` a cada abertura (troca de imóvel, ou nova
 * criação), o que evita sincronizar state via efeito.
 */
export function PropertyFormDialog({
  isOpen,
  property,
  captadores,
  onOpenChange,
}: PropertyFormDialogProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width={560}>
      {isOpen && (
        <PropertyForm
          key={property?.id ?? "create"}
          property={property}
          captadores={captadores}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

interface FieldErrors {
  capturedByUserId?: string;
  kind?: string;
  modality?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  priceCents?: string;
  areaSqm?: string;
  bedrooms?: string;
  bathrooms?: string;
  parkingSpots?: string;
  photoUrls?: string;
}

interface PropertyFormProps {
  property: Property | null;
  captadores: CaptadorOption[];
  onClose: () => void;
}

/**
 * Converte a caixa de texto de URLs (uma por linha) na lista que as actions
 * esperam — linhas vazias são descartadas, nunca viram URL inválida.
 */
function parsePhotoUrls(text: string): string[] {
  return text
    .split("\n")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

function PropertyForm({ property, captadores, onClose }: PropertyFormProps) {
  const router = useRouter();
  const isEditing = property !== null;

  const [capturedByUserId, setCapturedByUserId] = useState<string | null>(
    property?.capturedByUserId ?? null
  );
  const [kind, setKind] = useState<PropertyKind | null>(property?.kind ?? null);
  const [modality, setModality] = useState<Modality | null>(
    property?.modality ?? null
  );
  const [status, setStatus] = useState<PropertyStatus>(
    property?.status ?? "disponivel"
  );
  const [published, setPublished] = useState(property?.published ?? false);
  const [street, setStreet] = useState(property?.street ?? "");
  const [number, setNumber] = useState(property?.number ?? "");
  const [complement, setComplement] = useState(property?.complement ?? "");
  const [neighborhood, setNeighborhood] = useState(property?.neighborhood ?? "");
  const [city, setCity] = useState(property?.city ?? "");
  const [state, setState] = useState(property?.state ?? "");
  const [priceReais, setPriceReais] = useState<number | null>(
    property ? Number(property.priceCents) / 100 : null
  );
  const [areaSqm, setAreaSqm] = useState<number | null>(property?.areaSqm ?? null);
  const [bedrooms, setBedrooms] = useState<number | null>(property?.bedrooms ?? null);
  const [bathrooms, setBathrooms] = useState<number | null>(
    property?.bathrooms ?? null
  );
  const [parkingSpots, setParkingSpots] = useState<number | null>(
    property?.parkingSpots ?? null
  );
  const [photoUrlsText, setPhotoUrlsText] = useState(
    (property?.photoUrls ?? []).join("\n")
  );
  const [description, setDescription] = useState(property?.description ?? "");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setBanner(null);

    const photoUrls = parsePhotoUrls(photoUrlsText);

    const nextErrors: FieldErrors = {
      capturedByUserId: capturedByUserId
        ? undefined
        : "Captador deve ser um membro ativo desta imobiliária.",
      kind: kind ? undefined : "Tipo é obrigatório.",
      modality: modality ? undefined : "Modalidade é obrigatória.",
      neighborhood: neighborhood.trim() ? undefined : "Bairro é obrigatório.",
      city: city.trim() ? undefined : "Cidade é obrigatória.",
      state: state.trim() ? undefined : "UF é obrigatória.",
      priceCents:
        priceReais !== null && priceReais > 0
          ? undefined
          : "Preço deve ser um número maior que zero.",
      areaSqm:
        areaSqm !== null && areaSqm > 0
          ? undefined
          : "Área deve ser um número inteiro maior que zero.",
      bedrooms:
        bedrooms !== null && bedrooms >= 0
          ? undefined
          : "Quartos deve ser um número inteiro maior ou igual a zero.",
      bathrooms:
        bathrooms !== null && bathrooms >= 0
          ? undefined
          : "Banheiros deve ser um número inteiro maior ou igual a zero.",
      parkingSpots:
        parkingSpots !== null && parkingSpots >= 0
          ? undefined
          : "Vagas deve ser um número inteiro maior ou igual a zero.",
      photoUrls:
        photoUrls.length <= MAX_PHOTO_URLS
          ? undefined
          : `Fotos: no máximo ${MAX_PHOTO_URLS} URLs por imóvel.`,
    };

    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    setIsSubmitting(true);

    const priceCents = Math.round((priceReais as number) * 100);
    const sharedFields = {
      kind: kind as PropertyKind,
      modality: modality as Modality,
      status,
      published,
      street: street.trim() ? street : null,
      number: number.trim() ? number : null,
      complement: complement.trim() ? complement : null,
      neighborhood,
      city,
      state,
      priceCents,
      areaSqm: areaSqm as number,
      bedrooms: bedrooms as number,
      bathrooms: bathrooms as number,
      parkingSpots: parkingSpots as number,
      description: description.trim() ? description : null,
      photoUrls,
    };

    const result = isEditing
      ? await updatePropertyAction({
          propertyId: property.id,
          capturedByUserId: capturedByUserId as string,
          ...sharedFields,
        })
      : await createPropertyAction({
          capturedByUserId: capturedByUserId as string,
          ...sharedFields,
        });

    setIsSubmitting(false);

    if (!result.ok) {
      // Erro devolvido pela action fica visível no diálogo sem fechá-lo
      // (IMOV-02 AC4, IMOV-07 AC1-AC7): o usuário corrige e tenta de novo.
      setBanner(result.error);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <Layout
      header={
        <DialogHeader
          title={isEditing ? "Editar imóvel" : "Novo imóvel"}
          onOpenChange={() => onClose()}
        />
      }
      content={
        <LayoutContent>
          <VStack gap={4}>
            {banner && <Banner status="error" title={banner} />}

            {isEditing && (
              <TextInput
                label="Referência"
                value={property.reference}
                isDisabled
                disabledMessage="A referência é atribuída automaticamente e não pode ser alterada."
              />
            )}

            <Selector
              label="Captador"
              placeholder="Selecione o captador"
              value={capturedByUserId ?? ""}
              onChange={(value) => {
                setCapturedByUserId(value);
                setErrors((prev) => ({ ...prev, capturedByUserId: undefined }));
              }}
              options={captadores.map((captador) => ({
                value: captador.id,
                label: captador.name,
              }))}
              status={
                errors.capturedByUserId
                  ? { type: "error", message: errors.capturedByUserId }
                  : undefined
              }
              isRequired
            />

            <HStack gap={3} wrap="wrap">
              <Selector
                label="Tipo"
                placeholder="Selecione o tipo"
                value={kind ?? ""}
                onChange={(value) => {
                  setKind(value as PropertyKind);
                  setErrors((prev) => ({ ...prev, kind: undefined }));
                }}
                options={KIND_OPTIONS}
                status={errors.kind ? { type: "error", message: errors.kind } : undefined}
                isRequired
                width={220}
              />

              <Selector
                label="Modalidade"
                placeholder="Selecione a modalidade"
                value={modality ?? ""}
                onChange={(value) => {
                  setModality(value as Modality);
                  setErrors((prev) => ({ ...prev, modality: undefined }));
                }}
                options={MODALITY_OPTIONS}
                status={
                  errors.modality ? { type: "error", message: errors.modality } : undefined
                }
                isRequired
                width={220}
              />
            </HStack>

            <HStack gap={3} vAlign="end" wrap="wrap">
              <Selector
                label="Status"
                value={status}
                onChange={(value) => setStatus(value as PropertyStatus)}
                options={STATUS_OPTIONS}
                isRequired
                width={220}
              />
              <Switch label="Publicado" value={published} onChange={setPublished} />
            </HStack>

            <HStack gap={3} wrap="wrap">
              <TextInput
                label="Bairro"
                value={neighborhood}
                onChange={(value) => {
                  setNeighborhood(value);
                  setErrors((prev) => ({ ...prev, neighborhood: undefined }));
                }}
                status={
                  errors.neighborhood
                    ? { type: "error", message: errors.neighborhood }
                    : undefined
                }
                isRequired
                width={220}
              />
              <TextInput
                label="Cidade"
                value={city}
                onChange={(value) => {
                  setCity(value);
                  setErrors((prev) => ({ ...prev, city: undefined }));
                }}
                status={errors.city ? { type: "error", message: errors.city } : undefined}
                isRequired
                width={220}
              />
              <TextInput
                label="UF"
                value={state}
                onChange={(value) => {
                  setState(value);
                  setErrors((prev) => ({ ...prev, state: undefined }));
                }}
                status={errors.state ? { type: "error", message: errors.state } : undefined}
                isRequired
                width={80}
              />
            </HStack>

            <HStack gap={3} wrap="wrap">
              <TextInput
                label="Logradouro"
                value={street}
                onChange={setStreet}
                isOptional
                width={260}
              />
              <TextInput
                label="Número"
                value={number}
                onChange={setNumber}
                isOptional
                width={100}
              />
              <TextInput
                label="Complemento"
                value={complement}
                onChange={setComplement}
                isOptional
                width={180}
              />
            </HStack>

            <HStack gap={3} wrap="wrap">
              <NumberInput
                label="Preço"
                units="R$"
                value={priceReais}
                onChange={(value) => {
                  setPriceReais(value);
                  setErrors((prev) => ({ ...prev, priceCents: undefined }));
                }}
                min={1}
                status={
                  errors.priceCents
                    ? { type: "error", message: errors.priceCents }
                    : undefined
                }
                isRequired
                width={160}
              />
              <NumberInput
                label="Área"
                units="m²"
                value={areaSqm}
                onChange={(value) => {
                  setAreaSqm(value);
                  setErrors((prev) => ({ ...prev, areaSqm: undefined }));
                }}
                min={1}
                isIntegerOnly
                status={
                  errors.areaSqm ? { type: "error", message: errors.areaSqm } : undefined
                }
                isRequired
                width={140}
              />
            </HStack>

            <HStack gap={3} wrap="wrap">
              <NumberInput
                label="Quartos"
                value={bedrooms}
                onChange={(value) => {
                  setBedrooms(value);
                  setErrors((prev) => ({ ...prev, bedrooms: undefined }));
                }}
                min={0}
                isIntegerOnly
                status={
                  errors.bedrooms ? { type: "error", message: errors.bedrooms } : undefined
                }
                isRequired
                width={120}
              />
              <NumberInput
                label="Banheiros"
                value={bathrooms}
                onChange={(value) => {
                  setBathrooms(value);
                  setErrors((prev) => ({ ...prev, bathrooms: undefined }));
                }}
                min={0}
                isIntegerOnly
                status={
                  errors.bathrooms
                    ? { type: "error", message: errors.bathrooms }
                    : undefined
                }
                isRequired
                width={120}
              />
              <NumberInput
                label="Vagas"
                value={parkingSpots}
                onChange={(value) => {
                  setParkingSpots(value);
                  setErrors((prev) => ({ ...prev, parkingSpots: undefined }));
                }}
                min={0}
                isIntegerOnly
                status={
                  errors.parkingSpots
                    ? { type: "error", message: errors.parkingSpots }
                    : undefined
                }
                isRequired
                width={120}
              />
            </HStack>

            <TextArea
              label="Fotos"
              description={`Uma URL por linha (http:// ou https://), até ${MAX_PHOTO_URLS}.`}
              value={photoUrlsText}
              onChange={setPhotoUrlsText}
              status={
                errors.photoUrls ? { type: "error", message: errors.photoUrls } : undefined
              }
              rows={3}
              isOptional
            />

            <TextArea
              label="Descrição"
              value={description}
              onChange={setDescription}
              maxLength={4000}
              isOptional
            />
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
