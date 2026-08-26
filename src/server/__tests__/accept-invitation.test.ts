import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  accounts,
  sessions,
  tenant_invitations,
  tenant_members,
  tenants,
  users,
} from "../../db/schema";

/**
 * Aceite de convite (tasks.md — T23; spec.md USER-01 AC6/AC7 e o Edge Case do
 * convite aberto por outra conta autenticada).
 *
 * `next/headers` é mockado com uma `Headers` controlável: é por ela que a
 * action enxerga (ou não) a sessão de outra conta já aberta. `cookies()` é um
 * stub porque o `nextCookies()` do better-auth escreve nele ao emitir a sessão
 * nova.
 */

const mocks = vi.hoisted(() => ({
  requestHeaders: new Headers(),
}));

vi.mock("next/headers", () => ({
  headers: async () => mocks.requestHeaders,
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));

import { auth } from "../auth/config";
import { acceptInvitationAction } from "../actions/invitations";
import { createInvitation, getInvitation } from "../data";

const PASSWORD = "senha-de-teste-123";
const INVALID_INVITATION =
  "Este convite não vale mais. Peça um novo convite ao administrador da imobiliária.";

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

/** Convidado como o `inviteUserAction` o deixa: usuário sem credencial. */
async function createPendingInvitee(
  tenantId: string,
  inviterId: string
): Promise<{ userId: string; email: string; token: string }> {
  const userId = randomUUID();
  const email = `t23-${userId}@fixture.test`;
  await db.insert(users).values({ id: userId, name: "Convidado T23", email });
  createdUserIds.push(userId);
  await db
    .insert(tenant_members)
    .values({ organizationId: tenantId, userId, role: "corretor" });
  const invitation = await createInvitation({
    tenantId,
    email,
    roles: ["corretor"],
    inviterId,
  });
  return { userId, email, token: invitation.id };
}

async function createAdmin(tenantId: string): Promise<string> {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, name: "Admin T23", email: `${id}@fixture.test` });
  createdUserIds.push(id);
  await db
    .insert(tenant_members)
    .values({ organizationId: tenantId, userId: id, role: "administrador" });
  return id;
}

describe("server/actions/invitations — aceite de convite (lote-8, USER-01)", () => {
  beforeEach(() => {
    mocks.requestHeaders = new Headers();
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await db
        .delete(tenant_invitations)
        .where(inArray(tenant_invitations.organizationId, createdTenantIds));
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.organizationId, createdTenantIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
      await db.delete(accounts).where(inArray(accounts.userId, createdUserIds));
      await db
        .delete(tenant_members)
        .where(inArray(tenant_members.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdTenantIds.length > 0) {
      await db.delete(tenants).where(inArray(tenants.id, createdTenantIds));
    }
  });

  // AC6: convite válido + senha nova ativa o usuário e cria a sessão dele.
  it("convite válido com senha nova ativa o usuário e cria a sessão dele", async () => {
    const tenantId = await createTenant("T23 Aceite");
    const inviterId = await createAdmin(tenantId);
    const convidado = await createPendingInvitee(tenantId, inviterId);

    const antes = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, convidado.userId));
    expect(antes).toHaveLength(0);

    const result = await acceptInvitationAction({
      token: convidado.token,
      password: PASSWORD,
    });

    expect(result).toEqual({ ok: true, needsLogin: false });

    // Ativado: a credencial passou a existir e a senha FUNCIONA.
    const depois = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, convidado.userId));
    expect(depois).toHaveLength(1);
    const login = await auth.api.signInEmail({
      body: { email: convidado.email, password: PASSWORD },
    });
    expect(login.user.id).toBe(convidado.userId);

    // Sessão criada para ELE, e o convite marcado como usado.
    const sessoes = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, convidado.userId));
    expect(sessoes.length).toBeGreaterThan(0);
    expect((await getInvitation(convidado.token))!.status).toBe("accepted");
  });

  // AC7: convite já utilizado é recusado com instrução de pedir um novo.
  it("convite já utilizado é recusado e não muda mais nada", async () => {
    const tenantId = await createTenant("T23 Já Usado");
    const inviterId = await createAdmin(tenantId);
    const convidado = await createPendingInvitee(tenantId, inviterId);

    await acceptInvitationAction({
      token: convidado.token,
      password: PASSWORD,
    });

    const segunda = await acceptInvitationAction({
      token: convidado.token,
      password: "outra-senha-999",
    });

    expect(segunda).toEqual({ ok: false, error: INVALID_INVITATION });

    // A senha original continua valendo: a segunda tentativa não trocou nada.
    const login = await auth.api.signInEmail({
      body: { email: convidado.email, password: PASSWORD },
    });
    expect(login.user.id).toBe(convidado.userId);
  });

  // AC7: convite expirado é recusado, sem ativar ninguém.
  it("convite expirado é recusado e nenhuma credencial é criada", async () => {
    const tenantId = await createTenant("T23 Expirado");
    const inviterId = await createAdmin(tenantId);
    const convidado = await createPendingInvitee(tenantId, inviterId);

    await db
      .update(tenant_invitations)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(tenant_invitations.id, convidado.token));

    const result = await acceptInvitationAction({
      token: convidado.token,
      password: PASSWORD,
    });

    expect(result).toEqual({ ok: false, error: INVALID_INVITATION });

    const credenciais = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, convidado.userId));
    expect(credenciais).toHaveLength(0);
  });

  it("token inexistente é recusado com a mesma instrução", async () => {
    const result = await acceptInvitationAction({
      token: randomUUID(),
      password: PASSWORD,
    });
    expect(result).toEqual({ ok: false, error: INVALID_INVITATION });
  });

  // Edge Case da spec: convite aberto por alguém já autenticado com OUTRA
  // conta encerra a sessão corrente antes de ativar.
  it("convite aberto por outra conta autenticada encerra a sessão corrente antes de ativar", async () => {
    const tenantId = await createTenant("T23 Outra Sessão");
    const inviterId = await createAdmin(tenantId);

    // Alguém já logado, com conta e sessão próprias.
    const outroEmail = `t23-outro-${randomUUID()}@fixture.test`;
    const outro = await auth.api.signUpEmail({
      body: { email: outroEmail, password: PASSWORD, name: "Outra Conta" },
    });
    createdUserIds.push(outro.user.id);
    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email: outroEmail, password: PASSWORD },
      returnHeaders: true,
    });
    const cookie = signInHeaders.get("set-cookie") as string;
    mocks.requestHeaders = new Headers({ cookie });

    const antes = await auth.api.getSession({
      headers: new Headers({ cookie }),
    });
    expect(antes!.user.id).toBe(outro.user.id);

    const convidado = await createPendingInvitee(tenantId, inviterId);

    const result = await acceptInvitationAction({
      token: convidado.token,
      password: PASSWORD,
    });

    expect(result).toEqual({ ok: true, needsLogin: false });

    // A sessão da outra conta foi encerrada no servidor, não só no cliente.
    expect(
      await auth.api.getSession({ headers: new Headers({ cookie }) })
    ).toBeNull();

    // E o convidado foi ativado com sessão própria.
    const sessoes = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, convidado.userId));
    expect(sessoes.length).toBeGreaterThan(0);
  });

  // Usuário que JÁ tem senha (convidado para uma segunda imobiliária): o
  // vínculo já vale, e o convite não vira redefinição de senha disfarçada.
  it("convidado que já tem senha não tem a senha trocada; o convite só é marcado como usado", async () => {
    const tenantId = await createTenant("T23 Segunda Imobiliária");
    const inviterId = await createAdmin(tenantId);

    const email = `t23-existente-${randomUUID()}@fixture.test`;
    const existente = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Corretor de Duas Casas" },
    });
    createdUserIds.push(existente.user.id);
    await db.insert(tenant_members).values({
      organizationId: tenantId,
      userId: existente.user.id,
      role: "corretor",
    });
    const invitation = await createInvitation({
      tenantId,
      email,
      roles: ["corretor"],
      inviterId,
    });

    const result = await acceptInvitationAction({
      token: invitation.id,
      password: "senha-nova-que-nao-deve-valer",
    });

    expect(result).toEqual({ ok: true, needsLogin: true });
    expect((await getInvitation(invitation.id))!.status).toBe("accepted");

    // A senha antiga continua sendo a senha dele.
    const login = await auth.api.signInEmail({ body: { email, password: PASSWORD } });
    expect(login.user.id).toBe(existente.user.id);
  });

  it("senha curta é recusada e nenhuma credencial é criada", async () => {
    const tenantId = await createTenant("T23 Senha Curta");
    const inviterId = await createAdmin(tenantId);
    const convidado = await createPendingInvitee(tenantId, inviterId);

    const result = await acceptInvitationAction({
      token: convidado.token,
      password: "curta",
    });

    expect(result).toEqual({
      ok: false,
      error: "A senha precisa ter ao menos 8 caracteres.",
    });

    const credenciais = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, convidado.userId));
    expect(credenciais).toHaveLength(0);
    expect((await getInvitation(convidado.token))!.status).toBe("pending");
  });
});
