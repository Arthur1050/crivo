import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { conversations, leadAgentState, leads, messages } from "../../db/schema";
import { getLeadMessages, ingestAgentMessage, MessageChannelNotLinked, type Message } from "../data";
import type { MessageCreateDto } from "./parsers";

interface AnchorProjection { anchorMessageId: string | null; agentStateRevision: number | null }
export type IngestMessageResult =
  | ({ ok: true; created: boolean; message: Message } & AnchorProjection)
  | { ok: false; code: "recurso-nao-encontrado" | "canal-nao-vinculado" };

/**
 * Ingestão idempotente de mensagens do agente (design.md —
 * `src/server/integration/messages.ts`, INT-05). Camada de serviço fina
 * sobre a DAL (mesmo padrão de `deliverLead` em `leads.ts`): a regra em si
 * (transação garantindo conversa + `onConflictDoNothing` por externalId) já
 * vive inteira em `ingestAgentMessage` — este módulo só traduz "lead não
 * encontrado no tenant" para o código de problema da rota.
 */
export async function ingestMessage(
  tenantId: string,
  leadId: string,
  dto: MessageCreateDto,
  options: { now?: () => Date; database?: Pick<typeof db, "transaction"> } = {},
): Promise<IngestMessageResult> {
  try {
    const result = await ingestAgentMessage(tenantId, leadId, {
      externalId: dto.externalId,
      sender: dto.sender,
      content: dto.content,
      sentAt: dto.sentAt,
      whatsappPhoneNumberId: dto.whatsappPhoneNumberId,
    }, { ...options, requireLinkedChannel: true });

    if (!result) return { ok: false, code: "recurso-nao-encontrado" };
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof MessageChannelNotLinked) return { ok: false, code: "canal-nao-vinculado" };
    throw error;
  }
}

/** Representação de uma mensagem na API de integração (mesmo estilo de
 * `SerializedLead` em `leads.ts`): datas em ISO-8601, `externalId` sempre
 * presente (pode ser `null` em mensagens antigas do seed, sem externalId). */
export interface SerializedMessage {
  id: string;
  externalId: string | null;
  sender: Message["sender"];
  content: string;
  sentAt: string;
  /** Nome de quem escreveu, só para `sender: humano` (lote-14); senão `null`. */
  authorName: string | null;
  whatsappPhoneNumberId: string | null;
}

export function serializeMessage(message: Message): SerializedMessage {
  return {
    id: message.id,
    externalId: message.externalId,
    sender: message.sender,
    content: message.content,
    sentAt: message.sentAt.toISOString(),
    authorName: message.authorName ?? null,
    whatsappPhoneNumberId: message.whatsappPhoneNumberId ?? null,
  };
}

export type ListMessagesResult =
  | ({ ok: true; messages: Message[] } & AnchorProjection)
  | { ok: false; code: "recurso-nao-encontrado" };

/**
 * Leitura do histórico de mensagens de um lead (design.md — § Contrato,
 * CTX-02). Serviço fino sobre a DAL: `getLeadMessages` já devolve `null`
 * para lead inexistente/de outro tenant (mesma semântica de `getLead`),
 * este módulo só traduz isso para o código de problema da rota.
 */
export async function listMessages(
  tenantId: string,
  leadId: string,
  limit: number,
  options: { database?: Pick<typeof db, "transaction"> } = {},
): Promise<ListMessagesResult> {
  return (options.database ?? db).transaction(async (tx): Promise<ListMessagesResult> => {
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.tenantId, tenantId), eq(leads.id, leadId))).for("update");
    if (!lead) return { ok: false, code: "recurso-nao-encontrado" };
    const result = await getLeadMessages(tenantId, leadId, limit, tx);
    const [anchor] = await tx.select({ id: messages.id }).from(messages)
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.tenantId, messages.tenantId)))
      .where(and(eq(messages.tenantId, tenantId), eq(conversations.leadId, leadId), eq(messages.sender, "lead")))
      .orderBy(desc(messages.sentAt), desc(messages.id)).limit(1);
    const [agent] = await tx.select({ revision: leadAgentState.revision }).from(leadAgentState)
      .where(and(eq(leadAgentState.tenantId, tenantId), eq(leadAgentState.leadId, leadId)));
    return { ok: true, messages: result!, anchorMessageId: anchor?.id ?? null, agentStateRevision: agent?.revision ?? null };
  });
}
