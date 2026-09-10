"use server";

import { revalidatePath } from "next/cache";
import { getActiveTenantId } from "../tenant";
import { denyIfForbidden } from "./permission";
import {
  createProperty,
  deleteProperty,
  isActiveMemberOf,
  updateProperty,
  type Modality,
  type PropertyKind,
  type PropertyStatus,
  type UpdatePropertyPatch,
} from "../data";
import {
  validateAreaSqm,
  validateDescription,
  validateModality,
  validateName,
  validatePhotoUrls,
  validatePriceCents,
  validatePropertyKind,
  validatePropertyStatus,
  validateRoomCount,
  validateUf,
} from "../validation";

// Escrita do catálogo de imóveis pelo CRM (lote-11 — IMOV-02/04/05/07).
// `src/server/actions/documents.ts` é o molde na íntegra: o tenant vem
// sempre de `getActiveTenantId()` (nunca do `input`), a recusa de permissão
// é a primeira coisa que roda em toda action, e cada escrita bem-sucedida
// chama `revalidatePath("/imoveis")`.

export type ActionResult = { ok: true } | { ok: false; error: string };

const CAPTURER_ERROR =
  "Captador deve ser um membro ativo desta imobiliária.";
const NOT_FOUND_ERROR = "Imóvel não encontrado.";

export interface CreatePropertyInput {
  capturedByUserId: string;
  kind: PropertyKind;
  modality: Modality;
  status?: PropertyStatus;
  published?: boolean;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  priceCents: number | bigint;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number;
  description?: string | null;
  photoUrls?: string[];
}

/**
 * Cria um imóvel no tenant ativo (IMOV-01/02/07).
 *
 * Todo campo obrigatório é validado mesmo quando `undefined` chega em tempo
 * de execução (payload malformado que contorna o tipo do TypeScript): os
 * campos de texto são coalescidos para `""` antes de entrar no validador, o
 * que os faz cair na MESMA regra do campo vazio — nunca em "manter valor
 * atual", que não existe em criação (IMOV-07 AC5). Os validadores numéricos
 * (`validatePriceCents`/`validateAreaSqm`/`validateRoomCount`) já rejeitam
 * `undefined` sem precisar de coalescência, porque `Number.isInteger` é
 * falso para ele.
 */
export async function createPropertyAction(
  input: CreatePropertyInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("imoveis", "escrever");
  if (denied) return denied;

  const kindCheck = validatePropertyKind(input.kind ?? "");
  if (!kindCheck.ok) return kindCheck;

  const modalityCheck = validateModality(input.modality);
  if (!modalityCheck.ok) return modalityCheck;

  const neighborhoodCheck = validateName(input.neighborhood ?? "", "Bairro");
  if (!neighborhoodCheck.ok) return neighborhoodCheck;

  const cityCheck = validateName(input.city ?? "", "Cidade");
  if (!cityCheck.ok) return cityCheck;

  const ufCheck = validateUf(input.state);
  if (!ufCheck.ok) return ufCheck;

  const priceCheck = validatePriceCents(input.priceCents);
  if (!priceCheck.ok) return priceCheck;

  const areaCheck = validateAreaSqm(input.areaSqm);
  if (!areaCheck.ok) return areaCheck;

  const bedroomsCheck = validateRoomCount(input.bedrooms, "Quartos");
  if (!bedroomsCheck.ok) return bedroomsCheck;

  const bathroomsCheck = validateRoomCount(input.bathrooms, "Banheiros");
  if (!bathroomsCheck.ok) return bathroomsCheck;

  const parkingCheck = validateRoomCount(input.parkingSpots, "Vagas");
  if (!parkingCheck.ok) return parkingCheck;

  const photoUrls = input.photoUrls ?? [];
  const photosCheck = validatePhotoUrls(photoUrls);
  if (!photosCheck.ok) return photosCheck;

  const descriptionCheck = validateDescription(input.description);
  if (!descriptionCheck.ok) return descriptionCheck;

  // `status` tem default no banco (IMOV-05 AC1) — só é validado quando
  // PRESENTE (AC4: presente e vazio é recusado; ausente não é).
  if (input.status !== undefined) {
    const statusCheck = validatePropertyStatus(input.status);
    if (!statusCheck.ok) return statusCheck;
  }

  // IMOV-07 AC5: captador ausente do payload de criação é a mesma recusa de
  // captador inválido — nunca uma string vazia repassada ao banco (que
  // rejeitaria a própria coluna `uuid` antes mesmo de checar o vínculo).
  if (!input.capturedByUserId) {
    return { ok: false, error: CAPTURER_ERROR };
  }

  const tenantId = await getActiveTenantId();

  const capturerActive = await isActiveMemberOf(
    tenantId,
    input.capturedByUserId
  );
  if (!capturerActive) {
    return { ok: false, error: CAPTURER_ERROR };
  }

  const result = await createProperty(tenantId, {
    capturedByUserId: input.capturedByUserId,
    kind: input.kind,
    modality: input.modality,
    status: input.status,
    published: input.published,
    street: input.street ?? null,
    number: input.number ?? null,
    complement: input.complement ?? null,
    neighborhood: input.neighborhood.trim(),
    city: input.city.trim(),
    state: input.state,
    priceCents: BigInt(input.priceCents),
    areaSqm: input.areaSqm,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    parkingSpots: input.parkingSpots,
    description: input.description ?? null,
    photoUrls,
  });

  if (!result.ok) return result;

  revalidatePath("/imoveis");
  return { ok: true };
}

export interface UpdatePropertyInput {
  propertyId: string;
  capturedByUserId?: string;
  kind?: PropertyKind;
  modality?: Modality;
  status?: PropertyStatus;
  published?: boolean;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string;
  city?: string;
  state?: string;
  priceCents?: number | bigint;
  areaSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpots?: number;
  description?: string | null;
  photoUrls?: string[];
}

/**
 * Edita um imóvel existente (IMOV-01 AC8). Ao contrário da criação, um campo
 * AUSENTE aqui significa "não altere" — é edição parcial, e `sequence`/
 * `reference` não fazem parte do tipo do patch (IMOV-03 AC6, garantido pelo
 * tipo, não por checagem em runtime).
 */
export async function updatePropertyAction(
  input: UpdatePropertyInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("imoveis", "escrever");
  if (denied) return denied;

  const patch: UpdatePropertyPatch = {};

  if (input.kind !== undefined) {
    const check = validatePropertyKind(input.kind);
    if (!check.ok) return check;
    patch.kind = input.kind;
  }

  if (input.modality !== undefined) {
    const check = validateModality(input.modality);
    if (!check.ok) return check;
    patch.modality = input.modality;
  }

  if (input.status !== undefined) {
    const check = validatePropertyStatus(input.status);
    if (!check.ok) return check;
    patch.status = input.status;
  }

  if (input.published !== undefined) {
    patch.published = input.published;
  }

  if (input.neighborhood !== undefined) {
    const check = validateName(input.neighborhood, "Bairro");
    if (!check.ok) return check;
    patch.neighborhood = input.neighborhood.trim();
  }

  if (input.city !== undefined) {
    const check = validateName(input.city, "Cidade");
    if (!check.ok) return check;
    patch.city = input.city.trim();
  }

  if (input.state !== undefined) {
    const check = validateUf(input.state);
    if (!check.ok) return check;
    patch.state = input.state;
  }

  if (input.priceCents !== undefined) {
    const check = validatePriceCents(input.priceCents);
    if (!check.ok) return check;
    patch.priceCents = BigInt(input.priceCents);
  }

  if (input.areaSqm !== undefined) {
    const check = validateAreaSqm(input.areaSqm);
    if (!check.ok) return check;
    patch.areaSqm = input.areaSqm;
  }

  if (input.bedrooms !== undefined) {
    const check = validateRoomCount(input.bedrooms, "Quartos");
    if (!check.ok) return check;
    patch.bedrooms = input.bedrooms;
  }

  if (input.bathrooms !== undefined) {
    const check = validateRoomCount(input.bathrooms, "Banheiros");
    if (!check.ok) return check;
    patch.bathrooms = input.bathrooms;
  }

  if (input.parkingSpots !== undefined) {
    const check = validateRoomCount(input.parkingSpots, "Vagas");
    if (!check.ok) return check;
    patch.parkingSpots = input.parkingSpots;
  }

  if (input.photoUrls !== undefined) {
    const check = validatePhotoUrls(input.photoUrls);
    if (!check.ok) return check;
    patch.photoUrls = input.photoUrls;
  }

  if (input.description !== undefined) {
    const check = validateDescription(input.description);
    if (!check.ok) return check;
    patch.description = input.description;
  }

  if (input.street !== undefined) patch.street = input.street;
  if (input.number !== undefined) patch.number = input.number;
  if (input.complement !== undefined) patch.complement = input.complement;

  const tenantId = await getActiveTenantId();

  if (input.capturedByUserId !== undefined) {
    const capturerActive =
      !!input.capturedByUserId &&
      (await isActiveMemberOf(tenantId, input.capturedByUserId));
    if (!capturerActive) {
      return { ok: false, error: CAPTURER_ERROR };
    }
    patch.capturedByUserId = input.capturedByUserId;
  }

  const updated = await updateProperty(tenantId, input.propertyId, patch);
  if (!updated) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  revalidatePath("/imoveis");
  return { ok: true };
}

export interface DeletePropertyInput {
  propertyId: string;
}

export async function deletePropertyAction(
  input: DeletePropertyInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("imoveis", "escrever");
  if (denied) return denied;

  const tenantId = await getActiveTenantId();
  const deleted = await deleteProperty(tenantId, input.propertyId);

  if (!deleted) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  revalidatePath("/imoveis");
  return { ok: true };
}

export interface SetPropertyPublishedInput {
  propertyId: string;
  published: boolean;
}

/**
 * Alterna a publicação sem exigir nenhuma transição de status (IMOV-05 AC2).
 */
export async function setPropertyPublishedAction(
  input: SetPropertyPublishedInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("imoveis", "escrever");
  if (denied) return denied;

  const tenantId = await getActiveTenantId();
  const updated = await updateProperty(tenantId, input.propertyId, {
    published: input.published,
  });

  if (!updated) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  revalidatePath("/imoveis");
  return { ok: true };
}

export interface SetPropertyStatusInput {
  propertyId: string;
  status: PropertyStatus;
}

/**
 * Altera o status livremente entre `disponivel`/`reservado`/`vendido`, sem
 * tabela de transições (IMOV-05 AC2, design.md — Assumptions).
 */
export async function setPropertyStatusAction(
  input: SetPropertyStatusInput
): Promise<ActionResult> {
  const denied = await denyIfForbidden("imoveis", "escrever");
  if (denied) return denied;

  const statusCheck = validatePropertyStatus(input.status);
  if (!statusCheck.ok) return statusCheck;

  const tenantId = await getActiveTenantId();
  const updated = await updateProperty(tenantId, input.propertyId, {
    status: input.status,
  });

  if (!updated) {
    return { ok: false, error: NOT_FOUND_ERROR };
  }

  revalidatePath("/imoveis");
  return { ok: true };
}
