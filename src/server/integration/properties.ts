import "server-only";
import { and, asc, count, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db";
import { properties } from "../../db/schema";
import { formatCurrencyBRL } from "../../lib/format";
import type { Modality, PropertyKind } from "../data";
import type { PropertySearchFilters } from "./property-filters";

// BUSCA-02: no máximo 3 imóveis por chamada — é resposta de WhatsApp, não
// listagem (design.md — Assumptions).
export const PROPERTY_SEARCH_LIMIT = 3;

/**
 * O que a rota devolve por imóvel (design.md — DTO do contrato). Note o que
 * NÃO está aqui — BUSCA-03: sem logradouro, número, complemento, descrição,
 * foto ou qualquer campo do captador. A ausência é estrutural: `serialize`
 * monta este objeto campo a campo a partir da linha completa do banco, nunca
 * espalha (`...row`) a linha inteira.
 */
export interface SerializedProperty {
  referencia: string;
  tipo: PropertyKind;
  modalidade: Modality;
  bairro: string;
  cidade: string;
  uf: string;
  /** Já formatado em Real brasileiro (`formatCurrencyBRL`) — nenhum `bigint`
   * atravessa este DTO (design.md — Risks: "bigint não é JSON-safe"). */
  preco: string;
  areaM2: number;
  quartos: number;
  banheiros: number;
  vagas: number;
}

export interface PropertySearchResult {
  imoveis: SerializedProperty[];
  total: number;
}

function serializeProperty(
  row: typeof properties.$inferSelect
): SerializedProperty {
  return {
    referencia: row.reference,
    tipo: row.kind,
    modalidade: row.modality,
    bairro: row.neighborhood,
    cidade: row.city,
    uf: row.state,
    preco: formatCurrencyBRL(row.priceCents)!,
    areaM2: row.areaSqm,
    quartos: row.bedrooms,
    banheiros: row.bathrooms,
    vagas: row.parkingSpots,
  };
}

/**
 * Busca de imóveis visíveis do contrato (BUSCA-01/02/03; design.md —
 * `src/server/integration/properties.ts`). O corte de visibilidade —
 * `status = 'disponivel' AND published = true` — é aplicado AQUI E SÓ AQUI
 * (design.md — Risks: nenhum outro consumidor externo ao CRM decide o que é
 * "visível ao público"; IMOV-05 AC3). `total` conta TODOS os imóveis que
 * casam com o filtro (não só a página de 3), com o MESMO `where` da página —
 * nunca o tamanho da página em si. A página usa `updatedAt` decrescente com
 * `id` crescente como desempate determinístico (BUSCA-02).
 */
export async function searchVisibleProperties(
  tenantId: string,
  filters: PropertySearchFilters
): Promise<PropertySearchResult> {
  const where = and(
    eq(properties.tenantId, tenantId),
    eq(properties.status, "disponivel"),
    eq(properties.published, true),
    filters.modality ? eq(properties.modality, filters.modality) : undefined,
    filters.kind ? eq(properties.kind, filters.kind) : undefined,
    filters.neighborhood
      ? eq(properties.neighborhoodNormalized, filters.neighborhood)
      : undefined,
    filters.city ? eq(properties.cityNormalized, filters.city) : undefined,
    filters.minPriceCents !== undefined
      ? gte(properties.priceCents, BigInt(filters.minPriceCents))
      : undefined,
    filters.maxPriceCents !== undefined
      ? lte(properties.priceCents, BigInt(filters.maxPriceCents))
      : undefined,
    filters.minBedrooms !== undefined
      ? gte(properties.bedrooms, filters.minBedrooms)
      : undefined
  );

  const [totalRow] = await db
    .select({ total: count() })
    .from(properties)
    .where(where);

  const rows = await db
    .select()
    .from(properties)
    .where(where)
    .orderBy(desc(properties.updatedAt), asc(properties.id))
    .limit(PROPERTY_SEARCH_LIMIT);

  return {
    imoveis: rows.map(serializeProperty),
    total: Number(totalRow.total),
  };
}
