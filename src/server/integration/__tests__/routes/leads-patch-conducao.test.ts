import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { integrationRefusals, leads, tenantApiKeys, tenants } from "../../../../db/schema";
import { PATCH } from "../../../../../app/api/v1/leads/[id]/route";

// lote-14 — SILENCIO-01 AC9 (T10): lead com a marca de condução humana recusa
// `status` e `meetingAt` pelo contrato; patch só de qualificação segue aceito.
describe("routes: PATCH /api/v1/leads/[id] — lead conduzido por humano", () => {
  let tenantId: string;
  let apiKey: string;

  beforeAll(async () => {
    tenantId = randomUUID();
    await db.insert(tenants).values({
      id: tenantId,
      name: `Tenant Teste leads-patch-conducao ${tenantId}`,
      agentName: "Agente",
      supportedModality: "ambos",
      slug: `fixture-${tenantId}`,
    });
    apiKey = `test-key-${randomUUID()}`;
    await db.insert(tenantApiKeys).values({
      tenantId,
      label: "leads-patch-conducao.test.ts",
      keyHash: createHash("sha256").update(apiKey).digest("hex"),
    });
  });

  afterAll(async () => {
    await db.delete(integrationRefusals).where(eq(integrationRefusals.tenantId, tenantId));
    await db.delete(leads).where(eq(leads.tenantId, tenantId));
    await db.delete(tenantApiKeys).where(eq(tenantApiKeys.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.$client.end();
  });

  async function createLead(extra: Partial<typeof leads.$inferInsert> = {}): Promise<string> {
    const id = randomUUID();
    await db.insert(leads).values({
      id,
      tenantId,
      name: "Lead Teste Condução",
      phone: "+55 34 90000-0000",
      status: "em_qualificacao",
      firstContactAt: new Date("2026-08-01T00:00:00.000Z"),
      humanTakeoverAt: new Date("2026-09-30T12:00:00.000Z"),
      ...extra,
    });
    return id;
  }

  async function rowOf(leadId: string) {
    const rows = await db.select().from(leads).where(eq(leads.id, leadId));
    return rows[0];
  }

  function callPatch(leadId: string, body: unknown) {
    const request = new Request(`http://local/api/v1/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    return PATCH(request, { params: Promise.resolve({ id: leadId }) });
  }

  it("marca + status: 409 lead-conduzido-por-humano, sem gravar nenhum campo do patch (antes/depois)", async () => {
    const leadId = await createLead();
    const before = await rowOf(leadId);

    const response = await callPatch(leadId, {
      status: "qualificado_agendado",
      region: "Região que não pode ser gravada",
      executiveSummary: "Resumo que não pode ser gravado",
    });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("lead-conduzido-por-humano");
    expect(await rowOf(leadId)).toEqual(before);
  });

  it("marca + meetingAt sem status: 409, sem gravar reunião nem responsável (antes/depois)", async () => {
    const leadId = await createLead();
    const before = await rowOf(leadId);

    const response = await callPatch(leadId, {
      meetingAt: "2026-10-05T14:00:00.000Z",
      region: "Região que não pode ser gravada",
    });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("lead-conduzido-por-humano");
    const after = await rowOf(leadId);
    expect(after).toEqual(before);
    expect(after.meetingAt).toBeNull();
  });

  it("marca + patch só de qualificação: 200 e gravado (SILENCIO-01 AC9)", async () => {
    const leadId = await createLead();

    const response = await callPatch(leadId, {
      region: "Centro",
      executiveSummary: "Qualificado durante a condução humana.",
    });

    expect(response.status).toBe(200);
    const after = await rowOf(leadId);
    expect(after.region).toBe("Centro");
    expect(after.executiveSummary).toBe("Qualificado durante a condução humana.");
    expect(after.status).toBe("em_qualificacao");
    expect(after.humanTakeoverAt).toEqual(new Date("2026-09-30T12:00:00.000Z"));
  });

  it("a recusa aparece em integration_refusals com o código novo (AD-023)", async () => {
    const leadId = await createLead();
    await callPatch(leadId, { status: "escalado_humano", escalationReason: "x" });

    const rows = await db
      .select()
      .from(integrationRefusals)
      .where(eq(integrationRefusals.tenantId, tenantId));
    const row = rows.find((r) => r.code === "lead-conduzido-por-humano");
    expect(row).toBeDefined();
    expect(row!.status).toBe(409);
    expect(row!.method).toBe("PATCH");
  });

  it("marca e trava humana ao mesmo tempo: responde lead-conduzido-por-humano (L-041)", async () => {
    const leadId = await createLead({ statusChangedBy: "humano" });

    const response = await callPatch(leadId, { status: "qualificado_agendado" });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("lead-conduzido-por-humano");
  });

  it("transição inválida com marca continua transicao-invalida", async () => {
    const leadId = await createLead({ status: "qualificado_agendado" });

    const response = await callPatch(leadId, { status: "em_qualificacao" });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("transicao-invalida");
  });

  it("sem marca, a trava humana segue respondendo lead-travado-por-humano", async () => {
    const leadId = await createLead({ humanTakeoverAt: null, statusChangedBy: "humano" });

    const response = await callPatch(leadId, { status: "qualificado_agendado" });

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("lead-travado-por-humano");
  });
});
