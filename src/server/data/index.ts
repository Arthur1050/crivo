import "server-only";
import { and, asc, count, desc, eq, ilike } from "drizzle-orm";
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
  return db.select().from(tenants).orderBy(asc(tenants.createdAt), asc(tenants.id));
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
    )
    // Determinístico (lote-3 — lesson do Verifier L2, mesmo gap de
    // getTenants): mais recentemente atualizado primeiro, id como desempate.
    .orderBy(desc(leads.updatedAt), asc(leads.id));
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
    )
    // Determinístico (lote-3 — thread lida em ordem cronológica): mais antiga
    // primeiro, id como desempate.
    .orderBy(asc(messages.sentAt), asc(messages.id));
}

export interface ConversationSummaryLastMessage {
  content: string;
  sentAt: Date;
  sender: Message["sender"];
}

export interface ConversationSummary {
  id: string;
  leadId: string;
  leadName: string;
  lastMessage: ConversationSummaryLastMessage | null;
}

/**
 * Lista de conversas do tenant para a tela de Chats (lote-3 — CHAT-01):
 * junta o nome do lead e a última mensagem de cada conversa. Conversas sem
 * nenhuma mensagem entram com `lastMessage: null` e ficam por último na
 * ordenação. Desempate determinístico por `conversations.createdAt DESC, id`
 * (design.md — Data Models), aplicado tanto entre conversas com mensagem
 * (sentAt empatado) quanto entre conversas sem mensagem.
 */
export async function getConversationSummaries(
  tenantId: string
): Promise<ConversationSummary[]> {
  const [conversationRows, leadRows, messageRows] = await Promise.all([
    db.select().from(conversations).where(eq(conversations.tenantId, tenantId)),
    db
      .select({ id: leads.id, name: leads.name })
      .from(leads)
      .where(eq(leads.tenantId, tenantId)),
    // Ordenada ASC por sentAt/id: a última iteração do loop abaixo sobrescreve
    // o Map com a mensagem mais recente de cada conversa.
    db
      .select()
      .from(messages)
      .where(eq(messages.tenantId, tenantId))
      .orderBy(asc(messages.sentAt), asc(messages.id)),
  ]);

  const leadNameById = new Map(leadRows.map((lead) => [lead.id, lead.name]));

  const lastMessageByConversation = new Map<string, Message>();
  for (const message of messageRows) {
    lastMessageByConversation.set(message.conversationId, message);
  }

  const entries = conversationRows.map((conversation) => {
    const lastMessage = lastMessageByConversation.get(conversation.id) ?? null;
    const summary: ConversationSummary = {
      id: conversation.id,
      leadId: conversation.leadId,
      leadName: leadNameById.get(conversation.leadId) ?? "",
      lastMessage: lastMessage
        ? {
            content: lastMessage.content,
            sentAt: lastMessage.sentAt,
            sender: lastMessage.sender,
          }
        : null,
    };
    return { summary, createdAt: conversation.createdAt };
  });

  entries.sort((a, b) => {
    const aHasMessage = a.summary.lastMessage !== null;
    const bHasMessage = b.summary.lastMessage !== null;
    if (aHasMessage !== bHasMessage) return aHasMessage ? -1 : 1;

    if (aHasMessage && bHasMessage) {
      const sentAtDiff =
        b.summary.lastMessage!.sentAt.getTime() -
        a.summary.lastMessage!.sentAt.getTime();
      if (sentAtDiff !== 0) return sentAtDiff;
    }

    const createdAtDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;

    return a.summary.id < b.summary.id ? -1 : a.summary.id > b.summary.id ? 1 : 0;
  });

  return entries.map((entry) => entry.summary);
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

// --- Writes (lote-2 — CONF-01/02, DOC-01/02/04/05/06/07) ---------------
//
// Toda escrita abaixo filtra por tenantId no WHERE — nunca só pelo id do
// registro — para que um id vazado/adivinhado de outro tenant nunca seja
// afetado por engano.

const POSTGRES_UNIQUE_VIOLATION = "23505";

function pgErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  // drizzle-orm envolve o erro do driver `pg` em `DrizzleQueryError`,
  // preservando o erro original em `.cause` (que tem `.code`).
  if (record.cause !== undefined) return pgErrorCode(record.cause);
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === POSTGRES_UNIQUE_VIOLATION;
}

export async function updateTenantSettings(
  tenantId: string,
  updates: { name: string; agentName: string; supportedModality: Modality }
): Promise<Tenant | null> {
  const rows = await db
    .update(tenants)
    .set({
      name: updates.name,
      agentName: updates.agentName,
      supportedModality: updates.supportedModality,
    })
    .where(eq(tenants.id, tenantId))
    .returning();
  return rows[0] ?? null;
}

export interface CreateDocumentInput {
  name: string;
  mimeType: string;
  sizeBytes: number | bigint;
  modality: Modality;
  categoryId?: string | null;
}

export async function createDocument(
  tenantId: string,
  input: CreateDocumentInput
): Promise<Document> {
  const rows = await db
    .insert(documents)
    .values({
      tenantId,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes:
        typeof input.sizeBytes === "bigint"
          ? input.sizeBytes
          : BigInt(Math.trunc(input.sizeBytes)),
      modality: input.modality,
      categoryId: input.categoryId ?? null,
    })
    .returning();
  return rows[0];
}

export interface UpdateDocumentInput {
  name: string;
  modality: Modality;
  categoryId?: string | null;
}

/**
 * Retorna `null` quando nenhuma linha corresponde a `tenantId` + `documentId`
 * (documento inexistente OU pertencente a outro tenant) — sinal explícito de
 * "não encontrado", nunca confundido com sucesso silencioso.
 */
export async function updateDocument(
  tenantId: string,
  documentId: string,
  updates: UpdateDocumentInput
): Promise<Document | null> {
  const setValues: Partial<typeof documents.$inferInsert> = {
    name: updates.name,
    modality: updates.modality,
  };
  if ("categoryId" in updates) {
    setValues.categoryId = updates.categoryId ?? null;
  }

  const rows = await db
    .update(documents)
    .set(setValues)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)))
    .returning();
  return rows[0] ?? null;
}

/**
 * Retorna `false` (no-op) quando nenhuma linha corresponde a `tenantId` +
 * `documentId` — nunca lança erro para um id inexistente/de outro tenant.
 */
export async function deleteDocument(
  tenantId: string,
  documentId: string
): Promise<boolean> {
  const rows = await db
    .delete(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, documentId)))
    .returning({ id: documents.id });
  return rows.length > 0;
}

export type CreateDocumentCategoryResult =
  | { ok: true; category: DocumentCategory }
  | { ok: false; error: string };

/**
 * Traduz a violação do índice único (nome duplicado, case-insensitive, no
 * mesmo tenant) num erro de domínio — nunca deixa o erro bruto do Postgres
 * vazar para quem chama.
 */
export async function createDocumentCategory(
  tenantId: string,
  name: string
): Promise<CreateDocumentCategoryResult> {
  try {
    const rows = await db
      .insert(documentCategories)
      .values({ tenantId, name })
      .returning();
    return { ok: true, category: rows[0] };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: "Já existe uma categoria com esse nome para este tenant.",
      };
    }
    throw err;
  }
}

/**
 * Retorna `false` (no-op) quando nenhuma linha corresponde a `tenantId` +
 * `categoryId`. No happy path, documentos que referenciavam a categoria têm
 * `category_id` automaticamente ajustado para `null` pela FK
 * `ON DELETE SET NULL` (schema.ts).
 */
export async function deleteDocumentCategory(
  tenantId: string,
  categoryId: string
): Promise<boolean> {
  const rows = await db
    .delete(documentCategories)
    .where(
      and(
        eq(documentCategories.tenantId, tenantId),
        eq(documentCategories.id, categoryId)
      )
    )
    .returning({ id: documentCategories.id });
  return rows.length > 0;
}
