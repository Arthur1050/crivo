import { PROBLEM_CODE } from "../../../../../../src/lib/vocabulary";
import { listAutomationChannels } from "../../../../../../src/server/reengagement/tick";
import { withIntegrationRoute } from "../../../../../../src/kit/integration";
import { methodNotAllowed, problem } from "../../../../../../src/kit/integration";
export const GET = withIntegrationRoute(async (_request, auth) => {
  try { return Response.json({ channels: await listAutomationChannels(auth) }); }
  catch { return problem(503, PROBLEM_CODE.service_unavailable, "Canais temporariamente indisponíveis."); }
});
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
