import "server-only";
import { getTenant, type Modality } from "../data";

/**
 * Representação de settings do tenant na API de integração (design.md —
 * INT-09): persona + modalidade + horário comercial (CONF-05). `null` nos 3
 * campos de horário comercial quando o tenant não configurou — o fluxo do
 * agente aplica o fallback seg-sex 9h-18h (`resolveBusinessHours`, T7).
 */
export interface TenantSettings {
  realEstateName: string;
  agentName: string;
  supportedModality: Modality;
  agentPresentationMessage: string | null;
  meetingDays: number[] | null;
  meetingHoursStart: string | null;
  meetingHoursEnd: string | null;
}

/**
 * Leitura de settings do tenant da chave (design.md —
 * `src/server/integration/settings.ts`, INT-09). Serviço fino sobre a DAL:
 * `null` quando o tenant não existe — defensivo/inalcançável em uso normal
 * do contrato (`authenticate` só resolve chaves de tenants existentes via
 * FK), mapeado para 404 pelo handler, mesmo padrão de `getLead`/`patchLead`.
 */
export async function getTenantSettings(
  tenantId: string
): Promise<TenantSettings | null> {
  const tenant = await getTenant(tenantId);
  if (!tenant) return null;

  return {
    realEstateName: tenant.name,
    agentName: tenant.agentName,
    supportedModality: tenant.supportedModality,
    agentPresentationMessage: tenant.agentPresentationMessage,
    meetingDays: tenant.meetingDays,
    meetingHoursStart: tenant.meetingHoursStart,
    meetingHoursEnd: tenant.meetingHoursEnd,
  };
}
