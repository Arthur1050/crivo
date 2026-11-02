import { PROBLEM_CODE } from "../../../../../../../src/lib/vocabulary";
import { MAX_BODY_BYTES, parseReengagementPrepare } from "../../../../../../../src/server/integration/parsers";
import { methodNotAllowed, problem } from "../../../../../../../src/server/integration/problem";
import { withIntegrationRoute } from "../../../../../../../src/server/integration/route";
import { prepareFrame } from "../../../../../../../src/server/reengagement/context";
import { claimPreparation, releasePreparationFailure } from "../../../../../../../src/server/reengagement/repository";

type Context = { params: Promise<{ id: string }> };
export const POST = withIntegrationRoute<Context>(async (request, auth, { params }) => {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return problem(404, PROBLEM_CODE.not_found, "Lead não encontrado.");
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) return problem(413, PROBLEM_CODE.body_too_large, "Corpo excede o limite de 100 KiB.");
  let value: unknown;
  try { value = JSON.parse(body); } catch { return problem(400, PROBLEM_CODE.invalid_payload, "Corpo não é JSON válido."); }
  const parsed = parseReengagementPrepare(value);
  if (!parsed.ok) return problem(400, PROBLEM_CODE.invalid_payload, parsed.detail);
  const claim = await claimPreparation(auth, id, parsed.dto);
  if (!claim.ok) {
    if (claim.reason === "lead-not-found") return problem(404, PROBLEM_CODE.not_found, "Lead não encontrado.");
    if (claim.reason === "invalid-anchor") return problem(400, PROBLEM_CODE.invalid_payload, "Âncora inválida.");
    if (claim.reason === "lease-active") return problem(409, PROBLEM_CODE.episode_preparing, "Preparação já reservada por outro worker.");
    return problem(409, claim.reason === "context-changed" ? PROBLEM_CODE.context_changed
      : claim.policyReason === "unknown-data" ? PROBLEM_CODE.unknown_agent_state : PROBLEM_CODE.invalid_transition, "Contexto ou elegibilidade não permite preparação.");
  }
  if (!claim.acquired) return Response.json({ episodeId: claim.episodeId, state: claim.state });
  const prepared = await prepareFrame(auth, id, claim.episodeId, { claimToken: claim.claimToken });
  if (!prepared.ok) {
    try { await releasePreparationFailure(auth, id, claim.episodeId, { claimToken: claim.claimToken, code: "context-read-failed" }); }
    catch { /* A failed release cannot grant another claim or undo dispatch. */ }
    if (prepared.reason === "lead-not-found" || prepared.reason === "episode-not-found") return problem(404, PROBLEM_CODE.not_found, "Lead ou episódio não encontrado.");
    if (prepared.reason === "context-read-failed") return problem(503, PROBLEM_CODE.unknown_agent_state, "Leitura técnica do contexto indisponível.");
    return problem(409, prepared.reason === "claim-expired" ? PROBLEM_CODE.claim_expired : prepared.reason === "episode-consumed" ? PROBLEM_CODE.episode_consumed
      : prepared.reason === "not-eligible" ? PROBLEM_CODE.invalid_transition : PROBLEM_CODE.context_changed, "Contexto ou claim de preparação alterado.");
  }
  return Response.json({ episodeId: claim.episodeId, claimToken: claim.claimToken, claimExpiresAt: claim.claimExpiresAt.toISOString(),
    agentStateRevision: claim.agentStateRevision, frame: prepared.frame }, { status: 201 });
});

export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
