import { PROBLEM_CODE } from "../../../../../src/lib/vocabulary";
import { MAX_BODY_BYTES } from "../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../src/kit/integration";
import { withIntegrationRoute } from "../../../../../src/kit/integration";
import { createStatusForwardingContext, ingestStatusBatch } from "../../../../../src/server/whatsapp/statuses";

export const POST = withIntegrationRoute(async (request, auth) => {
  // A prova factual do trigger instalado ainda não habilitou esta capability.
  // Body/header de origem verificada nunca concedem a prova de configuração servidor.
  const context = createStatusForwardingContext(auth, request);
  if (!context) return problem(403, PROBLEM_CODE.unauthenticated, "Origem do encaminhamento de status não comprovada.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, PROBLEM_CODE.body_too_large, "Corpo excede o limite de 100 KiB.");
  let value: unknown;
  try { value = JSON.parse(body); } catch { return problem(400, PROBLEM_CODE.invalid_payload, "Corpo não é JSON válido."); }
  const result = await ingestStatusBatch(context, value);
  if (!result.ok) {
    if (result.reason === "origin-unverified") return problem(403, PROBLEM_CODE.unauthenticated, "Origem do encaminhamento de status não comprovada.");
    if (result.reason === "channel-untrusted") return problem(403, PROBLEM_CODE.channel_not_linked, "Número não vinculado e verificado neste tenant.");
    if (result.reason === "body-too-large") return problem(413, PROBLEM_CODE.body_too_large, "Corpo excede o limite de 100 KiB.");
    if (result.reason === "persistence-failed") return problem(503, PROBLEM_CODE.service_unavailable, "Persistência de status temporariamente indisponível.");
    return problem(400, PROBLEM_CODE.invalid_payload, "Lote de status normalizados inválido.");
  }
  return Response.json({ processed: result.processed });
});

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
