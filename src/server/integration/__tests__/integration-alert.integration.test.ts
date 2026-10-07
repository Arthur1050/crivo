import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { conversations, leads, messages, tenants } from "../../../db/schema";

// Passa-direto com espião: o teste de corrida precisa interpor outra
// reivindicação entre o plano e o compare-and-set desta execução.
vi.mock("../../data/integration-health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../data/integration-health")>();
  return {
    ...actual,
    getTenantHealthSnapshots: vi.fn(actual.getTenantHealthSnapshots),
    claimIntegrationProblems: vi.fn(actual.claimIntegrationProblems),
  };
});

import * as healthData from "../../data/integration-health";
import { runIntegrationAlert } from "../integration-alert";
import type { EmailResult } from "../../auth/email";

const mockedSnapshots = vi.mocked(healthData.getTenantHealthSnapshots);
const mockedClaim = vi.mocked(healthData.claimIntegrationProblems);

// Data longe de qualquer fixture de outro arquivo: a janela de 24h das
// recusas sem tenant não alcança recusas de teste de outras suítes.
const NOW = new Date("2033-05-05T03:00:00.000Z");
const HOUR_MS = 3600000;
const OPERATOR = "operador@fixture.test";
const createdTenants: string[] = [];

type Sent = { to: string; subject: string; text: string };
const sent: Sent[] = [];
const sendOk = vi.fn(async (message: Sent): Promise<EmailResult> => {
  sent.push(message);
  return { ok: true, id: "email_fake" };
});

beforeEach(() => {
  sent.length = 0;
  sendOk.mockClear();
  mockedSnapshots.mockClear();
  mockedClaim.mockClear();
});

async function newTenant(label: string, overrides: Partial<typeof tenants.$inferInsert> = {}) {
  const id = randomUUID();
  createdTenants.push(id);
  await db.insert(tenants).values({
    id,
    slug: `fixture-alerta-${label}-${id.slice(0, 8)}`,
    name: `Fixture alerta ${label} ${id.slice(0, 8)}`,
    agentName: "Agente",
    supportedModality: "ambos",
    ...overrides,
  });
  const [row] = await db.select().from(tenants).where(eq(tenants.id, id));
  return row;
}

async function addAgentMessage(tenantId: string, sentAt: Date) {
  const [lead] = await db
    .insert(leads)
    .values({ tenantId, name: "Lead alerta", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: new Date() })
    .returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  await db.insert(messages).values({ tenantId, conversationId: conversation.id, sender: "agente", content: "fixture", sentAt });
}

async function stateOf(tenantId: string) {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return row;
}

/** Tenant gravado saudavel, mas sem mensagem do agente há 25h: cai na próxima avaliação. */
async function fallingTenant(label: string) {
  const tenant = await newTenant(label, {
    integrationHealthState: "saudavel",
    integrationHealthChangedAt: new Date("2033-04-01T03:00:00.000Z"),
  });
  await addAgentMessage(tenant.id, new Date(NOW.getTime() - 25 * HOUR_MS));
  return tenant;
}

const mentioning = (tenant: { slug: string }) => sent.filter((message) => message.text.includes(tenant.slug));

afterAll(async () => {
  if (createdTenants.length > 0) {
    await db.delete(messages).where(inArray(messages.tenantId, createdTenants));
    await db.delete(conversations).where(inArray(conversations.tenantId, createdTenants));
    await db.delete(leads).where(inArray(leads.tenantId, createdTenants));
    await db.delete(tenants).where(inArray(tenants.id, createdTenants));
  }
  await db.$client.end();
});

describe("runIntegrationAlert — transição e e-mail (ALERTA-01, ALERTA-02)", () => {
  it("queda envia um e-mail ao operador e grava problema; a segunda execução não envia (AC2, AC6)", async () => {
    const tenant = await fallingTenant("queda");

    const first = await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: sendOk });
    const emails = mentioning(tenant);
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(OPERATOR);
    expect(emails[0].subject).toMatch(/^\[crivo\] Integração com problema em \d+ imobiliária\(s\)$/);
    expect(emails[0].text).toContain(tenant.name);
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const afterFirst = await stateOf(tenant.id);
    expect(afterFirst.integrationHealthState).toBe("problema");
    expect(afterFirst.integrationHealthChangedAt?.toISOString()).toBe(NOW.toISOString());

    sent.length = 0;
    await runIntegrationAlert(new Date(NOW.getTime() + 24 * HOUR_MS), { operatorEmail: OPERATOR, send: sendOk });
    expect(mentioning(tenant)).toHaveLength(0);
    const afterSecond = await stateOf(tenant.id);
    expect(afterSecond.integrationHealthState).toBe("problema");
    expect(afterSecond.integrationHealthChangedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("dois tenants em queda saem num único e-mail que lista os dois (ALERTA-02 AC1)", async () => {
    const one = await fallingTenant("par-a");
    const two = await fallingTenant("par-b");

    await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: sendOk });

    expect(sendOk).toHaveBeenCalledTimes(1);
    expect(sent[0].text).toContain(one.name);
    expect(sent[0].text).toContain(two.name);
    const listed = Number(/em (\d+) imobiliária/.exec(sent[0].subject)?.[1]);
    expect(listed).toBeGreaterThanOrEqual(2);
  });

  it("tenant novo só grava o estado avaliado e não envia (AC3)", async () => {
    const broken = await newTenant("novo-problema");
    const healthy = await newTenant("novo-saudavel");
    await addAgentMessage(healthy.id, new Date(NOW.getTime() - HOUR_MS));

    await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: sendOk });

    expect(mentioning(broken)).toHaveLength(0);
    const brokenRow = await stateOf(broken.id);
    expect(brokenRow.integrationHealthState).toBe("problema");
    expect(brokenRow.integrationHealthChangedAt?.toISOString()).toBe(NOW.toISOString());
    const healthyRow = await stateOf(healthy.id);
    expect(healthyRow.integrationHealthState).toBe("saudavel");
    expect(healthyRow.integrationHealthChangedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("recuperação grava saudavel e não envia (AC4)", async () => {
    const tenant = await newTenant("recupera", {
      integrationHealthState: "problema",
      integrationHealthChangedAt: new Date("2033-04-20T03:00:00.000Z"),
    });
    await addAgentMessage(tenant.id, new Date(NOW.getTime() - HOUR_MS));

    await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: sendOk });

    expect(mentioning(tenant)).toHaveLength(0);
    const row = await stateOf(tenant.id);
    expect(row.integrationHealthState).toBe("saudavel");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("estado avaliado igual ao gravado mantém estado e instante (AC5)", async () => {
    const changedAt = new Date("2033-04-10T03:00:00.000Z");
    const tenant = await newTenant("igual", { integrationHealthState: "problema", integrationHealthChangedAt: changedAt });

    await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: sendOk });

    expect(mentioning(tenant)).toHaveLength(0);
    const row = await stateOf(tenant.id);
    expect(row.integrationHealthState).toBe("problema");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe(changedAt.toISOString());
  });

  it("corrida: tenant reivindicado por outra execução entre o plano e o CAS não gera e-mail (AC7)", async () => {
    const tenant = await fallingTenant("corrida");
    const actual = await vi.importActual<typeof import("../../data/integration-health")>("../../data/integration-health");
    mockedClaim.mockImplementationOnce(async (ids, at) => {
      await actual.claimIntegrationProblems(ids, at); // a outra execução chega primeiro
      return actual.claimIntegrationProblems(ids, at);
    });

    const result = await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: sendOk });

    expect(mentioning(tenant)).toHaveLength(0);
    expect(result.sent).toBe(0);
    expect((await stateOf(tenant.id)).integrationHealthState).toBe("problema");
  });

  it("evaluated conta os tenants avaliados e sent os do e-mail enviado com ok (ALERTA-03 AC4)", async () => {
    const before = (await db.select({ id: tenants.id }).from(tenants)).length;
    await fallingTenant("contagem-a");
    await fallingTenant("contagem-b");

    const result = await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: sendOk });

    const after = (await db.select({ id: tenants.id }).from(tenants)).length;
    expect(result.evaluated).toBeGreaterThanOrEqual(before + 2);
    expect(result.evaluated).toBeLessThanOrEqual(after);
    const listed = Number(/em (\d+) imobiliária/.exec(sent[0].subject)?.[1]);
    expect(result.sent).toBe(listed);
  });

  it("sem tenants avaliados: evaluated 0 e nenhum e-mail", async () => {
    mockedSnapshots.mockResolvedValueOnce([]);

    const result = await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: sendOk });

    expect(result).toEqual({ evaluated: 0, sent: 0, skipped: null, sendFailed: false });
    expect(sendOk).not.toHaveBeenCalled();
  });
});

describe("runIntegrationAlert — falhas (ALERTA-03)", () => {
  it.each([[undefined], [""], ["   "]])("destinatário %j: não envia, o tenant segue saudavel e skipped é reportado (AC1, L-030)", async (operatorEmail) => {
    const tenant = await fallingTenant("sem-destino");

    const result = await runIntegrationAlert(NOW, { operatorEmail, send: sendOk });

    expect(sendOk).not.toHaveBeenCalled();
    expect(result.skipped).toBe("destinatario-ausente");
    expect(result.sent).toBe(0);
    const row = await stateOf(tenant.id);
    expect(row.integrationHealthState).toBe("saudavel");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe("2033-04-01T03:00:00.000Z");
  });

  it("depois que o destinatário existe, a queda retida sai no mesmo dia seguinte", async () => {
    const tenant = await fallingTenant("destino-tardio");
    await runIntegrationAlert(NOW, { operatorEmail: undefined, send: sendOk });
    expect(mentioning(tenant)).toHaveLength(0);

    await runIntegrationAlert(new Date(NOW.getTime() + 24 * HOUR_MS), { operatorEmail: OPERATOR, send: sendOk });

    expect(mentioning(tenant)).toHaveLength(1);
    expect((await stateOf(tenant.id)).integrationHealthState).toBe("problema");
  });

  it("envio com ok:false devolve saudavel e o instante anterior, reporta sendFailed e a execução seguinte reenvia (AC2)", async () => {
    const tenant = await fallingTenant("envio-falho");
    const failing = vi.fn(async (): Promise<EmailResult> => ({ ok: false, error: "Domínio não verificado" }));

    const failed = await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: failing });

    expect(failed.sendFailed).toBe(true);
    expect(failed.sent).toBe(0);
    const row = await stateOf(tenant.id);
    expect(row.integrationHealthState).toBe("saudavel");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe("2033-04-01T03:00:00.000Z");

    const retry = await runIntegrationAlert(new Date(NOW.getTime() + 24 * HOUR_MS), { operatorEmail: OPERATOR, send: sendOk });
    expect(mentioning(tenant)).toHaveLength(1);
    expect(retry.sendFailed).toBe(false);
    expect((await stateOf(tenant.id)).integrationHealthState).toBe("problema");
  });

  it("adaptador que lança é tratado como envio falho: a queda não fica presa em problema", async () => {
    const tenant = await fallingTenant("envio-lanca");
    const throwing = vi.fn(async (): Promise<EmailResult> => { throw new Error("rede fora"); });

    const result = await runIntegrationAlert(NOW, { operatorEmail: OPERATOR, send: throwing });

    expect(result.sendFailed).toBe(true);
    expect((await stateOf(tenant.id)).integrationHealthState).toBe("saudavel");
  });
});
