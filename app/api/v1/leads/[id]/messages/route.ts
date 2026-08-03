import { authenticate } from "../../../../../../src/server/integration/auth";
import {
  ingestMessage,
  serializeMessage,
} from "../../../../../../src/server/integration/messages";
import {
  MAX_BODY_BYTES,
  parseMessageCreate,
} from "../../../../../../src/server/integration/parsers";
import {
  methodNotAllowed,
  problem,
} from "../../../../../../src/server/integration/problem";

/**
 * `POST /api/v1/leads/{id}/messages` — ingestão idempotente de mensagens
 * (design.md — Route handlers). Handler fino: autentica → lê/valida o
 * corpo → delega ao serviço → serializa a resposta ou mapeia o 404 de lead
 * inexistente/de outro tenant. Nenhuma regra de negócio aqui.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;

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

  const parsed = parseMessageCreate(json);
  if (!parsed.ok) return problem(400, "payload-invalido", parsed.detail);

  const result = await ingestMessage(auth.tenantId, id, parsed.dto);
  if (!result.ok) {
    return problem(404, result.code, "Lead não encontrado.");
  }

  return Response.json(serializeMessage(result.message), {
    status: result.created ? 201 : 200,
  });
}

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
