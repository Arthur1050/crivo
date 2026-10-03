import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import {
  conversations,
  humanMessageSends,
  leads,
  messages,
  tenants,
  users,
  whatsappChannels,
  whatsappMessageReceipts,
  whatsappUsage,
} from "../../../db/schema";
import type { LeadScope } from "../../../lib/lead-scope";
import {
  HUMAN_SEND_MESSAGES,
  deliverHumanText,
  sendHumanMessage,
  type HumanSendContext,
  type HumanSendFailure,
} from "../human-send";

/**
 * Serviço de envio humano (lote-14, T16 — ENVIO-01, JANELA-01; design.md C4).
 * Banco de teste real, Meta sempre por `fetch` falso injetado, token
 * sintético no ambiente. Toda recusa afirma zero chamadas ao `fetch`.
 */

const NOW = new Date("2026-10-01T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
// `wa_id` legado (12 dígitos, como chega do webhook) e o MSISDN de 13 dígitos
// que a Cloud API aceita. Os demais leads usam `wa_id` aleatório, porque o
// `externalId` é único por tenant.
const LEGACY_WA_ID = "553498880000";
const MSISDN = "5534998880000";
const PHONE_NUMBER_ID = "109876543210";

function okFetch(wamid = `wamid.${randomUUID()}`) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify({ messages: [{ id: wamid }] }), { status: 200 })
  );
}

function errorFetch(status: number, code: number) {
  return vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify({ error: { message: "erro sintético", code } }), { status })
  );
}

function sentBody(fetchMock: ReturnType<typeof okFetch>) {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string) as { to: string; text: { body: string } };
}

describe("chats/human-send — sendHumanMessage (lote-14, T16)", () => {
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
        name: `Tenant envio humano T16 ${id}`,
        agentName: "Agente",
        supportedModality: "ambos" as const,
        slug: `fixture-t16-${id}`,
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
    await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, tenantIds));
    await db.delete(whatsappUsage).where(inArray(whatsappUsage.tenantId, tenantIds));
    await db.delete(messages).where(inArray(messages.tenantId, tenantIds));
    await db.delete(conversations).where(inArray(conversations.tenantId, tenantIds));
    await db.delete(leads).where(inArray(leads.tenantId, tenantIds));
    await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    await db.delete(users).where(inArray(users.id, [authorId, otherBrokerId]));
    await db.$client.end();
  });

  interface LeadFixture {
    tenantId?: string;
    status?: "em_qualificacao" | "escalado_humano" | "qualificado_agendado";
    takenOver?: boolean;
    optedOut?: boolean;
    phoneNumberId?: string | null;
    assignedUserId?: string | null;
    /** Idade da última mensagem do lead; `null` = sem mensagem do lead. */
    lastLeadMessageAgeMs?: number | null;
    externalId?: string;
  }

  function randomLegacyWaId(): string {
    return `55349${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  }

  async function createLead(fixture: LeadFixture = {}): Promise<string> {
    const id = randomUUID();
    const tenantId = fixture.tenantId ?? tenantAId;
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Envio Humano",
      phone: "+55 34 99999-0000",
      status: fixture.status ?? "em_qualificacao",
      firstContactAt: new Date(NOW.getTime() - 48 * HOUR),
      externalId: fixture.externalId ?? randomLegacyWaId(),
      whatsappPhoneNumberId:
        fixture.phoneNumberId === undefined ? PHONE_NUMBER_ID : fixture.phoneNumberId,
      humanTakeoverAt: (fixture.takenOver ?? true) ? new Date(NOW.getTime() - HOUR) : null,
      humanTakeoverBy: (fixture.takenOver ?? true) ? authorId : null,
      optedOutAt: fixture.optedOut ? new Date(NOW.getTime() - HOUR) : null,
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

  async function expectRefused(
    leadId: string,
    text: string,
    failure: HumanSendFailure,
    ctx: HumanSendContext = context
  ) {
    const fakeFetch = okFetch();
    const result = await sendHumanMessage(
      ctx,
      { leadId, text, requestId: randomUUID() },
      NOW,
      { fetch: fakeFetch }
    );
    expect(result).toEqual({ ok: false, failure, error: HUMAN_SEND_MESSAGES[failure] });
    expect(fakeFetch).toHaveBeenCalledTimes(0);
    expect(await humanMessagesOf(leadId)).toHaveLength(0);
  }

  describe("recusas sem chamar a Meta", () => {
    it("texto vazio é recusado (ENVIO-01 AC4)", async () => {
      await expectRefused(await createLead(), "", "texto-invalido");
    });

    it("texto só com espaços é recusado (ENVIO-01 AC4)", async () => {
      await expectRefused(await createLead(), "   \n\t  ", "texto-invalido");
    });

    it("4.097 caracteres são recusados (ENVIO-01 AC4, fronteira)", async () => {
      await expectRefused(await createLead(), "a".repeat(4097), "texto-invalido");
    });

    it("4.096 caracteres são aceitos (fronteira)", async () => {
      const leadId = await createLead();
      const fakeFetch = okFetch();
      const result = await sendHumanMessage(
        context,
        { leadId, text: ` ${"a".repeat(4096)} `, requestId: randomUUID() },
        NOW,
        { fetch: fakeFetch }
      );
      expect(result.ok).toBe(true);
      expect(fakeFetch).toHaveBeenCalledTimes(1);
      expect(sentBody(fakeFetch).text.body).toHaveLength(4096);
    });

    it("lead conduzido pelo agente é recusado (ENVIO-01 AC5)", async () => {
      await expectRefused(await createLead({ takenOver: false }), "Oi", "conversa-com-agente");
    });

    it("lead com opt-out é recusado (ENVIO-01 AC6)", async () => {
      await expectRefused(await createLead({ optedOut: true }), "Oi", "lead-com-opt-out");
    });

    it("lead de outra carteira, para escopo de corretor, é recusado (ENVIO-01 AC7)", async () => {
      const leadId = await createLead({ assignedUserId: otherBrokerId });
      const brokerScope: LeadScope = { tenantId: tenantAId, assignedUserId: authorId };
      await expectRefused(leadId, "Oi", "fora-do-escopo", { ...context, scope: brokerScope });
    });

    it("lead de outro tenant é recusado (ENVIO-01 AC7, L-035)", async () => {
      const leadId = await createLead({ tenantId: tenantBId });
      await expectRefused(leadId, "Oi", "fora-do-escopo");
    });

    it("número do canal desconhecido é recusado (ENVIO-01 AC8)", async () => {
      await expectRefused(await createLead({ phoneNumberId: null }), "Oi", "numero-desconhecido");
    });

    it("janela com exatamente 24 h é recusada como fechada (JANELA-01 AC1, AC4)", async () => {
      const leadId = await createLead({ lastLeadMessageAgeMs: 24 * HOUR });
      await expectRefused(leadId, "Oi", "janela-fechada");
    });

    it("sem mensagem do lead, a janela está fechada (JANELA-01 AC1)", async () => {
      await expectRefused(await createLead({ lastLeadMessageAgeMs: null }), "Oi", "janela-fechada");
    });

    it("token ausente: recusa sem chamar a Meta e sem gravar (ENVIO-01 AC13)", async () => {
      vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
      const leadId = await createLead();
      await expectRefused(leadId, "Oi", "envio-nao-configurado");
      const [reservation] = await reservationsOf(leadId);
      expect(reservation.state).toBe("falhou");
    });
  });

  describe("sucesso (ENVIO-01 AC1–AC3)", () => {
    it("envia o texto sem espaços nas pontas e sem prefixo ao MSISDN convertido e grava como humano com autor e wamid", async () => {
      const leadId = await createLead({ externalId: LEGACY_WA_ID });
      const fakeFetch = okFetch("wamid.SUCESSO-T16");
      const typed = "  Oi, aqui é a Ana, corretora. *Negrito* e _itálico_  ";

      const result = await sendHumanMessage(
        context,
        { leadId, text: typed, requestId: randomUUID() },
        NOW,
        { fetch: fakeFetch }
      );

      expect(fakeFetch).toHaveBeenCalledTimes(1);
      const [url] = fakeFetch.mock.calls[0];
      expect(url).toBe(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`);
      const body = sentBody(fakeFetch);
      expect(body.text.body).toBe("Oi, aqui é a Ana, corretora. *Negrito* e _itálico_");
      expect(body.to).toBe(MSISDN);

      const stored = await humanMessagesOf(leadId);
      expect(stored).toHaveLength(1);
      expect(stored[0].sender).toBe("humano");
      expect(stored[0].content).toBe("Oi, aqui é a Ana, corretora. *Negrito* e _itálico_");
      expect(stored[0].authorUserId).toBe(authorId);
      expect(stored[0].authorName).toBe("Ana Corretora");
      expect(stored[0].externalId).toBe("wamid.SUCESSO-T16");
      expect(stored[0].sentAt).toEqual(NOW);
      expect(result).toEqual({ ok: true, message: stored[0] });

      const [reservation] = await reservationsOf(leadId);
      expect(reservation.state).toBe("enviada");
      expect(reservation.messageId).toBe(stored[0].id);
    });

    it("lead em escalado_humano sem marca também envia (ASSUMIR-01 AC7)", async () => {
      const leadId = await createLead({ status: "escalado_humano", takenOver: false });
      const fakeFetch = okFetch();
      const result = await sendHumanMessage(
        context,
        { leadId, text: "Oi", requestId: randomUUID() },
        NOW,
        { fetch: fakeFetch }
      );
      expect(result.ok).toBe(true);
      expect(fakeFetch).toHaveBeenCalledTimes(1);
      expect(await humanMessagesOf(leadId)).toHaveLength(1);
    });
  });

  describe("falha da Meta (ENVIO-01 AC9, JANELA-01 AC6)", () => {
    it("Meta recusa: nada gravado, reserva falhou e motivo devolvido", async () => {
      const leadId = await createLead();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fakeFetch = errorFetch(400, 131056);

      const result = await sendHumanMessage(
        context,
        { leadId, text: "Texto que não chegou", requestId: randomUUID() },
        NOW,
        { fetch: fakeFetch }
      );

      expect(result).toEqual({
        ok: false,
        failure: "falha-meta",
        error: HUMAN_SEND_MESSAGES["falha-meta"],
        metaCode: 131056,
      });
      expect(await humanMessagesOf(leadId)).toHaveLength(0);
      const [reservation] = await reservationsOf(leadId);
      expect(reservation.state).toBe("falhou");
      expect(reservation.failure).toBe("falha-meta");

      const logged = errorSpy.mock.calls.map((call) => String(call[0]));
      const line = logged.find((entry) => entry.includes("envio-humano-falhou"));
      expect(line).toBeDefined();
      expect(JSON.parse(line!)).toMatchObject({
        event: "envio-humano-falhou",
        tenantId: tenantAId,
        leadId,
        failure: "falha-meta",
        metaCode: 131056,
      });
      expect(line).not.toContain("Texto que não chegou");
    });

    it("Meta não responde a tempo: nada gravado, tempo-esgotado", async () => {
      const leadId = await createLead();
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fakeFetch = vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      });

      const result = await sendHumanMessage(
        context,
        { leadId, text: "Oi", requestId: randomUUID() },
        NOW,
        { fetch: fakeFetch }
      );

      expect(result).toEqual({
        ok: false,
        failure: "tempo-esgotado",
        error: HUMAN_SEND_MESSAGES["tempo-esgotado"],
      });
      expect(await humanMessagesOf(leadId)).toHaveLength(0);
    });

    it("131047 devolve o mesmo aviso de janela fechada do CRM (JANELA-01 AC6)", async () => {
      const leadId = await createLead();
      vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await sendHumanMessage(
        context,
        { leadId, text: "Oi", requestId: randomUUID() },
        NOW,
        { fetch: errorFetch(400, 131047) }
      );

      expect(result).toEqual({
        ok: false,
        failure: "janela-fechada",
        error: HUMAN_SEND_MESSAGES["janela-fechada"],
        metaCode: 131047,
      });
      expect(HUMAN_SEND_MESSAGES["janela-fechada"]).toBe(
        "O WhatsApp só permite responder até 24 horas depois da última mensagem do lead."
      );
      expect(await humanMessagesOf(leadId)).toHaveLength(0);
    });
  });

  describe("Meta aceita e o registro falha (ENVIO-01 AC10, L-002)", () => {
    it("falha forçada no registro: log sem conteúdo com tenant, lead e wamid; entregue-sem-registro", async () => {
      const leadId = await createLead();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const fakeFetch = okFetch("wamid.SEM-REGISTRO");
      // Falha forçada no meio da transação: autor sem nome viola o CHECK
      // `messages_humano_author_name_required` no insert da mensagem.
      const brokenContext: HumanSendContext = {
        ...context,
        user: { id: authorId, name: null as unknown as string },
      };

      const result = await sendHumanMessage(
        brokenContext,
        { leadId, text: "Conteúdo sigiloso do corretor", requestId: randomUUID() },
        NOW,
        { fetch: fakeFetch }
      );

      expect(fakeFetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        ok: false,
        failure: "entregue-sem-registro",
        error: HUMAN_SEND_MESSAGES["entregue-sem-registro"],
      });
      const stored = await db.select().from(messages).where(eq(messages.externalId, "wamid.SEM-REGISTRO"));
      expect(stored).toHaveLength(0);
      const [reservation] = await reservationsOf(leadId);
      expect(reservation.state).not.toBe("enviada");

      const line = errorSpy.mock.calls
        .map((call) => String(call[0]))
        .find((entry) => entry.includes("envio-humano-sem-registro"));
      expect(line).toBeDefined();
      expect(JSON.parse(line!)).toMatchObject({
        event: "envio-humano-sem-registro",
        tenantId: tenantAId,
        leadId,
        wamid: "wamid.SEM-REGISTRO",
      });
      expect(line).not.toContain("Conteúdo sigiloso do corretor");
    });
  });

  describe("idempotência (ENVIO-01 AC11)", () => {
    it("mesmo requestId duas vezes: uma chamada à Meta e uma mensagem", async () => {
      const leadId = await createLead();
      const fakeFetch = okFetch();
      const requestId = randomUUID();

      const first = await sendHumanMessage(context, { leadId, text: "Oi", requestId }, NOW, {
        fetch: fakeFetch,
      });
      const second = await sendHumanMessage(context, { leadId, text: "Oi", requestId }, NOW, {
        fetch: fakeFetch,
      });

      expect(fakeFetch).toHaveBeenCalledTimes(1);
      const stored = await humanMessagesOf(leadId);
      expect(stored).toHaveLength(1);
      expect(first).toEqual({ ok: true, message: stored[0] });
      expect(second).toEqual({ ok: true, message: stored[0] });
    });

    it("segunda chamada com a primeira em voo devolve envio-em-andamento sem chamar a Meta", async () => {
      const leadId = await createLead();
      const requestId = randomUUID();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let reachedMeta!: () => void;
      const metaReached = new Promise<void>((resolve) => {
        reachedMeta = resolve;
      });
      const slowFetch = vi.fn(async () => {
        reachedMeta();
        await gate;
        return new Response(JSON.stringify({ messages: [{ id: `wamid.${randomUUID()}` }] }), {
          status: 200,
        });
      });
      const secondFetch = okFetch();

      const first = sendHumanMessage(context, { leadId, text: "Oi", requestId }, NOW, {
        fetch: slowFetch,
      });
      await metaReached;
      const second = await sendHumanMessage(context, { leadId, text: "Oi", requestId }, NOW, {
        fetch: secondFetch,
      });
      release();
      const firstResult = await first;

      expect(second).toEqual({
        ok: false,
        failure: "envio-em-andamento",
        error: HUMAN_SEND_MESSAGES["envio-em-andamento"],
      });
      expect(secondFetch).toHaveBeenCalledTimes(0);
      expect(firstResult.ok).toBe(true);
      expect(await humanMessagesOf(leadId)).toHaveLength(1);
    });
  });

  describe("HUMAN_SEND_MESSAGES (L-029)", () => {
    it("tem texto pt-BR não vazio para cada código do union", () => {
      // A anotação `Record<HumanSendFailure, string>` faz um código novo sem
      // texto quebrar a compilação (`npm run build`); esta lista confere que
      // o union tem exatamente os códigos do design.md (C4).
      const expected: HumanSendFailure[] = [
        "texto-invalido",
        "fora-do-escopo",
        "conversa-com-agente",
        "lead-com-opt-out",
        "janela-fechada",
        "numero-desconhecido",
        "envio-nao-configurado",
        "envio-em-andamento",
        "entregue-sem-registro",
        "destinatario-invalido",
        "credencial-invalida",
        "tempo-esgotado",
        "falha-meta",
      ];
      expect(Object.keys(HUMAN_SEND_MESSAGES).sort()).toEqual([...expected].sort());
      for (const code of expected) expect(HUMAN_SEND_MESSAGES[code].trim()).not.toBe("");
      expect(HUMAN_SEND_MESSAGES["texto-invalido"]).toBe(
        "A mensagem precisa ter entre 1 e 4.096 caracteres."
      );
      expect(HUMAN_SEND_MESSAGES["envio-nao-configurado"]).toBe(
        "O envio pelo WhatsApp não está configurado. Avise o administrador."
      );
      expect(HUMAN_SEND_MESSAGES["credencial-invalida"]).toBe(
        HUMAN_SEND_MESSAGES["envio-nao-configurado"]
      );
      expect(HUMAN_SEND_MESSAGES["entregue-sem-registro"]).toBe(
        "A mensagem foi entregue ao lead, mas não ficou registrada aqui."
      );
    });
  });

  describe("T32 — canal usado e envio independente de Analytics", () => {
    async function channel() {
      const phoneNumberId = BigInt(`0x${randomUUID().replaceAll("-", "").slice(0, 16)}`).toString();
      await db.insert(whatsappChannels).values({ tenantId: tenantAId, phoneNumberId, ownershipVerifiedAt: NOW });
      return phoneNumberId;
    }

    async function usage(phoneNumberId: string, kind: "volume999" | "volume1000" | "unknown" | "stale" | "failure") {
      const observed = kind === "stale" || kind === "failure" ? new Date(NOW.getTime() - HOUR) : NOW;
      return (await db.insert(whatsappUsage).values({
        tenantId: tenantAId, phoneNumberId, configurationRevision: 1, accountTimezone: "UTC",
        monthStart: new Date("2026-10-01T00:00:00Z"), monthEnd: new Date("2026-11-01T00:00:00Z"),
        freeServiceVolume: kind === "unknown" ? null : kind === "volume1000" ? 1000 : 999,
        queryEnd: kind === "unknown" ? null : observed, lastSuccessAt: kind === "unknown" ? null : observed,
        lastAttemptAt: NOW, failureCode: kind === "failure" ? "analytics-unavailable" : null,
      }).returning())[0];
    }

    it.each(["volume999", "volume1000", "unknown", "stale", "failure"] as const)("snapshot%s não bloqueia envio nem altera consumo factual", async (kind) => {
      const phoneNumberId = await channel(), snapshot = await usage(phoneNumberId, kind), leadId = await createLead({ phoneNumberId });
      const fakeFetch = okFetch(), result = await sendHumanMessage(context, { leadId, text: "Envio humano independente", requestId: randomUUID() }, NOW, { fetch: fakeFetch });
      const stored = await humanMessagesOf(leadId);
      expect(result).toEqual({ ok: true, message: stored[0] }); expect(stored[0].whatsappPhoneNumberId).toBe(phoneNumberId);
      expect(fakeFetch).toHaveBeenCalledTimes(1); expect(fakeFetch.mock.calls[0][0]).toBe(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`);
      expect(await db.select().from(whatsappUsage).where(and(eq(whatsappUsage.tenantId, tenantAId), eq(whatsappUsage.phoneNumberId, phoneNumberId)))).toEqual([snapshot]);
      expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, stored[0].externalId!))).toEqual([]);
      expect((await reservationsOf(leadId))[0].state).toBe("enviada");
    });

    it("canal que muda durante o fetch não substitui o número efetivamente usado no registro", async () => {
      const originalChannel = await channel(), nextChannel = await channel(), leadId = await createLead({ phoneNumberId: originalChannel });
      const fakeFetch = vi.fn<typeof fetch>(async (url) => {
        expect(url).toBe(`https://graph.facebook.com/v25.0/${originalChannel}/messages`);
        await db.update(leads).set({ whatsappPhoneNumberId: nextChannel }).where(eq(leads.id, leadId));
        return new Response(JSON.stringify({ messages: [{ id: `fixture-channel-${randomUUID()}` }] }), { status: 200 });
      });
      const result = await sendHumanMessage(context, { leadId, text: "Texto no canal original", requestId: randomUUID() }, NOW, { fetch: fakeFetch });
      if (!result.ok) throw new Error("Envio ausente");
      expect(result.message.whatsappPhoneNumberId).toBe(originalChannel); expect((await humanMessagesOf(leadId))[0]).toEqual(result.message);
      expect((await db.select().from(leads).where(eq(leads.id, leadId)))[0].whatsappPhoneNumberId).toBe(nextChannel);
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    it("status chega antes do registro e vincula exatamente ao canal usado, com autoria humana", async () => {
      const phoneNumberId = await channel(), leadId = await createLead({ phoneNumberId }), wamid = `fixture-status-${randomUUID()}`;
      const fakeFetch = vi.fn<typeof fetch>(async () => {
        await db.insert(whatsappMessageReceipts).values({ tenantId: tenantAId, phoneNumberId, wamid, deliveredAt: NOW, classification: "free_service", pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false });
        return new Response(JSON.stringify({ messages: [{ id: wamid }] }), { status: 200 });
      });
      const result = await sendHumanMessage(context, { leadId, text: "Resposta humana com recibo", requestId: randomUUID() }, NOW, { fetch: fakeFetch });
      if (!result.ok) throw new Error("Envio ausente");
      const [receipt] = await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, wamid));
      expect(receipt).toMatchObject({ tenantId: tenantAId, phoneNumberId, messageId: result.message.id, orphanExpiresAt: null, classification: "free_service" });
      expect(result.message).toMatchObject({ sender: "humano", authorUserId: authorId, authorName: "Ana Corretora", whatsappPhoneNumberId: phoneNumberId, externalId: wamid });
      expect((await reservationsOf(leadId))[0]).toMatchObject({ state: "enviada", messageId: result.message.id });
    });

    it("objeto input mutado durante fetch não muda canal já capturado para envio/registro", async () => {
      const originalChannel = await channel(), nextChannel = await channel(), leadId = await createLead({ phoneNumberId: originalChannel });
      const input = { tenantId: tenantAId, leadId, requestId: randomUUID(), user: context.user, body: "Texto factual", phoneNumberId: originalChannel, to: MSISDN };
      const fakeFetch = vi.fn<typeof fetch>(async (url) => {
        expect(url).toBe(`https://graph.facebook.com/v25.0/${originalChannel}/messages`);
        input.phoneNumberId = nextChannel;
        return new Response(JSON.stringify({ messages: [{ id: `fixture-mutable-${randomUUID()}` }] }), { status: 200 });
      });
      const result = await deliverHumanText(input, NOW, { fetch: fakeFetch });
      if (!result.ok) throw new Error("Envio ausente");
      expect(input.phoneNumberId).toBe(nextChannel); expect(result.message.whatsappPhoneNumberId).toBe(originalChannel);
      expect(fakeFetch).toHaveBeenCalledTimes(1); expect((await humanMessagesOf(leadId))[0]).toEqual(result.message);
    });

    it("replay após trocar cadastro de canal conserva mensagem/recibo e não chama Meta novamente", async () => {
      const originalChannel = await channel(), nextChannel = await channel(), leadId = await createLead({ phoneNumberId: originalChannel });
      const requestId = randomUUID(), fakeFetch = okFetch(), first = await sendHumanMessage(context, { leadId, text: "Original", requestId }, NOW, { fetch: fakeFetch });
      if (!first.ok) throw new Error("Envio ausente");
      const [receipt] = await db.insert(whatsappMessageReceipts).values({ tenantId: tenantAId, phoneNumberId: originalChannel, wamid: first.message.externalId!, messageId: first.message.id, orphanExpiresAt: null, deliveredAt: NOW, classification: "free_service", pricingModel: "PMP", category: "service", pricingType: "free_customer_service", billable: false }).returning();
      const before = await reservationsOf(leadId);
      await db.update(leads).set({ whatsappPhoneNumberId: nextChannel }).where(eq(leads.id, leadId));
      const second = await sendHumanMessage({ ...context, user: { id: otherBrokerId, name: "Outra autora" } }, { leadId, text: "Não substituir original", requestId }, NOW, { fetch: fakeFetch });
      expect(second).toEqual(first); expect(fakeFetch).toHaveBeenCalledTimes(1); expect(await reservationsOf(leadId)).toEqual(before);
      expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, first.message.externalId!))).toEqual([receipt]);
      expect(await humanMessagesOf(leadId)).toEqual([first.message]);
    });

    it("sem cadastro Analytics ou status n8n, grava número usado sem fabricar recibo/gratuidade", async () => {
      const phoneNumberId = "731000000000099", leadId = await createLead({ phoneNumberId }), fakeFetch = okFetch();
      const result = await sendHumanMessage(context, { leadId, text: "Registro independente", requestId: randomUUID() }, NOW, { fetch: fakeFetch });
      if (!result.ok) throw new Error("Envio ausente");
      expect(result.message.whatsappPhoneNumberId).toBe(phoneNumberId); expect(result).toEqual({ ok: true, message: (await humanMessagesOf(leadId))[0] });
      expect(await db.select().from(whatsappChannels).where(and(eq(whatsappChannels.tenantId, tenantAId), eq(whatsappChannels.phoneNumberId, phoneNumberId)))).toEqual([]);
      expect(await db.select().from(whatsappMessageReceipts).where(eq(whatsappMessageReceipts.wamid, result.message.externalId!))).toEqual([]);
      expect(await db.select().from(whatsappUsage).where(and(eq(whatsappUsage.tenantId, tenantAId), eq(whatsappUsage.phoneNumberId, phoneNumberId)))).toEqual([]);
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    it.each(["opt-out", "agent", "window"] as const)("snapshot sem uso livre nunca remove proteção%s do composer", async (kind) => {
      const phoneNumberId = await channel(); await usage(phoneNumberId, "volume1000");
      const leadId = await createLead({ phoneNumberId, optedOut: kind === "opt-out", takenOver: kind !== "agent", lastLeadMessageAgeMs: kind === "window" ? 24 * HOUR : HOUR });
      await expectRefused(leadId, "Resposta protegida", kind === "opt-out" ? "lead-com-opt-out" : kind === "agent" ? "conversa-com-agente" : "janela-fechada");
    });
  });
});
