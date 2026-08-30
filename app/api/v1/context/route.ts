import {
  getContext,
  type ContextModality,
} from "../../../../src/server/integration/context";
import { methodNotAllowed, problem } from "../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../src/server/integration/route";

const VALID_MODALITIES: ContextModality[] = ["novo", "usado"];

function isValidModality(value: string | null): value is ContextModality {
  return value !== null && (VALID_MODALITIES as string[]).includes(value);
}

/**
 * `GET /api/v1/context?modality={novo|usado}` — leitura de contexto do
 * tenant (design.md — Route handlers). Handler fino: `withIntegrationRoute`
 * já autenticou e já agenda o registro de qualquer recusa — este corpo só
 * valida o query param → delega ao serviço → serializa a resposta. Nenhuma
 * regra de negócio aqui.
 */
export const GET = withIntegrationRoute(async (request, auth) => {
  const modality = new URL(request.url).searchParams.get("modality");
  if (!isValidModality(modality)) {
    return problem(
      400,
      "payload-invalido",
      "Parâmetro 'modality' é obrigatório e deve ser 'novo' ou 'usado'."
    );
  }

  const documents = await getContext(auth.tenantId, modality);
  return Response.json(documents);
});

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
