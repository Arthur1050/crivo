import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../db";
import {
  conversations,
  humanMessageSends,
  leads,
  messages,
  tenants,
  users,
} from "../../db/schema";
import type { Action, Resource, Role } from "../../lib/permissions";
import type { AuthContext } from "../auth/session";

/**
 * Server actions de Chats (lote-14, T18 — ASSUMIR-01, ENVIO-01, DEVOLVER-01,
 * OPTHUM-01; design.md C5). Harness de `properties-actions.test.ts`: sessão
 * fabricada e decisão de permissão real (`authorizeOrThrow`). A Meta nunca é
 * chamada: o `fetch` global é trocado por um falso, e o token é sintético.
 */

let sessionRoles: Role[] = ["administrador"];
let sessionTenantId = "";
const sessionUser = { id: "", name: "", email: "" };

vi.mock("../auth/session", async (importActual) => {
  const actual = await importActual<typeof import("../auth/session")>();
  const fakeSession = async (): Promise<AuthContext> => ({
    user: sessionUser,
    tenantId: sessionTenantId,
    roles: sessionRoles,
    leadScope: {
      tenantId: sessionTenantId,
      assignedUserId:
        sessionRoles.length > 0 && sessionRoles.every((role) => role === "corretor")
          ? sessionUser.id
          : null,
    },
  });
  return {
    ...actual,
    verifySession: fakeSession,
    requirePermission: async (resource: Resource, action: Action) =>
      actual.authorizeOrThrow(await fakeSession(), resource, action),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import {
  assumeConversationAction,
  registerOptOutAction,
  returnConversationToAgentAction,
  sendHumanMessageAction,
} from "../actions/chats";

const HOUR = 60 * 60 * 1000;
const DENIED = { ok: false, error: "Sem permissão para escrever chats." };

describe("server actions — Chats (lote-14, T18)", () => {
  let tenantId: string;
  let userId: string;
  let otherBrokerId: string;
  const fakeFetch = vi.fn<typeof fetch>(
    async () => new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), { status: 200 })
  );

  beforeAll(async () => {
    tenantId = randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: `Tenant actions Chats ${tenantId}`,
      agentName: "Agente",
      supportedModality: "ambos",
      slug: `fixture-t18-${tenantId}`,
    });
    userId = randomUUID();
    otherBrokerId = randomUUID();
    await db.insert(users).values([
      { id: userId, name: "Carla Gestora", email: `${userId}@fixture.test` },
      { id: otherBrokerId, name: "Bruno Corretor", email: `${otherBrokerId}@fixture.test` },
    ]);
    sessionTenantId = tenantId;
    sessionUser.id = userId;
    sessionUser.name = "Carla Gestora";
    sessionUser.email = `${userId}@fixture.test`;
  });

  beforeEach(() => {
    sessionRoles = ["administrador"];
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "token-sintetico-de-teste");
    vi.stubGlobal("fetch", fakeFetch);
    fakeFetch.mockClear();
    vi.mocked(revalidatePath).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await db.delete(humanMessageSends).where(eq(humanMessageSends.tenantId, tenantId));
    await db.delete(messages).where(eq(messages.tenantId, tenantId));
    await db.delete(conversations).where(eq(conversations.tenantId, tenantId));
    await db.delete(leads).where(eq(leads.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(users).where(inArray(users.id, [userId, otherBrokerId]));
    await db.$client.end();
  });

  async function createLead(options: { takenOver: boolean; assignedUserId?: string }) {
    const id = randomUUID();
    const now = Date.now();
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Actions",
      phone: "+55 34 99999-0000",
      status: "em_qualificacao",
      firstContactAt: new Date(now - 48 * HOUR),
      externalId: `55349${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
      whatsappPhoneNumberId: "109876543210",
      humanTakeoverAt: options.takenOver ? new Date(now - HOUR) : null,
      humanTakeoverBy: options.takenOver ? otherBrokerId : null,
      assignedUserId: options.assignedUserId ?? null,
    });
    const [conversation] = await db.insert(conversations).values({ tenantId, leadId: id }).returning();
    await db.insert(messages).values({
      tenantId,
      conversationId: conversation.id,
      sender: "lead",
      content: "mensagem do lead",
      sentAt: new Date(now - HOUR),
    });
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

  describe("sessão sem papel: recusa de permissão e nada gravado", () => {
    beforeEach(() => {
      sessionRoles = [];
    });

    it("assumir é recusado e o lead fica sem a marca (ASSUMIR-01 AC4)", async () => {
      const leadId = await createLead({ takenOver: false });
      expect(await assumeConversationAction({ leadId })).toEqual(DENIED);
      const lead = await readLead(leadId);
      expect(lead.humanTakeoverAt).toBeNull();
      expect(lead.humanTakeoverBy).toBeNull();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("devolver é recusado e a marca fica (DEVOLVER-01 AC8)", async () => {
      const leadId = await createLead({ takenOver: true });
      expect(await returnConversationToAgentAction({ leadId })).toEqual(DENIED);
      const lead = await readLead(leadId);
      expect(lead.humanTakeoverBy).toBe(otherBrokerId);
      expect(lead.memoryResetRequestedAt).toBeNull();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("enviar é recusado sem chamar a Meta e sem gravar (ENVIO-01 AC7)", async () => {
      const leadId = await createLead({ takenOver: true });
      const result = await sendHumanMessageAction({ leadId, text: "Oi", requestId: randomUUID() });
      expect(result).toEqual(DENIED);
      expect(fakeFetch).toHaveBeenCalledTimes(0);
      expect(await humanMessagesOf(leadId)).toHaveLength(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("registrar opt-out é recusado e optedOutAt fica nulo (OPTHUM-01 AC8)", async () => {
      const leadId = await createLead({ takenOver: true });
      expect(await registerOptOutAction({ leadId, requestId: randomUUID() })).toEqual(DENIED);
      expect((await readLead(leadId)).optedOutAt).toBeNull();
      expect(fakeFetch).toHaveBeenCalledTimes(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("ligação com os serviços (L-026) e revalidatePath('/chats')", () => {
    it("assumir grava a marca com o id do usuário da sessão", async () => {
      const leadId = await createLead({ takenOver: false });
      const before = Date.now();

      expect(await assumeConversationAction({ leadId })).toEqual({ ok: true });

      const lead = await readLead(leadId);
      expect(lead.humanTakeoverBy).toBe(userId);
      expect(lead.humanTakeoverAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(revalidatePath).toHaveBeenCalledWith("/chats");
    });

    it("assumir usa o escopo da sessão: corretor não assume lead de outra carteira (ASSUMIR-01 AC3)", async () => {
      sessionRoles = ["corretor"];
      const leadId = await createLead({ takenOver: false, assignedUserId: otherBrokerId });

      expect(await assumeConversationAction({ leadId })).toEqual({
        ok: false,
        error: "Lead não encontrado.",
      });
      expect((await readLead(leadId)).humanTakeoverAt).toBeNull();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("devolver limpa a marca", async () => {
      const leadId = await createLead({ takenOver: true });

      expect(await returnConversationToAgentAction({ leadId })).toEqual({ ok: true });

      const lead = await readLead(leadId);
      expect(lead.humanTakeoverAt).toBeNull();
      expect(lead.humanTakeoverBy).toBeNull();
      expect(revalidatePath).toHaveBeenCalledWith("/chats");
    });

    it("enviar grava a mensagem com o nome do usuário da sessão como autor", async () => {
      const leadId = await createLead({ takenOver: true });

      const result = await sendHumanMessageAction({
        leadId,
        text: "  Oi, aqui é a Carla  ",
        requestId: randomUUID(),
      });

      expect(result).toEqual({ ok: true });
      expect(fakeFetch).toHaveBeenCalledTimes(1);
      const stored = await humanMessagesOf(leadId);
      expect(stored).toHaveLength(1);
      expect(stored[0].content).toBe("Oi, aqui é a Carla");
      expect(stored[0].authorName).toBe("Carla Gestora");
      expect(stored[0].authorUserId).toBe(userId);
      expect(revalidatePath).toHaveBeenCalledWith("/chats");
    });

    it("enviar devolve o motivo do serviço quando recusa", async () => {
      const leadId = await createLead({ takenOver: false });

      const result = await sendHumanMessageAction({ leadId, text: "Oi", requestId: randomUUID() });

      expect(result).toEqual({
        ok: false,
        failure: "conversa-com-agente",
        error: "O agente voltou a conduzir esta conversa. Assuma de novo para responder.",
      });
      expect(fakeFetch).toHaveBeenCalledTimes(0);
    });

    it("opt-out grava optedOutAt", async () => {
      const leadId = await createLead({ takenOver: true });

      const result = await registerOptOutAction({ leadId, requestId: randomUUID() });

      expect(result).toEqual({ ok: true, confirmationDelivered: true });
      expect((await readLead(leadId)).optedOutAt).not.toBeNull();
      expect(revalidatePath).toHaveBeenCalledWith("/chats");
    });
  });
});
