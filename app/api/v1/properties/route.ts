import { parsePropertyFilters } from "../../../../src/server/integration/property-filters";
import { searchVisibleProperties } from "../../../../src/server/integration/properties";
import { methodNotAllowed, problem } from "../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../src/server/integration/route";

/**
 * `GET /api/v1/properties?modalidade=&tipo=&bairro=&cidade=&precoMin=&
 * precoMax=&quartosMin=` — busca de imóveis visíveis do catálogo (lote-11 —
 * BUSCA-01/03; design.md — Route handlers). Handler fino, molde de
 * `app/api/v1/context/route.ts` linha a linha: `withIntegrationRoute` já
 * autenticou e já agenda o registro de qualquer recusa (AD-023) — este corpo
 * só faz parse do filtro → delega ao serviço → serializa. Nenhuma regra de
 * negócio aqui.
 */
export const GET = withIntegrationRoute(async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const parsed = parsePropertyFilters(params);
  if (!parsed.ok) {
    return problem(400, "payload-invalido", parsed.detail);
  }

  const result = await searchVisibleProperties(auth.tenantId, parsed.filters);
  return Response.json(result);
});

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
