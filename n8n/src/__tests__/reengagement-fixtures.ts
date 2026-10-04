import type { PreparationFrame } from "../../../src/server/reengagement/context";
export function reengagementFixtureFrame(): PreparationFrame {
  return { tenantId: "tenant", leadId: "lead", episodeId: "episode", phoneNumberId: "123", channelRevision: 1, preparedAt: "2026-10-02T12:00:00Z", anchor: { id: "a", sentAt: "2026-10-02T10:00:00Z" }, resetObservedAt: null,
    agent: { phase: "qualificando", revision: 2, askedFields: [], openingHistory: ["Vamos retomar"] },
    facts: { name: "Pessoa Fixture", modality: "novo", region: "Centro", propertyType: null, budgetCents: "0", purchaseHorizon: null, motivation: null, creditStatus: null, chainedOperation: false, executiveSummary: "Nota factual da equipe" }, pendingField: "modality", origin: { startMessageId: "a", endMessageId: "a" },
    history: [{ id: "a", sender: "lead", content: "Quero novo no Centro", sentAt: "2026-10-02T10:00:00Z" }, { id: "b", sender: "humano", authorName: "Ana", content: "Conversamos sobre a região", sentAt: "2026-10-02T11:00:00Z" }, { id: "c", sender: "agente", content: "Seguimos por aqui", sentAt: "2026-10-02T11:01:00Z" }] };
}
