import { PROBLEM_CODE } from "../../../../../../src/lib/vocabulary";
import { parseAutomationCandidatesQuery } from "../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../src/kit/integration";
import { withIntegrationRoute } from "../../../../../../src/kit/integration";
import { listCandidates } from "../../../../../../src/server/reengagement/repository";

export const GET = withIntegrationRoute(async (request, auth) => {
  const parsed = parseAutomationCandidatesQuery(new URL(request.url));
  if (!parsed.ok) return problem(400, PROBLEM_CODE.invalid_payload, parsed.detail);
  const result = await listCandidates(auth, parsed.dto);
  if (!result.ok) return result.reason === "tenant-not-found"
    ? problem(404, PROBLEM_CODE.not_found, "Tenant não encontrado.")
    : problem(400, PROBLEM_CODE.invalid_payload, "Cursor ou limite de candidatos inválido.");
  return Response.json({ candidates: result.candidates.map(({ leadId, anchorMessageId, anchorSentAt, phoneNumberId, action }) =>
    ({ leadId, anchorMessageId, anchorSentAt, phoneNumberId, action })), cutoffAt: result.cutoffAt.toISOString(), nextCursor: result.nextCursor });
});

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
