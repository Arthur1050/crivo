import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, humanMessageSends, leadAgentState, leads, messages, tenants, users, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import { getLastLeadMessageAt, recordHumanMessage, reserveHumanSend } from "../index";

const tenantId = randomUUID(), foreignTenant = randomUUID(), authorId = randomUUID(), otherAuthor = randomUUID();
const now = new Date("2026-10-06T15:00:00.500Z"), inboundAt = new Date(now.getTime() - 3600000);
const actualChannel = "631000000000001", currentChannel = "631000000000002", foreignChannel = "631000000000003", unverifiedChannel = "631000000000004";
async function fixture(withInbound = true, reserve = true) {
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T31", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: inboundAt, whatsappPhoneNumberId: currentChannel, humanTakeoverAt: inboundAt, humanTakeoverBy: authorId }).returning();
  let anchor: typeof messages.$inferSelect | undefined;
  if (withInbound) {
    const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
    [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Inbound factual", sentAt: inboundAt, whatsappPhoneNumberId: actualChannel }).returning();
    await db.insert(leadAgentState).values({ tenantId, leadId: lead.id, anchorMessageId: anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["Olá"] });
  }
  const input = { tenantId, leadId: lead.id, requestId: randomUUID(), authorUserId: authorId, authorName: "Ana T31", content: "Mensagem humana real", wamid: `fixture-human-${randomUUID()}`, sentAt: now, whatsappPhoneNumberId: actualChannel };
  if (reserve) expect((await reserveHumanSend(tenantId, lead.id, authorId, input.requestId, inboundAt)).outcome).toBe("reservado");
  return { lead, anchor, input };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function reservation(row: Fixture) { return (await db.select().from(humanMessageSends).where(and(eq(humanMessageSends.tenantId, tenantId), eq(humanMessageSends.requestId, row.input.requestId))))[0]; }
async function projection(row: Fixture) { return db.select().from(leadAgentState).where(eq(leadAgentState.leadId, row.lead.id)); }
async function orphan(wamid: string, phoneNumberId = actualChannel, owner = tenantId) {
  return (await db.insert(whatsappMessageReceipts).values({ tenantId: owner, phoneNumberId, wamid, deliveredAt: now, classification: "free_service", pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false }).returning())[0];
}
async function receipts(wamid: string) { return db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, wamid)).orderBy(whatsappMessageReceipts.tenantId, whatsappMessageReceipts.phoneNumberId); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function pinned(client: PoolClient, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
  const database = drizzle(client, { schema });
  return { transaction: (callback, config) => database.transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
}
async function waitForLocks(pids: number[]) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids]);
    if (result.rows[0].waiting === pids.length) return result.rows[0].waiting;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return 0;
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantId, foreignTenant].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T31", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(users).values([authorId, otherAuthor].map((id) => ({ id, name: "Autora T31", email: `${id}@fixture.test` })));
  await db.insert(whatsappChannels).values([{ tenantId, phoneNumberId: actualChannel, ownershipVerifiedAt: now }, { tenantId, phoneNumberId: currentChannel, ownershipVerifiedAt: now }, { tenantId: foreignTenant, phoneNumberId: foreignChannel, ownershipVerifiedAt: now }, { tenantId, phoneNumberId: unverifiedChannel }]);
});
afterAll(async () => {
  const ids = [tenantId, foreignTenant];
  await db.delete(humanMessageSends).where(inArray(humanMessageSends.tenantId, ids)); await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids)); await db.delete(messages).where(inArray(messages.tenantId, ids)); await db.delete(conversations).where(inArray(conversations.tenantId, ids));
  await db.delete(leads).where(inArray(leads.tenantId, ids)); await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids)); await db.delete(tenants).where(inArray(tenants.id, ids));
  await db.delete(users).where(inArray(users.id, [authorId, otherAuthor])); await db.$client.end();
});

describe("T31 — registro humano preserva canal factual e correlaciona recibo", () => {
  it("número efetivamente usado prevalece sobre cadastro atual e não altera inbound/fase/fatos", async () => {
    const row = await fixture(), before = await projection(row), result = await recordHumanMessage(row.input);
    expect(result).toMatchObject({ sender: "humano", authorUserId: authorId, authorName: "Ana T31", whatsappPhoneNumberId: actualChannel, content: row.input.content, sentAt: now, externalId: row.input.wamid });
    expect(await db.select().from(leads).where(eq(leads.id, row.lead.id))).toEqual([row.lead]); expect(await projection(row)).toEqual(before);
    expect(await getLastLeadMessageAt(tenantId, row.lead.id)).toEqual(inboundAt);
    expect(await reservation(row)).toMatchObject({ state: "enviada", messageId: result!.id, wamid: row.input.wamid });
  });

  it.each([undefined, null])("legado canal%s continua nulo sem ligar recibo pelo número do lead", async (whatsappPhoneNumberId) => {
    const row = await fixture(), receipt = await orphan(row.input.wamid, currentChannel);
    const result = await recordHumanMessage({ ...row.input, whatsappPhoneNumberId });
    expect(result!.whatsappPhoneNumberId).toBeNull(); expect(await receipts(row.input.wamid)).toEqual([receipt]);
    expect(await getLastLeadMessageAt(tenantId, row.lead.id)).toEqual(inboundAt);
  });

  it("status órfão anterior liga exatamente por tenant/canal/wamid no commit do registro", async () => {
    const row = await fixture(), receipt = await orphan(row.input.wamid), result = await recordHumanMessage(row.input);
    expect(await receipts(row.input.wamid)).toEqual([{ ...receipt, messageId: result!.id, orphanExpiresAt: null }]);
    expect(await reservation(row)).toMatchObject({ state: "enviada", messageId: result!.id });
    expect(await getLastLeadMessageAt(tenantId, row.lead.id)).toEqual(inboundAt);
  });

  it("replay de reserva enviada conserva mensagem/canal/autoria/texto e timestamps originais", async () => {
    const row = await fixture(), first = await recordHumanMessage(row.input), before = await reservation(row), beforeAgent = await projection(row);
    const result = await recordHumanMessage({ ...row.input, content: "Não substituir", authorUserId: otherAuthor, authorName: "Outra autora", wamid: `fixture-new-${randomUUID()}`, sentAt: new Date(now.getTime() + 1), whatsappPhoneNumberId: currentChannel });
    expect(result).toEqual(first); expect(await reservation(row)).toEqual(before); expect(await projection(row)).toEqual(beforeAgent);
    expect((await db.select().from(messages).where(eq(messages.conversationId, first!.conversationId))).filter((message) => message.sender === "humano")).toEqual([first]);
  });

  it("replay de wamid sem reserva continua suportado e não enriquece canal legado", async () => {
    const row = await fixture(true, false), first = await recordHumanMessage({ ...row.input, whatsappPhoneNumberId: undefined });
    const retry = await recordHumanMessage({ ...row.input, requestId: randomUUID(), whatsappPhoneNumberId: actualChannel, content: "Não substituir", authorName: "Outro", sentAt: new Date(now.getTime() + 1) });
    expect(retry).toEqual(first); expect(retry!.whatsappPhoneNumberId).toBeNull(); expect(await reservation(row)).toBeUndefined();
  });

  it.each([currentChannel, foreignChannel, unverifiedChannel])("outro canal%s nunca ganha associação ao recibo do canal original", async (whatsappPhoneNumberId) => {
    const row = await fixture(), receipt = await orphan(row.input.wamid), foreign = await orphan(row.input.wamid, foreignChannel, foreignTenant);
    const result = await recordHumanMessage({ ...row.input, whatsappPhoneNumberId });
    expect(result!.whatsappPhoneNumberId).toBe(whatsappPhoneNumberId); expect(await receipts(row.input.wamid)).toEqual([receipt, foreign].sort((a, b) => a.tenantId.localeCompare(b.tenantId)));
    expect(await reservation(row)).toMatchObject({ state: "enviada", messageId: result!.id });
  });

  it("lead fora do tenant não cria mensagem/reserva nem muda recibo", async () => {
    const row = await fixture(false), before = await reservation(row), receipt = await orphan(row.input.wamid);
    expect(await recordHumanMessage({ ...row.input, tenantId: foreignTenant })).toBeNull();
    expect(await db.select().from(conversations).where(eq(conversations.leadId, row.lead.id))).toEqual([]);
    expect(await reservation(row)).toEqual(before); expect(await receipts(row.input.wamid)).toEqual([receipt]);
  });

  it("requestId reservado por outra lead não fecha reserva nem deixa conversa nova", async () => {
    const owner = await fixture(false), other = await fixture(false), before = await reservation(owner);
    expect(await recordHumanMessage({ ...other.input, requestId: owner.input.requestId })).toBeNull();
    expect(await reservation(owner)).toEqual(before); expect((await reservation(other)).state).toBe("enviando");
    expect(await db.select().from(conversations).where(eq(conversations.leadId, other.lead.id))).toEqual([]);
  });

  it("wamid de outra lead é rejeitado atomicamente, sem retornar sua thread/âncora", async () => {
    const owner = await fixture(), original = await recordHumanMessage(owner.input), other = await fixture(false), before = await reservation(other);
    expect(await recordHumanMessage({ ...other.input, wamid: owner.input.wamid })).toBeNull();
    expect(await reservation(other)).toEqual(before); expect(await db.select().from(conversations).where(eq(conversations.leadId, other.lead.id))).toEqual([]);
    expect(await db.select().from(messages).where(eq(messages.externalId, owner.input.wamid))).toEqual([original]);
  });

  it("wamid de saída agente não recebe autoria humana ou reserva enviada", async () => {
    const row = await fixture(), [conversation] = await db.select().from(conversations).where(eq(conversations.leadId, row.lead.id));
    const [outbound] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "agente", content: "Saída agente", externalId: row.input.wamid, sentAt: now, whatsappPhoneNumberId: actualChannel }).returning();
    const before = await reservation(row); expect(await recordHumanMessage(row.input)).toBeNull();
    expect(await reservation(row)).toEqual(before); expect(await db.select().from(messages).where(eq(messages.id, outbound.id))).toEqual([outbound]);
  });

  it.each(["missing", "foreign-message"] as const)("reserva enviada com referência%s recusa sem fabricar registro", async (kind) => {
    const row = await fixture(false), other = await fixture(), original = await recordHumanMessage(other.input);
    await db.update(humanMessageSends).set({ state: "enviada", messageId: kind === "missing" ? null : original!.id, wamid: other.input.wamid })
      .where(and(eq(humanMessageSends.tenantId, tenantId), eq(humanMessageSends.requestId, row.input.requestId)));
    const before = await reservation(row);
    expect(await recordHumanMessage(row.input)).toBeNull(); expect(await reservation(row)).toEqual(before);
    expect(await db.select().from(conversations).where(eq(conversations.leadId, row.lead.id))).toEqual([]);
  });

  it("falha após attach desfaz mensagem/conversa/reserva/recibo na mesma transação", async () => {
    const row = await fixture(false), before = await reservation(row), receipt = await orphan(row.input.wamid);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(recordHumanMessage(row.input, { database })).rejects.toThrow("fixture-rollback");
    expect(await receipts(row.input.wamid)).toEqual([receipt]); expect(await reservation(row)).toEqual(before);
    expect(await db.select().from(conversations).where(eq(conversations.leadId, row.lead.id))).toEqual([]);
    expect(await db.select().from(messages).where(eq(messages.externalId, row.input.wamid))).toEqual([]);
  });

  it("timestamp não finito falha sem converter saída em inbound ou criar thread", async () => {
    const row = await fixture(false), before = await reservation(row);
    await expect(recordHumanMessage({ ...row.input, sentAt: new Date(NaN) })).rejects.toThrow("invalid timestamp");
    expect(await reservation(row)).toEqual(before); expect(await db.select().from(conversations).where(eq(conversations.leadId, row.lead.id))).toEqual([]);
  });

  it("duas leads disputam mesmo wamid; perdedora retorna null após rollback da conversa", async () => {
    const winner = await fixture(false), loser = await fixture(false), a = await db.$client.connect(), b = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(), inserted = deferred<void>(), release = deferred<void>();
    const writerDb = drizzle(a, { schema });
    const held: Pick<typeof db, "transaction"> = { transaction: (callback, config) => writerDb.transaction(async (tx) => {
      pidA.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid);
      const result = await callback(tx); inserted.resolve(); await release.promise; return result;
    }, config) };
    let pending: Promise<unknown>[] = [];
    try {
      const winning = recordHumanMessage(winner.input, { database: held }); pending = [winning]; await inserted.promise;
      const losing = recordHumanMessage({ ...loser.input, wamid: winner.input.wamid }, { database: pinned(b, pidB) }); pending.push(losing);
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]); expect(await waitForLocks([pids[1]])).toBe(1);
      release.resolve(); const [message, rejected] = await Promise.all([winning, losing]);
      expect(rejected).toBeNull(); expect(await db.select().from(messages).where(eq(messages.externalId, winner.input.wamid))).toEqual([message]);
      expect(await db.select().from(conversations).where(eq(conversations.leadId, loser.lead.id))).toEqual([]); expect((await reservation(loser)).state).toBe("enviando");
      expect(await reservation(winner)).toMatchObject({ state: "enviada", messageId: message!.id });
    } finally { release.resolve(); await Promise.allSettled(pending); a.release(); b.release(); }
  });
});
