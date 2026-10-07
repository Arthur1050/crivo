import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels } from "../../../db/schema";
import { listCandidates } from "../repository";

const tenantA = randomUUID(), tenantB = randomUUID();
const now = new Date("2026-10-06T15:00:00Z"), hour = 60 * 60 * 1000;
const phoneA = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
const phoneB = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
let contact = 5534999000000;
type LeadPatch = Partial<typeof leads.$inferInsert>;
async function fixture(silence = 22 * hour, patch: LeadPatch = {}, phase: typeof leadAgentState.$inferInsert["phase"] = "qualificando") {
  const tenantId = patch.tenantId ?? tenantA;
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T17", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, createdAt: new Date(now.getTime() - hour), whatsappPhoneNumberId: tenantId === tenantA ? phoneA : phoneB, ...patch }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Conteúdo privado sintético", sentAt: new Date(now.getTime() - silence), whatsappPhoneNumberId: lead.whatsappPhoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase });
  return { lead, conversation, anchor };
}
function run(input: Parameters<typeof listCandidates>[1] = {}, clock = now, tenantId = tenantA) { return listCandidates({ tenantId }, input, { now: () => clock }); }
async function all(clock = now, tenantId = tenantA) {
  const result = await run({}, clock, tenantId);
  if (!result.ok) throw new Error(result.reason);
  return result.candidates;
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantA, tenantB].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T17 candidatos", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(whatsappChannels).values([{ tenantId: tenantA, phoneNumberId: phoneA, ownershipVerifiedAt: now, usageEnabled: false }, { tenantId: tenantB, phoneNumberId: phoneB, ownershipVerifiedAt: now }]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => {
  const ids = [tenantA, tenantB];
  await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids));
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
  await db.delete(messages).where(inArray(messages.tenantId, ids));
  await db.delete(conversations).where(inArray(conversations.tenantId, ids));
  await db.delete(leads).where(inArray(leads.tenantId, ids));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
  await db.delete(tenants).where(inArray(tenants.id, ids));
  await db.$client.end();
});

describe("T17 — candidatos limitados pelo corte do tick", () => {
  it("fronteiras 22h/24h/48h produzem ações distintas, sem contato antes22h", async () => {
    const early = await fixture(22 * hour - 1), prepare = await fixture(), near24 = await fixture(24 * hour - 1), omit = await fixture(24 * hour), escalate = await fixture(48 * hour);
    const rows = await all();
    expect(rows.map((row) => row.leadId)).not.toContain(early.lead.id);
    for (const [row, action] of [[prepare, "prepare"], [near24, "prepare"], [omit, "omit"], [escalate, "escalate"]] as const) {
      expect(rows).toContainEqual({ leadId: row.lead.id, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt.toISOString(), phoneNumberId: phoneA, action });
    }
  });

  it("fora de horário adia prepare, mas não omissão/escalada; sem token ou Analytics", async () => {
    const prepare = await fixture(), omit = await fixture(24 * hour), escalate = await fixture(48 * hour);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    const midnight = new Date("2026-10-07T03:00:00Z");
    // Mesmos silêncios no instante fora do horário.
    for (const [row, silence] of [[prepare, 22 * hour], [omit, 24 * hour], [escalate, 48 * hour]] as const) await db.update(messages).set({ sentAt: new Date(midnight.getTime() - silence) }).where(eq(messages.id, row.anchor.id));
    const rows = await all(midnight);
    expect(rows.map((row) => row.leadId)).not.toContain(prepare.lead.id);
    expect(rows.find((row) => row.leadId === omit.lead.id)?.action).toBe("omit");
    expect(rows.find((row) => row.leadId === escalate.lead.id)?.action).toBe("escalate");
  });

  it.each([null, "encerrada"] as const)("fase %s não seleciona", async (phase) => {
    const row = await fixture(22 * hour, {}, phase);
    expect((await all()).map((item) => item.leadId)).not.toContain(row.lead.id);
  });

  it("estado ausente, âncora antiga e reset não observado não qualificam", async () => {
    const absent = await fixture(), old = await fixture(), reset = await fixture();
    await db.delete(leadAgentState).where(eq(leadAgentState.leadId, absent.lead.id));
    await db.insert(messages).values({ tenantId: tenantA, conversationId: old.conversation.id, sender: "lead", content: "Novo inbound", sentAt: new Date(now.getTime() - 21 * hour) });
    await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, reset.lead.id));
    const ids = (await all()).map((item) => item.leadId);
    for (const row of [absent, old, reset]) expect(ids).not.toContain(row.lead.id);
  });

  it("reset não finito real do Postgres não vira null elegível", async () => {
    const row = await fixture();
    await db.execute(sql`WITH changed AS (
      UPDATE leads SET memory_reset_requested_at = 'infinity'::timestamptz
      WHERE tenant_id = ${tenantA} AND id = ${row.lead.id} RETURNING id
    ) UPDATE lead_agent_state SET reset_observed_at = 'infinity'::timestamptz
      WHERE tenant_id = ${tenantA} AND lead_id IN (SELECT id FROM changed)`);
    expect((await all()).map((item) => item.leadId)).not.toContain(row.lead.id);
  });

  it("canal ausente/estrangeiro/ownership ausente impedem seleção", async () => {
    const absent = await fixture(22 * hour, { whatsappPhoneNumberId: null });
    const foreign = await fixture(22 * hour, { whatsappPhoneNumberId: phoneB });
    const untrustedPhone = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
    await db.insert(whatsappChannels).values({ tenantId: tenantA, phoneNumberId: untrustedPhone });
    const untrusted = await fixture(22 * hour, { whatsappPhoneNumberId: untrustedPhone });
    const ids = (await all()).map((item) => item.leadId);
    for (const row of [absent, foreign, untrusted]) expect(ids).not.toContain(row.lead.id);
  });

  it("âncora sem canal ou com canal conflitante não herda o canal atual da lead", async () => {
    const legacy = await fixture(), changed = await fixture();
    await db.update(messages).set({ whatsappPhoneNumberId: null }).where(eq(messages.id, legacy.anchor.id));
    await db.update(messages).set({ whatsappPhoneNumberId: phoneB }).where(eq(messages.id, changed.anchor.id));
    const ids = (await all()).map((item) => item.leadId);
    expect(ids).not.toContain(legacy.lead.id); expect(ids).not.toContain(changed.lead.id);
  });

  it("preparing com lease viva espera; lease no prazo exato pode preparar", async () => {
    const active = await fixture(), expired = await fixture();
    for (const [row, deadline] of [[active, new Date(now.getTime() + 1)], [expired, now]] as const) await db.insert(reengagementEpisodes).values({ tenantId: tenantA, leadId: row.lead.id, phoneNumberId: phoneA, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt, agentStateRevision: 1, claimToken: randomUUID(), claimExpiresAt: deadline });
    const rows = await all();
    expect(rows.map((row) => row.leadId)).not.toContain(active.lead.id);
    expect(rows.find((row) => row.leadId === expired.lead.id)?.action).toBe("prepare");
  });

  it("marker consumido e estados terminais não voltam para prepare/omit", async () => {
    const consumed = await fixture(), cancelled = await fixture(), alreadyOmitted = await fixture(24 * hour), sentOmit = await fixture(24 * hour);
    for (const [row, state, dispatched] of [[consumed, "uncertain", true], [cancelled, "cancelled", false], [alreadyOmitted, "omitted", false], [sentOmit, "refused", true]] as const) await db.insert(reengagementEpisodes).values({ tenantId: tenantA, leadId: row.lead.id, phoneNumberId: phoneA, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt, agentStateRevision: 1, state, ...(dispatched ? { dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) } : {}) });
    await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, consumed.lead.id));
    await db.update(leadAgentState).set({ resetObservedAt: now, revision: 2 }).where(eq(leadAgentState.leadId, consumed.lead.id));
    const ids = (await all()).map((row) => row.leadId);
    for (const row of [consumed, cancelled, alreadyOmitted, sentOmit]) expect(ids).not.toContain(row.lead.id);
  });

  it("novo inbound real seleciona nova chave sem apagar o despacho anterior", async () => {
    const row = await fixture(23 * hour);
    const [episode] = await db.insert(reengagementEpisodes).values({ tenantId: tenantA, leadId: row.lead.id, phoneNumberId: phoneA, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt, agentStateRevision: 1, state: "uncertain", dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) }).returning();
    const [latest] = await db.insert(messages).values({ tenantId: tenantA, conversationId: row.conversation.id, sender: "lead", content: "Nova âncora real", sentAt: new Date(now.getTime() - 22 * hour), whatsappPhoneNumberId: phoneA }).returning();
    await db.update(leadAgentState).set({ anchorMessageId: latest.id, revision: 2 }).where(eq(leadAgentState.leadId, row.lead.id));
    expect(await all()).toContainEqual({ leadId: row.lead.id, anchorMessageId: latest.id, anchorSentAt: latest.sentAt.toISOString(), phoneNumberId: phoneA, action: "prepare" });
    expect((await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, episode.id)))[0]).toEqual(episode);
  });

  it("48h seleciona despacho consumido; escalado e status humano permanecem protegidos", async () => {
    const consumed = await fixture(48 * hour), done = await fixture(48 * hour), locked = await fixture(48 * hour, { statusChangedBy: "humano" });
    for (const [row, escalatedAt] of [[consumed, null], [done, now]] as const) await db.insert(reengagementEpisodes).values({ tenantId: tenantA, leadId: row.lead.id, phoneNumberId: phoneA, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt, agentStateRevision: 1, state: "uncertain", dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000), escalatedAt });
    const rows = await all();
    expect(rows.find((row) => row.leadId === consumed.lead.id)?.action).toBe("escalate");
    expect(rows.map((row) => row.leadId)).not.toContain(done.lead.id); expect(rows.map((row) => row.leadId)).not.toContain(locked.lead.id);
  });

  it.each([
    { optedOutAt: now }, { humanTakeoverAt: now }, { status: "escalado_humano" as const }, { status: "qualificado_agendado" as const },
  ])("proteção humana/pipeline prevalece %#", async (patch) => {
    const row = await fixture(48 * hour, patch);
    expect((await all()).map((item) => item.leadId)).not.toContain(row.lead.id);
  });

  it("tenant seleciona somente seus IDs, sem conteúdo/destino/frame", async () => {
    const row = await fixture(22 * hour, { tenantId: tenantB });
    expect((await all()).map((item) => item.leadId)).not.toContain(row.lead.id);
    const rows = await all(now, tenantB);
    expect(rows).toEqual([{ leadId: row.lead.id, anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt.toISOString(), phoneNumberId: phoneB, action: "prepare" }]);
    expect(Object.keys(rows[0]).sort()).toEqual(["action", "anchorMessageId", "anchorSentAt", "leadId", "phoneNumberId"]);
    expect(JSON.stringify(rows)).not.toContain(row.lead.externalId!);
    expect(JSON.stringify(rows)).not.toContain("Conteúdo privado sintético");
  });

  it.each([0, 101, 1.5, -1])("limit inválido %s recusa", async (limit) => {
    expect(await run({ limit })).toEqual({ ok: false, reason: "invalid-limit" });
  });

  it("cursor inválido ou de outro tenant recusa", async () => {
    expect(await run({ cursor: "não-cursor" })).toEqual({ ok: false, reason: "invalid-cursor" });
    const first = await run({ limit: 1 });
    expect(first).toMatchObject({ ok: true });
    if (!first.ok || !first.nextCursor) throw new Error("Fixture de continuação ausente");
    expect(await run({ cursor: first.nextCursor }, now, tenantB)).toEqual({ ok: false, reason: "invalid-cursor" });
    const future = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8"));
    future.cutoffAt = new Date(now.getTime() + 1).toISOString();
    expect(await run({ cursor: Buffer.from(JSON.stringify(future)).toString("base64url") })).toEqual({ ok: false, reason: "invalid-cursor" });
  });

  it("tenant ausente recusa sem escrever dados", async () => {
    const missingTenant = randomUUID();
    const before = await db.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(await run({}, now, missingTenant)).toEqual({ ok: false, reason: "tenant-not-found" });
    expect(await db.select().from(tenants).where(eq(tenants.id, missingTenant))).toEqual([]);
    expect(await db.select().from(leads).where(eq(leads.tenantId, tenantA))).toEqual(before);
  });

  it("página vazia avança por ID; relógio seguinte mantém corte sem perder candidato", async () => {
    const isolatedTenant = randomUUID();
    await db.insert(tenants).values({ id: isolatedTenant, slug: `fixture-${isolatedTenant}`, name: "Fixture T17 cursor", agentName: "Agente", supportedModality: "ambos" });
    const isolatedPhone = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
    await db.insert(whatsappChannels).values({ tenantId: isolatedTenant, phoneNumberId: isolatedPhone, ownershipVerifiedAt: now });
    try {
      const firstId = "00000000-0000-4000-8000-000000000001", secondId = "00000000-0000-4000-8000-000000000002";
      await fixture(22 * hour, { tenantId: isolatedTenant, id: firstId, whatsappPhoneNumberId: isolatedPhone }, null);
      const visible = await fixture(24 * hour - 1, { tenantId: isolatedTenant, id: secondId, whatsappPhoneNumberId: isolatedPhone });
      const first = await run({ limit: 1 }, now, isolatedTenant);
      expect(first).toMatchObject({ ok: true, candidates: [], cutoffAt: now });
      if (!first.ok || !first.nextCursor) throw new Error("Cursor vazio inesperado");
      const nextClock = new Date(now.getTime() + 1);
      const added = await fixture(22 * hour, { tenantId: isolatedTenant, id: "00000000-0000-4000-8000-000000000003", whatsappPhoneNumberId: isolatedPhone, createdAt: nextClock });
      const second = await run({ cursor: first.nextCursor, limit: 1 }, new Date(now.getTime() + 1), isolatedTenant);
      expect(second).toEqual({ ok: true, candidates: [{ leadId: visible.lead.id, anchorMessageId: visible.anchor.id, anchorSentAt: visible.anchor.sentAt.toISOString(), phoneNumberId: isolatedPhone, action: "prepare" }], cutoffAt: now, nextCursor: null });
      expect(await run({}, nextClock, isolatedTenant)).toEqual({ ok: true, candidates: [
        { leadId: visible.lead.id, anchorMessageId: visible.anchor.id, anchorSentAt: visible.anchor.sentAt.toISOString(), phoneNumberId: isolatedPhone, action: "omit" },
        { leadId: added.lead.id, anchorMessageId: added.anchor.id, anchorSentAt: added.anchor.sentAt.toISOString(), phoneNumberId: isolatedPhone, action: "prepare" },
      ], cutoffAt: nextClock, nextCursor: null });
    } finally {
      await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, isolatedTenant));
      await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, isolatedTenant)); await db.delete(messages).where(eq(messages.tenantId, isolatedTenant));
      await db.delete(conversations).where(eq(conversations.tenantId, isolatedTenant)); await db.delete(leads).where(eq(leads.tenantId, isolatedTenant));
      await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, isolatedTenant)); await db.delete(tenants).where(eq(tenants.id, isolatedTenant));
    }
  });

  it("100 candidatos por página e leitura limitada mesmo com inelegíveis", async () => {
    const isolatedTenant = randomUUID(), isolatedPhone = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
    await db.insert(tenants).values({ id: isolatedTenant, slug: `fixture-${isolatedTenant}`, name: "Fixture T17 limite", agentName: "Agente", supportedModality: "ambos" });
    await db.insert(whatsappChannels).values({ tenantId: isolatedTenant, phoneNumberId: isolatedPhone, ownershipVerifiedAt: now });
    try {
      const bulkLeads = await db.insert(leads).values(Array.from({ length: 102 }, () => ({ id: randomUUID(), tenantId: isolatedTenant, name: "Fixture limitado", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao" as const, firstContactAt: now, createdAt: new Date(now.getTime() - hour), whatsappPhoneNumberId: isolatedPhone }))).returning();
      const bulkConversations = await db.insert(conversations).values(bulkLeads.map((lead) => ({ tenantId: isolatedTenant, leadId: lead.id }))).returning();
      const anchors = await db.insert(messages).values(bulkConversations.map((conversation) => ({ tenantId: isolatedTenant, conversationId: conversation.id, sender: "lead" as const, content: "Fixture privado", sentAt: new Date(now.getTime() - 22 * hour), whatsappPhoneNumberId: isolatedPhone }))).returning();
      await db.insert(leadAgentState).values(bulkConversations.map((conversation) => ({ tenantId: isolatedTenant, leadId: conversation.leadId, anchorMessageId: anchors.find((anchor) => anchor.conversationId === conversation.id)!.id, phase: "qualificando" as const })));
      const query = vi.spyOn(db.$client, "query");
      const first = await run({ limit: 100 }, now, isolatedTenant);
      expect(query).toHaveBeenCalledTimes(2);
      expect((await query.mock.results[1].value).rows).toHaveLength(101);
      if (!first.ok || !first.nextCursor) throw new Error("Primeira página ausente");
      expect(first.candidates).toHaveLength(100);
      const second = await run({ cursor: first.nextCursor, limit: 100 }, now, isolatedTenant);
      if (!second.ok) throw new Error(second.reason);
      expect(second.candidates).toHaveLength(2); expect(second.nextCursor).toBeNull();
      expect([...first.candidates, ...second.candidates].map((row) => row.leadId).sort()).toEqual(bulkLeads.map((row) => row.id).sort());
      await db.update(leadAgentState).set({ phase: null }).where(eq(leadAgentState.tenantId, isolatedTenant));
      query.mockClear();
      const ineligible = await run({ limit: 100 }, now, isolatedTenant);
      expect(ineligible).toMatchObject({ ok: true, candidates: [] });
      if (!ineligible.ok) throw new Error(ineligible.reason);
      expect(ineligible.nextCursor).not.toBeNull();
      expect(query).toHaveBeenCalledTimes(2);
      expect((await query.mock.results[1].value).rows).toHaveLength(101);
    } finally {
      vi.restoreAllMocks();
      await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, isolatedTenant));
      await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, isolatedTenant)); await db.delete(messages).where(eq(messages.tenantId, isolatedTenant));
      await db.delete(conversations).where(eq(conversations.tenantId, isolatedTenant)); await db.delete(leads).where(eq(leads.tenantId, isolatedTenant));
      await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, isolatedTenant)); await db.delete(tenants).where(eq(tenants.id, isolatedTenant));
    }
  });
});

describe("escalada independe da fase publicada e do canal verificado (auditoria L14b, M1)", () => {
  const phoneUnverified = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  beforeAll(async () => { await db.insert(whatsappChannels).values({ tenantId: tenantA, phoneNumberId: phoneUnverified }); });
  async function mine(ids: string[]) {
    const found = []; let cursor: string | null = null;
    do {
      const page = await run(cursor ? { cursor } : {});
      if (!page.ok) throw new Error(page.reason);
      found.push(...page.candidates.filter((candidate) => ids.includes(candidate.leadId))); cursor = page.nextCursor;
    } while (cursor);
    return found;
  }

  it("fase não publicada no inbound atual: escalate e omit entram; prepare não", async () => {
    const late = await fixture(48 * hour, {}, null), open = await fixture(23 * hour, {}, null), closed = await fixture(30 * hour, {}, null);
    expect(await mine([late, open, closed].map((row) => row.lead.id))).toEqual(expect.arrayContaining([
      { leadId: late.lead.id, anchorMessageId: late.anchor.id, anchorSentAt: late.anchor.sentAt.toISOString(), phoneNumberId: phoneA, action: "escalate" },
      { leadId: closed.lead.id, anchorMessageId: closed.anchor.id, anchorSentAt: closed.anchor.sentAt.toISOString(), phoneNumberId: phoneA, action: "omit" },
    ]));
    expect((await mine([open.lead.id]))).toEqual([]);
  });

  it("canal não verificado ou ausente: só escalate entra, com phoneNumberId null", async () => {
    const unverifiedLate = await fixture(48 * hour, { whatsappPhoneNumberId: phoneUnverified }), unverifiedClosed = await fixture(30 * hour, { whatsappPhoneNumberId: phoneUnverified });
    const noChannel = await fixture(49 * hour, { whatsappPhoneNumberId: null });
    const found = await mine([unverifiedLate, unverifiedClosed, noChannel].map((row) => row.lead.id));
    expect(found).toHaveLength(2);
    expect(found).toEqual(expect.arrayContaining([
      expect.objectContaining({ leadId: unverifiedLate.lead.id, phoneNumberId: null, action: "escalate" }),
      expect.objectContaining({ leadId: noChannel.lead.id, phoneNumberId: null, action: "escalate" }),
    ]));
  });

  it("sem projeção do inbound atual (lead anterior ao L14b) não escala por este caminho", async () => {
    const legacy = await fixture(72 * hour);
    await db.delete(leadAgentState).where(eq(leadAgentState.leadId, legacy.lead.id));
    const stale = await fixture(72 * hour);
    await db.insert(messages).values({ tenantId: tenantA, conversationId: stale.conversation.id, sender: "lead", content: "Inbound mais novo sem projeção",
      sentAt: new Date(now.getTime() - 50 * hour), whatsappPhoneNumberId: phoneA });
    expect(await mine([legacy.lead.id, stale.lead.id])).toEqual([]);
  });
});
