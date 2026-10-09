import "dotenv/config";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { applyVitrineSql, verifyVitrineState } from "../vitrine/apply";
import { db } from "../../src/db";
import { currentTestDatabaseUrl } from "../../src/db/__tests__/vitrine-helpers";
import { pushToTargets, type PushSteps } from "../test-db-push";

const TARGETS = [
  "postgresql://owner:senha-da-base@host-base.example.test/neondb",
  "postgresql://owner:senha-da-base@host-w1.example.test/neondb",
  "postgresql://owner:senha-da-base@host-w2.example.test/neondb",
];
const PASSWORD = "senha-do-papel-123";

function simulated(overrides: Partial<PushSteps> = {}) {
  const calls: string[] = [];
  const steps: PushSteps = {
    dropVitrine: async (url) => { calls.push(`drop ${new URL(url).hostname}`); },
    push: async (url) => { calls.push(`push ${new URL(url).hostname}`); return 0; },
    applyVitrine: async (url, options) => { calls.push(`apply ${new URL(url).hostname} ${options.password}`); },
    verify: async (url) => { calls.push(`verify ${new URL(url).hostname}`); return []; },
    ...overrides,
  };
  return { calls, steps };
}

function capture() {
  const lines: string[] = [];
  return { lines, logger: { log: (m: string) => lines.push(m), error: (m: string) => lines.push(m) } };
}

describe("L16a T10 — db:push:test com o SQL da vitrine (VBANCO-03)", () => {
  it("AC12: em cada alvo a ordem é derrubar -> push -> aplicar -> conferir, alvo a alvo", async () => {
    const { calls, steps } = simulated();
    const { logger } = capture();
    const code = await pushToTargets(TARGETS, steps, PASSWORD, logger);
    expect(code).toBe(0);
    expect(calls).toEqual([
      `drop host-base.example.test`, `push host-base.example.test`, `apply host-base.example.test ${PASSWORD}`, `verify host-base.example.test`,
      `drop host-w1.example.test`, `push host-w1.example.test`, `apply host-w1.example.test ${PASSWORD}`, `verify host-w1.example.test`,
      `drop host-w2.example.test`, `push host-w2.example.test`, `apply host-w2.example.test ${PASSWORD}`, `verify host-w2.example.test`,
    ]);
  });

  it("erro no push do alvo 2: o alvo 3 não é tocado, o aplicar do alvo 2 não roda e o código de saída é o do push", async () => {
    const { calls, steps } = simulated({
      push: async (url) => { calls.push(`push ${new URL(url).hostname}`); return new URL(url).hostname === "host-w1.example.test" ? 3 : 0; },
    });
    const { lines, logger } = capture();
    const code = await pushToTargets(TARGETS, steps, PASSWORD, logger);
    expect(code).toBe(3);
    expect(calls.some((call) => call.includes("host-w2"))).toBe(false);
    expect(calls).not.toContain(`apply host-w1.example.test ${PASSWORD}`);
    expect(lines.join("\n")).toContain("host-w1.example.test");
  });

  it("push com saída 0 mas conferência faltando um check: código ≠ 0 e o alvo seguinte não é tocado", async () => {
    const { calls, steps } = simulated({
      verify: async (url) => {
        calls.push(`verify ${new URL(url).hostname}`);
        return new URL(url).hostname === "host-base.example.test"
          ? ["check tenant_storefronts_accent_color_check ausente em tenant_storefronts"]
          : [];
      },
    });
    const { lines, logger } = capture();
    const code = await pushToTargets(TARGETS, steps, PASSWORD, logger);
    expect(code).not.toBe(0);
    expect(calls.some((call) => call.includes("host-w1"))).toBe(false);
    expect(lines.join("\n")).toContain("tenant_storefronts_accent_color_check ausente");
  });

  it("push com saída nula (processo morto) também falha com código ≠ 0", async () => {
    const { steps } = simulated({ push: async () => null });
    expect(await pushToTargets(TARGETS, steps, PASSWORD, capture().logger)).not.toBe(0);
  });

  it("erro ao derrubar o schema ou ao aplicar o SQL para no alvo e não toca os demais", async () => {
    const dropFails = simulated({ dropVitrine: async () => { throw new Error("falha simulada"); } });
    expect(await pushToTargets(TARGETS, dropFails.steps, PASSWORD, capture().logger)).not.toBe(0);
    expect(dropFails.calls).toEqual([]);

    const applyFails = simulated({
      applyVitrine: async (url) => { applyFails.calls.push(`apply ${new URL(url).hostname}`); throw new Error("falha simulada"); },
    });
    expect(await pushToTargets(TARGETS, applyFails.steps, PASSWORD, capture().logger)).not.toBe(0);
    expect(applyFails.calls.some((call) => call.includes("host-w1"))).toBe(false);
    expect(applyFails.calls).not.toContain("verify host-base.example.test");
  });

  it("sem VITRINE_TEST_DB_PASSWORD nada é tocado e o código é ≠ 0", async () => {
    const { calls, steps } = simulated();
    const { lines, logger } = capture();
    expect(await pushToTargets(TARGETS, steps, undefined, logger)).not.toBe(0);
    expect(await pushToTargets(TARGETS, steps, "", logger)).not.toBe(0);
    expect(calls).toEqual([]);
    expect(lines.join("\n")).toContain("VITRINE_TEST_DB_PASSWORD");
  });

  it("nenhum log traz a senha do papel, a senha da base ou a URL: só o host", async () => {
    const failing = simulated({ verify: async () => ["papel crivo_vitrine ausente"] });
    const { lines, logger } = capture();
    await pushToTargets(TARGETS, simulated().steps, PASSWORD, logger);
    await pushToTargets(TARGETS, failing.steps, PASSWORD, logger);
    const throwing = simulated({ applyVitrine: async () => { throw new Error(`postgresql://owner:senha-da-base@host-base.example.test/neondb ${PASSWORD}`); } });
    await pushToTargets(TARGETS, throwing.steps, PASSWORD, logger);
    const output = lines.join("\n");
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain("senha-da-base");
    expect(output).not.toContain("postgresql://");
    expect(output).toContain("host-base.example.test");
  });
});

describe("L16a T10 — conferência do estado final contra o banco real (VBANCO-03)", () => {
  const url = currentTestDatabaseUrl();

  afterAll(async () => {
    await db.$client.end();
  });

  it("com o estado que o db:push:test deixou, não há problema algum", async () => {
    expect(await verifyVitrineState(url)).toEqual([]);
  });

  it("com um check removido à mão, aponta o check ausente; reaplicar o SQL resolve", async () => {
    await db.execute(sql`alter table public.tenant_storefronts drop constraint tenant_storefronts_active_requires_identity_check`);
    try {
      expect(await verifyVitrineState(url)).toEqual([
        "check tenant_storefronts_active_requires_identity_check ausente em tenant_storefronts",
      ]);
    } finally {
      await applyVitrineSql(url);
    }
    expect(await verifyVitrineState(url)).toEqual([]);
  });

  it("um GRANT a mais em public.properties para o papel é apontado como inesperado", async () => {
    await db.execute(sql`grant select on public.properties to crivo_vitrine`);
    try {
      const problems = await verifyVitrineState(url);
      expect(problems).toEqual(["grant inesperado public.properties:SELECT para crivo_vitrine"]);
    } finally {
      await db.execute(sql`revoke select on public.properties from crivo_vitrine`);
    }
    expect(await verifyVitrineState(url)).toEqual([]);
  });

  it("um grant que falta nas views é apontado como ausente", async () => {
    await db.execute(sql`revoke select on vitrine.lojas from crivo_vitrine`);
    try {
      expect(await verifyVitrineState(url)).toEqual(["grant vitrine.lojas:SELECT ausente para crivo_vitrine"]);
    } finally {
      await applyVitrineSql(url);
    }
    expect(await verifyVitrineState(url)).toEqual([]);
  });
});
