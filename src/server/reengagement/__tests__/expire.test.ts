import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenant_members, tenants, users, whatsappChannels } from "../../../db/schema";
import * as cloudApi from "../../whatsapp/cloud-api";
import { expireEpisode } from "../repository";

const tenantId = randomUUID(), emptyTenant = randomUUID(), brokerId = randomUUID(), previousBroker = randomUUID();
const tenantIds = [tenantId, emptyTenant], now = new Date("2026-10-06T15:00:00Z"), hour = 3600000;
let contact = 5534999700000;
type State = typeof reengagementEpisodes.$inferInsert.state;
async function fixture(silence = 48 * hour, state: State | null = "omitted", owner = tenantId, patch: Partial<typeof leads.$inferInsert> = {}) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  await db.insert(whatsappChannels).values({ tenantId: owner, phoneNumberId, ownershipVerifiedAt: now, usageEnabled: false });
  const [lead] = await db.insert(leads).values({ tenantId: owner, name: "Fixture T23", phone: "+5534900000000", externalId: String(contact++),
    status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId, executiveSummary: "Resumo preservado", ...patch }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: owner, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "lead", content: "Inbound próprio T23",
    sentAt: new Date(now.getTime() - silence), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId: owner, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const authorized = new Date(anchor.sentAt.getTime() + 22 * hour), accepted = state === "accepted" || state === "accepted_pending_record";
  const consumed = state !== null && !["preparing", "cancelled", "omitted"].includes(state!);
  let messageId: string | null = null;
  const wamid = `fixture-${randomUUID()}`;
  if (state === "accepted") [messageId] = (await db.insert(messages).values({ tenantId: owner, conversationId: conversation.id, sender: "agente",
    content: "Texto submetido T23", sentAt: authorized, externalId: wamid, whatsappPhoneNumberId: phoneNumberId }).returning({ id: messages.id })).map((row) => row.id);
  if (state !== null) await db.insert(reengagementEpisodes).values({ tenantId: owner, leadId: lead.id, phoneNumberId, anchorMessageId: anchor.id,
    anchorSentAt: anchor.sentAt, agentStateRevision: 1, state, reasonCode: state === "omitted" ? "window-closed" : null,
    ...(state === "preparing" ? { claimToken: randomUUID(), claimExpiresAt: new Date(authorized.getTime() + 300000), preparedAt: authorized } : {}),
    ...(consumed ? { dispatchAuthorizedAt: authorized, dispatchCompletionDeadline: new Date(authorized.getTime() + 120000), submittedText: "Texto submetido T23" } : {}),
    ...(accepted ? { wamid, acceptedAt: authorized, messageId } : {}), createdAt: authorized, updatedAt: authorized });
  return { lead, conversation, anchor, phoneNumberId, tenantId: owner };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function expire(row: Fixture, clock = now, database?: Pick<typeof db, "transaction">) {
  return expireEpisode({ tenantId: row.tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => clock, database });
}
async function episodes(row: Fixture) { return db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, row.lead.id)); }
async function readLead(row: Fixture) { return (await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]; }
async function thread(row: Fixture) { return db.select().from(messages).where(eq(messages.conversationId, row.conversation.id)).orderBy(messages.id); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema }); return { transaction: (callback, config) => database.transaction(async (tx) => {
    pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx);
  }, config) };
}
async function waitForLocks(pids: number[], count: number) {
  let waiting = 0;
  for (let attempt = 0; attempt < 100 && waiting < count; attempt++) {
    waiting = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting;
    if (waiting < count) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return waiting;
}
beforeAll(async () => {
  await db.insert(tenants).values(tenantIds.map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T23", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(users).values([brokerId, previousBroker].map((id) => ({ id, name: "Corretor próprio", email: `${id}@fixture.test` })));
  await db.insert(tenant_members).values([brokerId, previousBroker].map((id) => ({ organizationId: tenantId, userId: id, role: "corretor",
    createdAt: new Date("2026-01-01T00:00:00Z"), workDays: [1, 2, 3, 4, 5], workHoursStart: "09:00", workHoursEnd: "18:00", deactivatedAt: id === previousBroker ? now : null })));
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => {
  await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, tenantIds));
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, tenantIds));
  await db.delete(messages).where(inArray(messages.tenantId, tenantIds)); await db.delete(conversations).where(inArray(conversations.tenantId, tenantIds));
  await db.delete(leads).where(inArray(leads.tenantId, tenantIds)); await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, tenantIds));
  await db.delete(tenant_members).where(inArray(tenant_members.organizationId, tenantIds)); await db.delete(tenants).where(inArray(tenants.id, tenantIds));
  await db.delete(users).where(inArray(users.id, [brokerId, previousBroker])); await db.$client.end();
});

describe("T23 — omissão e escalada transacionais por silêncio", () => {
  it("antes de 24h não omite nem cria episódio", async () => {
    const row = await fixture(24 * hour - 1, null);
    expect(await expire(row)).toEqual({ ok: false, reason: "not-due" }); expect(await episodes(row)).toEqual([]); expect(await readLead(row)).toEqual(row.lead);
  });
  it("24h sem episódio cria tombstone factual; repetição é unchanged", async () => {
    const row = await fixture(24 * hour, null), first = await expire(row);
    expect(first).toEqual({ ok: true, action: "omitted", episodeId: expect.any(String) });
    const before = await episodes(row);
    expect(before).toEqual([expect.objectContaining({ tenantId, leadId: row.lead.id, phoneNumberId: row.phoneNumberId, anchorMessageId: row.anchor.id,
      anchorSentAt: row.anchor.sentAt, state: "omitted", reasonCode: "window-closed", dispatchAuthorizedAt: null, createdAt: now, updatedAt: now, escalatedAt: null })]);
    expect(await expire(row, new Date(now.getTime() + 1))).toEqual({ ...first, action: "unchanged" });
    expect(await episodes(row)).toEqual(before); expect(await readLead(row)).toEqual(row.lead);
  });
  it("24h omite preparação e libera somente sua lease, sem consumo", async () => {
    const row = await fixture(24 * hour, "preparing"), [before] = await episodes(row);
    expect(await expire(row)).toEqual({ ok: true, action: "omitted", episodeId: before.id });
    expect(await episodes(row)).toEqual([{ ...before, state: "omitted", reasonCode: "window-closed", claimToken: null, claimExpiresAt: null, updatedAt: now }]);
    expect(await readLead(row)).toEqual(row.lead);
  });
  it.each(["authorized", "accepted_pending_record", "accepted", "refused", "uncertain"] as const)("24h preserva saída %s integralmente", async (state) => {
    const row = await fixture(24 * hour, state), before = await episodes(row), outputs = await thread(row);
    expect(await expire(row)).toEqual({ ok: true, action: "unchanged", episodeId: before[0].id });
    expect(await episodes(row)).toEqual(before); expect(await thread(row)).toEqual(outputs); expect(await readLead(row)).toEqual(row.lead);
  });
  it("47:59:59.999 mantém tombstone sem escalada", async () => {
    const row = await fixture(48 * hour - 1), before = await episodes(row);
    expect(await expire(row)).toEqual({ ok: true, action: "unchanged", episodeId: before[0].id });
    expect(await episodes(row)).toEqual(before); expect(await readLead(row)).toEqual(row.lead);
  });
  it.each([48 * hour, 48 * hour + 1])("%sms sem episódio cria tombstone e atribui na mesma transação", async (silence) => {
    const row = await fixture(silence, null), outputs = await thread(row), transport = vi.spyOn(cloudApi, "sendWhatsAppText");
    expect(await expire(row)).toEqual({ ok: true, action: "escalated", episodeId: expect.any(String), brokerId, result: "omitted" });
    expect(await episodes(row)).toEqual([expect.objectContaining({ tenantId, leadId: row.lead.id, phoneNumberId: row.phoneNumberId, anchorMessageId: row.anchor.id,
      state: "omitted", dispatchAuthorizedAt: null, escalatedAt: now, escalationResult: "omitted", escalationReasonCode: "silence-48h", createdAt: now, updatedAt: now })]);
    const stored = await readLead(row);
    expect(stored).toEqual({ ...row.lead, assignedUserId: brokerId, status: "escalado_humano", statusChangedBy: "agente",
      escalationReason: "Ausência de resposta por 48h; retomada omitida.", updatedAt: stored.updatedAt });
    expect(stored.updatedAt.getTime()).toBeGreaterThanOrEqual(row.lead.updatedAt.getTime()); expect(await thread(row)).toEqual(outputs); expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    ["accepted", "accepted", "aceita"], ["accepted_pending_record", "accepted", "aceita"], ["refused", "refused", "recusada"],
    ["uncertain", "uncertain", "incerta"], ["omitted", "omitted", "omitida"], ["authorized", "uncertain", "incerta"],
  ] as const)("48h usa resultado factual %s, sem enviar nem inventar mensagem", async (state, result, label) => {
    const row = await fixture(48 * hour, state), [before] = await episodes(row), outputs = await thread(row), transport = vi.spyOn(cloudApi, "sendWhatsAppText");
    expect(await expire(row)).toEqual({ ok: true, action: "escalated", episodeId: before.id, brokerId, result });
    expect(await episodes(row)).toEqual([{ ...before, escalatedAt: now, escalationResult: result, escalationReasonCode: "silence-48h", updatedAt: now,
      ...(state === "authorized" ? { state: "uncertain", reasonCode: "dispatch-unresolved" } : {}) }]);
    expect(await readLead(row)).toMatchObject({ assignedUserId: brokerId, status: "escalado_humano", statusChangedBy: "agente", escalationReason: `Ausência de resposta por 48h; retomada ${label}.` });
    expect(await thread(row)).toEqual(outputs); expect(transport).not.toHaveBeenCalled();
  });
  it("48h independe de horário/dia/Analytics e preserva responsável anterior", async () => {
    const row = await fixture(48 * hour, "accepted", tenantId, { assignedUserId: previousBroker });
    const outside = new Date("2026-10-11T03:00:00Z");
    expect(await expire(row, outside)).toMatchObject({ ok: true, action: "escalated", brokerId: previousBroker, result: "accepted" });
    expect(await readLead(row)).toMatchObject({ assignedUserId: previousBroker, status: "escalado_humano" });
    expect(await episodes(row)).toEqual([expect.objectContaining({ state: "accepted", escalatedAt: outside, escalationResult: "accepted" })]);
  });
  it("sem corretor ativo mantém handoff sem responsável e repete sem escrita", async () => {
    const row = await fixture(48 * hour, null, emptyTenant), first = await expire(row);
    expect(first).toEqual({ ok: true, action: "escalated", episodeId: expect.any(String), brokerId: null, result: "omitted" });
    const before = await episodes(row), lead = await readLead(row);
    expect(lead).toMatchObject({ assignedUserId: null, status: "escalado_humano", statusChangedBy: "agente", escalationReason: "Ausência de resposta por 48h; retomada omitida." });
    expect(await expire(row, new Date(now.getTime() + hour))).toEqual({ ok: true, action: "unchanged", episodeId: before[0].id });
    expect(await episodes(row)).toEqual(before); expect(await readLead(row)).toEqual(lead);
  });
  it("status definido por humano bloqueia toda alteração", async () => {
    const row = await fixture(48 * hour, "accepted", tenantId, { statusChangedBy: "humano" }), before = await episodes(row);
    expect(await expire(row)).toEqual({ ok: false, reason: "human-status-lock" }); expect(await episodes(row)).toEqual(before); expect(await readLead(row)).toEqual(row.lead);
  });
  it.each([{ optedOutAt: now }, { humanTakeoverAt: now }, { status: "qualificado_agendado" as const }])("condução/pipeline bloqueia escalada %#", async (patch) => {
    const row = await fixture(48 * hour, "authorized", tenantId, patch), before = await episodes(row);
    expect(await expire(row)).toEqual({ ok: false, reason: "not-eligible", policyReason: "ineligible" });
    expect(await episodes(row)).toEqual(before); expect(await readLead(row)).toEqual(row.lead);
  });
  it("fase encerrada não escala e cancela somente preparação", async () => {
    const row = await fixture(48 * hour, "preparing"), [before] = await episodes(row);
    await db.update(leadAgentState).set({ phase: "encerrada" }).where(eq(leadAgentState.leadId, row.lead.id));
    expect(await expire(row)).toEqual({ ok: false, reason: "not-eligible", policyReason: "ineligible" });
    expect(await episodes(row)).toEqual([{ ...before, state: "cancelled", reasonCode: "ineligible", claimToken: null, claimExpiresAt: null, updatedAt: now }]); expect(await readLead(row)).toEqual(row.lead);
  });
  it("fase não publicada (turno do agente falhou) escala e encerra a preparação pendente", async () => {
    const row = await fixture(48 * hour, "preparing"), [before] = await episodes(row);
    await db.update(leadAgentState).set({ phase: null }).where(eq(leadAgentState.leadId, row.lead.id));
    expect(await expire(row)).toMatchObject({ ok: true, action: "escalated", episodeId: before.id, result: "omitted" });
    expect(await episodes(row)).toEqual([{ ...before, state: "omitted", reasonCode: "window-closed", claimToken: null, claimExpiresAt: null,
      escalatedAt: now, escalationResult: "omitted", escalationReasonCode: "silence-48h", updatedAt: now }]);
    expect(await readLead(row)).toMatchObject({ status: "escalado_humano", escalationReason: "Ausência de resposta por 48h; retomada omitida." });
  });
  it("reset não observado bloqueia; observado não rearma marcador ou cria episódio", async () => {
    const row = await fixture(48 * hour, "accepted"), [before] = await episodes(row);
    await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
    expect(await expire(row)).toEqual({ ok: false, reason: "context-changed" }); expect(await episodes(row)).toEqual([before]);
    await db.update(leadAgentState).set({ resetObservedAt: now, revision: 2 }).where(eq(leadAgentState.leadId, row.lead.id));
    expect(await expire(row)).toMatchObject({ ok: true, action: "escalated", result: "accepted" });
    expect(await episodes(row)).toEqual([{ ...before, escalatedAt: now, escalationResult: "accepted", escalationReasonCode: "silence-48h", updatedAt: now }]);
  });
  it("tenant/âncora alheios não escrevem; canal não comprovado escala sem episódio", async () => {
    const row = await fixture(48 * hour, null), other = await fixture(48 * hour, null);
    expect(await expireEpisode({ tenantId: emptyTenant }, row.lead.id, { anchorMessageId: row.anchor.id })).toEqual({ ok: false, reason: "lead-not-found" });
    expect(await expireEpisode({ tenantId }, row.lead.id, { anchorMessageId: other.anchor.id })).toEqual({ ok: false, reason: "context-changed" });
    await db.update(whatsappChannels).set({ ownershipVerifiedAt: null }).where(eq(whatsappChannels.phoneNumberId, row.phoneNumberId));
    // Canal não comprovado não grava episódio, mas a escalada interna acontece.
    expect(await expire(row)).toMatchObject({ ok: true, action: "escalated", episodeId: null, result: "omitted" });
    expect(await episodes(row)).toEqual([]); expect(await readLead(row)).toMatchObject({ status: "escalado_humano" });
    expect(await expire(row)).toEqual({ ok: false, reason: "not-eligible", policyReason: "ineligible" }); expect(await episodes(row)).toEqual([]);
  });
  it("âncora malformada e relógio não finito falham fechados sem escrita", async () => {
    const row = await fixture(48 * hour, "authorized"), before = await episodes(row);
    expect(await expireEpisode({ tenantId }, row.lead.id, { anchorMessageId: "inválido" })).toEqual({ ok: false, reason: "invalid-input" });
    expect(await expire(row, new Date(NaN))).toEqual({ ok: false, reason: "invalid-input" });
    expect(await episodes(row)).toEqual(before); expect(await readLead(row)).toEqual(row.lead);
  });
  it.each([null, "99999999999999999999999999999999"])("canal da mensagem %s não herda canal atual: escala sem episódio", async (phone) => {
    const row = await fixture(48 * hour, null);
    await db.update(messages).set({ whatsappPhoneNumberId: phone }).where(eq(messages.id, row.anchor.id));
    expect(await expire(row)).toMatchObject({ ok: true, action: "escalated", episodeId: null, result: "omitted" });
    expect(await episodes(row)).toEqual([]); expect(await readLead(row)).toMatchObject({ status: "escalado_humano" });
  });
  it("sem canal verificado, 24h a 48h não grava omissão (exige o canal do episódio)", async () => {
    const row = await fixture(30 * hour, null);
    await db.update(whatsappChannels).set({ ownershipVerifiedAt: null }).where(eq(whatsappChannels.phoneNumberId, row.phoneNumberId));
    expect(await expire(row)).toEqual({ ok: false, reason: "context-changed" }); expect(await episodes(row)).toEqual([]); expect(await readLead(row)).toEqual(row.lead);
  });
  it.each([null, "accepted"] as const)("rollback desfaz atribuição/status/motivo/timestamps e episódio %s", async (state) => {
    const row = await fixture(48 * hour, state), before = await episodes(row), outputs = await thread(row);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(expire(row, now, database)).rejects.toThrow("fixture-rollback");
    expect(await readLead(row)).toEqual(row.lead); expect(await episodes(row)).toEqual(before); expect(await thread(row)).toEqual(outputs);
    expect(await expire(row)).toMatchObject({ ok: true, action: "escalated" });
  });
  it("duas transações reais esperam lead e somente uma atribui/escala", async () => {
    const row = await fixture(), [before] = await episodes(row), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(); let pending: ReturnType<typeof expireEpisode>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = [a, b].map((client, index) => expire(row, now, pinned(client, index === 0 ? pidA : pidB)));
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks(pids, 2)).toBe(2);
      await blocker.query("COMMIT"); const results = await Promise.all(pending);
      expect(results).toEqual(expect.arrayContaining([{ ok: true, action: "escalated", episodeId: before.id, brokerId, result: "omitted" }, { ok: true, action: "unchanged", episodeId: before.id }]));
      expect(results.filter((result) => result.ok && result.action === "escalated")).toHaveLength(1);
      expect(await episodes(row)).toEqual([{ ...before, escalatedAt: now, escalationResult: "omitted", escalationReasonCode: "silence-48h", updatedAt: now }]);
      expect(await readLead(row)).toMatchObject({ assignedUserId: brokerId, status: "escalado_humano", escalationReason: "Ausência de resposta por 48h; retomada omitida." });
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });
  it("relógio somente após lead→episódio cruza 48h durante espera", async () => {
    const row = await fixture(48 * hour - 1), [before] = await episodes(row), blocker = await db.$client.connect(), client = await db.$client.connect(), pid = deferred<number>();
    let clock = now, pending: ReturnType<typeof expireEpisode> | undefined; const readClock = vi.fn(() => clock);
    try {
      await blocker.query("BEGIN"); const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await blocker.query("SELECT id FROM reengagement_episodes WHERE id=$1 FOR UPDATE", [before.id]);
      pending = expireEpisode({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: readClock, database: pinned(client, pid) });
      const workerPid = await pid.promise; expect(workerPid).not.toBe(blockerPid); expect(await waitForLocks([workerPid], 1)).toBe(1); expect(readClock).not.toHaveBeenCalled();
      await blocker.query("SAVEPOINT order_probe");
      await expect(blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE NOWAIT", [row.lead.id])).rejects.toMatchObject({ code: "55P03" });
      await blocker.query("ROLLBACK TO SAVEPOINT order_probe"); clock = new Date(now.getTime() + 1); await blocker.query("COMMIT");
      expect(await pending).toEqual({ ok: true, action: "escalated", episodeId: before.id, brokerId, result: "omitted" });
      expect(await episodes(row)).toEqual([{ ...before, escalatedAt: clock, escalationResult: "omitted", escalationReasonCode: "silence-48h", updatedAt: clock }]); expect(readClock).toHaveBeenCalledTimes(1);
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); client.release(); }
  });
  it.each(["inbound", "takeover", "agendamento"] as const)("writer %s confirmado sob lock prevalece antes da escalada", async (kind) => {
    const row = await fixture(48 * hour, kind === "inbound" ? "authorized" : "omitted"), before = await episodes(row), blocker = await db.$client.connect(), client = await db.$client.connect(), pid = deferred<number>();
    let pending: ReturnType<typeof expireEpisode> | undefined;
    try {
      await blocker.query("BEGIN"); const blockerPid = (await blocker.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = expire(row, now, pinned(client, pid)); const workerPid = await pid.promise;
      expect(workerPid).not.toBe(blockerPid); expect(await waitForLocks([workerPid], 1)).toBe(1);
      if (kind === "inbound") await blocker.query("INSERT INTO messages (id,tenant_id,conversation_id,sender,content,sent_at,whatsapp_phone_number_id) VALUES ($1,$2,$3,'lead','Inbound próprio writer T23',$4,$5)", [randomUUID(), tenantId, row.conversation.id, now, row.phoneNumberId]);
      if (kind === "takeover") await blocker.query("UPDATE leads SET human_takeover_at=$1 WHERE id=$2", [now, row.lead.id]);
      if (kind === "agendamento") await blocker.query("UPDATE leads SET status='qualificado_agendado',status_changed_by='agente' WHERE id=$1", [row.lead.id]);
      await blocker.query("COMMIT");
      expect(await pending).toEqual(kind === "inbound" ? { ok: false, reason: "context-changed" } : { ok: false, reason: "not-eligible", policyReason: "ineligible" });
      expect(await episodes(row)).toEqual(before);
      expect(await readLead(row)).toEqual({ ...row.lead, ...(kind === "takeover" ? { humanTakeoverAt: now } : {}), ...(kind === "agendamento" ? { status: "qualificado_agendado", statusChangedBy: "agente" } : {}) });
      expect(await thread(row)).toHaveLength(kind === "inbound" ? 2 : 1);
    } finally { await blocker.query("ROLLBACK"); if (pending) await Promise.allSettled([pending]); blocker.release(); client.release(); }
  });
});
