import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { conversations, integrationRefusals, leads, messages, tenants } from "../../../db/schema";
import type { DocumentStorage } from "../../documents/storage";

// Passa-direto com espião: o grupo do alerta só prova independência se puder
// falhar isoladamente (L-002), e a rota só prova a ligação se o envio real for
// substituído por um espião (L-026).
vi.mock("../integration-alert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../integration-alert")>();
  return { ...actual, runIntegrationAlert: vi.fn(actual.runIntegrationAlert) };
});
vi.mock("../../auth/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../auth/email")>();
  return { ...actual, sendIntegrationAlertEmail: vi.fn(async () => ({ ok: true as const, id: "email_fake" })) };
});
vi.mock("../../data/integration-health", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../data/integration-health")>();
  return { ...actual, getTenantHealthSnapshots: vi.fn(actual.getTenantHealthSnapshots) };
});

import { sendIntegrationAlertEmail } from "../../auth/email";
import { getTenantHealthSnapshots } from "../../data/integration-health";
import { runIntegrationAlert } from "../integration-alert";
import { runDailyMaintenance } from "../lgpd";
import { createExpireDocumentsHandler } from "../../../../app/api/cron/expire-documents/route";

const mockedRunAlert = vi.mocked(runIntegrationAlert);
const mockedSend = vi.mocked(sendIntegrationAlertEmail);
const mockedSnapshots = vi.mocked(getTenantHealthSnapshots);

const NOW = new Date("2034-06-06T03:00:00.000Z");
const HOUR_MS = 3600000;
const ROUTE_PREFIX = `/api/v1/__test-maintenance-alert__/${randomUUID()}`;
const createdTenants: string[] = [];

const storage: DocumentStorage = {
  authorizeClientUpload: async () => { throw new Error("upload não faz parte do cron"); },
  delete: async () => undefined,
  head: async () => null,
  open: async () => null,
};

async function newTenant(overrides: Partial<typeof tenants.$inferInsert> = {}) {
  const id = randomUUID();
  createdTenants.push(id);
  await db.insert(tenants).values({
    id,
    slug: `fixture-manut-alerta-${id.slice(0, 8)}`,
    name: `Fixture manutenção alerta ${id.slice(0, 8)}`,
    agentName: "Agente",
    supportedModality: "ambos",
    ...overrides,
  });
  const [row] = await db.select().from(tenants).where(eq(tenants.id, id));
  return row;
}

async function newFallingTenant() {
  const tenant = await newTenant({
    integrationHealthState: "saudavel",
    integrationHealthChangedAt: new Date("2034-05-01T03:00:00.000Z"),
  });
  const [lead] = await db
    .insert(leads)
    .values({ tenantId: tenant.id, name: "Lead manutenção", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: new Date() })
    .returning();
  const [conversation] = await db.insert(conversations).values({ tenantId: tenant.id, leadId: lead.id }).returning();
  await db.insert(messages).values({
    tenantId: tenant.id, conversationId: conversation.id, sender: "agente", content: "fixture",
    sentAt: new Date(NOW.getTime() - 25 * HOUR_MS),
  });
  return tenant;
}

async function addStaleRefusal() {
  await db.insert(integrationRefusals).values({
    tenantId: null, route: `${ROUTE_PREFIX}/velha`, method: "POST", status: 401, code: "invalid_token",
    occurredAt: new Date(NOW.getTime() - 31 * 24 * HOUR_MS),
  });
}

const ALERT_FIELDS = [
  "integrationAlertEvaluated",
  "integrationAlertSent",
  "integrationAlertSkipped",
  "integrationAlertSendFailed",
  "integrationAlertFailed",
] as const;

function withoutAlert(result: Awaited<ReturnType<typeof runDailyMaintenance>>) {
  const rest: Record<string, unknown> = { ...result };
  for (const field of ALERT_FIELDS) delete rest[field];
  return rest;
}

beforeEach(() => {
  mockedRunAlert.mockClear();
  mockedSend.mockClear();
  mockedSnapshots.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await db.delete(integrationRefusals).where(like(integrationRefusals.route, `${ROUTE_PREFIX}%`));
  if (createdTenants.length > 0) {
    await db.delete(messages).where(inArray(messages.tenantId, createdTenants));
    await db.delete(conversations).where(inArray(conversations.tenantId, createdTenants));
    await db.delete(leads).where(inArray(leads.tenantId, createdTenants));
    await db.delete(tenants).where(inArray(tenants.id, createdTenants));
  }
  await db.$client.end();
});

describe("runDailyMaintenance — grupo do alerta (ALERTA-03)", () => {
  const okDependency = { operatorEmail: "operador@fixture.test", send: async () => ({ ok: true as const, id: null }) };

  it("alerta que lança: integrationAlertFailed e os demais campos iguais aos de uma execução com o alerta ok (AC3)", async () => {
    await runDailyMaintenance(NOW, { storage }); // limpa a retenção vencida que não é desta fixture
    await addStaleRefusal();
    mockedRunAlert.mockRejectedValueOnce(new Error("falha injetada no alerta"));
    const failed = await runDailyMaintenance(NOW, { storage, integrationAlert: okDependency });

    await addStaleRefusal(); // mesmos dados para a execução de comparação
    mockedRunAlert.mockResolvedValueOnce({ evaluated: 7, sent: 0, skipped: null, sendFailed: false });
    const healthy = await runDailyMaintenance(NOW, { storage, integrationAlert: okDependency });

    expect(failed.integrationAlertFailed).toBe(true);
    expect(failed.integrationAlertEvaluated).toBe(0);
    expect(failed.integrationAlertSent).toBe(0);
    expect(healthy.integrationAlertFailed).toBe(false);
    expect(healthy.integrationAlertEvaluated).toBe(7);
    expect(failed.refusalsDeleted).toBe(1);
    expect(withoutAlert(failed)).toEqual(withoutAlert(healthy));
  });

  it("sem a dependência: sem-dependencia e nenhuma leitura nem escrita em tenants", async () => {
    const tenant = await newTenant();

    const result = await runDailyMaintenance(NOW, { storage });

    expect(result.integrationAlertSkipped).toBe("sem-dependencia");
    expect(result.integrationAlertEvaluated).toBe(0);
    expect(result.integrationAlertSent).toBe(0);
    expect(result.integrationAlertSendFailed).toBe(false);
    expect(result.integrationAlertFailed).toBe(false);
    expect(mockedSnapshots).not.toHaveBeenCalled();
    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(row.integrationHealthState).toBeNull();
    expect(row.integrationHealthChangedAt).toBeNull();
  });

  it("com a dependência, o grupo roda e reporta os campos do resultado do alerta", async () => {
    const result = await runDailyMaintenance(NOW, { storage, integrationAlert: { operatorEmail: undefined, send: okDependency.send } });

    expect(mockedRunAlert).toHaveBeenCalledTimes(1);
    expect(result.integrationAlertSkipped).toBe("destinatario-ausente");
    expect(result.integrationAlertEvaluated).toBeGreaterThanOrEqual(0);
    expect(result.integrationAlertFailed).toBe(false);
  });
});

describe("rota /api/cron/expire-documents — ligação do alerta (L-026)", () => {
  const secret = `fixture-cron-${randomUUID()}`;
  const handler = createExpireDocumentsHandler({ storage, now: () => NOW });
  const request = () =>
    new Request("http://local/api/cron/expire-documents", { method: "GET", headers: { Authorization: `Bearer ${secret}` } });

  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", secret);
  });

  it("sob o Vitest o destinatário do ambiente é vazio, mesmo com o carregador de variáveis ativo (L-037)", () => {
    expect(process.env.CRIVO_OPERATOR_ALERT_EMAIL).toBe("");
  });

  it("sem destinatário no ambiente a resposta traz os cinco campos e destinatario-ausente, sem enviar", async () => {
    const response = await handler(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.integrationAlertSkipped).toBe("destinatario-ausente");
    expect(body.integrationAlertFailed).toBe(false);
    for (const field of ALERT_FIELDS) expect(body).toHaveProperty(field);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("com destinatário no ambiente o handler monta a dependência real: envia ao destinatário e loga só contagens", async () => {
    const tenant = await newFallingTenant();
    vi.stubEnv("CRIVO_OPERATOR_ALERT_EMAIL", "operador@fixture.test");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    let response: Response;
    let infoCalls: unknown[][];
    try {
      response = await handler(request());
    } finally {
      infoCalls = [...info.mock.calls];
      info.mockRestore();
    }
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedSend).toHaveBeenCalledTimes(1);
    const message = mockedSend.mock.calls[0][0];
    expect(message.to).toBe("operador@fixture.test");
    expect(message.text).toContain(tenant.name);
    expect(body.integrationAlertSent).toBeGreaterThanOrEqual(1);
    expect(body.integrationAlertSkipped).toBeNull();
    expect(body.integrationAlertFailed).toBe(false);

    const logged = infoCalls.find((call) => call[0] === "[manutencao] alerta");
    expect(logged).toBeDefined();
    expect(Object.keys(logged![1] as object).sort()).toEqual(["evaluated", "failed", "sendFailed", "sent", "skipped"]);
    expect(logged![1]).toMatchObject({ evaluated: body.integrationAlertEvaluated, sent: body.integrationAlertSent, skipped: null, sendFailed: false, failed: false });
    expect(JSON.stringify(logged)).not.toContain(tenant.name);
    expect(JSON.stringify(logged)).not.toContain(tenant.slug);
  });
});
