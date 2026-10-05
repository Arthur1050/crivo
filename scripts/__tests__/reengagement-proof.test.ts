import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db";
import * as schema from "../../src/db/schema";
import type { AuthContext } from "../../src/server/auth/session";
import { ingestAgentMessage } from "../../src/server/data";
import { getConversationUsage } from "../../src/server/data/whatsapp";
import { getSessionFrame, prepareFrame } from "../../src/server/reengagement/context";
import { claimPreparation, expireEpisode, listCandidates } from "../../src/server/reengagement/repository";
import { sendPreparedEpisode, type SendPreparedEpisodeOptions } from "../../src/server/reengagement/send";
import { createAnalyticsQuery } from "../../src/server/whatsapp/analytics-contract";
import { createStatusForwardingContext, ingestStatusBatch } from "../../src/server/whatsapp/statuses";
import { requiresSessionRebuild, selectSeedMessages, toSeedMemoryItem } from "../../n8n/src/session.mjs";
import { checkReengagementPublication } from "../reengagement-publication-check";
import { DEFERRED_USAGE_UI, loadProofScheduler, PROOF_LINKS, readProofThread, runFixtureEpisode, runGatedProof,
  type FixtureEpisodeOptions, type ProofExecutionArtifact, type RealProofGates } from "../reengagement-proof";

const { tenants, users, leads, conversations, messages, leadAgentState, whatsappChannels, whatsappUsage, whatsappMessageReceipts, reengagementEpisodes } = schema;
const tenantId = randomUUID(), userId = randomUUID(), foreignTenant = randomUUID();
const slug = `fixture-${tenantId}`, now = new Date("2026-10-06T15:00:00Z"), hour = 3600000;
let contact = 5534999700000;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const auth: AuthContext = { tenantId, user: { id: userId, name: "Fixture T68", email: "proof@fixture.invalid" }, roles: ["gestor"], leadScope: { tenantId, assignedUserId: null } };
const text = "Podemos retomar a escolha das vagas?";
const json = (payload: unknown) => new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
async function fixture(silence = 22 * hour) {
  const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
  const anchorAt = new Date(now.getTime() - silence);
  const [channel] = await db.insert(whatsappChannels).values({ tenantId, phoneNumberId, ownershipVerifiedAt: now,
    accountTimezone: "UTC", wabaId: "1000000000000000", analyticsPhoneNumber: String(contact++), accountKind: "production",
    analyticsVerifiedAt: now, usageEnabled: true }).returning();
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T68", phone: "+5534900000000", externalId: String(contact++),
    createdAt: now, firstContactAt: anchorAt, status: "em_qualificacao", whatsappPhoneNumberId: phoneNumberId }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [old, human, anchor] = await db.insert(messages).values([
    { sender: "lead" as const, content: "Sessão já encerrada", sentAt: new Date(anchorAt.getTime() - 20 * hour) },
    { sender: "humano" as const, content: "Duas vagas confirmadas", authorName: "Ana", sentAt: new Date(anchorAt.getTime() - 1800000) },
    { sender: "lead" as const, content: "Quero escolher as vagas", sentAt: anchorAt },
  ].map((message) => ({ ...message, tenantId, conversationId: conversation.id, whatsappPhoneNumberId: phoneNumberId }))).returning();
  await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando" });
  return { channel, lead, conversation, old, human, anchor, wamid: `wamid.fixture.${randomUUID()}` };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function claim(row: Fixture) {
  const result = await claimPreparation({ tenantId }, row.lead.id, { anchorMessageId: row.anchor.id }, { now: () => now });
  if (!result.ok || !result.acquired) throw new Error("fixture-claim-missing");
  const prepared = await prepareFrame({ tenantId }, row.lead.id, result.episodeId, { claimToken: result.claimToken }, { now: () => now });
  if (!prepared.ok) throw new Error("fixture-frame-missing");
  return result;
}
function options(row: Fixture, patch: Partial<FixtureEpisodeOptions> = {}): FixtureEpisodeOptions {
  return { tenantSlug: slug, auth, leadId: row.lead.id, conversationId: row.conversation.id, now: () => now,
    generate: async () => ({ ok: true, text: ` ${text} ` }), fetch: vi.fn(async () => json({ messages: [{ id: row.wamid }] })), ...patch };
}
async function episode(id: string) { return (await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.id, id)))[0]; }
async function outputs(row: Fixture) { return (await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).filter((message) => message.sender === "agente"); }
async function receipt(row: Fixture, pricingType = "free_customer_service", billable = false) {
  const key = "synthetic-proof-forwarder";
  const ctx = createStatusForwardingContext({ tenantId }, new Request("http://fixture/status", { headers: { Authorization: `Bearer ${key}` } }),
    { workflowId: "fixture-status", activeVersionId: randomUUID(), triggerVersion: 1, verifiedAt: now, signatureAlgorithm: "hmac-sha256",
      signatureInput: "raw-body", rejectsInvalidSignatures: true, credentialSha256: hash(key) });
  if (!ctx) throw new Error("fixture-status-context-missing");
  return ingestStatusBatch(ctx, { phoneNumberId: row.channel.phoneNumberId, statuses: [{ wamid: row.wamid, status: "delivered", timestamp: now.toISOString(),
    pricing: { pricingModel: "PMP", category: "service", pricingType, billable } }] }, { now });
}
async function snapshot(row: Fixture, used: number, clock = now, timezone = "UTC", lastSuccessAt = clock) {
  await db.update(whatsappChannels).set({ accountTimezone: timezone }).where(eq(whatsappChannels.phoneNumberId, row.channel.phoneNumberId));
  const query = createAnalyticsQuery({ phoneNumberId: row.channel.phoneNumberId, phoneNumber: row.channel.analyticsPhoneNumber!, wabaId: row.channel.wabaId!, accountTimezone: timezone, now: clock });
  if (!query) throw new Error("fixture-period-missing");
  await db.insert(whatsappUsage).values({ tenantId, phoneNumberId: row.channel.phoneNumberId, configurationRevision: 1, accountTimezone: query.accountTimezone,
    monthStart: query.monthStart, monthEnd: query.monthEnd, queryEnd: query.queryEnd, freeServiceVolume: used, lastSuccessAt }).onConflictDoUpdate({
      target: [whatsappUsage.tenantId, whatsappUsage.phoneNumberId, whatsappUsage.monthStart, whatsappUsage.configurationRevision],
      set: { freeServiceVolume: used, queryEnd: query.queryEnd, lastSuccessAt } });
  return query;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): NonNullable<SendPreparedEpisodeOptions["database"]> {
  const database = drizzle(client, { schema });
  return { select: database.select.bind(database), transaction: (callback, config) => database.transaction(async (tx) => {
    pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx);
  }, config) };
}
async function waiting(pids: number[], count: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = (await db.$client.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].count;
    if (result === count) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}
const pendingPublication = () => checkReengagementPublication([], { handlerHash: hash("fixture-handlers"), schemaHash: hash("fixture-schema") }, {
  targets: [{ role: "principal", workflowId: "0B1nqjODu7xuYYKF" }], installed: [{ source: "n8n-readonly", workflowId: "0B1nqjODu7xuYYKF", active: true,
    observedAt: "2026-10-05T11:08:30Z", latestSavedVersionId: "e3e25681-8cd1-4ea3-bc38-33d373cf6b80" }],
  queues: [{ source: "n8n-readonly", workflowId: "0B1nqjODu7xuYYKF", observedAt: "2026-10-05T11:08:30Z", requestedStatuses: ["new", "running", "waiting", "unknown"], count: 0, estimated: false, data: [] }],
});
const gates = (ready = false): RealProofGates => ({ publication: { ...pendingPublication(), ready },
  benchmark: { sharedIdentityEqual: true, remeasured: false, capacityVerified: true }, executorEvidence: { authorized: true, gateExecutionId: "fixture-gate" } });
function proofInput(row: Fixture): ProofExecutionArtifact["input"] { return { tenantId, leadId: row.lead.id, conversationId: row.conversation.id, anchorMessageId: row.anchor.id, textHash: hash(text) }; }
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T68", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(users).values({ id: userId, name: "Fixture", email: `${userId}@fixture.invalid` });
});
beforeEach(() => { vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "synthetic-t68"); vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("external-transport-forbidden"); })); });
afterEach(async () => {
  await db.delete(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantId));
  await db.delete(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantId));
  await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantId));
  await db.delete(whatsappUsage).where(eq(whatsappUsage.tenantId, tenantId));
  await db.delete(messages).where(eq(messages.tenantId, tenantId));
  await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
  await db.delete(leads).where(eq(leads.tenantId, tenantId));
  await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantId));
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
afterAll(async () => { await db.delete(tenants).where(eq(tenants.id, tenantId)); await db.delete(tenants).where(eq(tenants.id, foreignTenant)); await db.delete(users).where(eq(users.id, userId)); await db.$client.end(); });

describe("T68 — prova integrada por resultado, fixtures PG reais", () => {
  it("scheduler→frame→texto→send→CRM→receipt→thread usa contratos efetivos e escopo", async () => {
    const row = await fixture(), opts = options(row, { generate: vi.fn(async (frame, prompt) => {
      expect(frame.history.map((message: { id: string }) => message.id)).toEqual([row.human.id, row.anchor.id]);
      expect(JSON.stringify(prompt)).toContain("Duas vagas confirmadas");
      expect(JSON.stringify(prompt)).not.toContain("Sessão já encerrada");
      return { ok: true, text: ` ${text} ` };
    }), recordReceipt: async () => { await receipt(row); } });
    const result = await runFixtureEpisode(opts);
    expect(result.executed).toBe(true);
    if (!result.executed) throw new Error("chain-not-executed");
    expect(result.sent).toMatchObject({ state: "accepted", wamid: row.wamid, replay: false });
    expect(result.thread.rows.find((message) => message.externalId === row.wamid)).toMatchObject({ sender: "agente", content: text, sentAt: now });
    expect(result.thread.markup).toContain(text); expect(result.thread.markup).toContain("Gratuita — franquia de serviço");
    expect(result.thread.markup).toContain("Ana"); expect(result.externalProof).toBe(false); expect(result.deferredUsageUI).toEqual(DEFERRED_USAGE_UI);
    expect(opts.fetch).toHaveBeenCalledTimes(1); expect(await outputs(row)).toHaveLength(1);
    expect(await readProofThread({ ...auth, tenantId: foreignTenant, leadScope: { tenantId: foreignTenant, assignedUserId: null } }, row.conversation.id)).toMatchObject({ rows: [], pricing: [] });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("remover qualquer ligação ou romper geração bloqueia a saída persistida", async () => {
    const row = await fixture(), graph = await loadProofScheduler(), opts = options(row);
    for (const [from, output, to] of PROOF_LINKS) {
      const broken = structuredClone(graph); broken.connections[from].main![output] = broken.connections[from].main![output]!.filter((edge) => edge.node !== to);
      await expect(runFixtureEpisode({ ...opts, graph: broken })).rejects.toThrow("proof-scheduler-link-missing");
    }
    expect(await runFixtureEpisode({ ...opts, generate: async () => ({ ok: true, text: " " }) })).toMatchObject({ executed: false, code: "invalid-text" });
    expect(opts.fetch).not.toHaveBeenCalled(); expect(await outputs(row)).toEqual([]);
    expect((await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.leadId, row.lead.id)))[0]).toMatchObject({ claimToken: null, dispatchAuthorizedAt: null });
  });

  it("22/24/48h discriminam preparação, omissão e escalada sem transporte", async () => {
    const rows = await Promise.all([22 * hour - 1, 22 * hour, 22 * hour + 1, 24 * hour - 1, 24 * hour, 24 * hour + 1, 48 * hour - 1, 48 * hour, 48 * hour + 1].map(fixture));
    const page = await listCandidates({ tenantId }, {}, { now: () => now }); if (!page.ok) throw new Error("page-missing");
    expect(rows.map((row) => page.candidates.find((candidate) => candidate.leadId === row.lead.id)?.action ?? null)).toEqual([null, "prepare", "prepare", "prepare", "omit", "omit", "omit", "escalate", "escalate"]);
    const expired = rows[7]; const result = await expireEpisode({ tenantId }, expired.lead.id, { anchorMessageId: expired.anchor.id }, { now: () => now });
    expect(result).toMatchObject({ ok: true, action: "escalated" });
    expect(await expireEpisode({ tenantId }, expired.lead.id, { anchorMessageId: expired.anchor.id }, { now: () => now })).toMatchObject({ ok: true, action: "unchanged" });
    expect((await db.select().from(leads).where(eq(leads.id, expired.lead.id)))[0]).toMatchObject({ status: "escalado_humano" }); expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("999/1000/1001 são snapshots; FEP e replay não fabricam quota nem inbound", async () => {
    const rows: Fixture[] = []; const results: Awaited<ReturnType<typeof runFixtureEpisode>>[] = [];
    for (const [used, remaining, pricingType, billable, label] of [
      [999, 1, "free_customer_service", false, "Gratuita — franquia de serviço"],
      [1000, 0, "free_customer_service", false, "Gratuita — franquia de serviço"],
      [1001, 0, "regular", true, "Tarifável — confirmado pela Meta"],
    ] as const) {
      const row = await fixture(), opts = options(row), result = await runFixtureEpisode(opts); if (!result.executed) throw new Error("send-missing");
      rows.push(row); results.push(result); expect(opts.fetch).toHaveBeenCalledTimes(1);
      await snapshot(row, used); expect(await getConversationUsage(auth, row.conversation.id, { now: () => now })).toMatchObject({ state: "available", used, remaining });
      await receipt(row, pricingType, billable);
      const thread = await readProofThread(auth, row.conversation.id); expect(thread.markup).toContain(label);
      expect(thread.pricing).toContainEqual(expect.objectContaining({ messageId: result.sent.messageId, state: billable ? "paid-service" : "free-service" }));
    }
    // Três saídas fake para quotas, sem fabricar mil chamadas ou inferir preço.
    const row = rows[2], result = results[2]; if (!result.executed) throw new Error("send-missing");
    const fepRow = await fixture(), fepOptions = options(fepRow); expect(await runFixtureEpisode(fepOptions)).toMatchObject({ executed: true });
    expect(fepOptions.fetch).toHaveBeenCalledTimes(1); await snapshot(fepRow, 999);
    await receipt(fepRow, "free_entry_point"); await receipt(fepRow, "free_entry_point");
    expect((await readProofThread(auth, fepRow.conversation.id)).markup).toContain("Gratuita — janela de entrada gratuita");
    expect(await getConversationUsage(auth, row.conversation.id, { now: () => now })).toMatchObject({ used: 1001, remaining: 0 });
    expect(await getConversationUsage(auth, fepRow.conversation.id, { now: () => now })).toMatchObject({ used: 999, remaining: 1 });
    expect(await getConversationUsage(auth, rows[0].conversation.id, { now: () => now })).toMatchObject({ used: 999, remaining: 1 });
    expect(await getConversationUsage(auth, rows[1].conversation.id, { now: () => now })).toMatchObject({ used: 1000, remaining: 0 });
    const fakeFetch = vi.fn(); expect(await sendPreparedEpisode({ tenantId }, row.lead.id, result.episodeId, { claimToken: result.claimToken, text }, { fetch: fakeFetch, now: () => now })).toMatchObject({ replay: true, state: "accepted" });
    expect(fakeFetch).not.toHaveBeenCalled(); expect(await outputs(row)).toHaveLength(1);
    expect((await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)))[0].anchorMessageId).toBe(row.anchor.id);
  }, 90000);

  it("mês civil IANA, stale e canal desconhecido nunca inferem disponibilidade", async () => {
    const row = await fixture(), before = new Date("2026-11-01T06:59:59Z"), after = new Date("2026-11-01T07:00:00Z");
    const query = await snapshot(row, 999, before, "America/Los_Angeles"); expect(query.monthStart.toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(await getConversationUsage(auth, row.conversation.id, { now: () => before })).toMatchObject({ used: 999, stale: false });
    expect(await getConversationUsage(auth, row.conversation.id, { now: () => after })).toMatchObject({ state: "unavailable" });
    await snapshot(row, 0, after, "America/Los_Angeles", new Date(after.getTime() - hour));
    expect(await getConversationUsage(auth, row.conversation.id, { now: () => after })).toMatchObject({ used: 0, remaining: 1000, stale: false });
    expect(await getConversationUsage(auth, row.conversation.id, { now: () => new Date(after.getTime() + 1) })).toMatchObject({ stale: true });
    await db.update(leads).set({ whatsappPhoneNumberId: null }).where(eq(leads.id, row.lead.id));
    expect(await getConversationUsage(auth, row.conversation.id, { now: () => after })).toMatchObject({ state: "unknown-number" }); expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("warm/cold recompõem ponte aceita com autoria humana e excluem buffer corrente", async () => {
    const row = await fixture(); const sent = await runFixtureEpisode(options(row)); if (!sent.executed) throw new Error("send-missing");
    const inboundAt = new Date(now.getTime() + hour);
    const ingested = await ingestAgentMessage(tenantId, row.lead.id, { externalId: `fixture-${randomUUID()}`, sender: "lead", content: "Sim, vamos continuar", sentAt: inboundAt, whatsappPhoneNumberId: row.channel.phoneNumberId }, { now: () => inboundAt });
    if (!ingested) throw new Error("inbound-missing");
    const inbound = ingested.message;
    const result = await getSessionFrame({ tenantId }, row.lead.id, { bufferMessageIds: [inbound.id] }, { now: () => inboundAt });
    if (!result.ok) throw new Error("bridge-missing");
    expect(requiresSessionRebuild(result.frame, [inbound.id])).toBe(true);
    expect(result.history.map((message) => message.id)).toEqual([row.human.id, row.anchor.id, sent.sent.messageId]);
    expect(result.history.map(toSeedMemoryItem)).toContainEqual(expect.objectContaining({ type: "system", message: expect.stringContaining("Ana") }));
    const all = (await readProofThread(auth, row.conversation.id)).rows.map((message) => ({ ...message, sentAt: message.sentAt.toISOString() }));
    const cold = selectSeedMessages(all, inboundAt.toISOString(), { frame: result.frame, excludeMessageIds: [inbound.id] });
    expect(cold.map((message) => message.id)).toEqual(result.history.map((message) => message.id));
    const runtimePath = "../../n8n/generated/principal";
    const graph = (await import(runtimePath)).default.toJSON() as unknown as { nodes: { name: string; parameters: Record<string, unknown> }[]; connections: Record<string, { main?: ({ node: string }[] | null)[] }> };
    const run = (name: string, input: unknown, contexts: Record<string, unknown>) => {
      const node = graph.nodes.find((entry) => entry.name === name); if (!node) throw new Error("principal-proof-node-missing");
      const $ = (key: string) => { if (!(key in contexts)) throw new Error(key); const data = contexts[key]; return { first: () => ({ json: Array.isArray(data) ? data[0] : data }), all: () => (Array.isArray(data) ? data : [data]).map((json) => ({ json })) }; };
      return new Function("$json", "$input", "$", node.parameters.jsCode as string)(input, { first: () => ({ json: Array.isArray(input) ? input[0] : input }), all: () => (Array.isArray(input) ? input : [input]).map((json) => ({ json })) }, $);
    };
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(inboundAt);
    try {
      const ready = run("Code: session-context pronto", result, { "Code: iniciar leitura session-context": { deadline: inboundAt.getTime() + 120000, bufferMessageIds: [inbound.id], tenantSlug: slug, leadId: row.lead.id } }).json;
      const checked = run("Code: sessão expirada?", ready, { "Code: session-context pronto": ready, "Data Table: conversa_estado (antes do buffer)": { lastInboundAt: row.anchor.sentAt.toISOString(), memoryResetAt: null }, "Code: combinar evento e tenant": { sentAt: inboundAt.toISOString() }, "Code: gate": { memoryResetRequestedAt: null } })[0].json;
      expect(checked).toMatchObject({ bridgeRebuild: true, expired: false, sessionExpired: false });
      expect(graph.connections["Reconstruir memória warm da ponte?"].main![0]).toContainEqual(expect.objectContaining({ node: "Chat Memory Manager: reconstruir ponte warm" }));
      const purge = graph.nodes.find((entry) => entry.name === "Chat Memory Manager: reconstruir ponte warm")!;
      expect(purge.parameters).toEqual({ mode: "delete", deleteMode: "all" });
      let warmMemory = [{ type: "user", message: row.old.content }];
      if (checked.bridgeRebuild && purge.parameters.mode === "delete" && purge.parameters.deleteMode === "all") warmMemory = [];
      const warmSeed = run("Code: selecionar mensagens de semeadura", all, { "Code: sessão expirada?": checked }).map((entry: { json: { type: string; message: string } }) => ({ type: entry.json.type, message: entry.json.message }));
      warmMemory.push(...warmSeed);
      const coldMemory = run("Code: selecionar mensagens de semeadura", all, { "Code: sessão expirada?": checked }).map((entry: { json: { type: string; message: string } }) => ({ type: entry.json.type, message: entry.json.message }));
      expect(warmMemory).toEqual(coldMemory); expect(coldMemory).toEqual(result.history.map(toSeedMemoryItem));
      expect(warmMemory).toContainEqual({ type: "system", message: "Mensagem enviada ao lead por Ana, da equipe da imobiliária: Duas vagas confirmadas" });
      expect(warmMemory.map((entry) => entry.message)).not.toContain(row.old.content); expect(warmMemory.map((entry) => entry.message)).not.toContain(inbound.content);
    } finally { vi.useRealTimers(); }
    expect(cold.map((message) => message.id)).not.toContain(row.old.id); expect(cold.map((message) => message.id)).not.toContain(inbound.id);
  });

  it("opt-out e condução humana impedem preparação sem tocar envio humano", async () => {
    const opted = await fixture(), human = await fixture();
    await db.update(leads).set({ optedOutAt: now }).where(eq(leads.id, opted.lead.id));
    await db.update(leads).set({ humanTakeoverAt: now, statusChangedBy: "humano" }).where(eq(leads.id, human.lead.id));
    for (const row of [opted, human]) { const opts = options(row); expect(await runFixtureEpisode(opts)).toMatchObject({ executed: false }); expect(opts.fetch).not.toHaveBeenCalled(); expect(await outputs(row)).toEqual([]); }
    expect((await readProofThread(auth, human.conversation.id)).rows.find((message) => message.id === human.human.id)).toMatchObject({ sender: "humano", authorName: "Ana", content: "Duas vagas confirmadas" });
  });

  it("duas conexões PG competem e consomem despacho uma única vez", async () => {
    const row = await fixture(), acquired = await claim(row), blocker = await db.$client.connect(), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(), fake = vi.fn(async () => json({ messages: [{ id: row.wamid }] }));
    let pending: ReturnType<typeof sendPreparedEpisode>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      pending = [a, b].map((client, index) => sendPreparedEpisode({ tenantId }, row.lead.id, acquired.episodeId, { claimToken: acquired.claimToken, text }, { database: pinned(client, index ? pidB : pidA), fetch: fake, now: () => now }));
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waiting(pids, 2)).toBe(2);
      expect(fake).not.toHaveBeenCalled(); await blocker.query("COMMIT");
      const results = await Promise.all(pending); expect(results.filter((result) => result.ok && !result.replay)).toHaveLength(1); expect(results.filter((result) => result.ok && result.replay)).toHaveLength(1);
      expect(fake).toHaveBeenCalledTimes(1); expect(await outputs(row)).toHaveLength(1); expect(await episode(acquired.episodeId)).toMatchObject({ state: "accepted", dispatchAuthorizedAt: now });
    } finally { await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); a.release(); b.release(); }
  });

  it("takeover ou inbound antes do commit vence a autorização aguardando lock", async () => {
    for (const change of ["human", "inbound"] as const) {
      const row = await fixture(), acquired = await claim(row), holder = await db.$client.connect(), sender = await db.$client.connect();
      const holderDb = drizzle(holder, { schema }), ready = deferred<number>(), release = deferred<void>(), senderPid = deferred<number>(), fake = vi.fn();
      let pending: ReturnType<typeof sendPreparedEpisode> | undefined;
      const locked = holderDb.transaction(async (tx) => {
        await tx.select().from(leads).where(eq(leads.id, row.lead.id)).for("update"); ready.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid);
        await release.promise;
        if (change === "human") await tx.update(leads).set({ humanTakeoverAt: now, statusChangedBy: "humano" }).where(eq(leads.id, row.lead.id));
        else await ingestAgentMessage(tenantId, row.lead.id, { sender: "lead", externalId: `fixture-${randomUUID()}`, content: "Resposta nova", sentAt: now, whatsappPhoneNumberId: row.channel.phoneNumberId }, { now: () => now, database: { transaction: (callback) => callback(tx) } });
      });
      try {
        const heldPid = await ready.promise;
        pending = sendPreparedEpisode({ tenantId }, row.lead.id, acquired.episodeId, { claimToken: acquired.claimToken, text }, { database: pinned(sender, senderPid), fetch: fake, now: () => now });
        const pid = await senderPid.promise; expect(pid).not.toBe(heldPid); expect(await waiting([pid], 1)).toBe(1);
        release.resolve(); await locked; expect(await pending).toMatchObject(change === "human" ? { ok: false, reason: "not-eligible", policyReason: "ineligible" } : { ok: true, state: "cancelled", replay: true });
        expect(fake).not.toHaveBeenCalled(); expect(await outputs(row)).toEqual([]); expect((await episode(acquired.episodeId)).dispatchAuthorizedAt).toBeNull();
      } finally { release.resolve(); await Promise.allSettled([locked, ...(pending ? [pending] : [])]); holder.release(); sender.release(); }
    }
  });

  it("aceite sem registro reconcilia acknowledgement sem reenviar", async () => {
    const row = await fixture(); let transactions = 0;
    const database: NonNullable<SendPreparedEpisodeOptions["database"]> = { select: db.select.bind(db), transaction: (callback, config) => {
      const attempt = ++transactions; return db.transaction(async (tx) => { const result = await callback(tx); if (attempt === 3) throw new Error("synthetic-record-rollback"); return result; }, config);
    } };
    const opts = options(row, { sendOptions: { database } }), result = await runFixtureEpisode(opts);
    if (!result.executed) throw new Error("accepted-not-reconciled");
    expect(result.sent).toMatchObject({ state: "accepted_pending_record", wamid: row.wamid, acceptedAt: now });
    expect(await episode(result.episodeId)).toMatchObject({ state: "accepted", wamid: row.wamid, dispatchAuthorizedAt: now });
    expect(await outputs(row)).toHaveLength(1); expect(opts.fetch).toHaveBeenCalledTimes(1); expect(result.thread.markup).toContain(text);
    const replayFetch = vi.fn(); expect(await sendPreparedEpisode({ tenantId }, row.lead.id, result.episodeId, { claimToken: result.claimToken, text }, { fetch: replayFetch, now: () => now })).toMatchObject({ replay: true, state: "accepted" }); expect(replayFetch).not.toHaveBeenCalled();
  });

  it("versões/filas e metadata ausentes recusam real sem chamadas ou capacidade inferida", async () => {
    const row = await fixture(), recheck = vi.fn(async () => gates()), executeSingleDelivery = vi.fn(), capture = vi.fn(), persist = vi.fn(), cleanup = vi.fn();
    const executor = { recheck, executeSingleDelivery, capture, persist, cleanup };
    expect(gates().publication.workflows.find((entry) => entry.role === "principal")).toMatchObject({ activeVersionId: null });
    expect(await runGatedProof({ mode: "real", gates: gates(), proofInput: proofInput(row) }, executor)).toMatchObject({ executed: false, externalProof: false });
    expect(recheck).not.toHaveBeenCalled();
    expect(await runGatedProof({ mode: "real", gates: gates(true), proofInput: proofInput(row) }, { ...executor, recheck: async () => gates(true) })).toMatchObject({ executed: false, pending: ["verified-executions-required"] });
    await expect(runGatedProof({ mode: "executor-test", gates: gates(true), proofInput: { ...proofInput(row), textHash: "secret-text" } }, executor)).rejects.toThrow("proof-input-metadata-invalid");
    await expect(runGatedProof({ mode: "executor-test", gates: gates(true), proofInput: { ...proofInput(row), leadId: "credential" } }, executor)).rejects.toThrow("proof-input-metadata-invalid");
    expect(await runGatedProof({ mode: "real", gates: { ...gates(true), benchmark: { sharedIdentityEqual: false, remeasured: false, capacityVerified: true } }, proofInput: proofInput(row) }, executor)).toMatchObject({ executed: false, pending: ["benchmark-evidence-pending"] });
    expect(executeSingleDelivery).not.toHaveBeenCalled(); expect(capture).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled(); expect(cleanup).not.toHaveBeenCalled(); expect(await outputs(row)).toEqual([]);
  });

  it("captura e artefato conferidos antecedem limpeza; falha conserva fixture e não vira prova externa", async () => {
    const row = await fixture(), result = await runFixtureEpisode(options(row)); if (!result.executed || !result.sent.messageId) throw new Error("fixture-output-missing");
    const directory = mkdtempSync(join(tmpdir(), "crivo-t68-")), image = join(directory, "fixture.capture"), artifactPath = join(directory, "fixture.json");
    const order: string[] = [], fresh = gates(true); fresh.publication = { ...fresh.publication, queues: [] };
    writeFileSync(image, "synthetic fixture capture; no browser or external execution");
    const delivery = { transportCalls: 1, episodeId: result.episodeId, wamid: row.wamid, messageId: result.sent.messageId, acceptedAt: now.toISOString() };
    const executor = {
      recheck: async () => { order.push("recheck"); return fresh; },
      executeSingleDelivery: async () => { order.push("execute"); return { ...delivery, text: "secret-text" }; },
      capture: async () => { order.push("capture"); return { path: image, sha256: hash(readFileSync(image)), credential: "secret-token" }; },
      persist: async (artifact: ProofExecutionArtifact) => { order.push("persist"); expect(artifact.publication).toEqual(fresh.publication); expect(artifact.executions).toEqual([]); expect(JSON.stringify(artifact)).not.toMatch(/secret-text|secret-token/); writeFileSync(artifactPath, JSON.stringify(artifact)); return { path: artifactPath, sha256: hash(readFileSync(artifactPath)) }; },
      cleanup: vi.fn(async () => { order.push("cleanup"); expect(JSON.parse(readFileSync(artifactPath, "utf8")).capture.sha256).toBe(hash(readFileSync(image))); expect(await outputs(row)).toHaveLength(1); }),
    };
    try {
      expect(await runGatedProof({ mode: "executor-test", gates: gates(true), proofInput: { ...proofInput(row), text: "secret-text" } as ProofExecutionArtifact["input"] }, executor)).toMatchObject({ executed: true, externalProof: false, completeProof: false, deferredUsageUI: DEFERRED_USAGE_UI });
      expect(order).toEqual(["recheck", "execute", "capture", "persist", "cleanup"]); executor.cleanup.mockClear();
      await expect(runGatedProof({ mode: "executor-test", gates: gates(true), proofInput: proofInput(row) }, { ...executor, capture: async () => ({ path: image, sha256: hash("wrong") }) })).rejects.toThrow("proof-capture-not-preserved");
      await expect(runGatedProof({ mode: "executor-test", gates: gates(true), proofInput: proofInput(row) }, { ...executor, executeSingleDelivery: async () => ({ ...delivery, episodeId: "token" }) })).rejects.toThrow("proof-single-delivery-evidence-invalid");
      await expect(runGatedProof({ mode: "real", gates: gates(true), proofInput: proofInput(row) }, { ...executor, executions: async () => [] })).rejects.toThrow("proof-executions-unverified");
      await expect(runGatedProof({ mode: "real", gates: gates(true), proofInput: proofInput(row) }, { ...executor, executions: async () => [{ workflowId: "old-workflow", executionId: "42", activeVersionId: randomUUID(), status: "success", verifiedBy: "get_execution" }] })).rejects.toThrow("proof-executions-unverified");
      expect(executor.cleanup).not.toHaveBeenCalled(); expect(await outputs(row)).toHaveLength(1); expect(await episode(result.episodeId)).toMatchObject({ state: "accepted" });
    } finally {
      const absoluteDirectory = resolve(directory);
      if (dirname(absoluteDirectory) === resolve(tmpdir()) && basename(absoluteDirectory).startsWith("crivo-t68-")) rmSync(absoluteDirectory, { recursive: true, force: true });
    }
  });
});
