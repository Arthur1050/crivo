import "server-only";
import { createAgentLead, type Lead } from "../data";
import type { LeadCreateDto } from "./parsers";

export interface DeliverLeadResult {
  created: boolean;
  lead: Lead;
}

/**
 * Entrega idempotente de um lead vindo do agente (design.md —
 * `src/server/integration/leads.ts`, INT-02). Camada de serviço fina sobre a
 * DAL: mantém o handler desacoplado de detalhes de persistência
 * (Architecture Overview — handler → serviço → DAL), mesmo quando a regra em
 * si (idempotência por `externalId`) já vive inteira na DAL.
 */
export async function deliverLead(
  tenantId: string,
  dto: LeadCreateDto
): Promise<DeliverLeadResult> {
  return createAgentLead(tenantId, {
    name: dto.name,
    phone: dto.phone,
    externalId: dto.externalId,
    firstContactAt: dto.firstContactAt,
  });
}

/** Representação de um lead na API de integração (design.md — Route
 * handlers: "Serialização"). `budgetCents` vira string (bigint não é
 * JSON-safe); datas viram ISO-8601; `optedOutAt`/`externalId` sempre
 * presentes (LGPD-01 AC3). */
export interface SerializedLead {
  id: string;
  externalId: string | null;
  name: string;
  phone: string;
  status: Lead["status"];
  modality: Lead["modality"];
  region: string | null;
  budgetCents: string | null;
  propertyType: Lead["propertyType"];
  purchaseHorizon: string | null;
  motivation: Lead["motivation"];
  creditStatus: Lead["creditStatus"];
  chainedOperation: boolean | null;
  executiveSummary: string | null;
  escalationReason: string | null;
  meetingAt: string | null;
  firstContactAt: string;
  optedOutAt: string | null;
}

export function serializeLead(lead: Lead): SerializedLead {
  return {
    id: lead.id,
    externalId: lead.externalId,
    name: lead.name,
    phone: lead.phone,
    status: lead.status,
    modality: lead.modality,
    region: lead.region,
    budgetCents: lead.budgetCents === null ? null : lead.budgetCents.toString(),
    propertyType: lead.propertyType,
    purchaseHorizon: lead.purchaseHorizon,
    motivation: lead.motivation,
    creditStatus: lead.creditStatus,
    chainedOperation: lead.chainedOperation,
    executiveSummary: lead.executiveSummary,
    escalationReason: lead.escalationReason,
    meetingAt: lead.meetingAt ? lead.meetingAt.toISOString() : null,
    firstContactAt: lead.firstContactAt.toISOString(),
    optedOutAt: lead.optedOutAt ? lead.optedOutAt.toISOString() : null,
  };
}
