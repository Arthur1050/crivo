import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  accounts,
  properties,
  sessions,
  tenant_invitations,
  tenant_members,
  tenants,
  users,
} from "../../db/schema";
import type { Action, Resource, Role } from "../../lib/permissions";
import type { AuthContext } from "../auth/session";

/**
 * Ações de convite e papéis (tasks.md — T20; spec.md USER-01).
 *
 * Harness igual ao de `actions.test.ts`: a guarda de sessão é mockada de forma
 * PARCIAL — só a identidade é fabricada (`verifySession`); a decisão de
 * permissão que roda é a real (`authorizeOrThrow`, matriz de
 * `src/lib/permissions.ts` e log estruturado). `resolveAuthContext` vem do
 * módulo de verdade, e é com ela que a AC8 é provada sobre uma sessão real.
 *
 * O adaptador de e-mail é mockado: nenhum e-mail sai da suíte, e o caminho de
 * falha do provedor (AC4) é controlável.
 */

const mocks = vi.hoisted(() => ({
  sendInvitationEmail: vi.fn(),
  sendResetPasswordEmail: vi.fn(),
}));

vi.mock("../auth/email", () => ({
  sendInvitationEmail: mocks.sendInvitationEmail,
  sendResetPasswordEmail: mocks.sendResetPasswordEmail,
}));

/** Identidade e papéis do vínculo ativo da sessão fabricada. Trocáveis por teste. */
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

import { revalidatePath } from "next/cache";
import { auth } from "../auth/config";
import { resolveAuthContext } from "../auth/session";
import { getTenantMembers } from "../data";
import { deactivateMemberAction } from "../actions/deactivate";
import {
  deleteUserAction,
  inviteUserAction,
  resendInviteAction,
  updateMemberRolesAction,
} from "../actions/users";

const PASSWORD = "senha-de-teste-123";

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

async function createUser(name: string): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `${id}@fixture.test`;
  await db.insert(users).values({ id, name, email });
  createdUserIds.push(id);
  return { id, email };
}

async function link(
  tenantId: string,
  userId: string,
  roles: Role[]
): Promise<string> {
  const rows = await db
    .insert(tenant_members)
    .values({ organizationId: tenantId, userId, role: roles.join(",") })
    .returning({ id: tenant_members.id });
  return rows[0].id;
}

function newEmail(): string {
  return `t20-${randomUUID()}@fixture.test`;
}

async function invitationsFor(tenantId: string, email: string) {
  return db
    .select()
    .from(tenant_invitations)
    .where(
      and(
        eq(tenant_invitations.organizationId, tenantId),
        eq(tenant_invitations.email, email)
      )
    );
}

/** Último e-mail de convite disparado, já como payload do adaptador. */
function lastInvitationEmail() {
  const call = mocks.sendInvitationEmail.mock.calls.at(-1);
  expect(call, "esperava um envio de convite").toBeDefined();
  return call![0] as { to: string; name: string; tenantName: string; url: string };
}

describe("server/actions/users — convite e papéis (lote-8, USER-01)", () => {
  let tenantId: string;
  let outroTenantId: string;
  let adminUserId: string;
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeAll(async () => {
    tenantId = await createTenant("Imobiliária T20");
    outroTenantId = await createTenant("Imobiliária T20 Vizinha");

    const admin = await createUser("Administrador T20");
    adminUserId = admin.id;
    await link(tenantId, adminUserId, ["administrador"]);

    sessionTenantId = tenantId;
    sessionUser = {
      id: adminUserId,
      name: "Administrador T20",
      email: admin.email,
    };
  });

  beforeEach(() => {
    sessionRoles = ["administrador"];
    mocks.sendInvitationEmail.mockReset();
    mocks.sendInvitationEmail.mockResolvedValue({ ok: true, id: "email_t20" });
    warn.mockClear();
  });

  afterEach(() => {
    sessionRoles = ["administrador"];
  });

  afterAll(async () => {
    warn.mockRestore();
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

  // AC1: convite cria usuário em convite pendente e dispara o e-mail.
  it("convida um e-mail novo: usuário sem credencial, vínculo com os papéis e e-mail disparado com o link", async () => {
    const email = newEmail();

    const result = await inviteUserAction({
      name: "Convidado Novo",
      email,
      roles: ["corretor"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailSent).toBe(true);

    const [created] = await db.select().from(users).where(eq(users.email, email));
    expect(created).toBeDefined();
    createdUserIds.push(created.id);

    // "Convite pendente" é exatamente isto: nenhuma credencial de senha.
    const credentials = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, created.id));
    expect(credentials).toHaveLength(0);

    const member = (await getTenantMembers(tenantId)).find(
      (m) => m.email === email
    );
    expect(member).toBeDefined();
    expect(member!.roles).toEqual(["corretor"]);
    expect(member!.inviteState).toBe("pendente");

    const invitations = await invitationsFor(tenantId, email);
    expect(invitations).toHaveLength(1);
    expect(invitations[0].status).toBe("pending");
    expect(invitations[0].expiresAt.getTime()).toBeGreaterThan(Date.now());

    const sent = lastInvitationEmail();
    expect(sent.to).toBe(email);
    expect(sent.url).toContain(invitations[0].id);
    expect(sent.tenantName).toBe("Imobiliária T20");
  });

  // AC2: e-mail já conhecido ganha VÍNCULO novo, nunca um segundo usuário.
  it("e-mail que já é usuário em outra imobiliária ganha vínculo novo, sem duplicar o usuário", async () => {
    const existente = await createUser("Corretor de Duas Casas");
    await link(outroTenantId, existente.id, ["corretor"]);

    const result = await inviteUserAction({
      name: "Nome Ignorado",
      email: existente.email,
      roles: ["gestor"],
    });

    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, existente.email));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(existente.id);

    const memberships = await db
      .select()
      .from(tenant_members)
      .where(eq(tenant_members.userId, existente.id));
    expect(memberships).toHaveLength(2);
    expect(
      memberships.find((m) => m.organizationId === tenantId)!.role
    ).toBe("gestor");
    // O vínculo da outra imobiliária fica intacto.
    expect(
      memberships.find((m) => m.organizationId === outroTenantId)!.role
    ).toBe("corretor");
  });

  // AC3: já pertence a ESTA imobiliária — recusa com mensagem própria.
  it("e-mail que já pertence à imobiliária ativa é recusado sem criar segundo vínculo", async () => {
    const jaMembro = await createUser("Já é Membro");
    await link(tenantId, jaMembro.id, ["corretor"]);

    const result = await inviteUserAction({
      name: "Tentativa Repetida",
      email: jaMembro.email,
      roles: ["gestor"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Este e-mail já pertence a esta imobiliária.");

    const memberships = await db
      .select()
      .from(tenant_members)
      .where(eq(tenant_members.userId, jaMembro.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("corretor");
    expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
  });

  // AC4: falha de envio NÃO desfaz a criação e oferece reenviar.
  it("falha do provedor de e-mail mantém o usuário criado e devolve aviso de reenvio", async () => {
    mocks.sendInvitationEmail.mockResolvedValue({
      ok: false,
      error: "Domínio não verificado",
    });
    const email = newEmail();

    const result = await inviteUserAction({
      name: "Convidado Sem E-mail",
      email,
      roles: ["corretor"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailSent).toBe(false);
    expect(result.warning).toContain("Reenviar convite");

    const [created] = await db.select().from(users).where(eq(users.email, email));
    expect(created).toBeDefined();
    createdUserIds.push(created.id);

    const member = (await getTenantMembers(tenantId)).find(
      (m) => m.email === email
    );
    expect(member).toBeDefined();
    expect(member!.inviteState).toBe("pendente");
  });

  // AC5: reenviar emite token novo e invalida o anterior.
  it("reenviar o convite emite token novo e invalida o token anterior", async () => {
    const email = newEmail();
    await inviteUserAction({
      name: "Convidado Reenvio",
      email,
      roles: ["corretor"],
    });

    const [primeiro] = await invitationsFor(tenantId, email);
    const [created] = await db.select().from(users).where(eq(users.email, email));
    createdUserIds.push(created.id);

    const member = (await getTenantMembers(tenantId)).find(
      (m) => m.email === email
    )!;

    const result = await resendInviteAction({ memberId: member.memberId });
    expect(result.ok).toBe(true);

    const todos = await invitationsFor(tenantId, email);
    expect(todos).toHaveLength(2);

    const antigo = todos.find((i) => i.id === primeiro.id)!;
    const novo = todos.find((i) => i.id !== primeiro.id)!;

    expect(antigo.status).toBe("cancelado");
    expect(novo.status).toBe("pending");
    expect(lastInvitationEmail().url).toContain(novo.id);
  });

  // AC8: papel novo vale na requisição seguinte, sem sair e entrar de novo.
  it("alterar papéis vale na próxima requisição da MESMA sessão, sem relogin", async () => {
    const email = newEmail();
    const created = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Corretor Promovido" },
    });
    createdUserIds.push(created.user.id);
    const memberId = await link(tenantId, created.user.id, ["corretor"]);

    const { headers } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    const sessionHeaders = new Headers({
      cookie: headers.get("set-cookie") as string,
    });

    // Quem já tem senha aparece como convite aceito, não como pendente — é a
    // outra metade do estado que a lista de usuários exibe (USER-01 AC1/AC6).
    const comSenha = (await getTenantMembers(tenantId)).find(
      (m) => m.email === email
    );
    expect(comSenha!.inviteState).toBe("ativo");

    const antes = await resolveAuthContext(sessionHeaders);
    expect(antes.ok).toBe(true);
    if (!antes.ok) return;
    expect(antes.context.roles).toEqual(["corretor"]);

    const result = await updateMemberRolesAction({
      memberId,
      roles: ["corretor", "gestor"],
    });
    expect(result).toEqual({ ok: true });

    // MESMO cookie, nenhum login novo: a próxima requisição já enxerga o papel.
    const depois = await resolveAuthContext(sessionHeaders);
    expect(depois.ok).toBe(true);
    if (!depois.ok) return;
    expect(depois.context.roles).toEqual(["corretor", "gestor"]);
  });

  // AC9: a imobiliária não pode ficar sem administrador ativo.
  it("rebaixar o último administrador ativo é recusado e nada é gravado", async () => {
    const soloTenantId = await createTenant("Imobiliária de Um Administrador");
    const solo = await createUser("Único Administrador");
    const memberId = await link(soloTenantId, solo.id, ["administrador"]);

    const tenantAnterior = sessionTenantId;
    sessionTenantId = soloTenantId;

    const result = await updateMemberRolesAction({
      memberId,
      roles: ["gestor"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(
      "A imobiliária precisa de ao menos um administrador ativo."
    );

    const [row] = await db
      .select()
      .from(tenant_members)
      .where(eq(tenant_members.id, memberId));
    expect(row.role).toBe("administrador");

    sessionTenantId = tenantAnterior;
  });

  it("rebaixar um administrador quando existe outro ativo é permitido", async () => {
    const duplaTenantId = await createTenant("Imobiliária de Dois Administradores");
    const primeiro = await createUser("Administrador Um");
    const segundo = await createUser("Administrador Dois");
    const memberId = await link(duplaTenantId, primeiro.id, ["administrador"]);
    await link(duplaTenantId, segundo.id, ["administrador"]);

    const tenantAnterior = sessionTenantId;
    sessionTenantId = duplaTenantId;

    const result = await updateMemberRolesAction({
      memberId,
      roles: ["gestor"],
    });

    expect(result).toEqual({ ok: true });

    const [row] = await db
      .select()
      .from(tenant_members)
      .where(eq(tenant_members.id, memberId));
    expect(row.role).toBe("gestor");

    sessionTenantId = tenantAnterior;
  });

  // Recusa por permissão: gestão de usuários é exclusiva do administrador.
  describe("recusa para quem não é administrador (PERM-01 AC2/AC5)", () => {
    it("gestor não convida, não reenvia e não altera papéis — e nada é gravado", async () => {
      const alvo = await createUser("Alvo do Gestor");
      const memberId = await link(tenantId, alvo.id, ["corretor"]);
      const email = newEmail();
      sessionRoles = ["gestor"];

      const convite = await inviteUserAction({
        name: "Não Deve Nascer",
        email,
        roles: ["corretor"],
      });
      expect(convite.ok).toBe(false);
      if (!convite.ok) {
        expect(convite.error).toBe("Sem permissão para escrever usuarios.");
      }

      const reenvio = await resendInviteAction({ memberId });
      expect(reenvio.ok).toBe(false);
      if (!reenvio.ok) {
        expect(reenvio.error).toBe("Sem permissão para escrever usuarios.");
      }

      const papeis = await updateMemberRolesAction({
        memberId,
        roles: ["gestor"],
      });
      expect(papeis).toEqual({
        ok: false,
        error: "Sem permissão para escrever usuarios.",
      });

      // Nenhuma escrita: nem usuário, nem convite, nem papel alterado.
      expect(await db.select().from(users).where(eq(users.email, email))).toEqual(
        []
      );
      expect(await invitationsFor(tenantId, alvo.email)).toEqual([]);
      const [row] = await db
        .select()
        .from(tenant_members)
        .where(eq(tenant_members.id, memberId));
      expect(row.role).toBe("corretor");
      expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
    });

    it("corretor também é recusado ao convidar", async () => {
      const email = newEmail();
      sessionRoles = ["corretor"];

      const result = await inviteUserAction({
        name: "Não Deve Nascer",
        email,
        roles: ["corretor"],
      });

      expect(result).toEqual({
        ok: false,
        error: "Sem permissão para escrever usuarios.",
      });
      expect(await db.select().from(users).where(eq(users.email, email))).toEqual(
        []
      );
    });
  });

  describe("entrada inválida", () => {
    it("e-mail malformado é recusado e nada é criado", async () => {
      const result = await inviteUserAction({
        name: "Convidado",
        email: "sem-arroba",
        roles: ["corretor"],
      });

      expect(result).toEqual({ ok: false, error: "E-mail inválido." });
      expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
    });

    it("convite sem nenhum papel é recusado", async () => {
      const result = await inviteUserAction({
        name: "Convidado",
        email: newEmail(),
        roles: [],
      });

      expect(result).toEqual({ ok: false, error: "Escolha ao menos um papel." });
      expect(mocks.sendInvitationEmail).not.toHaveBeenCalled();
    });
  });

  // lote-11 — T9: a FK `properties.captured_by_user_id` (restrict, sem
  // `onDelete`) rejeita excluir um usuário que ainda captura imóvel; esta
  // action traduz a violação numa recusa legível em vez do erro cru do
  // Postgres. `tenant_members` referencia `users.id` com `onDelete: cascade`
  // (schema.ts), então o happy path também prova que o vínculo desaparece
  // junto — nenhum delete explícito de `tenant_members` é necessário.
  describe("deleteUserAction (lote-11 — T9)", () => {
    async function createCapturedProperty(capturedByUserId: string): Promise<string> {
      const propertyId = randomUUID();
      await db.insert(properties).values({
        id: propertyId,
        tenantId,
        capturedByUserId,
        sequence: Date.now() % 1_000_000,
        reference: `T9-${propertyId.slice(0, 8)}`,
        kind: "casa",
        modality: "novo",
        neighborhood: "Centro",
        neighborhoodNormalized: "centro",
        city: "Uberaba",
        cityNormalized: "uberaba",
        state: "MG",
        priceCents: 100_000_00n,
        areaSqm: 80,
        bedrooms: 2,
        bathrooms: 1,
        parkingSpots: 1,
      });
      return propertyId;
    }

    it("exclui um usuário sem imóvel, removendo também o vínculo (happy path)", async () => {
      const user = await createUser("Usuário Sem Imóvel T9");
      const memberId = await link(tenantId, user.id, ["corretor"]);

      const result = await deleteUserAction({ memberId });
      expect(result).toEqual({ ok: true });

      const remainingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(remainingUser).toHaveLength(0);

      const remainingMember = await db
        .select()
        .from(tenant_members)
        .where(eq(tenant_members.id, memberId));
      expect(remainingMember).toHaveLength(0);

      expect(revalidatePath).toHaveBeenCalledWith("/usuarios");
    });

    it("recusa a exclusão de um usuário que ainda captura imóvel, dizendo quantos ele capta", async () => {
      const user = await createUser("Captador T9");
      const memberId = await link(tenantId, user.id, ["corretor"]);
      const propertyId = await createCapturedProperty(user.id);

      const result = await deleteUserAction({ memberId });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("1 imóvel");

      const remainingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(remainingUser).toHaveLength(1);

      await db.delete(properties).where(eq(properties.id, propertyId));
    });

    it("excluir usuário sem vínculo (memberId inexistente) retorna { ok: false } (not-found)", async () => {
      const result = await deleteUserAction({ memberId: randomUUID() });
      expect(result.ok).toBe(false);
    });

    it("desativar continua funcionando para um usuário que ainda captura imóvel (USER-02 não regride)", async () => {
      const user = await createUser("Captador Desativa T9");
      const memberId = await link(tenantId, user.id, ["corretor"]);
      const propertyId = await createCapturedProperty(user.id);

      const result = await deactivateMemberAction({ memberId });
      expect(result.ok).toBe(true);

      const [member] = await db
        .select()
        .from(tenant_members)
        .where(eq(tenant_members.id, memberId));
      expect(member.deactivatedAt).not.toBeNull();

      await db.delete(properties).where(eq(properties.id, propertyId));
    });

    it("corretor é recusado ao tentar excluir usuário, e nada é removido", async () => {
      const user = await createUser("Usuário Recusa T9");
      const memberId = await link(tenantId, user.id, ["corretor"]);
      sessionRoles = ["corretor"];

      const result = await deleteUserAction({ memberId });
      expect(result).toEqual({
        ok: false,
        error: "Sem permissão para escrever usuarios.",
      });

      const remainingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, user.id));
      expect(remainingUser).toHaveLength(1);
    });
  });
});
