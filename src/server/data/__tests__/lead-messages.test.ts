import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../db";
import { conversations, leads, messages, tenants } from "../../../db/schema";
import { getLeadMessages } from "../index";

// Tenants + leads PRÓPRIOS deste arquivo (nunca o snapshot do seed) — mesmo
// padrão de isolamento dos demais testes de integração da DAL (lote-5/6).
describe("server/data — getLeadMessages (lote-6b, CTX-02)", () => {
  let tenantAId: string;
  let tenantBId: string;
  let leadAId: string;
  let leadOfBId: string;
  let leadNoMessagesId: string;
  let conversationAId: string;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values([
      {
        id: tenantAId,
        name: `Tenant Teste A lead-messages ${tenantAId}`,
        agentName: "Agente A",
        supportedModality: "ambos",
      },
      {
        id: tenantBId,
        name: `Tenant Teste B lead-messages ${tenantBId}`,
        agentName: "Agente B",
        supportedModality: "ambos",
      },
    ]);

    leadAId = randomUUID();
    leadOfBId = randomUUID();
    leadNoMessagesId = randomUUID();
    await db.insert(leads).values([
      {
        id: leadAId,
        tenantId: tenantAId,
        name: "Lead Teste A",
        phone: "+55 34 90000-0000",
        status: "em_qualificacao",
        firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: leadOfBId,
        tenantId: tenantBId,
        name: "Lead Teste B",
        phone: "+55 34 90000-0001",
        status: "em_qualificacao",
        firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: leadNoMessagesId,
        tenantId: tenantAId,
        name: "Lead Sem Mensagens",
        phone: "+55 34 90000-0002",
        status: "em_qualificacao",
        firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    ]);

    const [conversationA] = await db
      .insert(conversations)
      .values({ tenantId: tenantAId, leadId: leadAId })
      .returning();
    conversationAId = conversationA.id;

    // 5 mensagens do lead A, sentAt crescente (1..5), inseridas fora de
    // ordem para não depender da ordem de inserção.
    const seedOrder = [3, 1, 5, 2, 4];
    for (const n of seedOrder) {
      await db.insert(messages).values({
        tenantId: tenantAId,
        conversationId: conversationAId,
        sender: n % 2 === 0 ? "agente" : "lead",
        content: `mensagem ${n}`,
        sentAt: new Date(`2026-08-01T10:0${n}:00.000Z`),
      });
    }
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

  it("lead com 5 mensagens devolve as 5 em ordem cronológica crescente (CTX-02 AC1)", async () => {
    const result = await getLeadMessages(tenantAId, leadAId, 50);
    expect(result).not.toBeNull();
    expect(result!.map((m) => m.content)).toEqual([
      "mensagem 1",
      "mensagem 2",
      "mensagem 3",
      "mensagem 4",
      "mensagem 5",
    ]);
  });

  // Discrimina `ORDER BY sentAt DESC, id DESC LIMIT n` (correto — pega as
  // mais recentes) de `ORDER BY sentAt ASC LIMIT n` (errado — pegaria as
  // mais antigas): com limit=2 as 2 mais recentes são "mensagem 4" e
  // "mensagem 5", ainda devolvidas em ordem crescente.
  it("limit=2 devolve as 2 mensagens MAIS RECENTES, ainda em ordem crescente (CTX-02 AC2)", async () => {
    const result = await getLeadMessages(tenantAId, leadAId, 2);
    expect(result).not.toBeNull();
    expect(result!.map((m) => m.content)).toEqual(["mensagem 4", "mensagem 5"]);
  });

  it("lead de outro tenant devolve null (isolamento cross-tenant)", async () => {
    const result = await getLeadMessages(tenantAId, leadOfBId, 50);
    expect(result).toBeNull();
  });

  it("lead inexistente no tenant devolve null", async () => {
    const result = await getLeadMessages(tenantAId, randomUUID(), 50);
    expect(result).toBeNull();
  });

  it("lead existente sem nenhuma mensagem devolve [] — distinto de null", async () => {
    const result = await getLeadMessages(tenantAId, leadNoMessagesId, 50);
    expect(result).not.toBeNull();
    expect(result).toEqual([]);
  });
});
