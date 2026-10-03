import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../../../db/schema";
import { db } from "../../../db";
import { conversations, leadAgentState, leads, messages, tenants, users, whatsappChannels, whatsappMessageReceipts } from "../../../db/schema";
import { getMessages, serviceScope } from "../../data";
import { ingestMessage, listMessages, serializeMessage } from "../messages";
import { parseMessageCreate } from "../parsers";

const NON_EXISTENT_LEAD_ID = "00000000-0000-4000-8000-000000000456";

// Tenants + leads PRÓPRIOS deste arquivo (nunca os do seed) — mesmo padrão de
// isolamento de leads.test.ts/leads-post.test.ts.
describe("server/integration messages — ingestMessage", () => {
  let tenantAId: string;
  let tenantBId: string;
  const brokerId = randomUUID();
  const channel = "12345678901234567890", foreignChannel = "22345678901234567890", unverifiedChannel = "32345678901234567890";
  const now = new Date("2026-08-01T12:00:00.000Z");

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A messages ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
        slug: `fixture-${tenantAId}`,
      },
      {
        id: tenantBId,
        name: `Tenant Teste B messages ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
        slug: `fixture-${tenantBId}`,
      },
    ]);
    await db.insert(users).values({ id: brokerId, name: "Corretor T30", email: `${brokerId}@fixture.test` });
    await db.insert(whatsappChannels).values([
      { tenantId: tenantAId, phoneNumberId: channel, ownershipVerifiedAt: now },
      { tenantId: tenantBId, phoneNumberId: foreignChannel, ownershipVerifiedAt: now },
      { tenantId: tenantAId, phoneNumberId: unverifiedChannel },
    ]);
  });

  afterAll(async () => {
    await db.delete(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.tenantId, tenantAId));
    await db.delete(leadAgentState).where(eq(leadAgentState.tenantId, tenantAId));
    await db.delete(messages).where(eq(messages.tenantId, tenantAId));
    await db.delete(messages).where(eq(messages.tenantId, tenantBId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantAId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantBId));
    await db.delete(leads).where(eq(leads.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantBId));
    await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantAId));
    await db.delete(whatsappChannels).where(eq(whatsappChannels.tenantId, tenantBId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
    await db.delete(users).where(eq(users.id, brokerId));
    await db.$client.end();
  });

  async function createLead(tenantId: string): Promise<string> {
    const id = randomUUID();
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Teste messages",
      phone: "+55 34 90000-0000",
      status: "em_qualificacao",
      firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    return id;
  }

  it("primeira mensagem cria a conversa e persiste, created:true (INT-05 AC1)", async () => {
    const leadId = await createLead(tenantAId);
    const externalId = randomUUID();

    const result = await ingestMessage(tenantAId, leadId, {
      externalId,
      sender: "lead",
      content: "Olá, tenho interesse.",
      sentAt: new Date("2026-08-01T10:00:00.000Z"),
    });

    expect(result).toEqual({
      ok: true,
      created: true,
      message: expect.objectContaining({ externalId, content: "Olá, tenho interesse." }),
      anchorMessageId: expect.any(String),
      agentStateRevision: 1,
    });

    const conversationRows = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantAId), eq(conversations.leadId, leadId)));
    expect(conversationRows).toHaveLength(1);
  });

  it("segunda mensagem (externalId distinto) reaproveita a mesma conversa, não cria outra", async () => {
    const leadId = await createLead(tenantAId);

    const first = await ingestMessage(tenantAId, leadId, {
      externalId: randomUUID(),
      sender: "agente",
      content: "Primeira mensagem.",
      sentAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    const second = await ingestMessage(tenantAId, leadId, {
      externalId: randomUUID(),
      sender: "lead",
      content: "Segunda mensagem.",
      sentAt: new Date("2026-08-01T10:05:00.000Z"),
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.message.conversationId).toBe(first.message.conversationId);

    const conversationRows = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantAId), eq(conversations.leadId, leadId)));
    expect(conversationRows).toHaveLength(1);
  });

  it("reentrega do mesmo externalId retorna created:false com a mensagem existente, sem duplicar (INT-05 AC2)", async () => {
    const leadId = await createLead(tenantAId);
    const externalId = randomUUID();
    const dto = {
      externalId,
      sender: "lead" as const,
      content: "Mensagem original.",
      sentAt: new Date("2026-08-01T10:00:00.000Z"),
    };

    const first = await ingestMessage(tenantAId, leadId, dto);
    const second = await ingestMessage(tenantAId, leadId, {
      ...dto,
      content: "Reentrega (retry do agente).",
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.created).toBe(false);
    expect(second.message.id).toBe(first.message.id);
    expect(second.message.content).toBe("Mensagem original.");

    const rows = await db.select().from(messages).where(eq(messages.externalId, externalId));
    expect(rows).toHaveLength(1);
  });

  it("mensagens fora de ordem cronológica são aceitas e getMessages retorna ordenado por sentAt (INT-05 AC3)", async () => {
    const leadId = await createLead(tenantAId);

    // Chega primeiro (na ordem da chamada) a mensagem mais TARDE no relógio.
    const later = await ingestMessage(tenantAId, leadId, {
      externalId: randomUUID(),
      sender: "agente",
      content: "Mensagem mais tarde (chega primeiro).",
      sentAt: new Date("2026-08-01T10:10:00.000Z"),
    });
    const earlier = await ingestMessage(tenantAId, leadId, {
      externalId: randomUUID(),
      sender: "lead",
      content: "Mensagem mais cedo (chega depois).",
      sentAt: new Date("2026-08-01T10:00:00.000Z"),
    });

    expect(later.ok && earlier.ok).toBe(true);
    if (!later.ok || !earlier.ok) return;

    const thread = await getMessages(serviceScope(tenantAId), later.message.conversationId);
    expect(thread.map((m) => m.content)).toEqual([
      "Mensagem mais cedo (chega depois).",
      "Mensagem mais tarde (chega primeiro).",
    ]);
  });

  it("lead inexistente no tenant retorna recurso-nao-encontrado", async () => {
    const result = await ingestMessage(tenantAId, NON_EXISTENT_LEAD_ID, {
      externalId: randomUUID(),
      sender: "lead",
      content: "X",
      sentAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, code: "recurso-nao-encontrado" });
  });

  it("lead de outro tenant retorna recurso-nao-encontrado (INT-01 AC3 — isolamento)", async () => {
    const leadOfB = await createLead(tenantBId);
    const result = await ingestMessage(tenantAId, leadOfB, {
      externalId: randomUUID(),
      sender: "lead",
      content: "Tentativa cross-tenant.",
      sentAt: new Date("2026-08-01T10:00:00.000Z"),
    });
    expect(result).toEqual({ ok: false, code: "recurso-nao-encontrado" });

    // Nada foi criado para o lead de B — nem conversa nem mensagem — mesmo
    // que tenantA já tenha mensagens de outros leads/testes deste arquivo.
    const conversationRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.leadId, leadOfB));
    expect(conversationRows).toHaveLength(0);
  });

  it("Independent Test da spec: 3 mensagens (1 duplicada, 1 fora de ordem) → thread exibe 2 na ordem cronológica correta", async () => {
    const leadId = await createLead(tenantAId);
    const externalId1 = randomUUID();
    const externalId2 = randomUUID();

    // Mensagem 1: sentAt 10:02.
    const msg1 = await ingestMessage(tenantAId, leadId, {
      externalId: externalId1,
      sender: "lead",
      content: "msg1",
      sentAt: new Date("2026-08-01T10:02:00.000Z"),
    });
    // Duplicata da mensagem 1 (mesmo externalId) — deve ser absorvida.
    const dup = await ingestMessage(tenantAId, leadId, {
      externalId: externalId1,
      sender: "lead",
      content: "msg1 (retry)",
      sentAt: new Date("2026-08-01T10:02:00.000Z"),
    });
    // Mensagem 2: sentAt 10:01 (fora de ordem — mais cedo que a msg1, mas
    // entregue depois dela).
    const msg2 = await ingestMessage(tenantAId, leadId, {
      externalId: externalId2,
      sender: "agente",
      content: "msg2",
      sentAt: new Date("2026-08-01T10:01:00.000Z"),
    });

    expect(msg1.ok && dup.ok && msg2.ok).toBe(true);
    if (!msg1.ok || !dup.ok || !msg2.ok) return;
    expect(dup.created).toBe(false);
    expect(dup.message.id).toBe(msg1.message.id);

    const thread = await getMessages(serviceScope(tenantAId), msg1.message.conversationId);
    expect(thread).toHaveLength(2);
    expect(thread.map((m) => m.content)).toEqual(["msg2", "msg1"]);
  });

  it("duas requisições concorrentes com o mesmo externalId resultam em no máximo 1 mensagem no banco (Edge Case — concorrência)", async () => {
    const leadId = await createLead(tenantAId);
    const externalId = randomUUID();
    const dto = {
      externalId,
      sender: "lead" as const,
      content: "Concorrência.",
      sentAt: new Date("2026-08-01T10:00:00.000Z"),
    };

    const [resA, resB] = await Promise.all([
      ingestMessage(tenantAId, leadId, dto),
      ingestMessage(tenantAId, leadId, dto),
    ]);

    expect(resA.ok && resB.ok).toBe(true);
    if (!resA.ok || !resB.ok) return;
    expect(resA.message.id).toBe(resB.message.id);

    const rows = await db.select().from(messages).where(eq(messages.externalId, externalId));
    expect(rows).toHaveLength(1);
  });

  function dto(patch: Partial<Parameters<typeof ingestMessage>[2]> = {}) {
    return { externalId: `fixture-${randomUUID()}`, sender: "lead" as const, content: "Mensagem factual T30", sentAt: now, ...patch };
  }

  it("canal próprio verificado persiste e serializa sem depender de transporte", async () => {
    const leadId = await createLead(tenantAId), input = dto({ whatsappPhoneNumberId: channel });
    const result = await ingestMessage(tenantAId, leadId, input, { now: () => now });
    if (!result.ok) throw new Error("Mensagem ausente");
    expect(result).toEqual({ ok: true, created: true, message: expect.objectContaining({ whatsappPhoneNumberId: channel }), anchorMessageId: result.message.id, agentStateRevision: 1 });
    expect(serializeMessage(result.message)).toEqual({ id: result.message.id, externalId: input.externalId, sender: "lead", content: input.content, sentAt: now.toISOString(), authorName: null, whatsappPhoneNumberId: channel });
  });

  it.each([undefined, null])("legado canal%s permanece nulo sem inferir do lead", async (whatsappPhoneNumberId) => {
    const leadId = await createLead(tenantAId);
    await db.update(leads).set({ whatsappPhoneNumberId: channel }).where(eq(leads.id, leadId));
    const result = await ingestMessage(tenantAId, leadId, dto({ whatsappPhoneNumberId }), { now: () => now });
    if (!result.ok) throw new Error("Mensagem ausente");
    expect(result.message.whatsappPhoneNumberId).toBeNull(); expect(serializeMessage(result.message).whatsappPhoneNumberId).toBeNull();
    expect(result.anchorMessageId).toBe(result.message.id); expect(result.agentStateRevision).toBe(1);
  });

  it.each(["99999999999999999999", foreignChannel, unverifiedChannel])("canal%s sem vínculo verificado recusa antes de criar conversa/projeção", async (whatsappPhoneNumberId) => {
    const leadId = await createLead(tenantAId), input = dto({ whatsappPhoneNumberId });
    expect(await ingestMessage(tenantAId, leadId, input, { now: () => now })).toEqual({ ok: false, code: "canal-nao-vinculado" });
    expect(await db.select().from(conversations).where(eq(conversations.leadId, leadId))).toEqual([]);
    expect(await db.select().from(messages).where(eq(messages.externalId, input.externalId))).toEqual([]);
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, leadId))).toEqual([]);
  });

  it("wamid duplicado preserva canal/texto/data/autoria originais sem enriquecer legado", async () => {
    const leadId = await createLead(tenantAId), input = dto();
    const first = await ingestMessage(tenantAId, leadId, input, { now: () => now });
    if (!first.ok) throw new Error("Mensagem ausente");
    const [projection] = await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, leadId));
    expect(await ingestMessage(tenantAId, leadId, { ...input, sender: "agente", content: "Não substituir", sentAt: new Date(now.getTime() + 1), whatsappPhoneNumberId: channel }, { now: () => now }))
      .toEqual({ ...first, created: false });
    expect(await db.select().from(leadAgentState).where(eq(leadAgentState.leadId, leadId))).toEqual([projection]);
    expect(first.message.whatsappPhoneNumberId).toBeNull(); expect(first.message.authorName).toBeNull();
  });

  it("replay não depende de canal atualmente vinculado, mas nunca muda correlação original", async () => {
    const leadId = await createLead(tenantAId), input = dto();
    const first = await ingestMessage(tenantAId, leadId, input);
    if (!first.ok) throw new Error("Mensagem ausente");
    expect(await ingestMessage(tenantAId, leadId, { ...input, whatsappPhoneNumberId: foreignChannel })).toEqual({ ...first, created: false });
  });

  it("turno antigo novo/replay devolve âncora cronológica corrente e sua revisão", async () => {
    const leadId = await createLead(tenantAId), latest = await ingestMessage(tenantAId, leadId, dto({ whatsappPhoneNumberId: channel }));
    if (!latest.ok) throw new Error("Mensagem ausente");
    const oldInput = dto({ sentAt: new Date(now.getTime() - 1), whatsappPhoneNumberId: channel });
    const old = await ingestMessage(tenantAId, leadId, oldInput), replay = await ingestMessage(tenantAId, leadId, oldInput);
    expect(old).toMatchObject({ ok: true, created: true, anchorMessageId: latest.message.id, agentStateRevision: 1 });
    if (!old.ok) throw new Error("Mensagem ausente");
    expect(replay).toEqual({ ...old, created: false });
  });

  it("leitura não limita a âncora aos itens retornados; saída recente não vira inbound", async () => {
    const leadId = await createLead(tenantAId), anchor = await ingestMessage(tenantAId, leadId, dto());
    const outbound = await ingestMessage(tenantAId, leadId, dto({ sender: "agente", sentAt: new Date(now.getTime() + 1), whatsappPhoneNumberId: channel }));
    if (!anchor.ok || !outbound.ok) throw new Error("Mensagem ausente");
    expect(outbound.anchorMessageId).toBe(anchor.message.id); expect(outbound.agentStateRevision).toBe(1);
    expect(await listMessages(tenantAId, leadId, 1)).toEqual({ ok: true, messages: [outbound.message], anchorMessageId: anchor.message.id, agentStateRevision: 1 });
  });

  it("serviço de integração lê outra carteira no próprio tenant e preserva autor humano", async () => {
    const leadId = await createLead(tenantAId);
    await db.update(leads).set({ assignedUserId: brokerId }).where(eq(leads.id, leadId));
    const anchor = await ingestMessage(tenantAId, leadId, dto());
    if (!anchor.ok) throw new Error("Mensagem ausente");
    const [human] = await db.insert(messages).values({ tenantId: tenantAId, conversationId: anchor.message.conversationId, sender: "humano", authorUserId: brokerId, authorName: "Corretor T30", content: "Mensagem da equipe", sentAt: new Date(now.getTime() + 1), whatsappPhoneNumberId: channel }).returning();
    expect(await listMessages(tenantAId, leadId, 1)).toEqual({ ok: true, messages: [human], anchorMessageId: anchor.message.id, agentStateRevision: 1 });
    expect(serializeMessage(human)).toEqual({ id: human.id, externalId: null, sender: "humano", content: "Mensagem da equipe", sentAt: human.sentAt.toISOString(), authorName: "Corretor T30", whatsappPhoneNumberId: channel });
  });

  it("status órfão correlaciona a saída real sem virar âncora ou inventar classificação", async () => {
    const leadId = await createLead(tenantAId), input = dto({ sender: "agente", whatsappPhoneNumberId: channel });
    await db.insert(whatsappMessageReceipts).values({ tenantId: tenantAId, phoneNumberId: channel, wamid: input.externalId, deliveredAt: now, classification: "free_service", pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false });
    const result = await ingestMessage(tenantAId, leadId, input);
    if (!result.ok) throw new Error("Mensagem ausente");
    expect(result.anchorMessageId).toBeNull(); expect(result.agentStateRevision).toBeNull();
    expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, input.externalId))).toEqual([expect.objectContaining({ messageId: result.message.id, classification: "free_service" })]);
  });

  it("colisão de wamid entre leads não devolve thread/âncora de outro contexto", async () => {
    const owner = await createLead(tenantAId), other = await createLead(tenantAId), input = dto();
    await ingestMessage(tenantAId, owner, input);
    expect(await ingestMessage(tenantAId, other, input)).toEqual({ ok: false, code: "recurso-nao-encontrado" });
    expect(await db.select().from(conversations).where(eq(conversations.leadId, other))).toEqual([]);
  });

  it("lista vazia tem âncora/revisão null; tenant alheio preserva erro legado", async () => {
    const leadId = await createLead(tenantAId);
    expect(await listMessages(tenantAId, leadId, 1)).toEqual({ ok: true, messages: [], anchorMessageId: null, agentStateRevision: null });
    expect(await listMessages(tenantBId, leadId, 1)).toEqual({ ok: false, code: "recurso-nao-encontrado" });
  });

  it("leitura espera ingestão pendente e retorna histórico/âncora/revisão do mesmo commit", async () => {
    const leadId = await createLead(tenantAId), a = await db.$client.connect(), b = await db.$client.connect();
    let release!: () => void, ready!: () => void, pidReady!: (value: number) => void;
    const held = new Promise<void>((resolve) => { release = resolve; }), inserted = new Promise<void>((resolve) => { ready = resolve; }), readerPid = new Promise<number>((resolve) => { pidReady = resolve; });
    const writerDb = drizzle(a, { schema }), readerDb = drizzle(b, { schema });
    const writer: Pick<typeof db, "transaction"> = { transaction: (callback, config) => writerDb.transaction(async (tx) => { const result = await callback(tx); ready(); await held; return result; }, config) };
    const reader: Pick<typeof db, "transaction"> = { transaction: (callback, config) => readerDb.transaction(async (tx) => { pidReady((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx); }, config) };
    let pending: Promise<unknown>[] = [];
    try {
      const writerPid = (await a.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const incoming = ingestMessage(tenantAId, leadId, dto({ whatsappPhoneNumberId: channel }), { now: () => now, database: writer }); pending = [incoming]; await inserted;
      const reading = listMessages(tenantAId, leadId, 1, { database: reader }); pending.push(reading);
      const pid = await readerPid; expect(pid).not.toBe(writerPid);
      let waited = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await db.$client.query<{ waiting: boolean }>("SELECT wait_event_type='Lock' AS waiting FROM pg_stat_activity WHERE pid=$1", [pid]);
        if (result.rows[0]?.waiting) { waited = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waited).toBe(true); release();
      const [message, snapshot] = await Promise.all([incoming, reading]);
      if (!message.ok) throw new Error("Mensagem ausente");
      expect(snapshot).toEqual({ ok: true, messages: [message.message], anchorMessageId: message.message.id, agentStateRevision: 1 });
    } finally { release(); await Promise.allSettled(pending); a.release(); b.release(); }
  });

  it.each(["", " ", "abc", 123, {}, [], "1".repeat(33)])("parser rejeita canal inválido%s sem descartar silenciosamente", (whatsappPhoneNumberId) => {
    const input = dto();
    expect(parseMessageCreate({ ...input, sentAt: now.toISOString(), whatsappPhoneNumberId })).toEqual({ ok: false, detail: "Campo 'whatsappPhoneNumberId' deve ser nulo ou conter apenas dígitos (1 a 32)." });
  });

  it.each([undefined, null, " 12345678901234567890 "])("parser preserva canal aditivo%s e legado exato", (whatsappPhoneNumberId) => {
    const input = dto();
    expect(parseMessageCreate({ ...input, sentAt: now.toISOString(), ...(whatsappPhoneNumberId !== undefined ? { whatsappPhoneNumberId } : {}) }))
      .toEqual({ ok: true, dto: { ...input, ...(whatsappPhoneNumberId !== undefined ? { whatsappPhoneNumberId: whatsappPhoneNumberId === null ? null : channel } : {}) } });
  });
});
