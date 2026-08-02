import "server-only";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db } from "../../db";
import {
  brokers,
  conversations,
  documentCategories,
  documents,
  leads,
  messages,
  tenants,
} from "../../db/schema";

export type Tenant = typeof tenants.$inferSelect;
export type Broker = typeof brokers.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentCategory = typeof documentCategories.$inferSelect;
export type LeadStatus = Lead["status"];
export type Modality = Document["modality"];

const ALL_MODALITIES: Modality[] = ["novo", "usado", "ambos"];

/**
 * Única função da camada de acesso que não exige tenant_id — alimenta o
 * seletor de tenant (design.md — Camada de acesso a dados).
 */
export async function getTenants(): Promise<Tenant[]> {
  return db.select().from(tenants);
}

export async function getTenant(tenantId: string): Promise<Tenant | null> {
  const rows = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getBrokers(tenantId: string): Promise<Broker[]> {
  return db.select().from(brokers).where(eq(brokers.tenantId, tenantId));
}

export async function getLeads(
  tenantId: string,
  filters?: { status?: LeadStatus }
): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        filters?.status ? eq(leads.status, filters.status) : undefined
      )
    );
}

export async function getLead(
  tenantId: string,
  leadId: string
): Promise<Lead | null> {
  const rows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getConversations(
  tenantId: string
): Promise<Conversation[]> {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.tenantId, tenantId));
}

export async function getMessages(
  tenantId: string,
  conversationId: string
): Promise<Message[]> {
  return db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.tenantId, tenantId),
        eq(messages.conversationId, conversationId)
      )
    );
}

export interface DocumentFilters {
  modality?: Modality;
  categoryId?: string;
  search?: string;
}

export async function getDocuments(
  tenantId: string,
  filters?: DocumentFilters
): Promise<Document[]> {
  return db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.tenantId, tenantId),
        filters?.modality ? eq(documents.modality, filters.modality) : undefined,
        filters?.categoryId
          ? eq(documents.categoryId, filters.categoryId)
          : undefined,
        filters?.search ? ilike(documents.name, `%${filters.search}%`) : undefined
      )
    )
    .orderBy(desc(documents.uploadedAt));
}

export async function getDocumentCategories(
  tenantId: string
): Promise<DocumentCategory[]> {
  return db
    .select()
    .from(documentCategories)
    .where(eq(documentCategories.tenantId, tenantId));
}

export interface DocumentSample {
  recent: Document[];
  countsByModality: Record<Modality, number>;
}

/**
 * Amostra usada em telas de resumo (ex.: dashboard de documentos): os 5
 * documentos mais recentes do tenant + a contagem total por modalidade
 * (todas as 3 modalidades sempre presentes, com 0 quando não há documentos).
 */
export async function getDocumentSample(
  tenantId: string
): Promise<DocumentSample> {
  const recent = await db
    .select()
    .from(documents)
    .where(eq(documents.tenantId, tenantId))
    .orderBy(desc(documents.uploadedAt))
    .limit(5);

  const counts = await db
    .select({ modality: documents.modality, count: count() })
    .from(documents)
    .where(eq(documents.tenantId, tenantId))
    .groupBy(documents.modality);

  const countsByModality = ALL_MODALITIES.reduce(
    (acc, modality) => {
      acc[modality] = 0;
      return acc;
    },
    {} as Record<Modality, number>
  );
  for (const row of counts) {
    countsByModality[row.modality] = Number(row.count);
  }

  return { recent, countsByModality };
}
