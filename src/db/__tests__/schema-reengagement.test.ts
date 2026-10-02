import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import { conversations, leads, messages, reengagementEpisodes, tenants, whatsappChannels } from "../schema";

function pgCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as { code?: unknown; cause?: unknown };
  return typeof record.code === "string" ? record.code : pgCode(record.cause);
}
async function codeOf(promise: Promise<unknown>) {
  try { await promise; return undefined; } catch (error) { return pgCode(error); }
}

describe("T4 — episódio durável (REEN-03 AC8; L14B-01 AC3; Done when T4)", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const anchorSentAt = new Date("2026-10-01T12:00:00Z");
  const dispatchAuthorizedAt = new Date("2026-10-02T10:00:00Z");
  const dispatchCompletionDeadline = new Date("2026-10-02T10:02:00Z");
  const acceptedAt = new Date("2026-10-02T10:00:01Z");
  const dispatch = { dispatchAuthorizedAt, dispatchCompletionDeadline };
  let foreign: Awaited<ReturnType<typeof fixture>>;

  beforeAll(async () => {
    await db.insert(tenants).values([tenantA, tenantB].map((id) => ({
      id, slug: `fixture-${id}`, name: "Fixture episódio", agentName: "Agente", supportedModality: "ambos" as const,
    })));
    foreign = await fixture(tenantB);
  });
  afterAll(async () => {
    const ids = [tenantA, tenantB];
    await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids));
    await db.delete(messages).where(inArray(messages.tenantId, ids));
    await db.delete(conversations).where(inArray(conversations.tenantId, ids));
    await db.delete(leads).where(inArray(leads.tenantId, ids));
    await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
    await db.delete(tenants).where(inArray(tenants.id, ids));
    await db.$client.end();
  });
  async function fixture(tenantId = tenantA) {
    const [lead] = await db.insert(leads).values({ tenantId, name: "Lead episódio", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: anchorSentAt }).returning();
    const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
    const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Histórico somente no CRM", sentAt: anchorSentAt }).returning();
    const phoneNumberId = `fixture-${randomUUID()}`;
    await db.insert(whatsappChannels).values({ tenantId, phoneNumberId });
    return { tenantId, leadId: lead.id, phoneNumberId, anchorMessageId: anchor.id, anchorSentAt, agentStateRevision: 1 };
  }

  it("chave única tenant/lead/canal/âncora exclui reset e mantém uma tentativa", async () => {
    const input = await fixture();
    await db.insert(reengagementEpisodes).values(input);
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...input, resetObservedAt: new Date() }))).toBe("23505");
    expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, input.leadId))).toHaveLength(1);
  });

  it("FKs compostas recusam lead, canal e âncora de outro tenant sem linha parcial", async () => {
    for (const field of ["leadId", "phoneNumberId", "anchorMessageId"] as const) {
      const input = { ...await fixture(), [field]: foreign[field] };
      expect(await codeOf(db.insert(reengagementEpisodes).values(input))).toBe("23503");
      expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.anchorMessageId, input.anchorMessageId))).toHaveLength(0);
    }
  });

  it("claim UUID e validade são pareados; preparação começa sem despacho", async () => {
    const input = await fixture();
    const claimToken = randomUUID();
    const claimExpiresAt = new Date("2026-10-02T10:05:00Z");
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...input, claimToken }))).toBe("23514");
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...input, claimExpiresAt }))).toBe("23514");
    const [row] = await db.insert(reengagementEpisodes).values({ ...input, claimToken, claimExpiresAt }).returning();
    expect(row.state).toBe("preparing");
    expect(row.claimToken).toBe(claimToken);
    expect(row.claimExpiresAt).toEqual(claimExpiresAt);
    expect(row.dispatchAuthorizedAt).toBeNull();
    expect(row.submittedText).toBeNull();
  });

  it("preserva os oito resultados aprovados e recusa estado inventado ou despacho incompleto", async () => {
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...await fixture(), state: "queued" as never }))).toBe("22P02");
    for (const state of ["preparing", "cancelled", "omitted", "authorized", "accepted_pending_record", "accepted", "refused", "uncertain"] as const) {
      const sent = !["preparing", "cancelled", "omitted"].includes(state);
      const accepted = state === "accepted" || state === "accepted_pending_record";
      const [row] = await db.insert(reengagementEpisodes).values({ ...await fixture(), state, ...(sent ? dispatch : {}), ...(accepted ? { acceptedAt, wamid: `wamid.fixture.${state}` } : {}), reasonCode: `fixture-${state}` }).returning();
      expect(row.state).toBe(state);
      expect(row.reasonCode).toBe(`fixture-${state}`);
      expect(row.dispatchAuthorizedAt).toEqual(sent ? dispatchAuthorizedAt : null);
    }
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...await fixture(), state: "uncertain" }))).toBe("23514");
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...await fixture(), state: "authorized", dispatchAuthorizedAt }))).toBe("23514");
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...await fixture(), ...dispatch, state: "omitted" }))).toBe("23514");
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...await fixture(), ...dispatch, state: "accepted_pending_record" }))).toBe("23514");
    expect(await codeOf(db.insert(reengagementEpisodes).values({ ...await fixture(), ...dispatch, state: "accepted", acceptedAt, wamid: " " }))).toBe("23514");
  });

  it("reset/revisão não rearma a chave nem perde a evidência de recusa/incerteza", async () => {
    for (const state of ["refused", "uncertain"] as const) {
      const input = await fixture();
      const [episode] = await db.insert(reengagementEpisodes).values({ ...input, ...dispatch, state, reasonCode: "fixture-result" }).returning();
      const resetObservedAt = new Date("2026-10-02T11:00:00Z");
      const [row] = await db.update(reengagementEpisodes).set({ resetObservedAt, agentStateRevision: 2, bridgeRevision: 2, bridgeInvalidatedAt: resetObservedAt }).where(eq(reengagementEpisodes.id, episode.id)).returning();
      expect(row.state).toBe(state);
      expect(row.dispatchAuthorizedAt).toEqual(dispatchAuthorizedAt);
      expect(row.reasonCode).toBe("fixture-result");
      expect(row.resetObservedAt).toEqual(resetObservedAt);
      expect(await codeOf(db.insert(reengagementEpisodes).values({ ...input, resetObservedAt, agentStateRevision: 2 }))).toBe("23505");
    }
  });

  it("escalonamento tem resultado/motivo separados do despacho e da ponte", async () => {
    const escalatedAt = new Date("2026-10-03T12:00:00Z");
    for (const state of ["accepted", "refused", "uncertain", "omitted"] as const) {
      const [row] = await db.insert(reengagementEpisodes).values({ ...await fixture(), state, ...(state !== "omitted" ? dispatch : {}), ...(state === "accepted" ? { acceptedAt, wamid: "wamid.fixture.escalated" } : {}), escalatedAt, escalationResult: "escalado_humano", escalationReasonCode: `no-response-${state}` }).returning();
      expect(row.state).toBe(state);
      expect(row.escalatedAt).toEqual(escalatedAt);
      expect(row.escalationResult).toBe("escalado_humano");
      expect(row.escalationReasonCode).toBe(`no-response-${state}`);
      expect(row.bridgeInvalidatedAt).toBeNull();
    }
  });

  it("refs opcionais recusam mensagens estrangeiras; nenhuma ponte cruza tenant", async () => {
    for (const field of ["messageId", "originSessionStartMessageId", "originSessionEndMessageId", "firstInboundMessageId"] as const) {
      const input = { ...await fixture(), [field]: foreign.anchorMessageId };
      expect(await codeOf(db.insert(reengagementEpisodes).values(input))).toBe("23503");
      expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, input.leadId))).toHaveLength(0);
    }
  });

  it("limpeza de refs permite excluir saída/origem/inbound sem apagar episódio consumido", async () => {
    const input = await fixture();
    const [anchor] = await db.select().from(messages).where(eq(messages.id, input.anchorMessageId));
    const refs = await db.insert(messages).values(["saida", "inicio", "fim", "inbound"].map((content) => ({ tenantId: tenantA, conversationId: anchor.conversationId, sender: "agente" as const, content: `Conteúdo só no CRM ${content}` }))).returning();
    const [episode] = await db.insert(reengagementEpisodes).values({ ...input, ...dispatch, state: "accepted", acceptedAt, wamid: "wamid.fixture.retained", messageId: refs[0].id, originSessionStartMessageId: refs[1].id, originSessionEndMessageId: refs[2].id, firstInboundMessageId: refs[3].id }).returning();
    for (const ref of refs) expect(await codeOf(db.delete(messages).where(eq(messages.id, ref.id)))).toBe("23503");
    await db.transaction(async (tx) => {
      await tx.update(reengagementEpisodes).set({ messageId: null, originSessionStartMessageId: null, originSessionEndMessageId: null, firstInboundMessageId: null }).where(eq(reengagementEpisodes.id, episode.id));
      await tx.delete(messages).where(inArray(messages.id, refs.map((ref) => ref.id)));
    });
    const [row] = await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, episode.id));
    expect(row.tenantId).toBe(tenantA);
    expect(row.anchorMessageId).toBe(input.anchorMessageId);
    expect(row.state).toBe("accepted");
    expect(row.dispatchAuthorizedAt).toEqual(dispatchAuthorizedAt);
    expect(row.wamid).toBe("wamid.fixture.retained");
    expect([row.messageId, row.originSessionStartMessageId, row.originSessionEndMessageId, row.firstInboundMessageId]).toEqual([null, null, null, null]);
    expect(JSON.stringify(row)).not.toContain("Conteúdo só no CRM");
    expect(await codeOf(db.insert(reengagementEpisodes).values(input))).toBe("23505");
  });

  it("exclusão isolada de âncora/canal é bloqueada e preserva consumo e outro tenant", async () => {
    const input = await fixture();
    const [own] = await db.insert(reengagementEpisodes).values({ ...input, ...dispatch, state: "uncertain" }).returning();
    const [other] = await db.insert(reengagementEpisodes).values(foreign).returning();
    expect(await codeOf(db.delete(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, input.phoneNumberId)))).toBe("23503");
    expect(await codeOf(db.delete(messages).where(eq(messages.id, input.anchorMessageId)))).toBe("23503");
    expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, own.id))).toEqual([own]);
    expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, other.id))).toEqual([other]);
  });

  it("revisões observadas e da ponte são positivas", async () => {
    for (const patch of [{ agentStateRevision: 0 }, { bridgeRevision: 0 }, { agentStateRevision: -1 }, { bridgeRevision: -1 }]) {
      expect(await codeOf(db.insert(reengagementEpisodes).values({ ...await fixture(), ...patch }))).toBe("23514");
    }
    const [row] = await db.insert(reengagementEpisodes).values({ ...await fixture(), agentStateRevision: 2, bridgeRevision: 3 }).returning();
    expect(row.agentStateRevision).toBe(2);
    expect(row.bridgeRevision).toBe(3);
  });
});
