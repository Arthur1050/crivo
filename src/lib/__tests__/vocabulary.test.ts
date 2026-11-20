import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  agentPhaseEnum, documentStatusEnum, humanSendStateEnum, leadStatusEnum, senderEnum, statusActorEnum, tenants,
} from "../../db/schema";
import { TITLES, type ProblemCode } from "../../server/integration/problem";
import { ROLES } from "../../kit/access";
import {
  AGENT_PHASE, DOCUMENT_STATUS, HUMAN_SEND_STATE, INTEGRATION_HEALTH, LEAD_STATUS, PROBLEM_CODE, ROLE, SENDER, STATUS_ACTOR,
  type AgentPhase, type LeadStatus, type Role,
} from "../vocabulary";

// O catálogo de códigos é puro; a instrumentação da rota não participa dele.
vi.mock("../../server/integration/route", () => ({
  INSTRUMENTED: Symbol("instrumented"),
  recordRefusalFor: vi.fn(),
}));

describe("vocabulário do núcleo (VOCAB-01)", () => {
  it.each([
    [LEAD_STATUS, { engaged: "em_qualificacao", goal_reached: "qualificado_agendado", escalated: "escalado_humano" }],
    [ROLE, { admin: "administrador", manager: "gestor", attendant: "corretor" }],
    [AGENT_PHASE, { qualifying: "qualificando", closing: "agendando", ended: "encerrada" }],
    [SENDER, { agent: "agente", lead: "lead", human: "humano" }],
    [STATUS_ACTOR, { human: "humano", agent: "agente" }],
    [INTEGRATION_HEALTH, { healthy: "saudavel", problem: "problema" }],
    [DOCUMENT_STATUS, { processing: "processando", ready: "pronto", failed: "falha", outside_agent: "fora_do_agente" }],
    [HUMAN_SEND_STATE, { sending: "enviando", sent: "enviada", failed: "falhou" }],
    [PROBLEM_CODE, {
      unauthenticated: "nao-autenticado", not_found: "recurso-nao-encontrado", invalid_payload: "payload-invalido",
      invalid_transition: "transicao-invalida", lead_locked_by_human: "lead-travado-por-humano",
      escalation_reason_required: "motivo-escalonamento-obrigatorio", body_too_large: "corpo-grande-demais",
      route_not_found: "rota-inexistente", method_not_allowed: "metodo-nao-suportado", tenant_not_identified: "tenant-nao-identificado",
      no_assignee_available: "sem-corretor-disponivel", appointment_conflict: "conflito-de-agenda",
      lead_under_human_control: "lead-conduzido-por-humano", channel_not_linked: "canal-nao-vinculado",
      context_changed: "contexto-alterado", episode_preparing: "episodio-em-preparacao", claim_expired: "claim-expirada",
      episode_consumed: "episodio-consumido", unknown_agent_state: "estado-agente-desconhecido", service_unavailable: "servico-indisponivel",
    }],
  ])("preserva cada par de chave e valor: %j", (actual, expected) => {
    expect(actual).toEqual(expected);
  });

  it.each([
    [LEAD_STATUS, leadStatusEnum.enumValues], [ROLE, ROLES], [AGENT_PHASE, agentPhaseEnum.enumValues],
    [SENDER, senderEnum.enumValues], [STATUS_ACTOR, statusActorEnum.enumValues],
    [INTEGRATION_HEALTH, tenants.integrationHealthState.enumValues],
    [DOCUMENT_STATUS, documentStatusEnum.enumValues], [HUMAN_SEND_STATE, humanSendStateEnum.enumValues],
  ])("mantém o conjunto e a ordem do schema ou da matriz de papéis: %j", (actual, values) => {
    expect(Object.values(actual)).toEqual(values);
  });

  it("cobre todos os códigos de problema e deriva os tipos dos valores", () => {
    expect(Object.values(PROBLEM_CODE)).toEqual(Object.keys(TITLES));
    expectTypeOf<(typeof PROBLEM_CODE)[keyof typeof PROBLEM_CODE]>().toEqualTypeOf<ProblemCode>();
    expectTypeOf<LeadStatus>().toEqualTypeOf<(typeof LEAD_STATUS)[keyof typeof LEAD_STATUS]>();
    expectTypeOf<Role>().toEqualTypeOf<(typeof ROLE)[keyof typeof ROLE]>();
    expectTypeOf<AgentPhase>().toEqualTypeOf<(typeof AGENT_PHASE)[keyof typeof AGENT_PHASE]>();
  });
});
