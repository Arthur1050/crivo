import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { whatsappChannels } from "../../db/schema";
import type { AuthResult } from "../integration/auth";

type UsageCapability =
  | { enabled: false; reason: "account-not-production" | "waba-unverified" | "timezone-unverified" | "analytics-unverified" | "usage-disabled" }
  | { enabled: true; wabaId: string; analyticsPhoneNumber: string; accountTimezone: string };

export type ChannelResolution =
  | { ok: false; reason: "unknown-channel" | "ownership-unverified" | "configuration-changed" | "credential-missing" }
  | {
      ok: true;
      channel: { id: string; tenantId: string; phoneNumberId: string; configurationRevision: number };
      usage: UsageCapability;
    };

function ianaTimezone(value: string | null): string | null {
  if (!value || (value !== "UTC" && !value.includes("/"))) return null;
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * Contexto vem de authenticate/verifySession, nunca do tenant_id do payload.
 * Retorno é configuração INTERNA servidor; T14 projeta DTOs sem WABA.
 * Não retorna credencial: transportes a leem diretamente no processo servidor.
 * A indisponibilidade de Analytics não impede resolver a identidade do canal.
 */
export async function resolveChannel(
  context: AuthResult,
  input: { phoneNumberId: string | null; expectedRevision?: number },
): Promise<ChannelResolution> {
  const phoneNumberId = input.phoneNumberId?.trim();
  if (!phoneNumberId) return { ok: false, reason: "unknown-channel" };
  const [row] = await db.select().from(whatsappChannels).where(and(
    eq(whatsappChannels.tenantId, context.tenantId),
    eq(whatsappChannels.phoneNumberId, phoneNumberId),
  )).limit(1);
  if (!row) return { ok: false, reason: "unknown-channel" };
  if (input.expectedRevision !== undefined && input.expectedRevision !== row.configurationRevision) {
    return { ok: false, reason: "configuration-changed" };
  }
  if (!row.ownershipVerifiedAt) return { ok: false, reason: "ownership-unverified" };
  if (!process.env.WHATSAPP_ACCESS_TOKEN?.trim()) return { ok: false, reason: "credential-missing" };

  const wabaId = row.wabaId?.trim();
  const analyticsPhoneNumber = row.analyticsPhoneNumber?.trim();
  const accountTimezone = ianaTimezone(row.accountTimezone);
  let usage: UsageCapability;
  if (row.accountKind !== "production") usage = { enabled: false, reason: "account-not-production" };
  else if (!wabaId) usage = { enabled: false, reason: "waba-unverified" };
  else if (!accountTimezone) usage = { enabled: false, reason: "timezone-unverified" };
  else if (!row.analyticsVerifiedAt || !analyticsPhoneNumber) usage = { enabled: false, reason: "analytics-unverified" };
  else if (!row.usageEnabled) usage = { enabled: false, reason: "usage-disabled" };
  else usage = { enabled: true, wabaId, analyticsPhoneNumber, accountTimezone };

  return {
    ok: true,
    channel: { id: row.id, tenantId: row.tenantId, phoneNumberId: row.phoneNumberId, configurationRevision: row.configurationRevision },
    usage,
  };
}
