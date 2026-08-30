import "server-only";
import { after } from "next/server";
import { recordIntegrationRefusal } from "../data";
import { authenticate, type AuthResult } from "./auth";
import { PROBLEM_CONTENT_TYPE } from "./problem";

/**
 * Ponto único de autenticação e registro de recusa do contrato `/api/v1`
 * (design.md — `withIntegrationRoute`, SAUDE-01). Um route file de `/api/v1`
 * nunca mais chama `authenticate()` nem grava recusa por conta própria — o
 * wrapper faz as duas coisas, e o handler recebe só o caminho feliz.
 */

/** Marca todo handler devolvido por `withIntegrationRoute` (T17 varre por
 * ela para exigir instrumentação em todo export de verbo HTTP de `/api/v1`). */
export const INSTRUMENTED = Symbol("integration-route-instrumented");

/** Segundo argumento que o Next passa às rotas dinâmicas (design.md —
 * `withIntegrationRoute`, Detalhes). Rotas sem segmento dinâmico não usam. */
export interface RouteContext<Params extends Record<string, string> = Record<string, string>> {
  params: Promise<Params>;
}

export type RouteHandler<Ctx = never> = (request: Request, ctx: Ctx) => Promise<Response>;

/**
 * Extrai `code` do corpo de uma resposta problem+json sem consumir o corpo
 * original — `response.clone()` é o que garante que a resposta devolvida ao
 * chamador nunca é afetada por esta leitura (SAUDE-01 AC7). Qualquer corpo
 * que não seja `application/problem+json`, ou que falhe ao parsear, grava
 * `code = null` (design.md — `withIntegrationRoute`, Detalhes).
 */
async function extractProblemCode(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes(PROBLEM_CONTENT_TYPE)) return null;

  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

/**
 * Agenda a gravação de uma recusa (resposta >= 400) sem jamais alterar a
 * resposta devolvida ao chamador (SAUDE-01 AC5/AC7). `route` é sempre o
 * `pathname` — nunca a URL completa, para não gravar query string.
 *
 * `after()` (next/server) lança fora de um request scope do Next
 * (`node_modules/next/dist/server/after/after.js:12-19`, erro `E468`).
 * Todo teste de rota deste projeto chama os handlers exportados direto no
 * vitest, sem esse escopo — um `after()` cru quebraria a suíte de rotas
 * inteira. Por isso `after()` vive dentro de um `try/catch`: quando há
 * escopo de requisição (produção real, Vercel), a gravação é agendada e
 * roda depois da resposta via `waitUntil`, sem custo de latência para quem
 * chamou; quando não há escopo (todo teste de rota), o fallback grava de
 * forma síncrona antes de devolver — o que, de quebra, torna a asserção do
 * teste determinística, sem precisar esperar por nada.
 *
 * `request` é opcional só para admitir os chamadores legados de
 * `methodNotAllowed`/`notFound` que ainda são testados sem um `Request` real
 * (`handler()`, sem argumento) — nesse caso não há o que registrar.
 */
export async function recordRefusalFor(
  request: Request | undefined,
  response: Response,
  tenantId: string | null
): Promise<void> {
  if (!request) return;

  const route = new URL(request.url).pathname;
  const method = request.method;
  const status = response.status;

  const write = async (): Promise<void> => {
    try {
      const code = await extractProblemCode(response);
      await recordIntegrationRefusal({
        tenantId,
        route,
        method,
        status,
        code,
        occurredAt: new Date(),
      });
    } catch {
      // Falha ao gravar recusa nunca pode propagar nem alterar a resposta
      // já devolvida ao chamador (SAUDE-01 AC5).
    }
  };

  try {
    after(write);
  } catch {
    await write();
  }
}

/**
 * `withIntegrationRoute(handler)` — autentica a requisição; se `authenticate`
 * devolver uma `Response` (recusa de autenticação), agenda o registro com
 * `tenantId = null` e devolve essa `Response` sem tocar. Senão, delega ao
 * `handler` com o tenant já resolvido e, se a resposta for >= 400, agenda o
 * registro com o tenant identificado. O segundo argumento do Next (`ctx`,
 * ex.: `{ params }` nas rotas dinâmicas) é sempre repassado intacto.
 */
export function withIntegrationRoute<Ctx = never>(
  handler: (request: Request, auth: AuthResult, ctx: Ctx) => Promise<Response>
): RouteHandler<Ctx> & { [INSTRUMENTED]: true } {
  const wrapped = async (request: Request, ctx: Ctx): Promise<Response> => {
    const auth = await authenticate(request);
    if (auth instanceof Response) {
      await recordRefusalFor(request, auth, null);
      return auth;
    }

    const response = await handler(request, auth, ctx);
    if (response.status >= 400) {
      await recordRefusalFor(request, response, auth.tenantId);
    }
    return response;
  };

  return Object.assign(wrapped, { [INSTRUMENTED]: true as const });
}
