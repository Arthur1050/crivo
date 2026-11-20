import { describe, expect, it, vi } from "vitest";
import type { db } from "../../../db";
import { AGENT_PHASE } from "../../../lib/vocabulary";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";
import { realEstate } from "../../../verticals/real-estate";
import { parseAgentState } from "../../../kit/integration";
import { publishAgentState } from "../../../kit/reengagement";
import { createAgentStateParser } from "../../integration/parsers";
import { createPublishAgentState, type PublishAgentStateInput } from "../agent-state";

vi.mock("../../../db", () => ({ db: {} }));

// Os campos que o agente registra em `askedFields` chegam pela faceta de qualificação (AD-052).
const anchorMessageId = "00000000-0000-4000-8000-000000000001";
const realEstateFields = ["modality", "region", "propertyType", "budgetCents", "purchaseHorizon", "motivation", "creditStatus", "chainedOperation"];

function body(askedFields: unknown[]) {
  return { anchorMessageId, resetObservedAt: null, expectedRevision: 0, phase: AGENT_PHASE.qualifying, askedFields, openingHistory: [] };
}

function input(askedFields: string[]): PublishAgentStateInput {
  return { anchorMessageId, resetObservedAt: null, expectedRevision: 0, phase: AGENT_PHASE.qualifying, askedFields, openingHistory: [] };
}

// A transação só começa depois da validação: o marcador prova que a entrada passou.
function database() {
  const transaction = vi.fn(async () => "validated");
  return { transaction, handle: { transaction } as unknown as Pick<typeof db, "transaction"> };
}

describe("faceta de qualificação — campos do agente", () => {
  it("a imobiliária fornece os 8 campos na ordem do phase.mjs e o próximo campo obrigatório", () => {
    expect(realEstate.qualification.agentFields).toEqual(realEstateFields);
    expect(realEstate.qualification.nextFieldToAsk([])).toBe("modality");
    expect(realEstate.qualification.nextFieldToAsk(["modality", "region"])).toBe("propertyType");
    expect(realEstate.qualification.nextFieldToAsk(["modality", "region", "propertyType"])).toBeNull();
  });

  describe("parser do estado do agente", () => {
    it.each(realEstateFields)("com a faceta da imobiliária, aceita %s", (field) => {
      expect(createAgentStateParser(realEstate.qualification)(body([field]))).toEqual({ ok: true, dto: body([field]) });
    });

    it("com a faceta da imobiliária, recusa campo fora da lista", () => {
      expect(createAgentStateParser(realEstate.qualification)(body(["unknown"]))).toEqual({
        ok: false, detail: "Âncora, revisão ou projeção do agente inválida.",
      });
    });

    it("sem faceta, só a lista vazia passa", () => {
      const parse = createAgentStateParser(testVertical.qualification);
      expect(parse(body([]))).toEqual({ ok: true, dto: body([]) });
      for (const field of realEstateFields) {
        expect(parse(body([field]))).toEqual({ ok: false, detail: "Âncora, revisão ou projeção do agente inválida." });
      }
    });

    it("o app entrega a faceta da imobiliária ao parser da rota", () => {
      expect(parseAgentState(body(["modality", "budgetCents"]))).toEqual({ ok: true, dto: body(["modality", "budgetCents"]) });
      expect(parseAgentState(body(["unknown"])).ok).toBe(false);
    });
  });

  describe("publicação do estado do agente", () => {
    const context = { tenantId: "tenant-1" } as Parameters<typeof publishAgentState>[0];

    it("com a faceta da imobiliária, leva campo conhecido à transação e recusa o desconhecido", async () => {
      const publish = createPublishAgentState(realEstate.qualification);
      const known = database();
      await expect(publish(context, anchorMessageId, input(["chainedOperation"]), { database: known.handle })).resolves.toBe("validated");
      expect(known.transaction).toHaveBeenCalledOnce();
      const unknown = database();
      await expect(publish(context, anchorMessageId, input(["unknown"]), { database: unknown.handle })).resolves.toEqual({ ok: false, reason: "invalid-state" });
      expect(unknown.transaction).not.toHaveBeenCalled();
    });

    it("sem faceta, só a lista vazia chega à transação", async () => {
      const publish = createPublishAgentState(testVertical.qualification);
      const empty = database();
      await expect(publish(context, anchorMessageId, input([]), { database: empty.handle })).resolves.toBe("validated");
      const asked = database();
      await expect(publish(context, anchorMessageId, input(["modality"]), { database: asked.handle })).resolves.toEqual({ ok: false, reason: "invalid-state" });
      expect(asked.transaction).not.toHaveBeenCalled();
    });

    it("o app entrega a faceta da imobiliária à publicação", async () => {
      const known = database();
      await expect(publishAgentState(context, anchorMessageId, input(["modality"]), { database: known.handle })).resolves.toBe("validated");
    });
  });
});
