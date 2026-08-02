import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../index";
import {
  brokers,
  conversations,
  documentCategories,
  documents,
  leads,
  messages,
  tenants,
} from "../schema";
import { runSeed } from "../seed";

const LEAD_STATUSES = [
  "em_qualificacao",
  "qualificado_agendado",
  "escalado_humano",
] as const;

async function snapshotIds() {
  const [t, b, cat, l, c, m, d] = await Promise.all([
    db.select({ id: tenants.id }).from(tenants),
    db.select({ id: brokers.id }).from(brokers),
    db.select({ id: documentCategories.id }).from(documentCategories),
    db.select({ id: leads.id }).from(leads),
    db.select({ id: conversations.id }).from(conversations),
    db.select({ id: messages.id }).from(messages),
    db.select({ id: documents.id }).from(documents),
  ]);
  const sortIds = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
  return {
    tenants: sortIds(t),
    brokers: sortIds(b),
    documentCategories: sortIds(cat),
    leads: sortIds(l),
    conversations: sortIds(c),
    messages: sortIds(m),
    documents: sortIds(d),
  };
}

describe("db/seed", () => {
  beforeAll(async () => {
    await runSeed();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("popula 2 tenants, cada um com corretores, leads (20-30), conversas 1:1, mensagens e documentos (AC 1.2)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);

    for (const tenant of allTenants) {
      const tenantBrokers = await db
        .select()
        .from(brokers)
        .where(eq(brokers.tenantId, tenant.id));
      const tenantLeads = await db
        .select()
        .from(leads)
        .where(eq(leads.tenantId, tenant.id));
      const tenantConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.tenantId, tenant.id));
      const tenantMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.tenantId, tenant.id));
      const tenantDocuments = await db
        .select()
        .from(documents)
        .where(eq(documents.tenantId, tenant.id));

      expect(tenantBrokers.length).toBeGreaterThan(0);
      expect(tenantLeads.length).toBeGreaterThanOrEqual(20);
      expect(tenantLeads.length).toBeLessThanOrEqual(30);
      expect(tenantConversations).toHaveLength(tenantLeads.length);
      expect(tenantMessages.length).toBeGreaterThan(0);
      expect(tenantDocuments.length).toBeGreaterThan(0);
    }
  });

  it("distribui leads pelos 3 status do pipeline em cada tenant (AC 1.2)", async () => {
    const allTenants = await db.select().from(tenants);
    for (const tenant of allTenants) {
      for (const status of LEAD_STATUSES) {
        const rows = await db
          .select()
          .from(leads)
          .where(and(eq(leads.tenantId, tenant.id), eq(leads.status, status)));
        expect(rows.length).toBeGreaterThan(0);
      }
    }
  });

  it("leads qualificado_agendado têm todos os campos de qualificação do PRD §6.4 e resumo executivo preenchidos (AC 1.4)", async () => {
    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.status, "qualificado_agendado"));
    expect(rows.length).toBeGreaterThan(0);

    for (const lead of rows) {
      expect(lead.modality).not.toBeNull();
      expect(lead.region).not.toBeNull();
      expect(lead.budgetCents).not.toBeNull();
      expect(lead.propertyType).not.toBeNull();
      expect(lead.purchaseHorizon).not.toBeNull();
      expect(lead.motivation).not.toBeNull();
      expect(lead.creditStatus).not.toBeNull();
      expect(lead.chainedOperation).not.toBeNull();
      expect(lead.executiveSummary).toBeTruthy();
    }
  });

  it("leads escalado_humano têm motivo de escalonamento preenchido (AC 1.5)", async () => {
    const rows = await db
      .select()
      .from(leads)
      .where(eq(leads.status, "escalado_humano"));
    expect(rows.length).toBeGreaterThan(0);

    for (const lead of rows) {
      expect(lead.escalationReason).toBeTruthy();
    }
  });

  it("rodar o seed novamente mantém o banco no mesmo estado — contagens e IDs idênticos (AC 1.3 — idempotência)", async () => {
    const before = await snapshotIds();
    await runSeed();
    const after = await snapshotIds();
    expect(after).toEqual(before);
  });

  it("popula 2-3 categorias de documentos por tenant, incluindo um nome repetido entre tenants (lote-2 — CONF-01/02)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);

    const categoriesByTenant = new Map<string, string[]>();
    for (const tenant of allTenants) {
      const rows = await db
        .select()
        .from(documentCategories)
        .where(eq(documentCategories.tenantId, tenant.id));
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.length).toBeLessThanOrEqual(3);
      categoriesByTenant.set(
        tenant.id,
        rows.map((r) => r.name)
      );
    }

    const [tenantA, tenantB] = allTenants;
    const namesA = categoriesByTenant.get(tenantA.id)!;
    const namesB = categoriesByTenant.get(tenantB.id)!;
    const repeatedNames = namesA.filter((name) => namesB.includes(name));
    expect(repeatedNames.length).toBeGreaterThan(0);
  });

  it("documentos existem tanto com quanto sem categoria atribuída (lote-2 — DOC-04)", async () => {
    const allDocuments = await db.select().from(documents);
    expect(allDocuments.length).toBeGreaterThan(0);

    const withCategory = allDocuments.filter((d) => d.categoryId !== null);
    const withoutCategory = allDocuments.filter((d) => d.categoryId === null);
    expect(withCategory.length).toBeGreaterThan(0);
    expect(withoutCategory.length).toBeGreaterThan(0);
  });

  it("rejeita valor fora do enum lead_status na escrita (AC 1.6)", async () => {
    const [tenant] = await db.select().from(tenants).limit(1);
    expect(tenant).toBeDefined();

    await expect(
      db.execute(sql`
        insert into leads (tenant_id, name, phone, status, first_contact_at)
        values (${tenant.id}, 'Teste Enum Invalido', '+55 34 90000-0000', 'status_invalido', now())
      `)
    ).rejects.toThrow();
  });
});
