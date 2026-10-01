import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OPT_OUT_CONFIRMATION } from "../../../../n8n/src/opt-out-intent.mjs";
import { db } from "../../../db";
import {
  conversations,
  humanMessageSends,
  leads,
  messages,
  tenants,
  users,
} from "../../../db/schema";
import type { LeadScope } from "../../../lib/lead-scope";
import type { HumanSendContext } from "../human-send";
import { HUMAN_OPT_OUT_MESSAGES, registerHumanOptOut } from "../human-opt-out";

/**
 * Opt-out registrado pelo humano (lote-14, T17 — OPTHUM-01; design.md C5).
 * Banco de teste real; a Meta só por `fetch` falso injetado.
 */

const NOW = new Date("2026-10-01T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const PHONE_NUMBER_ID = "109876543210";

function okFetch() {
  return vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), { status: 200 })
  );
}

describe("chats/human-opt-out — registerHumanOptOut (lote-14, T17)", () => {
  let tenantAId: string;
  let tenantBId: string;
  let authorId: string;
  let otherBrokerId: string;
  let context: HumanSendContext;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    await db.insert(tenants).values(
      [tenantAId, tenantBId].map((id) => ({
        id,
        name: `Tenant opt-out humano T17 ${id}`,
        agentName: "Agente",
        supportedModality: "ambos" as const,
        slug: `fixture-t17-${id}`,
      }))
    );
    authorId = randomUUID();
    otherBrokerId = randomUUID();
    await db.insert(users).values([
      { id: authorId, name: "Ana Corretora", email: `${authorId}@fixture.test` },
      { id: otherBrokerId, name: "Bruno Corretor", email: `${otherBrokerId}@fixture.test` },
    ]);
    context = {
      scope: { tenantId: tenantAId, assignedUserId: null },
      user: { id: authorId, name: "Ana Corretora" },
    };
  });

  beforeEach(() => {
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-sintetico-de-teste");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const tenantIds = [tenantAId, tenantBId];
    await db.delete(humanMessageSends).where(inArray(humanMessageSends.tenantId, tenantIds));
    await db.delete(messages).where(inArray(messages.tenantId, tenantIds));
    await db.delete(conversations).where(inArray(conversations.tenantId, tenantIds));
    await db.delete(leads).where(inArray(leads.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    await db.delete(users).where(inArray(users.id, [authorId, otherBrokerId]));
    await db.$client.end();
  });

  interface LeadFixture {
    tenantId?: string;
    takenOver?: boolean;
    optedOutAt?: Date | null;
    assignedUserId?: string | null;
    lastLeadMessageAgeMs?: number | null;
  }

  async function createLead(fixture: LeadFixture = {}): Promise<string> {
    const id = randomUUID();
    const tenantId = fixture.tenantId ?? tenantAId;
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Opt-out Humano",
      phone: "+55 34 99999-0000",
      status: "em_qualificacao",
      firstContactAt: new Date(NOW.getTime() - 48 * HOUR),
      externalId: `55349${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      whatsappPhoneNumberId: PHONE_NUMBER_ID,
      humanTakeoverAt: (fixture.takenOver ?? true) ? new Date(NOW.getTime() - HOUR) : null,
      humanTakeoverBy: (fixture.takenOver ?? true) ? authorId : null,
      optedOutAt: fixture.optedOutAt ?? null,
      assignedUserId: fixture.assignedUserId ?? null,
    });
    const age = fixture.lastLeadMessageAgeMs === undefined ? HOUR : fixture.lastLeadMessageAgeMs;
    if (age !== null) {
      const [conversation] = await db.insert(conversations).values({ tenantId, leadId: id }).returning();
      await db.insert(messages).values({
        tenantId,
        conversationId: conversation.id,
        sender: "lead",
        content: "mensagem do lead",
        sentAt: new Date(NOW.getTime() - age),
      });
    }
    return id;
  }

  async function readLead(leadId: string) {
    const [row] = await db.select().from(leads).where(eq(leads.id, leadId));
    return row;
  }

  async function humanMessagesOf(leadId: string) {
    return db
      .select({ message: messages })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(and(eq(conversations.leadId, leadId), eq(messages.sender, "humano")))
      .then((rows) => rows.map((row) => row.message));
  }

  async function reservationsOf(leadId: string) {
    return db.select().from(humanMessageSends).where(eq(humanMessageSends.leadId, leadId));
  }

  it("grava optedOutAt e memory_reset_requested_at (AC1, AC6 lado do CRM)", async () => {
    const leadId = await createLead({ lastLeadMessageAgeMs: null });

    const result = await registerHumanOptOut(context, { leadId, requestId: randomUUID() }, NOW, {
      fetch: okFetch(),
    });

    expect(result).toEqual({
      ok: true,
      optedOutAt: NOW,
      newlyOptedOut: true,
      confirmationDelivered: false,
    });
    const lead = await readLead(leadId);
    expect(lead.optedOutAt).toEqual(NOW);
    expect(lead.memoryResetRequestedAt).toEqual(NOW);
  });

  it("janela aberta: uma chamada à Meta com OPT_OUT_CONFIRMATION byte a byte, gravada como humano com autor (AC3)", async () => {
    const leadId = await createLead();
    const fakeFetch = okFetch();

    const result = await registerHumanOptOut(context, { leadId, requestId: randomUUID() }, NOW, {
      fetch: fakeFetch,
    });

    expect(result).toMatchObject({ ok: true, newlyOptedOut: true, confirmationDelivered: true });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const init = fakeFetch.mock.calls[0][1] as RequestInit;
    const sentText = (JSON.parse(init.body as string) as { text: { body: string } }).text.body;
    expect(Buffer.from(sentText, "utf8").equals(Buffer.from(OPT_OUT_CONFIRMATION, "utf8"))).toBe(true);

    const stored = await humanMessagesOf(leadId);
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe(OPT_OUT_CONFIRMATION);
    expect(stored[0].sender).toBe("humano");
    expect(stored[0].authorUserId).toBe(authorId);
    expect(stored[0].authorName).toBe("Ana Corretora");
    expect((await readLead(leadId)).optedOutAt).toEqual(NOW);
  });

  it("janela fechada (24 h exatas): zero chamadas e opt-out gravado (AC4)", async () => {
    const leadId = await createLead({ lastLeadMessageAgeMs: 24 * HOUR });
    const fakeFetch = okFetch();

    const result = await registerHumanOptOut(context, { leadId, requestId: randomUUID() }, NOW, {
      fetch: fakeFetch,
    });

    expect(result).toEqual({
      ok: true,
      optedOutAt: NOW,
      newlyOptedOut: true,
      confirmationDelivered: false,
    });
    expect(fakeFetch).toHaveBeenCalledTimes(0);
    expect((await readLead(leadId)).optedOutAt).toEqual(NOW);
    expect(await humanMessagesOf(leadId)).toHaveLength(0);
  });

  it("Meta recusa: opt-out mantido e confirmationDelivered false, com o aviso (AC5)", async () => {
    const leadId = await createLead();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failingFetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ error: { code: 131056 } }), { status: 400 })
    );

    const result = await registerHumanOptOut(context, { leadId, requestId: randomUUID() }, NOW, {
      fetch: failingFetch,
    });

    expect(failingFetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      optedOutAt: NOW,
      newlyOptedOut: true,
      confirmationDelivered: false,
      warning: HUMAN_OPT_OUT_MESSAGES["confirmacao-nao-entregue"],
    });
    expect(HUMAN_OPT_OUT_MESSAGES["confirmacao-nao-entregue"]).toBe(
      "Opt-out registrado. A confirmação não foi entregue ao lead."
    );
    expect((await readLead(leadId)).optedOutAt).toEqual(NOW);
    expect(await humanMessagesOf(leadId)).toHaveLength(0);
  });

  it("lead já com opt-out: nenhuma escrita nem envio", async () => {
    const original = new Date(NOW.getTime() - 5 * HOUR);
    const leadId = await createLead({ optedOutAt: original });
    const before = await readLead(leadId);
    const fakeFetch = okFetch();

    const result = await registerHumanOptOut(context, { leadId, requestId: randomUUID() }, NOW, {
      fetch: fakeFetch,
    });

    expect(result).toEqual({
      ok: true,
      optedOutAt: original,
      newlyOptedOut: false,
      confirmationDelivered: false,
    });
    expect(fakeFetch).toHaveBeenCalledTimes(0);
    const after = await readLead(leadId);
    expect(after.optedOutAt).toEqual(original);
    expect(after.memoryResetRequestedAt).toBeNull();
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(await reservationsOf(leadId)).toHaveLength(0);
    expect(await humanMessagesOf(leadId)).toHaveLength(0);
  });

  it("lead de outra carteira, para escopo de corretor: recusa e optedOutAt nulo (AC8)", async () => {
    const leadId = await createLead({ assignedUserId: otherBrokerId });
    const brokerScope: LeadScope = { tenantId: tenantAId, assignedUserId: authorId };
    const fakeFetch = okFetch();

    const result = await registerHumanOptOut(
      { ...context, scope: brokerScope },
      { leadId, requestId: randomUUID() },
      NOW,
      { fetch: fakeFetch }
    );

    expect(result).toEqual({
      ok: false,
      failure: "fora-do-escopo",
      error: HUMAN_OPT_OUT_MESSAGES["fora-do-escopo"],
    });
    expect(fakeFetch).toHaveBeenCalledTimes(0);
    expect((await readLead(leadId)).optedOutAt).toBeNull();
  });

  it("lead de outro tenant: recusa e optedOutAt nulo (AC8, L-035)", async () => {
    const leadId = await createLead({ tenantId: tenantBId });
    const fakeFetch = okFetch();

    const result = await registerHumanOptOut(context, { leadId, requestId: randomUUID() }, NOW, {
      fetch: fakeFetch,
    });

    expect(result).toMatchObject({ ok: false, failure: "fora-do-escopo" });
    expect(fakeFetch).toHaveBeenCalledTimes(0);
    expect((await readLead(leadId)).optedOutAt).toBeNull();
  });

  it("lead conduzido pelo agente: opt-out permitido e confirmação enviada", async () => {
    const leadId = await createLead({ takenOver: false });
    const fakeFetch = okFetch();

    const result = await registerHumanOptOut(context, { leadId, requestId: randomUUID() }, NOW, {
      fetch: fakeFetch,
    });

    expect(result).toMatchObject({ ok: true, newlyOptedOut: true, confirmationDelivered: true });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    expect((await readLead(leadId)).optedOutAt).toEqual(NOW);
    expect(await humanMessagesOf(leadId)).toHaveLength(1);
  });
});
