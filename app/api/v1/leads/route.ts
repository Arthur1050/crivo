import { methodNotAllowed, problem, serializeLead, withIntegrationRoute } from "../../../../src/kit/integration";
import { PROBLEM_CODE } from "../../../../src/lib/vocabulary";
import { deliverLead } from "../../../../src/server/integration/leads";
import {
  MAX_BODY_BYTES,
  parseLeadCreate,
} from "../../../../src/server/integration/parsers";

/**
 * `POST /api/v1/leads` — entrega idempotente de leads (design.md — Route
 * handlers). Handler fino: `withIntegrationRoute` já autenticou e já agenda
 * o registro de qualquer recusa — este corpo só lê/valida o corpo → delega
 * ao serviço → serializa a resposta. Nenhuma regra de negócio aqui.
 */
export const POST = withIntegrationRoute(async (request, auth) => {
  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
    return problem(
      413,
      PROBLEM_CODE.body_too_large,
      `Corpo da requisição excede o limite de ${MAX_BODY_BYTES} bytes.`
    );
  }

  let json: unknown;
  try {
    json = bodyText.trim() === "" ? {} : JSON.parse(bodyText);
  } catch {
    return problem(400, PROBLEM_CODE.invalid_payload, "Corpo da requisição não é JSON válido.");
  }

  const parsed = parseLeadCreate(json);
  if (!parsed.ok) return problem(400, PROBLEM_CODE.invalid_payload, parsed.detail);

  const { created, lead } = await deliverLead(auth.tenantId, parsed.dto);
  return Response.json(serializeLead(lead), { status: created ? 201 : 200 });
});

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
