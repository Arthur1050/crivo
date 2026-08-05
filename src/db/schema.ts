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

// Origem da última mudança de status de um lead (lote-5 — INT-04: trava
// humana). `null` = nunca alterado por nenhum ator (estado do seed).
export const statusActorEnum = pgEnum("status_actor", ["humano", "agente"]);

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
  // Identidade institucional exibida no shell e editável em Configurações
  // (redesign-crm-astryx — RD-01/RD-02/RD-07). Todas nullable e aditivas: o
  // shell degrada graciosamente quando faltam (spec.md — Edge Cases) e a
  // Fase 9 troca a fonte, não as colunas (AD-004).
  city: text("city"),
  state: text("state"), // UF (2 chars por convenção do seed; sem constraint)
  agentWhatsapp: text("agent_whatsapp"),
  website: text("website"),
  agentPresentationMessage: text("agent_presentation_message"),
  // Horário comercial configurável pela imobiliária (lote-6 — CONF-05),
  // consumido pelo agente via GET /api/v1/settings (INT-09). Nullable/
  // aditivo (AD-004): tenants sem configuração respondem null nesses 3
  // campos e o fluxo aplica o fallback seg-sex 9h-18h (design.md). Dias em
  // ISO 1(segunda)-7(domingo); horas em texto "HH:MM" (sem timezone — o
  // fluxo interpreta em America/Sao_Paulo).
  meetingDays: integer("meeting_days").array(),
  meetingHoursStart: text("meeting_hours_start"),
  meetingHoursEnd: text("meeting_hours_end"),
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

export const leads = pgTable(
  "leads",
  {
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
    // Contrato de integração (lote-5 — INT-02/04, LGPD-01). Todas nullable/
    // aditivas (AD-004): leads do seed antigo nunca tiveram um `externalId`,
    // nunca sofreram opt-out, nunca tiveram status alterado por nenhum ator.
    externalId: text("external_id"), // id do lead no mundo do agente (ex.: wa_id)
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
    statusChangedBy: statusActorEnum("status_changed_by"),
  },
  (table) => [
    // Idempotência de entrega (INT-02.2) escopada por tenant: dois tenants
    // podem receber o mesmo externalId (ex.: mesmo wa_id em duas
    // imobiliárias distintas). Parcial (WHERE NOT NULL) para não afetar as
    // linhas do seed antigo, que nunca têm externalId.
    uniqueIndex("leads_tenant_id_external_id_idx")
      .on(table.tenantId, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ]
);

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

export const messages = pgTable(
  "messages",
  {
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
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Contrato de integração (lote-5 — INT-05): id da mensagem no WhatsApp,
    // usado para deduplicar reentregas. Nullable/aditiva — mensagens do seed
    // antigo nunca têm externalId.
    externalId: text("external_id"),
  },
  (table) => [
    // Idempotência de ingestão (INT-05.2), escopada por tenant, parcial
    // (WHERE NOT NULL) pela mesma razão de leads_tenant_id_external_id_idx.
    uniqueIndex("messages_tenant_id_external_id_idx")
      .on(table.tenantId, table.externalId)
      .where(sql`${table.externalId} is not null`),
  ]
);

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

// Contrato de integração (lote-5 — INT-01): 1+ chave por tenant, valor em
// claro nunca persistido (só o hash sha256 — design.md, Tech Decisions).
// `revokedAt` permite revogar uma chave por tenant sem apagar o histórico.
export const tenantApiKeys = pgTable("tenant_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  label: text("label").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
