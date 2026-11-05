import { PROBLEM_CODE } from "../../../../../src/lib/vocabulary";
import { findLead, patchLead, serializeLead } from "../../../../../src/server/integration/leads";
import {
  MAX_BODY_BYTES,
  parseLeadPatch,
} from "../../../../../src/server/integration/parsers";
import {
  methodNotAllowed,
  problem,
  type ProblemCode,
} from "../../../../../src/kit/integration";
import { withIntegrationRoute } from "../../../../../src/kit/integration";

/** Mapeia os códigos que `patchLead` pode devolver para o status HTTP do
 * contrato (design.md — Error Handling Strategy). */
function statusForCode(code: ProblemCode): number {
  switch (code) {
    case PROBLEM_CODE.not_found:
      return 404;
    case PROBLEM_CODE.invalid_transition:
    case PROBLEM_CODE.lead_locked_by_human:
    case PROBLEM_CODE.escalation_reason_required:
    // lote-8 — ATRIB-02: as duas recusas de agendamento são conflito com o
    // estado atual da agenda, a mesma família das demais 409 desta rota.
    case PROBLEM_CODE.no_assignee_available:
    case PROBLEM_CODE.appointment_conflict:
    // lote-14 — SILENCIO-01 AC9: conflito com a condução humana em curso.
    case PROBLEM_CODE.lead_under_human_control:
      return 409;
    default:
      return 400;
  }
}

function detailForCode(code: ProblemCode): string | undefined {
  switch (code) {
    case PROBLEM_CODE.not_found:
      return "Lead não encontrado.";
    case PROBLEM_CODE.invalid_transition:
      return "Transição de status não permitida a partir do status atual.";
    case PROBLEM_CODE.lead_locked_by_human:
      return "Um humano já alterou o status deste lead pelo Kanban; mudanças de status via API estão bloqueadas.";
    case PROBLEM_CODE.escalation_reason_required:
      return "Escalar para humano exige o campo 'escalationReason' preenchido e não-vazio.";
    case PROBLEM_CODE.no_assignee_available:
      return "Nenhum corretor com janela de trabalho cobrindo o horário solicitado. Ofereça outro horário ao lead.";
    case PROBLEM_CODE.appointment_conflict:
      return "O corretor escolhido acabou de receber outra reunião neste mesmo horário. Ofereça outro horário ao lead.";
    case PROBLEM_CODE.lead_under_human_control:
      return "Um humano conduz esta conversa pelo CRM; status e reunião não podem ser alterados pela API até a devolução ao agente.";
    default:
      return undefined;
  }
}

/**
 * `PATCH /api/v1/leads/{id}` — upsert parcial de qualificação + máquina de
 * estados (design.md — Route handlers). Handler fino: `withIntegrationRoute`
 * já autenticou e já agenda o registro de qualquer recusa — este corpo só
 * lê/valida o corpo → delega a `patchLead` → mapeia falha de serviço para
 * problem+json ou serializa o lead atualizado. Um lead de outro tenant nunca
 * chega a existir do ponto de vista de `patchLead` (tenant-scoped na DAL) —
 * vira `recurso-nao-encontrado` → 404, nunca 403 (INT-01 AC3).
 */
export const PATCH = withIntegrationRoute<{ params: Promise<{ id: string }> }>(
  async (request, auth, { params }) => {
    const { id } = await params;

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

    const parsed = parseLeadPatch(json);
    if (!parsed.ok) return problem(400, PROBLEM_CODE.invalid_payload, parsed.detail);

    const result = await patchLead(auth.tenantId, id, parsed.dto);
    if (!result.ok) {
      return problem(statusForCode(result.code), result.code, detailForCode(result.code));
    }

    // `assignedBroker` só aparece quando ESTA operação atribuiu um
    // responsável (lote-8 — ATRIB-02 AC4): o agente recebe quem ficou, para
    // convidar ao evento pelo e-mail. A lista de candidatos nunca sai do CRM
    // (AD-018), e o id interno do usuário continua fora do payload.
    return Response.json(
      {
        ...serializeLead(result.lead),
        ...(result.assignedBroker ? { assignedBroker: result.assignedBroker } : {}),
      },
      { status: 200 }
    );
  }
);

/**
 * `GET /api/v1/leads/{id}` (lote-14 — SILENCIO-01, CONTRATO-01): devolve o
 * lead do tenant da credencial, com a condução (`humanTakeoverAt`). O n8n lê
 * antes de cada envio do agente; lead de outro tenant é 404, nunca 403.
 */
export const GET = withIntegrationRoute<{ params: Promise<{ id: string }> }>(
  async (_request, auth, { params }) => {
    const { id } = await params;
    const lead = await findLead(auth.tenantId, id);
    if (!lead) return problem(404, PROBLEM_CODE.not_found, "Lead não encontrado.");
    return Response.json(serializeLead(lead));
  }
);

export const POST = methodNotAllowed(["GET", "PATCH"]);
export const PUT = methodNotAllowed(["GET", "PATCH"]);
export const DELETE = methodNotAllowed(["GET", "PATCH"]);
