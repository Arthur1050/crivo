import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { conversations, leadAgentState, leads, messages, tenants } from "../schema";

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  return typeof record.code === "string" ? record.code : pgCode(record.cause);
}
async function codeOf(promise: Promise<unknown>) {
  try { await promise; return undefined; } catch (error) { return pgCode(error); }
}
describe("T3 — projeção mínima, desconhecida até sincronização (REEN-01 AC6; Done when T3)", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let leadB: string;
  let anchorB: string;
  beforeAll(async () => {
    await db.insert(tenants).values([tenantA, tenantB].map((id) => ({
      id, slug: `fixture-${id}`, name: "Fixture estado agente", agentName: "Agente", supportedModality: "ambos" as const,
    })));
    const fixture = await createAnchor(tenantB);
    leadB = fixture.leadId; anchorB = fixture.anchorMessageId;
  });
  afterAll(async () => {
    const ids = [tenantA, tenantB];
    await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
    await db.delete(messages).where(inArray(messages.tenantId, ids));
    await db.delete(conversations).where(inArray(conversations.tenantId, ids));
    await db.delete(leads).where(inArray(leads.tenantId, ids));
    await db.delete(tenants).where(inArray(tenants.id, ids));
    await db.$client.end();
  });
  async function createAnchor(tenantId = tenantA) {
    const [lead] = await db.insert(leads).values({ tenantId, name: "Lead estado", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: new Date() }).returning();
    const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
    const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Fixture inbound" }).returning();
    return { tenantId, leadId: lead.id, anchorMessageId: anchor.id };
  }

  it("um único estado por tenant/lead; replay estrutural não cria segunda linha", async () => {
    const input = await createAnchor();
    await db.insert(leadAgentState).values(input);
    expect(await codeOf(db.insert(leadAgentState).values(input))).toBe("23505");
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, input.leadId))).toHaveLength(1);
  });

  it("FK composta recusa lead do outro tenant e não escreve estado parcial", async () => {
    const input = { ...await createAnchor(), leadId: leadB };
    expect(await codeOf(db.insert(leadAgentState).values(input))).toBe("23503");
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, leadB))).toHaveLength(0);
  });

  it("fase inicia nullable; desconhecida não vira qualificando por suposição", async () => {
    const input = await createAnchor();
    const [row] = await db.insert(leadAgentState).values(input).returning();
    expect(row.phase).toBeNull();
    expect(row.askedFields).toEqual([]);
    expect(row.openingHistory).toEqual([]);
    expect(row.resetObservedAt).toBeNull();
    expect(row.revision).toBe(1);
  });

  it("recusa enum inválido e aceita fases já definidas", async () => {
    expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), phase: "inventada" as never }))).toBe("22P02");
    for (const phase of ["qualificando", "agendando", "encerrada"] as const) {
      const [row] = await db.insert(leadAgentState).values({ ...await createAnchor(), phase }).returning();
      expect(row.phase).toBe(phase);
    }
  });

  it("aceita 8 nomes conhecidos; recusa 9 campos e nome desconhecido", async () => {
    const fields = [
      "modality", "region", "propertyType", "budgetCents",
      "purchaseHorizon", "motivation", "creditStatus", "chainedOperation",
    ];
    const [row] = await db.insert(leadAgentState).values({ ...await createAnchor(), askedFields: fields }).returning();
    expect(row.askedFields).toEqual(fields);
    expect(row.askedFields).toHaveLength(8);
    expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), askedFields: [...fields, fields[0]] }))).toBe("23514");
    expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), askedFields: ["campoInventado"] }))).toBe("23514");
  });

  it("FK composta da âncora recusa mensagem ausente ou de outro tenant", async () => {
    for (const anchorMessageId of [randomUUID(), anchorB]) {
      const input = { ...await createAnchor(), anchorMessageId };
      expect(await codeOf(db.insert(leadAgentState).values(input))).toBe("23503");
      expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, input.leadId))).toHaveLength(0);
    }
  });

  it("preserva revisão/reset e estado de aberturas; revisão zero é inválida", async () => {
    const resetObservedAt = new Date("2026-10-02T12:00:00Z");
    const [row] = await db.insert(leadAgentState).values({ ...await createAnchor(), revision: 2, resetObservedAt, openingHistory: ["hmm", "certo"] }).returning();
    expect(row.revision).toBe(2);
    expect(row.resetObservedAt).toEqual(resetObservedAt);
    expect(row.openingHistory).toEqual(["hmm", "certo"]);
    expect(await codeOf(db.insert(leadAgentState).values({ ...await createAnchor(), revision: 0 }))).toBe("23514");
  });
});
