import { authenticate } from "../../../../../../src/server/integration/auth";
import { getLead } from "../../../../../../src/server/data";
import { serializeLead } from "../../../../../../src/server/integration/leads";
import { optOutLead } from "../../../../../../src/server/integration/lgpd";
import {
  methodNotAllowed,
  problem,
} from "../../../../../../src/server/integration/problem";

/**
 * `POST /api/v1/leads/{id}/opt-out` — registro de opt-out (design.md —
 * LGPD-01). Handler fino: autentica → delega ao serviço (idempotente por
 * construção) → serializa o lead atualizado ou mapeia 404. Nenhuma regra de
 * negócio aqui.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const auth = await authenticate(request);
  if (auth instanceof Response) return auth;

  const { id } = await params;

  const result = await optOutLead(auth.tenantId, id);
  if (!result) {
    return problem(404, "recurso-nao-encontrado", "Lead não encontrado.");
  }

  // `optOutLead` já confirmou que a linha existe no tenant — a busca abaixo
  // só serve para devolver a representação completa do lead (design.md —
  // `optOutLead` retorna apenas `{ optedOutAt }`, não o lead inteiro).
  const lead = await getLead(auth.tenantId, id);
  return Response.json(serializeLead(lead!), { status: 200 });
}

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
