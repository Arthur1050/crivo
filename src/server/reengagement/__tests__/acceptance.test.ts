import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import * as cloudApi from "../../whatsapp/cloud-api";
import { authorizeDispatch, claimPreparation, reconcileAcceptance } from "../repository";

const tenantId = randomUUID(), foreignTenant = randomUUID(), now = new Date("2026-10-06T15:00:00.500Z");
const acceptedAt = new Date(now.getTime() + 1000); let contact = 5534999400000;
async function fixture(authorize = true) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), wamid = `fixture-${randomUUID()}`;
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T21", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Inbound próprio T21", sentAt: new Date(now.getTime() - 22 * 3600000), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const claim = await claimPreparation({ tenantId }, lead.id, { anchorMessageId: anchor.id }, { now: () => now });
  if (!claim.ok || !claim.acquired) throw new Error("Fixture sem claim");
  await db.update(reengagementEpisodes).set({ originSessionStartMessageId: anchor.id, originSessionEndMessageId: anchor.id }).where(eq(reengagementEpisodes.id, claim.episodeId));
  if (authorize) {
    const result = await authorizeDispatch({ tenantId }, lead.id, claim.episodeId, { claimToken: claim.claimToken, text: "Texto efetivamente submetido" }, { expectedChannelRevision: 1, now: () => now });
    if (!result.ok || !result.authorized) throw new Error("Fixture sem autorização");
  }
  return { lead, conversation, anchor, phoneNumberId, wamid, ...claim };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function ack(row: Fixture, input: Parameters<typeof reconcileAcceptance>[3] = { wamid: row.wamid, acceptedAt }, database?: Pick<typeof db, "transaction">) {
  return reconcileAcceptance({ tenantId }, row.lead.id, row.episodeId, input, { now: () => acceptedAt, database });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
async function outputs(row: Fixture) { return db.select().from(messages).where(eq(messages.externalId, row.wamid)); }
// Simula somente a parcela do writer T27: ordem factual de persistência sob lock.
async function candidate(row: Fixture, sentAt = new Date("2026-10-06T15:00:00.000Z"), invalidateState = false) {
  return db.transaction(async (tx) => {
    await tx.select().from(leads).where(eq(leads.id, row.lead.id)).for("update");
    const [current] = await tx.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)).for("update");
    const [first] = await tx.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "lead", content: "Resposta própria", sentAt, whatsappPhoneNumberId: row.phoneNumberId }).returning();
    if (!current.firstInboundMessageId) await tx.update(reengagementEpisodes).set({ firstInboundMessageId: first.id }).where(eq(reengagementEpisodes.id, row.episodeId));
    if (invalidateState) await tx.update(reengagementEpisodes).set({ bridgeLastInboundAt: sentAt }).where(eq(reengagementEpisodes.id, row.episodeId));
    if (invalidateState) await tx.update(leadAgentState).set({ phase: null, anchorMessageId: first.id, revision: sql`${leadAgentState.revision} + 1` }).where(eq(leadAgentState.leadId, row.lead.id));
    return first;
  });
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema }); return { transaction: (callback, config) => database.transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
}
beforeAll(async () => { await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T21", agentName: "Agente", supportedModality: "ambos" as const }))); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => {
  await db.delete(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantId));
  await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId)); await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId));
  await db.delete(messages).where(eq(messages.tenantId, tenantId)); await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId)); await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.$client.end();
});

describe("T21 — aceite transacional sem reenvio", () => {
  it("grava texto real, autoria, identidade e ponte sem alterar lead/inbound/projeção", async () => {
    const row = await fixture(), before = await episode(row), agent = await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id));
    const transport = vi.spyOn(cloudApi, "sendWhatsAppText"), result = await ack(row);
    expect(result).toMatchObject({ ok: true, recorded: true, replay: false, episodeId: row.episodeId });
    if (!result.ok || !result.recorded) throw new Error("Mensagem não gravada");
    expect(await outputs(row)).toEqual([{ id: result.messageId, tenantId, conversationId: row.conversation.id, sender: "agente", content: "Texto efetivamente submetido", sentAt: acceptedAt, externalId: row.wamid, whatsappPhoneNumberId: row.phoneNumberId, authorUserId: null, authorName: null }]);
    expect(await episode(row)).toEqual({ ...before, state: "accepted", acceptedAt, wamid: row.wamid, messageId: result.messageId, updatedAt: acceptedAt });
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(row.lead);
    expect((await db.select().from(messages).where(eq(messages.id, row.anchor.id)))[0]).toEqual(row.anchor);
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id))).toEqual(agent); expect(transport).not.toHaveBeenCalled();
  });
  it("replay preserva acceptedAt/messageId/texto e não envia", async () => {
    const row = await fixture(), first = await ack(row); expect(first).toMatchObject({ ok: true, recorded: true, replay: false });
    const before = await episode(row), transport = vi.spyOn(cloudApi, "sendWhatsAppText");
    expect(await ack(row, { wamid: row.wamid, acceptedAt: new Date(acceptedAt.getTime() + 1000) })).toEqual(first.ok && first.recorded ? { ...first, replay: true } : first);
    expect(await episode(row)).toEqual(before); expect(await outputs(row)).toHaveLength(1); expect(transport).not.toHaveBeenCalled();
  });
  it("falha após toda persistência faz rollback de mensagem/recibo/ponte; ack retenta só banco", async () => {
    const row = await fixture(), before = await episode(row);
    await db.insert(whatsappMessageReceipts).values({ tenantId, phoneNumberId: row.phoneNumberId, wamid: row.wamid, orphanExpiresAt: new Date(now.getTime() + 86400000) });
    const receiptBefore = await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.wamid));
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(ack(row, undefined, database)).rejects.toThrow("fixture-rollback");
    expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual([]);
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.wamid))).toEqual(receiptBefore);
    expect(await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => now })).toEqual({ ok: true, acquired: false, episodeId: row.episodeId, state: "authorized" });
    const result = await ack(row); expect(result).toMatchObject({ ok: true, recorded: true }); expect(await outputs(row)).toHaveLength(1);
  });
  it("status órfão liga à mensagem real preservando classificação", async () => {
    const row = await fixture();
    await db.insert(whatsappMessageReceipts).values({ tenantId, phoneNumberId: row.phoneNumberId, wamid: row.wamid, classification: "free_service", deliveredAt: acceptedAt, orphanExpiresAt: new Date(now.getTime() + 86400000) });
    const result = await ack(row); if (!result.ok || !result.recorded) throw new Error("Aceite ausente");
    expect((await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.wamid)))[0]).toMatchObject({ messageId: result.messageId, orphanExpiresAt: null, classification: "free_service", deliveredAt: acceptedAt });
  });
  it("accepted_pending_record usa wamid/acceptedAt duráveis e é idempotente", async () => {
    const row = await fixture(); await db.update(reengagementEpisodes).set({ state: "accepted_pending_record", wamid: row.wamid, acceptedAt }).where(eq(reengagementEpisodes.id, row.episodeId));
    const transport = vi.spyOn(cloudApi, "sendWhatsAppText"), first = await ack(row, { wamid: row.wamid, acceptedAt: new Date(acceptedAt.getTime() + 1000) });
    expect(first).toMatchObject({ ok: true, recorded: true, replay: false });
    expect(await ack(row, {})).toEqual(first.ok && first.recorded ? { ...first, replay: true } : first);
    expect(await episode(row)).toMatchObject({ state: "accepted", wamid: row.wamid, acceptedAt, dispatchAuthorizedAt: now }); expect(await outputs(row)).toHaveLength(1); expect(transport).not.toHaveBeenCalled();
  });
  it("wamid perdido fica incerto sem mensagem nem marker liberado", async () => {
    const row = await fixture(), before = await episode(row), transport = vi.spyOn(cloudApi, "sendWhatsAppText");
    expect(await ack(row, {})).toEqual({ ok: true, recorded: false, episodeId: row.episodeId, state: "uncertain" });
    expect(await episode(row)).toEqual({ ...before, state: "uncertain", reasonCode: "acceptance-identity-missing", updatedAt: acceptedAt }); expect(await outputs(row)).toEqual([]);
    expect(await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => now })).toEqual({ ok: true, acquired: false, episodeId: row.episodeId, state: "uncertain" }); expect(transport).not.toHaveBeenCalled();
  });
  it("wamid divergente de aceite durável recusa sem escrita", async () => {
    const row = await fixture(); expect(await ack(row)).toMatchObject({ ok: true, recorded: true }); const before = await episode(row);
    expect(await ack(row, { wamid: `different-${randomUUID()}`, acceptedAt })).toEqual({ ok: false, reason: "identity-conflict" }); expect(await episode(row)).toEqual(before); expect(await outputs(row)).toHaveLength(1);
  });
  it("wamid já existente em outra lead não associa nem modifica saída", async () => {
    const row = await fixture(), other = await fixture(), before = await episode(row);
    const [existing] = await db.insert(messages).values({ tenantId, conversationId: other.conversation.id, sender: "agente", content: "Outra saída", sentAt: acceptedAt, externalId: row.wamid, whatsappPhoneNumberId: other.phoneNumberId }).returning();
    const threadBefore = await db.select().from(messages).where(inArray(messages.conversationId, [row.conversation.id, other.conversation.id])).orderBy(messages.id);
    expect(await ack(row)).toEqual({ ok: false, reason: "identity-conflict" }); expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual([existing]);
    expect(await db.select().from(messages).where(inArray(messages.conversationId, [row.conversation.id, other.conversation.id])).orderBy(messages.id)).toEqual(threadBefore);
  });
  it.each(["sender", "text", "channel"])("identidade existente com %s incompatível não modifica thread/episódio", async (kind) => {
    const row = await fixture(), before = await episode(row);
    await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: kind === "sender" ? "lead" : "agente",
      content: kind === "text" ? "Texto divergente" : "Texto efetivamente submetido", sentAt: acceptedAt, externalId: row.wamid,
      whatsappPhoneNumberId: kind === "channel" ? null : row.phoneNumberId });
    const thread = await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(messages.id);
    expect(await ack(row)).toEqual({ ok: false, reason: "identity-conflict" }); expect(await episode(row)).toEqual(before);
    expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(messages.id)).toEqual(thread);
  });
  it("inbound persistido antes do despacho cancela; ack não presume aceite", async () => {
    const row = await fixture(false); await candidate(row);
    expect(await authorizeDispatch({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text: "Texto" }, { expectedChannelRevision: 1, now: () => now })).toEqual({ ok: false, reason: "context-changed" });
    const before = await episode(row); expect(await ack(row)).toEqual({ ok: false, reason: "not-authorized" }); expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual([]);
  });
  it("candidato pós-autorização no mesmo segundo Meta aplica ponte sem comparar ms", async () => {
    const row = await fixture(), first = await candidate(row);
    expect(first.sentAt.getTime()).toBeLessThan(now.getTime()); expect(await ack(row)).toMatchObject({ ok: true, recorded: true });
    expect(await episode(row)).toMatchObject({ state: "accepted", firstInboundMessageId: first.id, bridgeLastInboundAt: first.sentAt, bridgeInvalidatedAt: null, bridgeRevision: 1, dispatchAuthorizedAt: now });
    expect((await db.select().from(messages).where(eq(messages.id, first.id)))[0]).toEqual(first);
  });
  it("candidato factual com fase invalidada na nova âncora mantém ponte no aceite", async () => {
    const row = await fixture(), first = await candidate(row, new Date("2026-10-06T15:00:00.000Z"), true);
    const state = await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id));
    expect(state[0]).toMatchObject({ phase: null, anchorMessageId: first.id, revision: 2, resetObservedAt: null });
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true });
    expect(await episode(row)).toMatchObject({ firstInboundMessageId: first.id, bridgeLastInboundAt: first.sentAt, bridgeInvalidatedAt: null, bridgeRevision: 1, state: "accepted" });
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id))).toEqual(state);
  });
  it("dois inbounds pendentes preservam primeiro candidato e projeção na última âncora", async () => {
    const row = await fixture(), first = await candidate(row, new Date("2026-10-06T15:00:00.000Z"), true);
    const latest = await candidate(row, new Date("2026-10-06T15:00:00.100Z"), true);
    const state = await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id));
    expect(state[0]).toMatchObject({ phase: null, anchorMessageId: latest.id, revision: 3 });
    expect(await episode(row)).toMatchObject({ firstInboundMessageId: first.id, bridgeLastInboundAt: latest.sentAt });
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true });
    expect(await episode(row)).toMatchObject({ firstInboundMessageId: first.id, bridgeLastInboundAt: latest.sentAt, bridgeInvalidatedAt: null, bridgeRevision: 1, state: "accepted" });
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id))).toEqual(state);
  });
  it.each(["origin", "candidate", "conversation", "projection"])("referência %s alheia à conversa não concede ponte", async (kind) => {
    const row = await fixture(), other = await fixture();
    let reference = other.anchor.id;
    if (kind === "conversation") {
      const [conversation] = await db.insert(conversations).values({ tenantId, leadId: row.lead.id }).returning();
      const [message] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Outra conversa da mesma lead", sentAt: now, whatsappPhoneNumberId: row.phoneNumberId }).returning(); reference = message.id;
    }
    if (kind === "projection") await db.update(leadAgentState).set({ anchorMessageId: reference }).where(eq(leadAgentState.leadId, row.lead.id));
    else await db.update(reengagementEpisodes).set(kind === "origin" ? { originSessionStartMessageId: reference } : { firstInboundMessageId: reference }).where(eq(reengagementEpisodes.id, row.episodeId));
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true }); expect(await episode(row)).toMatchObject({ bridgeInvalidatedAt: acceptedAt, bridgeRevision: 2, bridgeLastInboundAt: null, state: "accepted" });
  });
  it.each(["reset", "optout", "takeover", "phase", "unknown"])("%s após despacho invalida ponte mas conserva saída aceita", async (change) => {
    const row = await fixture();
    if (change === "phase" || change === "unknown") await db.update(leadAgentState).set({ phase: change === "phase" ? "encerrada" : null }).where(eq(leadAgentState.leadId, row.lead.id));
    else await db.update(leads).set(change === "reset" ? { memoryResetRequestedAt: now } : change === "optout" ? { optedOutAt: now } : { humanTakeoverAt: now }).where(eq(leads.id, row.lead.id));
    const before = (await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0];
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true }); expect(await episode(row)).toMatchObject({ state: "accepted", bridgeInvalidatedAt: acceptedAt, dispatchAuthorizedAt: now, wamid: row.wamid });
    expect(await outputs(row)).toHaveLength(1); expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(before);
  });
  it("candidato em48h exatas não ativa ponte", async () => {
    const row = await fixture(); await candidate(row, new Date(row.anchor.sentAt.getTime() + 48 * 3600000));
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true }); expect(await episode(row)).toMatchObject({ bridgeInvalidatedAt: acceptedAt, bridgeLastInboundAt: null });
  });
  it("último inbound não finito não vira fallback permissivo para o candidato", async () => {
    const row = await fixture(); await candidate(row);
    await db.execute(sql`UPDATE reengagement_episodes SET bridge_last_inbound_at = 'infinity'::timestamptz WHERE tenant_id = ${tenantId} AND id = ${row.episodeId}`);
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true });
    const stored = await episode(row); expect(stored).toMatchObject({ bridgeInvalidatedAt: acceptedAt, bridgeRevision: 2, state: "accepted" });
    expect(Number.isFinite(stored.bridgeLastInboundAt?.getTime())).toBe(false);
  });
  it("mensagem da projeção não finita não concede ponte nem preenche último inbound", async () => {
    const row = await fixture(); await candidate(row, new Date("2026-10-06T15:00:00.000Z"), true);
    const latest = await candidate(row, new Date("2026-10-06T15:00:00.100Z"), true);
    await db.execute(sql`UPDATE messages SET sent_at = 'infinity'::timestamptz WHERE tenant_id = ${tenantId} AND id = ${latest.id}`);
    await db.update(reengagementEpisodes).set({ bridgeLastInboundAt: null }).where(eq(reengagementEpisodes.id, row.episodeId));
    await db.update(leadAgentState).set({ phase: "qualificando" }).where(eq(leadAgentState.leadId, row.lead.id));
    expect(await ack(row)).toMatchObject({ ok: true, recorded: true });
    expect(await episode(row)).toMatchObject({ state: "accepted", bridgeInvalidatedAt: acceptedAt, bridgeRevision: 2, bridgeLastInboundAt: null });
  });
  it("tenant alheio/input inválido não escreve", async () => {
    const row = await fixture(), before = await episode(row);
    expect(await reconcileAcceptance({ tenantId: foreignTenant }, row.lead.id, row.episodeId, { wamid: row.wamid, acceptedAt })).toEqual({ ok: false, reason: "lead-not-found" });
    expect(await ack(row, { wamid: " " })).toEqual({ ok: false, reason: "invalid-input" }); expect(await ack(row, { wamid: row.wamid })).toEqual({ ok: false, reason: "invalid-input" }); expect(await episode(row)).toEqual(before);
  });
  it("dois ack reais esperam lead e gravam uma mensagem, sem reenvio", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect(), pidA = deferred<number>(), pidB = deferred<number>();
    let pending: ReturnType<typeof ack>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = [ack(row, undefined, pinned(a, pidA)), ack(row, undefined, pinned(b, pidB))];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); let waiting = 0;
      for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) { waiting = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting; if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 50)); }
      expect(waiting).toBe(2); await blocker.query("COMMIT"); const results = await Promise.all(pending);
      expect(results.filter((result) => result.ok && result.recorded && !result.replay)).toHaveLength(1); expect(results.filter((result) => result.ok && result.recorded && result.replay)).toHaveLength(1);
      const stored = await outputs(row); expect(stored).toHaveLength(1);
      for (const result of results) expect(result).toEqual({ ok: true, recorded: true, replay: result.ok && result.recorded ? result.replay : false, episodeId: row.episodeId, messageId: stored[0].id });
      expect(await episode(row)).toMatchObject({ state: "accepted", messageId: stored[0].id, submittedText: "Texto efetivamente submetido", dispatchAuthorizedAt: now, acceptedAt, wamid: row.wamid });
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });
});
