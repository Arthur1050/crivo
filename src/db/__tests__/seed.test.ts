import "dotenv/config";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import {
  conversations,
  documentCategories,
  documents,
  leads,
  messages,
  properties,
  serviceApiKeys,
  tenant_members,
  tenantApiKeys,
  tenants,
  users,
  accounts,
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

// lote-7 — REAL-01: só `crivo-demo` recebe o dataset fictício de lead. Os
// dois tenants-piloto operam só com dado real a partir daqui.
const DEMO_SLUG = "crivo-demo";
const PILOT_SLUGS = ["triangulo", "vale-uberaba"] as const;

async function snapshotIds() {
  const [t, u, b, cat, l, c, m, d, p] = await Promise.all([
    db.select({ id: tenants.id }).from(tenants),
    db.select({ id: users.id }).from(users),
    db.select({ id: tenant_members.id }).from(tenant_members),
    db.select({ id: documentCategories.id }).from(documentCategories),
    db.select({ id: leads.id }).from(leads),
    db.select({ id: conversations.id }).from(conversations),
    db.select({ id: messages.id }).from(messages),
    db.select({ id: documents.id }).from(documents),
    db.select({ id: properties.id }).from(properties),
  ]);
  const sortIds = (rows: { id: string }[]) => rows.map((r) => r.id).sort();
  return {
    tenants: sortIds(t),
    users: sortIds(u),
    tenantMembers: sortIds(b),
    documentCategories: sortIds(cat),
    leads: sortIds(l),
    conversations: sortIds(c),
    messages: sortIds(m),
    documents: sortIds(d),
    properties: sortIds(p),
  };
}

/** Papéis de um vínculo, no formato nativo do plugin (separados por vírgula). */
function rolesOf(row: { role: string }): string[] {
  return row.role.split(",").map((r) => r.trim());
}

/** Minutos desde a meia-noite de um horário "HH:MM". */
function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Busca um tenant por slug e falha alto se ele não existir — nenhum teste
 * deste arquivo deve silenciosamente pular asserção por tenant ausente. */
async function tenantBySlug(slug: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
  expect(tenant, `tenant de slug '${slug}' deveria existir`).toBeDefined();
  return tenant;
}

describe("db/seed", () => {
  beforeAll(async () => {
    await runSeed();
  });

  afterAll(async () => {
    await db.$client.end();
  });

  it("cria exatamente 3 tenants, com slug preenchido nos três (lote-7 — REAL-01 AC1/AC6)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

    const slugs = allTenants.map((t) => t.slug).sort();
    expect(slugs).toEqual(["crivo-demo", "triangulo", "vale-uberaba"]);
  });

  it("só o tenant Crivo Demo tem lead/conversa/mensagem; os dois pilotos têm exatamente 0 de cada (lote-7 — REAL-01 AC1)", async () => {
    const demo = await tenantBySlug(DEMO_SLUG);

    const demoLeads = await db.select().from(leads).where(eq(leads.tenantId, demo.id));
    const demoConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.tenantId, demo.id));
    const demoMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.tenantId, demo.id));
    expect(demoLeads.length).toBeGreaterThan(0);
    expect(demoConversations.length).toBeGreaterThan(0);
    expect(demoMessages.length).toBeGreaterThan(0);

    for (const slug of PILOT_SLUGS) {
      const pilot = await tenantBySlug(slug);
      const pilotLeads = await db.select().from(leads).where(eq(leads.tenantId, pilot.id));
      const pilotConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.tenantId, pilot.id));
      const pilotMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.tenantId, pilot.id));
      expect(pilotLeads).toHaveLength(0);
      expect(pilotConversations).toHaveLength(0);
      expect(pilotMessages).toHaveLength(0);
    }
  });

  it("os dois tenants-piloto mantêm corretores, categorias e chave de API sem documentos sintéticos (lote-12)", async () => {
    for (const slug of PILOT_SLUGS) {
      const pilot = await tenantBySlug(slug);

      // lote-8 (AD-021): corretor é usuário vinculado à imobiliária, não mais
      // linha de `brokers` (tabela removida). Mesma asserção, nova origem.
      const pilotBrokers = await db
        .select()
        .from(tenant_members)
        .where(eq(tenant_members.organizationId, pilot.id));
      const pilotCategories = await db
        .select()
        .from(documentCategories)
        .where(eq(documentCategories.tenantId, pilot.id));
      const pilotApiKeys = await db
        .select()
        .from(tenantApiKeys)
        .where(eq(tenantApiKeys.tenantId, pilot.id));

      expect(pilotBrokers.length).toBeGreaterThan(0);
      expect(pilotCategories.length).toBeGreaterThan(0);
      expect(await db.select().from(documents).where(eq(documents.tenantId, pilot.id))).toEqual([]);
      expect(pilotApiKeys).toHaveLength(1);
    }
  });

  // lote-8 — SEED-01 AC1: o seed é o único caminho por onde corretor passa a
  // existir depois que `brokers` saiu do schema.
  it("cada imobiliária ganha ao menos 1 administrador, 1 gestor e 2 corretores (lote-8 — SEED-01 AC1)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

    for (const tenant of allTenants) {
      const members = await db
        .select()
        .from(tenant_members)
        .where(eq(tenant_members.organizationId, tenant.id));

      const administradores = members.filter((m) =>
        rolesOf(m).includes("administrador")
      );
      const gestores = members.filter((m) => rolesOf(m).includes("gestor"));
      const corretores = members.filter((m) => rolesOf(m).includes("corretor"));

      expect(administradores.length).toBeGreaterThanOrEqual(1);
      expect(gestores.length).toBeGreaterThanOrEqual(1);
      expect(corretores.length).toBeGreaterThanOrEqual(2);
    }
  });

  // lote-8 — SEED-01 AC3/AC4: nascem sem credencial (convite pendente), o que
  // não os impede de receber lead e reunião.
  it("todo usuário criado pelo seed nasce em convite pendente — sem linha em accounts (lote-8 — SEED-01 AC3)", async () => {
    const seededUserIds = (
      await db.select({ userId: tenant_members.userId }).from(tenant_members)
    ).map((row) => row.userId);
    expect(seededUserIds.length).toBeGreaterThanOrEqual(15);

    const credentials = await db
      .select()
      .from(accounts)
      .where(inArray(accounts.userId, seededUserIds));
    expect(credentials).toHaveLength(0);

    // AC4: o corretor em convite pendente segue recebendo lead normalmente —
    // os leads agendados do seed estão atribuídos justamente a eles.
    const assigned = await db
      .select({ assignedUserId: leads.assignedUserId })
      .from(leads)
      .where(inArray(leads.assignedUserId, seededUserIds));
    expect(assigned.length).toBeGreaterThan(0);
  });

  // lote-8 — SEED-01 AC2: insumo obrigatório dos testes de atribuição por
  // agenda. Sem uma faixa coberta por um único corretor, "quem atende às 9h"
  // não teria resposta única.
  it("os corretores de cada imobiliária têm janelas distintas, com ao menos um horário coberto por apenas um deles (lote-8 — SEED-01 AC2)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

    for (const tenant of allTenants) {
      const corretores = (
        await db
          .select()
          .from(tenant_members)
          .where(eq(tenant_members.organizationId, tenant.id))
      ).filter((m) => rolesOf(m).includes("corretor"));
      expect(corretores.length).toBeGreaterThanOrEqual(2);

      // Toda janela declarada e válida (fim posterior ao início, ao menos um
      // dia) — sem isso o corretor seria indisponível sempre (AGENDA-01 AC5).
      for (const c of corretores) {
        expect(c.workDays).not.toBeNull();
        expect(c.workDays!.length).toBeGreaterThanOrEqual(1);
        expect(c.workHoursStart).toBeTruthy();
        expect(c.workHoursEnd).toBeTruthy();
        expect(minutesOf(c.workHoursEnd!)).toBeGreaterThan(
          minutesOf(c.workHoursStart!)
        );
      }

      const janelas = corretores.map(
        (c) => `${c.workDays!.join("-")}|${c.workHoursStart}|${c.workHoursEnd}`
      );
      expect(new Set(janelas).size).toBeGreaterThanOrEqual(2);

      // Existe ao menos um par (dia, minuto) coberto por EXATAMENTE um deles.
      const coberturaUnica: string[] = [];
      for (const dia of [1, 2, 3, 4, 5, 6, 7]) {
        for (let minuto = 0; minuto < 24 * 60; minuto += 30) {
          const cobrem = corretores.filter(
            (c) =>
              c.workDays!.includes(dia) &&
              minuto >= minutesOf(c.workHoursStart!) &&
              minuto < minutesOf(c.workHoursEnd!)
          );
          if (cobrem.length === 1) coberturaUnica.push(`${dia}:${minuto}`);
        }
      }
      expect(coberturaUnica.length).toBeGreaterThan(0);
    }
  });

  // lote-8 — SEED-01 AC7 / AD-022: o lead só ganha dono no agendamento.
  it("leads do seed nascem sem responsável, exceto os que já têm reunião agendada (lote-8 — SEED-01 AC7)", async () => {
    const allLeads = await db.select().from(leads);
    expect(allLeads.length).toBeGreaterThan(0);

    for (const lead of allLeads) {
      if (lead.meetingAt === null) {
        expect(lead.assignedUserId).toBeNull();
      } else {
        expect(lead.assignedUserId).not.toBeNull();
      }
    }

    // Os dois lados existem de fato — sem isso o laço acima passaria com uma
    // base só de leads sem reunião.
    expect(allLeads.filter((l) => l.meetingAt === null).length).toBeGreaterThan(0);
    expect(allLeads.filter((l) => l.meetingAt !== null).length).toBeGreaterThan(0);
  });

  // lote-9 — BASE-01: o seed não inventa baseline para NENHUM tenant, nem
  // o de demonstração — preenchê-lo é sempre ato de quem tem
  // `configuracoes:escrever`, nunca do seed (design.md — Risks: "Seed
  // escreve baseline mockado num tenant"). Substitui a asserção anterior
  // (lote-7 — REAL-01 AC3), que esperava o Crivo Demo com baseline
  // pré-preenchido; esse comportamento foi deliberadamente removido.
  it("os cinco baselines nascem nulos nos 3 tenants semeados — seed não inventa baseline (lote-9 — BASE-01)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

    for (const tenant of allTenants) {
      expect(tenant.baselineLeadsPerMonth).toBeNull();
      expect(tenant.baselineFirstResponseMinutes).toBeNull();
      expect(tenant.baselineLeadToMeetingPct).toBeNull();
      expect(tenant.baselineEscalationPct).toBeNull();
      expect(tenant.baselineAttendancePct).toBeNull();
    }
  });

  it("gera exatamente 1 chave de API por tenant, para os 3 tenants; o hash gravado no banco corresponde ao valor em claro devolvido, e nunca é igual a ele (lote-5 — INT-01; lote-7 — REAL-01 AC2)", async () => {
    // Roda o próprio runSeed() aqui (em vez de reusar o `seededApiKeys` do
    // beforeAll) porque outros testes deste arquivo chamam runSeed()
    // novamente (idempotência) — e uma chave de API é regenerada a cada
    // execução (não determinística como os demais IDs do seed). Autocontido:
    // o par (chave em claro, hash) verificado é sempre o da execução mais
    // recente, não importa a ordem dos testes.
    const { apiKeys } = await runSeed();
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);
    expect(apiKeys).toHaveLength(3);

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

  it("Crivo Demo tem 20-30 leads distribuídos pelos 3 status do pipeline, com conversa 1:1 e mensagens (AC 1.2 herdado)", async () => {
    const demo = await tenantBySlug(DEMO_SLUG);

    const demoLeads = await db.select().from(leads).where(eq(leads.tenantId, demo.id));
    const demoConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.tenantId, demo.id));
    const demoMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.tenantId, demo.id));

    expect(demoLeads.length).toBeGreaterThanOrEqual(20);
    expect(demoLeads.length).toBeLessThanOrEqual(30);
    expect(demoConversations).toHaveLength(demoLeads.length);
    expect(demoMessages.length).toBeGreaterThan(0);

    for (const status of LEAD_STATUSES) {
      const withStatus = demoLeads.filter((l) => l.status === status);
      expect(withStatus.length).toBeGreaterThan(0);
    }
  });

  it("leads qualificado_agendado do Crivo Demo têm todos os campos de qualificação do PRD §6.4 e resumo executivo preenchidos (AC 1.4)", async () => {
    const demo = await tenantBySlug(DEMO_SLUG);
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.tenantId, demo.id), eq(leads.status, "qualificado_agendado")));
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

  it("leads escalado_humano do Crivo Demo têm motivo de escalonamento preenchido (AC 1.5)", async () => {
    const demo = await tenantBySlug(DEMO_SLUG);
    const rows = await db
      .select()
      .from(leads)
      .where(and(eq(leads.tenantId, demo.id), eq(leads.status, "escalado_humano")));
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
    expect(allTenants).toHaveLength(3);

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
    expect(allTenants).toHaveLength(3);

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

  it("os 3 tenants têm as 5 colunas de identidade preenchidas (redesign — RD-01 AC6)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

    for (const tenant of allTenants) {
      expect(tenant.city).toBeTruthy();
      expect(tenant.state).toBeTruthy();
      expect(tenant.agentWhatsapp).toBeTruthy();
      expect(tenant.website).toBeTruthy();
      expect(tenant.agentPresentationMessage).toBeTruthy();
    }
  });

  it("os 3 tenants têm identidade distinta entre si, para que trocar de tenant seja visível no shell (redesign — RD-01 AC6)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

    // `state` pode legitimamente repetir (2 dos 3 tenants são de MG):
    // o par cidade/UF é o que precisa distinguir os tenants no subtítulo do
    // header da sidebar (design.md — R0).
    const cityStatePairs = allTenants.map((t) => `${t.city}/${t.state}`);
    expect(new Set(cityStatePairs).size).toBe(allTenants.length);

    const whatsapps = allTenants.map((t) => t.agentWhatsapp);
    expect(new Set(whatsapps).size).toBe(allTenants.length);

    const websites = allTenants.map((t) => t.website);
    expect(new Set(websites).size).toBe(allTenants.length);

    const presentations = allTenants.map((t) => t.agentPresentationMessage);
    expect(new Set(presentations).size).toBe(allTenants.length);
  });

  it("Crivo Demo tem leads com firstContactAt nas janelas de 7, 30 e 90 dias relativas a agora (lote-4 — datas espalhadas)", async () => {
    const demo = await tenantBySlug(DEMO_SLUG);
    const demoLeads = await db.select().from(leads).where(eq(leads.tenantId, demo.id));
    expect(demoLeads.length).toBeGreaterThan(0);

    const now = Date.now();
    const DAY = 86400000;
    const ageDays = demoLeads.map((l) => (now - l.firstContactAt.getTime()) / DAY);

    expect(ageDays.some((age) => age >= 0 && age <= 7)).toBe(true);
    expect(ageDays.some((age) => age > 7 && age <= 30)).toBe(true);
    expect(ageDays.some((age) => age > 30 && age <= 90)).toBe(true);
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

  // lote-6b — PER-01 AC7: a demonstração do CRM não pode contradizer o
  // agente real, que agora nunca se anuncia como automatizado por
  // iniciativa própria (AD-016).
  it("nenhuma mensagem semeada (apresentação ou conversas) contém 'assistente virtual'/'agente virtual'/'robô' (lote-6b — PER-01 AC7)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

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
  it("os 3 tenants têm agentVoiceTone semeado e distinto entre si (lote-6b — PER-03)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

    const tones = allTenants.map((t) => t.agentVoiceTone);
    for (const tone of tones) {
      expect(tone).toBeTruthy();
    }
    expect(new Set(tones).size).toBe(allTenants.length);
  });

  it("runSeed() cria exatamente 1 chave de serviço, com o hash gravado correspondendo ao valor em claro devolvido (lote-7 — SEC-01)", async () => {
    const { serviceApiKey } = await runSeed();

    const rows = await db.select().from(serviceApiKeys);
    expect(rows).toHaveLength(1);

    const expectedHash = createHash("sha256").update(serviceApiKey).digest("hex");
    expect(rows[0].keyHash).toBe(expectedHash);
    expect(rows[0].revokedAt).toBeNull();
  });

  it("o valor em claro da chave de serviço nunca é persistido — só o hash sha256 (lote-7 — SEC-01)", async () => {
    const { serviceApiKey } = await runSeed();

    const rows = await db.select().from(serviceApiKeys);
    expect(rows).toHaveLength(1);
    expect(rows[0].keyHash).not.toBe(serviceApiKey);
    expect(rows[0].label).not.toBe(serviceApiKey);
  });

  it("reseed rotaciona a chave de serviço, mantendo exatamente 1 linha (lote-7 — SEC-01)", async () => {
    const first = await runSeed();
    const second = await runSeed();

    expect(first.serviceApiKey).not.toBe(second.serviceApiKey);

    const rows = await db.select().from(serviceApiKeys);
    expect(rows).toHaveLength(1);

    const expectedHash = createHash("sha256")
      .update(second.serviceApiKey)
      .digest("hex");
    expect(rows[0].keyHash).toBe(expectedHash);
  });

  // lote-11 — SEEDIM-01: cada imobiliária ganha as 4 combinações de status ×
  // publicação necessárias para exercitar o corte de visibilidade do
  // contrato (`disponivel` + `published` é a única combinação visível —
  // IMOV-05 AC3), e todo captador é membro ATIVO daquela mesma imobiliária.
  it("cada imobiliária tem as 4 combinações de status × publicação exigidas, com captador membro ativo (lote-11 — SEEDIM-01)", async () => {
    const allTenants = await db.select().from(tenants);
    expect(allTenants).toHaveLength(3);

    for (const tenant of allTenants) {
      const tenantProperties = await db
        .select()
        .from(properties)
        .where(eq(properties.tenantId, tenant.id));

      const disponivelPublicado = tenantProperties.filter(
        (p) => p.status === "disponivel" && p.published === true
      );
      const disponivelNaoPublicado = tenantProperties.filter(
        (p) => p.status === "disponivel" && p.published === false
      );
      const reservado = tenantProperties.filter((p) => p.status === "reservado");
      const vendido = tenantProperties.filter((p) => p.status === "vendido");

      expect(disponivelPublicado.length).toBeGreaterThanOrEqual(1);
      expect(disponivelNaoPublicado.length).toBeGreaterThanOrEqual(1);
      expect(reservado.length).toBeGreaterThanOrEqual(1);
      expect(vendido.length).toBeGreaterThanOrEqual(1);

      const activeMemberUserIds = new Set(
        (
          await db
            .select({ userId: tenant_members.userId })
            .from(tenant_members)
            .where(
              and(
                eq(tenant_members.organizationId, tenant.id),
                isNull(tenant_members.deactivatedAt)
              )
            )
        ).map((m) => m.userId)
      );
      for (const property of tenantProperties) {
        expect(activeMemberUserIds.has(property.capturedByUserId)).toBe(true);
      }
    }
  });

  // lote-11 — SEEDIM-01 AC3: idempotência específica do catálogo — não basta
  // os IDs baterem (já provado por `snapshotIds()` acima), referência, preço
  // e captador de cada imóvel precisam ser LITERALMENTE os mesmos nas duas
  // execuções.
  it("rodar o seed novamente mantém referência, preço e captador idênticos por imóvel (lote-11 — SEEDIM-01 AC3)", async () => {
    const before = await db
      .select({
        id: properties.id,
        reference: properties.reference,
        priceCents: properties.priceCents,
        capturedByUserId: properties.capturedByUserId,
      })
      .from(properties);
    expect(before.length).toBeGreaterThan(0);

    await runSeed();

    const after = await db
      .select({
        id: properties.id,
        reference: properties.reference,
        priceCents: properties.priceCents,
        capturedByUserId: properties.capturedByUserId,
      })
      .from(properties);

    const beforeById = new Map(before.map((row) => [row.id, row]));
    expect(after.length).toBe(before.length);
    for (const row of after) {
      const original = beforeById.get(row.id);
      expect(original).toBeDefined();
      expect(row.reference).toBe(original!.reference);
      expect(row.priceCents).toBe(original!.priceCents);
      expect(row.capturedByUserId).toBe(original!.capturedByUserId);
    }
  });
});
