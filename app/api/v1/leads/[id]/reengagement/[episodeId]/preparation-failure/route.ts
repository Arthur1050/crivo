import { MAX_BODY_BYTES, parsePreparationFailure } from "../../../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../../../../../src/server/integration/route";
import { releasePreparationFailure } from "../../../../../../../../src/server/reengagement/repository";

type Context = { params: Promise<{ id: string; episodeId: string }> };
export const POST = withIntegrationRoute<Context>(async (request, auth, { params }) => {
  const { id, episodeId } = await params;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || !uuid.test(episodeId)) return problem(404, "recurso-nao-encontrado", "Lead ou episódio não encontrado.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, "corpo-grande-demais", "Corpo excede o limite de 100 KiB.");
  let value: unknown;
  try { value = JSON.parse(body); } catch { return problem(400, "payload-invalido", "Corpo não é JSON válido."); }
  const parsed = parsePreparationFailure(value);
  if (!parsed.ok) return problem(400, "payload-invalido", parsed.detail);
  const result = await releasePreparationFailure(auth, id, episodeId, parsed.dto);
  if (!result.ok) {
    if (result.reason === "lead-not-found" || result.reason === "episode-not-found") return problem(404, "recurso-nao-encontrado", "Lead ou episódio não encontrado.");
    if (result.reason === "invalid-input") return problem(400, "payload-invalido", "Falha de preparação inválida.");
    return problem(409, result.reason === "episode-consumed" ? "episodio-consumido" : result.reason === "claim-expired" ? "claim-expirada" : "contexto-alterado", "Claim de preparação indisponível.");
  }
  return Response.json({ released: result.released, episodeId: result.episodeId });
});

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
