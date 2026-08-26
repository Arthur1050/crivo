import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../../db";
import { leads, tenant_members, tenants, users } from "../../../db/schema";
import {
  assignBrokerForEscalation,
  assignBrokerForMeeting,
  getBrokerCandidates,
  MEETING_DURATION_MS,
} from "../index";

/**
 * Atribuição por agenda na camada de dados (tasks.md — T27; spec.md ATRIB-02,
 * ATRIB-03; AD-022). Tenants, usuários e leads PRÓPRIOS deste arquivo — nunca
 * o snapshot do seed.
 *
 * As datas usam offset explícito de America/Sao_Paulo, que é a timezone em que
 * a janela é interpretada. 2026-08-24 é segunda (ISO 1); 2026-08-29 é sábado.
 */

const MANHA = { days: [1, 2, 3, 4, 5], start: "08:00", end: "14:00" };
const TARDE = { days: [1, 2, 3, 4, 5], start: "14:00", end: "19:00" };

function saoPaulo(isoLocal: string): Date {
  return new Date(`${isoLocal}-03:00`);
}

/** Segunda-feira 10:00-10:30: dentro da manhã, fora da tarde. */
const SLOT = saoPaulo("2026-08-24T10:00:00");
/** Sábado: fora de qualquer janela seg-sex. */
const SLOT_FORA_DE_JANELA = saoPaulo("2026-08-29T10:00:00");

const createdTenantIds: string[] = [];
const createdUserIds: string[] = [];

async function createTenant(name: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name,
    agentName: "Agente Teste",
    supportedModality: "ambos",
    slug: `fixture-${id}`,
  });
  createdTenantIds.push(id);
  return id;
}

interface MemberOptions {
  role?: string;
  createdAt?: Date;
  window?: { days: number[]; start: string; end: string } | null;
  deactivated?: boolean;
  userId?: string;
}

async function createMember(
  tenantId: string,
  name: string,
  options: MemberOptions = {}
): Promise<string> {
  const userId = options.userId ?? randomUUID();
  if (!options.userId) {
    await db
      .insert(users)
      .values({ id: userId, name, email: `${userId}@fixture.test` });
    createdUserIds.push(userId);
  }
  const window = options.window === undefined ? MANHA : options.window;
  await db.insert(tenant_members).values({
    organizationId: tenantId,
    userId,
    role: options.role ?? "corretor",
    createdAt: options.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
    workDays: window?.days ?? null,
    workHoursStart: window?.start ?? null,
    workHoursEnd: window?.end ?? null,
    deactivatedAt: options.deactivated ? new Date() : null,
  });
  return userId;
}

async function createLead(
  tenantId: string,
  options: {
    assignedUserId?: string | null;
    status?: "em_qualificacao" | "qualificado_agendado" | "escalado_humano";
    meetingAt?: Date | null;
  } = {}
): Promise<string> {
  const id = randomUUID();
  await db.insert(leads).values({
    id,
    tenantId,
    assignedUserId: options.assignedUserId ?? null,
    name: "Lead Fixture",
    phone: "+55 34 90000-1111",
    status: options.status ?? "em_qualificacao",
    meetingAt: options.meetingAt ?? null,
    firstContactAt: new Date(),
  });
  return id;
}

async function readLead(leadId: string) {
  const rows = await db.select().from(leads).where(eq(leads.id, leadId));
  return rows[0];
}

describe("server/data — atribuição por agenda (lote-8, ATRIB-02/ATRIB-03)", () => {
  afterEach(async () => {
    if (createdTenantIds.length > 0) {
      await db.delete(leads).where(inArray(leads.tenantId, createdTenantIds));
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.organizationId, createdTenantIds));
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
      createdTenantIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
      createdUserIds.length = 0;
    }
  });

  describe("getBrokerCandidates", () => {
    it("devolve carga ativa, janela declarada e reuniões marcadas do corretor, numa consulta só", async () => {
      const tenantId = await createTenant("Candidatos A");
      const brokerId = await createMember(tenantId, "Corretor A");

      await createLead(tenantId, { assignedUserId: brokerId, status: "em_qualificacao" });
      await createLead(tenantId, { assignedUserId: brokerId, status: "escalado_humano" });
      await createLead(tenantId, {
        assignedUserId: brokerId,
        status: "qualificado_agendado",
        meetingAt: SLOT,
      });

      const candidates = await getBrokerCandidates(tenantId);

      expect(candidates).toHaveLength(1);
      // `qualificado_agendado` não conta como carga (mesma regra de getBrokerLoads).
      expect(candidates[0].activeLeads).toBe(2);
      expect(candidates[0].window).toEqual(MANHA);
      expect(candidates[0].meetings).toEqual([
        { start: SLOT, end: new Date(SLOT.getTime() + MEETING_DURATION_MS) },
      ]);
    });

    it("corretor sem janela declarada vem com window null (AGENDA-01 AC5)", async () => {
      const tenantId = await createTenant("Candidatos Sem Janela");
      await createMember(tenantId, "Corretor Sem Janela", { window: null });

      const candidates = await getBrokerCandidates(tenantId);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].window).toBeNull();
      expect(candidates[0].meetings).toEqual([]);
    });

    it("corretor sem nenhum lead aparece com activeLeads 0 (LEFT JOIN, nunca INNER)", async () => {
      const tenantId = await createTenant("Candidatos Vazio");
      const brokerId = await createMember(tenantId, "Corretor Ocioso");

      const candidates = await getBrokerCandidates(tenantId);

      expect(candidates.map((c) => c.id)).toEqual([brokerId]);
      expect(candidates[0].activeLeads).toBe(0);
    });

    it("exclui vínculo desativado e quem não tem papel corretor, mesmo com janela cobrindo", async () => {
      const tenantId = await createTenant("Candidatos Filtro");
      const ativoId = await createMember(tenantId, "Corretor Ativo");
      const desativadoId = await createMember(tenantId, "Corretor Desativado", {
        deactivated: true,
      });
      const gestorId = await createMember(tenantId, "Gestor", { role: "gestor" });

      const ids = (await getBrokerCandidates(tenantId)).map((c) => c.id);

      expect(ids).toEqual([ativoId]);
      expect(ids).not.toContain(desativadoId);
      expect(ids).not.toContain(gestorId);
    });

    it("não vaza corretor nem reunião de outra imobiliária", async () => {
      const tenantId = await createTenant("Candidatos Tenant A");
      const outroTenantId = await createTenant("Candidatos Tenant B");

      const brokerId = await createMember(tenantId, "Corretor Compartilhado");
      // O MESMO usuário atende nas duas imobiliárias (usuário é multi-tenant).
      await createMember(outroTenantId, "Corretor Compartilhado", {
        userId: brokerId,
      });
      const alheioId = await createMember(outroTenantId, "Corretor Vizinho");

      // Reunião e carga que existem só na imobiliária vizinha.
      await createLead(outroTenantId, {
        assignedUserId: brokerId,
        status: "qualificado_agendado",
        meetingAt: SLOT,
      });
      await createLead(outroTenantId, {
        assignedUserId: brokerId,
        status: "em_qualificacao",
      });

      const candidates = await getBrokerCandidates(tenantId);

      expect(candidates.map((c) => c.id)).toEqual([brokerId]);
      expect(candidates.map((c) => c.id)).not.toContain(alheioId);
      expect(candidates[0].meetings).toEqual([]);
      expect(candidates[0].activeLeads).toBe(0);
    });
  });

  describe("assignBrokerForMeeting", () => {
    it("escolhe quem cobre o horário e grava responsável e reunião na mesma operação", async () => {
      const tenantId = await createTenant("Agendamento A");
      const manhaId = await createMember(tenantId, "Corretor Manhã", {
        window: MANHA,
      });
      const tardeId = await createMember(tenantId, "Corretor Tarde", {
        window: TARDE,
        // Carga menor: só a janela o exclui.
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      });
      const leadId = await createLead(tenantId);

      const result = await assignBrokerForMeeting(tenantId, leadId, SLOT, {
        status: "qualificado_agendado",
      });

      expect(result).toMatchObject({ ok: true, brokerId: manhaId });
      expect(result.ok && result.brokerId).not.toBe(tardeId);

      const saved = await readLead(leadId);
      expect(saved.assignedUserId).toBe(manhaId);
      expect(saved.meetingAt).toEqual(SLOT);
      expect(saved.status).toBe("qualificado_agendado");
    });

    it("nenhum corretor cobre o horário: recusa e não grava nada (ATRIB-02 AC5)", async () => {
      const tenantId = await createTenant("Agendamento Sem Cobertura");
      await createMember(tenantId, "Corretor Manhã", { window: MANHA });
      const leadId = await createLead(tenantId);

      const result = await assignBrokerForMeeting(
        tenantId,
        leadId,
        SLOT_FORA_DE_JANELA,
        { status: "qualificado_agendado" }
      );

      expect(result).toEqual({ ok: false, reason: "sem-corretor-disponivel" });

      const saved = await readLead(leadId);
      expect(saved.assignedUserId).toBeNull();
      expect(saved.meetingAt).toBeNull();
      expect(saved.status).toBe("em_qualificacao");
    });

    it("exclui o corretor que já tem reunião sobreposta ao intervalo (AC6)", async () => {
      const tenantId = await createTenant("Agendamento Ocupado");
      const ocupadoId = await createMember(tenantId, "Corretor Ocupado", {
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      });
      const livreId = await createMember(tenantId, "Corretor Livre");
      await createLead(tenantId, {
        assignedUserId: ocupadoId,
        status: "qualificado_agendado",
        meetingAt: SLOT,
      });
      const leadId = await createLead(tenantId);

      const result = await assignBrokerForMeeting(tenantId, leadId, SLOT, {});

      expect(result).toMatchObject({ ok: true, brokerId: livreId });
    });

    it("o índice único do banco recusa duas reuniões do mesmo corretor no mesmo instante", async () => {
      const tenantId = await createTenant("Índice de Conflito");
      const brokerId = await createMember(tenantId, "Corretor Único");
      await createLead(tenantId, {
        assignedUserId: brokerId,
        status: "qualificado_agendado",
        meetingAt: SLOT,
      });
      const outroLeadId = await createLead(tenantId);

      // Escrita DIRETA, sem passar por nenhuma checagem de aplicação: é o
      // banco que recusa.
      await expect(
        db
          .update(leads)
          .set({ assignedUserId: brokerId, meetingAt: SLOT })
          .where(eq(leads.id, outroLeadId))
      ).rejects.toThrow();

      // O mesmo corretor em OUTRO instante passa — o índice é por intervalo,
      // não por corretor.
      await db
        .update(leads)
        .set({
          assignedUserId: brokerId,
          meetingAt: new Date(SLOT.getTime() + MEETING_DURATION_MS),
        })
        .where(eq(leads.id, outroLeadId));
      expect((await readLead(outroLeadId)).assignedUserId).toBe(brokerId);
    });

    it("dois agendamentos concorrentes no mesmo corretor e intervalo: exatamente um confirma (AC7)", async () => {
      const tenantId = await createTenant("Agendamento Concorrente");
      const brokerId = await createMember(tenantId, "Corretor Único");
      const leadA = await createLead(tenantId);
      const leadB = await createLead(tenantId);

      const [primeiro, segundo] = await Promise.all([
        assignBrokerForMeeting(tenantId, leadA, SLOT, {
          status: "qualificado_agendado",
        }),
        assignBrokerForMeeting(tenantId, leadB, SLOT, {
          status: "qualificado_agendado",
        }),
      ]);

      const confirmados = [primeiro, segundo].filter((r) => r.ok);
      expect(confirmados).toHaveLength(1);

      // E o banco confirma o mesmo: uma reunião só naquele corretor e instante.
      const comReuniao = await db
        .select({ id: leads.id })
        .from(leads)
        .where(
          sql`${leads.tenantId} = ${tenantId} and ${leads.assignedUserId} = ${brokerId} and ${leads.meetingAt} = ${SLOT}`
        );
      expect(comReuniao).toHaveLength(1);
    });

    it("quem perde a corrida pelo mesmo intervalo recebe conflito-de-agenda", async () => {
      const tenantId = await createTenant("Conflito de Agenda");
      const brokerId = await createMember(tenantId, "Corretor Único");
      const leadReservado = await createLead(tenantId);
      const leadPerdedor = await createLead(tenantId);

      // Transação aberta que reserva o slot e SEGURA o lock: enquanto ela não
      // confirma, a reserva é invisível para quem lê (read committed), então o
      // segundo agendamento escolhe o mesmo corretor e trava no índice único.
      let liberar!: () => void;
      const portao = new Promise<void>((resolve) => {
        liberar = resolve;
      });

      const reserva = db.transaction(async (tx) => {
        await tx
          .update(leads)
          .set({ assignedUserId: brokerId, meetingAt: SLOT })
          .where(eq(leads.id, leadReservado));
        await portao;
      });

      // Espera a reserva estar de pé antes de disparar o concorrente.
      await waitFor(async () => {
        const bloqueado = await db.execute(
          sql`select count(*)::int as n from pg_locks where granted and locktype = 'transactionid'`
        );
        return Number((bloqueado.rows[0] as { n: number }).n) > 0;
      });

      const perdedor = assignBrokerForMeeting(tenantId, leadPerdedor, SLOT, {
        status: "qualificado_agendado",
      });

      // Só libera a transação depois que o concorrente está de fato BLOQUEADO
      // no índice — é isso que faz a corrida ser a corrida, e não uma leitura
      // tardia que veria o slot já ocupado.
      const bloqueou = await waitFor(async () => {
        const espera = await db.execute(
          sql`select count(*)::int as n from pg_stat_activity
              where wait_event_type = 'Lock' and state = 'active'`
        );
        return Number((espera.rows[0] as { n: number }).n) > 0;
      });

      liberar();
      await reserva;

      const resultado = await perdedor;

      expect(bloqueou).toBe(true);
      expect(resultado).toEqual({ ok: false, reason: "conflito-de-agenda" });
      // O perdedor não gravou nada.
      const salvo = await readLead(leadPerdedor);
      expect(salvo.assignedUserId).toBeNull();
      expect(salvo.meetingAt).toBeNull();
      expect(salvo.status).toBe("em_qualificacao");
    });
  });

  describe("assignBrokerForEscalation", () => {
    it("lead sem responsável recebe o de menor carga em janela, junto com o status", async () => {
      const tenantId = await createTenant("Escalonamento A");
      const carregadoId = await createMember(tenantId, "Corretor Carregado", {
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      });
      const leveId = await createMember(tenantId, "Corretor Leve");
      await createLead(tenantId, { assignedUserId: carregadoId });
      await createLead(tenantId, { assignedUserId: carregadoId });
      const leadId = await createLead(tenantId);

      const result = await assignBrokerForEscalation(tenantId, leadId, SLOT, {
        status: "escalado_humano",
        escalationReason: "pediu corretor",
      });

      expect(result).toMatchObject({ ok: true, brokerId: leveId });

      const saved = await readLead(leadId);
      expect(saved.assignedUserId).toBe(leveId);
      expect(saved.status).toBe("escalado_humano");
      expect(saved.statusChangedBy).toBe("agente");
    });

    it("imobiliária sem corretor ativo grava o escalonamento com o lead sem responsável (AC4)", async () => {
      const tenantId = await createTenant("Escalonamento Sem Corretor");
      await createMember(tenantId, "Gestora", { role: "gestor" });
      await createMember(tenantId, "Corretor Desativado", { deactivated: true });
      const leadId = await createLead(tenantId);

      const result = await assignBrokerForEscalation(tenantId, leadId, SLOT, {
        status: "escalado_humano",
        escalationReason: "sem ninguém para atender",
      });

      expect(result).toMatchObject({ ok: true, brokerId: null });

      const saved = await readLead(leadId);
      expect(saved.status).toBe("escalado_humano");
      expect(saved.assignedUserId).toBeNull();
    });

    it("lead que já tem responsável não é reatribuído, mesmo havendo alguém com menos carga (AC5)", async () => {
      const tenantId = await createTenant("Escalonamento Preserva");
      const donoId = await createMember(tenantId, "Corretor Dono", {
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      });
      const ociosoId = await createMember(tenantId, "Corretor Ocioso");
      const leadId = await createLead(tenantId, { assignedUserId: donoId });

      const result = await assignBrokerForEscalation(tenantId, leadId, SLOT, {
        status: "escalado_humano",
        escalationReason: "insistiu",
      });

      expect(result).toMatchObject({ ok: true, brokerId: donoId });

      const saved = await readLead(leadId);
      expect(saved.assignedUserId).toBe(donoId);
      expect(saved.assignedUserId).not.toBe(ociosoId);
      expect(saved.status).toBe("escalado_humano");
    });
  });
});

/** Espera uma condição do banco ficar verdadeira, com teto de tempo. */
async function waitFor(
  condition: () => Promise<boolean>,
  attempts = 60,
  intervalMs = 50
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}
