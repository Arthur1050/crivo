import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import { conversations, integrationRefusals, leads, messages, tenants } from "../../../db/schema";
import {
  claimIntegrationProblems,
  getTenantHealthSnapshots,
  recordTenantHealthStates,
  releaseIntegrationProblems,
} from "../integration-health";

// Fixtures próprias: a manutenção e o snapshot percorrem todos os tenants do
// banco, então cada asserção olha só os tenants criados aqui.
const ROUTE_PREFIX = `/api/v1/__test-integration-health__/${randomUUID()}`;
const createdTenants: string[] = [];

async function newTenant(overrides: Partial<typeof tenants.$inferInsert> = {}) {
  const id = randomUUID();
  createdTenants.push(id);
  await db.insert(tenants).values({
    id,
    slug: `fixture-health-${id}`,
    name: `Fixture saúde ${id.slice(0, 8)}`,
    agentName: "Agente",
    supportedModality: "ambos",
    ...overrides,
  });
  return id;
}

async function addMessages(tenantId: string, entries: { sender: "agente" | "lead" | "humano"; sentAt: Date }[]) {
  const [lead] = await db
    .insert(leads)
    .values({ tenantId, name: "Lead saúde", phone: "+5534900000000", status: "em_qualificacao", firstContactAt: new Date() })
    .returning();
  const [conversation] = await db.insert(conversations).values({ tenantId, leadId: lead.id }).returning();
  await db.insert(messages).values(
    entries.map((entry) => ({
      tenantId,
      conversationId: conversation.id,
      sender: entry.sender,
      content: "fixture",
      sentAt: entry.sentAt,
      authorName: entry.sender === "humano" ? "Corretor" : null,
    }))
  );
}

async function addRefusal(tenantId: string | null, suffix: string, occurredAt: Date, code: string | null = "invalid_token") {
  await db.insert(integrationRefusals).values({
    tenantId,
    route: `${ROUTE_PREFIX}/${suffix}`,
    method: "POST",
    status: 401,
    code,
    occurredAt,
  });
}

async function snapshotOf(tenantId: string, since: Date) {
  const all = await getTenantHealthSnapshots(since);
  return all.find((snapshot) => snapshot.tenantId === tenantId);
}

async function rowOf(tenantId: string) {
  const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return row;
}

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

const SINCE = new Date("2026-10-06T03:00:00.000Z");

describe("getTenantHealthSnapshots — ALERTA-01 AC1", () => {
  it("traz nome, slug e o estado gravado do tenant", async () => {
    const changedAt = new Date("2026-09-30T03:00:00.000Z");
    const id = await newTenant({ integrationHealthState: "problema", integrationHealthChangedAt: changedAt });
    const snapshot = await snapshotOf(id, SINCE);
    expect(snapshot?.slug).toBe(`fixture-health-${id}`);
    expect(snapshot?.name).toBe(`Fixture saúde ${id.slice(0, 8)}`);
    expect(snapshot?.storedState).toBe("problema");
    expect(snapshot?.storedChangedAt?.toISOString()).toBe(changedAt.toISOString());
  });

  it("última mensagem é a do agente: ignora lead e humano, mesmo mais recentes", async () => {
    const id = await newTenant();
    const agentAt = new Date("2026-10-05T10:00:00.000Z");
    await addMessages(id, [
      { sender: "agente", sentAt: new Date("2026-10-05T09:00:00.000Z") },
      { sender: "agente", sentAt: agentAt },
      { sender: "lead", sentAt: new Date("2026-10-06T10:00:00.000Z") },
      { sender: "humano", sentAt: new Date("2026-10-06T11:00:00.000Z") },
    ]);
    const snapshot = await snapshotOf(id, SINCE);
    expect(snapshot?.lastAgentMessageAt?.toISOString()).toBe(agentAt.toISOString());
  });

  it("tenant sem mensagem do agente tem lastAgentMessageAt nulo", async () => {
    const id = await newTenant();
    await addMessages(id, [{ sender: "lead", sentAt: new Date("2026-10-06T10:00:00.000Z") }]);
    const snapshot = await snapshotOf(id, SINCE);
    expect(snapshot?.lastAgentMessageAt).toBeNull();
  });

  it("recusas: as do tenant mais as sem tenant, agrupadas por (code, rota); a de outro tenant não aparece (L-035)", async () => {
    const mine = await newTenant();
    const foreign = await newTenant();
    const at = new Date("2026-10-06T12:00:00.000Z");
    await addRefusal(mine, "propria", at);
    await addRefusal(mine, "propria", at);
    await addRefusal(null, "sem-tenant", at, null);
    await addRefusal(foreign, "alheia", at);

    const mineSnapshot = await snapshotOf(mine, SINCE);
    const ours = mineSnapshot!.refusals.filter((r) => r.route.startsWith(ROUTE_PREFIX));
    expect(ours).toEqual(
      expect.arrayContaining([
        { code: "invalid_token", route: `${ROUTE_PREFIX}/propria`, count: 2 },
        { code: null, route: `${ROUTE_PREFIX}/sem-tenant`, count: 1 },
      ])
    );
    expect(ours).toHaveLength(2);
    expect(ours.some((r) => r.route.endsWith("/alheia"))).toBe(false);

    const foreignSnapshot = await snapshotOf(foreign, SINCE);
    const theirs = foreignSnapshot!.refusals.filter((r) => r.route.startsWith(ROUTE_PREFIX));
    expect(theirs).toEqual(
      expect.arrayContaining([
        { code: "invalid_token", route: `${ROUTE_PREFIX}/alheia`, count: 1 },
        { code: null, route: `${ROUTE_PREFIX}/sem-tenant`, count: 1 },
      ])
    );
    expect(theirs.some((r) => r.route.endsWith("/propria"))).toBe(false);
  });

  it("recusa exatamente em since conta; 1 ms antes não (L-023)", async () => {
    const id = await newTenant();
    await addRefusal(id, "no-limite", SINCE);
    await addRefusal(id, "antes", new Date(SINCE.getTime() - 1));
    const snapshot = await snapshotOf(id, SINCE);
    const routes = snapshot!.refusals.filter((r) => r.route.startsWith(ROUTE_PREFIX)).map((r) => r.route);
    expect(routes).toContain(`${ROUTE_PREFIX}/no-limite`);
    expect(routes).not.toContain(`${ROUTE_PREFIX}/antes`);
  });

  it("número de consultas é constante, não cresce com os tenants (3)", async () => {
    const querySpy = vi.spyOn(db.$client, "query");
    try {
      await getTenantHealthSnapshots(SINCE);
      const before = querySpy.mock.calls.length;
      await Promise.all([newTenant(), newTenant(), newTenant()]);
      querySpy.mockClear();
      await getTenantHealthSnapshots(SINCE);
      expect(before).toBe(3);
      expect(querySpy.mock.calls.length).toBe(3);
    } finally {
      querySpy.mockRestore();
    }
  });
});

describe("claimIntegrationProblems — compare-and-set (ALERTA-01 AC7)", () => {
  const D0 = new Date("2026-09-20T03:00:00.000Z");
  const D1 = new Date("2026-10-07T03:00:00.000Z");

  it("primeira chamada devolve o tenant e grava problema; a segunda não devolve nada", async () => {
    const id = await newTenant({ integrationHealthState: "saudavel", integrationHealthChangedAt: D0 });
    const first = await claimIntegrationProblems([id], D1);
    expect(first).toEqual([{ tenantId: id, previousChangedAt: D0, claimedAt: D1 }]);
    const row = await rowOf(id);
    expect(row.integrationHealthState).toBe("problema");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe(D1.toISOString());
    expect(await claimIntegrationProblems([id], new Date(D1.getTime() + 1000))).toEqual([]);
  });

  it("não reivindica tenant gravado problema nem tenant sem estado", async () => {
    const broken = await newTenant({ integrationHealthState: "problema", integrationHealthChangedAt: D0 });
    const fresh = await newTenant();
    expect(await claimIntegrationProblems([broken, fresh], D1)).toEqual([]);
    expect((await rowOf(broken)).integrationHealthChangedAt?.toISOString()).toBe(D0.toISOString());
    expect((await rowOf(fresh)).integrationHealthState).toBeNull();
  });

  it("não toca tenant fora da lista", async () => {
    const listed = await newTenant({ integrationHealthState: "saudavel", integrationHealthChangedAt: D0 });
    const other = await newTenant({ integrationHealthState: "saudavel", integrationHealthChangedAt: D0 });
    await claimIntegrationProblems([listed], D1);
    const row = await rowOf(other);
    expect(row.integrationHealthState).toBe("saudavel");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe(D0.toISOString());
  });

  it("lista vazia não consulta nem altera nada", async () => {
    expect(await claimIntegrationProblems([], D1)).toEqual([]);
  });

  it("duas reivindicações simultâneas: só uma recebe o tenant (L-052)", async () => {
    const id = await newTenant({ integrationHealthState: "saudavel", integrationHealthChangedAt: D0 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => { locked = resolve; });
    // Transação separada segura a linha: as duas reivindicações esperam nela.
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`select id from tenants where id = ${id} for update`);
      locked();
      await gate;
    });
    await lockTaken;
    const claimA = claimIntegrationProblems([id], new Date(D1.getTime() + 1));
    const claimB = claimIntegrationProblems([id], new Date(D1.getTime() + 2));
    let waiting = 0;
    for (let attempt = 0; attempt < 50 && waiting < 2; attempt++) {
      const result = await db.execute(
        sql`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and query like '%integration_health_state%'`
      );
      waiting = (result.rows[0] as { n: number }).n;
      if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(waiting).toBeGreaterThanOrEqual(2);
    release();
    await holder;
    const [a, b] = await Promise.all([claimA, claimB]);
    expect(a.length + b.length).toBe(1);
    expect((await rowOf(id)).integrationHealthState).toBe("problema");
  });
});

describe("releaseIntegrationProblems — liberação na falha (ALERTA-03 AC2)", () => {
  const D0 = new Date("2026-09-20T03:00:00.000Z");
  const D1 = new Date("2026-10-07T03:00:00.000Z");

  it("restaura saudavel e o changed_at anterior, diferente do instante da reivindicação (L-053)", async () => {
    const id = await newTenant({ integrationHealthState: "saudavel", integrationHealthChangedAt: D0 });
    const claimed = await claimIntegrationProblems([id], D1);
    await releaseIntegrationProblems(claimed);
    const row = await rowOf(id);
    expect(row.integrationHealthState).toBe("saudavel");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe(D0.toISOString());
  });

  it("restaura changed_at nulo quando não havia instante anterior", async () => {
    const id = await newTenant({ integrationHealthState: "saudavel" });
    const claimed = await claimIntegrationProblems([id], D1);
    await releaseIntegrationProblems(claimed);
    const row = await rowOf(id);
    expect(row.integrationHealthState).toBe("saudavel");
    expect(row.integrationHealthChangedAt).toBeNull();
  });

  it("não desfaz um estado que já mudou depois da reivindicação", async () => {
    const id = await newTenant({ integrationHealthState: "saudavel", integrationHealthChangedAt: D0 });
    const claimed = await claimIntegrationProblems([id], D1);
    const D2 = new Date("2026-10-08T03:00:00.000Z");
    await recordTenantHealthStates([{ tenantId: id, state: "problema", at: D2 }]);
    await releaseIntegrationProblems(claimed);
    const row = await rowOf(id);
    expect(row.integrationHealthState).toBe("problema");
    expect(row.integrationHealthChangedAt?.toISOString()).toBe(D2.toISOString());
  });

  it("não altera tenant fora da lista liberada", async () => {
    const released = await newTenant({ integrationHealthState: "saudavel", integrationHealthChangedAt: D0 });
    const kept = await newTenant({ integrationHealthState: "saudavel", integrationHealthChangedAt: D0 });
    const claimed = await claimIntegrationProblems([released, kept], D1);
    await releaseIntegrationProblems(claimed.filter((c) => c.tenantId === released));
    expect((await rowOf(kept)).integrationHealthState).toBe("problema");
    expect((await rowOf(released)).integrationHealthState).toBe("saudavel");
  });
});

describe("recordTenantHealthStates — inicializar e recuperar", () => {
  it("grava estado e instante só nos tenants listados (L-001)", async () => {
    const at = new Date("2026-10-07T03:00:00.000Z");
    const keptChangedAt = new Date("2026-09-01T03:00:00.000Z");
    const a = await newTenant();
    const b = await newTenant({ integrationHealthState: "problema", integrationHealthChangedAt: keptChangedAt });
    const untouched = await newTenant({ integrationHealthState: "problema", integrationHealthChangedAt: keptChangedAt });
    const untouchedNull = await newTenant();
    await recordTenantHealthStates([
      { tenantId: a, state: "problema", at },
      { tenantId: b, state: "saudavel", at },
    ]);
    const rowA = await rowOf(a);
    expect(rowA.integrationHealthState).toBe("problema");
    expect(rowA.integrationHealthChangedAt?.toISOString()).toBe(at.toISOString());
    const rowB = await rowOf(b);
    expect(rowB.integrationHealthState).toBe("saudavel");
    expect(rowB.integrationHealthChangedAt?.toISOString()).toBe(at.toISOString());
    const rowUntouched = await rowOf(untouched);
    expect(rowUntouched.integrationHealthState).toBe("problema");
    expect(rowUntouched.integrationHealthChangedAt?.toISOString()).toBe(keptChangedAt.toISOString());
    const rowNull = await rowOf(untouchedNull);
    expect(rowNull.integrationHealthState).toBeNull();
    expect(rowNull.integrationHealthChangedAt).toBeNull();
  });

  it("lista vazia não faz nada", async () => {
    await expect(recordTenantHealthStates([])).resolves.toBeUndefined();
  });
});
