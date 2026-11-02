import { PROBLEM_CODE } from "../../../../../../src/lib/vocabulary";
import { reconcileAutomationTick } from "../../../../../../src/server/reengagement/tick";
import { withIntegrationRoute } from "../../../../../../src/server/integration/route";
import { MAX_BODY_BYTES } from "../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../src/server/integration/problem";
export const POST = withIntegrationRoute(async (request, auth) => {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, PROBLEM_CODE.body_too_large, "Corpo excede o limite.");
  let input: unknown;
  try { input = JSON.parse(body); } catch { return problem(400, PROBLEM_CODE.invalid_payload, "Corpo não é JSON válido."); }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) return problem(400, PROBLEM_CODE.invalid_payload, "Reconciliação aceita somente objeto vazio.");
  try { return Response.json(await reconcileAutomationTick(auth)); }
  catch { return problem(503, PROBLEM_CODE.service_unavailable, "Reconciliação temporariamente indisponível."); }
});
export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
