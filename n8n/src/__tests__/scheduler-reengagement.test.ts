import { describe, expect, it } from "vitest";
import { candidatePageJobs, silenceExpiryResult } from "../scheduler-reengagement.mjs";

const leadId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const anchorMessageId = "4fa85f64-5717-4562-b3fc-2c963f66afa7";
const cutoffAt = "2026-10-06T15:00:00.000Z";
const page = { tenantSlug: "fixture", cursor: null, cutoffAt: null };
const candidate = (patch: Record<string, unknown>) => ({ leadId, anchorMessageId, anchorSentAt: "2026-10-04T15:00:00.000Z", phoneNumberId: "123456789", action: "escalate", ...patch });

describe("candidatePageJobs — escalada sem canal verificado (auditoria L14b, M1)", () => {
  it("escalate com phoneNumberId null entra na página", () => {
    const jobs = candidatePageJobs({ candidates: [candidate({ phoneNumberId: null })], cutoffAt, nextCursor: null }, page);
    expect(jobs).toEqual([expect.objectContaining({ leadId, anchorMessageId, phoneNumberId: null, action: "escalate" })]);
  });

  it.each(["prepare", "omit"])("%s sem canal derruba a página", (action) => {
    expect(() => candidatePageJobs({ candidates: [candidate({ phoneNumberId: null, action })], cutoffAt, nextCursor: null }, page))
      .toThrow("candidate-page-unavailable");
  });

  it("phoneNumberId malformado continua recusado, inclusive em escalate", () => {
    expect(() => candidatePageJobs({ candidates: [candidate({ phoneNumberId: "abc" })], cutoffAt, nextCursor: null }, page))
      .toThrow("candidate-page-unavailable");
  });
});

describe("silenceExpiryResult — escalada sem episódio gravado", () => {
  it("episodeId null com escalada confirmada espelha o fechamento", () => {
    expect(silenceExpiryResult({ action: "escalated", episodeId: null, brokerId: null, result: "omitted" }, { leadId }))
      .toMatchObject({ committed: true, episodeId: null, outcome: "escalated" });
  });

  it("episodeId malformado não confirma", () => {
    expect(silenceExpiryResult({ action: "escalated", episodeId: "x", brokerId: null, result: "omitted" }, { leadId }))
      .toMatchObject({ committed: false, outcome: "expiry-unconfirmed" });
  });
});
