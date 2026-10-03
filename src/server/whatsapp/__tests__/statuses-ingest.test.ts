import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { authenticate } from "../../integration/auth";
import { createStatusForwardingContext, ingestStatusBatch, type StatusForwarderProof } from "../statuses";

const { tenants, tenantApiKeys, whatsappChannels, whatsappMessageReceipts, messages, conversations, leads, whatsappUsage, reengagementEpisodes, leadAgentState } = schema;
const now = new Date("2026-10-02T12:00:00Z");
const later = new Date("2026-10-02T12:01:00Z");
const free = { pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false };
const paid = { pricingModel: "PMP", category: "service", pricingType: "regular", billable: true };
function status(patch: Record<string, unknown> = {}) {
  return { wamid: `wamid.fixture.${randomUUID()}`, status: "delivered", timestamp: "2026-10-02T11:00:00Z", pricing: free, ...patch };
}

describe("T9 — lote autenticado e normalizado, Postgres real", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const phones = [0, 1, 2, 3].map(() => `fixture-${randomUUID()}`);
  const keyA = `fixture-status-${randomUUID()}`;
  const keyB = `fixture-status-${randomUUID()}`;
  const requestA = new Request("http://fixture/statuses", { headers: { Authorization: `Bearer ${keyA}` } });
  const requestB = new Request("http://fixture/statuses", { headers: { Authorization: `Bearer ${keyB}` } });
  const proof: StatusForwarderProof = {
    workflowId: "fixture-forwarder", activeVersionId: randomUUID(), triggerVersion: 1,
    verifiedAt: now, signatureAlgorithm: "hmac-sha256", signatureInput: "raw-body",
    rejectsInvalidSignatures: true, credentialSha256: createHash("sha256").update(keyA).digest("hex"),
  };
  let contextA: NonNullable<ReturnType<typeof createStatusForwardingContext>>;
  let contextB: NonNullable<ReturnType<typeof createStatusForwardingContext>>;
  beforeAll(async () => {
    await db.insert(tenants).values([tenantA, tenantB].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture status", agentName: "Agente", supportedModality: "ambos" as const })));
    await db.insert(tenantApiKeys).values([keyA, keyB].map((key, i) => ({ tenantId: i ? tenantB : tenantA, label: "Fixture status", keyHash: createHash("sha256").update(key).digest("hex") })));
    await db.insert(whatsappChannels).values(phones.map((phoneNumberId, i) => ({ tenantId: i === 2 ? tenantB : tenantA, phoneNumberId, ownershipVerifiedAt: i === 3 ? null : now })));
    const authA = await authenticate(requestA);
    const authB = await authenticate(requestB);
    if (authA instanceof Response || authB instanceof Response) throw new Error("Fixture de autenticação falhou");
    const ctxA = createStatusForwardingContext(authA, requestA, proof);
    const ctxB = createStatusForwardingContext(authB, requestB, { ...proof, credentialSha256: createHash("sha256").update(keyB).digest("hex") });
    if (!ctxA || !ctxB) throw new Error("Prova sintética de transporte não aceita");
    contextA = ctxA; contextB = ctxB;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    const ids = [tenantA, tenantB];
    await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, ids));
    await db.delete(reengagementEpisodes).where(inArray(reengagementEpisodes.tenantId, ids));
    await db.delete(leadAgentState).where(inArray(leadAgentState.tenantId, ids));
    await db.delete(whatsappUsage).where(inArray(whatsappUsage.tenantId, ids));
    await db.delete(messages).where(inArray(messages.tenantId, ids));
    await db.delete(conversations).where(inArray(conversations.tenantId, ids));
    await db.delete(leads).where(inArray(leads.tenantId, ids));
    await db.delete(tenantApiKeys).where(inArray(tenantApiKeys.tenantId, ids));
    await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, ids));
    await db.delete(tenants).where(inArray(tenants.id, ids));
    await db.$client.end();
  });
  async function receipt(wamid: string, tenantId = tenantA, phoneNumberId = phones[0]) {
    return db.select().from(whatsappMessageReceipts).where(and(eq(whatsappMessageReceipts.tenantId, tenantId), eq(whatsappMessageReceipts.phoneNumberId, phoneNumberId), eq(whatsappMessageReceipts.wamid, wamid)));
  }
  function batch(items: Record<string, unknown>[], phoneNumberId = phones[0]) { return { phoneNumberId, statuses: items }; }

  it("origem não garantida/default e claim bruto não alteram dados", async () => {
    const item = status();
    expect(createStatusForwardingContext({ tenantId: tenantA }, requestA)).toBeNull();
    expect(await ingestStatusBatch({ tenantId: tenantA, verified: true }, batch([item]))).toEqual({ ok: false, reason: "origin-unverified" });
    expect(await receipt(item.wamid)).toEqual([]);
  });

  it("prova concreta e credencial do forwarder são necessárias para emitir contexto", () => {
    for (const patch of [
      { workflowId: "" }, { activeVersionId: "unknown" }, { triggerVersion: 0 }, { verifiedAt: new Date(NaN) },
      { signatureAlgorithm: "none" }, { signatureInput: "parsed-body" }, { rejectsInvalidSignatures: false }, { credentialSha256: "0".repeat(64) },
    ]) {
      expect(createStatusForwardingContext({ tenantId: tenantA }, requestA, { ...proof, ...patch } as StatusForwarderProof)).toBeNull();
    }
    expect(createStatusForwardingContext({ tenantId: tenantA }, requestB, proof)).toBeNull();
  });

  it("replay persiste uma linha idêntica e não rearma expiração", async () => {
    const item = status();
    expect(await ingestStatusBatch(contextA, batch([item]), { now })).toEqual({ ok: true, processed: 1 });
    const first = await receipt(item.wamid);
    expect(await ingestStatusBatch(contextA, batch([item]), { now: later })).toEqual({ ok: true, processed: 1 });
    expect(await receipt(item.wamid)).toEqual(first);
    expect(first[0].classification).toBe("free_service");
    expect(first[0].firstSeenAt).toEqual(now);
    expect(first[0].lastSeenAt).toEqual(now);
    expect(first[0].orphanExpiresAt!.getTime() - now.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("mesmo wamid em números/tenants distintos não cruza evidências", async () => {
    const item = status();
    expect(await ingestStatusBatch(contextA, batch([item]), { now })).toEqual({ ok: true, processed: 1 });
    expect(await ingestStatusBatch(contextA, batch([{ ...item, pricing: paid }], phones[1]), { now })).toEqual({ ok: true, processed: 1 });
    expect(await ingestStatusBatch(contextB, batch([{ ...item, status: "failed", pricing: undefined, failureCode: 131026 }], phones[2]), { now })).toEqual({ ok: true, processed: 1 });
    expect((await receipt(item.wamid))[0].classification).toBe("free_service");
    expect((await receipt(item.wamid, tenantA, phones[1]))[0].classification).toBe("paid_service");
    expect((await receipt(item.wamid, tenantB, phones[2]))[0].classification).toBe("not_delivered");
  });

  it("tenant errado, canal ausente ou ownership não provado recusam todo lote", async () => {
    const item = status();
    for (const phoneNumberId of [phones[2], phones[3], `missing-${randomUUID()}`]) {
      expect(await ingestStatusBatch(contextA, batch([item], phoneNumberId), { now })).toEqual({ ok: false, reason: "channel-untrusted" });
    }
    expect(await receipt(item.wamid)).toEqual([]);
  });

  it("lote com um status inválido não escreve o item válido anterior", async () => {
    const item = status();
    expect(await ingestStatusBatch(contextA, batch([item, status({ status: "unknown" })]), { now })).toEqual({ ok: false, reason: "invalid-batch" });
    expect(await receipt(item.wamid)).toEqual([]);
  });

  it("status array/object/número/null não é enum string e recusa sem escrita parcial", async () => {
    for (const invalid of [["delivered"], { status: "delivered" }, 1, null]) {
      const item = status();
      expect(await ingestStatusBatch(contextA, batch([item, status({ status: invalid })]), { now })).toEqual({ ok: false, reason: "invalid-batch" });
      expect(await receipt(item.wamid)).toEqual([]);
    }
  });

  it("falha de persistência é limitada e não expõe erro bruto", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transaction = vi.fn().mockRejectedValue(new Error(`${keyA}: conversa privada`));
    const item = status();
    expect(await ingestStatusBatch(contextA, batch([item]), { now, database: { transaction } })).toEqual({ ok: false, reason: "persistence-failed" });
    expect(await receipt(item.wamid)).toEqual([]);
    expect(log).toHaveBeenCalledWith({ event: "whatsapp-status-refused", tenantId: tenantA, reason: "persistence-failed" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(keyA);
    expect(JSON.stringify(log.mock.calls)).not.toContain("conversa privada");
  });

  it("100 itens aceitos e101 recusados integralmente", async () => {
    const hundred = Array.from({ length: 100 }, () => status());
    expect(await ingestStatusBatch(contextA, batch(hundred), { now })).toEqual({ ok: true, processed: 100 });
    expect(await db.select().from(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.wamid, hundred.map((item) => item.wamid)))).toHaveLength(100);
    const tooMany = Array.from({ length: 101 }, () => status());
    expect(await ingestStatusBatch(contextA, batch(tooMany), { now })).toEqual({ ok: false, reason: "invalid-batch" });
    expect(await receipt(tooMany[0].wamid)).toEqual([]);
  });

  it("limite100KiB mede bytes UTF8 e não publica excesso", async () => {
    const items = Array.from({ length: 100 }, () => status({ wamid: `wamid.${randomUUID()}.${"á".repeat(600)}` }));
    expect(Buffer.byteLength(JSON.stringify(batch(items)), "utf8")).toBeGreaterThan(100 * 1024);
    expect(await ingestStatusBatch(contextA, batch(items), { now })).toEqual({ ok: false, reason: "body-too-large" });
    expect(await receipt(items[0].wamid)).toEqual([]);
  });

  it("órfão e status não fabricam mensagem/inbound/janela/episódio/volume", async () => {
    const [lead] = await db.insert(leads).values({ tenantId: tenantA, name: "Lead real", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: now }).returning();
    const [conversation] = await db.insert(conversations).values({ tenantId: tenantA, leadId: lead.id }).returning();
    const [inbound] = await db.insert(messages).values({ tenantId: tenantA, conversationId: conversation.id, sender: "lead", content: "Mensagem privada", sentAt: new Date("2026-10-01T10:00:00Z") }).returning();
    await db.insert(leadAgentState).values({ tenantId: tenantA, leadId: lead.id, anchorMessageId: inbound.id, phase: "qualificando", revision: 4 });
    await db.insert(reengagementEpisodes).values({
      tenantId: tenantA, leadId: lead.id, phoneNumberId: phones[0], anchorMessageId: inbound.id,
      anchorSentAt: inbound.sentAt, agentStateRevision: 4, state: "uncertain", reasonCode: "fixture-consumida",
      dispatchAuthorizedAt: new Date("2026-10-02T09:00:00Z"), dispatchCompletionDeadline: new Date("2026-10-02T09:02:00Z"),
    });
    await db.insert(whatsappUsage).values({
      tenantId: tenantA, phoneNumberId: phones[0], monthStart: new Date("2026-10-01T00:00:00Z"), monthEnd: new Date("2026-11-01T00:00:00Z"),
      accountTimezone: "UTC", configurationRevision: 1, freeServiceVolume: 937, queryEnd: now, lastSuccessAt: now,
    });
    const beforeMessages = await db.select().from(messages).where(eq(messages.tenantId, tenantA));
    const beforeLeads = await db.select().from(leads).where(eq(leads.tenantId, tenantA));
    const beforeEpisodes = await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantA));
    const beforeUsage = await db.select().from(whatsappUsage).where(eq(whatsappUsage.tenantId, tenantA));
    const beforeAgent = await db.select().from(leadAgentState).where(eq(leadAgentState.tenantId, tenantA));
    const item = status();
    expect(await ingestStatusBatch(contextA, batch([item]), { now })).toEqual({ ok: true, processed: 1 });
    const [orphan] = await receipt(item.wamid);
    expect(orphan.messageId).toBeNull();
    expect(orphan.orphanExpiresAt).toEqual(new Date("2026-11-01T12:00:00Z"));
    expect(await db.select().from(messages).where(eq(messages.tenantId, tenantA))).toEqual(beforeMessages);
    expect(await db.select().from(leads).where(eq(leads.tenantId, tenantA))).toEqual(beforeLeads);
    expect(await db.select().from(reengagementEpisodes).where(eq(reengagementEpisodes.tenantId, tenantA))).toEqual(beforeEpisodes);
    expect(await db.select().from(whatsappUsage).where(eq(whatsappUsage.tenantId, tenantA))).toEqual(beforeUsage);
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.tenantId, tenantA))).toEqual(beforeAgent);
    expect((await db.select().from(messages).where(eq(messages.id, inbound.id)))[0].sentAt).toEqual(new Date("2026-10-01T10:00:00Z"));
  });

  it("fora de ordem preserva entrega/read; contradição e replay não curam conflito", async () => {
    const item = status();
    expect(await ingestStatusBatch(contextA, batch([item]), { now })).toEqual({ ok: true, processed: 1 });
    expect(await ingestStatusBatch(contextA, batch([{ ...item, status: "read", pricing: undefined }, { ...item, status: "sent", pricing: paid, timestamp: "2026-10-02T10:00:00Z" }]), { now: later })).toEqual({ ok: true, processed: 2 });
    const [first] = await receipt(item.wamid);
    expect(first.classification).toBe("free_service");
    expect(first.deliveredAt).toEqual(new Date("2026-10-02T11:00:00Z"));
    expect(first.readAt).toEqual(new Date("2026-10-02T11:00:00Z"));
    expect(first.sentAt).toEqual(new Date("2026-10-02T10:00:00Z"));
    expect(first.lastSeenAt).toEqual(later);
    expect(await ingestStatusBatch(contextA, batch([{ ...item, pricing: paid }]), { now })).toEqual({ ok: true, processed: 1 });
    const [conflict] = await receipt(item.wamid);
    expect(conflict.lastSeenAt).toEqual(later);
    expect(conflict.pricingConflict).toBe(true);
    expect(conflict.classification).toBe("unavailable");
    expect(await ingestStatusBatch(contextA, batch([item]), { now: later })).toEqual({ ok: true, processed: 1 });
    expect(await receipt(item.wamid)).toEqual([conflict]);
  });

  it("datas/pricing/código inválidos e campos raw são rejeitados sem escrita", async () => {
    const invalid = [
      { timestamp: "2026-02-30T11:00:00Z" }, { timestamp: "2026-10-02" }, { timestamp: "2026-10-02T11:00:00" },
      { timestamp: "invalid" }, { pricing: { ...free, billable: "false" } }, { pricing: { ...free, category: 123 } },
      { failureCode: -1 }, { failureCode: 1.5 }, { failureCode: 2147483648 }, { wamid: " " },
      { raw: { token: "não armazenar", content: "conversa privada" } },
    ];
    for (const patch of invalid) {
      const item = status(patch);
      expect(await ingestStatusBatch(contextA, batch([item]), { now })).toEqual({ ok: false, reason: "invalid-batch" });
      expect(await receipt(item.wamid)).toEqual([]);
    }
  });

  it("pricing parcial/desconhecido válido é guardado como indisponível sem payload", async () => {
    const item = status({ pricing: { pricingModel: "novo-contrato", category: "service" } });
    expect(await ingestStatusBatch(contextA, batch([item]), { now })).toEqual({ ok: true, processed: 1 });
    const [row] = await receipt(item.wamid);
    expect(row.pricingModel).toBe("novo-contrato");
    expect(row.category).toBe("service");
    expect(row.pricingType).toBeNull();
    expect(row.billable).toBeNull();
    expect(row.classification).toBe("unavailable");
    expect(Object.keys(row).sort()).toEqual(["tenantId", "phoneNumberId", "wamid", "messageId", "sentAt", "deliveredAt", "readAt", "failedAt", "pricingModel", "category", "pricingType", "billable", "pricingConflict", "classification", "failureCode", "firstSeenAt", "lastSeenAt", "orphanExpiresAt"].sort());
  });

  it("log/resultado de recusa não expõem segredo ou conversa", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const item = status({ raw: { token: keyA, content: "conversa privada" } });
    const result = await ingestStatusBatch(contextA, batch([item]), { now });
    expect(result).toEqual({ ok: false, reason: "invalid-batch" });
    expect(log).toHaveBeenCalledWith({ event: "whatsapp-status-refused", tenantId: tenantA, reason: "invalid-batch" });
    expect(JSON.stringify([result, log.mock.calls])).not.toContain(keyA);
    expect(JSON.stringify([result, log.mock.calls])).not.toContain("conversa privada");
  });

  it("duas conexões reais sob disputa serializam replay e ordem de wamids", async () => {
    const blocker = await db.$client.connect();
    const clientA = await db.$client.connect();
    const clientB = await db.$client.connect();
    const itemA = status(); const itemB = status();
    let pending: Promise<unknown>[] = [];
    try {
      await blocker.query("BEGIN");
      await blocker.query('SELECT id FROM whatsapp_channels WHERE tenant_id=$1 AND phone_number_id=$2 FOR UPDATE', [tenantA, phones[0]]);
      let captureA!: (pid: number) => void;
      let captureB!: (pid: number) => void;
      const capturedA = new Promise<number>((resolve) => { captureA = resolve; });
      const capturedB = new Promise<number>((resolve) => { captureB = resolve; });
      const databaseA = drizzle(clientA, { schema });
      const databaseB = drizzle(clientB, { schema });
      // PgBouncer só fixa o backend durante BEGIN..COMMIT; observar no tx real.
      const pinnedA: Pick<typeof db, "transaction"> = {
        transaction: (callback, config) => databaseA.transaction(async (tx) => {
          const result = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
          captureA(result.rows[0].pid);
          return callback(tx);
        }, config),
      };
      const pinnedB: Pick<typeof db, "transaction"> = {
        transaction: (callback, config) => databaseB.transaction(async (tx) => {
          const result = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
          captureB(result.rows[0].pid);
          return callback(tx);
        }, config),
      };
      pending = [
        ingestStatusBatch(contextA, batch([itemA, itemB]), { now, database: pinnedA }),
        ingestStatusBatch(contextA, batch([itemB, itemA]), { now: later, database: pinnedB }),
      ];
      const [pidA, pidB] = await Promise.all([capturedA, capturedB]);
      expect(pidA).not.toBe(pidB);
      let waiting = 0;
      for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
        const result = await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [[pidA, pidB]]);
        waiting = result.rows[0].waiting;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(2);
      await blocker.query("COMMIT");
      expect(await Promise.all(pending)).toEqual([{ ok: true, processed: 2 }, { ok: true, processed: 2 }]);
      expect(await receipt(itemA.wamid)).toHaveLength(1);
      expect(await receipt(itemB.wamid)).toHaveLength(1);
      expect((await receipt(itemA.wamid))[0].classification).toBe("free_service");
      expect((await receipt(itemB.wamid))[0].classification).toBe("free_service");
    } finally {
      await blocker.query("ROLLBACK");
      await Promise.allSettled(pending);
      blocker.release(); clientA.release(); clientB.release();
    }
  });
});
