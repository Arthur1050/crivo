import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  brokers,
  conversations,
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
export type LeadStatus = Lead["status"];

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

export async function getDocuments(tenantId: string): Promise<Document[]> {
  return db.select().from(documents).where(eq(documents.tenantId, tenantId));
}
