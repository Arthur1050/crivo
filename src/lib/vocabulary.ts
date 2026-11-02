// Chaves futuras em inglês; valores persistidos e do fio preservados até o L18c.
export const LEAD_STATUS = {
  engaged: "em_qualificacao",
  goal_reached: "qualificado_agendado",
  escalated: "escalado_humano",
} as const;
export const ROLE = { admin: "administrador", manager: "gestor", attendant: "corretor" } as const;
export const AGENT_PHASE = { qualifying: "qualificando", closing: "agendando", ended: "encerrada" } as const;
export const SENDER = { agent: "agente", lead: "lead", human: "humano" } as const;
export const STATUS_ACTOR = { human: "humano", agent: "agente" } as const;
export const INTEGRATION_HEALTH = { healthy: "saudavel", problem: "problema" } as const;
export const DOCUMENT_STATUS = { processing: "processando", ready: "pronto", failed: "falha", outside_agent: "fora_do_agente" } as const;
export const HUMAN_SEND_STATE = { sending: "enviando", sent: "enviada", failed: "falhou" } as const;
export const PROBLEM_CODE = {
  unauthenticated: "nao-autenticado",
  not_found: "recurso-nao-encontrado",
  invalid_payload: "payload-invalido",
  invalid_transition: "transicao-invalida",
  lead_locked_by_human: "lead-travado-por-humano",
  escalation_reason_required: "motivo-escalonamento-obrigatorio",
  body_too_large: "corpo-grande-demais",
  route_not_found: "rota-inexistente",
  method_not_allowed: "metodo-nao-suportado",
  tenant_not_identified: "tenant-nao-identificado",
  no_assignee_available: "sem-corretor-disponivel",
  appointment_conflict: "conflito-de-agenda",
  lead_under_human_control: "lead-conduzido-por-humano",
  channel_not_linked: "canal-nao-vinculado",
  context_changed: "contexto-alterado",
  episode_preparing: "episodio-em-preparacao",
  claim_expired: "claim-expirada",
  episode_consumed: "episodio-consumido",
  unknown_agent_state: "estado-agente-desconhecido",
  service_unavailable: "servico-indisponivel",
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];
export type Role = (typeof ROLE)[keyof typeof ROLE];
export type AgentPhase = (typeof AGENT_PHASE)[keyof typeof AGENT_PHASE];
