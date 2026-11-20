import { expect, it, vi } from "vitest";
import type { db } from "../../../db";
import { AGENT_PHASE } from "../../../lib/vocabulary";
import { prepareFrame } from "../../../kit/reengagement";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";
import { realEstate } from "../../../verticals/real-estate";
import { createPrepareFrame } from "../context";

vi.mock("../../../db", () => ({ db: {} }));
vi.mock("../../../../n8n/src/reengagement.mjs", () => ({
  evaluateReengagement: () => ({ action: "prepare" }),
}));

const id = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-02T12:00:00Z");
const sentAt = new Date("2026-08-01T14:00:00Z");
const anchor = { id: "âncora", conversationId: "conversa", sentAt, phoneNumberId: "123" };
const lead = {
  name: "Pessoa", executiveSummary: "Resumo", externalId: "5534900000000",
  whatsappPhoneNumberId: anchor.phoneNumberId, memoryResetRequestedAt: null,
  modality: "novo", region: "Região persistida", budgetCents: 98765n, propertyType: "casa",
  purchaseHorizon: "seis meses", motivation: "investidor", creditStatus: "fgts", chainedOperation: true,
};

function database(askedFields: string[] = ["modality"], row: Record<string, unknown> = lead) {
  const rows = [
    [row],
    [{ state: "preparing", claimToken: id, claimExpiresAt: new Date("2026-08-02T13:00:00Z"),
      anchorMessageId: anchor.id, anchorSentAt: sentAt, agentStateRevision: 1, resetObservedAt: null, phoneNumberId: anchor.phoneNumberId }],
    [anchor],
    [{ phase: AGENT_PHASE.qualifying, anchorMessageId: anchor.id, revision: 1, resetObservedAt: null,
      askedFields, openingHistory: [] }],
    [{ phoneNumberId: anchor.phoneNumberId, ownershipVerifiedAt: now, configurationRevision: 1 }],
    [{}],
    [{ id: anchor.id, sender: "lead", content: "Mensagem da pessoa", authorName: null, sentAt }],
  ];
  return {
    transaction: (run: (tx: unknown) => unknown) => run({
      select() {
        const result = rows.shift();
        const query = Object.assign(Promise.resolve(result), {
          from: () => query, where: () => query, innerJoin: () => query,
          for: () => query, orderBy: () => query, limit: () => query,
        });
        return query;
      },
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    }),
  } as unknown as Pick<typeof db, "transaction">;
}

it("leva os fatos fornecidos pela faceta ao frame e ao cálculo da pendência", async () => {
  const promptFacts = vi.fn(() => ({ region: "Região da faceta", budgetCents: "12345" }));
  const result = await createPrepareFrame({ ...realEstate.qualification, promptFacts })({ tenantId: id }, id, id, { claimToken: id }, {
    now: () => now, database: database(),
  });
  expect(promptFacts).toHaveBeenCalledExactlyOnceWith(lead);
  expect(result).toMatchObject({ ok: true, frame: { pendingField: "propertyType" } });
  if (!result.ok) throw new Error(result.reason);
  expect(result.frame.facts).toEqual({
    name: "Pessoa", region: "Região da faceta", budgetCents: "12345", executiveSummary: "Resumo",
  });
});

// Sem faceta de qualificação, nenhum campo perguntado é válido e não há próximo campo.
it("sem faceta, omite os campos e não deixa pergunta pendente", async () => {
  const result = await createPrepareFrame(testVertical.qualification)({ tenantId: id }, id, id, { claimToken: id }, {
    now: () => now, database: database([]),
  });
  expect(result).toMatchObject({ ok: true, frame: { pendingField: null, agent: { askedFields: [] } } });
  if (!result.ok) throw new Error(result.reason);
  expect(result.frame.facts).toEqual({ name: "Pessoa", executiveSummary: "Resumo" });
});

it("sem faceta, recusa o estado gravado com campo perguntado", async () => {
  const result = await createPrepareFrame(testVertical.qualification)({ tenantId: id }, id, id, { claimToken: id }, {
    now: () => now, database: database(["modality"]),
  });
  expect(result).toEqual({ ok: false, reason: "context-read-failed" });
});

it("com a faceta da imobiliária, recusa campo perguntado fora da lista", async () => {
  const result = await createPrepareFrame(realEstate.qualification)({ tenantId: id }, id, id, { claimToken: id }, {
    now: () => now, database: database(["unknown"]),
  });
  expect(result).toEqual({ ok: false, reason: "context-read-failed" });
});

it("o app entrega a faceta da imobiliária ao frame: campos, fatos e próxima pergunta", async () => {
  const result = await prepareFrame({ tenantId: id }, id, id, { claimToken: id }, {
    now: () => now, database: database(["modality"], { ...lead, region: null }),
  });
  expect(result).toMatchObject({ ok: true, frame: { pendingField: "region", agent: { askedFields: ["modality"] } } });
  if (!result.ok) throw new Error(result.reason);
  expect(result.frame.facts).toMatchObject({ modality: "novo", region: null, propertyType: "casa" });
});
