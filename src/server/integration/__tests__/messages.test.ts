import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { conversations, leads, messages, tenants } from "../../../db/schema";
import { getMessages } from "../../data";
import { ingestMessage } from "../messages";

const NON_EXISTENT_LEAD_ID = "00000000-0000-4000-8000-000000000456";

// Tenants + leads PRÓPRIOS deste arquivo (nunca os do seed) — mesmo padrão de
// isolamento de leads.test.ts/leads-post.test.ts.
describe("server/integration messages — ingestMessage", () => {
  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A messages ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
      },
      {
        id: tenantBId,
        name: `Tenant Teste B messages ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(messages).where(eq(messages.tenantId, tenantAId));
    await db.delete(messages).where(eq(messages.tenantId, tenantBId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantAId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantBId));
    await db.delete(leads).where(eq(leads.tenantId, tenantAId));
    await db.delete(leads).where(eq(leads.tenantId, tenantBId));
    await db.delete(tenants).where(eq(tenants.id, tenantAId));
    await db.delete(tenants).where(eq(tenants.id, tenantBId));
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

    const thread = await getMessages(tenantAId, later.message.conversationId);
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

    const thread = await getMessages(tenantAId, msg1.message.conversationId);
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
});
