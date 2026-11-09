import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { modalityEnum, tenants, users } from "../../db/schema";
import { PROPERTY_KIND, PROPERTY_STATUS, STOREFRONT_LAYOUT } from "./vocabulary";

// Enum própria do catálogo de imóveis (lote-11 — IMOV-01/03). Superset de
// `propertyTypeEnum` nos dois valores compartilhados ("casa", "apartamento"),
// o que faz o filtro vindo de um lead mapear 1:1 sem tabela de tradução.
// `propertyTypeEnum` do núcleo fica intocada: é campo obrigatório de qualificação
// (`n8n/src/phase.mjs`) e seu rótulo está publicado dentro do workflow —
// ampliá-la arrastaria a republicação (design.md — Tech Decisions).
export const propertyKindEnum = pgEnum("property_kind", [
  PROPERTY_KIND.house,
  PROPERTY_KIND.apartment,
  PROPERTY_KIND.townhouse,
  PROPERTY_KIND.penthouse,
  PROPERTY_KIND.land,
  PROPERTY_KIND.commercial_room,
  PROPERTY_KIND.farmhouse,
]);

// Status do imóvel (lote-11 — IMOV-05). Transição livre entre os três
// valores, sem tabela de transições permitidas (design.md — Assumptions):
// diferente de `leads`, o imóvel não tem trava humana nem ator agente.
export const propertyStatusEnum = pgEnum("property_status", [
  PROPERTY_STATUS.available,
  PROPERTY_STATUS.reserved,
  PROPERTY_STATUS.sold,
]);

// Vitrine pública (lote-16a — VCFG-01). Listas fechadas: fonte livre exigiria
// URL arbitrária na página pública (spec, Assumptions). O contrato espelhado
// em `src/lib/storefront-contract.ts` falha se divergir destes valores.
export const storefrontLayoutEnum = pgEnum("storefront_layout", [
  STOREFRONT_LAYOUT.grid,
  STOREFRONT_LAYOUT.editorial,
]);

export const storefrontFontEnum = pgEnum("storefront_font", [
  "inter",
  "montserrat",
  "lora",
  "playfair",
]);

// ---------------------------------------------------------------------------
// Catálogo de imóveis (lote-11 — IMOV-01/02/03/05/06). CRUD no CRM e consulta
// pelo agente através da tool `buscar_imoveis` (design.md — Data Models).
//
// Sem relação com `leads` por decisão de modelagem do usuário (2026-09-04):
// a qualificação continua sobre critérios, nunca sobre uma unidade
// específica — o que mantém a questão de comissão fora do escopo técnico.
// ---------------------------------------------------------------------------

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // Captador (IMOV-02). NOT NULL: todo imóvel nasce com dono da captação.
    // `restrict` implícito (default do Postgres) — a FK impede excluir
    // usuário que ainda capta (T9 traduz a violação numa recusa legível).
    capturedByUserId: uuid("captured_by_user_id")
      .notNull()
      .references(() => users.id),

    // Referência legível (IMOV-03). `sequence` é o número por imobiliária;
    // `reference` é o rótulo derivado ("AP-0142"). Os dois nascem juntos e
    // nunca mudam depois (imutabilidade garantida pelo tipo do patch de
    // `updateProperty`, não por checagem em runtime).
    sequence: integer("sequence").notNull(),
    reference: text("reference").notNull(),

    kind: propertyKindEnum("kind").notNull(),
    modality: modalityEnum("modality").notNull(),
    status: propertyStatusEnum("status").notNull().default(PROPERTY_STATUS.available),
    published: boolean("published").notNull().default(false),
    // Destaque da vitrine pública (lote-16a — VDEST-01). Sem teto por
    // imobiliária; fica fora da rota de busca do contrato `/api/v1`.
    featured: boolean("featured").notNull().default(false),

    street: text("street"), // só o CRM lê (BUSCA-03)
    number: text("number"), // só o CRM lê
    complement: text("complement"), // só o CRM lê
    neighborhood: text("neighborhood").notNull(),
    neighborhoodNormalized: text("neighborhood_normalized").notNull(),
    city: text("city").notNull(),
    cityNormalized: text("city_normalized").notNull(),
    state: text("state").notNull(), // UF, 2 chars por convenção (como tenants.state)

    priceCents: bigint("price_cents", { mode: "bigint" }).notNull(),
    areaSqm: integer("area_sqm").notNull(),
    bedrooms: integer("bedrooms").notNull(),
    bathrooms: integer("bathrooms").notNull(),
    parkingSpots: integer("parking_spots").notNull(),

    description: text("description"),
    photoUrls: text("photo_urls").array(), // URLs externas; nenhum byte (IMOV-06)

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // IMOV-03 AC7: a trava da referência é do BANCO. Duas criações
    // concorrentes leem o mesmo `max(sequence)` e escolhem o mesmo número;
    // só o índice garante que exatamente uma confirma.
    uniqueIndex("properties_tenant_id_sequence_idx").on(
      table.tenantId,
      table.sequence
    ),
    uniqueIndex("properties_tenant_id_reference_idx").on(
      table.tenantId,
      table.reference
    ),
    // BUSCA-02: o corte de visibilidade é a consulta mais quente da rota.
    index("properties_tenant_visible_idx").on(
      table.tenantId,
      table.status,
      table.published
    ),
    index("properties_captured_by_user_id_idx").on(table.capturedByUserId),
  ]
);

// ---------------------------------------------------------------------------
// Vitrine pública do catálogo (lote-16a — VCFG-01, AD-040).
//
// Tabela 1:1 com `tenants`: ausência de linha equivale a vitrine inativa com
// os valores padrão (AD-004: imobiliárias existentes não precisam de migração).
// A fronteira pública não é esta tabela, e sim as views do schema `vitrine`
// (`scripts/vitrine/vitrine.sql`), que o papel `krivo_vitrine` lê.
//
// Os dois checks são do BANCO. O `drizzle-kit push` já saiu com 0 deixando
// check sem aplicar (L-068): o SQL da vitrine os reaplica de forma idempotente
// e o `db:push:test` confere o estado final.
// ---------------------------------------------------------------------------
export const tenantStorefronts = pgTable(
  "tenant_storefronts",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "cascade" }),
    active: boolean("active").notNull().default(false),
    layout: storefrontLayoutEnum("layout").notNull().default(STOREFRONT_LAYOUT.grid),
    // "#rrggbb" em minúsculas; nulo = cor padrão da vitrine.
    accentColor: text("accent_color"),
    font: storefrontFontEnum("font").notNull().default("inter"),
    creci: text("creci"),
    legalName: text("legal_name"),
    headline: text("headline"),
    about: text("about"),
    // Handle sem "@", [a-z0-9._]{1,30}; o link é montado pela vitrine.
    instagram: text("instagram"),
    // Só dígitos, de 10 a 13.
    phone: text("phone"),
    address: text("address"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "tenant_storefronts_accent_color_check",
      sql`${table.accentColor} is null or ${table.accentColor} ~ '^#[0-9a-f]{6}$'`
    ),
    // `nullif(trim(x), '') is not null` e não `trim(x) <> ''`: com CRECI nulo a
    // comparação dá nulo e o check passaria (nulo satisfaz CHECK).
    check(
      "tenant_storefronts_active_requires_identity_check",
      sql`not ${table.active} or (nullif(trim(${table.creci}), '') is not null and nullif(trim(${table.legalName}), '') is not null)`
    ),
  ]
);
