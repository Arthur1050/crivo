import { MAX_BODY_BYTES, parseSessionContext } from "../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../../../src/server/integration/route";
import { getSessionFrame } from "../../../../../../src/server/reengagement/context";

type Context = { params: Promise<{ id: string }> };
export const POST = withIntegrationRoute<Context>(async (request, auth, { params }) => {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return problem(404, "recurso-nao-encontrado", "Lead não encontrado.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, "corpo-grande-demais", "Corpo excede o limite de 100 KiB.");
  let value: unknown;
  try { value = JSON.parse(body); } catch { return problem(400, "payload-invalido", "Corpo não é JSON válido."); }
  const parsed = parseSessionContext(value);
  if (!parsed.ok) return problem(400, "payload-invalido", parsed.detail);
  const result = await getSessionFrame(auth, id, parsed.dto);
  if (!result.ok) {
    if (result.reason === "lead-not-found") return problem(404, "recurso-nao-encontrado", "Lead não encontrado.");
    if (result.reason === "context-read-failed") return problem(503, "estado-agente-desconhecido", "Leitura técnica do contexto indisponível.");
    return problem(400, "payload-invalido", "Buffer ou identificação inválido.");
  }
  return Response.json({ frame: result.frame, history: result.history, requiresRebuild: result.requiresRebuild,
    pendingAcceptance: result.pendingAcceptance, anchor: result.anchor, agentStateRevision: result.agentStateRevision });
});

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
