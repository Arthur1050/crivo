import { getTenantSettings } from "../../../../src/server/integration/settings";
import { methodNotAllowed, problem } from "../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../src/server/integration/route";

/**
 * `GET /api/v1/settings` — leitura de persona, modalidade e horário
 * comercial do tenant da chave (design.md — Route handlers, INT-09). Handler
 * fino: `withIntegrationRoute` já autenticou e já agenda o registro de
 * qualquer recusa — este corpo só delega ao serviço → serializa. 404
 * defensivo (inalcançável em uso normal do contrato — `authenticate` só
 * resolve chaves de tenants existentes).
 */
export const GET = withIntegrationRoute(async (_request, auth) => {
  const settings = await getTenantSettings(auth.tenantId);
  if (!settings) {
    return problem(404, "recurso-nao-encontrado", "Tenant não encontrado.");
  }

  return Response.json(settings);
});

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
