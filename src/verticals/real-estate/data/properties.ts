import "server-only";

import { and, count, desc, eq, ilike, max, or, sql } from "drizzle-orm";
import { db } from "../../../db";
import { users } from "../../../db/schema";
import { normalizeForSearch } from "../../../lib/normalize-text";
import { isForeignKeyViolation, isUniqueViolation } from "../../../server/data/pg-errors";
import { properties } from "../schema";
import { PROPERTY_STATUS } from "../vocabulary";

export type Property = typeof properties.$inferSelect;
export type Modality = Property["modality"];
export type PropertyKind = Property["kind"];
export type PropertyStatus = Property["status"];

// ---------------------------------------------------------------------------
// Catálogo de imóveis (lote-11 — IMOV-01/02). Molde direto de `getDocuments`
// (`and(...)` com `undefined` condicional) e de `isNull(tenant_members.
// deactivatedAt)` (`getAssignees`).
// ---------------------------------------------------------------------------

export interface PropertyFilters {
  status?: PropertyStatus;
  published?: boolean;
  kind?: PropertyKind;
  modality?: Modality;
  // Comparado contra `neighborhoodNormalized`/`cityNormalized` — o chamador
  // não precisa normalizar antes; `getProperties` normaliza aqui, uma vez,
  // com a mesma função usada na escrita (design.md — Colunas `*Normalized`).
  search?: string;
}

export async function getProperties(
  tenantId: string,
  filters?: PropertyFilters
): Promise<Property[]> {
  const normalizedSearch = filters?.search
    ? normalizeForSearch(filters.search)
    : undefined;

  return db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.tenantId, tenantId),
        filters?.status ? eq(properties.status, filters.status) : undefined,
        filters?.published !== undefined
          ? eq(properties.published, filters.published)
          : undefined,
        filters?.kind ? eq(properties.kind, filters.kind) : undefined,
        filters?.modality
          ? eq(properties.modality, filters.modality)
          : undefined,
        normalizedSearch
          ? or(
              ilike(properties.neighborhoodNormalized, `%${normalizedSearch}%`),
              ilike(properties.cityNormalized, `%${normalizedSearch}%`)
            )
          : undefined
      )
    )
    .orderBy(desc(properties.updatedAt));
}

/**
 * Campos de entrada de um imóvel (IMOV-01/03). `sequence` e `reference`
 * nascem calculados por `createProperty` — nunca aceitos aqui, o que é o que
 * torna `UpdatePropertyPatch` (abaixo) imutável para os dois por construção
 * (IMOV-03 AC6), não por checagem em runtime.
 */
export interface NewProperty {
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
  priceCents: bigint;
  areaSqm: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number;
  description?: string | null;
  photoUrls?: string[];
}

export type UpdatePropertyPatch = Partial<NewProperty>;

export type CreatePropertyResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

const MAX_PROPERTY_REFERENCE_ATTEMPTS = 3;

function buildPropertyReference(sequence: number): string {
  return `IM-${String(sequence).padStart(4, "0")}`;
}

/**
 * `sequence` nasce como `max(sequence) + 1` **por tenant** (IMOV-03 AC5) e
 * `reference` é derivada dele. A corrida entre duas criações concorrentes
 * lendo o mesmo `max` é resolvida pelo índice único do banco (IMOV-03 AC7),
 * nunca pela aplicação — por isso a leitura do `max` não roda em transação
 * com o insert: é a rejeição do índice na segunda tentativa que garante a
 * unicidade, e o retry aqui é só recuperação dessa rejeição.
 */
export async function createProperty(
  tenantId: string,
  input: NewProperty
): Promise<CreatePropertyResult> {
  for (let attempt = 0; attempt < MAX_PROPERTY_REFERENCE_ATTEMPTS; attempt++) {
    const [row] = await db
      .select({ maxSequence: max(properties.sequence) })
      .from(properties)
      .where(eq(properties.tenantId, tenantId));
    const sequence = (row?.maxSequence ?? 0) + 1;

    try {
      const rows = await db
        .insert(properties)
        .values({
          tenantId,
          capturedByUserId: input.capturedByUserId,
          sequence,
          reference: buildPropertyReference(sequence),
          kind: input.kind,
          modality: input.modality,
          status: input.status ?? PROPERTY_STATUS.available,
          published: input.published ?? false,
          street: input.street ?? null,
          number: input.number ?? null,
          complement: input.complement ?? null,
          neighborhood: input.neighborhood,
          neighborhoodNormalized: normalizeForSearch(input.neighborhood),
          city: input.city,
          cityNormalized: normalizeForSearch(input.city),
          state: input.state,
          priceCents: input.priceCents,
          areaSqm: input.areaSqm,
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          parkingSpots: input.parkingSpots,
          description: input.description ?? null,
          photoUrls: input.photoUrls ?? [],
        })
        .returning({ id: properties.id });
      return { ok: true, id: rows[0].id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Colisão em (tenant_id, sequence) ou (tenant_id, reference): outra
      // criação concorrente já ocupou este número — recalcula o `max` e
      // tenta de novo (até `MAX_PROPERTY_REFERENCE_ATTEMPTS` vezes).
    }
  }
  return {
    ok: false,
    error:
      "Não foi possível gerar uma referência única para o imóvel. Tente novamente.",
  };
}

/**
 * Retorna `false` (no-op) quando nenhuma linha corresponde a `tenantId` +
 * `propertyId`. `sequence`/`reference` não podem aparecer em `patch` — o
 * tipo `UpdatePropertyPatch` não os declara (IMOV-03 AC6). Ao alterar
 * `neighborhood`/`city`, a coluna `*Normalized` gêmea é recalculada aqui,
 * nunca deixada como estava.
 */
export async function updateProperty(
  tenantId: string,
  propertyId: string,
  patch: UpdatePropertyPatch
): Promise<boolean> {
  const setValues = {
    ...patch,
    updatedAt: sql`now()`,
    ...(patch.neighborhood !== undefined
      ? { neighborhoodNormalized: normalizeForSearch(patch.neighborhood) }
      : {}),
    ...(patch.city !== undefined
      ? { cityNormalized: normalizeForSearch(patch.city) }
      : {}),
  };

  const rows = await db
    .update(properties)
    .set(setValues)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.id, propertyId)))
    .returning({ id: properties.id });
  return rows.length > 0;
}

/**
 * Retorna `false` (no-op) quando nenhuma linha corresponde a `tenantId` +
 * `propertyId` — nunca lança erro para um id inexistente/de outro tenant.
 */
export async function deleteProperty(
  tenantId: string,
  propertyId: string
): Promise<boolean> {
  const rows = await db
    .delete(properties)
    .where(and(eq(properties.tenantId, tenantId), eq(properties.id, propertyId)))
    .returning({ id: properties.id });
  return rows.length > 0;
}

/**
 * Destaque da vitrine pública (lote-16a — VDEST-01). Escrita própria, fora de
 * `UpdatePropertyPatch`: o destaque só interessa à vitrine e não faz parte da
 * edição do imóvel nem do contrato `/api/v1`. Sem teto de destaques por
 * imobiliária (AC5). Retorna `false` (no-op) quando nenhuma linha corresponde
 * a `tenantId` + `propertyId` — imóvel de outro tenant é tratado como inexistente.
 */
export async function setPropertyFeatured(
  tenantId: string,
  propertyId: string,
  featured: boolean
): Promise<boolean> {
  const rows = await db
    .update(properties)
    .set({ featured, updatedAt: sql`now()` })
    .where(and(eq(properties.tenantId, tenantId), eq(properties.id, propertyId)))
    .returning({ id: properties.id });
  return rows.length > 0;
}

export type DeleteUserResult =
  | { ok: true }
  | { ok: false; propertiesCaptured: number };

/**
 * Exclusão real de um usuário (lote-11 — T9; spec.md Edge Cases: "exclusão de
 * usuário tentada enquanto ele for captador de algum imóvel"). `tenant_members`
 * referencia `users.id` com `onDelete: "cascade"` (schema.ts), então apagar o
 * usuário já remove o vínculo em qualquer imobiliária a que ele pertença —
 * nenhum delete explícito de `tenant_members` é necessário aqui.
 *
 * `properties.captured_by_user_id` referencia `users.id` sem `onDelete`
 * (restrict — o default do Postgres): se o usuário ainda captar algum imóvel,
 * a exclusão é rejeitada pelo próprio banco, e a contagem de imóveis é lida
 * só nesse caminho de erro para compor a recusa legível.
 *
 * Uma violação de FK vinda de OUTRA tabela (ex.: `leads.assigned_user_id`,
 * que também referencia `users.id` sem cascata) não é traduzida aqui — está
 * fora do escopo desta task, que só cobre `captured_by_user_id` — e é
 * relançada como está.
 */
export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  try {
    await db.delete(users).where(eq(users.id, userId));
    return { ok: true };
  } catch (err) {
    if (!isForeignKeyViolation(err)) throw err;

    const [row] = await db
      .select({ capturedCount: count() })
      .from(properties)
      .where(eq(properties.capturedByUserId, userId));
    const capturedCount = Number(row.capturedCount);

    if (capturedCount === 0) throw err;
    return { ok: false, propertiesCaptured: capturedCount };
  }
}
