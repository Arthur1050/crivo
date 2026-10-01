import { findMemoryResets } from "../../../../src/server/integration/memory-resets";
import { parseMemoryResetsQuery } from "../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../src/server/integration/route";

/**
 * `GET /api/v1/memory-resets?since=<ISO>` (lote-14 — DEVOLVER-01, OPTHUM-01,
 * CONTRATO-01): pedidos de reconstrução da memória do agente do tenant da
 * credencial, com `memory_reset_requested_at >= since`. O scheduler do n8n
 * consome para purgar a sessão. Handler fino: `withIntegrationRoute` já
 * autenticou e registra qualquer recusa.
 */
export const GET = withIntegrationRoute(async (request, auth) => {
  const parsed = parseMemoryResetsQuery(new URL(request.url));
  if (!parsed.ok) return problem(400, "payload-invalido", parsed.detail);

  const resets = await findMemoryResets(auth.tenantId, parsed.since);
  return Response.json({ resets });
});

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
