const B_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function bDate(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }

/** CRM owns eligibility and the opaque cursor; an empty page still advances. */
export function candidatePageJobs(response, page) {
  if (response?.error || !Array.isArray(response?.candidates) || response.candidates.length > 100 || !bDate(response.cutoffAt)
      || !(response.nextCursor === null || (typeof response.nextCursor === "string" && response.nextCursor.length > 0))
      || (page.cutoffAt && page.cutoffAt !== response.cutoffAt) || (response.nextCursor && response.nextCursor === page.cursor)) throw new Error("candidate-page-unavailable");
  const context = { ...page, cutoffAt: response.cutoffAt, nextCursor: response.nextCursor };
  const jobs = response.candidates.map(candidate => {
    if (!candidate || !B_UUID.test(candidate.leadId) || !B_UUID.test(candidate.anchorMessageId) || !bDate(candidate.anchorSentAt)
        || typeof candidate.phoneNumberId !== "string" || !/^\d{1,32}$/.test(candidate.phoneNumberId) || !["prepare", "omit", "escalate"].includes(candidate.action)) throw new Error("candidate-page-unavailable");
    return { ...context, leadId: candidate.leadId, anchorMessageId: candidate.anchorMessageId, anchorSentAt: candidate.anchorSentAt, phoneNumberId: candidate.phoneNumberId, action: candidate.action, pageStart: true };
  });
  return jobs.length ? jobs : [{ ...context, action: "empty", pageStart: true }];
}

export function preparationClaim(response, candidate, now) {
  if (response?.error || !B_UUID.test(response?.episodeId) || !B_UUID.test(response?.claimToken) || !bDate(response?.claimExpiresAt)
      || Date.parse(response.claimExpiresAt) <= now || !response.frame || !B_UUID.test(response.frame.tenantId) || (candidate.tenantId && response.frame.tenantId !== candidate.tenantId) || response.frame.leadId !== candidate.leadId
      || response.frame.episodeId !== response.episodeId || response.frame.phoneNumberId !== candidate.phoneNumberId
      || response.frame.anchor?.id !== candidate.anchorMessageId || response.frame.anchor?.sentAt !== candidate.anchorSentAt
      || !Number.isSafeInteger(response.agentStateRevision) || response.frame.agent?.revision !== response.agentStateRevision) return { ...candidate, claimed: false, outcome: "claim-unavailable" };
  return { ...candidate, claimed: true, episodeId: response.episodeId, claimToken: response.claimToken, frame: response.frame, deadline: Math.min(now + 120000, Date.parse(response.claimExpiresAt)) };
}

export function generationForDispatch(response, claim, now) {
  let code = "generation-failed", text = typeof response?.text === "string" ? response.text.trim() : "";
  if (now >= claim.deadline) code = "generation-timeout";
  else if (["generation-timeout", "context-read-failed", "invalid-text"].includes(response?.code)) code = response.code;
  else if (response?.ok === true && !response.error) {
    if (text && text.length <= 4096) return { ...claim, valid: true, text };
    code = "invalid-text";
  }
  return { ...claim, valid: false, failureCode: code };
}

/** Acceptance identity comes only from send, never generation or the clock. */
export function acknowledgementForSend(response, claim) {
  const valid = !response?.error && response?.episodeId === claim.episodeId && response.state === "accepted_pending_record"
    && typeof response.wamid === "string" && response.wamid.trim() === response.wamid && response.wamid.length > 0 && response.wamid.length <= 2048 && bDate(response.acceptedAt);
  return { ...claim, needsAck: valid, ...(valid ? { acknowledgement: { wamid: response.wamid, acceptedAt: response.acceptedAt } } : {}), outcome: typeof response?.state === "string" ? response.state : "uncertain" };
}

/** Only the committed expiry DTO grants a cache mirror; it never authorizes contact. */
export function silenceExpiryResult(response, candidate) {
  const committed = !response?.error && response?.action === "escalated" && B_UUID.test(response.episodeId)
    && (response.brokerId === null || B_UUID.test(response.brokerId)) && ["accepted", "omitted", "refused", "uncertain"].includes(response.result);
  return { ...candidate, committed, ...(committed ? { episodeId: response.episodeId, brokerId: response.brokerId, result: response.result } : {}), outcome: committed ? "escalated" : "expiry-unconfirmed" };
}
