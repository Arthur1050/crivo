import {
  ingestMessage,
  listMessages,
  serializeMessage,
} from "../../../../../../src/server/integration/messages";
import {
  MAX_BODY_BYTES,
  parseMessageCreate,
  parseMessagesQuery,
} from "../../../../../../src/server/integration/parsers";
import {
  methodNotAllowed,
  problem,
} from "../../../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../../../src/server/integration/route";

type MessagesRouteContext = { params: Promise<{ id: string }> };

/**
 * `GET /api/v1/leads/{id}/messages` — leitura do histórico de mensagens do
 * lead (design.md — § Contrato, CTX-02). Handler fino: `withIntegrationRoute`
 * já autenticou e já agenda o registro de qualquer recusa — este corpo só
 * valida `?limit=` → delega ao serviço → serializa a lista (mesmo formato do
 * POST) ou mapeia o 404 de lead inexistente/de outro tenant.
 */
export const GET = withIntegrationRoute<MessagesRouteContext>(
  async (request, auth, { params }) => {
    const { id } = await params;

    const parsedQuery = parseMessagesQuery(new URL(request.url));
    if (!parsedQuery.ok) {
      return problem(400, "payload-invalido", parsedQuery.detail);
    }

    const result = await listMessages(auth.tenantId, id, parsedQuery.limit);
    if (!result.ok) {
      return problem(404, result.code, "Lead não encontrado.");
    }

    return Response.json(result.messages.map(serializeMessage));
  }
);

/**
 * `POST /api/v1/leads/{id}/messages` — ingestão idempotente de mensagens
 * (design.md — Route handlers). Handler fino: `withIntegrationRoute` já
 * autenticou e já agenda o registro de qualquer recusa — este corpo só
 * lê/valida o corpo → delega ao serviço → serializa a resposta ou mapeia o
 * 404 de lead inexistente/de outro tenant. Nenhuma regra de negócio aqui.
 */
export const POST = withIntegrationRoute<MessagesRouteContext>(
  async (request, auth, { params }) => {
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
);

export const PUT = methodNotAllowed(["GET", "POST"]);
export const PATCH = methodNotAllowed(["GET", "POST"]);
export const DELETE = methodNotAllowed(["GET", "POST"]);
