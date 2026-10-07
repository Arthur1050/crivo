import "server-only";
import { and, count, eq, gte, inArray, max } from "drizzle-orm";
import { db } from "../../db";
import { integrationRefusals, messages, tenants } from "../../db/schema";
import type { IntegrationHealthState, TenantHealthSnapshot } from "../../lib/integration-alert";

/**
 * Estado de saúde de todos os tenants para o alerta diário (lote-15, AD-039).
 *
 * Reproduz em lote os filtros de `getLastAgentMessageAt` (mensagens
 * `sender = 'agente'`) e `getIntegrationRefusalsSince` (recusas do tenant MAIS
 * as sem tenant, `occurredAt >= since`) com três consultas agrupadas, nunca
 * uma por tenant: a manutenção percorre todos os tenants do banco.
 */
export async function getTenantHealthSnapshots(since: Date): Promise<TenantHealthSnapshot[]> {
  const tenantRows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      state: tenants.integrationHealthState,
      changedAt: tenants.integrationHealthChangedAt,
    })
    .from(tenants)
    .orderBy(tenants.name, tenants.slug);

  const lastMessageRows = await db
    .select({ tenantId: messages.tenantId, lastSentAt: max(messages.sentAt) })
    .from(messages)
    .where(eq(messages.sender, "agente"))
    .groupBy(messages.tenantId);

  const refusalRows = await db
    .select({
      tenantId: integrationRefusals.tenantId,
      code: integrationRefusals.code,
      route: integrationRefusals.route,
      count: count(),
    })
    .from(integrationRefusals)
    .where(gte(integrationRefusals.occurredAt, since))
    .groupBy(integrationRefusals.tenantId, integrationRefusals.code, integrationRefusals.route);

  const lastMessageByTenant = new Map(lastMessageRows.map((row) => [row.tenantId, row.lastSentAt]));
  const tenantlessRefusals = refusalRows
    .filter((row) => row.tenantId === null)
    .map(({ code, route, count: total }) => ({ code, route, count: total }));

  return tenantRows.map((tenant) => ({
    tenantId: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    storedState: tenant.state,
    storedChangedAt: tenant.changedAt,
    lastAgentMessageAt: lastMessageByTenant.get(tenant.id) ?? null,
    refusals: [
      ...refusalRows
        .filter((row) => row.tenantId === tenant.id)
        .map(({ code, route, count: total }) => ({ code, route, count: total })),
      ...tenantlessRefusals,
    ],
  }));
}

/** Grava estado e instante em tenants já conhecidos: inicialização e recuperação. */
export async function recordTenantHealthStates(
  rows: { tenantId: string; state: IntegrationHealthState; at: Date }[]
): Promise<void> {
  const groups = new Map<string, { state: IntegrationHealthState; at: Date; ids: string[] }>();
  for (const row of rows) {
    const key = `${row.state}|${row.at.getTime()}`;
    const group = groups.get(key) ?? { state: row.state, at: row.at, ids: [] };
    group.ids.push(row.tenantId);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    await db
      .update(tenants)
      .set({ integrationHealthState: group.state, integrationHealthChangedAt: group.at })
      .where(inArray(tenants.id, group.ids));
  }
}

export interface ClaimedProblem {
  tenantId: string;
  previousChangedAt: Date | null;
  claimedAt: Date;
}

/**
 * Reivindica a queda por compare-and-set (ALERTA-01 AC7): só devolve os
 * tenants que ainda estavam `saudavel` no instante da trava de linha. Uma
 * segunda execução que chegue junto espera a trava, relê o estado já
 * `problema` e não devolve o tenant — quem não reivindica não envia.
 */
export async function claimIntegrationProblems(
  tenantIds: string[],
  at: Date
): Promise<ClaimedProblem[]> {
  if (tenantIds.length === 0) return [];
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: tenants.id, changedAt: tenants.integrationHealthChangedAt })
      .from(tenants)
      .where(and(inArray(tenants.id, tenantIds), eq(tenants.integrationHealthState, "saudavel")))
      .for("update");
    if (locked.length === 0) return [];
    await tx
      .update(tenants)
      .set({ integrationHealthState: "problema", integrationHealthChangedAt: at })
      .where(and(inArray(tenants.id, locked.map((row) => row.id)), eq(tenants.integrationHealthState, "saudavel")));
    return locked.map((row) => ({ tenantId: row.id, previousChangedAt: row.changedAt, claimedAt: at }));
  });
}

/**
 * Devolve `saudavel` e o instante anterior aos tenants reivindicados quando o
 * envio não aconteceu, para a próxima execução tentar de novo. Só desfaz o que
 * a própria reivindicação gravou: se o estado ou o instante já mudaram, deixa.
 */
export async function releaseIntegrationProblems(claimed: ClaimedProblem[]): Promise<void> {
  for (const claim of claimed) {
    await db
      .update(tenants)
      .set({ integrationHealthState: "saudavel", integrationHealthChangedAt: claim.previousChangedAt })
      .where(
        and(
          eq(tenants.id, claim.tenantId),
          eq(tenants.integrationHealthState, "problema"),
          eq(tenants.integrationHealthChangedAt, claim.claimedAt)
        )
      );
  }
}
