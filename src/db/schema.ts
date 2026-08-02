import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Enums (design.md — Data Models)
export const leadStatusEnum = pgEnum("lead_status", [
  "em_qualificacao",
  "qualificado_agendado",
  "escalado_humano",
]);

export const modalityEnum = pgEnum("modality", ["novo", "usado", "ambos"]);

export const propertyTypeEnum = pgEnum("property_type", [
  "casa",
  "apartamento",
]);

export const motivationEnum = pgEnum("motivation", [
  "investidor",
  "morador",
]);

export const creditStatusEnum = pgEnum("credit_status", [
  "pre_aprovado",
  "recurso_proprio",
  "fgts",
]);

export const senderEnum = pgEnum("sender", ["agente", "lead"]);

// 1:1 com as 10 cores do componente `Token` da Astryx (design.md — Cor de
// categoria). Paleta fixa: nenhum hex cru é aceito em nenhuma camada.
export const categoryColorEnum = pgEnum("category_color", [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "cyan",
  "blue",
  "purple",
  "pink",
  "gray",
]);

// Tables

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  agentName: text("agent_name").notNull(),
  supportedModality: modalityEnum("supported_modality").notNull(),
  // Baseline pré-piloto (Lote 4 — DASH-05). Snapshot único por tenant,
  // nullable até ser preenchido (mockado no seed por ora; real na Fase 10).
  baselineLeadsPerMonth: integer("baseline_leads_per_month"),
  baselineFirstResponseMinutes: integer("baseline_first_response_minutes"),
  baselineLeadToMeetingPct: integer("baseline_lead_to_meeting_pct"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const brokers = pgTable("brokers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  brokerId: uuid("broker_id").references(() => brokers.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  status: leadStatusEnum("status").notNull(),
  // Campos de qualificação (PRD §6.4) — nullable até o lead ser qualificado
  modality: modalityEnum("modality"),
  region: text("region"),
  budgetCents: bigint("budget_cents", { mode: "bigint" }),
  propertyType: propertyTypeEnum("property_type"),
  purchaseHorizon: text("purchase_horizon"),
  motivation: motivationEnum("motivation"),
  creditStatus: creditStatusEnum("credit_status"),
  chainedOperation: boolean("chained_operation"),
  executiveSummary: text("executive_summary"),
  escalationReason: text("escalation_reason"),
  meetingAt: timestamp("meeting_at", { withTimezone: true }),
  meetingAttended: boolean("meeting_attended"),
  firstContactAt: timestamp("first_contact_at", {
    withTimezone: true,
  }).notNull(),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  leadId: uuid("lead_id")
    .notNull()
    .references(() => leads.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Redundante em relação a conversations.tenant_id — simplifica o filtro de isolamento (design.md)
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  sender: senderEnum("sender").notNull(),
  content: text("content").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentCategories = pgTable(
  "document_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    // Default 'gray' torna a migração não-destrutiva: categorias criadas
    // antes deste lote passam a ter essa cor sem exigir backfill manual
    // (spec.md — CAT-01.5).
    color: categoryColorEnum("color").notNull().default("gray"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Nome único por tenant, ignorando maiúsculas/minúsculas (lote-2 — CONF-01/02)
    uniqueIndex("document_categories_tenant_id_lower_name_idx").on(
      table.tenantId,
      sql`lower(${table.name})`
    ),
  ]
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  modality: modalityEnum("modality").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
  categoryId: uuid("category_id").references(() => documentCategories.id, {
    onDelete: "set null",
  }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Reserva de TTL (LGPD) — enforcement é Fase 7 (design.md)
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
