import { MAX_BODY_BYTES, parseReengagementSend } from "../../../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../../../../../src/server/integration/route";
import { sendPreparedEpisode } from "../../../../../../../../src/server/reengagement/send";

type Context = { params: Promise<{ id: string; episodeId: string }> };
export const POST = withIntegrationRoute<Context>(async (request, auth, { params }) => {
  const { id, episodeId } = await params;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || !uuid.test(episodeId)) return problem(404, "recurso-nao-encontrado", "Lead ou episódio não encontrado.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, "corpo-grande-demais", "Corpo excede o limite de 100 KiB.");
  let value: unknown;
  try { value = JSON.parse(body); } catch { return problem(400, "payload-invalido", "Corpo não é JSON válido."); }
  const parsed = parseReengagementSend(value);
  if (!parsed.ok) return problem(400, "payload-invalido", parsed.detail);
  const result = await sendPreparedEpisode(auth, id, episodeId, parsed.dto);
  if (!result.ok) {
    if (result.reason === "lead-not-found" || result.reason === "episode-not-found") return problem(404, "recurso-nao-encontrado", "Lead ou episódio não encontrado.");
    if (["invalid-input", "invalid-text", "texto-invalido"].includes(result.reason)) return problem(400, "payload-invalido", "Texto ou claim de envio inválido.");
    if (["nao-configurado", "transporte-invalido"].includes(result.reason)) return problem(503, "estado-agente-desconhecido", "Transporte indisponível para preparação do envio.");
    return problem(409, result.reason === "claim-expired" ? "claim-expirada" : result.reason === "episode-consumed" ? "episodio-consumido"
      : result.reason === "invalid-channel-snapshot" ? "canal-nao-vinculado" : result.reason === "not-eligible" ? (result.policyReason === "unknown-data" ? "estado-agente-desconhecido" : "transicao-invalida")
      : "contexto-alterado", "Contexto ou claim de envio incompatível.");
  }
  return Response.json({ episodeId: result.episodeId, state: result.state, replay: result.replay,
    ...(result.wamid ? { wamid: result.wamid } : {}), ...(result.acceptedAt ? { acceptedAt: result.acceptedAt.toISOString() } : {}),
    ...(result.messageId ? { messageId: result.messageId } : {}) });
});

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
