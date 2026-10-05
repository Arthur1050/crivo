import { listAutomationChannels } from "../../../../../../src/server/reengagement/tick";
import { withIntegrationRoute } from "../../../../../../src/server/integration/route";
import { methodNotAllowed, problem } from "../../../../../../src/server/integration/problem";
export const GET = withIntegrationRoute(async (_request, auth) => {
  try { return Response.json({ channels: await listAutomationChannels(auth) }); }
  catch { return problem(503, "servico-indisponivel", "Canais temporariamente indisponíveis."); }
});
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
