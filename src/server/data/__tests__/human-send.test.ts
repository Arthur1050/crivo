import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import {
  conversations,
  humanMessageSends,
  leads,
  messages,
  tenants,
  users,
} from "../../../db/schema";
import {
  HUMAN_SEND_STALE_MS,
  failHumanSend,
  getLastLeadMessageAt,
  getMessages,
  recordHumanMessage,
  reserveHumanSend,
} from "../index";

/**
 * Reserva e registro do envio humano (lote-14, T6 — ENVIO-01, JANELA-01).
 * Tenants, usuário e leads próprios deste arquivo.
 */

const T0 = new Date("2026-10-01T12:00:00.000Z");
const SECOND = 1000;

describe("server/data — envio humano (lote-14, T6)", () => {
  let tenantAId: string;
  let tenantBId: string;
  let authorId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values(
      [tenantAId, tenantBId].map((id) => ({
        id,
        name: `Tenant envio humano ${id}`,
        agentName: "Agente",
        supportedModality: "ambos" as const,
        slug: `fixture-${id}`,
      }))
    );
    authorId = randomUUID();
    await db.insert(users).values({ id: authorId, name: "Ana Corretora", email: `${authorId}@fixture.test` });
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await db.delete(humanMessageSends).where(inArray(humanMessageSends.tenantId, tenantIds));
    await db.delete(messages).where(inArray(messages.tenantId, tenantIds));
    await db.delete(conversations).where(inArray(conversations.tenantId, tenantIds));
    await db.delete(leads).where(inArray(leads.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    await db.delete(users).where(eq(users.id, authorId));
    await db.$client.end();
  });

  async function createLead(tenantId = tenantAId): Promise<string> {
    const id = randomUUID();
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Envio",
      phone: "+55 34 90000-3333",
      status: "em_qualificacao",
      firstContactAt: T0,
    });
    return id;
  }

  async function createConversation(leadId: string, tenantId = tenantAId): Promise<string> {
    const [row] = await db.insert(conversations).values({ tenantId, leadId }).returning();
    return row.id;
  }

  async function addMessage(
    conversationId: string,
    sender: "lead" | "agente" | "humano",
    sentAt: Date,
    tenantId = tenantAId
  ) {
    await db.insert(messages).values({
      tenantId,
      conversationId,
      sender,
      content: `mensagem ${sender}`,
      sentAt,
      authorName: sender === "humano" ? "Ana Corretora" : null,
    });
  }

  async function readReservation(tenantId: string, requestId: string) {
    const [row] = await db
      .select()
      .from(humanMessageSends)
      .where(and(eq(humanMessageSends.tenantId, tenantId), eq(humanMessageSends.requestId, requestId)));
    return row;
  }

  /** Espera até `count` conexões estarem paradas em trava de linha nesta tabela. */
  async function waitForLockWaiters(count: number) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await db.$client.query<{ waiting: number }>(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'
           AND query ILIKE 'update "human_message_sends"%'`
      );
      if (rows[0].waiting >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Menos de ${count} retomadas paradas na trava em 5 s.`);
  }

  function recordInput(leadId: string, requestId: string, sentAt: Date) {
    return {
      tenantId: tenantAId,
      leadId,
      requestId,
      authorUserId: authorId,
      authorName: "Ana Corretora",
      content: "Oi, aqui é a Ana, corretora",
      wamid: `wamid.${randomUUID()}`,
      sentAt,
    };
  }

  describe("getLastLeadMessageAt (JANELA-01 AC1)", () => {
    it("ignora mensagens do agente e do humano", async () => {
      const leadId = await createLead();
      const conversationId = await createConversation(leadId);
      const leadAt = new Date(T0.getTime() - 3 * 60 * 60 * SECOND);
      await addMessage(conversationId, "lead", leadAt);
      await addMessage(conversationId, "agente", new Date(T0.getTime() - 2 * 60 * 60 * SECOND));
      await addMessage(conversationId, "humano", new Date(T0.getTime() - 60 * 60 * SECOND));
      expect(await getLastLeadMessageAt(tenantAId, leadId)).toEqual(leadAt);
    });

    it("devolve a mais recente entre várias mensagens do lead", async () => {
      const leadId = await createLead();
      const conversationId = await createConversation(leadId);
      const latest = new Date(T0.getTime() - 60 * SECOND);
      await addMessage(conversationId, "lead", new Date(T0.getTime() - 600 * SECOND));
      await addMessage(conversationId, "lead", latest);
      expect(await getLastLeadMessageAt(tenantAId, leadId)).toEqual(latest);
    });

    it("devolve null sem mensagem do lead", async () => {
      const leadId = await createLead();
      const conversationId = await createConversation(leadId);
      await addMessage(conversationId, "agente", T0);
      await addMessage(conversationId, "humano", T0);
      expect(await getLastLeadMessageAt(tenantAId, leadId)).toBeNull();
    });

    it("não enxerga lead de outro tenant (L-035)", async () => {
      const leadId = await createLead();
      const conversationId = await createConversation(leadId);
      await addMessage(conversationId, "lead", T0);
      expect(await getLastLeadMessageAt(tenantBId, leadId)).toBeNull();
    });
  });

  describe("reserveHumanSend (ENVIO-01 AC11)", () => {
    it("a janela de envio em voo é de 2 minutos (L-037)", () => {
      expect(HUMAN_SEND_STALE_MS).toBe(120000);
    });

    it("chave nova -> reserva em enviando", async () => {
      const leadId = await createLead();
      const requestId = randomUUID();
      const result = await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      expect(result).toMatchObject({ outcome: "reservado", resumed: false });
      const row = await readReservation(tenantAId, requestId);
      expect(row.state).toBe("enviando");
      expect(row.leadId).toBe(leadId);
      expect(row.userId).toBe(authorId);
    });

    it("chave já enviada -> devolve a mensagem existente", async () => {
      const leadId = await createLead();
      const requestId = randomUUID();
      await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      const recorded = await recordHumanMessage(recordInput(leadId, requestId, T0));
      const again = await reserveHumanSend(
        tenantAId,
        leadId,
        authorId,
        requestId,
        new Date(T0.getTime() + 10 * 60 * SECOND)
      );
      expect(again.outcome).toBe("ja-enviada");
      expect(again.outcome === "ja-enviada" && again.message.id).toBe(recorded!.id);
      expect((await readReservation(tenantAId, requestId)).state).toBe("enviada");
    });

    it("enviando com 1 min 59 s -> envio-em-andamento", async () => {
      const leadId = await createLead();
      const requestId = randomUUID();
      await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      const result = await reserveHumanSend(
        tenantAId,
        leadId,
        authorId,
        requestId,
        new Date(T0.getTime() + 119 * SECOND)
      );
      expect(result).toEqual({ outcome: "envio-em-andamento" });
      expect((await readReservation(tenantAId, requestId)).updatedAt).toEqual(T0);
    });

    it("enviando com exatamente 2 min -> retomada (fronteira, L-023)", async () => {
      const leadId = await createLead();
      const requestId = randomUUID();
      await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      const later = new Date(T0.getTime() + 120 * SECOND);
      const result = await reserveHumanSend(tenantAId, leadId, authorId, requestId, later);
      expect(result).toMatchObject({ outcome: "reservado", resumed: true });
      const row = await readReservation(tenantAId, requestId);
      expect(row.state).toBe("enviando");
      expect(row.updatedAt).toEqual(later);
    });

    it("falhou -> retomada por compare-and-set", async () => {
      const leadId = await createLead();
      const requestId = randomUUID();
      await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      await failHumanSend(tenantAId, requestId, "tempo-esgotado", new Date(T0.getTime() + 15 * SECOND));
      const failed = await readReservation(tenantAId, requestId);
      expect(failed.state).toBe("falhou");
      expect(failed.failure).toBe("tempo-esgotado");

      const retry = new Date(T0.getTime() + 20 * SECOND);
      const result = await reserveHumanSend(tenantAId, leadId, authorId, requestId, retry);
      expect(result).toMatchObject({ outcome: "reservado", resumed: true });
      const row = await readReservation(tenantAId, requestId);
      expect(row.state).toBe("enviando");
      expect(row.failure).toBeNull();
    });

    it("dois retomadores concorrentes de uma reserva falhou: só um reserva", async () => {
      const leadId = await createLead();
      const requestId = randomUUID();
      await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      await failHumanSend(tenantAId, requestId, "falha-meta", new Date(T0.getTime() + SECOND));
      const retry = new Date(T0.getTime() + 5 * SECOND);
      const results = await Promise.all([
        reserveHumanSend(tenantAId, leadId, authorId, requestId, retry),
        reserveHumanSend(tenantAId, leadId, authorId, requestId, retry),
      ]);
      const outcomes = results.map((result) => result.outcome).sort();
      expect(outcomes).toEqual(["envio-em-andamento", "reservado"]);
    });

    it("dois retomadores que leram a mesma reserva falhou: o compare-and-set barra o segundo", async () => {
      // O teste acima não chega ao compare-and-set: o pool serializa as duas
      // retomadas e a segunda já lê `enviando` recente. Aqui uma transação
      // separada trava a linha; as duas retomadas leem `falhou` (leitura sem
      // trava) e param no UPDATE. Ao liberar, a segunda reavalia o WHERE contra
      // a linha que a primeira acabou de mudar.
      const leadId = await createLead();
      const requestId = randomUUID();
      await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      await failHumanSend(tenantAId, requestId, "falha-meta", new Date(T0.getTime() + SECOND));

      const locker = await db.$client.connect();
      let results: Awaited<ReturnType<typeof reserveHumanSend>>[];
      try {
        await locker.query("BEGIN");
        await locker.query(
          "SELECT id FROM human_message_sends WHERE tenant_id = $1 AND request_id = $2 FOR UPDATE",
          [tenantAId, requestId]
        );
        const retry = new Date(T0.getTime() + 5 * SECOND);
        const pending = Promise.all([
          reserveHumanSend(tenantAId, leadId, authorId, requestId, retry),
          reserveHumanSend(tenantAId, leadId, authorId, requestId, retry),
        ]);
        await waitForLockWaiters(2);
        await locker.query("COMMIT");
        results = await pending;
      } finally {
        locker.release();
      }

      const outcomes = results.map((result) => result.outcome).sort();
      expect(outcomes).toEqual(["envio-em-andamento", "reservado"]);
    });
  });

  describe("recordHumanMessage (ENVIO-01 AC2)", () => {
    it("dois usuários enviando quase juntos: as duas mensagens ficam gravadas, na ordem do envio (Edge Cases)", async () => {
      const leadId = await createLead();
      const conversationId = await createConversation(leadId);
      const otherId = randomUUID();
      await db.insert(users).values({ id: otherId, name: "Bruno Corretor", email: `${otherId}@fixture.test` });
      try {
        const firstRequest = randomUUID();
        const secondRequest = randomUUID();
        const reservations = await Promise.all([
          reserveHumanSend(tenantAId, leadId, authorId, firstRequest, T0),
          reserveHumanSend(tenantAId, leadId, otherId, secondRequest, T0),
        ]);
        expect(reservations.map((result) => result.outcome)).toEqual(["reservado", "reservado"]);

        // O segundo envio é gravado primeiro: a thread segue o instante de envio.
        const firstAt = new Date(T0.getTime() + SECOND);
        const secondAt = new Date(T0.getTime() + 2 * SECOND);
        await Promise.all([
          recordHumanMessage({
            ...recordInput(leadId, secondRequest, secondAt),
            authorUserId: otherId,
            authorName: "Bruno Corretor",
            content: "Bruno aqui",
          }),
          recordHumanMessage({ ...recordInput(leadId, firstRequest, firstAt), content: "Ana aqui" }),
        ]);

        const thread = await getMessages({ tenantId: tenantAId, assignedUserId: null }, conversationId);
        expect(thread.map((message) => [message.authorName, message.content])).toEqual([
          ["Ana Corretora", "Ana aqui"],
          ["Bruno Corretor", "Bruno aqui"],
        ]);
      } finally {
        await db.delete(humanMessageSends).where(eq(humanMessageSends.leadId, leadId));
        await db.delete(messages).where(eq(messages.conversationId, conversationId));
        await db.delete(users).where(eq(users.id, otherId));
      }
    });

    it("grava sender humano, autor, wamid como externalId e fecha a reserva com message_id", async () => {
      const leadId = await createLead();
      const conversationId = await createConversation(leadId);
      const requestId = randomUUID();
      await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      const sentAt = new Date(T0.getTime() + 3 * SECOND);
      const input = recordInput(leadId, requestId, sentAt);

      const message = await recordHumanMessage(input);

      const [stored] = await db.select().from(messages).where(eq(messages.id, message!.id));
      expect(stored.sender).toBe("humano");
      expect(stored.authorUserId).toBe(authorId);
      expect(stored.authorName).toBe("Ana Corretora");
      expect(stored.externalId).toBe(input.wamid);
      expect(stored.content).toBe("Oi, aqui é a Ana, corretora");
      expect(stored.sentAt).toEqual(sentAt);
      expect(stored.conversationId).toBe(conversationId);

      const reservation = await readReservation(tenantAId, requestId);
      expect(reservation.state).toBe("enviada");
      expect(reservation.messageId).toBe(message!.id);
      expect(reservation.wamid).toBe(input.wamid);
    });

    it("falha forçada no insert da mensagem: nada fica gravado e a reserva não fica enviada (L-002)", async () => {
      // Lead sem conversa: a transação cria a conversa antes do insert que
      // falha. Se a conversa sobrar, a transação não é atômica.
      const leadId = await createLead();
      const requestId = randomUUID();
      await reserveHumanSend(tenantAId, leadId, authorId, requestId, T0);
      const input = {
        ...recordInput(leadId, requestId, T0),
        // Viola o CHECK `messages_humano_author_name_required` no insert.
        authorName: null as unknown as string,
      };

      await expect(recordHumanMessage(input)).rejects.toThrow();

      const leadConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.leadId, leadId));
      expect(leadConversations).toHaveLength(0);
      const stored = await db.select().from(messages).where(eq(messages.externalId, input.wamid));
      expect(stored).toHaveLength(0);
      const reservation = await readReservation(tenantAId, requestId);
      expect(reservation.state).toBe("enviando");
      expect(reservation.messageId).toBeNull();
    });
  });
});
