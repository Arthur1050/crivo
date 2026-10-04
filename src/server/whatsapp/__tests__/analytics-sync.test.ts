import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import * as schema from "../../../db/schema";
import { tenants, whatsappChannels, whatsappUsage } from "../../../db/schema";
import { syncUsage } from "../analytics";
import { analyticsFixtureAdapter, analyticsFixtureChannel, analyticsFixtureGraph as graph } from "./analytics-fixtures";

const tenantA = randomUUID(); const tenantB = randomUUID();
const base = new Date("2026-10-02T12:00:00Z");
const adapter = analyticsFixtureAdapter(base);
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function channel(patch: Partial<typeof whatsappChannels.$inferInsert> = {}) {
  return analyticsFixtureChannel(tenantA, base, patch);
}
async function periods(phone: string) { return db.select().from(whatsappUsage).where(and(eq(whatsappUsage.tenantId, tenantA), eq(whatsappUsage.phoneNumberId, phone))); }
async function liveChannel(phone: string) { return (await db.select().from(whatsappChannels).where(eq(whatsappChannels.phoneNumberId, phone)))[0]; }
type Channel = Awaited<ReturnType<typeof channel>>;
function run(row: Channel, now: () => Date, fetcher: typeof fetch = async (url) => graph(url), database?: Pick<typeof db, "transaction">) {
  return syncUsage({ tenantId: tenantA }, { phoneNumberId: row.phoneNumberId }, { now, adapter, fetch: fetcher, database });
}
beforeAll(async () => {
  await db.insert(tenants).values([tenantA, tenantB].map((id) => ({ id, slug: `fixture-${id}`, name: "Fixture sync", agentName: "Agente", supportedModality: "ambos" as const })));
});
beforeEach(() => { vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "fixture-sync-server-token"); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(async () => {
  await db.delete(whatsappUsage).where(inArray(whatsappUsage.tenantId, [tenantA, tenantB]));
  await db.delete(whatsappChannels).where(inArray(whatsappChannels.tenantId, [tenantA, tenantB]));
  await db.delete(tenants).where(inArray(tenants.id, [tenantA, tenantB]));
  await db.$client.end();
});

describe("T13 — snapshot substituído somente pelo claim vivo", () => {
  it("primeira consulta cobre mês inteiro e separa queryEnd de sucesso sem tx durante Graph", async () => {
    const row = await channel(); let clock = base;
    const fetcher = vi.fn<typeof fetch>(async (address) => {
      const lease = await liveChannel(row.phoneNumberId); // Outra conexão lê claim já commitado.
      expect(lease.usageSyncToken).not.toBeNull();
      expect(lease.usageSyncDeadline).toEqual(new Date("2026-10-02T12:01:30Z"));
      const params = new URL(String(address)).searchParams;
      expect(params.get("start")).toBe("1790812800"); expect(params.get("end")).toBe("1790942400");
      clock = new Date("2026-10-02T12:00:07Z"); return graph(address);
    });
    expect(await run(row, () => clock, fetcher)).toEqual({ ok: true });
    const [period] = await periods(row.phoneNumberId);
    expect(period.freeServiceVolume).toBe(999);
    expect(period.queryEnd).toEqual(new Date("2026-10-02T12:00:00Z"));
    expect(period.lastSuccessAt).toEqual(new Date("2026-10-02T12:00:07Z"));
    expect(period.querySequence).toBe(1);
    expect((await liveChannel(row.phoneNumberId)).usageSyncToken).toBeNull();
  });

  it("14:59.999 recusa e 15min permite substituir volume sem acumular", async () => {
    const row = await channel(); let clock = base;
    const fetcher = vi.fn<typeof fetch>(async (address) => graph(address, clock === base ? 999 : 1000));
    expect(await run(row, () => clock, fetcher)).toEqual({ ok: true });
    clock = new Date("2026-10-02T12:14:59.999Z");
    expect(await run(row, () => clock, fetcher)).toEqual({ ok: false, reason: "cadence" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock = new Date("2026-10-02T12:15:00Z");
    expect(await run(row, () => clock, fetcher)).toEqual({ ok: true });
    const [period] = await periods(row.phoneNumberId);
    expect(period.freeServiceVolume).toBe(1000); expect(period.querySequence).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("429 conserva último snapshot/queryEnd/sucesso e mantém cadência da falha", async () => {
    const row = await channel(); expect(await run(row, () => base)).toEqual({ ok: true });
    const [before] = await periods(row.phoneNumberId);
    const clock = new Date("2026-10-02T12:15:00Z");
    expect(await run(row, () => clock, async () => new Response("secret-error", { status: 429 }))).toEqual({ ok: false, reason: "rate-limited" });
    const [after] = await periods(row.phoneNumberId);
    expect(after.freeServiceVolume).toBe(999); expect(after.queryEnd).toEqual(before.queryEnd); expect(after.lastSuccessAt).toEqual(before.lastSuccessAt);
    expect(after.lastAttemptAt).toEqual(clock); expect(after.failureCode).toBe("rate-limited");
    expect(await run(row, () => new Date("2026-10-02T12:29:59.999Z"))).toEqual({ ok: false, reason: "cadence" });
  });

  it("timeout do corpo preserva snapshot e registra somente falha limitada", async () => {
    const row = await channel(); expect(await run(row, () => base)).toEqual({ ok: true });
    const [before] = await periods(row.phoneNumberId); let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    expect(await run(row, () => new Date("2026-10-02T12:15:00Z"), async (url) => {
      const body = graph(url); body.json = async () => { elapsed = 15_000; return {}; }; return body;
    })).toEqual({ ok: false, reason: "timeout" });
    const [after] = await periods(row.phoneNumberId);
    expect(after.freeServiceVolume).toBe(999); expect(after.queryEnd).toEqual(before.queryEnd); expect(after.lastSuccessAt).toEqual(before.lastSuccessAt);
    expect(after.failureCode).toBe("timeout");
  });

  it("interrupção/lease vencida não reinicia 15min; recuperação usa token novo", async () => {
    const token = randomUUID();
    const row = await channel({ lastUsageAttemptAt: base, usageSyncToken: token, usageSyncDeadline: new Date("2026-10-02T12:01:30Z") });
    const fetcher = vi.fn<typeof fetch>(async (url) => graph(url));
    expect(await run(row, () => new Date("2026-10-02T12:01:29.999Z"), fetcher)).toEqual({ ok: false, reason: "lease-active" });
    expect(await run(row, () => new Date("2026-10-02T12:01:30Z"), fetcher)).toEqual({ ok: false, reason: "cadence" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await run(row, () => new Date("2026-10-02T12:15:00Z"), fetcher)).toEqual({ ok: true });
    expect((await periods(row.phoneNumberId))[0].responseToken).not.toBe(token);
  });

  it("worker vencido antes de fetch não chama transporte nem publica zero", async () => {
    const row = await channel(); let calls = 0;
    const fetcher = vi.fn<typeof fetch>(async (url) => graph(url));
    expect(await run(row, () => ++calls === 1 ? base : new Date("2026-10-02T12:01:30Z"), fetcher)).toEqual({ ok: false, reason: "superseded" });
    expect(fetcher).not.toHaveBeenCalled();
    const [period] = await periods(row.phoneNumberId);
    expect(period.freeServiceVolume).toBeNull(); expect(period.queryEnd).toBeNull(); expect(period.lastSuccessAt).toBeNull();
  });

  it("resposta antiga depois da nova não sobrescreve snapshot de sequência2", async () => {
    const row = await channel(); let clock = base;
    const entered = deferred<RequestInfo | URL>(); const old = deferred<Response>();
    const pending = run(row, () => clock, async (url) => { entered.resolve(url); return old.promise; });
    const address = await entered.promise;
    clock = new Date("2026-10-02T12:15:00Z");
    expect(await run(row, () => clock, async (url) => graph(url, 1000))).toEqual({ ok: true });
    const [newer] = await periods(row.phoneNumberId);
    old.resolve(graph(address, 999));
    expect(await pending).toEqual({ ok: false, reason: "superseded" });
    expect(await periods(row.phoneNumberId)).toEqual([newer]);
    expect(newer.freeServiceVolume).toBe(1000); expect(newer.querySequence).toBe(2);
  });

  it("worker antigo não libera lease de outro token ainda em transporte", async () => {
    const row = await channel(); let clock = base;
    const firstEntered = deferred<RequestInfo | URL>(); const secondEntered = deferred<RequestInfo | URL>();
    const first = deferred<Response>(); const second = deferred<Response>();
    const old = run(row, () => clock, async (url) => { firstEntered.resolve(url); return first.promise; });
    const firstAddress = await firstEntered.promise;
    clock = new Date("2026-10-02T12:15:00Z");
    const newer = run(row, () => clock, async (url) => { secondEntered.resolve(url); return second.promise; });
    const secondAddress = await secondEntered.promise; const lease = await liveChannel(row.phoneNumberId);
    first.resolve(graph(firstAddress)); expect(await old).toEqual({ ok: false, reason: "superseded" });
    expect((await liveChannel(row.phoneNumberId)).usageSyncToken).toBe(lease.usageSyncToken);
    expect((await liveChannel(row.phoneNumberId)).usageSyncDeadline).toEqual(lease.usageSyncDeadline);
    second.resolve(graph(secondAddress, 1000)); expect(await newer).toEqual({ ok: true });
  });

  it("virada de mês invalida resposta antiga e não abre nova consulta antes15min", async () => {
    const row = await channel(); let clock = new Date("2026-10-31T23:59:59Z");
    expect(await run(row, () => clock, async (url) => { clock = new Date("2026-11-01T00:00:00Z"); return graph(url); })).toEqual({ ok: false, reason: "superseded" });
    expect(await run(row, () => clock)).toEqual({ ok: false, reason: "cadence" });
    expect((await periods(row.phoneNumberId))[0].freeServiceVolume).toBeNull();
    clock = new Date("2026-11-01T00:14:59Z"); expect(await run(row, () => clock, async (url) => graph(url, 0))).toEqual({ ok: true });
    const rows = await periods(row.phoneNumberId);
    expect(rows).toHaveLength(2);
    expect(rows.find((item) => item.monthStart.toISOString() === "2026-11-01T00:00:00.000Z")?.freeServiceVolume).toBe(0);
  });

  it("troca de revisão recusa resultado anterior sem reiniciar cadência do canal", async () => {
    const row = await channel(); let clock = base;
    expect(await run(row, () => clock, async (url) => {
      await db.update(whatsappChannels).set({ configurationRevision: 2 }).where(eq(whatsappChannels.id, row.id)); return graph(url);
    })).toEqual({ ok: false, reason: "superseded" });
    expect(await run(row, () => clock)).toEqual({ ok: false, reason: "cadence" });
    clock = new Date("2026-10-02T12:15:00Z"); expect(await run(row, () => clock)).toEqual({ ok: true });
    const rows = await periods(row.phoneNumberId);
    expect(rows.find((item) => item.configurationRevision === 1)?.freeServiceVolume).toBeNull();
    expect(rows.find((item) => item.configurationRevision === 2)?.freeServiceVolume).toBe(999);
  });

  it("troca de número Analytics durante transporte não publica no número antigo", async () => {
    const row = await channel();
    expect(await run(row, () => base, async (url) => {
      await db.update(whatsappChannels).set({ analyticsPhoneNumber: "5511888880000" }).where(eq(whatsappChannels.id, row.id)); return graph(url);
    })).toEqual({ ok: false, reason: "superseded" });
    expect((await periods(row.phoneNumberId))[0].freeServiceVolume).toBeNull();
  });

  it("capacidade revogada durante transporte recusa publicação", async () => {
    const row = await channel();
    expect(await run(row, () => base, async (url) => {
      await db.update(whatsappChannels).set({ usageEnabled: false }).where(eq(whatsappChannels.id, row.id)); return graph(url);
    })).toEqual({ ok: false, reason: "superseded" });
    expect((await periods(row.phoneNumberId))[0].lastSuccessAt).toBeNull();
  });

  it("canal desabilitado/ausente/estrangeiro não faz tentativa nem Graph", async () => {
    const rows = [await channel({ usageEnabled: false }), await channel({ tenantId: tenantB })];
    const fetcher = vi.fn<typeof fetch>(async (url) => graph(url));
    for (const row of rows) expect(await run(row, () => base, fetcher)).toEqual({ ok: false, reason: "usage-disabled" });
    expect(await syncUsage({ tenantId: tenantA }, { phoneNumberId: "missing-fixture" }, { adapter, fetch: fetcher })).toEqual({ ok: false, reason: "usage-disabled" });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await liveChannel(rows[0].phoneNumberId)).lastUsageAttemptAt).toBeNull();
    expect((await liveChannel(rows[1].phoneNumberId)).lastUsageAttemptAt).toBeNull();
  });

  it("contrato real ausente registra falha sem saldo e mantém cadência", async () => {
    const row = await channel(); const fetcher = vi.fn<typeof fetch>(async (url) => graph(url));
    expect(await syncUsage({ tenantId: tenantA }, { phoneNumberId: row.phoneNumberId }, { now: () => base, fetch: fetcher })).toEqual({ ok: false, reason: "contract-unverified" });
    const [period] = await periods(row.phoneNumberId);
    expect(period.freeServiceVolume).toBeNull(); expect(period.failureCode).toBe("contract-unverified");
    expect(await run(row, () => new Date("2026-10-02T12:14:59.999Z"), fetcher)).toEqual({ ok: false, reason: "cadence" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sequência/token de resposta divergente impede publicação mesmo com lease do canal", async () => {
    const row = await channel(); const token = randomUUID();
    expect(await run(row, () => base, async (url) => {
      await db.update(whatsappUsage).set({ querySequence: 2, responseToken: token }).where(eq(whatsappUsage.phoneNumberId, row.phoneNumberId)); return graph(url);
    })).toEqual({ ok: false, reason: "superseded" });
    const [period] = await periods(row.phoneNumberId);
    expect(period.responseToken).toBe(token); expect(period.querySequence).toBe(2); expect(period.freeServiceVolume).toBeNull();
  });

  it("guarda atrasada além do orçamento do handler não inicia Graph", async () => {
    const row = await channel(); let elapsed = 0; let transactions = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => {
      if (++transactions === 2) elapsed = 80_000;
      return callback(tx);
    }, config) };
    const fetcher = vi.fn<typeof fetch>(async (url) => graph(url));
    expect(await run(row, () => base, fetcher, database)).toEqual({ ok: false, reason: "timeout" });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await periods(row.phoneNumberId))[0].freeServiceVolume).toBeNull();
  });

  it("publicação atrasada além do orçamento preserva sucesso anterior", async () => {
    const row = await channel(); expect(await run(row, () => base)).toEqual({ ok: true });
    const [before] = await periods(row.phoneNumberId); let elapsed = 0; let transactions = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const database: Pick<typeof db, "transaction"> = { transaction: (callback, config) => db.transaction(async (tx) => {
      if (++transactions === 3) elapsed = 80_001;
      return callback(tx);
    }, config) };
    expect(await run(row, () => new Date("2026-10-02T12:15:00Z"), async (url) => graph(url, 1000), database)).toEqual({ ok: false, reason: "timeout" });
    const [after] = await periods(row.phoneNumberId);
    expect(after.freeServiceVolume).toBe(999); expect(after.queryEnd).toEqual(before.queryEnd); expect(after.lastSuccessAt).toEqual(before.lastSuccessAt);
  });

  it("driver sem resposta retorna timeout aos80s sem esperar lease90s", async () => {
    const row = await channel(); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const transaction = vi.fn(async () => new Promise<never>(() => {}));
    let settled = false;
    const pending = run(row, () => base, async (url) => graph(url), { transaction });
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(79_999); expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(await pending).toEqual({ ok: false, reason: "timeout" });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(await periods(row.phoneNumberId)).toEqual([]);
  });

  it("dois backends reais disputam claim e só um consulta Graph", async () => {
    const row = await channel(); const blocker = await db.$client.connect(); const clientA = await db.$client.connect(); const clientB = await db.$client.connect();
    const pidA = deferred<number>(); const pidB = deferred<number>(); const entered = deferred<RequestInfo | URL>(); const http = deferred<Response>();
    let pending: ReturnType<typeof run>[] = [];
    try {
      await blocker.query("BEGIN"); await blocker.query("SELECT id FROM whatsapp_channels WHERE id=$1 FOR UPDATE", [row.id]);
      const pinned = (client: typeof clientA, pid: ReturnType<typeof deferred<number>>): Pick<typeof db, "transaction"> => {
        const database = drizzle(client, { schema });
        return { transaction: (callback, config) => database.transaction(async (tx) => {
          pid.resolve((await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0].pid); return callback(tx);
        }, config) };
      };
      const fetcher = vi.fn<typeof fetch>(async (url) => { entered.resolve(url); return http.promise; });
      pending = [run(row, () => base, fetcher, pinned(clientA, pidA)), run(row, () => base, fetcher, pinned(clientB, pidB))];
      const pids = await Promise.all([pidA.promise, pidB.promise]); expect(pids[0]).not.toBe(pids[1]);
      let waiting = 0;
      for (let attempt = 0; attempt < 100 && waiting < 2; attempt++) {
        waiting = (await db.$client.query<{ waiting: number }>("SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE pid=ANY($1::int[]) AND wait_event_type='Lock'", [pids])).rows[0].waiting;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(2); await blocker.query("COMMIT");
      const url = await entered.promise; expect(await Promise.race(pending)).toEqual({ ok: false, reason: "lease-active" });
      http.resolve(graph(url)); expect(await Promise.all(pending)).toEqual(expect.arrayContaining([{ ok: true }, { ok: false, reason: "lease-active" }]));
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(await periods(row.phoneNumberId)).toHaveLength(1);
      expect((await periods(row.phoneNumberId))[0].querySequence).toBe(1);
      expect((await periods(row.phoneNumberId))[0].freeServiceVolume).toBe(999);
    } finally {
      await blocker.query("ROLLBACK"); http.resolve(new Response("", { status: 500 })); await Promise.allSettled(pending);
      blocker.release(); clientA.release(); clientB.release();
    }
  });

  it("período Amman existente não é publicado como Atenas com mesmo início e fim diferente", async () => {
    const row = await channel({ accountTimezone: "Europe/Athens" });
    const [before] = await db.insert(whatsappUsage).values({ tenantId: tenantA, phoneNumberId: row.phoneNumberId, configurationRevision: 1,
      accountTimezone: "Asia/Amman", monthStart: new Date("2026-09-30T21:00:00Z"), monthEnd: new Date("2026-10-31T21:00:00Z"),
      freeServiceVolume: 999, queryEnd: new Date("2026-10-02T10:00:00Z"), lastSuccessAt: new Date("2026-10-02T10:00:15Z") }).returning();
    const fetcher = vi.fn<typeof fetch>(async (url) => graph(url, 1000));
    expect(await run(row, () => base, fetcher)).toEqual({ ok: false, reason: "superseded" });
    expect(fetcher).not.toHaveBeenCalled();
    const [after] = await periods(row.phoneNumberId);
    expect(after.accountTimezone).toBe("Asia/Amman");
    expect(after.monthStart).toEqual(new Date("2026-09-30T21:00:00Z"));
    expect(after.monthEnd).toEqual(new Date("2026-10-31T21:00:00Z"));
    expect(after.freeServiceVolume).toBe(999);
    expect(after.queryEnd).toEqual(before.queryEnd);
    expect(after.lastSuccessAt).toEqual(before.lastSuccessAt);
  });
});
