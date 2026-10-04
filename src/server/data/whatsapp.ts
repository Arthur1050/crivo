import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { conversations, leads, messages, whatsappChannels, whatsappMessageReceipts, whatsappUsage } from "../../db/schema";
import { can } from "../../lib/permissions";
import type { AuthContext } from "../auth/session";
import type { AuthResult } from "../integration/auth";
import { createAnalyticsQuery } from "../whatsapp/analytics-contract";

export type UsageView =
  | { state: "unknown-number" | "unavailable"; label: string }
  | { state: "available"; phoneLabel: string; monthLabel: string; used: number; remaining: number;
      queriedAt: string; stale: boolean; updateFailed: boolean; estimated: true };
export type MessagePricingView = { messageId: string;
  state: "paid-service" | "free-service" | "free-entry-point" | "pending" | "unavailable" | "not-delivered"; label: string };

type Channel = typeof whatsappChannels.$inferSelect;
type Period = typeof whatsappUsage.$inferSelect;
// Clock injection is internal to the DAL/tests; no request payload chooses the date.
type ReadOptions = { now?: () => Date };
const unavailable = (): UsageView => ({ state: "unavailable", label: "Consumo indisponível" });

function authorized(context: AuthContext, resource: "chats" | "configuracoes") {
  return context.tenantId === context.leadScope.tenantId && can(context.roles, resource, "ler")
    && (context.roles.some((role) => role !== "corretor") || context.leadScope.assignedUserId === context.user.id);
}
function assignedTo(context: AuthContext) {
  return context.leadScope.assignedUserId === null ? undefined : eq(leads.assignedUserId, context.leadScope.assignedUserId);
}
function project(channel: Channel, period: Period | null, now: Date): UsageView {
  if (!channel.usageEnabled || channel.accountKind !== "production" || !channel.ownershipVerifiedAt || !channel.analyticsVerifiedAt
    || !channel.accountTimezone || !channel.analyticsPhoneNumber || !channel.wabaId) return unavailable();
  const query = createAnalyticsQuery({ phoneNumberId: channel.phoneNumberId, phoneNumber: channel.analyticsPhoneNumber,
    wabaId: channel.wabaId, accountTimezone: channel.accountTimezone, now });
  if (!query || !period || period.tenantId !== channel.tenantId || period.phoneNumberId !== channel.phoneNumberId
    || period.configurationRevision !== channel.configurationRevision || period.accountTimezone !== query.accountTimezone
    || period.monthStart.getTime() !== query.monthStart.getTime() || period.monthEnd.getTime() !== query.monthEnd.getTime()
    || period.freeServiceVolume === null || !Number.isSafeInteger(period.freeServiceVolume) || period.freeServiceVolume < 0
    || !period.queryEnd || !period.lastSuccessAt || period.queryEnd > now || period.lastSuccessAt > now) return unavailable();
  return { state: "available", phoneLabel: channel.analyticsPhoneNumber,
    monthLabel: new Intl.DateTimeFormat("pt-BR", { timeZone: query.accountTimezone, month: "long", year: "numeric" }).format(query.monthStart),
    used: period.freeServiceVolume, remaining: Math.max(0, 1000 - period.freeServiceVolume), queriedAt: period.queryEnd.toISOString(),
    stale: now.getTime() - period.lastSuccessAt.getTime() > 60 * 60 * 1000,
    updateFailed: period.failureCode !== null, estimated: true };
}
async function readUsage(tenantId: string, now: Date, phoneNumberId?: string): Promise<UsageView[]> {
  // One query for every configured number, never one read per number or message.
  const rows = await db.select({ channel: whatsappChannels, period: whatsappUsage }).from(whatsappChannels)
    .leftJoin(whatsappUsage, and(eq(whatsappUsage.tenantId, whatsappChannels.tenantId), eq(whatsappUsage.phoneNumberId, whatsappChannels.phoneNumberId),
      eq(whatsappUsage.configurationRevision, whatsappChannels.configurationRevision)))
    .where(and(eq(whatsappChannels.tenantId, tenantId), phoneNumberId === undefined ? undefined : eq(whatsappChannels.phoneNumberId, phoneNumberId)))
    .orderBy(asc(whatsappChannels.phoneNumberId), asc(whatsappUsage.monthStart));
  const grouped = new Map<string, { channel: Channel; periods: Period[] }>();
  for (const row of rows) {
    const group = grouped.get(row.channel.phoneNumberId) ?? { channel: row.channel, periods: [] };
    if (row.period) group.periods.push(row.period);
    grouped.set(row.channel.phoneNumberId, group);
  }
  return [...grouped.values()].map(({ channel, periods }) => periods.map((period) => project(channel, period, now))
    .find((view) => view.state === "available") ?? unavailable());
}

export async function getSettingsUsage(context: AuthContext, options: ReadOptions = {}): Promise<UsageView[]> {
  if (!authorized(context, "configuracoes")) return [];
  return readUsage(context.tenantId, (options.now ?? (() => new Date()))());
}
/** Contexto já autenticado pelo wrapper de integração; leitura restrita ao número e tenant. */
export async function getIntegrationUsage(context: AuthResult, phoneNumberId: string, options: ReadOptions = {}): Promise<UsageView> {
  return (await readUsage(context.tenantId, (options.now ?? (() => new Date()))(), phoneNumberId))[0] ?? unavailable();
}
export async function getConversationUsage(context: AuthContext, conversationId: string, options: ReadOptions = {}): Promise<UsageView | null> {
  if (!authorized(context, "chats")) return null;
  const [conversation] = await db.select({ phoneNumberId: leads.whatsappPhoneNumberId }).from(conversations)
    .innerJoin(leads, and(eq(leads.id, conversations.leadId), eq(leads.tenantId, conversations.tenantId)))
    .where(and(eq(conversations.id, conversationId), eq(conversations.tenantId, context.tenantId), assignedTo(context))).limit(1);
  if (!conversation) return null;
  if (!conversation.phoneNumberId) return { state: "unknown-number", label: "Número da conversa não identificado" };
  return (await readUsage(context.tenantId, (options.now ?? (() => new Date()))(), conversation.phoneNumberId))[0] ?? unavailable();
}

const labels: Record<MessagePricingView["state"], string> = {
  "paid-service": "Tarifável — confirmado pela Meta", "free-service": "Gratuita — franquia de serviço",
  "free-entry-point": "Gratuita — janela de entrada gratuita", pending: "Cobrança pendente de confirmação",
  unavailable: "Classificação indisponível", "not-delivered": "Não entregue",
};
export async function getMessageClassifications(context: AuthContext, conversationId: string): Promise<MessagePricingView[]> {
  if (!authorized(context, "chats")) return [];
  const rows = await db.select({ id: messages.id, phone: messages.whatsappPhoneNumberId, wamid: messages.externalId,
    classification: whatsappMessageReceipts.classification }).from(messages)
    .innerJoin(conversations, and(eq(conversations.id, messages.conversationId), eq(conversations.tenantId, messages.tenantId)))
    .innerJoin(leads, and(eq(leads.id, conversations.leadId), eq(leads.tenantId, conversations.tenantId)))
    .leftJoin(whatsappMessageReceipts, and(eq(whatsappMessageReceipts.tenantId, messages.tenantId),
      eq(whatsappMessageReceipts.messageId, messages.id), eq(whatsappMessageReceipts.phoneNumberId, messages.whatsappPhoneNumberId),
      eq(whatsappMessageReceipts.wamid, messages.externalId)))
    .where(and(eq(messages.tenantId, context.tenantId), eq(conversations.id, conversationId), assignedTo(context), inArray(messages.sender, ["agente", "humano"])))
    .orderBy(asc(messages.sentAt), asc(messages.id));
  return rows.map((row) => {
    const state: MessagePricingView["state"] = !row.phone || !row.wamid ? "unavailable"
      : row.classification ? row.classification.replaceAll("_", "-") as MessagePricingView["state"] : "pending";
    return { messageId: row.id, state, label: labels[state] };
  });
}
