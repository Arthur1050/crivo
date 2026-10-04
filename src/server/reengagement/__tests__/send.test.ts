import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, reengagementEpisodes, tenants, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import * as cloudApi from "../../whatsapp/cloud-api";
import { authorizeDispatch, claimPreparation, reconcileAcceptance } from "../repository";
import { sendPreparedEpisode, type SendPreparedEpisodeOptions } from "../send";

const tenantId = randomUUID(), foreignTenant = randomUUID(), now = new Date("2026-10-06T15:00:00Z"), hour = 3600000;
let contact = 5534999600000;
const text = "Retomada própria T34", acceptedAt = new Date(now.getTime() + 1000);
async function fixture(silence = 22 * hour) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString(), wamid = `fixture-${randomUUID()}`;
  const [channel] = await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now, usageEnabled: false }).returning();
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T34", phone: "+5534900000000", externalId: String(contact++), status: "em_qualificacao", firstContactAt: now, whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Inbound próprio T34", sentAt: new Date(now.getTime() - silence), whatsappPhoneNumberId: phoneNumberId }).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  const claim = await claimPreparation({ tenantId }, lead.id, { anchorMessageId: anchor.id }, { now: () => now });
  if (!claim.ok || !claim.acquired) throw new Error("Fixture sem claim");
  await db.update(reengagementEpisodes).set({ originSessionStartMessageId: anchor.id, originSessionEndMessageId: anchor.id }).where(eq(reengagementEpisodes.id, claim.episodeId));
  return { lead, channel, conversation, anchor, wamid, ...claim };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function json(status: number, payload: unknown) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }); }
function send(row: Fixture, options: SendPreparedEpisodeOptions = {}, body = text) {
  return sendPreparedEpisode({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text: body }, { now: () => now, ...options });
}
async function episode(row: Fixture) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, row.episodeId)))[0]; }
async function outputs(row: Fixture) { return (await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).filter((message) => message.sender === "agente"); }
async function authorize(row: Fixture) { return authorizeDispatch({ tenantId }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text }, { expectedChannelRevision: row.channel.configurationRevision, now: () => now }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): NonNullable<SendPreparedEpisodeOptions["database"]> {
  const database = drizzle(client, { schema });
  return { select: database.select.bind(database), transaction: (callback, config) => database.transaction(async (tx) => {
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
beforeAll(async () => { await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T34", agentName: "Agente", supportedModality: "ambos" as const }))); });
beforeEach(() => { vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "synthetic-t34"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
afterAll(async () => {
  await db.delete(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantId));
  await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId)); await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId));
  await db.delete(messages).where(eq(messages.tenantId, tenantId)); await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId)); await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.$client.end();
});

describe("T34 — envio protegido e evidência factual", () => {
  it("marker/deadline precedem uma chamada; texto normalizado e autoria/identidade persistem sem efeito em inbound/uso", async () => {
    const row = await fixture(), fakeFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(await episode(row)).toMatchObject({ state: "authorized", submittedText: text, dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000) });
      expect(JSON.parse(init!.body as string)).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: row.lead.externalId, type: "text", text: { preview_url: false, body: text } });
      return json(200, { messages: [{ id: row.wamid }] });
    });
    const result = await send(row, { fetch: fakeFetch }, `  ${text}  `);
    expect(result).toMatchObject({ ok: true, episodeId: row.episodeId, state: "accepted", replay: false, wamid: row.wamid, acceptedAt: now });
    if (!result.ok || !result.messageId) throw new Error("Mensagem ausente");
    expect(await outputs(row)).toEqual([{ id: result.messageId, tenantId, conversationId: row.conversation.id, sender: "agente", content: text, sentAt: now, externalId: row.wamid, whatsappPhoneNumberId: row.channel.phoneNumberId, authorUserId: null, authorName: null }]);
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(row.lead);
    expect((await db.select().from(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, row.channel.phoneNumberId)))[0]).toEqual(row.channel);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("replay aceito retorna fatos mesmo com credencial/texto/canal alterados e não envia", async () => {
    const row = await fixture(), fakeFetch = vi.fn(async () => json(200, { messages: [{ id: row.wamid }] }));
    const first = await send(row, { fetch: fakeFetch }), before = await episode(row);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    await db.update(whatsappChannels).set({ configurationRevision: 2, ownershipVerifiedAt: null }).where(eq(whatsappChannels.phoneNumberId, row.channel.phoneNumberId));
    expect(await send(row, { fetch: fakeFetch }, "")).toEqual({ ...first, replay: true });
    expect(await episode(row)).toEqual(before); expect(fakeFetch).toHaveBeenCalledTimes(1); expect(await outputs(row)).toHaveLength(1);
  });

  it.each(["config", "empty", "overflow"])("falha %s antes do fetch libera só preparação elegível", async (failure) => {
    const row = await fixture(), fakeFetch = vi.fn();
    if (failure === "config") vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    expect(await send(row, { fetch: fakeFetch }, failure === "empty" ? " " : failure === "overflow" ? "😀".repeat(2048) + "x" : text)).toEqual({ ok: false, reason: failure === "config" ? "nao-configurado" : "texto-invalido" });
    expect(await episode(row)).toMatchObject({ state: "preparing", claimToken: null, claimExpiresAt: null, submittedText: null, dispatchAuthorizedAt: null });
    expect(await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => now })).toMatchObject({ ok: true, acquired: true, episodeId: row.episodeId });
    expect(fakeFetch).not.toHaveBeenCalled(); expect(await outputs(row)).toEqual([]);
  });

  it("dois workers em conexões independentes disputam o lead e fazem exatamente uma chamada", async () => {
    const row = await fixture(), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(), fakeFetch = vi.fn(async () => json(200, { messages: [{ id: row.wamid }] }));
    let pending: ReturnType<typeof send>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = [a, b].map((client, index) => send(row, { database: pinned(client, index ? pidB : pidA), fetch: fakeFetch }));
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]);
      expect(await waitForLocks(pids, 2)).toBe(2); expect(fakeFetch).not.toHaveBeenCalled(); await blocker.query("COMMIT");
      const results = await Promise.all(pending);
      expect(results.filter((result) => result.ok && !result.replay)).toHaveLength(1);
      expect(results.filter((result) => result.ok && result.replay)).toHaveLength(1);
      expect(await episode(row)).toMatchObject({ state: "accepted", wamid: row.wamid, dispatchAuthorizedAt: now });
      expect(await outputs(row)).toHaveLength(1); expect(fakeFetch).toHaveBeenCalledTimes(1);
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("recusa explícita persiste motivo/consumo sem mensagem e nunca reenvia", async () => {
    const row = await fixture(), fakeFetch = vi.fn(async () => json(400, { error: { code: 131047 } }));
    expect(await send(row, { fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "refused", replay: false });
    expect(await episode(row)).toMatchObject({ state: "refused", reasonCode: "meta-refused:131047", submittedText: text, dispatchAuthorizedAt: now });
    expect(await send(row, { fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "refused", replay: true });
    expect(await outputs(row)).toEqual([]); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each(["timeout", "crash", "5xx", "missing-identity"])("%s conserva incerteza e marcador sem reenvio", async (failure) => {
    const row = await fixture(), fakeFetch = vi.fn(async () => {
      if (failure === "timeout") throw new DOMException("synthetic timeout", "TimeoutError");
      if (failure === "crash") throw new Error("synthetic interruption");
      return failure === "5xx" ? json(503, { error: { code: 131047 } }) : json(200, {});
    });
    expect(await send(row, { fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "uncertain", replay: false });
    expect(await episode(row)).toMatchObject({ state: "uncertain", dispatchAuthorizedAt: now, dispatchCompletionDeadline: new Date(now.getTime() + 120000), submittedText: text, wamid: null });
    expect(await send(row, { fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "uncertain", replay: true });
    expect(await outputs(row)).toEqual([]); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("preflight falho após commit não libera claim nem reenvia", async () => {
    const row = await fixture(), fakeFetch = vi.fn(); let transactions = 0;
    const database: NonNullable<SendPreparedEpisodeOptions["database"]> = { select: db.select.bind(db), transaction: async (callback, config) => {
      const result = await db.transaction(callback, config);
      if (++transactions === 1) vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
      return result;
    } };
    expect(await send(row, { database, fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "uncertain", replay: false });
    expect(await episode(row)).toMatchObject({ state: "uncertain", reasonCode: "transport-not-called", dispatchAuthorizedAt: now, claimToken: row.claimToken });
    expect(await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => now })).toEqual({ ok: true, acquired: false, episodeId: row.episodeId, state: "uncertain" });
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("exceção entre autorização e entrada do transporte é incerta e jamais libera claim", async () => {
    const row = await fixture(), transport = vi.spyOn(cloudApi, "sendProactiveWhatsAppText").mockRejectedValue(new Error("synthetic crash after marker"));
    expect(await send(row)).toEqual({ ok: true, episodeId: row.episodeId, state: "uncertain", replay: false });
    expect(await episode(row)).toMatchObject({ state: "uncertain", reasonCode: "transport-failure", dispatchAuthorizedAt: now, claimToken: row.claimToken });
    expect(await send(row)).toEqual({ ok: true, episodeId: row.episodeId, state: "uncertain", replay: true }); expect(transport).toHaveBeenCalledTimes(1);
  });

  it("falha ao gravar incerteza mantém marker; replay não chama novamente", async () => {
    const row = await fixture(), fakeFetch = vi.fn(async () => { throw new Error("synthetic network failure"); }); let transactions = 0;
    const database: NonNullable<SendPreparedEpisodeOptions["database"]> = { select: db.select.bind(db), transaction: (callback, config) => {
      const attempt = ++transactions;
      return db.transaction(async (tx) => { const result = await callback(tx); if (attempt === 2) throw new Error("synthetic evidence rollback"); return result; }, config);
    } };
    expect(await send(row, { database, fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "uncertain", replay: false });
    expect(await episode(row)).toMatchObject({ state: "authorized", wamid: null, dispatchAuthorizedAt: now });
    expect(await send(row, { fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "authorized", replay: true }); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("registro falho conserva identidade durável e retorna ack; ack só persiste sem outra chamada", async () => {
    const row = await fixture(), fakeFetch = vi.fn(async () => json(200, { messages: [{ id: row.wamid }] })); let transactions = 0;
    const database: NonNullable<SendPreparedEpisodeOptions["database"]> = { select: db.select.bind(db), transaction: (callback, config) => {
      const attempt = ++transactions;
      return db.transaction(async (tx) => { const result = await callback(tx); if (attempt === 3) throw new Error("synthetic rollback after record"); return result; }, config);
    } };
    expect(await send(row, { database, fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "accepted_pending_record", replay: false, wamid: row.wamid, acceptedAt: now });
    expect(await episode(row)).toMatchObject({ state: "accepted_pending_record", wamid: row.wamid, acceptedAt: now, messageId: null, dispatchAuthorizedAt: now });
    expect(await outputs(row)).toEqual([]);
    expect(await send(row, { fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "accepted_pending_record", replay: true, wamid: row.wamid, acceptedAt: now });
    expect(await reconcileAcceptance({ tenantId }, row.lead.id, row.episodeId, {}, { now: () => acceptedAt })).toMatchObject({ ok: true, recorded: true, replay: false });
    expect(await episode(row)).toMatchObject({ state: "accepted", acceptedAt: now }); expect(await outputs(row)).toHaveLength(1); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("falha de gravação da própria identidade retorna fato só ao caller, marker permanece e ack recupera", async () => {
    const row = await fixture(), fakeFetch = vi.fn(async () => json(200, { messages: [{ id: row.wamid }] })); let transactions = 0;
    const database: NonNullable<SendPreparedEpisodeOptions["database"]> = { select: db.select.bind(db), transaction: (callback, config) => {
      const attempt = ++transactions;
      return db.transaction(async (tx) => { const result = await callback(tx); if (attempt === 2) throw new Error("synthetic rollback evidence"); return result; }, config);
    } };
    expect(await send(row, { database, fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state: "accepted_pending_record", replay: false, wamid: row.wamid, acceptedAt: now });
    expect(await episode(row)).toMatchObject({ state: "authorized", wamid: null, acceptedAt: null, dispatchAuthorizedAt: now });
    expect(await reconcileAcceptance({ tenantId }, row.lead.id, row.episodeId, { wamid: row.wamid, acceptedAt: now }, { now: () => acceptedAt })).toMatchObject({ ok: true, recorded: true });
    expect(await outputs(row)).toHaveLength(1); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it.each([119999, 120000])("autorização abandonada em %sms só muda no deadline de2min", async (elapsed) => {
    const row = await fixture(); expect(await authorize(row)).toMatchObject({ ok: true, authorized: true }); const before = await episode(row), fakeFetch = vi.fn();
    const state = elapsed < 120000 ? "authorized" : "uncertain", timestamp = new Date(now.getTime() + elapsed);
    expect(await send(row, { now: () => timestamp, fetch: fakeFetch })).toEqual({ ok: true, episodeId: row.episodeId, state, replay: true });
    expect(await episode(row)).toEqual(elapsed < 120000 ? before : { ...before, state, reasonCode: "dispatch-abandoned", updatedAt: timestamp });
    expect(fakeFetch).not.toHaveBeenCalled(); expect(await outputs(row)).toEqual([]);
  });

  it("deadline não rebaixa identidade aceita pendente de registro", async () => {
    const row = await fixture(); await authorize(row);
    await db.update(reengagementEpisodes).set({ state: "accepted_pending_record", wamid: row.wamid, acceptedAt }).where(eq(reengagementEpisodes.id, row.episodeId));
    const before = await episode(row), fakeFetch = vi.fn();
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
    expect(await send(row, { now: () => new Date(now.getTime() + 120000), fetch: fakeFetch }, "")).toEqual({ ok: true, episodeId: row.episodeId, state: "accepted_pending_record", replay: true, wamid: row.wamid, acceptedAt });
    expect(await episode(row)).toEqual(before); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it.each(["claim", "lease"])("%s inválida impede autorização e transporte", async (change) => {
    const row = await fixture(), fakeFetch = vi.fn();
    if (change === "claim") await db.update(reengagementEpisodes).set({ claimToken: randomUUID() }).where(eq(reengagementEpisodes.id, row.episodeId));
    const before = await episode(row);
    expect(await send(row, { now: () => new Date(now.getTime() + (change === "lease" ? 300000 : 0)), fetch: fakeFetch })).toEqual({ ok: false, reason: change === "claim" ? "claim-conflict" : "claim-expired" });
    expect(await episode(row)).toEqual(before); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("revisão interna do canal muda entre snapshot e autorização e cancela sem fetch", async () => {
    const row = await fixture(), fakeFetch = vi.fn(); let transactions = 0;
    const database: NonNullable<SendPreparedEpisodeOptions["database"]> = { select: db.select.bind(db), transaction: async (callback, config) => {
      if (++transactions === 1) await db.update(whatsappChannels).set({ configurationRevision: 2 }).where(eq(whatsappChannels.phoneNumberId, row.channel.phoneNumberId));
      return db.transaction(callback, config);
    } };
    expect(await send(row, { database, fetch: fakeFetch })).toEqual({ ok: false, reason: "context-changed" });
    expect(await episode(row)).toMatchObject({ state: "cancelled", dispatchAuthorizedAt: null }); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it.each(["takeover", "optout", "window"])("gate vivo %s impede fetch e persiste cancelamento/omissão", async (change) => {
    const row = await fixture(change === "window" ? 24 * hour - 1 : 22 * hour), fakeFetch = vi.fn();
    if (change === "takeover") await db.update(leads).set({ humanTakeoverAt: now }).where(eq(leads.id, row.lead.id));
    if (change === "optout") await db.update(leads).set({ optedOutAt: now }).where(eq(leads.id, row.lead.id));
    const result = await send(row, { now: () => new Date(now.getTime() + (change === "window" ? 1 : 0)), fetch: fakeFetch });
    expect(result).toEqual({ ok: false, reason: "not-eligible", policyReason: change === "window" ? "window-closed" : "ineligible" });
    expect(await episode(row)).toMatchObject({ state: change === "window" ? "omitted" : "cancelled", dispatchAuthorizedAt: null, submittedText: null }); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("tenant/lead/episódio incorretos não acessam transporte nem mudam registros", async () => {
    const row = await fixture(), other = await fixture(), before = await episode(row), fakeFetch = vi.fn();
    expect(await sendPreparedEpisode({ tenantId: foreignTenant }, row.lead.id, row.episodeId, { claimToken: row.claimToken, text }, { fetch: fakeFetch })).toEqual({ ok: false, reason: "lead-not-found" });
    expect(await sendPreparedEpisode({ tenantId }, other.lead.id, row.episodeId, { claimToken: row.claimToken, text }, { fetch: fakeFetch })).toEqual({ ok: false, reason: "episode-not-found" });
    expect(await sendPreparedEpisode({ tenantId }, row.lead.id, "invalid", { claimToken: row.claimToken, text }, { fetch: fakeFetch })).toEqual({ ok: false, reason: "invalid-input" });
    expect(await episode(row)).toEqual(before); expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("ack concorrente já aceito não é rebaixado pela resposta incerta posterior", async () => {
    const row = await fixture(), fakeFetch = vi.fn(async () => {
      expect(await reconcileAcceptance({ tenantId }, row.lead.id, row.episodeId, { wamid: row.wamid, acceptedAt }, { now: () => acceptedAt })).toMatchObject({ ok: true, recorded: true });
      return json(503, {});
    });
    expect(await send(row, { fetch: fakeFetch })).toMatchObject({ ok: true, episodeId: row.episodeId, state: "accepted", replay: false, wamid: row.wamid, acceptedAt });
    expect(await episode(row)).toMatchObject({ state: "accepted", acceptedAt, wamid: row.wamid, dispatchCompletionDeadline: new Date(now.getTime() + 120000) });
    expect(await outputs(row)).toHaveLength(1); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("ack concorrente com outra identidade retorna conflito e preserva aceite original", async () => {
    const row = await fixture(); let before!: Awaited<ReturnType<typeof episode>>, originalMessages!: Awaited<ReturnType<typeof outputs>>;
    const fakeFetch = vi.fn(async () => {
      expect(await reconcileAcceptance({ tenantId }, row.lead.id, row.episodeId, { wamid: row.wamid, acceptedAt }, { now: () => acceptedAt })).toMatchObject({ ok: true, recorded: true });
      before = await episode(row); originalMessages = await outputs(row);
      return json(200, { messages: [{ id: `different-${row.wamid}` }] });
    });
    expect(await send(row, { fetch: fakeFetch })).toEqual({ ok: false, reason: "identity-conflict" });
    expect(await episode(row)).toEqual(before); expect(await outputs(row)).toEqual(originalMessages);
    expect(before).toMatchObject({ state: "accepted", wamid: row.wamid, acceptedAt, dispatchCompletionDeadline: new Date(now.getTime() + 120000) }); expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("falhas não logam texto/token/mensagem de exceção", async () => {
    const row = await fixture(), errorLog = vi.spyOn(console, "error").mockImplementation(() => {}), warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await send(row, { fetch: async () => { throw new Error(text); } })).toEqual({ ok: true, episodeId: row.episodeId, state: "uncertain", replay: false });
    expect(errorLog).not.toHaveBeenCalled(); expect(warnLog).not.toHaveBeenCalled();
  });
});
