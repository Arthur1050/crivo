import { problem } from "../../../../src/server/integration/problem";
import { recordRefusalFor } from "../../../../src/server/integration/route";

/**
 * Catch-all de `/api/v1/**` (design.md — Route handlers; Edge Cases: "rota
 * inexistente ou método não suportado... nunca HTML"). Rotas estáticas e
 * dinâmicas específicas (ex.: `app/api/v1/leads/route.ts`) têm precedência
 * sobre este catch-all no App Router — só path realmente não mapeado chega
 * aqui, em qualquer verbo.
 *
 * Instrumentado (lote-9 — SAUDE-01/T10): registra o 404 com
 * `code = "rota-inexistente"` e a rota efetivamente chamada, `tenantId =
 * null` (nenhuma autenticação acontece antes de uma rota inexistente).
 * `request` é opcional para não quebrar o teste legado que chama
 * `unmatchedGet()` sem argumento (`leads-post.test.ts`) — sem `Request` não
 * há o que registrar.
 */
function notFound(request?: Request): Response {
  const response = problem(404, "rota-inexistente", "Rota não encontrada nesta API.");
  void recordRefusalFor(request, response, null);
  return response;
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
