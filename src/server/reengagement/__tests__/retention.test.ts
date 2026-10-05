import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels, whatsappMessageReceipts, whatsappUsage } from "../../../db/schema";
import { getSessionFrame } from "../context";
import { claimPreparation, reconcileAcceptance } from "../repository";
import { sendPreparedEpisode } from "../send";
import { purgeReengagementMetadata, REENGAGEMENT_RETENTION_MS } from "../retention";

const tenantId = randomUUID(), foreignTenant = randomUUID(), tenantIds = [tenantId, foreignTenant];
const now = new Date("2026-10-06T15:00:00.500Z"), hour = 3600000, old = new Date(now.getTime() - 31 * 24 * hour);
async function fixture(state: "accepted" | "accepted_pending_record" | "refused" | "uncertain" | "preparing" = "accepted", tenant = tenantId, createdAt = old) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), wamid = `fixture-${randomUUID()}`;
  await db.insert(whatsappChannels).values({ tenantId: tenant, phoneNumberId, ownershipVerifiedAt: old });
  const [lead] = await db.insert(leads).values({ tenantId: tenant, name: "Fixture T63", phone: "123", firstContactAt: old, externalId: `5534${String(BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 8)}`)).padStart(10, "0")}`, status: "em_qualificacao", whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: tenant, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: tenant, conversationId: conversation.id, sender: "lead", content: "Âncora factual", sentAt: createdAt, whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId: tenant, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const output = state === "accepted" ? (await db.insert(messages).values({ tenantId: tenant, conversationId: conversation.id, sender: "agente", content: "Texto submetido", sentAt: new Date(createdAt.getTime() + 22 * hour), externalId: wamid, whatsappPhoneNumberId: phoneNumberId }).returning())[0] : null;
  const [episode] = await db.insert(reengagementEpisodes).values({ tenantId: tenant, leadId: lead.id, phoneNumberId, anchorMessageId: anchor.id, anchorSentAt: createdAt, agentStateRevision: 1,
    state, createdAt, updatedAt: createdAt, submittedText: "Texto submetido", claimToken: randomUUID(), claimExpiresAt: new Date(createdAt.getTime() + hour), preparedAt: createdAt,
    dispatchAuthorizedAt: state === "preparing" ? null : createdAt, dispatchCompletionDeadline: state === "preparing" ? null : new Date(createdAt.getTime() + 120000),
    acceptedAt: ["accepted", "accepted_pending_record"].includes(state) ? createdAt : null, wamid: ["accepted", "accepted_pending_record"].includes(state) ? wamid : null,
    messageId: output?.id, originSessionStartMessageId: anchor.id, originSessionEndMessageId: anchor.id }).returning();
  return { tenant, lead, conversation, anchor, output, episode, phoneNumberId, wamid };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episode.id)))[0]; }
async function receipt(row: Fixture, age: number, linked = false, wamid = row.wamid) {
  await db.insert(whatsappMessageReceipts).values({ tenantId: row.tenant, phoneNumberId: row.phoneNumberId, wamid,
    messageId: linked ? row.output!.id : null, classification: "free_service", firstSeenAt: new Date(now.getTime() - age), lastSeenAt: new Date(now.getTime() - age),
    orphanExpiresAt: linked ? null : new Date(now.getTime() - age + REENGAGEMENT_RETENTION_MS) });
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema });
  return { transaction: (callback, config) => database.transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
}
async function waitForLocks(pids: number[]) {
  for (let i = 0; i < 100; i++) {
    const result = await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids]);
    if (result.rows[0].waiting === pids.length) return result.rows[0].waiting;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}
beforeAll(async () => { await db.insert(tenants).values(tenantIds.map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T63", agentName: "Agente", supportedModality: "ambos" as const, meetingDays: [1, 2, 3, 4, 5, 6, 7], meetingHoursStart: "09:00", meetingHoursEnd: "18:00" }))); });
afterEach(async () => {
  await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, tenantIds));
  await db.delete(whatsappUsage).where(inArray(whatsappUsage.tenantId, tenantIds));
  await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, tenantIds));
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, tenantIds));
  await db.delete(messages).where(inArray(messages.tenantId, tenantIds)); await db.delete(conversations).where(inArray(conversations.tenantId, tenantIds));
  await db.delete(leads).where(inArray(leads.tenantId, tenantIds)); await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, tenantIds));
});
afterAll(async () => { await db.delete(tenants).where(inArray(tenants.id, tenantIds)); await db.$client.end(); });

describe("T63 — retenção operacional preserva fatos e consumo", () => {
  it("órfãos incluem 30d e 30d+1ms, preservando 30d-1ms sem renovar no replay", async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()], rows: Fixture[] = [];
    for (const [i, age] of [REENGAGEMENT_RETENTION_MS - 1, REENGAGEMENT_RETENTION_MS, REENGAGEMENT_RETENTION_MS + 1].entries()) {
      const row = await fixture("accepted", tenantId, new Date(now.getTime() - age)); rows.push(row); await receipt(row, age, false, ids[i]);
    }
    await purgeReengagementMetadata(now);
    const retained = await db.select().from(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.wamid, ids));
    expect(retained.map((item) => item.wamid)).toEqual([ids[0]]); expect(retained[0].orphanExpiresAt).toEqual(new Date(now.getTime() + 1));
    expect((await episode(rows[0])).originSessionStartMessageId).toBe(rows[0].anchor.id);
    for (const row of rows.slice(1)) expect(await episode(row)).toMatchObject({ originSessionStartMessageId: null, state: "accepted", dispatchAuthorizedAt: row.episode.dispatchAuthorizedAt });
    await purgeReengagementMetadata(now); expect(await db.select().from(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.wamid, ids))).toEqual(retained);
  });

  it("classificação ligada sobrevive à idade e acompanha exclusão factual da mensagem", async () => {
    const row = await fixture(); await receipt(row, 60 * 24 * hour, true);
    const before = await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.wamid));
    await purgeReengagementMetadata(now); expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.wamid))).toEqual(before);
    expect(before[0]).toMatchObject({ messageId: row.output!.id, classification: "free_service", orphanExpiresAt: null });
    await db.delete(messages).where(eq(messages.id, row.output!.id));
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.wamid))).toEqual([]);
  });

  it("histórico removido não retorna por cópia paralela e tombstone conserva âncora e despacho", async () => {
    const row = await fixture(), before = row.episode;
    await purgeReengagementMetadata(now);
    expect(await episode(row)).toMatchObject({ anchorMessageId: row.anchor.id, state: "accepted", dispatchAuthorizedAt: before.dispatchAuthorizedAt, dispatchCompletionDeadline: before.dispatchCompletionDeadline,
      wamid: row.wamid, acceptedAt: old, messageId: null, originSessionStartMessageId: null, originSessionEndMessageId: null, firstInboundMessageId: null, submittedText: null });
    await db.delete(messages).where(eq(messages.id, row.output!.id));
    expect(await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => now })).toMatchObject({ ok: true, frame: { bridge: null }, history: [] });
    // Mesmo voltando ao instante elegível, a chave compactada já foi consumida.
    expect(await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => new Date(old.getTime() + 22 * hour) })).toEqual({ ok: true, acquired: false, episodeId: row.episode.id, state: "accepted" });
    const fetch = async () => { throw new Error("transporte proibido no replay"); };
    expect(await sendPreparedEpisode({ tenantId }, row.lead.id, row.episode.id, { claimToken: randomUUID(), text: "Outro texto" }, { now: () => now, fetch })).toMatchObject({ ok: true, replay: true, state: "accepted", wamid: row.wamid });
    expect(await db.select().from(messages).where(eq(messages.id, row.anchor.id))).toEqual([row.anchor]);
  });

  it("sessão retomada com novos inbounds conserva ponte ativa mesmo após 30 dias", async () => {
    const row = await fixture();
    const chain = await db.insert(messages).values(Array.from({ length: 91 }, (_, i) => ({ tenantId, conversationId: row.conversation.id, sender: "lead" as const, content: `Continuidade ${i}`, sentAt: new Date(old.getTime() + (23 + i * 8) * hour), whatsappPhoneNumberId: row.phoneNumberId }))).returning();
    const last = chain.at(-1)!;
    await db.update(leadAgentState).set({ anchorMessageId: last.id, revision: 92 }).where(eq(leadAgentState.leadId, row.lead.id));
    await db.update(reengagementEpisodes).set({ firstInboundMessageId: chain[0].id, bridgeLastInboundAt: last.sentAt }).where(eq(reengagementEpisodes.id, row.episode.id));
    const before = await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => now });
    expect(before).toMatchObject({ ok: true, frame: { bridge: { messageId: row.output!.id, firstInboundMessageId: chain[0].id } } });
    await purgeReengagementMetadata(now);
    expect(await getSessionFrame({ tenantId }, row.lead.id, {}, { now: () => now })).toEqual(before);
    expect(await episode(row)).toMatchObject({ bridgeInvalidatedAt: null, originSessionStartMessageId: row.anchor.id, messageId: row.output!.id, firstInboundMessageId: chain[0].id, submittedText: null });
  });

  it("reset ou continuidade encerrada compactam referências sem apagar resultado consumido", async () => {
    for (const reset of [true, false]) {
      const row = await fixture();
      const [first] = await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "lead", content: "Resposta", sentAt: new Date(old.getTime() + 23 * hour), whatsappPhoneNumberId: row.phoneNumberId }).returning();
      await db.update(reengagementEpisodes).set({ firstInboundMessageId: first.id, bridgeLastInboundAt: reset ? now : first.sentAt }).where(eq(reengagementEpisodes.id, row.episode.id));
      if (reset) await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
      await purgeReengagementMetadata(now);
      expect(await episode(row)).toMatchObject({ bridgeInvalidatedAt: now, bridgeRevision: 2, firstInboundMessageId: null, bridgeLastInboundAt: null, messageId: null, state: "accepted", dispatchAuthorizedAt: old });
      const compacted = await episode(row); await purgeReengagementMetadata(now); expect(await episode(row)).toEqual(compacted);
    }
  });

  it("texto e leases concluídos saem; aceite pendente mantém texto para reconciliar sem transporte", async () => {
    const recent = new Date(now.getTime() - 2 * 24 * hour);
    const pending = await fixture("accepted_pending_record"), refused = await fixture("refused", tenantId, recent), uncertain = await fixture("uncertain", tenantId, recent), preparing = await fixture("preparing", tenantId, recent), accepted = await fixture("accepted", tenantId, recent);
    await purgeReengagementMetadata(now);
    expect(await episode(pending)).toMatchObject({ state: "accepted_pending_record", submittedText: "Texto submetido", claimToken: null, claimExpiresAt: null });
    for (const row of [refused, uncertain, preparing, accepted]) expect(await episode(row)).toMatchObject({ submittedText: null, claimToken: null, claimExpiresAt: null });
    expect(await episode(accepted)).toMatchObject({ state: "accepted", messageId: accepted.output!.id, dispatchAuthorizedAt: recent, createdAt: recent });
    expect(await reconcileAcceptance({ tenantId }, pending.lead.id, pending.episode.id, { wamid: pending.wamid, acceptedAt: old }, { now: () => now })).toMatchObject({ ok: true, recorded: true });
    await purgeReengagementMetadata(now); expect((await episode(pending)).submittedText).toBeNull();
    expect((await db.select().from(messages).where(eq(messages.externalId, pending.wamid)))[0]).toMatchObject({ sender: "agente", content: "Texto submetido" });
  });

  it("snapshot histórico/revisão antiga expira e período civil corrente permanece mesmo stale", async () => {
    const row = await fixture();
    const lease = randomUUID();
    await db.update(whatsappChannels).set({ configurationRevision: 2, usageSyncToken: lease, usageSyncDeadline: now }).where(eq(whatsappChannels.phoneNumberId, row.phoneNumberId));
    const period = (start: string, end: string, revision: number, age: number) => ({ tenantId, phoneNumberId: row.phoneNumberId, monthStart: new Date(start), monthEnd: new Date(end), accountTimezone: "America/Sao_Paulo", configurationRevision: revision, expiresAt: new Date(now.getTime() - age) });
    await db.insert(whatsappUsage).values([
      period("2026-09-01T03:00:00Z", "2026-10-01T03:00:00Z", 2, 0), period("2026-10-01T03:00:00Z", "2026-11-01T03:00:00Z", 2, hour),
      period("2026-10-01T03:00:00Z", "2026-11-01T03:00:00Z", 1, 0), period("2026-08-01T03:00:00Z", "2026-09-01T03:00:00Z", 2, -1),
    ]);
    await db.update(whatsappUsage).set({ responseToken: lease }).where(eq(whatsappUsage.phoneNumberId, row.phoneNumberId));
    await purgeReengagementMetadata(now);
    expect((await db.select().from(whatsappUsage).where(eq(whatsappUsage.phoneNumberId, row.phoneNumberId))).map((item) => [item.monthStart.toISOString(), item.configurationRevision]).sort()).toEqual([
      ["2026-08-01T03:00:00.000Z", 2], ["2026-10-01T03:00:00.000Z", 2],
    ]);
    expect((await db.select().from(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, row.phoneNumberId)))[0]).toMatchObject({ configurationRevision: 2, usageSyncToken: null, usageSyncDeadline: null });
    expect((await db.select().from(whatsappUsage).where(eq(whatsappUsage.phoneNumberId, row.phoneNumberId))).every((item) => item.responseToken === null)).toBe(true);
  });

  it("identidade compartilhada não cruza tenants e classificação estrangeira continua ligada", async () => {
    const local = await fixture(), foreign = await fixture("accepted", foreignTenant);
    await db.update(messages).set({ externalId: local.wamid }).where(eq(messages.id, foreign.output!.id));
    await receipt(local, REENGAGEMENT_RETENTION_MS); await receipt(foreign, REENGAGEMENT_RETENTION_MS, true, local.wamid);
    await purgeReengagementMetadata(now);
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, local.wamid))).toMatchObject([{ tenantId: foreignTenant, messageId: foreign.output!.id, classification: "free_service" }]);
    expect((await episode(local)).tenantId).toBe(tenantId); expect((await episode(foreign)).anchorMessageId).toBe(foreign.anchor.id);
  });

  it("reconciliação e retenção disputam lead em PIDs independentes sem perder aceite ou rearmar", async () => {
    const row = await fixture("accepted_pending_record"), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(); let pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      const purge = purgeReengagementMetadata(now, { database: pinned(a, pidA) });
      const ack = reconcileAcceptance({ tenantId }, row.lead.id, row.episode.id, { wamid: row.wamid, acceptedAt: old }, { now: () => now, database: pinned(b, pidB) }); pending = [purge, ack];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks(pids)).toBe(2);
      await blocker.query("COMMIT"); const [, accepted] = await Promise.all([purge, ack]); expect(accepted).toMatchObject({ ok: true, recorded: true });
      await purgeReengagementMetadata(now);
      expect(await episode(row)).toMatchObject({ state: "accepted", dispatchAuthorizedAt: old, dispatchCompletionDeadline: row.episode.dispatchCompletionDeadline, submittedText: null, wamid: row.wamid });
      expect((await db.select().from(messages).where(eq(messages.externalId, row.wamid))).map((item) => item.content)).toEqual(["Texto submetido"]);
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("falha transacional ou clock inválido não remove metadados nem proteção parcialmente", async () => {
    const row = await fixture(); await receipt(row, REENGAGEMENT_RETENTION_MS);
    const receipts = await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.wamid));
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(purgeReengagementMetadata(now, { database })).rejects.toThrow("fixture-rollback");
    await expect(purgeReengagementMetadata(new Date(NaN))).rejects.toThrow("invalid clock");
    expect(await episode(row)).toEqual(row.episode); expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, row.wamid))).toEqual(receipts);
  });
});
