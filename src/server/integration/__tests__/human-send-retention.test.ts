import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../db";
import { humanMessageSends, leads, tenants } from "../../../db/schema";
import { purgeHumanSendReservations } from "../lgpd";

/**
 * Retenção das reservas de envio humano (lote-14, T20 — ENVIO-01; design.md
 * Data Models): a rotina diária apaga as reservas com 30 dias ou mais.
 * Fronteira exata (L-023) nos dois tenants.
 */

const NOW = new Date("2026-10-01T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

describe("purgeHumanSendReservations (lote-14, T20)", () => {
  const tenantIds = [randomUUID(), randomUUID()];
  const leadIds: Record<string, string> = {};

  beforeAll(async () => {
    await db.insert(tenants).values(
      tenantIds.map((id) => ({
        id,
        name: `Tenant retenção T20 ${id}`,
        agentName: "Agente",
        supportedModality: "ambos" as const,
        slug: `fixture-t20-${id}`,
      }))
    );
    for (const tenantId of tenantIds) {
      const [lead] = await db
        .insert(leads)
        .values({
          tenantId,
          name: "Lead retenção",
          phone: "+55 34 99999-0000",
          status: "em_qualificacao",
          firstContactAt: NOW,
        })
        .returning({ id: leads.id });
      leadIds[tenantId] = lead.id;
    }
  });

  afterAll(async () => {
    await db.delete(humanMessageSends).where(inArray(humanMessageSends.tenantId, tenantIds));
    await db.delete(leads).where(inArray(leads.tenantId, tenantIds));
    await db.delete(tenants).where(inArray(tenants.id, tenantIds));
    await db.$client.end();
  });

  async function reserve(tenantId: string, createdAt: Date): Promise<string> {
    const [row] = await db
      .insert(humanMessageSends)
      .values({
        tenantId,
        leadId: leadIds[tenantId],
        requestId: randomUUID(),
        state: "falhou",
        failure: "falha-meta",
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: humanMessageSends.id });
    return row.id;
  }

  async function exists(id: string): Promise<boolean> {
    const rows = await db
      .select({ id: humanMessageSends.id })
      .from(humanMessageSends)
      .where(eq(humanMessageSends.id, id));
    return rows.length === 1;
  }

  it("reserva com exatamente 30 dias é apagada e com 29 dias e 23 h permanece, nos dois tenants", async () => {
    const exactly30 = Object.fromEntries(
      await Promise.all(tenantIds.map(async (t) => [t, await reserve(t, new Date(NOW.getTime() - 30 * DAY))]))
    ) as Record<string, string>;
    const almost30 = Object.fromEntries(
      await Promise.all(
        tenantIds.map(async (t) => [t, await reserve(t, new Date(NOW.getTime() - 30 * DAY + HOUR))])
      )
    ) as Record<string, string>;

    const result = await purgeHumanSendReservations(NOW);

    expect(result.deleted).toBeGreaterThanOrEqual(2);
    for (const tenantId of tenantIds) {
      expect(await exists(exactly30[tenantId])).toBe(false);
      expect(await exists(almost30[tenantId])).toBe(true);
    }
  });
});
