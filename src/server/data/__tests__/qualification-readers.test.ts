import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it } from "vitest";
import { db } from "../../../db";
import { leads, tenants } from "../../../db/schema";
import * as realEstateReaders from "../../../kit/lead-data";
import { LEAD_STATUS } from "../../../lib/vocabulary";
import { testVertical } from "../../../vertical-kit/__tests__/fixture-vertical";
import { createIntegrationKit } from "../../integration/kit";
import { getLeads, getRecentLeads, serviceScope } from "../index";

const tenantId = randomUUID();
const leadId = randomUUID();
const scope = serviceScope(tenantId);
const facts = {
  modality: "usado", region: "Zona Norte", budgetCents: 67890123n, propertyType: "apartamento",
  purchaseHorizon: "seis meses", motivation: "investidor", creditStatus: "fgts", chainedOperation: false,
} as const;

beforeAll(async () => {
  await db.insert(tenants).values({
    id: tenantId, name: "Tenant de teste", agentName: "Agente", supportedModality: "ambos", slug: `fixture-${tenantId}`,
  });
  await db.insert(leads).values({
    ...facts, id: leadId, tenantId, name: "Pessoa", phone: "123",
    status: LEAD_STATUS.engaged, firstContactAt: new Date(),
  });
});

afterAll(async () => {
  await db.delete(leads).where(eq(leads.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.$client.end();
});

it("lê e atualiza o lead sem faceta e mantém as colunas para o vertical imobiliário", async () => {
  const kit = createIntegrationKit(testVertical);
  const parsed = kit.parseLeadPatch({ status: LEAD_STATUS.goal_reached });
  if (!parsed.ok) throw new Error(parsed.detail);
  expect(await kit.applyLeadPatch(tenantId, leadId, parsed.dto)).toMatchObject({ ok: true });

  const [pipeline] = await getLeads(scope);
  const [recent] = await getRecentLeads(scope);
  for (const row of [pipeline, recent]) {
    expect(row).toMatchObject({ id: leadId, status: LEAD_STATUS.goal_reached });
    for (const key of Object.keys(facts)) expect(row).not.toHaveProperty(key);
  }
  expect(await realEstateReaders.getLeads(scope)).toMatchObject([{ id: leadId, ...facts }]);
  expect(await realEstateReaders.getRecentLeads(scope)).toMatchObject([{
    id: leadId, budgetCents: facts.budgetCents, modality: facts.modality,
  }]);
});
