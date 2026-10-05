import { reconcileAutomationTick } from "../../../../../../src/server/reengagement/tick";
import { withIntegrationRoute } from "../../../../../../src/server/integration/route";
import { MAX_BODY_BYTES } from "../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../src/server/integration/problem";
export const POST = withIntegrationRoute(async (request, auth) => {
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, "corpo-grande-demais", "Corpo excede o limite.");
  let input: unknown;
  try { input = JSON.parse(body); } catch { return problem(400, "payload-invalido", "Corpo não é JSON válido."); }
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) return problem(400, "payload-invalido", "Reconciliação aceita somente objeto vazio.");
  try { return Response.json(await reconcileAutomationTick(auth)); }
  catch { return problem(503, "servico-indisponivel", "Reconciliação temporariamente indisponível."); }
});
export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
