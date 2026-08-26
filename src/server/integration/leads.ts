import "server-only";
import {
  assignBrokerForEscalation,
  assignBrokerForMeeting,
  createAgentLead,
  getBrokerContact,
  getLead,
  serviceScope,
  updateLeadFromAgent,
  type Lead,
} from "../data";
import type { LeadCreateDto, LeadPatchDto } from "./parsers";
import type { ProblemCode } from "./problem";

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

type LeadStatusValue = Lead["status"];

/**
 * Máquina de estados do pipeline pelo contrato do agente (design.md —
 * "Regras de negócio de leads do agente", INT-04): só avanço, nunca
 * regressão nem saída de `escalado_humano` (destravar é ação humana no
 * Kanban — context.md). Exportada para teste par a par e citada no guia de
 * integração (T10).
 */
export const TRANSITIONS: Record<LeadStatusValue, LeadStatusValue[]> = {
  em_qualificacao: ["qualificado_agendado", "escalado_humano"],
  qualificado_agendado: [],
  escalado_humano: [],
};

/**
 * Corretor devolvido ao chamador quando a operação atribuiu um responsável
 * (ATRIB-02 AC4). Só o escolhido, nunca a lista de candidatos — e sem o id
 * interno: o agente precisa do e-mail para convidar ao evento (AC8), não da
 * chave primária do usuário.
 */
export interface AssignedBroker {
  name: string;
  email: string;
}

export type PatchLeadResult =
  | { ok: true; lead: Lead; assignedBroker?: AssignedBroker | null }
  | { ok: false; code: ProblemCode };

/**
 * Upsert parcial de qualificação + máquina de estados (INT-03/04). Ordem de
 * validação (design.md — Components): 404 (lead fora do tenant) → transição
 * (só quando `status` está no patch) → trava humana → motivo de
 * escalonamento obrigatório → uma única `UPDATE` atômica. Qualquer rejeição
 * retorna antes de tocar o banco (INT-04.5 — atomicidade: nenhum campo do
 * payload é gravado se a request inteira for rejeitada).
 *
 * lote-8: a validação acima ficou **inalterada** — a trava humana continua
 * recusando com o mesmo `lead-travado-por-humano`, antes de qualquer
 * atribuição. Depois dela, e só depois, o patch escolhe o caminho de escrita:
 * agendamento (atribui por janela de trabalho), escalonamento (rede de
 * segurança) ou a `UPDATE` simples de sempre.
 */
export async function patchLead(
  tenantId: string,
  leadId: string,
  dto: LeadPatchDto
): Promise<PatchLeadResult> {
  // Caminho do contrato (SEC-01): credencial de serviço, imobiliária
  // inteira — o agente não é usuário e não tem carteira.
  const lead = await getLead(serviceScope(tenantId), leadId);
  if (!lead) return { ok: false, code: "recurso-nao-encontrado" };

  if (dto.status !== undefined) {
    const allowedTargets = TRANSITIONS[lead.status];
    if (!allowedTargets.includes(dto.status)) {
      return { ok: false, code: "transicao-invalida" };
    }

    // Trava humana (INT-04.4): checada DEPOIS da transição ser válida na
    // tabela — uma transição já inválida por si (ex.: sair de
    // escalado_humano) reporta 'transicao-invalida', nunca
    // 'lead-travado-por-humano', mesmo que o lead também esteja travado.
    if (lead.statusChangedBy === "humano") {
      return { ok: false, code: "lead-travado-por-humano" };
    }

    if (dto.status === "escalado_humano" && !dto.escalationReason?.trim()) {
      return { ok: false, code: "motivo-escalonamento-obrigatorio" };
    }
  }

  // Agendamento (lote-8 — ATRIB-02; AD-022): registrar a reunião é o momento
  // em que o lead ganha responsável. A escolha é do CRM, server-side — o
  // chamador informa o horário e recebe de volta quem ficou.
  if (dto.meetingAt) {
    const assigned = await assignBrokerForMeeting(
      tenantId,
      leadId,
      dto.meetingAt,
      dto
    );

    if (!assigned.ok) {
      switch (assigned.reason) {
        case "sem-corretor-disponivel":
          // AC5: nada é gravado — nem a reunião, nem o resto do patch.
          return { ok: false, code: "sem-corretor-disponivel" };
        case "conflito-de-agenda":
          return { ok: false, code: "conflito-de-agenda" };
        default:
          return { ok: false, code: "recurso-nao-encontrado" };
      }
    }

    return {
      ok: true,
      lead: assigned.lead,
      assignedBroker: assigned.brokerId
        ? await getBrokerContact(tenantId, assigned.brokerId)
        : null,
    };
  }

  // Rede de segurança do escalonamento (lote-8 — ATRIB-03 AC1): o responsável
  // é gravado na MESMA operação que grava o status. Lead que já tem
  // responsável não é reatribuído (AC5), e imobiliária sem corretor ativo
  // registra o escalonamento assim mesmo (AC4).
  if (dto.status === "escalado_humano") {
    const assigned = await assignBrokerForEscalation(
      tenantId,
      leadId,
      new Date(),
      dto
    );

    if (!assigned.ok) return { ok: false, code: "recurso-nao-encontrado" };

    return {
      ok: true,
      lead: assigned.lead,
      assignedBroker: assigned.brokerId
        ? await getBrokerContact(tenantId, assigned.brokerId)
        : null,
    };
  }

  const updated = await updateLeadFromAgent(tenantId, leadId, dto);
  if (!updated) {
    // Corrida rara: o lead foi removido entre o SELECT acima e o UPDATE.
    return { ok: false, code: "recurso-nao-encontrado" };
  }

  return { ok: true, lead: updated };
}
