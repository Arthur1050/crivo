import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../../../db";
import { conversations, leads, messages, tenants } from "../../../db/schema";
import {
  getDashboardKpis,
  getLead,
  ingestAgentMessage,
  type DashboardRange,
} from "../index";

// Tenant + lead PRÓPRIOS deste arquivo (nunca o snapshot do seed) — mesmo
// padrão de isolamento dos demais testes de integração da DAL (lote-5/6).
// Cobre KPI-01 (lote-7): first_response_at gravado na ingestão da primeira
// mensagem do agente.
async function createTenant(): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name: "Tenant Fixture First Response",
    agentName: "Agente Teste",
    supportedModality: "ambos",
  });
  return id;
}

async function createLead(tenantId: string, firstContactAt: Date): Promise<string> {
  const id = randomUUID();
  await db.insert(leads).values({
    id,
    tenantId,
    name: "Lead Fixture",
    phone: "+55 34 90000-5555",
    status: "em_qualificacao",
    firstContactAt,
  });
  return id;
}

describe("server/data — first_response_at em ingestAgentMessage (lote-7, KPI-01)", () => {
  const createdTenantIds: string[] = [];

  afterEach(async () => {
    if (createdTenantIds.length === 0) return;
    // Ordem de delete respeita as FKs: ingestAgentMessage cria conversa e
    // mensagem por trás, então ambas saem antes do lead (filhos antes dos
    // pais — mesmo padrão de runSeed()).
    await db.delete(messages).where(inArray(messages.tenantId, createdTenantIds));
    await db.delete(conversations).where(inArray(conversations.tenantId, createdTenantIds));
    await db.delete(leads).where(inArray(leads.tenantId, createdTenantIds));
    await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    createdTenantIds.length = 0;
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("primeira mensagem do agente grava first_response_at igual ao sentAt dela (igualdade exata)", async () => {
    const tenantId = await createTenant();
    createdTenantIds.push(tenantId);
    const leadId = await createLead(tenantId, new Date("2026-08-01T10:00:00.000Z"));

    const sentAt = new Date("2026-08-01T10:05:00.000Z");
    const result = await ingestAgentMessage(tenantId, leadId, {
      externalId: `ext-${randomUUID()}`,
      sender: "agente",
      content: "Olá! Posso ajudar?",
      sentAt,
    });
    expect(result).not.toBeNull();
    expect(result!.created).toBe(true);

    const lead = await getLead(tenantId, leadId);
    expect(lead!.firstResponseAt).toEqual(sentAt);
  });

  it("segunda mensagem do agente preserva o valor da primeira", async () => {
    const tenantId = await createTenant();
    createdTenantIds.push(tenantId);
    const leadId = await createLead(tenantId, new Date("2026-08-01T10:00:00.000Z"));

    const firstSentAt = new Date("2026-08-01T10:05:00.000Z");
    await ingestAgentMessage(tenantId, leadId, {
      externalId: `ext-${randomUUID()}`,
      sender: "agente",
      content: "Primeira resposta",
      sentAt: firstSentAt,
    });

    const secondSentAt = new Date("2026-08-01T10:20:00.000Z");
    await ingestAgentMessage(tenantId, leadId, {
      externalId: `ext-${randomUUID()}`,
      sender: "agente",
      content: "Segunda resposta",
      sentAt: secondSentAt,
    });

    const lead = await getLead(tenantId, leadId);
    expect(lead!.firstResponseAt).toEqual(firstSentAt);
  });

  it("mensagem do lead deixa first_response_at nulo", async () => {
    const tenantId = await createTenant();
    createdTenantIds.push(tenantId);
    const leadId = await createLead(tenantId, new Date("2026-08-01T10:00:00.000Z"));

    await ingestAgentMessage(tenantId, leadId, {
      externalId: `ext-${randomUUID()}`,
      sender: "lead",
      content: "Oi, tudo bem?",
      sentAt: new Date("2026-08-01T10:01:00.000Z"),
    });

    const lead = await getLead(tenantId, leadId);
    expect(lead!.firstResponseAt).toBeNull();
  });

  it("reentrega descartada por idempotência não altera first_response_at, mesmo com sentAt diferente", async () => {
    const tenantId = await createTenant();
    createdTenantIds.push(tenantId);
    const leadId = await createLead(tenantId, new Date("2026-08-01T10:00:00.000Z"));

    const externalId = `ext-${randomUUID()}`;
    const originalSentAt = new Date("2026-08-01T10:05:00.000Z");
    const first = await ingestAgentMessage(tenantId, leadId, {
      externalId,
      sender: "agente",
      content: "Resposta original",
      sentAt: originalSentAt,
    });
    expect(first!.created).toBe(true);

    const redeliverySentAt = new Date("2026-08-01T11:00:00.000Z");
    const second = await ingestAgentMessage(tenantId, leadId, {
      externalId,
      sender: "agente",
      content: "Resposta original",
      sentAt: redeliverySentAt,
    });
    expect(second!.created).toBe(false);

    const lead = await getLead(tenantId, leadId);
    expect(lead!.firstResponseAt).toEqual(originalSentAt);
  });

  it("KPI: lead com contato e primeira resposta faz getDashboardKpis devolver avgFirstResponseMinutes não-nulo com o valor esperado", async () => {
    const tenantId = await createTenant();
    createdTenantIds.push(tenantId);
    const firstContactAt = new Date("2026-08-01T10:00:00.000Z");
    const leadId = await createLead(tenantId, firstContactAt);

    const sentAt = new Date("2026-08-01T10:12:00.000Z"); // 12 minutos depois
    await ingestAgentMessage(tenantId, leadId, {
      externalId: `ext-${randomUUID()}`,
      sender: "agente",
      content: "Resposta",
      sentAt,
    });

    const range: DashboardRange = {
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-01T23:59:59.999Z"),
    };
    const kpis = await getDashboardKpis(tenantId, range);
    expect(kpis.avgFirstResponseMinutes).toBe(12);
    expect(kpis.respondedCount).toBe(1);
  });
});
