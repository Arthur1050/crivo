import "server-only";
import { ingestAgentMessage, type Message } from "../data";
import type { MessageCreateDto } from "./parsers";

export type IngestMessageResult =
  | { ok: true; created: boolean; message: Message }
  | { ok: false; code: "recurso-nao-encontrado" };

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
  dto: MessageCreateDto
): Promise<IngestMessageResult> {
  const result = await ingestAgentMessage(tenantId, leadId, {
    externalId: dto.externalId,
    sender: dto.sender,
    content: dto.content,
    sentAt: dto.sentAt,
  });

  if (!result) return { ok: false, code: "recurso-nao-encontrado" };
  return { ok: true, created: result.created, message: result.message };
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
}

export function serializeMessage(message: Message): SerializedMessage {
  return {
    id: message.id,
    externalId: message.externalId,
    sender: message.sender,
    content: message.content,
    sentAt: message.sentAt.toISOString(),
  };
}
