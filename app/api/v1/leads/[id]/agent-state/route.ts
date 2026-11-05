import { PROBLEM_CODE } from "../../../../../../src/lib/vocabulary";
import { MAX_BODY_BYTES, parseAgentState } from "../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../src/kit/integration";
import { withIntegrationRoute } from "../../../../../../src/kit/integration";
import { publishAgentState } from "../../../../../../src/server/reengagement/agent-state";

type Context = { params: Promise<{ id: string }> };
export const POST = withIntegrationRoute<Context>(async (request, auth, { params }) => {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return problem(404, PROBLEM_CODE.not_found, "Lead não encontrado.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, PROBLEM_CODE.body_too_large, "Corpo excede o limite de 100 KiB.");
  let value: unknown;
  try { value = JSON.parse(body); } catch { return problem(400, PROBLEM_CODE.invalid_payload, "Corpo não é JSON válido."); }
  const parsed = parseAgentState(value);
  if (!parsed.ok) return problem(400, PROBLEM_CODE.invalid_payload, parsed.detail);
  const result = await publishAgentState(auth, id, parsed.dto);
  if (!result.ok) {
    if (result.reason === "lead-not-found") return problem(404, PROBLEM_CODE.not_found, "Lead não encontrado.");
    if (result.reason === "invalid-state") return problem(400, PROBLEM_CODE.invalid_payload, "Estado do agente inválido.");
    return problem(409, result.reason === "context-changed" ? PROBLEM_CODE.context_changed : PROBLEM_CODE.invalid_transition, "Âncora, reset, revisão ou fase incompatível.");
  }
  const { state } = result;
  return Response.json({ replay: result.replay, state: { ...state, resetObservedAt: state.resetObservedAt?.toISOString() ?? null, updatedAt: state.updatedAt.toISOString() } });
});

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
