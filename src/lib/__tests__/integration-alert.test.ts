import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatIntegrationAlertEmail,
  planIntegrationAlerts,
  type TenantHealthSnapshot,
} from "../integration-alert";

const NOW = new Date("2026-10-07T03:00:00.000Z");
const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

function snapshot(overrides: Partial<TenantHealthSnapshot> = {}): TenantHealthSnapshot {
  return {
    tenantId: "00000000-0000-0000-0000-000000000001",
    name: "Imobiliária Alfa",
    slug: "alfa",
    storedState: "saudavel",
    storedChangedAt: new Date("2026-10-01T03:00:00.000Z"),
    lastAgentMessageAt: new Date(NOW.getTime() - HOUR_MS),
    refusals: [],
    ...overrides,
  };
}

describe("planIntegrationAlerts — ALERTA-01", () => {
  it("estado gravado nulo inicializa com o estado avaliado e não alerta (AC3)", () => {
    const saudavel = snapshot({ tenantId: "t-saudavel", storedState: null, storedChangedAt: null });
    const problema = snapshot({ tenantId: "t-problema", storedState: null, storedChangedAt: null, lastAgentMessageAt: null });
    const plan = planIntegrationAlerts([saudavel, problema], NOW);
    expect(plan.initialize).toEqual([
      { tenantId: "t-saudavel", state: "saudavel" },
      { tenantId: "t-problema", state: "problema" },
    ]);
    expect(plan.alert).toEqual([]);
    expect(plan.recover).toEqual([]);
  });

  it("saudavel gravado e problema avaliado entra no alerta (AC2)", () => {
    const quiet = snapshot({ lastAgentMessageAt: new Date(NOW.getTime() - 25 * HOUR_MS) });
    const plan = planIntegrationAlerts([quiet], NOW);
    expect(plan.alert).toEqual([quiet]);
    expect(plan.initialize).toEqual([]);
    expect(plan.recover).toEqual([]);
  });

  it("problema gravado e saudavel avaliado recupera sem alertar (AC4)", () => {
    const healed = snapshot({ tenantId: "t-recuperado", storedState: "problema" });
    const plan = planIntegrationAlerts([healed], NOW);
    expect(plan.recover).toEqual(["t-recuperado"]);
    expect(plan.alert).toEqual([]);
    expect(plan.initialize).toEqual([]);
  });

  it("estado avaliado igual ao gravado não gera nenhuma lista (AC5)", () => {
    const stillHealthy = snapshot({ tenantId: "t-1" });
    const stillBroken = snapshot({ tenantId: "t-2", storedState: "problema", lastAgentMessageAt: null });
    const plan = planIntegrationAlerts([stillHealthy, stillBroken], NOW);
    expect(plan).toEqual({ initialize: [], recover: [], alert: [] });
  });

  it("recusa decide sozinha: mensagem recente com recusa é problema", () => {
    const refused = snapshot({ refusals: [{ code: "invalid_token", route: "/api/v1/leads", count: 1 }] });
    expect(planIntegrationAlerts([refused], NOW).alert).toEqual([refused]);
  });

  it("última mensagem exatamente a 24h é saudavel; a 24h + 1 ms é problema (L-023)", () => {
    const boundary = snapshot({ tenantId: "t-limite", lastAgentMessageAt: new Date(NOW.getTime() - DAY_MS) });
    const past = snapshot({ tenantId: "t-passou", lastAgentMessageAt: new Date(NOW.getTime() - DAY_MS - 1) });
    const plan = planIntegrationAlerts([boundary, past], NOW);
    expect(plan.alert.map((s) => s.tenantId)).toEqual(["t-passou"]);
  });

  it("sem lista de tenants devolve plano vazio", () => {
    expect(planIntegrationAlerts([], NOW)).toEqual({ initialize: [], recover: [], alert: [] });
  });
});

describe("formatIntegrationAlertEmail — ALERTA-02", () => {
  const refused = snapshot({
    name: "Imobiliária Beta",
    slug: "beta",
    lastAgentMessageAt: new Date("2026-10-05T14:30:00.000Z"),
    refusals: [
      { code: "invalid_token", route: "/api/v1/leads", count: 3 },
      { code: null, route: "/api/v1/messages", count: 1 },
    ],
  });
  const silent = snapshot({ name: "Imobiliária Gama", slug: "gama", lastAgentMessageAt: null });
  const third = snapshot({ name: "Imobiliária Delta", slug: "delta" });

  it("assunto traz N exato para 1 e para 3 tenants (AC2)", () => {
    expect(formatIntegrationAlertEmail([refused]).subject).toBe(
      "[crivo] Integração com problema em 1 imobiliária(s)"
    );
    expect(formatIntegrationAlertEmail([refused, silent, third]).subject).toBe(
      "[crivo] Integração com problema em 3 imobiliária(s)"
    );
  });

  it("corpo lista nome, slug, recusas por (code, rota) e último instante em ISO UTC (AC3)", () => {
    const { text } = formatIntegrationAlertEmail([refused]);
    expect(text).toContain("Imobiliária Beta");
    expect(text).toContain("beta");
    expect(text).toContain("invalid_token /api/v1/leads: 3");
    expect(text).toContain("sem code /api/v1/messages: 1");
    expect(text).toContain("2026-10-05T14:30:00.000Z");
  });

  it("sem mensagem do agente o corpo diz nunca (AC3)", () => {
    const { text } = formatIntegrationAlertEmail([silent]);
    expect(text).toContain("Imobiliária Gama");
    expect(text).toContain("nunca");
  });

  it("test: true prefixa o assunto com [teste] (T2 Done when)", () => {
    expect(formatIntegrationAlertEmail([refused], { test: true }).subject).toBe(
      "[teste] [crivo] Integração com problema em 1 imobiliária(s)"
    );
    expect(formatIntegrationAlertEmail([refused]).subject.startsWith("[teste]")).toBe(false);
  });

  it("corpo não carrega nenhum campo além dos do snapshot (AC4)", () => {
    const polluted = {
      ...refused,
      leadName: "Maria Segredo",
      phone: "+5534999990000",
      content: "mensagem privada do lead",
      apiKey: "chave-secreta-xyz",
    } as TenantHealthSnapshot;
    const { subject, text } = formatIntegrationAlertEmail([polluted]);
    for (const leak of ["Maria Segredo", "+5534999990000", "mensagem privada do lead", "chave-secreta-xyz"]) {
      expect(text).not.toContain(leak);
      expect(subject).not.toContain(leak);
    }
    expect(text).not.toContain(polluted.tenantId);
  });
});

describe("pureza do módulo — T2 Done when", () => {
  it("não importa módulo de I/O nem server-only", () => {
    const source = readFileSync(path.resolve(__dirname, "../integration-alert.ts"), "utf8");
    const imports = [...source.matchAll(/^import .* from "(.+)";?$/gm)].map((m) => m[1]);
    expect(imports.every((specifier) => specifier === "./pilot-metrics")).toBe(true);
  });
});
