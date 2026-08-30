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
  | "nao-autenticado"
  | "recurso-nao-encontrado"
  | "payload-invalido"
  | "transicao-invalida"
  | "lead-travado-por-humano"
  | "motivo-escalonamento-obrigatorio"
  | "corpo-grande-demais"
  | "rota-inexistente"
  | "metodo-nao-suportado"
  // lote-7 — SEC-01: chave de serviço válida sem `X-Crivo-Tenant`, ou com
  // slug desconhecido — nunca cai em nenhum tenant default (auth.ts).
  | "tenant-nao-identificado"
  // lote-8 — ATRIB-02: nenhum corretor ativo tem janela de trabalho cobrindo
  // o horário pedido (AC5). Código próprio para o agente distinguir "esse
  // horário não dá" de qualquer outra recusa e oferecer outro ao lead.
  | "sem-corretor-disponivel"
  // lote-8 — ATRIB-02 AC7: dois agendamentos disputaram o mesmo corretor no
  // mesmo intervalo; o índice único do banco confirmou só um.
  | "conflito-de-agenda";

const TITLES: Record<ProblemCode, string> = {
  "nao-autenticado": "Não autenticado",
  "recurso-nao-encontrado": "Recurso não encontrado",
  "payload-invalido": "Payload inválido",
  "transicao-invalida": "Transição de status inválida",
  "lead-travado-por-humano": "Lead travado por ação humana",
  "motivo-escalonamento-obrigatorio": "Motivo de escalonamento obrigatório",
  "corpo-grande-demais": "Corpo da requisição excede o tamanho máximo",
  "rota-inexistente": "Rota inexistente",
  "metodo-nao-suportado": "Método não suportado",
  "tenant-nao-identificado": "Tenant não identificado",
  "sem-corretor-disponivel": "Nenhum corretor disponível no horário",
  "conflito-de-agenda": "Conflito de agenda",
};

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/**
 * Monta uma `Response` `application/problem+json` com `type`, `title`,
 * `status`, `detail` (opcional) e a extensão `code` (design.md — Components).
 */
export function problem(
  status: number,
  code: ProblemCode,
  detail?: string
): Response {
  const body = {
    type: `urn:crivo:problem:${code}`,
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
export function methodNotAllowed(
  allowed: string[]
): ((request?: Request) => Response) & { [INSTRUMENTED]: true } {
  const handler = (request?: Request): Response => {
    const response = problem(
      405,
      "metodo-nao-suportado",
      `Método não suportado nesta rota. Métodos permitidos: ${allowed.join(", ")}.`
    );
    response.headers.set("Allow", allowed.join(", "));
    void recordRefusalFor(request, response, null);
    return response;
  };

  return Object.assign(handler, { [INSTRUMENTED]: true as const });
}
