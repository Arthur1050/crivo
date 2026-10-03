import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { conversations, leads, messages, tenants, users, whatsappChannels, whatsappMessageReceipts, whatsappUsage } from "../../../db/schema";
import type { AuthContext } from "../../auth/session";
import { getConversationUsage, getMessageClassifications, getSettingsUsage } from "../whatsapp";

const tenantA = randomUUID(); const tenantB = randomUUID(); const brokerA = randomUUID(); const brokerB = randomUUID();
const base = new Date("2026-10-02T12:00:00Z"); const options = { now: () => base };
function context(role: "administrador" | "gestor" | "corretor" = "gestor", tenantId = tenantA): AuthContext {
  return { user: { id: brokerA, name: "Fixture", email: "fixture@example.invalid" }, tenantId, roles: [role],
    leadScope: { tenantId, assignedUserId: role === "corretor" ? brokerA : null } };
}
async function channel(patch: Partial<typeof whatsappChannels.$inferInsert> = {}) {
  const [row] = await db.insert(whatsappChannels).values({ tenantId: tenantA, phoneNumberId: `fixture-${randomUUID()}`,
    analyticsPhoneNumber: `55${Date.now()}${Math.floor(Math.random() * 100000)}`, wabaId: "1000000000000000", accountTimezone: "UTC",
    accountKind: "production", ownershipVerifiedAt: base, analyticsVerifiedAt: base, usageEnabled: true, ...patch }).returning(); return row;
}
type Channel = Awaited<ReturnType<typeof channel>>;
async function snapshot(row: Channel, patch: Partial<typeof whatsappUsage.$inferInsert> = {}) {
  const [period] = await db.insert(whatsappUsage).values({ tenantId: row.tenantId, phoneNumberId: row.phoneNumberId,
    configurationRevision: row.configurationRevision, accountTimezone: "UTC", monthStart: new Date("2026-10-01T00:00:00Z"),
    monthEnd: new Date("2026-11-01T00:00:00Z"), freeServiceVolume: 999, queryEnd: new Date("2026-10-02T11:45:00Z"),
    lastSuccessAt: new Date("2026-10-02T11:45:07Z"), ...patch }).returning(); return period;
}
async function conversation(phone: string | null, assignedUserId: string | null = brokerA, tenantId = tenantA) {
  const [lead] = await db.insert(leads).values({ tenantId, name: "Fixture", phone: "+55 11999990000", firstContactAt: base,
    whatsappPhoneNumberId: phone, assignedUserId, status: "em_qualificacao" }).returning();
  const [row] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning(); return row;
}
async function message(conversationId: string, phone: string | null, sender: "agente" | "humano" | "lead" = "agente", tenantId = tenantA) {
  const [row] = await db.insert(messages).values({ tenantId, conversationId, sender, content: "Fixture", sentAt: base,
    whatsappPhoneNumberId: phone, externalId: phone ? `wamid.${randomUUID()}` : null,
    authorName: sender === "humano" ? "Fixture humano" : null, authorUserId: sender === "humano" ? brokerA : null }).returning(); return row;
}
async function receipt(row: Awaited<ReturnType<typeof message>>, classification: typeof whatsappMessageReceipts.$inferInsert["classification"]) {
  await db.insert(whatsappMessageReceipts).values({ tenantId: row.tenantId, phoneNumberId: row.whatsappPhoneNumberId!, wamid: row.externalId!,
    messageId: row.id, classification, orphanExpiresAt: null });
}
function expected(row: Channel) {
  return { state: "available", phoneLabel: row.analyticsPhoneNumber, monthLabel: "outubro de 2026", used: 999, remaining: 1,
    queriedAt: "2026-10-02T11:45:00.000Z", stale: false, updateFailed: false, estimated: true };
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantA, tenantB].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture leitura", agentName: "Agente", supportedModality: "ambos" as const })));
  await db.insert(users).values([brokerA, brokerB].map((id) => ({ id, name: "Fixture", email: `${id}@fixture.test` })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
afterAll(async () => {
  await db.delete(whatsappMessageReceipts).where(inArray(whatsappMessageReceipts.tenantId, [tenantA, tenantB]));
  await db.delete(messages).where(inArray(messages.tenantId, [tenantA, tenantB]));
  await db.delete(conversations).where(inArray(conversations.tenantId, [tenantA, tenantB]));
  await db.delete(leads).where(inArray(leads.tenantId, [tenantA, tenantB]));
  await db.delete(whatsappUsage).where(inArray(whatsappUsage.tenantId, [tenantA, tenantB]));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, [tenantA, tenantB]));
  await db.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
  await db.delete(users).where(inArray(users.id, [brokerA, brokerB])); await db.$client.end();
});

describe("T14 — leituras autorizadas de snapshots e recibos", () => {
  it("administrador e gestor recebem DTO completo do mês, com queryEnd e estimativa", async () => {
    const row = await channel(); await snapshot(row);
    expect(await getSettingsUsage(context("administrador"), options)).toContainEqual(expected(row));
    expect(await getSettingsUsage(context("gestor"), options)).toContainEqual(expected(row));
  });
  it("corretor lê agregado da própria conversa e não lê Configurações", async () => {
    const row = await channel(); await snapshot(row); const conv = await conversation(row.phoneNumberId);
    expect(await getConversationUsage(context("corretor"), conv.id, options)).toEqual(expected(row));
    expect(await getSettingsUsage(context("corretor"), options)).toEqual([]);
  });
  it("carteira alheia e lead sem responsável não expõem consumo nem classificações", async () => {
    const row = await channel(); await snapshot(row);
    for (const assignee of [brokerB, null]) {
      const conv = await conversation(row.phoneNumberId, assignee); await message(conv.id, row.phoneNumberId);
      expect(await getConversationUsage(context("corretor"), conv.id, options)).toBeNull();
      expect(await getMessageClassifications(context("corretor"), conv.id)).toEqual([]);
    }
  });
  it("tenant trocado recusa conversa/classificação e Settings usa apenas tenant atual", async () => {
    const row = await channel(); await snapshot(row); const conv = await conversation(row.phoneNumberId); await message(conv.id, row.phoneNumberId);
    expect(await getConversationUsage(context("gestor", tenantB), conv.id, options)).toBeNull();
    expect(await getMessageClassifications(context("gestor", tenantB), conv.id)).toEqual([]);
    expect(await getSettingsUsage(context("gestor", tenantB), options)).toEqual([]);
    const mismatched = { ...context(), leadScope: { tenantId: tenantB, assignedUserId: null } };
    expect(await getConversationUsage(mismatched, conv.id, options)).toBeNull();
  });
  it("dois números não compartilham saldo; trocar canal persistido muda o DTO", async () => {
    const first = await channel(); const second = await channel(); await snapshot(first); await snapshot(second, { freeServiceVolume: 1001 });
    const conv = await conversation(first.phoneNumberId);
    expect(await getConversationUsage(context(), conv.id, options)).toEqual(expected(first));
    await db.update(leads).set({ whatsappPhoneNumberId: second.phoneNumberId }).where(eq(leads.id, conv.leadId));
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ ...expected(second), used: 1001, remaining: 0 });
    const settings = await getSettingsUsage(context(), options);
    expect(settings).toContainEqual(expected(first)); expect(settings).toContainEqual({ ...expected(second), used: 1001, remaining: 0 });
  });
  it("canal desconhecido não infere de telefone pessoal ou mensagem histórica", async () => {
    const row = await channel(); await snapshot(row); const conv = await conversation(null); await message(conv.id, row.phoneNumberId);
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ state: "unknown-number", label: "Número da conversa não identificado" });
  });
  it("mês novo não carrega volume do mês anterior", async () => {
    const row = await channel(); await snapshot(row); const conv = await conversation(row.phoneNumberId);
    expect(await getConversationUsage(context(), conv.id, { now: () => new Date("2026-11-01T00:00:00Z") }))
      .toEqual({ state: "unavailable", label: "Consumo indisponível" });
  });
  it("exatamente 60min não é stale; 60min+1ms é stale sem alterar valor", async () => {
    const row = await channel(); await snapshot(row, { queryEnd: new Date("2026-10-02T10:59:53Z"), lastSuccessAt: new Date("2026-10-02T11:00:00Z") }); const conv = await conversation(row.phoneNumberId);
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ ...expected(row), queriedAt: "2026-10-02T10:59:53.000Z" });
    expect(await getConversationUsage(context(), conv.id, { now: () => new Date("2026-10-02T12:00:00.001Z") }))
      .toEqual({ ...expected(row), queriedAt: "2026-10-02T10:59:53.000Z", stale: true });
  });
  it("falha recente/token ausente mantém valor, queryEnd e indicação de falha", async () => {
    const row = await channel(); await snapshot(row, { failureCode: "permission-denied", lastAttemptAt: new Date("2026-10-02T11:59:00Z") });
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", ""); const conv = await conversation(row.phoneNumberId);
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ ...expected(row), updateFailed: true });
  });
  it("sem snapshot e tentativa sem sucesso não fabricam zero", async () => {
    const row = await channel(); const conv = await conversation(row.phoneNumberId);
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ state: "unavailable", label: "Consumo indisponível" });
    await snapshot(row, { freeServiceVolume: null, queryEnd: null, lastSuccessAt: null, failureCode: "timeout" });
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ state: "unavailable", label: "Consumo indisponível" });
  });
  it("zero explícito preserva franquia1000; DTO não contém WABA/token/payload/lease", async () => {
    const row = await channel(); await snapshot(row, { freeServiceVolume: 0 }); const conv = await conversation(row.phoneNumberId);
    const result = await getConversationUsage(context(), conv.id, options);
    expect(result).toEqual({ ...expected(row), used: 0, remaining: 1000 });
    expect(Object.keys(result!).sort()).toEqual(["estimated", "monthLabel", "phoneLabel", "queriedAt", "remaining", "stale", "state", "updateFailed", "used"].sort());
    expect(JSON.stringify(result)).not.toContain(row.wabaId!);
  });
  it("revisão diferente e propriedade não comprovada recusam snapshot antigo", async () => {
    const row = await channel(); await snapshot(row); const conv = await conversation(row.phoneNumberId);
    await db.update(whatsappChannels).set({ configurationRevision: 2 }).where(eq(whatsappChannels.id, row.id));
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ state: "unavailable", label: "Consumo indisponível" });
    await db.update(whatsappChannels).set({ configurationRevision: 1, usageEnabled: false, ownershipVerifiedAt: null }).where(eq(whatsappChannels.id, row.id));
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ state: "unavailable", label: "Consumo indisponível" });
  });
  it("mesmo início Amman/Atenas não permite mostrar fuso/fim incompatíveis", async () => {
    const row = await channel({ accountTimezone: "Europe/Athens" }); await snapshot(row, { accountTimezone: "Asia/Amman",
      monthStart: new Date("2026-09-30T21:00:00Z"), monthEnd: new Date("2026-10-31T21:00:00Z") });
    const conv = await conversation(row.phoneNumberId);
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ state: "unavailable", label: "Consumo indisponível" });
  });
  it("canal de outro tenant não oferece snapshot mesmo em conversa autorizada", async () => {
    const row = await channel({ tenantId: tenantB }); await snapshot(row); const conv = await conversation(row.phoneNumberId);
    expect(await getConversationUsage(context(), conv.id, options)).toEqual({ state: "unavailable", label: "Consumo indisponível" });
    expect(await getSettingsUsage(context("gestor", tenantB), options)).toContainEqual(expected(row));
  });
  it("seis classificações têm rótulos da spec; inbound não recebe custo", async () => {
    const row = await channel(); const conv = await conversation(row.phoneNumberId);
    const classifications = ["paid_service", "free_service", "free_entry_point", "pending", "unavailable", "not_delivered"] as const;
    const states = ["paid-service", "free-service", "free-entry-point", "pending", "unavailable", "not-delivered"];
    const labels = ["Tarifável — confirmado pela Meta", "Gratuita — franquia de serviço", "Gratuita — janela de entrada gratuita",
      "Cobrança pendente de confirmação", "Classificação indisponível", "Não entregue"];
    const expectedRows = [];
    for (let index = 0; index < classifications.length; index++) {
      const msg = await message(conv.id, row.phoneNumberId, index % 2 ? "humano" : "agente"); await receipt(msg, classifications[index]);
      expectedRows.push({ messageId: msg.id, state: states[index], label: labels[index] });
    }
    await message(conv.id, row.phoneNumberId, "lead");
    expect(await getMessageClassifications(context("corretor"), conv.id)).toEqual(expectedRows.sort((a, b) => a.messageId.localeCompare(b.messageId)));
  });
  it("sem recibo é pending; legado é unavailable; órfão não é correlacionado só pelo wamid", async () => {
    const row = await channel(); const conv = await conversation(row.phoneNumberId);
    const known = await message(conv.id, row.phoneNumberId); const legacy = await message(conv.id, null);
    await db.insert(whatsappMessageReceipts).values({ tenantId: tenantA, phoneNumberId: row.phoneNumberId, wamid: known.externalId!, classification: "free_service" });
    expect(await getMessageClassifications(context(), conv.id)).toEqual([
      { messageId: known.id, state: "pending", label: "Cobrança pendente de confirmação" },
      { messageId: legacy.id, state: "unavailable", label: "Classificação indisponível" },
    ].sort((a, b) => a.messageId.localeCompare(b.messageId)));
  });
  it("classificação histórica conserva fato mesmo com Analytics/propriedade desativados", async () => {
    const row = await channel(); const conv = await conversation(row.phoneNumberId); const msg = await message(conv.id, row.phoneNumberId); await receipt(msg, "paid_service");
    await db.update(whatsappChannels).set({ usageEnabled: false, ownershipVerifiedAt: null, analyticsVerifiedAt: null }).where(eq(whatsappChannels.id, row.id));
    expect(await getMessageClassifications(context(), conv.id)).toEqual([{ messageId: msg.id, state: "paid-service", label: "Tarifável — confirmado pela Meta" }]);
  });
  it("leitura usa uma query de Settings/duas de conversa/uma do thread, sem Graph ou N+1", async () => {
    const row = await channel(); await snapshot(row); const conv = await conversation(row.phoneNumberId);
    await db.insert(messages).values(Array.from({ length: 50 }, () => ({ tenantId: tenantA, conversationId: conv.id, sender: "agente" as const,
      content: "Fixture", sentAt: base, whatsappPhoneNumberId: row.phoneNumberId, externalId: `wamid.${randomUUID()}` })));
    const fetchSpy = vi.spyOn(globalThis, "fetch"); const querySpy = vi.spyOn(db.$client, "query");
    expect(await getSettingsUsage(context(), options)).toContainEqual(expected(row)); expect(querySpy).toHaveBeenCalledTimes(1); querySpy.mockClear();
    expect(await getConversationUsage(context(), conv.id, options)).toEqual(expected(row)); expect(querySpy).toHaveBeenCalledTimes(2); querySpy.mockClear();
    const classifications = await getMessageClassifications(context(), conv.id);
    expect(classifications).toHaveLength(50); expect(classifications.every((item) => item.state === "pending")).toBe(true);
    expect(querySpy).toHaveBeenCalledTimes(1); expect(fetchSpy).not.toHaveBeenCalled();
    expect(classifications.every((item) => Object.keys(item).sort().join(",") === "label,messageId,state")).toBe(true);
  });
});
