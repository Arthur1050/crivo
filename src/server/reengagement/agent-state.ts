import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { FIELD_LABELS } from "../../../n8n/src/phase.mjs";
import { db } from "../../db";
import { conversations, leadAgentState, leads, messages } from "../../db/schema";
import type { AuthResult } from "../integration/auth";

export interface PublishAgentStateInput {
  anchorMessageId: string;
  resetObservedAt: Date | null;
  expectedRevision: number;
  phase: "qualificando" | "agendando" | "encerrada" | null;
  askedFields: string[];
  openingHistory: string[];
}
type AgentState = typeof leadAgentState.$inferSelect;
type StateRefusal = "invalid-state" | "lead-not-found" | "context-changed" | "revision-conflict" | "phase-closed";
export type PublishAgentStateResult = { ok: true; replay: boolean; state: AgentState } | { ok: false; reason: StateRefusal };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function valid(input: PublishAgentStateInput): boolean {
  return typeof input.anchorMessageId === "string" && UUID.test(input.anchorMessageId)
    && Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0
    && (input.resetObservedAt === null || (input.resetObservedAt instanceof Date && Number.isFinite(input.resetObservedAt.getTime())))
    && (input.phase === null || ["qualificando", "agendando", "encerrada"].includes(input.phase))
    && Array.isArray(input.askedFields) && input.askedFields.length <= 8 && input.askedFields.every((field) => typeof field === "string" && Object.hasOwn(FIELD_LABELS, field))
    && Array.isArray(input.openingHistory) && input.openingHistory.every((opening) => typeof opening === "string");
}
function sameTime(a: Date | null, b: Date | null) { return a?.getTime() === b?.getTime(); }
function identical(state: AgentState, input: PublishAgentStateInput) {
  return state.anchorMessageId === input.anchorMessageId && sameTime(state.resetObservedAt, input.resetObservedAt)
    && state.phase === input.phase && JSON.stringify(state.askedFields) === JSON.stringify(input.askedFields)
    && JSON.stringify(state.openingHistory) === JSON.stringify(input.openingHistory);
}

/**
 * Contexto autorizado vem da integração. Lead é o primeiro lock; a FK do
 * tenant não substitui verificar que a âncora é o inbound corrente dessa lead.
 * Replay exige âncora/reset vivos e input idêntico, sem atualizar o timestamp.
 * Primeira publicação expectedRevision0 cria revision1. Invalidação integrada
 * pelo inbound será T27; aqui nenhuma janela/pipeline/mensagem é alterada.
 */
export async function publishAgentState(
  context: AuthResult,
  leadId: string,
  input: PublishAgentStateInput,
  options: { now?: () => Date; database?: Pick<typeof db, "transaction"> } = {},
): Promise<PublishAgentStateResult> {
  if (!valid(input)) return { ok: false, reason: "invalid-state" };
  return (options.database ?? db).transaction(async (tx): Promise<PublishAgentStateResult> => {
    const [lead] = await tx.select().from(leads).where(and(eq(leads.tenantId, context.tenantId), eq(leads.id, leadId))).for("update");
    if (!lead) return { ok: false, reason: "lead-not-found" };
    const [anchor] = await tx.select({ id: messages.id }).from(messages)
      .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.tenantId, messages.tenantId)))
      .where(and(eq(messages.tenantId, context.tenantId), eq(conversations.leadId, leadId), eq(messages.sender, "lead")))
      .orderBy(desc(messages.sentAt), desc(messages.id)).limit(1);
    if (anchor?.id !== input.anchorMessageId || !sameTime(lead.memoryResetRequestedAt, input.resetObservedAt)) {
      return { ok: false, reason: "context-changed" };
    }
    const [previous] = await tx.select().from(leadAgentState).where(and(eq(leadAgentState.tenantId, context.tenantId), eq(leadAgentState.leadId, leadId)));
    if (previous && identical(previous, input) && [previous.revision, previous.revision - 1].includes(input.expectedRevision)) {
      return { ok: true, replay: true, state: previous };
    }
    if (input.expectedRevision !== (previous?.revision ?? 0)) return { ok: false, reason: "revision-conflict" };
    if (previous?.phase === "encerrada" && previous.anchorMessageId === input.anchorMessageId
        && sameTime(previous.resetObservedAt, input.resetObservedAt) && input.phase !== "encerrada") {
      return { ok: false, reason: "phase-closed" };
    }
    const values = { tenantId: context.tenantId, leadId, anchorMessageId: input.anchorMessageId,
      phase: input.phase, askedFields: input.askedFields, openingHistory: input.openingHistory,
      resetObservedAt: input.resetObservedAt, revision: (previous?.revision ?? 0) + 1, updatedAt: (options.now ?? (() => new Date()))() };
    const [state] = previous
      ? await tx.update(leadAgentState).set(values).where(and(eq(leadAgentState.tenantId, context.tenantId), eq(leadAgentState.leadId, leadId))).returning()
      : await tx.insert(leadAgentState).values(values).returning();
    return { ok: true, replay: false, state };
  });
}
