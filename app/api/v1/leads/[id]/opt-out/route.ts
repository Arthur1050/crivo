import { getLead, serviceScope } from "../../../../../../src/server/data";
import { serializeLead } from "../../../../../../src/server/integration/leads";
import { optOutLead } from "../../../../../../src/server/integration/lgpd";
import {
  methodNotAllowed,
  problem,
} from "../../../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../../../src/server/integration/route";

/**
 * `POST /api/v1/leads/{id}/opt-out` — registro de opt-out (design.md —
 * LGPD-01). Handler fino: `withIntegrationRoute` já autenticou e já agenda
 * o registro de qualquer recusa — este corpo só delega ao serviço
 * (idempotente por construção) → serializa o lead atualizado ou mapeia 404.
 * Nenhuma regra de negócio aqui.
 */
export const POST = withIntegrationRoute<{ params: Promise<{ id: string }> }>(
  async (_request, auth, { params }) => {
    const { id } = await params;

    const result = await optOutLead(auth.tenantId, id);
    if (!result) {
      return problem(404, "recurso-nao-encontrado", "Lead não encontrado.");
    }

    // `optOutLead` já confirmou que a linha existe no tenant — a busca
    // abaixo só serve para devolver a representação completa do lead
    // (design.md — `optOutLead` retorna apenas `{ optedOutAt }`, não o lead
    // inteiro).
    const lead = await getLead(serviceScope(auth.tenantId), id);
    return Response.json(serializeLead(lead!), { status: 200 });
  }
);

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
