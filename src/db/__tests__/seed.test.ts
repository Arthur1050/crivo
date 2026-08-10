import "dotenv/config";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../index";
import {
  brokers,
  conversations,
  documentCategories,
  documents,
  leads,
  messages,
  tenantApiKeys,
  tenants,
} from "../schema";
import { runSeed } from "../seed";

const LEAD_STATUSES = [
  "em_qualificacao",
  "qualificado_agendado",
  "escalado_humano",
] as const;

// 1:1 com o enum `category_color` do schema (paleta fixa Token da Astryx).
const CATEGORY_COLOR_PALETTE = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "cyan",
  "blue",
  "purple",
  "pink",
  "gray",
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

  it("toda categoria semeada tem uma cor da paleta fixa (lote-3 — CAT-01)", async () => {
    const allCategories = await db.select().from(documentCategories);
    expect(allCategories.length).toBeGreaterThan(0);

    for (const category of allCategories) {
      expect(CATEGORY_COLOR_PALETTE).toContain(category.color);
    }
  });

  it("cada tenant tem ≥2 cores distintas entre suas categorias, incluindo pelo menos uma 'gray' (lote-3 — CAT-01 fixture)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);

    for (const tenant of allTenants) {
      const rows = await db
        .select()
        .from(documentCategories)
        .where(eq(documentCategories.tenantId, tenant.id));
      expect(rows.length).toBeGreaterThan(0);

      const distinctColors = new Set(rows.map((r) => r.color));
      expect(distinctColors.size).toBeGreaterThanOrEqual(2);
      expect(distinctColors.has("gray")).toBe(true);
    }
  });

  it("rodar o seed novamente mantém as mesmas cores de categoria (idempotência de cor)", async () => {
    const before = await db
      .select({ id: documentCategories.id, color: documentCategories.color })
      .from(documentCategories);
    await runSeed();
    const after = await db
      .select({ id: documentCategories.id, color: documentCategories.color })
      .from(documentCategories);

    const beforeById = new Map(before.map((r) => [r.id, r.color]));
    for (const row of after) {
      expect(row.color).toBe(beforeById.get(row.id));
    }
  });

  it("documentos existem tanto com quanto sem categoria atribuída (lote-2 — DOC-04)", async () => {
    const allDocuments = await db.select().from(documents);
    expect(allDocuments.length).toBeGreaterThan(0);

    const withCategory = allDocuments.filter((d) => d.categoryId !== null);
    const withoutCategory = allDocuments.filter((d) => d.categoryId === null);
    expect(withCategory.length).toBeGreaterThan(0);
    expect(withoutCategory.length).toBeGreaterThan(0);
  });

  it("ambos os tenants têm baseline pré-piloto preenchido, com valores distintos entre si (lote-4 — DASH-05.4)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);

    for (const tenant of allTenants) {
      expect(tenant.baselineLeadsPerMonth).not.toBeNull();
      expect(tenant.baselineFirstResponseMinutes).not.toBeNull();
      expect(tenant.baselineLeadToMeetingPct).not.toBeNull();
    }

    const [tenantA, tenantB] = allTenants;
    const sameOnAllThree =
      tenantA.baselineLeadsPerMonth === tenantB.baselineLeadsPerMonth &&
      tenantA.baselineFirstResponseMinutes ===
        tenantB.baselineFirstResponseMinutes &&
      tenantA.baselineLeadToMeetingPct === tenantB.baselineLeadToMeetingPct;
    expect(sameOnAllThree).toBe(false);
  });

  it("ambos os tenants têm as 5 colunas de identidade preenchidas (redesign — RD-01 AC6)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);

    for (const tenant of allTenants) {
      expect(tenant.city).toBeTruthy();
      expect(tenant.state).toBeTruthy();
      expect(tenant.agentWhatsapp).toBeTruthy();
      expect(tenant.website).toBeTruthy();
      expect(tenant.agentPresentationMessage).toBeTruthy();
    }
  });

  it("os 2 tenants têm identidade distinta entre si, para que trocar de tenant seja visível no shell (redesign — RD-01 AC6)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);
    const [tenantA, tenantB] = allTenants;

    // `state` pode legitimamente repetir (os 2 pilotos são de MG — AD-001):
    // o par cidade/UF é o que precisa distinguir os tenants no subtítulo do
    // header da sidebar (design.md — R0).
    expect(`${tenantA.city}/${tenantA.state}`).not.toBe(
      `${tenantB.city}/${tenantB.state}`
    );
    expect(tenantA.agentWhatsapp).not.toBe(tenantB.agentWhatsapp);
    expect(tenantA.website).not.toBe(tenantB.website);
    expect(tenantA.agentPresentationMessage).not.toBe(
      tenantB.agentPresentationMessage
    );
  });

  it("cada tenant tem leads com firstContactAt nas janelas de 7, 30 e 90 dias relativas a agora (lote-4 — datas espalhadas)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);

    const now = Date.now();
    const DAY = 86400000;

    for (const tenant of allTenants) {
      const tenantLeads = await db
        .select()
        .from(leads)
        .where(eq(leads.tenantId, tenant.id));
      expect(tenantLeads.length).toBeGreaterThan(0);

      const ageDays = tenantLeads.map(
        (l) => (now - l.firstContactAt.getTime()) / DAY
      );

      expect(ageDays.some((age) => age >= 0 && age <= 7)).toBe(true);
      expect(ageDays.some((age) => age > 7 && age <= 30)).toBe(true);
      expect(ageDays.some((age) => age > 30 && age <= 90)).toBe(true);
    }
  });

  it("firstResponseAt nunca é anterior a firstContactAt quando preenchido (lote-4 — coerência temporal)", async () => {
    const allLeads = await db.select().from(leads);
    expect(allLeads.length).toBeGreaterThan(0);

    for (const lead of allLeads) {
      if (lead.firstResponseAt !== null) {
        expect(lead.firstResponseAt.getTime()).toBeGreaterThanOrEqual(
          lead.firstContactAt.getTime()
        );
      }
    }
  });

  it("meetingAt só é preenchido em leads qualificado_agendado (lote-4 — coerência temporal)", async () => {
    const allLeads = await db.select().from(leads);
    expect(allLeads.length).toBeGreaterThan(0);

    for (const lead of allLeads) {
      if (lead.status === "qualificado_agendado") {
        expect(lead.meetingAt).not.toBeNull();
      } else {
        expect(lead.meetingAt).toBeNull();
      }
    }
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

  it("gera exatamente 1 chave de API por tenant; o hash gravado no banco corresponde ao valor em claro devolvido, e nunca é igual a ele (lote-5 — T1, INT-01 fundação)", async () => {
    // Roda o próprio runSeed() aqui (em vez de reusar o `seededApiKeys` do
    // beforeAll) porque outros testes deste arquivo chamam runSeed()
    // novamente (idempotência) — e uma chave de API é regenerada a cada
    // execução (não determinística como os demais IDs do seed). Autocontido:
    // o par (chave em claro, hash) verificado é sempre o da execução mais
    // recente, não importa a ordem dos testes.
    const { apiKeys } = await runSeed();
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);
    expect(apiKeys).toHaveLength(2);

    for (const tenant of allTenants) {
      const seeded = apiKeys.find((k) => k.tenantId === tenant.id);
      expect(seeded).toBeDefined();

      const rows = await db
        .select()
        .from(tenantApiKeys)
        .where(eq(tenantApiKeys.tenantId, tenant.id));
      expect(rows).toHaveLength(1);

      const expectedHash = createHash("sha256")
        .update(seeded!.key)
        .digest("hex");
      expect(rows[0].keyHash).toBe(expectedHash);
      expect(rows[0].keyHash).not.toBe(seeded!.key);
      expect(rows[0].revokedAt).toBeNull();
    }
  });

  // lote-6b — PER-01 AC7: a demonstração do CRM não pode contradizer o
  // agente real, que agora nunca se anuncia como automatizado por
  // iniciativa própria (AD-016).
  it("nenhuma mensagem semeada (apresentação ou conversas) contém 'assistente virtual'/'agente virtual'/'robô' (lote-6b — PER-01 AC7)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);

    const banned = ["assistente virtual", "agente virtual", "robô"];

    for (const tenant of allTenants) {
      expect(tenant.agentPresentationMessage).toBeTruthy();
      for (const term of banned) {
        expect(tenant.agentPresentationMessage!.toLowerCase()).not.toContain(term);
      }
    }

    const allMessages = await db.select().from(messages);
    expect(allMessages.length).toBeGreaterThan(0);
    for (const message of allMessages) {
      for (const term of banned) {
        expect(message.content.toLowerCase()).not.toContain(term);
      }
    }
  });

  // lote-6b — PER-03: campo de tom de voz por tenant, semeado e distinto.
  it("ambos os tenants têm agentVoiceTone semeado e distinto entre si (lote-6b — PER-03)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);
    const [tenantA, tenantB] = allTenants;

    expect(tenantA.agentVoiceTone).toBeTruthy();
    expect(tenantB.agentVoiceTone).toBeTruthy();
    expect(tenantA.agentVoiceTone).not.toBe(tenantB.agentVoiceTone);
  });

  it("cada tenant tem pelo menos 1 documento expirado (expiresAt <= agora) após o seed (lote-5 — T1, LGPD-02 fundação)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(2);

    for (const tenant of allTenants) {
      const expired = await db
        .select()
        .from(documents)
        .where(
          and(eq(documents.tenantId, tenant.id), lte(documents.expiresAt, new Date()))
        );
      expect(expired.length).toBeGreaterThanOrEqual(1);
    }
  });
});
