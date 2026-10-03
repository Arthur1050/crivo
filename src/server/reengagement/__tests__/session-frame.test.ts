import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import { authorizeDispatch, claimPreparation, reconcileAcceptance } from "../repository";
import { getSessionFrame, prepareFrame } from "../context";
import { isSessionExpired, toSeedMemoryItem } from "../../../../n8n/src/session.mjs";

const tenantId = randomUUID(), foreignTenant = randomUUID(), now = new Date("2026-10-06T15:00:00Z"), hour = 3600000;
let contact = 5534999600000;
async function fixture(state: "accepted" | "authorized" | "accepted_pending_record" | "uncertain" = "accepted", firstOffset = 40 * hour) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now });
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T26", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const anchorTime = new Date(now.getTime() - 22 * hour);
  const [old, human, anchor] = await db.insert(messages).values([
    { sender: "lead" as const, content: "Sessão anterior", sentAt: new Date(anchorTime.getTime() - 20 * hour) },
    { sender: "humano" as const, content: "Duas vagas confirmadas", authorName: "Ana", sentAt: new Date(anchorTime.getTime() - 1800000) },
    { sender: "lead" as const, content: "Quero retomar as vagas", sentAt: anchorTime },
  ].map((message) => ({ ...message, tenantId, conversationId: conversation.id, whatsappPhoneNumberId: phoneNumberId }))).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const claim = await claimPreparation({ tenantId }, lead.id, { anchorMessageId: anchor.id }, { now: () => now });
  if (!claim.ok || !claim.acquired) throw new Error("Claim ausente");
  const prepared = await prepareFrame({ tenantId }, lead.id, claim.episodeId, { claimToken: claim.claimToken }, { now: () => now });
  if (!prepared.ok) throw new Error("Frame ausente");
  const authorized = await authorizeDispatch({ tenantId }, lead.id, claim.episodeId, { claimToken: claim.claimToken, text: "Vamos retomar as vagas?" }, { expectedChannelRevision: 1, now: () => now });
  if (!authorized.ok || !authorized.authorized) throw new Error("Autorização ausente");
  let resumeId: string | null = null;
  if (state === "accepted") {
    const acceptedAt = new Date(now.getTime() + 1000);
    const ack = await reconcileAcceptance({ tenantId }, lead.id, claim.episodeId, { wamid: `fixture-${randomUUID()}`, acceptedAt }, { now: () => acceptedAt });
    if (!ack.ok || !ack.recorded) throw new Error("Aceite ausente");
    resumeId = ack.messageId;
  } else if (state === "accepted_pending_record") {
    await db.update(reengagementEpisodes).set({ state, acceptedAt: new Date(now.getTime() + 1000), wamid: `fixture-${randomUUID()}` }).where(eq(reengagementEpisodes.id, claim.episodeId));
  } else if (state === "uncertain") await db.update(reengagementEpisodes).set({ state }).where(eq(reengagementEpisodes.id, claim.episodeId));
  // Parcela factual de ingestão antes da integração T27: primeiro candidato e revisão avançada.
  const [first] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Sim, podemos continuar", sentAt: new Date(anchorTime.getTime() + firstOffset), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.update(reengagementEpisodes).set({ firstInboundMessageId: first.id, bridgeLastInboundAt: first.sentAt }).where(eq(reengagementEpisodes.id, claim.episodeId));
  await db.update(leadAgentState).set({ phase: null, anchorMessageId: first.id, revision: 2 }).where(eq(leadAgentState.leadId, lead.id));
  return { lead, conversation, old, human, anchor, first, resumeId, phoneNumberId, ...claim };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function read(row: Fixture, clock = row.first.sentAt, bufferMessageIds: string[] = [], database?: Pick<typeof db, "transaction">) {
  return getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds }, { now: () => clock, database });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema });
  return { transaction: (callback, config) => database.transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
}
async function waitForLock(pid: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await db.$client.query<{ waiting: boolean }>("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [pid]);
    if (result.rows[0]?.waiting) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}
beforeAll(async () => { await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T26", agentName: "Agente", supportedModality: "ambos" as const }))); });
afterAll(async () => {
  await db.delete(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantId));
  await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId)); await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId));
  await db.delete(messages).where(eq(messages.tenantId, tenantId)); await db.delete(conversations).where(eq(conversations.tenantId, tenantId)); await db.delete(leads).where(eq(leads.tenantId, tenantId));
  await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId)); await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.$client.end();
});

describe("T26 — leitura factual da ponte", () => {
  it("ponte aceita fornece mesma revisão à expiração e conteúdo cold/warm com equipe system", async () => {
    const row = await fixture(), before = await episode(row), result = await read(row, row.first.sentAt, [row.first.id]);
    if (!result.ok) throw new Error("Leitura ausente");
    expect(result.frame).toEqual({ revision: 1, resetRequestedAt: null, bridge: { state: "accepted", bridgeRevision: 1, bridgeInvalidatedAt: null, resetObservedAt: null,
      anchorMessageId: row.anchor.id, anchorSentAt: row.anchor.sentAt.toISOString(), originSessionStartMessageId: row.human.id, originSessionEndMessageId: row.anchor.id,
      messageId: row.resumeId, firstInboundMessageId: row.first.id, firstInboundSentAt: row.first.sentAt.toISOString(), bridgeLastInboundAt: row.first.sentAt.toISOString() } });
    expect(result.history.map(toSeedMemoryItem)).toEqual([
      { type: "system", message: "Mensagem enviada ao lead por Ana, da equipe da imobiliária: Duas vagas confirmadas" },
      { type: "user", message: "Quero retomar as vagas" }, { type: "ai", message: "Vamos retomar as vagas?" },
    ]);
    expect(result.requiresRebuild).toBe(true); expect(result.pendingAcceptance).toBeNull();
    expect(result.anchor).toEqual({ id: row.first.id, sentAt: row.first.sentAt.toISOString() }); expect(result.agentStateRevision).toBe(2);
    expect(isSessionExpired(row.anchor.sentAt.toISOString(), row.first.sentAt.toISOString(), 12, { frame: result.frame })).toBe(false);
    expect(await episode(row)).toEqual(before);
    const cold = await read(row); if (!cold.ok) throw new Error("Cold ausente");
    expect(cold.history.map((message) => message.id)).toEqual([row.human.id, row.anchor.id, row.resumeId, row.first.id]);
    expect(cold.requiresRebuild).toBe(false);
  });

  it.each([48 * hour - 1, 48 * hour, 48 * hour + 1])("primeira resposta %sms respeita <48h", async (firstOffset) => {
    const row = await fixture("accepted", firstOffset), result = await read(row, row.first.sentAt, [row.first.id]);
    if (!result.ok) throw new Error("Leitura ausente");
    expect(result.frame.bridge !== null).toBe(firstOffset < 48 * hour); expect(result.requiresRebuild).toBe(firstOffset < 48 * hour);
    expect(result.history.map((message) => message.id)).toEqual(firstOffset < 48 * hour ? [row.human.id, row.anchor.id, row.resumeId] : []);
  });

  it.each(["authorized", "accepted_pending_record"] as const)("%s sinaliza pendente só antes do deadline factual de 2min", async (state) => {
    const row = await fixture(state, 22 * hour + 30000), deadline = new Date(now.getTime() + 120000);
    const early = await read(row, new Date(now.getTime() + 119999), [row.first.id]);
    expect(early).toMatchObject({ ok: true, frame: { bridge: null }, history: [], requiresRebuild: false, pendingAcceptance: { episodeId: row.episodeId, deadline: deadline.toISOString() } });
    const exact = await read(row, deadline, [row.first.id]), after = await read(row, new Date(deadline.getTime() + 1), [row.first.id]);
    for (const result of [exact, after]) expect(result).toMatchObject({ ok: true, frame: { bridge: null }, requiresRebuild: false, pendingAcceptance: null });
    expect(await episode(row)).toMatchObject({ state, dispatchCompletionDeadline: deadline });
  });

  it("resultado incerto nunca presume aceite nem cria memória de retomada", async () => {
    const row = await fixture("uncertain", 22 * hour + 30000), result = await read(row, new Date(now.getTime() + 60000));
    expect(result).toMatchObject({ ok: true, frame: { bridge: null }, requiresRebuild: false, pendingAcceptance: null });
    if (!result.ok) throw new Error("Leitura ausente");
    expect(result.history.map((message) => message.id)).toEqual([row.first.id]);
  });

  it("reset atual invalida continuidade e filtra dados antigos sem mutação da leitura", async () => {
    const row = await fixture(), reset = new Date(row.first.sentAt.getTime() - 1000);
    await db.update(leads).set({ memoryResetRequestedAt: reset }).where(eq(leads.id, row.lead.id));
    const before = await episode(row), result = await read(row);
    expect(result).toMatchObject({ ok: true, frame: { resetRequestedAt: reset.toISOString(), bridge: null }, requiresRebuild: false });
    if (!result.ok) throw new Error("Leitura ausente"); expect(result.history.map((message) => message.id)).toEqual([row.first.id]); expect(await episode(row)).toEqual(before);
  });

  it("mais de50mensagens não invalida refs verificadas antes do recorte final; buffer excluído", async () => {
    const row = await fixture();
    const tail = await db.insert(messages).values(Array.from({ length: 55 }, (_, i) => ({ tenantId, conversationId: row.conversation.id, sender: "agente" as const, content: `História ${i}`,
      sentAt: new Date(row.anchor.sentAt.getTime() + (i + 1) * 60000), whatsappPhoneNumberId: row.phoneNumberId }))).returning();
    await db.update(reengagementEpisodes).set({ originSessionEndMessageId: tail[54].id }).where(eq(reengagementEpisodes.id, row.episodeId));
    const result = await read(row, row.first.sentAt, [row.first.id]);
    if (!result.ok) throw new Error("Leitura ausente");
    expect(result.frame.bridge?.originSessionStartMessageId).toBe(row.human.id); expect(result.frame.bridge?.anchorMessageId).toBe(row.anchor.id);
    expect(result.history.map((message) => message.id)).toEqual([...tail.slice(-49).map((message) => message.id), row.resumeId]);
    expect(result.requiresRebuild).toBe(true);
  });

  it("buffer inteiro excluído sem perder limite factual do primeiro inbound", async () => {
    const row = await fixture(); const [next] = await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "lead", content: "E o condomínio?", sentAt: new Date(row.first.sentAt.getTime() + hour), whatsappPhoneNumberId: row.phoneNumberId }).returning();
    await db.update(reengagementEpisodes).set({ bridgeLastInboundAt: next.sentAt }).where(eq(reengagementEpisodes.id, row.episodeId));
    await db.update(leadAgentState).set({ anchorMessageId: next.id, revision: 3 }).where(eq(leadAgentState.leadId, row.lead.id));
    const result = await read(row, next.sentAt, [row.first.id, next.id]); if (!result.ok) throw new Error("Leitura ausente");
    expect(result.history.map((message) => message.id)).toEqual([row.human.id, row.anchor.id, row.resumeId]); expect(result.requiresRebuild).toBe(true);
    expect(result.agentStateRevision).toBe(3); expect(result.frame.bridge?.bridgeLastInboundAt).toBe(next.sentAt.toISOString());
  });

  it("histórico apagado não volta de cópia paralela; ref ausente usa corte normal", async () => {
    const row = await fixture(); await db.update(reengagementEpisodes).set({ originSessionStartMessageId: null }).where(eq(reengagementEpisodes.id, row.episodeId));
    await db.delete(messages).where(eq(messages.id, row.human.id)); const result = await read(row);
    if (!result.ok) throw new Error("Leitura ausente"); expect(result.frame.bridge).toBeNull(); expect(result.history.map((message) => message.id)).toEqual([row.first.id]);
  });

  it("ponte após48h continua pelo último inbound12h exatas e encerra em +1ms", async () => {
    const row = await fixture(); const [next] = await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "lead", content: "Continuamos", sentAt: new Date(row.anchor.sentAt.getTime() + 50 * hour), whatsappPhoneNumberId: row.phoneNumberId }).returning();
    await db.update(reengagementEpisodes).set({ bridgeLastInboundAt: next.sentAt }).where(eq(reengagementEpisodes.id, row.episodeId));
    await db.update(leadAgentState).set({ anchorMessageId: next.id, revision: 3 }).where(eq(leadAgentState.leadId, row.lead.id));
    const exact = await read(row, new Date(next.sentAt.getTime() + 12 * hour)), expired = await read(row, new Date(next.sentAt.getTime() + 12 * hour + 1));
    if (!exact.ok || !expired.ok) throw new Error("Leitura ausente");
    expect(exact.frame.bridge).not.toBeNull(); expect(exact.history.map((message) => message.id)).toEqual([row.human.id, row.anchor.id, row.resumeId, row.first.id, next.id]);
    expect(expired.frame.bridge).toBeNull(); expect(expired.history).toEqual([]);
  });

  it.each([true, false])("saída recente não prolonga sessão inativa pelo inbound, ponte=%s", async (bridge) => {
    const row = await fixture();
    if (!bridge) await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId));
    await db.insert(messages).values({ tenantId, conversationId: row.conversation.id, sender: "agente", content: "Saída tardia",
      sentAt: new Date(row.first.sentAt.getTime() + 12 * hour), whatsappPhoneNumberId: row.phoneNumberId });
    expect(await read(row, new Date(row.first.sentAt.getTime() + 13 * hour))).toMatchObject({ ok: true, frame: { bridge: null }, history: [], requiresRebuild: false });
  });

  it.each(["opt-out", "human", "channel", "invalidated"])("contexto %s elimina ponte aceita", async (kind) => {
    const row = await fixture();
    if (kind === "opt-out") await db.update(leads).set({ optedOutAt: now }).where(eq(leads.id, row.lead.id));
    if (kind === "human") await db.update(leads).set({ humanTakeoverAt: now }).where(eq(leads.id, row.lead.id));
    if (kind === "channel") await db.update(leads).set({ whatsappPhoneNumberId: null }).where(eq(leads.id, row.lead.id));
    if (kind === "invalidated") await db.update(reengagementEpisodes).set({ bridgeInvalidatedAt: now, bridgeRevision: 2 }).where(eq(reengagementEpisodes.id, row.episodeId));
    expect(await read(row)).toMatchObject({ ok: true, frame: { bridge: null }, requiresRebuild: false, pendingAcceptance: null });
  });

  it("tenant/IDs de buffer alheios ou não inbound não retornam contexto", async () => {
    const row = await fixture(), other = await fixture();
    expect(await getSessionFrame({ tenantId: foreignTenant }, row.lead.id)).toEqual({ ok: false, reason: "lead-not-found" });
    for (const id of [other.first.id, row.resumeId!, randomUUID()]) expect(await read(row, row.first.sentAt, [id])).toEqual({ ok: false, reason: "invalid-buffer" });
    expect(await read(row, row.first.sentAt, Array.from({ length: 51 }, () => row.first.id))).toEqual({ ok: false, reason: "invalid-buffer" });
  });

  it("leitura falha ou histórico infinity real não retornam frame presumido", async () => {
    const row = await fixture();
    const database: Pick<typeof db, "transaction"> = { transaction: async () => { throw new Error("fixture-unavailable"); } };
    expect(await read(row, row.first.sentAt, [], database)).toEqual({ ok: false, reason: "context-read-failed" });
    await db.execute(sql`UPDATE messages SET sent_at='infinity' WHERE id=${row.human.id}`);
    expect(await read(row)).toEqual({ ok: false, reason: "context-read-failed" });
  });

  it("leitura bloqueada no episódio observa prazo vivo após locks e não renova o aceite", async () => {
    const row = await fixture("authorized", 22 * hour + 30000), before = await episode(row);
    const blocker = await db.$client.connect(), client = await db.$client.connect(), pid = deferred<number>();
    let clock = new Date(now.getTime() + 60000), pending: ReturnType<typeof getSessionFrame> | undefined; const readClock = vi.fn(() => clock);
    try {
      await blocker.query("BEGIN"); const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await blocker.query("SELECT id FROM reengagement_episodes WHERE id=$1 FOR UPDATE", [row.episodeId]);
      pending = getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds: [row.first.id] }, { now: readClock, database: pinned(client, pid) });
      const workerPid = await pid.promise; expect(workerPid).not.toBe(blockerPid); expect(await waitForLock(workerPid)).toBe(true);
      expect(readClock).not.toHaveBeenCalled(); clock = new Date(now.getTime() + 120000); await blocker.query("COMMIT");
      expect(await pending).toMatchObject({ ok: true, frame: { bridge: null }, pendingAcceptance: null, history: [] }); expect(await episode(row)).toEqual(before);
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); client.release(); }
  });
});
