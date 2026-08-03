import { authenticate } from "../../../../src/server/integration/auth";
import { deliverLead, serializeLead } from "../../../../src/server/integration/leads";
import {
  MAX_BODY_BYTES,
  parseLeadCreate,
} from "../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../src/server/integration/problem";

/**
 * `POST /api/v1/leads` — entrega idempotente de leads (design.md — Route
 * handlers). Handler fino: autentica → lê/valida o corpo → delega ao
 * serviço → serializa a resposta. Nenhuma regra de negócio aqui.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;

  const bodyText = await request.text();
  if (Buffer.byteLength(bodyText, "utf8") > MAX_BODY_BYTES) {
    return problem(
      413,
      "corpo-grande-demais",
      `Corpo da requisição excede o limite de ${MAX_BODY_BYTES} bytes.`
    );
  }

  let json: unknown;
  try {
    json = bodyText.trim() === "" ? {} : JSON.parse(bodyText);
  } catch {
    return problem(400, "payload-invalido", "Corpo da requisição não é JSON válido.");
  }

  const parsed = parseLeadCreate(json);
  if (!parsed.ok) return problem(400, "payload-invalido", parsed.detail);

  const { created, lead } = await deliverLead(auth.tenantId, parsed.dto);
  return Response.json(serializeLead(lead), { status: created ? 201 : 200 });
}

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
