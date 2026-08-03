import { problem } from "../../../../src/server/integration/problem";

/**
 * Catch-all de `/api/v1/**` (design.md — Route handlers; Edge Cases: "rota
 * inexistente ou método não suportado... nunca HTML"). Rotas estáticas e
 * dinâmicas específicas (ex.: `app/api/v1/leads/route.ts`) têm precedência
 * sobre este catch-all no App Router — só path realmente não mapeado chega
 * aqui, em qualquer verbo.
 */
function notFound(): Response {
  return problem(404, "rota-inexistente", "Rota não encontrada nesta API.");
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
export const OPTIONS = notFound;
