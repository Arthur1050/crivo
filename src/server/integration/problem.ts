import type { VerticalBrand } from "../../vertical-kit";
import { PROBLEM_CODE } from "../../lib/vocabulary";
/**
 * Fábrica de respostas `application/problem+json` (RFC 9457) para toda a API
 * de integração `/api/v1` (design.md — `src/server/integration/problem.ts`).
 * `code` é o identificador estável da regra violada (design.md — Error
 * Handling Strategy); `type` é apenas um URN determinístico por código —
 * não aponta para nenhuma página real, o contrato usa `code` como chave.
 */
import { INSTRUMENTED, recordRefusalFor } from "./route";
// `route.ts` também importa deste arquivo (`PROBLEM_CONTENT_TYPE`) — import
// circular inofensivo: nenhum dos dois usa o binding do outro no topo do
// módulo, só dentro de corpo de função (`methodNotAllowed()`/
// `extractProblemCode()`), quando os dois módulos já terminaram de avaliar.

export type ProblemCode =
  | typeof PROBLEM_CODE.unauthenticated
  | typeof PROBLEM_CODE.not_found
  | typeof PROBLEM_CODE.invalid_payload
  | typeof PROBLEM_CODE.invalid_transition
  | typeof PROBLEM_CODE.lead_locked_by_human
  | typeof PROBLEM_CODE.escalation_reason_required
  | typeof PROBLEM_CODE.body_too_large
  | typeof PROBLEM_CODE.route_not_found
  | typeof PROBLEM_CODE.method_not_allowed
  // lote-7 — SEC-01: chave de serviço válida sem o header de tenant, ou com
  // slug desconhecido — nunca cai em nenhum tenant default (auth.ts).
  | typeof PROBLEM_CODE.tenant_not_identified
  // lote-8 — ATRIB-02: nenhum corretor ativo tem janela de trabalho cobrindo
  // o horário pedido (AC5). Código próprio para o agente distinguir "esse
  // horário não dá" de qualquer outra recusa e oferecer outro ao lead.
  | typeof PROBLEM_CODE.no_assignee_available
  // lote-8 — ATRIB-02 AC7: dois agendamentos disputaram o mesmo corretor no
  // mesmo intervalo; o índice único do banco confirmou só um.
  | typeof PROBLEM_CODE.appointment_conflict
  // lote-14 — SILENCIO-01 AC9: o lead tem a marca de condução humana; o
  // contrato não muda `status` nem `meetingAt` enquanto um humano conduz.
  | typeof PROBLEM_CODE.lead_under_human_control
  | typeof PROBLEM_CODE.channel_not_linked
  | typeof PROBLEM_CODE.context_changed
  | typeof PROBLEM_CODE.episode_preparing
  | typeof PROBLEM_CODE.claim_expired
  | typeof PROBLEM_CODE.episode_consumed
  | typeof PROBLEM_CODE.unknown_agent_state
  | typeof PROBLEM_CODE.service_unavailable;

// Exportada para o teste de paridade com o `ProblemCode` do openapi.yaml.
export const TITLES: Record<ProblemCode, string> = {
  [PROBLEM_CODE.unauthenticated]: "Não autenticado",
  [PROBLEM_CODE.not_found]: "Recurso não encontrado",
  [PROBLEM_CODE.invalid_payload]: "Payload inválido",
  [PROBLEM_CODE.invalid_transition]: "Transição de status inválida",
  [PROBLEM_CODE.lead_locked_by_human]: "Lead travado por ação humana",
  [PROBLEM_CODE.escalation_reason_required]: "Motivo de escalonamento obrigatório",
  [PROBLEM_CODE.body_too_large]: "Corpo da requisição excede o tamanho máximo",
  [PROBLEM_CODE.route_not_found]: "Rota inexistente",
  [PROBLEM_CODE.method_not_allowed]: "Método não suportado",
  [PROBLEM_CODE.tenant_not_identified]: "Tenant não identificado",
  [PROBLEM_CODE.no_assignee_available]: "Nenhum corretor disponível no horário",
  [PROBLEM_CODE.appointment_conflict]: "Conflito de agenda",
  [PROBLEM_CODE.lead_under_human_control]: "Lead conduzido por um humano",
  [PROBLEM_CODE.channel_not_linked]: "Número não vinculado ao tenant",
  [PROBLEM_CODE.context_changed]: "Contexto da conversa alterado",
  [PROBLEM_CODE.episode_preparing]: "Episódio já em preparação",
  [PROBLEM_CODE.claim_expired]: "Prazo de preparação expirado",
  [PROBLEM_CODE.episode_consumed]: "Episódio já consumido",
  [PROBLEM_CODE.unknown_agent_state]: "Estado do agente indisponível",
  [PROBLEM_CODE.service_unavailable]: "Serviço temporariamente indisponível",
};

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/**
 * Monta uma `Response` `application/problem+json` com `type`, `title`,
 * `status`, `detail` (opcional) e a extensão `code` (design.md — Components).
 */
export function createProblemResponses(brand: VerticalBrand) {
  function problem(
    status: number,
    code: ProblemCode,
    detail?: string
  ): Response {
    const body = {
      type: `urn:${brand.problemUrn}:problem:${code}`,
      title: TITLES[code],
      status,
      ...(detail !== undefined ? { detail } : {}),
      code,
    };

    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": PROBLEM_CONTENT_TYPE },
    });
  }

  /**
   * Handler de 405 para verbos não suportados num route file de `/api/v1`
   * (design.md — Route handlers: "Verbos não suportados... exportados via
   * methodNotAllowed([...])"). O header `Allow` lista os verbos aceitos nesse
   * arquivo de rota (boa prática HTTP para 405, além do corpo problem+json).
   *
   * Instrumentado (lote-9 — SAUDE-01/T9): toda recusa de 405 é registrada com
   * `tenantId = null` (o método é recusado antes de qualquer autenticação).
   * `problem()` continua pura, sem parâmetro novo — só `methodNotAllowed()`
   * conhece `recordRefusalFor`. `request` é opcional para não quebrar os
   * testes de rota existentes que chamam o handler devolvido sem argumento
   * (`handler()`); nesse caso não há `Request` real para registrar, e
   * `recordRefusalFor` já trata essa ausência como no-op. Marcado com
   * `INSTRUMENTED` (T17): a varredura que exige instrumentação em todo export
   * de verbo HTTP de `/api/v1` não distingue "instrumentado via
   * `withIntegrationRoute`" de "instrumentado via `recordRefusalFor` direto" —
   * os dois são igualmente cobertos, só o caminho até lá muda.
   */
  function methodNotAllowed(
    allowed: string[]
  ): ((request?: Request) => Response) & { [INSTRUMENTED]: true } {
    const handler = (request?: Request): Response => {
      const response = problem(
        405,
        PROBLEM_CODE.method_not_allowed,
        `Método não suportado nesta rota. Métodos permitidos: ${allowed.join(", ")}.`
      );
      response.headers.set("Allow", allowed.join(", "));
      void recordRefusalFor(request, response, null);
      return response;
    };

    return Object.assign(handler, { [INSTRUMENTED]: true as const });
  }

    return { problem, methodNotAllowed };
}
