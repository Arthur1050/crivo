import { authenticate } from "../../../../../src/server/integration/auth";
import { patchLead, serializeLead } from "../../../../../src/server/integration/leads";
import {
  MAX_BODY_BYTES,
  parseLeadPatch,
} from "../../../../../src/server/integration/parsers";
import {
  methodNotAllowed,
  problem,
  type ProblemCode,
} from "../../../../../src/server/integration/problem";

/** Mapeia os códigos que `patchLead` pode devolver para o status HTTP do
 * contrato (design.md — Error Handling Strategy). */
function statusForCode(code: ProblemCode): number {
  switch (code) {
    case "recurso-nao-encontrado":
      return 404;
    case "transicao-invalida":
    case "lead-travado-por-humano":
    case "motivo-escalonamento-obrigatorio":
      return 409;
    default:
      return 400;
  }
}

function detailForCode(code: ProblemCode): string | undefined {
  switch (code) {
    case "recurso-nao-encontrado":
      return "Lead não encontrado.";
    case "transicao-invalida":
      return "Transição de status não permitida a partir do status atual.";
    case "lead-travado-por-humano":
      return "Um humano já alterou o status deste lead pelo Kanban; mudanças de status via API estão bloqueadas.";
    case "motivo-escalonamento-obrigatorio":
      return "Escalar para humano exige o campo 'escalationReason' preenchido e não-vazio.";
    default:
      return undefined;
  }
}

/**
 * `PATCH /api/v1/leads/{id}` — upsert parcial de qualificação + máquina de
 * estados (design.md — Route handlers). Handler fino: autentica → lê/valida
 * o corpo → delega a `patchLead` → mapeia falha de serviço para problem+json
 * ou serializa o lead atualizado. Um lead de outro tenant nunca chega a
 * existir do ponto de vista de `patchLead` (tenant-scoped na DAL) — vira
 * `recurso-nao-encontrado` → 404, nunca 403 (INT-01 AC3).
 */
export async function PATCH(
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

  const parsed = parseLeadPatch(json);
  if (!parsed.ok) return problem(400, "payload-invalido", parsed.detail);

  const result = await patchLead(auth.tenantId, id, parsed.dto);
  if (!result.ok) {
    return problem(statusForCode(result.code), result.code, detailForCode(result.code));
  }

  return Response.json(serializeLead(result.lead), { status: 200 });
}

export const GET = methodNotAllowed(["PATCH"]);
export const POST = methodNotAllowed(["PATCH"]);
export const PUT = methodNotAllowed(["PATCH"]);
export const DELETE = methodNotAllowed(["PATCH"]);
