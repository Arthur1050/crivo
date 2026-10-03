import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { conversations, leadAgentState, leads, messages, tenants, users } from "../../../db/schema";
import { serviceScope, takeOverConversation } from "../../data";
import { publishAgentState, type PublishAgentStateInput } from "../agent-state";
import { evaluateReengagement } from "../../../../n8n/src/reengagement.mjs";

const tenantA = randomUUID(), tenantB = randomUUID(), human = randomUUID();
const now = new Date("2026-10-06T15:00:00Z");
const anchorAt = new Date("2026-10-05T17:00:00Z");
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { resolve, promise }; }
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture(tenantId = tenantA) {
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture T16", phone: "+5534900000000", externalId: `fixture-${randomUUID()}`, status: "em_qualificacao", firstContactAt: anchorAt }).returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  const [anchor] = await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "lead", content: "Inbound sintético", sentAt: anchorAt }).returning();
  return { lead, conversation, anchor };
}
function input(row: Fixture, patch: Partial<PublishAgentStateInput> = {}): PublishAgentStateInput {
  return { anchorMessageId: row.anchor.id, resetObservedAt: null, expectedRevision: 0, phase: "qualificando", askedFields: ["modality"], openingHistory: ["hmm"], ...patch };
}
function publish(row: Fixture, patch: Partial<PublishAgentStateInput> = {}, database?: Pick<typeof db, "transaction">) {
  return publishAgentState({ tenantId: row.lead.tenantId }, row.lead.id, input(row, patch), { now: () => now, database });
}
async function state(row: Fixture) { return db.select().from(leadAgentState).where(and(eq(leadAgentState.tenantId, row.lead.tenantId), eq(leadAgentState.leadId, row.lead.id))); }
beforeAll(async () => {
  await db.insert(tenants).values([tenantA, tenantB].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture T16 estado", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(users).values({ id: human, email: `${human}@fixture.test`, name: "Equipe fixture" });
});
afterAll(async () => {
  const ids = [tenantA, tenantB];
  await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
  await db.delete(messages).where(inArray(messages.tenantId, ids));
  await db.delete(conversations).where(inArray(conversations.tenantId, ids));
  await db.delete(leads).where(inArray(leads.tenantId, ids));
  await db.delete(tenants).where(inArray(tenants.id, ids));
  await db.delete(users).where(eq(users.id, human));
  await db.$client.end();
});

describe("T16 — publicação do estado revisado sobre fatos correntes", () => {
  it("publica todos os campos da primeira revisão e conserva lead/mensagens", async () => {
    const row = await fixture(); const beforeLead = row.lead;
    const beforeMessages = await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id));
    const result = await publish(row);
    expect(result).toEqual({ ok: true, replay: false, state: { tenantId: tenantA, leadId: row.lead.id, anchorMessageId: row.anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["hmm"], resetObservedAt: null, revision: 1, updatedAt: now } });
    expect(await state(row)).toEqual(result.ok ? [result.state] : []);
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(beforeLead);
    expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).toEqual(beforeMessages);
  });

  it("fase unknown persistida continua impedindo contato", async () => {
    const row = await fixture(); const result = await publish(row, { phase: null });
    expect(result.ok && result.state.phase).toBeNull();
    expect(evaluateReengagement({ lead: row.lead, anchor: { messageId: row.anchor.id, sentAt: row.anchor.sentAt }, phase: result.ok ? result.state.phase : undefined, channel: { phoneNumberId: "123456789" }, destination: "5534999990001", now })).toEqual({ action: null, reason: "unknown-data" });
  });

  it("expectedRevision errado não cria projeção nem muda a existente", async () => {
    const row = await fixture();
    expect(await publish(row, { expectedRevision: 1 })).toEqual({ ok: false, reason: "revision-conflict" });
    expect(await state(row)).toEqual([]);
    await publish(row); const before = await state(row);
    expect(await publish(row, { expectedRevision: 0, phase: "agendando" })).toEqual({ ok: false, reason: "revision-conflict" });
    expect(await state(row)).toEqual(before);
  });

  it("retry idêntico com revisão anterior ou atual é replay sem escrita", async () => {
    const row = await fixture(); const first = await publish(row); const before = await state(row);
    expect(first).toMatchObject({ ok: true, replay: false, state: { revision: 1, anchorMessageId: row.anchor.id, phase: "qualificando", askedFields: ["modality"], openingHistory: ["hmm"], resetObservedAt: null } });
    expect(await publish(row)).toEqual(first.ok ? { ...first, replay: true } : first);
    expect(await publish(row, { expectedRevision: 1 })).toEqual(first.ok ? { ...first, replay: true } : first);
    expect(await publish(row, { expectedRevision: 999 })).toEqual({ ok: false, reason: "revision-conflict" });
    expect(await state(row)).toEqual(before);
  });

  it("nova revisão altera só a projeção, com askedFields e aberturas completos", async () => {
    const row = await fixture(); await publish(row); const before = row.lead;
    const result = await publish(row, { expectedRevision: 1, phase: "agendando", askedFields: ["modality", "region", "propertyType"], openingHistory: ["hmm", "certo"] });
    expect(result).toMatchObject({ ok: true, replay: false, state: { revision: 2, phase: "agendando", askedFields: ["modality", "region", "propertyType"], openingHistory: ["hmm", "certo"], anchorMessageId: row.anchor.id, resetObservedAt: null } });
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(before);
  });

  it("execução antiga não reabre encerrada nem com revisão atual", async () => {
    const row = await fixture(); await publish(row, { phase: "encerrada" }); const before = await state(row);
    expect(await publish(row, { expectedRevision: 1 })).toEqual({ ok: false, reason: "phase-closed" });
    expect(await state(row)).toEqual(before);
    expect(await publish(row, { phase: "encerrada" })).toMatchObject({ ok: true, replay: true, state: { phase: "encerrada", revision: 1 } });
  });

  it("inbound novo impede publicação e replay da âncora antiga", async () => {
    const row = await fixture(); await publish(row); const before = await state(row);
    const [latest] = await db.insert(messages).values({ tenantId: tenantA, conversationId: row.conversation.id, sender: "lead", content: "Novo inbound", sentAt: new Date(anchorAt.getTime() + 1) }).returning();
    expect(await publish(row)).toEqual({ ok: false, reason: "context-changed" });
    expect(await publish(row, { expectedRevision: 1, phase: "agendando" })).toEqual({ ok: false, reason: "context-changed" });
    expect(await state(row)).toEqual(before);
    expect(await publish(row, { anchorMessageId: latest.id, expectedRevision: 1 })).toMatchObject({ ok: true, replay: false, state: { anchorMessageId: latest.id, revision: 2 } });
  });

  it("inbound atrasado e saída mais recente não substituem o inbound cronológico", async () => {
    const row = await fixture();
    const [late] = await db.insert(messages).values({ tenantId: tenantA, conversationId: row.conversation.id, sender: "lead", content: "Atrasado", sentAt: new Date(anchorAt.getTime() - 1) }).returning();
    const [outgoing] = await db.insert(messages).values({ tenantId: tenantA, conversationId: row.conversation.id, sender: "agente", content: "Saída", sentAt: now }).returning();
    const [humanOutgoing] = await db.insert(messages).values({ tenantId: tenantA, conversationId: row.conversation.id, sender: "humano", content: "Saída da equipe", authorName: "Equipe fixture", authorUserId: human, sentAt: new Date(now.getTime() + 1) }).returning();
    const beforeMessages = await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id));
    for (const anchorMessageId of [late.id, outgoing.id, humanOutgoing.id]) {
      expect(await publish(row, { anchorMessageId })).toEqual({ ok: false, reason: "context-changed" });
      expect(await state(row)).toEqual([]);
    }
    expect(await publish(row)).toMatchObject({ ok: true, state: { anchorMessageId: row.anchor.id } });
    expect((await db.select().from(leads).where(eq(leads.id, row.lead.id)))[0]).toEqual(row.lead);
    expect(await db.select().from(messages).where(eq(messages.conversationId, row.conversation.id))).toEqual(beforeMessages);
  });

  it("empate sentAt usa ID decrescente determinístico", async () => {
    const row = await fixture();
    const [sameTime] = await db.insert(messages).values({ tenantId: tenantA, conversationId: row.conversation.id, sender: "lead", content: "Mesmo instante", sentAt: anchorAt }).returning();
    const [latest, previous] = [row.anchor.id, sameTime.id].sort().reverse();
    expect(await publish(row, { anchorMessageId: previous })).toEqual({ ok: false, reason: "context-changed" });
    expect(await publish(row, { anchorMessageId: latest })).toMatchObject({ ok: true, state: { anchorMessageId: latest } });
  });

  it("FK do mesmo tenant não autoriza âncora de outra lead", async () => {
    const row = await fixture(); const other = await fixture();
    expect(await publish(row, { anchorMessageId: other.anchor.id })).toEqual({ ok: false, reason: "context-changed" });
    expect(await state(row)).toEqual([]); expect(await state(other)).toEqual([]);
  });

  it("tenant errado não lê/escreve a lead ou sua projeção", async () => {
    const row = await fixture();
    expect(await publishAgentState({ tenantId: tenantB }, row.lead.id, input(row))).toEqual({ ok: false, reason: "lead-not-found" });
    expect(await state(row)).toEqual([]);
    const foreign = await fixture(tenantB);
    expect(await publish(row, { anchorMessageId: foreign.anchor.id })).toEqual({ ok: false, reason: "context-changed" });
    expect(await state(row)).toEqual([]); expect(await state(foreign)).toEqual([]);
  });

  it("reset antigo impede replay/fechamento; reset observado exato permite nova projeção", async () => {
    const row = await fixture(); await publish(row); const before = await state(row);
    await db.update(leads).set({ memoryResetRequestedAt: now }).where(eq(leads.id, row.lead.id));
    expect(await publish(row)).toEqual({ ok: false, reason: "context-changed" });
    expect(await publish(row, { expectedRevision: 1, phase: "encerrada" })).toEqual({ ok: false, reason: "context-changed" });
    expect(await state(row)).toEqual(before);
    expect(await publish(row, { expectedRevision: 1, resetObservedAt: new Date(now.getTime()) })).toMatchObject({ ok: true, replay: false, state: { resetObservedAt: now, revision: 2 } });
  });

  it.each([
    { phase: "inventada" as never }, { askedFields: ["campo-inventado"] },
    { askedFields: Array(9).fill("region") as string[] }, { openingHistory: [1] as never },
    { expectedRevision: -1 }, { resetObservedAt: new Date("ilegível") },
  ])("entrada inválida não grava estado %#", async (patch) => {
    const row = await fixture();
    expect(await publish(row, patch)).toEqual({ ok: false, reason: "invalid-state" });
    expect(await state(row)).toEqual([]);
  });

  it("falha transacional desfaz projeção sem impedir a condução humana", async () => {
    const row = await fixture();
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => { await callback(tx); throw new Error("fixture-rollback"); }, config) };
    await expect(publish(row, {}, database)).rejects.toThrow("fixture-rollback");
    expect(await state(row)).toEqual([]);
    const taken = await takeOverConversation(serviceScope(tenantA), row.lead.id, human, now);
    expect(taken.outcome).toBe("assumido");
    const [persisted] = await db.select().from(leads).where(eq(leads.id, row.lead.id));
    expect(persisted.humanTakeoverAt).toEqual(now); expect(persisted.humanTakeoverBy).toBe(human);
    expect(persisted.status).toBe("em_qualificacao"); expect(persisted.statusChangedBy).toBeNull();
  });

  it("duas transações realmente aguardam o lock e uma revisão vence", async () => {
    const row = await fixture(); const blocker = await db.$client.connect(); const clientA = await db.$client.connect(); const clientB = await db.$client.connect();
    const pidA = deferred<number>(), pidB = deferred<number>(); let pending: ReturnType<typeof publish>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM leads WHERE id=$1 FOR UPDATE", [row.lead.id]);
      function pinned(client: typeof clientA, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> {
        const database = drizzle(client, { schema });
        return { transaction: (callback, config) => database.transaction(async (tx) => { pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
      }
      pending = [publish(row, {}, pinned(clientA, pidA)), publish(row, { phase: "agendando" }, pinned(clientB, pidB))];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]);
      let waiting = 0;
      for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
        waiting = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(2); await blocker.query("COMMIT");
      const results = await Promise.all(pending);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "revision-conflict" }]);
      const [persisted] = await state(row); const winner = results.find((result) => result.ok);
      expect(winner?.ok && winner.state).toEqual(persisted); expect(persisted.revision).toBe(1);
      expect(persisted).toEqual({ tenantId: tenantA, leadId: row.lead.id, anchorMessageId: row.anchor.id,
        phase: results[0].ok ? "qualificando" : "agendando", askedFields: ["modality"], openingHistory: ["hmm"],
        resetObservedAt: null, revision: 1, updatedAt: now });
      expect(await state(row)).toHaveLength(1);
    } finally {
      await blocker.query("ROLLBACK"); await Promise.allSettled(pending); blocker.release(); clientA.release(); clientB.release();
    }
  });
});
