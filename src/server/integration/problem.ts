/**
 * Fábrica de respostas `application/problem+json` (RFC 9457) para toda a API
 * de integração `/api/v1` (design.md — `src/server/integration/problem.ts`).
 * `code` é o identificador estável da regra violada (design.md — Error
 * Handling Strategy); `type` é apenas um URN determinístico por código —
 * não aponta para nenhuma página real, o contrato usa `code` como chave.
 */

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
  | "tenant-nao-identificado";

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
 */
export function methodNotAllowed(allowed: string[]): () => Response {
  return () => {
    const response = problem(
      405,
      "metodo-nao-suportado",
      `Método não suportado nesta rota. Métodos permitidos: ${allowed.join(", ")}.`
    );
    response.headers.set("Allow", allowed.join(", "));
    return response;
  };
}
