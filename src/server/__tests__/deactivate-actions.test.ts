import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  conversations,
  leads,
  messages,
  tenant_invitations,
  tenant_members,
  tenants,
  users,
} from "../../db/schema";
import type { Action, Resource, Role } from "../../lib/permissions";
import type { LeadStatus } from "../data";
import type { AuthContext } from "../auth/session";

/**
 * Desativação com destino da carteira (tasks.md — T21; spec.md USER-02).
 *
 * Mesmo harness de `users-actions.test.ts`: identidade fabricada, decisão de
 * permissão real. Cada teste monta a própria imobiliária-fixture, porque o
 * estado que interessa (quem é o único administrador, quantos corretores
 * ativos existem, qual a carga de cada um) precisa ser controlado por caso.
 */

let sessionRoles: Role[] = ["administrador"];
let sessionTenantId = "";
let sessionUser = { id: "", name: "", email: "" };

vi.mock("../auth/session", async (importActual) => {
  const actual = await importActual<typeof import("../auth/session")>();
  const fakeSession = async (): Promise<AuthContext> => ({
    user: sessionUser,
    tenantId: sessionTenantId,
    roles: sessionRoles,
    leadScope: { tenantId: sessionTenantId, assignedUserId: null },
  });
  return {
    ...actual,
    verifySession: fakeSession,
    requirePermission: async (resource: Resource, action: Action) =>
      actual.authorizeOrThrow(await fakeSession(), resource, action),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { resolveAuthContext } from "../auth/session";
import { auth } from "../auth/config";
import {
  getBrokerLoads,
  getBrokers,
  getLeads,
  transferCarteiraAndDeactivate,
  getTenantMembers,
} from "../data";
import {
  deactivateMemberAction,
  getDeactivationPreviewAction,
} from "../actions/deactivate";

const createdTenantIds: string[] = [];
const createdUserIds: string[] = [];

async function createTenant(name: string): Promise<string> {
  const id = randomUUID();
  await db.insert(tenants).values({
    id,
    name,
    agentName: `Agente ${name}`,
    supportedModality: "ambos",
    slug: `fixture-${id}`,
  });
  createdTenantIds.push(id);
  return id;
}

async function createMember(
  tenantId: string,
  name: string,
  roles: Role[]
): Promise<{ userId: string; memberId: string; email: string }> {
  const userId = randomUUID();
  const email = `${userId}@fixture.test`;
  await db.insert(users).values({ id: userId, name, email });
  createdUserIds.push(userId);
  const [member] = await db
    .insert(tenant_members)
    .values({ organizationId: tenantId, userId, role: roles.join(",") })
    .returning({ id: tenant_members.id });
  return { userId, memberId: member.id, email };
}

let leadSeq = 0;

async function createLead(input: {
  tenantId: string;
  assignedUserId: string | null;
  status: LeadStatus;
  meetingAt?: Date;
}): Promise<string> {
  const id = randomUUID();
  leadSeq += 1;
  await db.insert(leads).values({
    id,
    tenantId: input.tenantId,
    assignedUserId: input.assignedUserId,
    name: `Lead ${leadSeq}`,
    phone: `5534999${String(leadSeq).padStart(6, "0")}`,
    status: input.status,
    meetingAt: input.meetingAt ?? null,
    firstContactAt: new Date(Date.now() - leadSeq * 60000),
    createdAt: new Date(Date.now() - leadSeq * 60000),
  });
  return id;
}

async function assigneeOf(leadId: string): Promise<string | null> {
  const [row] = await db.select().from(leads).where(eq(leads.id, leadId));
  return row.assignedUserId;
}

async function deactivatedAtOf(memberId: string): Promise<Date | null> {
  const [row] = await db
    .select()
    .from(tenant_members)
    .where(eq(tenant_members.id, memberId));
  return row.deactivatedAt;
}

describe("server/actions/deactivate — destino da carteira (lote-8, USER-02)", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeAll(() => {
    sessionUser = {
      id: randomUUID(),
      name: "Administrador T21",
      email: "admin-t21@fixture.test",
    };
  });

  beforeEach(() => {
    sessionRoles = ["administrador"];
    warn.mockClear();
  });

  afterAll(async () => {
    warn.mockRestore();
    if (createdTenantIds.length > 0) {
      const leadIds = (
        await db
          .select({ id: leads.id })
          .from(leads)
          .where(inArray(leads.tenantId, createdTenantIds))
      ).map((row) => row.id);
      if (leadIds.length > 0) {
        const conversationIds = (
          await db
            .select({ id: conversations.id })
            .from(conversations)
            .where(inArray(conversations.leadId, leadIds))
        ).map((row) => row.id);
        if (conversationIds.length > 0) {
          await db
            .delete(messages)
            .where(inArray(messages.conversationId, conversationIds));
          await db
            .delete(conversations)
            .where(inArray(conversations.id, conversationIds));
        }
        await db.delete(leads).where(inArray(leads.id, leadIds));
      }
      await db
        .delete(tenant_invitations)
        .where(inArray(tenant_invitations.organizationId, createdTenantIds));
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.organizationId, createdTenantIds));
    }
    if (createdUserIds.length > 0) {
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  // AC1: com carteira ativa, a escolha do destino é obrigatória.
  it("desativar com leads ativos sem escolher destino é recusado e nada muda", async () => {
    const tenantId = await createTenant("T21 Escolha Obrigatória");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);
    const corretor = await createMember(tenantId, "Corretor", ["corretor"]);
    const leadId = await createLead({
      tenantId,
      assignedUserId: corretor.userId,
      status: "em_qualificacao",
    });

    const result = await deactivateMemberAction({
      memberId: corretor.memberId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.escolhaDeCarteiraObrigatoria).toBe(true);
    expect(result.leadsAtivos).toBe(1);

    expect(await deactivatedAtOf(corretor.memberId)).toBeNull();
    expect(await assigneeOf(leadId)).toBe(corretor.userId);
  });

  // AC2 + AC5: transferir move TODOS os ativos numa operação; o histórico não.
  it("transferir move todos os leads ativos para o corretor escolhido e preserva os não ativos", async () => {
    const tenantId = await createTenant("T21 Transferir");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);
    const saindo = await createMember(tenantId, "Corretor Saindo", ["corretor"]);
    const destino = await createMember(tenantId, "Corretor Destino", [
      "corretor",
    ]);

    const ativo1 = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "em_qualificacao",
    });
    const ativo2 = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "escalado_humano",
    });
    const historico = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "qualificado_agendado",
      meetingAt: new Date(Date.now() + 86400000),
    });

    const result = await deactivateMemberAction({
      memberId: saindo.memberId,
      destino: { tipo: "transferir", corretorId: destino.userId },
    });

    expect(result).toEqual({ ok: true, leadsAtivos: 2, leadsReatribuidos: 2 });

    expect(await assigneeOf(ativo1)).toBe(destino.userId);
    expect(await assigneeOf(ativo2)).toBe(destino.userId);
    // AC5: lead não ativo NUNCA muda de responsável.
    expect(await assigneeOf(historico)).toBe(saindo.userId);
    expect(await deactivatedAtOf(saindo.memberId)).not.toBeNull();
  });

  // AC3: redistribuir recalcula a carga a cada lead.
  it("redistribuir escolhe o menos carregado a cada lead, e não despeja tudo no mesmo corretor", async () => {
    const tenantId = await createTenant("T21 Redistribuir");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);
    const saindo = await createMember(tenantId, "Corretor Saindo", ["corretor"]);
    const a = await createMember(tenantId, "Corretor A", ["corretor"]);
    const b = await createMember(tenantId, "Corretor B", ["corretor"]);

    // Carga inicial: A com 1 lead ativo, B com nenhum.
    await createLead({
      tenantId,
      assignedUserId: a.userId,
      status: "em_qualificacao",
    });

    const l1 = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "em_qualificacao",
    });
    const l2 = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "em_qualificacao",
    });
    const l3 = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "escalado_humano",
    });

    const result = await deactivateMemberAction({
      memberId: saindo.memberId,
      destino: { tipo: "redistribuir" },
    });

    expect(result).toEqual({ ok: true, leadsAtivos: 3, leadsReatribuidos: 3 });

    // B(0) leva o primeiro; empate 1×1 no segundo é desfeito por `createdAt`
    // do vínculo (A é mais antigo); B(1) contra A(2) leva o terceiro.
    expect(await assigneeOf(l1)).toBe(b.userId);
    expect(await assigneeOf(l2)).toBe(a.userId);
    expect(await assigneeOf(l3)).toBe(b.userId);

    expect(await deactivatedAtOf(saindo.memberId)).not.toBeNull();
  });

  // AC4 + AC5: manter preserva a atribuição e sinaliza responsável inativo.
  it("manter preserva a atribuição e o lead passa a exibir responsável inativo", async () => {
    const tenantId = await createTenant("T21 Manter");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);
    const saindo = await createMember(tenantId, "Corretor Mantido", [
      "corretor",
    ]);
    const ativo = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "em_qualificacao",
    });
    const historico = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "qualificado_agendado",
    });

    const result = await deactivateMemberAction({
      memberId: saindo.memberId,
      destino: { tipo: "manter" },
    });

    expect(result).toEqual({ ok: true, leadsAtivos: 1, leadsReatribuidos: 0 });

    expect(await assigneeOf(ativo)).toBe(saindo.userId);
    expect(await assigneeOf(historico)).toBe(saindo.userId);

    // O sinal que o Pipeline exibe para administrador e gestor.
    const visiveis = await getLeads({ tenantId, assignedUserId: null });
    const card = visiveis.find((lead) => lead.id === ativo)!;
    expect(card.brokerName).toBe("Corretor Mantido");
    expect(card.brokerDeactivatedAt).not.toBeNull();
  });

  // AC6: sem carteira ativa, desativa direto.
  it("sem leads ativos desativa direto, sem exigir destino", async () => {
    const tenantId = await createTenant("T21 Sem Carteira");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);
    const semCarteira = await createMember(tenantId, "Corretor Sem Carteira", [
      "corretor",
    ]);
    const historico = await createLead({
      tenantId,
      assignedUserId: semCarteira.userId,
      status: "qualificado_agendado",
    });

    const result = await deactivateMemberAction({
      memberId: semCarteira.memberId,
    });

    expect(result).toEqual({ ok: true, leadsAtivos: 0, leadsReatribuidos: 0 });
    expect(await deactivatedAtOf(semCarteira.memberId)).not.toBeNull();
    expect(await assigneeOf(historico)).toBe(semCarteira.userId);
  });

  // AC7: destino desativado durante a operação recusa a transferência INTEIRA.
  it("corretor de destino desativado depois da validação faz a transferência inteira ser recusada", async () => {
    const tenantId = await createTenant("T21 Destino Some");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);
    const saindo = await createMember(tenantId, "Corretor Saindo", ["corretor"]);
    const destino = await createMember(tenantId, "Corretor Destino", [
      "corretor",
    ]);

    const l1 = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "em_qualificacao",
    });
    const l2 = await createLead({
      tenantId,
      assignedUserId: saindo.userId,
      status: "escalado_humano",
    });

    // O destino é validado como ativo — é o estado que a tela viu.
    const antes = await getDeactivationPreviewAction({
      memberId: saindo.memberId,
    });
    expect(antes.ok).toBe(true);
    expect(
      (await getTenantMembers(tenantId)).find(
        (m) => m.memberId === destino.memberId
      )!.deactivatedAt
    ).toBeNull();

    // ...e só então ele é desativado, como aconteceria por outra sessão entre
    // a confirmação e a escrita. A guarda que precisa pegar isso é a da
    // transação, não a validação anterior.
    await db
      .update(tenant_members)
      .set({ deactivatedAt: new Date() })
      .where(eq(tenant_members.id, destino.memberId));

    const transferencia = await transferCarteiraAndDeactivate({
      tenantId,
      memberId: saindo.memberId,
      fromUserId: saindo.userId,
      toUserId: destino.userId,
    });
    expect(transferencia).toEqual({ ok: false, reason: "destino-indisponivel" });

    const result = await deactivateMemberAction({
      memberId: saindo.memberId,
      destino: { tipo: "transferir", corretorId: destino.userId },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      "O corretor escolhido não está mais disponível. Nenhum lead foi transferido."
    );

    // Nenhum lead moveu e a origem NÃO foi desativada: a operação é inteira.
    expect(await assigneeOf(l1)).toBe(saindo.userId);
    expect(await assigneeOf(l2)).toBe(saindo.userId);
    expect(await deactivatedAtOf(saindo.memberId)).toBeNull();
  });

  // Edge case: o último administrador ativo não consegue se desativar.
  it("o último administrador ativo não consegue desativar a si mesmo", async () => {
    const tenantId = await createTenant("T21 Último Administrador");
    sessionTenantId = tenantId;
    const admin = await createMember(tenantId, "Único Administrador", [
      "administrador",
    ]);
    sessionUser = {
      id: admin.userId,
      name: "Único Administrador",
      email: admin.email,
    };

    const result = await deactivateMemberAction({ memberId: admin.memberId });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      "A imobiliária precisa de ao menos um administrador ativo."
    );
    expect(await deactivatedAtOf(admin.memberId)).toBeNull();
  });

  it("com dois administradores ativos, desativar um deles é permitido", async () => {
    const tenantId = await createTenant("T21 Dois Administradores");
    sessionTenantId = tenantId;
    const um = await createMember(tenantId, "Administrador Um", [
      "administrador",
    ]);
    await createMember(tenantId, "Administrador Dois", ["administrador"]);

    const result = await deactivateMemberAction({ memberId: um.memberId });

    expect(result).toEqual({ ok: true, leadsAtivos: 0, leadsReatribuidos: 0 });
    expect(await deactivatedAtOf(um.memberId)).not.toBeNull();
  });

  // USER-01 AC10: desativado perde o acesso àquela imobiliária, sai das listas
  // de atribuição e continua nomeado no histórico.
  it("usuário desativado sai das listas de atribuição, perde o acesso e mantém o nome no lead", async () => {
    const tenantId = await createTenant("T21 Pós-Desativação");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);

    const email = `t21-${randomUUID()}@fixture.test`;
    const conta = await auth.api.signUpEmail({
      body: { email, password: "senha-de-teste-123", name: "Corretor Saindo" },
    });
    createdUserIds.push(conta.user.id);
    const [membro] = await db
      .insert(tenant_members)
      .values({
        organizationId: tenantId,
        userId: conta.user.id,
        role: "corretor",
      })
      .returning({ id: tenant_members.id });

    const leadHistorico = await createLead({
      tenantId,
      assignedUserId: conta.user.id,
      status: "qualificado_agendado",
    });

    const { headers } = await auth.api.signInEmail({
      body: { email, password: "senha-de-teste-123" },
      returnHeaders: true,
    });
    const sessionHeaders = new Headers({
      cookie: headers.get("set-cookie") as string,
    });
    const antes = await resolveAuthContext(sessionHeaders);
    expect(antes.ok).toBe(true);

    const result = await deactivateMemberAction({ memberId: membro.id });
    expect(result.ok).toBe(true);

    // Some das listas de atribuição, nas duas fontes que a política usa.
    expect((await getBrokers(tenantId)).map((b) => b.id)).not.toContain(
      conta.user.id
    );
    expect((await getBrokerLoads(tenantId)).map((b) => b.id)).not.toContain(
      conta.user.id
    );

    // Perde o acesso à imobiliária na requisição seguinte, com a MESMA sessão.
    const depois = await resolveAuthContext(sessionHeaders);
    expect(depois).toMatchObject({ ok: false, reason: "sem-vinculo" });

    // Mas continua nomeado no lead que já atendeu.
    const visiveis = await getLeads({ tenantId, assignedUserId: null });
    const card = visiveis.find((lead) => lead.id === leadHistorico)!;
    expect(card.assignedUserId).toBe(conta.user.id);
    expect(card.brokerName).toBe("Corretor Saindo");
  });

  it("gestor não desativa ninguém e nada é gravado", async () => {
    const tenantId = await createTenant("T21 Recusa de Permissão");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);
    const alvo = await createMember(tenantId, "Corretor Alvo", ["corretor"]);
    sessionRoles = ["gestor"];

    const result = await deactivateMemberAction({ memberId: alvo.memberId });

    expect(result).toEqual({
      ok: false,
      error: "Sem permissão para escrever usuarios.",
    });
    expect(await deactivatedAtOf(alvo.memberId)).toBeNull();
  });

  // Edge case da spec: reuniões futuras à vista na hora de escolher o destino.
  it("a confirmação apresenta as reuniões futuras do corretor junto da carteira ativa", async () => {
    const tenantId = await createTenant("T21 Reuniões Futuras");
    sessionTenantId = tenantId;
    await createMember(tenantId, "Admin", ["administrador"]);
    const corretor = await createMember(tenantId, "Corretor Com Agenda", [
      "corretor",
    ]);

    const futura = new Date(Date.now() + 2 * 86400000);
    const leadComReuniao = await createLead({
      tenantId,
      assignedUserId: corretor.userId,
      status: "qualificado_agendado",
      meetingAt: futura,
    });
    await createLead({
      tenantId,
      assignedUserId: corretor.userId,
      status: "qualificado_agendado",
      meetingAt: new Date(Date.now() - 86400000),
    });
    const leadAtivo = await createLead({
      tenantId,
      assignedUserId: corretor.userId,
      status: "em_qualificacao",
    });

    const result = await getDeactivationPreviewAction({
      memberId: corretor.memberId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.preview.leadsAtivos.map((l) => l.id)).toEqual([leadAtivo]);
    // Só a futura entra; a reunião passada não é decisão pendente.
    expect(result.preview.reunioesFuturas.map((r) => r.leadId)).toEqual([
      leadComReuniao,
    ]);
    expect(result.preview.reunioesFuturas[0].meetingAt.getTime()).toBe(
      futura.getTime()
    );
  });
});
