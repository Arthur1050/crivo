import {
  bigint,
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
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

// Tables

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  agentName: text("agent_name").notNull(),
  supportedModality: modalityEnum("supported_modality").notNull(),
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

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  modality: modalityEnum("modality").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "bigint" }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Reserva de TTL (LGPD) — enforcement é Fase 7 (design.md)
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
