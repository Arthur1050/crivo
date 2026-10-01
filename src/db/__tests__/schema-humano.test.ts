import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  conversations,
  humanMessageSends,
  leads,
  messages,
  tenants,
  users,
} from "../schema";

/**
 * Restrições do esquema do lote-14 (T2) que têm comportamento no banco:
 * CHECK de autoria humana, unicidade da reserva por tenant e `set null` do
 * autor. Tenants, leads e usuários próprios deste arquivo.
 */

function pgCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const record = err as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string") return record.code;
  if (record.cause !== undefined) return pgCode(record.cause);
  return undefined;
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return pgCode(err);
  }
}

describe("schema — condução humana, autoria e reserva de envio (lote-14, T2)", () => {
  let tenantAId: string;
  let tenantBId: string;
  let leadAId: string;
  let leadBId: string;
  let conversationAId: string;
  const userIds: string[] = [];

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values(
      [tenantAId, tenantBId].map((id) => ({
        id,
        name: `Tenant schema-humano ${id}`,
        agentName: "Agente",
        supportedModality: "ambos" as const,
        slug: `fixture-${id}`,
      }))
    );
    leadAId = randomUUID();
    leadBId = randomUUID();
    await db.insert(leads).values([
      {
        id: leadAId,
        tenantId: tenantAId,
        name: "Lead A",
        phone: "+55 34 90000-0000",
        status: "em_qualificacao",
        firstContactAt: new Date(),
      },
      {
        id: leadBId,
        tenantId: tenantBId,
        name: "Lead B",
        phone: "+55 34 90000-0001",
        status: "em_qualificacao",
        firstContactAt: new Date(),
      },
    ]);
    const [conversation] = await db
      .insert(conversations)
      .values({ tenantId: tenantAId, leadId: leadAId })
      .returning();
    conversationAId = conversation.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await db.delete(humanMessageSends).where(inArray(humanMessageSends.tenantId, tenantIds));
    await db.delete(messages).where(inArray(messages.tenantId, tenantIds));
    await db.delete(conversations).where(inArray(conversations.tenantId, tenantIds));
    await db.delete(leads).where(inArray(leads.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    if (userIds.length > 0) await db.delete(users).where(inArray(users.id, userIds));
    await db.$client.end();
  });

  async function createUser(name: string): Promise<string> {
    const id = randomUUID();
    await db.insert(users).values({ id, name, email: `${id}@fixture.test` });
    userIds.push(id);
    return id;
  }

  it("recusa mensagem `humano` sem `author_name` (CHECK)", async () => {
    const code = await codeOf(
      db.insert(messages).values({
        tenantId: tenantAId,
        conversationId: conversationAId,
        sender: "humano",
        content: "sem autor",
      })
    );
    // 23514 = check_violation
    expect(code).toBe("23514");
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationAId));
    expect(rows.filter((row) => row.content === "sem autor")).toHaveLength(0);
  });

  it("aceita mensagem `humano` com `author_name`", async () => {
    const [row] = await db
      .insert(messages)
      .values({
        tenantId: tenantAId,
        conversationId: conversationAId,
        sender: "humano",
        content: "com autor",
        authorName: "Ana",
      })
      .returning();
    expect(row.sender).toBe("humano");
    expect(row.authorName).toBe("Ana");
  });

  it("o mesmo `request_id` duas vezes no mesmo tenant viola o índice único", async () => {
    const requestId = randomUUID();
    await db.insert(humanMessageSends).values({
      tenantId: tenantAId,
      leadId: leadAId,
      requestId,
      state: "enviando",
    });
    const code = await codeOf(
      db.insert(humanMessageSends).values({
        tenantId: tenantAId,
        leadId: leadAId,
        requestId,
        state: "enviando",
      })
    );
    // 23505 = unique_violation
    expect(code).toBe("23505");
  });

  it("o mesmo `request_id` em tenants diferentes é aceito", async () => {
    const requestId = randomUUID();
    await db.insert(humanMessageSends).values({
      tenantId: tenantAId,
      leadId: leadAId,
      requestId,
      state: "enviando",
    });
    await db.insert(humanMessageSends).values({
      tenantId: tenantBId,
      leadId: leadBId,
      requestId,
      state: "enviando",
    });
    const rows = await db
      .select()
      .from(humanMessageSends)
      .where(eq(humanMessageSends.requestId, requestId));
    expect(rows.map((row) => row.tenantId).sort()).toEqual([tenantAId, tenantBId].sort());
  });

  it("excluir o usuário autor zera `author_user_id` e preserva `author_name` (THREAD-01 AC7)", async () => {
    const authorId = await createUser("Bruno Autor");
    const [inserted] = await db
      .insert(messages)
      .values({
        tenantId: tenantAId,
        conversationId: conversationAId,
        sender: "humano",
        content: "mensagem do Bruno",
        authorUserId: authorId,
        authorName: "Bruno Autor",
      })
      .returning();
    expect(inserted.authorUserId).toBe(authorId);

    await db.delete(users).where(eq(users.id, authorId));

    const [after] = await db.select().from(messages).where(eq(messages.id, inserted.id));
    expect(after.authorUserId).toBeNull();
    expect(after.authorName).toBe("Bruno Autor");
  });
});
